# 飞书多维表格 Webhook 服务

接收飞书多维表格自动化推送，处理附件文件下载地址获取。

## 功能特性

- 接收多维表格自动化触发的 Webhook 推送
- 自动获取附件临时下载地址
- 支持区域、项目编码等字段解析

## 前置要求

- Python 3.8+
- 飞书开放平台应用凭证（App ID 和 App Secret）
- 服务需要有公网或内网可访问地址（供飞书回调）

## 安装依赖

```bash
pip install flask requests
# 或
uv pip install flask requests
```

## 配置步骤

### 1. 获取飞书应用凭证

参考父目录 `config.example.yml`，创建 `../config.yml` 并填入凭证。

### 2. 开通应用权限

在飞书开放平台「权限管理」中添加以下权限：

| 权限 | 说明 |
|------|------|
| `bitable:app` | 多维表格读写权限 |
| `drive:drive` | 云空间文件管理 |
| `drive:drive:readonly` | 云空间文件只读 |

### 3. 为应用添加多维表格访问权限

在多维表格页面：「...」→「...更多」→「添加文档应用」，为应用添加可管理权限。

### 4. 配置多维表格自动化

在飞书多维表格中配置自动化触发器：

1. 打开多维表格 → 「自动化」
2. 新建自动化，触发条件选「记录新增时」
3. 执行动作选「发送 HTTP 请求」
4. 填写 Webhook 地址：`http://your-server:8080/webhook`
5. 请求方式：`POST`，Content-Type：`application/json`
6. 请求体配置（JSON 格式）：

```json
{
  "fields": {
    "regin": "{{区域字段}}",
    "projectCode": "{{项目编码字段}}",
    "file": "{{附件字段}}"
  }
}
```

> 注意：JSON 键名需与代码中的字段名保持一致（`regin`、`projectCode`、`file`）

## 启动服务

```bash
cd multi-table
python testMultiTableWebhook.py
```

服务启动后监听 `http://0.0.0.0:8080`。

## 接口说明

### POST /webhook

接收多维表格自动化推送。

**请求体**：

```json
{
  "fields": {
    "regin": "华东",
    "projectCode": "PRJ-001",
    "file": "boxrzxxxxxxxxxxxxxxx"
  }
}
```

**响应**：

```json
{"code": 0, "msg": "success"}
```

**处理逻辑**：

1. 解析推送的字段（区域、项目编码、附件 token）
2. 如果有附件，调用飞书 API 获取临时下载地址
3. 返回成功响应

## 测试

服务启动后，可以用 curl 模拟推送：

```bash
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "regin": "华东",
      "projectCode": "PRJ-001",
      "file": "boxrzxxxxxxxxxxxxxxx"
    }
  }'
```

## 故障排查

### 获取 Token 失败

- 检查 `config.yml` 中的 `app_id` 和 `app_secret` 是否正确
- 确认应用已发布并安装到企业

### 附件下载地址获取失败

- 确认已开通 `drive:drive` 和 `drive:drive:readonly` 权限
- 确认 `file_token` 格式正确（通常以 `boxrz` 开头）

### 收不到 Webhook 推送

- 确认服务地址对飞书服务器可达
- 检查防火墙是否放行 8080 端口
- 查看多维表格自动化的执行日志

### 代理干扰问题

代码已禁用系统代理（`trust_env = False`），如果仍有网络问题，检查服务器网络配置。
