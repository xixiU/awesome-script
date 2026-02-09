-- 示例 SQL 文件，用于测试 insert_to_excel.py

-- 单行 INSERT 示例
INSERT INTO users (id, name, email, age) VALUES (1, 'Alice', 'alice@example.com', 25);
INSERT INTO users (id, name, email, age) VALUES (2, 'Bob', 'bob@example.com', 30);

-- 多行 INSERT 示例
INSERT INTO products (id, name, price, category) VALUES 
(101, 'Phone', 999.99, 'Electronics'),
(102, 'Laptop', 1999.99, 'Electronics'),
(103, 'Desk', 299.99, 'Furniture');

-- 另一个表的数据
INSERT INTO orders (order_id, user_id, product_id, quantity) VALUES
(1001, 1, 101, 2),
(1002, 2, 102, 1),
(1003, 1, 103, 1);

-- Oracle 格式: "库名"."表名"
INSERT INTO "TS_FZ_CBB"."IFC_SUP_PQXX" (id, supplier_name, status) VALUES (201, '供应商A', '1');
INSERT INTO "TS_FZ_CBB"."IFC_SUP_PQXX" (id, supplier_name, status) VALUES (202, '供应商B', '1');

-- Oracle 多行格式
INSERT INTO "MY_SCHEMA"."EMPLOYEES" (emp_id, emp_name, department) VALUES
(301, '张三', '技术部'),
(302, '李四', '销售部'),
(303, '王五', '市场部');
