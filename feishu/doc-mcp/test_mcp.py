#!/usr/bin/env python3
"""快速测试 MCP 服务是否正常"""
import asyncio
import sys
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

MCP_URL = "http://localhost:50070/sse"
TEST_FILE_ID = "doxrzFVGxynmgH727mFFd1oThSb"

async def test():
    print(f"连接 MCP 服务: {MCP_URL}")
    async with sse_client(MCP_URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("✅ 连接成功")

            # 列出可用工具
            
            tools = await session.list_tools()
            print(f"✅ 可用工具: {[t.name for t in tools.tools]}")

            # 调用工具
            file_id = sys.argv[1] if len(sys.argv) > 1 else TEST_FILE_ID
            print(f"调用 get_document_content({file_id})")
            result = await session.call_tool("get_document_content", {"file_id": file_id})
            print(f"✅ 调用成功，返回长度: {len(str(result.content))} 字符")
            print(f"内容预览: {str(result.content)[:200]}...")

if __name__ == "__main__":
    asyncio.run(test())
