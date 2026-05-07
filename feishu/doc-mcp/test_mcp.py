#!/usr/bin/env python3
"""快速测试 MCP 服务是否正常

用法:
    # 先启动 MCP 服务: python getFeishuDocMcp.py

    python test_mcp.py                              # 列出所有工具

    # === 统一入口（无前缀，token 类型不明时使用） ===
    python test_mcp.py ls <token> [wiki|drive|auto] # 列出子内容（自动识别）
    python test_mcp.py read <token>                 # 读取文档内容
    python test_mcp.py search_all <keyword>         # 全局搜索所有文档

    # === 云空间专用（drive_ 前缀，URL 形如 /drive/folder/xxx 或 /docx/xxx） ===
    python test_mcp.py drive_folder [folder_token]  # 列出云空间文件夹内容
    python test_mcp.py drive_doc <file_id>          # 读取云空间 docx 文档

    # === 知识库专用（wiki_ 前缀，URL 形如 /wiki/xxx） ===
    python test_mcp.py wiki_spaces                  # 列出所有知识库空间
    python test_mcp.py wiki_info <wiki_token>       # 获取知识库节点信息
    python test_mcp.py wiki_nodes <wiki_token>      # 列出知识库子节点
    python test_mcp.py wiki_doc <wiki_token>        # 读取知识库文档
    python test_mcp.py wiki_search <wiki_token> <keyword>  # 知识库全文搜索
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


def print_help():
    print("用法:")
    print()
    print("  === 统一入口（token 类型不明时使用） ===")
    print("  python test_mcp.py ls <token> [wiki|drive|auto]  # 列出子内容（自动识别）")
    print("  python test_mcp.py read <token>                  # 读取文档内容")
    # print("  python test_mcp.py search_all <keyword> [count]  # 全局搜索所有文档，接口很慢需要优化")
    print()
    print("  === 云空间专用（URL 形如 /drive/folder/xxx 或 /docx/xxx） ===")
    print("  python test_mcp.py drive_folder [folder_token]   # 列出云空间文件夹")
    print("  python test_mcp.py drive_doc <file_id>           # 读取云空间 docx")
    print()
    print("  === 知识库专用（URL 形如 /wiki/xxx） ===")
    # print("  python test_mcp.py wiki_spaces                   # 列出知识库空间,还没测试通过")
    print("  python test_mcp.py wiki_info <wiki_token>        # 节点信息")
    print("  python test_mcp.py wiki_nodes <wiki_token>       # 列出子节点")
    print("  python test_mcp.py wiki_doc <wiki_token>         # 读取知识库文档")
    print("  python test_mcp.py wiki_search <wiki_token> <keyword>  # 全文搜索")


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

            # === 统一入口 ===
            if cmd == "ls":
                token = sys.argv[2] if len(sys.argv) > 2 else None
                if not token:
                    print("用法: python test_mcp.py ls <token> [wiki|drive|auto]")
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
                    return
                print(f"--- 读取文档: {token} ---")
                result = await session.call_tool("read_document", {"token": token})
                print(str(result.content[0].text)[:500])

            elif cmd == "search_all":
                if len(sys.argv) < 3:
                    print("用法: python test_mcp.py search_all <keyword> [count]")
                    return
                keyword = sys.argv[2]
                count = int(sys.argv[3]) if len(sys.argv) > 3 else 20
                print(f"--- 全局搜索: keyword={keyword}, count={count} ---")
                result = await session.call_tool(
                    "search_all_docs",
                    {"keyword": keyword, "count": count}
                )
                print_json(str(result.content[0].text))

            # === 云空间专用 ===
            elif cmd == "drive_folder":
                folder_token = sys.argv[2] if len(sys.argv) > 2 else None
                if folder_token:
                    print(f"--- 云空间文件夹: {folder_token} ---")
                else:
                    print("--- 云空间根目录 ---")
                result = await session.call_tool(
                    "drive_list_folder",
                    {"folder_token": folder_token} if folder_token else {}
                )
                print_json(str(result.content[0].text))

            elif cmd == "drive_doc":
                file_id = sys.argv[2] if len(sys.argv) > 2 else None
                if not file_id:
                    print("用法: python test_mcp.py drive_doc <file_id>")
                    return
                print(f"--- 读取云空间文档: {file_id} ---")
                result = await session.call_tool("drive_read_document", {"file_id": file_id})
                print(str(result.content[0].text)[:500])

            # === 知识库专用 ===
            elif cmd == "wiki_spaces":
                print("--- 列出知识库空间 ---")
                result = await session.call_tool("wiki_list_spaces", {})
                print_json(str(result.content[0].text))

            elif cmd == "wiki_info":
                wiki_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not wiki_token:
                    print("用法: python test_mcp.py wiki_info <wiki_token>")
                    return
                print(f"--- 知识库节点信息: {wiki_token} ---")
                result = await session.call_tool("wiki_get_node_info", {"wiki_token": wiki_token})
                print_json(str(result.content[0].text))

            elif cmd == "wiki_nodes":
                wiki_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not wiki_token:
                    print("用法: python test_mcp.py wiki_nodes <wiki_token>")
                    return
                print(f"--- 知识库子节点: {wiki_token} ---")
                result = await session.call_tool("wiki_list_nodes", {"wiki_token": wiki_token})
                print_json(str(result.content[0].text))

            elif cmd == "wiki_doc":
                wiki_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not wiki_token:
                    print("用法: python test_mcp.py wiki_doc <wiki_token>")
                    return
                print(f"--- 读取知识库文档: {wiki_token} ---")
                result = await session.call_tool("wiki_read_document", {"wiki_token": wiki_token})
                print(str(result.content[0].text)[:500])

            elif cmd == "wiki_search":
                if len(sys.argv) < 4:
                    print("用法: python test_mcp.py wiki_search <wiki_token> <keyword>")
                    return
                wiki_token, keyword = sys.argv[2], sys.argv[3]
                print(f"--- 知识库全文搜索: wiki_token={wiki_token}, keyword={keyword} ---")
                result = await session.call_tool(
                    "wiki_search",
                    {"wiki_token": wiki_token, "keyword": keyword}
                )
                print_json(str(result.content[0].text))

            else:
                print_help()


if __name__ == "__main__":
    asyncio.run(main())
