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


def convert_to_excel(tables_data, output_path):
    """
    将解析的数据转换为 Excel 文件
    
    参数:
        tables_data: 表数据字典
        output_path: 输出文件路径
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
            
            print(f"已导出表 '{table_name}' 到工作表 '{sheet_name}'，共 {len(rows)} 行数据")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='将 INSERT 语句转换为 Excel 文件',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例用法:
  python insert_to_excel.py input.sql
  python insert_to_excel.py input.sql -o output.xlsx
        '''
    )
    
    parser.add_argument(
        'input_file',
        help='输入的 SQL 文件路径'
    )
    
    parser.add_argument(
        '-o', '--output',
        help='输出的 Excel 文件路径（默认: 与输入文件同名的 .xlsx 文件）'
    )
    
    args = parser.parse_args()
    
    # 读取 SQL 文件
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"错误: 文件 '{args.input_file}' 不存在")
        return
    
    # 确定输出路径
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_suffix('.xlsx')
    
    # 读取 SQL 内容
    print(f"正在读取 SQL 文件: {input_path}")
    with open(input_path, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    # 解析 INSERT 语句
    print("正在解析 INSERT 语句...")
    tables_data = parse_insert_statement(sql_content)
    
    if not tables_data:
        print("警告: 未找到有效的 INSERT 语句")
        return
    
    print(f"发现 {len(tables_data)} 个表的数据")
    
    # 转换为 Excel
    print(f"正在生成 Excel 文件: {output_path}")
    convert_to_excel(tables_data, output_path)
    
    print(f"\n转换完成! 输出文件: {output_path}")


if __name__ == '__main__':
    main()
