#!/usr/bin/env python3
import sys
import httpx
import certifi
from pathlib import Path
from mcp.server.fastmcp import FastMCP

# 将父目录加入路径，以便导入共用 config.py
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import load_config

# 加载配置
config = load_config()
URL_PREFIX = config['feishu']['url_prefix']
CONFIG = {
    "app_id": config['feishu']['app_id'],
    "app_secret": config['feishu']['app_secret']
}

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
        return response.text.encode("unicode_escape").decode("ascii")

if __name__ == "__main__":
    import asyncio

    if len(sys.argv) > 1:
        test_file_id = sys.argv[1]
        print(f"测试读取文档: {test_file_id}")

        async def test():
            content = await get_document_content(test_file_id)
            print(f"文档内容长度: {len(content)} 字符")
            print(f"内容预览: {content[:200]}...")

        asyncio.run(test())
    else:
        print(f"启动 MCP 服务器: {config['server']['host']}:{config['server']['port']}")
        mcp.run(transport="sse")
