#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试解析功能的脚本
"""

import sys
import re
from insert_to_excel import parse_insert_statement
from pathlib import Path

def test_file(filename):
    """测试单个文件的解析"""
    sql_file = Path(filename)
    
    if not sql_file.exists():
        print(f"错误: 文件 '{sql_file}' 不存在")
        return False
    
    print("=" * 60)
    print(f"测试文件: {sql_file}")
    print("=" * 60)
    
    # 读取文件
    try:
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
    except Exception as e:
        print(f"✗ 读取文件失败: {e}")
        return False
    
    print(f"\n文件大小: {len(sql_content)} 字符")
    
    # 查找 INSERT 语句数量
    insert_count = len(re.findall(r'INSERT\s+INTO', sql_content, re.IGNORECASE))
    print(f"发现 {insert_count} 个 INSERT 语句\n")
    
    # 解析
    try:
        tables_data = parse_insert_statement(sql_content)
    except Exception as e:
        print(f"✗ 解析失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    if not tables_data:
        print("✗ 解析结果为空，未找到有效的 INSERT 语句")
        print("\n可能的原因:")
        print("  1. SQL 语句格式不符合要求")
        print("  2. 缺少必要的关键字 (INSERT INTO, VALUES)")
        print("  3. 语句没有以分号结尾")
        return False
    
    print(f"✓ 解析成功：找到 {len(tables_data)} 个表\n")
    
    # 显示详细信息
    for table_name, data in tables_data.items():
        print(f"━━ 表名: {table_name} ━━")
        print(f"   列名 ({len(data['columns'])}): {', '.join(data['columns'])}")
        print(f"   数据行数: {len(data['rows'])}")
        
        if data['rows']:
            print(f"   数据预览:")
            for i, row in enumerate(data['rows'][:2], 1):
                print(f"     行 {i}: {row}")
            if len(data['rows']) > 2:
                print(f"     ... 还有 {len(data['rows']) - 2} 行")
        else:
            print("   ⚠ 警告: 没有数据行!")
        print()
    
    print("=" * 60)
    print("✓ 测试完成!")
    print("=" * 60)
    return True

if __name__ == '__main__':
    # 如果提供了命令行参数，使用参数指定的文件
    if len(sys.argv) > 1:
        filename = sys.argv[1]
    else:
        filename = 'example.sql'
    
    success = test_file(filename)
    sys.exit(0 if success else 1)
