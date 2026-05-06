# 飞书文档 MCP 工具

一个基于 MCP (Model Context Protocol) 的飞书文档读取工具，可以让 AI 助手直接读取飞书文档内容。

## 功能特性

- 🔐 支持飞书开放平台 API 认证
- 📄 读取飞书文档原始文本内容
- 🌐 **全局搜索所有有权限的云文档**（无需指定知识库）
- 📁 **列出云空间文件夹内容**（支持文件夹遍历）
- 📚 列出和搜索知识库（Wiki）空间
- 🔍 在知识库中搜索关键词
- 📑 获取知识库文档节点列表
- 🚀 基于 FastMCP 的 SSE 传输协议
- ⚙️ 灵活的 YAML 配置管理

## 前置要求

- Python 3.8+
- 飞书开放平台应用凭证（App ID 和 App Secret）

## 安装依赖

```bash
pip install fastmcp httpx certifi pyyaml
```

或通过uv
```bash
uv pip install fastmcp httpx certifi pyyaml
```
## 配置步骤

### 1. 获取飞书应用凭证

1. 访问 [飞书开放平台/企业私有化开放平台](https://open.feishu.cn/app) 
2. 创建企业自建应用
3. 在「凭证与基础信息」页面获取：
   - App ID
   - App Secret
4. 在「权限管理」中添加以下权限：
   - `docx:document` - 查看、评论和导出文档
   - `docx:document:readonly` - 查看和导出文档（只读）
   - `wiki:wiki:readonly` - 查看知识库（只读）
   - `drive:drive:readonly` - 查看、评论和下载云文档所有文件（全局搜索需要）
   - `search:docs:read` - 搜索用户有权限的云文档（全局搜索需要）

### 2. 创建配置文件

配置文件加载优先级：`doc-mcp/config.yml` > `feishu/config.yml`（父目录）

**方式一**：在 doc-mcp 目录下独立配置（推荐）

```bash
cd feishu/doc-mcp
cp config.example.yml config.yml
```

**方式二**：使用父目录的共享配置

```bash
cd feishu
cp config.example.yml config.yml
```

编辑 `config.yml`，填入你的实际配置：

```yaml
feishu:
  # 飞书 API 地址
  url_prefix: "https://open.feishu.cn"  # 官方飞书
  # url_prefix: "https://open.xfchat.iflytek.com"  # 讯飞飞书

  # 应用凭证
  app_id: "cli_xxxxxxxxxxxxx"
  app_secret: "xxxxxxxxxxxxxxxxxxxxxxxx"

server:
  host: "0.0.0.0"
  port: 50070
```

## 使用方法

### 启动 MCP 服务器

```bash
python getFeishuDocMcp.py
```

服务器将在 `http://0.0.0.0:50070` 启动，支持 SSE 传输协议。

### 在 Claude Desktop 中配置

编辑 Claude Desktop 配置文件：

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

添加以下配置：

```json
{
  "mcpServers": {
    "feishu-docs": {
      "command": "python",
      "args": [
        "D:\\source\\awesome-script\\feishu\\getFeishuDocMcp.py"
      ]
    }
  }
}
```

### 使用工具

在 Claude 中可以使用以下工具：

```python
# 读取飞书文档内容
get_document_content(file_id="doxrzFVGxynmgH727mFFd1oThSb")

# 全局搜索所有有权限的云文档（推荐，无需指定知识库）
search_all_docs(keyword="智慧法庭", count=20)

# 列出云空间文件夹内容
list_drive_folder(folder_token="HRfkf7lPDlQbqqdswOsrKPsezAd")  # 指定文件夹
list_drive_folder()  # 不填则列出根目录

# 列出所有可访问的知识库
list_wiki_spaces()

# 列出知识库中的文档节点
list_wiki_nodes(wiki_token="xxx")

# 在指定知识库中搜索关键词
search_wiki_by_keyword(wiki_token="xxx", keyword="搜索词")

# 获取知识库文档完整内容
get_wiki_document_full_content(obj_token="xxx")
```

**获取文档 ID**：
- 打开飞书文档
- 从 URL 中提取文档 ID
- 例如：`https://example.feishu.cn/docx/doxrzFVGxynmgH727mFFd1oThSb`
- 文档 ID 为：`doxrzFVGxynmgH727mFFd1oThSb`

**获取知识库 ID**：
- 打开飞书知识库
- 从 URL 中提取 space_id
- 例如：`https://example.feishu.cn/wiki/xxx`
- 或使用 `list_wiki_spaces()` 工具获取所有知识库列表

## 配置说明

### feishu 配置项

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `url_prefix` | 飞书 API 地址前缀 | `https://open.feishu.cn` |
| `app_id` | 应用 ID | `cli_xxxxxxxxxxxxx` |
| `app_secret` | 应用密钥 | `xxxxxxxxxxxxxxxx` |

### server 配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `host` | 服务监听地址 | `0.0.0.0` |
| `port` | 服务监听端口 | `50070` |

## 故障排查

### 1. 认证失败

**错误**: `401 Unauthorized`

**解决方案**:
- 检查 `app_id` 和 `app_secret` 是否正确
- 确认应用已启用并发布
- 检查 `url_prefix` 是否匹配你的飞书环境

### 2. 权限不足

**错误**: `403 Forbidden`

**解决方案**:
- 在飞书开放平台添加文档读取权限
- 重新发布应用版本
- 确认应用已被安装到企业

### 3. 文档 ID 无效

**错误**: `404 Not Found`

**解决方案**:
- 检查文档 ID 是否正确
- 确认应用有权限访问该文档
- 验证文档是否存在且未被删除

### 4. 知识库访问失败

**错误**: `403 Forbidden` 或 `404 Not Found`

**解决方案**:
- 确认已添加 `wiki:wiki:readonly` 权限
- 检查知识库是否对应用开放访问权限
- 验证 space_id 是否正确

### 5. 配置文件未找到

**错误**: `FileNotFoundError: 配置文件不存在`

**解决方案**:
- 确保 `config.yml` 文件存在于 `feishu/` 目录
- 或者至少保留 `config.example.yml` 作为备用

## 开发说明

### 项目结构

```
feishu/
├── getFeishuDocMcp.py      # MCP 服务器主程序
├── config.example.yml      # 配置文件示例
├── config.yml              # 实际配置（不提交到 Git）
├── .gitignore              # Git 忽略规则
└── README.md               # 本文档
```

### 配置加载优先级

1. `config.yml` - 优先使用
2. `config.example.yml` - 备用（会显示警告）
3. 如果都不存在则抛出异常

## 许可证

本项目遵循 MIT 许可证。

## 相关链接

- [飞书开放平台文档](https://open.feishu.cn/document/)
- [MCP 协议规范](https://modelcontextprotocol.io/)
- [FastMCP 文档](https://github.com/jlowin/fastmcp)
