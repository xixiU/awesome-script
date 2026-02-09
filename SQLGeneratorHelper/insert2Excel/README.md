# INSERT 语句转 Excel 工具

将 SQL INSERT 语句批量转换为 Excel 文件。

## 快速开始

### 安装依赖
```bash
pip install -r requirements.txt
```

### 快速测试
```bash
# 测试单文件转换
python insert_to_excel.py example.sql

# 测试批量转换
python insert_to_excel.py test_files
```

### 使用方法

#### 转换单个文件
```bash
# 基本用法（生成同名 .xlsx 文件）
python insert_to_excel.py input.sql

# 指定输出文件
python insert_to_excel.py input.sql -o output.xlsx
```

#### 批量转换目录
```bash
# 递归转换目录及子目录下所有 SQL 文件
python insert_to_excel.py /path/to/sql/folder

# 指定输出目录
python insert_to_excel.py /path/to/sql/folder -o /path/to/output

# 仅转换当前目录（不递归子目录）
python insert_to_excel.py /path/to/sql/folder --no-recursive
```

## 支持的格式

### 标准单行 INSERT
```sql
INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@example.com');
```

### 标准多行 INSERT
```sql
INSERT INTO users (id, name, email) VALUES 
(1, 'Alice', 'alice@example.com'),
(2, 'Bob', 'bob@example.com'),
(3, 'Charlie', 'charlie@example.com');
```

### Oracle 格式（带库名）
```sql
-- 标准列名
INSERT INTO "SCHEMA"."TABLE" (col1, col2) VALUES ('val1', 'val2');

-- 带引号的列名
INSERT INTO "SCHEMA"."TABLE" ("COL1", "COL2") VALUES ('val1', 'val2');
```

## 特性

- ✅ 自动识别表名和列名
- ✅ 支持标准 SQL 和 Oracle 格式（`"库名"."表名"`）
- ✅ 支持带引号的列名（`"COL1", "COL2"`）
- ✅ 支持多个表的 INSERT 语句（每个表生成一个工作表）
- ✅ 批量转换目录下所有 SQL 文件（支持递归子目录）
- ✅ 处理引号内的逗号和特殊字符
- ✅ 输出格式化的 Excel 文件

## 示例

### 单文件转换

假设有文件 `data.sql`:
```sql
INSERT INTO products (id, name, price) VALUES (1, 'Phone', 999);
INSERT INTO products (id, name, price) VALUES (2, 'Laptop', 1999);
INSERT INTO "TS_FZ_CBB"."IFC_SUP_PQXX" (id, name) VALUES (1, '供应商A');
```

运行命令:
```bash
python insert_to_excel.py data.sql
```

将生成 `data.xlsx`，包含：
- `products` 工作表（2 行数据）
- `TS_FZ_CBB_IFC_SUP_PQXX` 工作表（1 行数据）

### 批量转换目录

假设有目录结构：
```
sql_files/
├── users.sql
├── products.sql
└── backup/
    └── orders.sql
```

运行命令:
```bash
python insert_to_excel.py sql_files
```

将生成：
```
sql_files/
├── users.sql
├── users.xlsx          ← 新生成
├── products.sql
├── products.xlsx       ← 新生成
└── backup/
    ├── orders.sql
    └── orders.xlsx     ← 新生成
```

## 注意事项

- Oracle 格式的 `"库名"."表名"` 在 Excel 中会转换为 `库名_表名` 格式的工作表名
- Excel 工作表名最多 31 个字符，超长表名会被截断
- 批量转换时，默认递归处理所有子目录，可使用 `--no-recursive` 禁用

## 故障排除

### 错误: "At least one sheet must be visible"

这个错误表示 SQL 解析失败，没有提取到有效数据。按以下步骤排查：

#### 步骤 1: 运行测试脚本诊断问题

```bash
# 测试示例文件
python test_parse.py example.sql

# 测试带引号的列名
python test_parse.py test_quoted.sql

# 测试你自己的文件
python test_parse.py your_file.sql
```

测试脚本会显示：
- 找到多少个 INSERT 语句
- 解析出多少个表
- 每个表的列名和数据行数
- 具体的错误信息（如果有）

#### 步骤 2: 检查 SQL 格式

**必需的格式要求：**
```sql
INSERT INTO table_name (col1, col2) VALUES (val1, val2);
```

**常见格式错误：**
- ❌ 缺少列名: `INSERT INTO table VALUES (val1, val2);`
- ❌ 缺少分号: `INSERT INTO table (col1) VALUES (val1)`
- ❌ 语句不完整: `INSERT INTO table (col1) VALUES`

**正确示例：**
```sql
-- 单行格式 ✓
INSERT INTO users (id, name) VALUES (1, 'Alice');

-- 多行格式 ✓
INSERT INTO users (id, name) VALUES 
(1, 'Alice'),
(2, 'Bob');

-- Oracle 格式 ✓
INSERT INTO "SCHEMA"."TABLE" (id, name) VALUES (1, 'Test');
```

#### 步骤 3: 使用简单测试文件验证

```bash
# 测试最简单的 SQL
python insert_to_excel.py test_simple.sql
```

如果简单文件可以转换，说明你的 SQL 文件格式有问题。

#### 步骤 4: 检查文件编码

```bash
# Windows (PowerShell)
Get-Content your_file.sql | Select-Object -First 5

# 确保文件是 UTF-8 编码
# 在编辑器中另存为，选择 UTF-8 编码
```

### 其他常见问题

**Q: 中文显示乱码**
- 确保 SQL 文件使用 UTF-8 编码保存
- 在 Notepad++ 或 VS Code 中选择 "UTF-8" 或 "UTF-8 with BOM"

**Q: 某些 INSERT 语句被忽略**
- 检查语句是否以分号 `;` 结尾
- 检查 VALUES 后的值是否完整

**Q: 值解析错误**
- 检查值中的引号是否正确闭合
- 使用单引号包裹字符串: `'value'`
- 引号内的引号需要转义: `'O''Reilly'` 或 `'O\'Reilly'`

**Q: 表名显示异常**
- Excel 工作表名最多 31 个字符
- 点号会被替换为下划线: `schema.table` → `schema_table`

## 更多信息

查看 [详细使用说明](USAGE.md) 了解更多功能和使用场景。
