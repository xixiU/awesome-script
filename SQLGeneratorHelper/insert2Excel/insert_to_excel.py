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
    
    # 首先使用简单模式找到 INSERT 语句的起始位置
    insert_starts = []
    for match in re.finditer(r'INSERT\s+INTO\s+', sql_content, re.IGNORECASE):
        insert_starts.append(match.start())
    
    # 处理每个 INSERT 语句
    for i, start_pos in enumerate(insert_starts):
        # 确定结束位置（到下一个 INSERT 或文件末尾）
        if i + 1 < len(insert_starts):
            end_pos = insert_starts[i + 1]
        else:
            end_pos = len(sql_content)
        
        statement = sql_content[start_pos:end_pos].strip()
        
        # 解析单个 INSERT 语句
        result = parse_single_insert(statement)
        if result:
            table_name, columns, rows = result
            
            # 存储数据
            if table_name not in tables_data:
                tables_data[table_name] = {'columns': columns, 'rows': []}
            
            for row in rows:
                # 避免重复添加
                if row not in tables_data[table_name]['rows']:
                    tables_data[table_name]['rows'].append(row)
    
    return tables_data


def parse_single_insert(statement):
    """
    解析单个 INSERT 语句
    
    参数:
        statement: 单个 INSERT 语句字符串
    
    返回:
        tuple: (table_name, columns, rows) 或 None
    """
    # 匹配表名
    table_pattern = re.compile(
        r'INSERT\s+INTO\s+(?:"?(\w+)"?\."?(\w+)"?|`?(\w+)`?)\s*\(',
        re.IGNORECASE
    )
    
    table_match = table_pattern.search(statement)
    if not table_match:
        return None
    
    # 解析表名
    if table_match.group(1) and table_match.group(2):
        # Oracle 格式: "schema"."table"
        schema_name = table_match.group(1).strip()
        table_name = table_match.group(2).strip()
        full_table_name = f"{schema_name}.{table_name}"
    else:
        # 普通格式: table
        full_table_name = table_match.group(3).strip()
    
    # 找到列名部分的括号
    columns_start = statement.find('(', table_match.end() - 1)
    if columns_start == -1:
        return None
    
    # 使用括号匹配找到列名部分的结束位置
    columns_end = find_matching_bracket(statement, columns_start)
    if columns_end == -1:
        return None
    
    columns_str = statement[columns_start + 1:columns_end]
    
    # 解析列名（处理带引号的列名）
    columns = parse_column_names(columns_str)
    
    # 找到 VALUES 关键字
    values_match = re.search(r'\bVALUES\s*', statement[columns_end:], re.IGNORECASE)
    if not values_match:
        return None
    
    values_start = columns_end + values_match.end()
    
    # 提取 VALUES 后的内容（到分号或语句结尾）
    values_part = statement[values_start:].strip()
    if values_part.endswith(';'):
        values_part = values_part[:-1].strip()
    
    # 提取所有值行
    value_rows = extract_value_rows(values_part)
    
    # 解析每一行的值
    parsed_rows = []
    for value_row in value_rows:
        values = parse_values(value_row)
        if values:
            parsed_rows.append(values)
    
    return (full_table_name, columns, parsed_rows)


def find_matching_bracket(text, start_pos):
    """
    找到匹配的右括号位置
    
    参数:
        text: 文本字符串
        start_pos: 左括号的位置
    
    返回:
        int: 匹配的右括号位置，如果没找到返回 -1
    """
    depth = 0
    in_quotes = False
    quote_char = None
    
    for i in range(start_pos, len(text)):
        char = text[i]
        
        # 处理引号
        if char in ('"', "'") and (i == 0 or text[i-1] != '\\'):
            if not in_quotes:
                in_quotes = True
                quote_char = char
            elif char == quote_char:
                in_quotes = False
                quote_char = None
        
        # 只在非引号内处理括号
        if not in_quotes:
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
                if depth == 0:
                    return i
    
    return -1


def parse_column_names(columns_str):
    """
    解析列名字符串，处理带引号的列名
    
    参数:
        columns_str: 列名字符串，如: "ID", "NAME", "AGE"
    
    返回:
        list: 列名列表
    """
    columns = []
    current_col = ''
    in_quotes = False
    quote_char = None
    
    for i, char in enumerate(columns_str):
        if char in ('"', "'", '`') and (i == 0 or columns_str[i-1] != '\\'):
            if not in_quotes:
                in_quotes = True
                quote_char = char
            elif char == quote_char:
                in_quotes = False
                quote_char = None
            # 不把引号加入列名
            continue
        elif char == ',' and not in_quotes:
            if current_col.strip():
                columns.append(current_col.strip())
            current_col = ''
        else:
            current_col += char
    
    # 添加最后一个列名
    if current_col.strip():
        columns.append(current_col.strip())
    
    return columns


def extract_value_rows(values_block):
    """
    从 VALUES 块中提取所有行数据
    支持: (row1), (row2), (row3) 或单个 (row1)
    
    参数:
        values_block: VALUES 后的内容块
    
    返回:
        list: 所有行的内容列表
    """
    rows = []
    depth = 0
    current_row = ''
    in_quotes = False
    quote_char = None
    
    i = 0
    while i < len(values_block):
        char = values_block[i]
        
        # 处理引号
        if char in ('"', "'") and (i == 0 or values_block[i-1] != '\\'):
            if not in_quotes:
                in_quotes = True
                quote_char = char
            elif char == quote_char:
                in_quotes = False
                quote_char = None
        
        # 处理括号
        if not in_quotes:
            if char == '(':
                depth += 1
                if depth == 1:
                    current_row = ''
                    i += 1
                    continue
            elif char == ')':
                depth -= 1
                if depth == 0:
                    if current_row.strip():
                        rows.append(current_row.strip())
                    current_row = ''
                    i += 1
                    continue
        
        if depth > 0:
            current_row += char
        
        i += 1
    
    return rows


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
    if not tables_data:
        raise ValueError("没有数据可以转换为 Excel")
    
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        for table_name, data in tables_data.items():
            columns = data['columns']
            rows = data['rows']
            
            if not rows:
                if verbose:
                    print(f"    - 表 '{table_name}' 没有数据，跳过")
                continue
            
            # 创建 DataFrame
            df = pd.DataFrame(rows, columns=columns)
            
            # 写入 Excel
            # Excel 工作表名最多 31 个字符，将点号替换为下划线
            sheet_name = table_name.replace('.', '_')[:31]
            
            # 确保工作表名不为空
            if not sheet_name:
                sheet_name = 'Sheet1'
            
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
