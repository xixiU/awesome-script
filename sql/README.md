# INSERT 语句转 Excel 工具

将 SQL INSERT 语句批量转换为 Excel 文件。

## 快速开始

### 安装依赖
```bash
pip install -r requirements.txt
```

### 使用方法
```bash
# 基本用法
python insert_to_excel.py input.sql

# 指定输出文件
python insert_to_excel.py input.sql -o output.xlsx
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
INSERT INTO "SCHEMA"."TABLE" (col1, col2) VALUES ('val1', 'val2');
```

## 特性

- 自动识别表名和列名
- 支持标准 SQL 和 Oracle 格式（`"库名"."表名"`）
- 支持多个表的 INSERT 语句（每个表生成一个工作表）
- 处理引号内的逗号和特殊字符
- 输出格式化的 Excel 文件

## 示例

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

**注意**：Oracle 格式的 `"库名"."表名"` 在 Excel 中会转换为 `库名_表名` 格式的工作表名。
