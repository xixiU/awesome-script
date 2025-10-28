# 批量运维工具

一个基于纯前端的批量运维工具，通过 Excel 文件批量执行 curl 命令。

## 功能特性

- 🚀 支持从 Excel 文件读取批量参数
- 📝 支持变量占位符 `${列名}` 和 `{列名}` 自动替换（支持中文）
- 🎯 可视化数据预览和命令预览
- 🔄 一键导出为 Shell 脚本
- 💻 纯前端实现，无需后端服务器
- ✅ 避免浏览器跨域问题，直接在服务器执行
- 📊 实时显示生成进度

![alt text](example_preview.png "Title")

## 使用方法

### 步骤 1：准备 Excel 文件

创建一个 Excel 文件，第一行为列名，后续行为数据。例如：

| 姓名  | 年龄 | 城市   |
| ----- | ---- | ------ |
| 张三  | 25   | 北京   |
| 李四  | 30   | 上海   |
| 王五  | 28   | 广州   |

### 步骤 2：编写 curl 命令

在 curl 命令中使用 `${列名}` 或 `{列名}` 来标记需要替换的变量（支持中文）：

```bash
curl 'http://172.31.160.184:8181/ts-service/count/list?pageNumber=1&pageSize=10&queryText=${queryText}&startTime=&endTime=&accountName=supadmin&courtMethod=&remotePlace=&department=&clerk=&userId=5&roomName=&courtStatusType=&caseStatus=&trialMode=' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Accept-Language: zh-CN,zh;q=0.9' \
  -H 'Authorization: Bearer 5' \
  -H 'Connection: keep-alive' \
  -H 'Origin: http://172.31.160.184:7071' \
  -H 'Referer: http://172.31.160.184:7071/' \
  -H 'Request-Source: innerNet' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36' \
  -H 'token: 5' \
  --insecure
```

> 提示：支持 `${列名}` 和 `{列名}` 两种格式，支持中文变量名

### 步骤 3：预览和导出

1. 在页面上输入 curl 命令
2. 上传准备好的 Excel 文件
3. 预览解析的数据和生成的命令
4. 点击"导出为 Shell 脚本"下载脚本文件
5. 上传到服务器执行

### 步骤 4：服务器执行

```bash
# 赋予执行权限
chmod +x batch_ops_*.sh

# 执行脚本
./batch_ops_*.sh
```

## 使用示例

### 示例 1：批量查询接口（支持中文变量）

**Excel 文件：**

| 查询名称 |
| -------- |
| 民初58   |
| 民初59   |
| 民初60   |

**curl 命令：**

```bash
curl 'http://api.example.com/search?queryText={查询名称}' \
  -H 'Authorization: Bearer token123'
```

### 示例 2：批量创建用户

**Excel 文件：**

| 用户名  | 邮箱              | 部门   |
| ------- | ----------------- | ------ |
| alice   | alice@example.com | 技术   |
| bob     | bob@example.com   | 销售   |

**curl 命令：**

```bash
curl -X POST http://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"username":"${用户名}","email":"${邮箱}","department":"${部门}"}'
```

### 示例 3：批量更新配置

**Excel 文件：**

| 服务名       | 端口  | 环境 |
| ------------ | ----- | ---- |
| user-service | 8080  | prod |
| auth-service | 8081  | prod |

**curl 命令：**

```bash
curl -X PUT http://config.example.com/services \
  -H "Content-Type: application/json" \
  -d '{"service":"${服务名}","port":"${端口}","env":"${环境}"}'
```

## 注意事项

1. **变量命名**：使用 `${列名}` 或 `{列名}` 格式，支持中文，列名必须与 Excel 第一行完全匹配
2. **数据类型**：所有 Excel 数据都会被转换为字符串替换
3. **避免跨域**：工具生成 Shell 脚本在服务器执行，避免浏览器跨域限制
4. **命令格式**：支持完整的 curl 命令，包括所有参数和 headers
5. **脚本执行**：导出的脚本包含 `set -e`，任何命令失败都会停止执行

## 技术实现

- **前端技术**：HTML + CSS + JavaScript
- **Excel 解析**：SheetJS (xlsx.js) - 纯前端解析 Excel 文件
- **脚本生成**：基于模板的 Shell 脚本生成
- **无服务器依赖**：可直接在浏览器中使用

## 工作原理

1. 用户输入 curl 命令模板，使用 `${列名}` 或 `{列名}` 作为占位符
2. 上传 Excel 文件，工具读取数据（第一行为列名）
3. 工具识别命令中的变量，与 Excel 列名进行匹配
4. 对每条数据替换变量，生成完整的 curl 命令
5. 将所有命令封装为 Shell 脚本，包含执行逻辑和错误处理
6. 导出 `.sh` 文件，用户可在服务器上直接执行

## 更新记录

### v1.0.0 (2024-10-27)
- ✅ 初始版本发布
- ✅ 支持 Excel 文件解析
- ✅ 支持 curl 命令变量替换（中文变量名）
- ✅ 支持两种占位符格式：`${列名}` 和 `{列名}`
- ✅ 一键导出为 Shell 脚本
- ✅ 可视化数据预览和命令预览
- ✅ 避免浏览器跨域问题

