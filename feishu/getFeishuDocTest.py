#!/usr/bin/env python3
import os
import json
import httpx
import certifi
from mcp.server.fastmcp import FastMCP

# 配置信息
URL_PREFIX = "url"
CONFIG = {
    "app_id": "xx",
    "app_secret": "xx"
}

# 实例化 FastMCP
# 注意：SSE 模式下，FastMCP 会自动处理 /sse 和 /messages 路由
mcp = FastMCP(
    "feishu-document-reader",
    host="0.0.0.0", 
    port=50070
)

async def get_tenant_auth():
    """异步获取飞书 Tenant Access Token"""
    url = f"{URL_PREFIX}/open-apis/auth/v3/tenant_access_token/internal"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        response = await client.post(url, json=CONFIG)
        response.raise_for_status()
        return response.json().get("tenant_access_token")

@mcp.tool()
async def get_document_content(file_id: str) -> str:
    """获取飞书文档的原始文本内容"""
    token = await get_tenant_auth()
    url = f"{URL_PREFIX}/open-apis/docx/v1/documents/{file_id}/raw_content"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }
    
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        response = await client.get(url, headers=headers)
        response.encoding = 'utf-8'
        # 保持原始逻辑：对内容进行转义以确保 JSON 传输安全
        return response.text.encode("unicode_escape").decode("ascii")

if __name__ == "__main__":
    # 核心修改：使用 sse 传输协议运行
    # FastMCP 会基于 Starlette/FastAPI 启动一个支持 SSE 的 Web 服务
    mcp.run(transport="sse")