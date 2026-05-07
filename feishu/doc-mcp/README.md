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

### 快速使用（推荐）

飞书有两种文档体系，本工具提供统一入口：

| URL 格式 | 类型 | token 提取 | 说明 |
|-----------|------|-----------|------|
| `/wiki/CQv6wuy...` | 知识库节点 | `CQv6wuy...` | wiki_token，可用于 list_children 和 read_document |
| `/drive/folder/HRfkf7...` | 云空间文件夹 | `HRfkf7...` | folder_token，用于 list_children |
| `/docx/doxrz...` | 文档 | `doxrz...` | obj_token/file_id，用于 read_document |

**推荐工作流**：

```python
# 1. 搜索文档（全局，无需指定位置）
search_all_docs(keyword="智慧法庭")

# 2. 浏览目录（自动识别知识库或云空间）
list_children(token="CQv6wuy5qiNGVIkyaetrbzOrzdf")  # 知识库 wiki_token
list_children(token="HRfkf7lPDlQbqqdswOsrKPsezAd")  # 云空间 folder_token

# 3. 读取文档内容（支持 wiki_token 和 obj_token）
read_document(token="CQv6wuy5qiNGVIkyaetrbzOrzdf")  # 知识库 wiki_token
read_document(token="doxrzzXKNz3qKBsTD7MNpEiMDHh")  # 文档 obj_token
```

`list_children` 会自动识别 token 类型（知识库 or 云空间），也可以手动指定：
```python
list_children(token="xxx", type="wiki")   # 强制知识库
list_children(token="xxx", type="drive")  # 强制云空间
```

`read_document` 会自动处理：
- 如果是 obj_token（如 `doxrzXXX`）→ 直接读取
- 如果是 wiki_token（如 `CQv6wuyXXX`）→ 先获取 obj_token，再读取

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

### 所有工具

工具按「归属系统」分为三类：**统一入口**（token 类型不明时用）、**云空间专用**（`drive_` 前缀）、**知识库专用**（`wiki_` 前缀）。当用户给出完整 URL 时，优先调用对应的专用工具，省去自动识别的试探开销。

**URL → 工具对照**

| URL 形如 | 类型 | 推荐工具 |
|----------|------|----------|
| `/docx/doxrzXXX` | 云空间 docx | `drive_read_document(file_id)` |
| `/drive/folder/HRfkf7XXX` | 云空间文件夹 | `drive_list_folder(folder_token)` |
| `/wiki/CQv6wuyXXX` | 知识库节点 | `wiki_read_document(wiki_token)` 或 `wiki_list_nodes(wiki_token)` |
| 仅有 token 不知来源 | 未知 | `read_document(token)` / `list_children(token)` |

```python
# === 统一入口（无前缀，token 类型不明时使用） ===

# 全局搜索所有有权限的文档（云空间 + 知识库）
search_all_docs(keyword="智慧法庭", count=20)

# 列出目录子内容（auto 先试知识库再回落云空间）
list_children(token="C5RNwyHtWikA4LkBN9trd4u8zFd")                  # 自动识别
list_children(token="HRfkf7lPDlQbqqdswOsrKPsezAd", type="drive")    # 强制云空间
list_children(token="C5RNwyHtWikA4LkBN9trd4u8zFd", type="wiki")     # 强制知识库

# 读取文档（支持 obj_token 和 wiki_token，内部自动适配）
read_document(token="doxrzzXKNz3qKBsTD7MNpEiMDHh")
read_document(token="CQv6wuy5qiNGVIkyaetrbzOrzdf")

# === 云空间专用（drive_ 前缀） ===

# 列出云空间文件夹内容（URL 形如 /drive/folder/xxx）
drive_list_folder(folder_token="HRfkf7lPDlQbqqdswOsrKPsezAd")
drive_list_folder()  # 列根目录

# 读取云空间 docx 文档（URL 形如 /docx/xxx）
drive_read_document(file_id="doxrzFVGxynmgH727mFFd1oThSb")

# === 知识库专用（wiki_ 前缀） ===

# 列出当前应用可访问的所有知识库空间
wiki_list_spaces()

# 获取知识库节点元信息（node_token / space_id / obj_token 等）
wiki_get_node_info(wiki_token="C5RNwyHtWikA4LkBN9trd4u8zFd")

# 列出知识库子节点（URL 形如 /wiki/xxx）
wiki_list_nodes(wiki_token="C5RNwyHtWikA4LkBN9trd4u8zFd")

# 读取知识库文档（URL 形如 /wiki/xxx）
wiki_read_document(wiki_token="CQv6wuy5qiNGVIkyaetrbzOrzdf")

# 知识库全文检索（递归遍历节点 + 读取 docx 内容匹配关键词）
wiki_search(wiki_token="C5RNwyHtWikA4LkBN9trd4u8zFd", keyword="搜索词")
```

> 说明：旧工具名 → 新工具名映射：`get_document_content` → `drive_read_document`、`list_drive_folder` → `drive_list_folder`、`list_wiki_nodes` → `wiki_list_nodes`、`get_wiki_document_full_content` → `wiki_read_document`、`list_wiki_spaces` → `wiki_list_spaces`、`get_wiki_node_info` → `wiki_get_node_info`、`search_wiki_by_keyword` → `wiki_search`。

**获取文档 ID**：
- 打开飞书文档
- 从 URL 中提取文档 ID
- 例如：`https://example.feishu.cn/docx/doxrzFVGxynmgH727mFFd1oThSb`
- 文档 ID 为：`doxrzFVGxynmgH727mFFd1oThSb`

**获取知识库 ID**：
- 打开飞书知识库
- 从 URL 中提取 space_id
- 例如：`https://example.feishu.cn/wiki/xxx`
- 或使用 `wiki_list_spaces()` 工具获取所有知识库列表

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
