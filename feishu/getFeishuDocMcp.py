#!/usr/bin/env python3
import os
import json
import httpx
import certifi
from mcp.server.fastmcp import FastMCP
from config import load_config

# 加载配置
config = load_config()
URL_PREFIX = config['feishu']['url_prefix']
CONFIG = {
    "app_id": config['feishu']['app_id'],
    "app_secret": config['feishu']['app_secret']
}

# 实例化 FastMCP
# 注意：SSE 模式下，FastMCP 会自动处理 /sse 和 /messages 路由
mcp = FastMCP(
    "feishu-document-reader",
    host=config['server']['host'],
    port=config['server']['port']
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
    import sys
    import asyncio

    # 如果提供了文档 ID 参数，则测试读取文档
    if len(sys.argv) > 1:
        test_file_id = sys.argv[1]
        print(f"测试读取文档: {test_file_id}")

        async def test():
            content = await get_document_content(test_file_id)
            print(f"文档内容长度: {len(content)} 字符")
            print(f"内容预览: {content[:200]}...")

        asyncio.run(test())
    else:
        # 启动 MCP 服务器
        print(f"启动 MCP 服务器: {config['server']['host']}:{config['server']['port']}")
        mcp.run(transport="sse")