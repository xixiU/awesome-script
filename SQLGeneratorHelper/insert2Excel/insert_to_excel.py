#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 INSERT 语句转换为 Excel 文件
支持标准 INSERT INTO 语句格式
"""

import re
import argparse
from pathlib import Path
import pandas as pd


def parse_insert_statement(sql_content):
    """
    解析 INSERT 语句，提取表名、列名和数据
    
    参数:
        sql_content: SQL 语句内容
    
    返回:
        dict: 包含表名和数据的字典 {table_name: [(columns, values), ...]}
    """
    tables_data = {}
    
    # 正则表达式匹配 INSERT 语句
    # 支持格式: 
    # - INSERT INTO table (col1, col2) VALUES (val1, val2)
    # - INSERT INTO "schema"."table" (col1, col2) VALUES (val1, val2)
    # - INSERT INTO schema.table (col1, col2) VALUES (val1, val2)
    insert_pattern = re.compile(
        r'INSERT\s+INTO\s+(?:"?(\w+)"?\."?(\w+)"?|`?(\w+)`?)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)',
        re.IGNORECASE | re.DOTALL
    )
    
    # 查找所有 INSERT 语句
    matches = insert_pattern.finditer(sql_content)
    
    for match in matches:
        # 解析表名：支持 schema.table 或 单独的 table
        if match.group(1) and match.group(2):
            # Oracle 格式: "schema"."table"
            schema_name = match.group(1).strip()
            table_name = match.group(2).strip()
            full_table_name = f"{schema_name}.{table_name}"
            columns_str = match.group(4).strip()
            values_str = match.group(5).strip()
        else:
            # 普通格式: table
            full_table_name = match.group(3).strip()
            columns_str = match.group(4).strip()
            values_str = match.group(5).strip()
        
        # 解析列名
        columns = [col.strip().strip('`"\'') for col in columns_str.split(',')]
        
        # 解析值
        values = parse_values(values_str)
        
        # 存储数据
        if full_table_name not in tables_data:
            tables_data[full_table_name] = {'columns': columns, 'rows': []}
        
        tables_data[full_table_name]['rows'].append(values)
    
    # 处理多行 VALUES 格式: VALUES (row1), (row2), (row3)
    multi_value_pattern = re.compile(
        r'INSERT\s+INTO\s+(?:"?(\w+)"?\."?(\w+)"?|`?(\w+)`?)\s*\((.*?)\)\s*VALUES\s*((?:\([^)]+\)\s*,?\s*)+)',
        re.IGNORECASE | re.DOTALL
    )
    
    for match in multi_value_pattern.finditer(sql_content):
        # 解析表名
        if match.group(1) and match.group(2):
            # Oracle 格式: "schema"."table"
            schema_name = match.group(1).strip()
            table_name = match.group(2).strip()
            full_table_name = f"{schema_name}.{table_name}"
            columns_str = match.group(4).strip()
            values_block = match.group(5).strip()
        else:
            # 普通格式: table
            full_table_name = match.group(3).strip()
            columns_str = match.group(4).strip()
            values_block = match.group(5).strip()
        
        columns = [col.strip().strip('`"\'') for col in columns_str.split(',')]
        
        # 提取所有值组
        value_groups = re.findall(r'\(([^)]+)\)', values_block)
        
        if full_table_name not in tables_data:
            tables_data[full_table_name] = {'columns': columns, 'rows': []}
        
        for value_group in value_groups:
            values = parse_values(value_group)
            if values not in tables_data[full_table_name]['rows']:
                tables_data[full_table_name]['rows'].append(values)
    
    return tables_data


def parse_values(values_str):
    """
    解析值字符串，处理引号和逗号
    
    参数:
        values_str: 值字符串
    
    返回:
        list: 解析后的值列表
    """
    values = []
    current_value = ''
    in_quotes = False
    quote_char = None
    
    for i, char in enumerate(values_str):
        if char in ('"', "'") and (i == 0 or values_str[i-1] != '\\'):
            if not in_quotes:
                in_quotes = True
                quote_char = char
            elif char == quote_char:
                in_quotes = False
                quote_char = None
            else:
                current_value += char
        elif char == ',' and not in_quotes:
            values.append(current_value.strip().strip('"\''))
            current_value = ''
        else:
            current_value += char
    
    if current_value:
        values.append(current_value.strip().strip('"\''))
    
    return values


def convert_to_excel(tables_data, output_path, verbose=True):
    """
    将解析的数据转换为 Excel 文件
    
    参数:
        tables_data: 表数据字典
        output_path: 输出文件路径
        verbose: 是否显示详细信息
    """
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        for table_name, data in tables_data.items():
            columns = data['columns']
            rows = data['rows']
            
            # 创建 DataFrame
            df = pd.DataFrame(rows, columns=columns)
            
            # 写入 Excel
            # Excel 工作表名最多 31 个字符，将点号替换为下划线
            sheet_name = table_name.replace('.', '_')[:31]
            df.to_excel(writer, sheet_name=sheet_name, index=False)
            
            if verbose:
                print(f"    - 表 '{table_name}' → 工作表 '{sheet_name}' ({len(rows)} 行)")


def process_single_file(sql_file, output_path=None, verbose=True):
    """
    处理单个 SQL 文件
    
    参数:
        sql_file: SQL 文件路径
        output_path: 输出 Excel 文件路径（可选）
        verbose: 是否显示详细信息
    
    返回:
        bool: 是否成功处理
    """
    sql_file = Path(sql_file)
    
    if not sql_file.exists():
        print(f"错误: 文件 '{sql_file}' 不存在")
        return False
    
    # 确定输出路径
    if output_path:
        output_path = Path(output_path)
    else:
        output_path = sql_file.with_suffix('.xlsx')
    
    try:
        # 读取 SQL 内容
        if verbose:
            print(f"\n处理: {sql_file.name}")
        
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # 解析 INSERT 语句
        tables_data = parse_insert_statement(sql_content)
        
        if not tables_data:
            if verbose:
                print(f"  ⚠ 未找到有效的 INSERT 语句，跳过")
            return False
        
        if verbose:
            print(f"  发现 {len(tables_data)} 个表:")
        
        # 转换为 Excel
        convert_to_excel(tables_data, output_path, verbose)
        
        if verbose:
            print(f"  ✓ 已生成: {output_path.name}")
        
        return True
        
    except Exception as e:
        print(f"  ✗ 处理失败: {e}")
        return False


def process_directory(directory, output_dir=None, recursive=True):
    """
    批量处理目录下的所有 SQL 文件
    
    参数:
        directory: 输入目录路径
        output_dir: 输出目录（可选，默认与输入文件同目录）
        recursive: 是否递归处理子目录
    
    返回:
        tuple: (成功数量, 失败数量)
    """
    directory = Path(directory)
    
    if not directory.exists():
        print(f"错误: 目录 '{directory}' 不存在")
        return 0, 0
    
    if not directory.is_dir():
        print(f"错误: '{directory}' 不是一个目录")
        return 0, 0
    
    # 查找所有 SQL 文件
    if recursive:
        sql_files = list(directory.rglob('*.sql'))
    else:
        sql_files = list(directory.glob('*.sql'))
    
    if not sql_files:
        print(f"在目录 '{directory}' 中未找到 SQL 文件")
        return 0, 0
    
    print(f"\n找到 {len(sql_files)} 个 SQL 文件")
    print("=" * 60)
    
    success_count = 0
    fail_count = 0
    
    for sql_file in sql_files:
        # 确定输出路径
        if output_dir:
            output_dir_path = Path(output_dir)
            output_dir_path.mkdir(parents=True, exist_ok=True)
            # 保持相对路径结构
            relative_path = sql_file.relative_to(directory)
            output_path = output_dir_path / relative_path.with_suffix('.xlsx')
            output_path.parent.mkdir(parents=True, exist_ok=True)
        else:
            output_path = None
        
        if process_single_file(sql_file, output_path):
            success_count += 1
        else:
            fail_count += 1
    
    return success_count, fail_count


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='将 INSERT 语句转换为 Excel 文件',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例用法:
  # 转换单个文件
  python insert_to_excel.py input.sql
  python insert_to_excel.py input.sql -o output.xlsx
  
  # 批量转换目录下所有 SQL 文件
  python insert_to_excel.py /path/to/sql/folder
  python insert_to_excel.py /path/to/sql/folder -o /path/to/output
  python insert_to_excel.py /path/to/sql/folder --no-recursive
        '''
    )
    
    parser.add_argument(
        'input_path',
        help='输入的 SQL 文件或目录路径'
    )
    
    parser.add_argument(
        '-o', '--output',
        help='输出的 Excel 文件路径或目录（单文件时为文件路径，目录时为输出目录）'
    )
    
    parser.add_argument(
        '--no-recursive',
        action='store_true',
        help='批量转换时不递归子目录（仅处理当前目录）'
    )
    
    args = parser.parse_args()
    
    input_path = Path(args.input_path)
    
    if not input_path.exists():
        print(f"错误: 路径 '{args.input_path}' 不存在")
        return
    
    # 判断是文件还是目录
    if input_path.is_file():
        # 单文件处理
        if not input_path.suffix.lower() == '.sql':
            print(f"警告: '{input_path}' 不是 SQL 文件，但仍会尝试处理")
        
        print("=" * 60)
        success = process_single_file(input_path, args.output, verbose=True)
        print("=" * 60)
        
        if success:
            print("\n✓ 转换完成!")
        else:
            print("\n✗ 转换失败")
        
    elif input_path.is_dir():
        # 批量处理目录
        recursive = not args.no_recursive
        success, fail = process_directory(input_path, args.output, recursive)
        
        print("\n" + "=" * 60)
        print(f"批量转换完成!")
        print(f"  成功: {success} 个文件")
        print(f"  失败/跳过: {fail} 个文件")
        print(f"  总计: {success + fail} 个文件")
    
    else:
        print(f"错误: '{input_path}' 不是有效的文件或目录")


if __name__ == '__main__':
    main()
