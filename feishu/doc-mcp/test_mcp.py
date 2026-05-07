#!/usr/bin/env python3
"""快速测试 MCP 服务是否正常

用法:
    # 先启动 MCP 服务: python getFeishuDocMcp.py

    python test_mcp.py                    # 列出所有工具
    python test_mcp.py doc <file_id>      # 测试读取文档
    python test_mcp.py spaces             # 列出所有知识库
    python test_mcp.py nodes <space_id>   # 列出知识库节点 
    python test_mcp.py nodes C5RNwyHtWikA4LkBN9trd4u8zFd   # 列出知识库C5RNwyHtWikA4LkBN9trd4u8zFd节点
    python test_mcp.py folder [folder_token]  # 列出云空间的文档
    python test_mcp.py folder HRfkf7lPDlQbqqdswOsrKPsezAd  # 列出云空间HRfkf7lPDlQbqqdswOsrKPsezAd节点
    python test_mcp.py search <space_id> <keyword>  # 搜索知识库
    python test_mcp.py content <obj_token>  # 获取知识库文档内容
"""
import asyncio
import sys
import json
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

MCP_URL = "http://localhost:50070/sse"


def print_json(text):
    """尝试格式化 JSON 输出"""
    try:
        data = json.loads(text)
        print(json.dumps(data, ensure_ascii=False, indent=2))
    except (json.JSONDecodeError, TypeError):
        print(text[:500] if len(text) > 500 else text)


async def main():
    print(f"连接 MCP 服务: {MCP_URL}")
    async with sse_client(MCP_URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("✅ 连接成功\n")

            # 列出可用工具
            tools = await session.list_tools()
            print(f"可用工具: {[t.name for t in tools.tools]}\n")

            cmd = sys.argv[1] if len(sys.argv) > 1 else "help"

            if cmd == "ls":
                token = sys.argv[2] if len(sys.argv) > 2 else None
                if not token:
                    print("用法: python test_mcp.py ls <token> [wiki|drive|auto]")
                    print("示例: python test_mcp.py ls C5RNwyHtWikA4LkBN9trd4u8zFd")
                    print("      python test_mcp.py ls HRfkf7lPDlQbqqdswOsrKPsezAd drive")
                    return
                type_hint = sys.argv[3] if len(sys.argv) > 3 else "auto"
                print(f"--- 列出子内容: {token} (type={type_hint}) ---")
                result = await session.call_tool(
                    "list_children",
                    {"token": token, "type": type_hint}
                )
                print_json(str(result.content[0].text))

            elif cmd == "read":
                token = sys.argv[2] if len(sys.argv) > 2 else None
                if not token:
                    print("用法: python test_mcp.py read <token>")
                    print("示例: python test_mcp.py read doxrzzXKNz3qKBsTD7MNpEiMDHh")
                    return
                print(f"--- 读取文档: {token} ---")
                result = await session.call_tool("read_document", {"token": token})
                print(str(result.content[0].text)[:500])

            elif cmd == "doc":
                file_id = sys.argv[2] if len(sys.argv) > 2 else "doxrzFVGxynmgH727mFFd1oThSb"
                print(f"--- 读取文档: {file_id} ---")
                result = await session.call_tool("get_document_content", {"file_id": file_id})
                print(str(result.content)[:500])

            elif cmd == "spaces":
                print("--- 列出知识库 ---")
                result = await session.call_tool("list_wiki_spaces", {})
                print_json(str(result.content[0].text))

            elif cmd == "info":
                wiki_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not wiki_token:
                    print("用法: python test_mcp.py info <wiki_token>")
                    print("示例: python test_mcp.py info C5RNwyHtWikA4LkBN9trd4u8zFd")
                    return
                print(f"--- 节点信息: {wiki_token} ---")
                result = await session.call_tool("get_wiki_node_info", {"wiki_token": wiki_token})
                print_json(str(result.content[0].text))

            elif cmd == "nodes":
                wiki_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not wiki_token:
                    print("用法: python test_mcp.py nodes <wiki_token>")
                    print("示例: python test_mcp.py nodes C5RNwyHtWikA4LkBN9trd4u8zFd")
                    return
                print(f"--- 知识库节点: {wiki_token} ---")
                result = await session.call_tool("list_wiki_nodes", {"wiki_token": wiki_token})
                print_json(str(result.content[0].text))

            elif cmd == "folder":
                folder_token = sys.argv[2] if len(sys.argv) > 2 else None
                if folder_token:
                    print(f"--- 云空间文件夹: {folder_token} ---")
                else:
                    print("--- 云空间根目录 ---")
                result = await session.call_tool(
                    "list_drive_folder",
                    {"folder_token": folder_token} if folder_token else {}
                )
                print_json(str(result.content[0].text))

            elif cmd == "search_all":
                if len(sys.argv) < 3:
                    print("用法: python test_mcp.py search_all <keyword> [count]")
                    print("示例: python test_mcp.py search_all 智慧法庭")
                    return
                keyword = sys.argv[2]
                count = int(sys.argv[3]) if len(sys.argv) > 3 else 20
                print(f"--- 全局搜索: keyword={keyword}, count={count} ---")
                result = await session.call_tool(
                    "search_all_docs",
                    {"keyword": keyword, "count": count}
                )
                print_json(str(result.content[0].text))

            elif cmd == "search":
                if len(sys.argv) < 4:
                    print("用法: python test_mcp.py search <wiki_token> <keyword>")
                    print("示例: python test_mcp.py search C5RNwyHtWikA4LkBN9trd4u8zFd 关键词")
                    return
                wiki_token, keyword = sys.argv[2], sys.argv[3]
                print(f"--- 搜索: wiki_token={wiki_token}, keyword={keyword} ---")
                result = await session.call_tool(
                    "search_wiki_by_keyword",
                    {"wiki_token": wiki_token, "keyword": keyword}
                )
                print_json(str(result.content[0].text))

            elif cmd == "content":
                obj_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not obj_token:
                    print("用法: python test_mcp.py content <obj_token>")
                    return
                print(f"--- 文档内容: {obj_token} ---")
                result = await session.call_tool(
                    "get_wiki_document_full_content",
                    {"obj_token": obj_token}
                )
                print(str(result.content[0].text)[:500])

            else:
                print("用法:")
                print()
                print("  === 推荐（统一入口） ===")
                print("  python test_mcp.py ls <token> [wiki|drive|auto]  # 列出子内容（自动识别）")
                print("  python test_mcp.py read <token>                  # 读取文档内容")
                print("  python test_mcp.py search_all <keyword>          # 全局搜索")
                print()
                print("  === 知识库 ===")
                print("  python test_mcp.py nodes <wiki_token>            # 列出知识库子节点")
                print("  python test_mcp.py info <wiki_token>             # 获取节点信息")
                print("  python test_mcp.py search <wiki_token> <keyword> # 知识库全文搜索")
                print("  python test_mcp.py content <obj_token>           # 获取文档内容")
                print()
                print("  === 云空间 ===")
                print("  python test_mcp.py folder [folder_token]         # 列出文件夹内容")
                print("  python test_mcp.py doc <file_id>                 # 读取文档")
                print()
                print("  === 其他 ===")
                print("  python test_mcp.py spaces                        # 列出知识库空间")


if __name__ == "__main__":
    asyncio.run(main())
