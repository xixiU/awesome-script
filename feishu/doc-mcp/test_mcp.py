#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""快速测试 MCP 服务是否正常

用法:
    # 先启动 MCP 服务: python getFeishuDocMcp.py

    python test_mcp.py                              # 列出所有工具

    # === 统一入口（无前缀，token 类型不明时使用） ===
    python test_mcp.py ls <token> [wiki|drive|auto] [recursive]  # 列出子内容（自动识别）
    python test_mcp.py read <token>                 # 读取文档内容
    python test_mcp.py search_all <keyword>         # 全局搜索（暂不可用，私有化部署限制）

    # === 云空间专用（drive_ 前缀，URL 形如 /drive/folder/xxx 或 /docx/xxx） ===
    python test_mcp.py drive_folder [folder_token] [recursive]  # 列出云空间文件夹内容
    python test_mcp.py drive_doc <file_id> [type]   # 读取云空间文档(docx/sheet/bitable)

    # === 电子表格 / 多维表格 ===
    python test_mcp.py sheet <spreadsheet_token> [range]  # 读取电子表格
    python test_mcp.py sheet_list <spreadsheet_token>     # 列出工作表
    python test_mcp.py bitable <app_token> [table_id]     # 读取多维表格
    python test_mcp.py bitable_list <app_token>           # 列出数据表

    # === docx 结构化 / 导出 / 评论 / 统计 ===
    python test_mcp.py docx_blocks <document_id> [format]  # 读取文档结构(markdown/json)
    python test_mcp.py export <file_token> <file_type> <export_type>  # 导出文档
    python test_mcp.py comments <file_token> <file_type>   # 读取评论
    python test_mcp.py stats <file_token> <file_type>      # 文档统计
    python test_mcp.py views <file_token> <file_type>      # 查看记录
    python test_mcp.py media <file_token1> [file_token2]   # 媒体下载链接

    # === 知识库专用（wiki_ 前缀，URL 形如 /wiki/xxx） ===
    python test_mcp.py wiki_spaces                  # 列出所有知识库空间
    python test_mcp.py wiki_info <wiki_token>       # 获取知识库节点信息
    python test_mcp.py wiki_nodes <wiki_token> [recursive]  # 列出知识库子节点
    python test_mcp.py wiki_doc <wiki_token>        # 读取知识库文档
    python test_mcp.py wiki_search <keyword> <wiki_token>  # 知识库全文搜索
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
    print("  python test_mcp.py ls <token> [wiki|drive|auto] [recursive]  # 列出子内容（自动识别）")
    print("  python test_mcp.py read <token>                  # 读取文档内容")
    print("  python test_mcp.py search_all <keyword> [count]  # 全局搜索（暂不可用，私有化部署限制）")
    print()
    print("  === 云空间专用（URL 形如 /drive/folder/xxx 或 /docx/xxx） ===")
    print("  python test_mcp.py drive_folder [folder_token] [recursive]   # 列出云空间文件夹")
    print("  python test_mcp.py drive_doc <file_id> [type]    # 读取云空间文档(docx/sheet/bitable)")
    print()
    print("  === 电子表格 / 多维表格 ===")
    print("  python test_mcp.py sheet <spreadsheet_token> [range]  # 读取电子表格")
    print("  python test_mcp.py sheet_list <spreadsheet_token>     # 列出工作表")
    print("  python test_mcp.py bitable <app_token> [table_id]     # 读取多维表格")
    print("  python test_mcp.py bitable_list <app_token>           # 列出数据表")
    print()
    print("  === docx 结构化 / 导出 / 评论 / 统计 ===")
    print("  python test_mcp.py docx_blocks <document_id> [format]  # 读取文档结构")
    print("  python test_mcp.py export <file_token> <file_type> <export_type>  # 导出")
    print("  python test_mcp.py comments <file_token> <file_type>   # 评论")
    print("  python test_mcp.py stats <file_token> <file_type>      # 统计")
    print("  python test_mcp.py views <file_token> <file_type>      # 查看记录")
    print("  python test_mcp.py media <file_token1> [...]           # 媒体下载")
    print()
    print("  === 知识库专用（URL 形如 /wiki/xxx） ===")
    # print("  python test_mcp.py wiki_spaces                   # 列出知识库空间,还没测试通过")
    print("  python test_mcp.py wiki_info <wiki_token>        # 节点信息")
    print("  python test_mcp.py wiki_nodes <wiki_token> [recursive]       # 列出子节点")
    print("  python test_mcp.py wiki_doc <wiki_token>         # 读取知识库文档")
    print("  python test_mcp.py wiki_search <keyword> <wiki_token>  # 全文搜索")


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
                    print("用法: python test_mcp.py ls <token> [wiki|drive|auto] [recursive]")
                    return
                type_hint = sys.argv[3] if len(sys.argv) > 3 else "auto"
                recursive = sys.argv[4].lower() in ("true", "1", "yes") if len(sys.argv) > 4 else False
                print(f"--- 列出子内容: {token} (type={type_hint}, recursive={recursive}) ---")
                result = await session.call_tool(
                    "list_children",
                    {"token": token, "type": type_hint, "recursive": recursive}
                )
                print_json(str(result.content[0].text))

            elif cmd == "read":
                token = sys.argv[2] if len(sys.argv) > 2 else None
                if not token:
                    print("用法: python test_mcp.py read <token>")
                    return
                print(f"--- 读取文档: {token} ---")
                result = await session.call_tool("read_document", {"input": token})
                print(str(result.content[0].text)[:500])

            elif cmd == "search_all":
                if len(sys.argv) < 3:
                    print("用法: python test_mcp.py search_all <keyword> [count]")
                    return
                keyword = sys.argv[2]
                count = int(sys.argv[3]) if len(sys.argv) > 3 else 20
                print(f"--- 全局搜索: keyword={keyword}, count={count} ---")
                result = await session.call_tool(
                    "wiki_search",
                    {"keyword": keyword, "count": count}
                )
                print_json(str(result.content[0].text))

            # === 云空间专用 ===
            elif cmd == "drive_folder":
                folder_token = sys.argv[2] if len(sys.argv) > 2 else None
                recursive = sys.argv[3].lower() in ("true", "1", "yes") if len(sys.argv) > 3 else False
                if folder_token:
                    print(f"--- 云空间文件夹: {folder_token} (recursive={recursive}) ---")
                    result = await session.call_tool(
                        "drive_list_folder",
                        {"folder_token": folder_token, "recursive": recursive}
                    )
                else:
                    print(f"--- 云空间根目录 (recursive={recursive}) ---")
                    result = await session.call_tool(
                        "drive_list_folder",
                        {"recursive": recursive}
                    )
                print_json(str(result.content[0].text))

            elif cmd == "drive_doc":
                file_id = sys.argv[2] if len(sys.argv) > 2 else None
                if not file_id:
                    print("用法: python test_mcp.py drive_doc <file_id> [type]")
                    return
                type_hint = sys.argv[3] if len(sys.argv) > 3 else "auto"
                print(f"--- 读取云空间文档: {file_id} (type={type_hint}) ---")
                result = await session.call_tool("drive_read_document", {"file_id": file_id, "type": type_hint})
                print(str(result.content[0].text)[:500])

            # === 电子表格 / 多维表格 ===
            elif cmd == "sheet":
                spreadsheet_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not spreadsheet_token:
                    print("用法: python test_mcp.py sheet <spreadsheet_token> [range]")
                    return
                rng = sys.argv[3] if len(sys.argv) > 3 else None
                print(f"--- 读取电子表格: {spreadsheet_token} (range={rng}) ---")
                args = {"spreadsheet_token": spreadsheet_token}
                if rng:
                    args["range"] = rng
                result = await session.call_tool("sheet_read", args)
                print(str(result.content[0].text)[:1000])

            elif cmd == "sheet_list":
                spreadsheet_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not spreadsheet_token:
                    print("用法: python test_mcp.py sheet_list <spreadsheet_token>")
                    return
                print(f"--- 列出工作表: {spreadsheet_token} ---")
                result = await session.call_tool("sheet_list_worksheets", {"spreadsheet_token": spreadsheet_token})
                print_json(str(result.content[0].text))

            elif cmd == "bitable":
                app_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not app_token:
                    print("用法: python test_mcp.py bitable <app_token> [table_id]")
                    return
                table_id = sys.argv[3] if len(sys.argv) > 3 else None
                print(f"--- 读取多维表格: {app_token} (table_id={table_id}) ---")
                args = {"app_token": app_token}
                if table_id:
                    args["table_id"] = table_id
                result = await session.call_tool("bitable_read", args)
                print(str(result.content[0].text)[:1000])

            elif cmd == "bitable_list":
                app_token = sys.argv[2] if len(sys.argv) > 2 else None
                if not app_token:
                    print("用法: python test_mcp.py bitable_list <app_token>")
                    return
                print(f"--- 列出数据表: {app_token} ---")
                result = await session.call_tool("bitable_list_tables", {"app_token": app_token})
                print_json(str(result.content[0].text))

            # === docx 结构化 / 导出 / 评论 / 统计 ===
            elif cmd == "docx_blocks":
                document_id = sys.argv[2] if len(sys.argv) > 2 else None
                if not document_id:
                    print("用法: python test_mcp.py docx_blocks <document_id> [format]")
                    return
                fmt = sys.argv[3] if len(sys.argv) > 3 else "markdown"
                print(f"--- 读取文档结构: {document_id} (format={fmt}) ---")
                result = await session.call_tool("docx_read_blocks", {"document_id": document_id, "output_format": fmt})
                print(str(result.content[0].text)[:1000])

            elif cmd == "export":
                if len(sys.argv) < 5:
                    print("用法: python test_mcp.py export <file_token> <file_type> <export_type>")
                    print("示例: python test_mcp.py export doxXXX docx pdf")
                    return
                file_token = sys.argv[2]
                file_type = sys.argv[3]
                export_type = sys.argv[4]
                print(f"--- 导出文档: {file_token} ({file_type} → {export_type}) ---")
                result = await session.call_tool("export_document", {
                    "file_token": file_token,
                    "file_type": file_type,
                    "export_type": export_type
                })
                print_json(str(result.content[0].text))

            elif cmd == "comments":
                if len(sys.argv) < 4:
                    print("用法: python test_mcp.py comments <file_token> <file_type>")
                    return
                file_token = sys.argv[2]
                file_type = sys.argv[3]
                print(f"--- 读取评论: {file_token} ({file_type}) ---")
                result = await session.call_tool("read_comments", {
                    "file_token": file_token,
                    "file_type": file_type,
                    "include_replies": False
                })
                print_json(str(result.content[0].text))

            elif cmd == "stats":
                if len(sys.argv) < 4:
                    print("用法: python test_mcp.py stats <file_token> <file_type>")
                    return
                file_token = sys.argv[2]
                file_type = sys.argv[3]
                print(f"--- 文档统计: {file_token} ({file_type}) ---")
                result = await session.call_tool("get_file_statistics", {
                    "file_token": file_token,
                    "file_type": file_type
                })
                print_json(str(result.content[0].text))

            elif cmd == "views":
                if len(sys.argv) < 4:
                    print("用法: python test_mcp.py views <file_token> <file_type>")
                    return
                file_token = sys.argv[2]
                file_type = sys.argv[3]
                print(f"--- 查看记录: {file_token} ({file_type}) ---")
                result = await session.call_tool("get_file_view_records", {
                    "file_token": file_token,
                    "file_type": file_type
                })
                print_json(str(result.content[0].text))

            elif cmd == "media":
                if len(sys.argv) < 3:
                    print("用法: python test_mcp.py media <file_token1> [file_token2] ...")
                    return
                file_tokens = sys.argv[2:]
                print(f"--- 媒体下载链接: {file_tokens} ---")
                result = await session.call_tool("media_download", {"file_tokens": file_tokens})
                print_json(str(result.content[0].text))

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
                    print("用法: python test_mcp.py wiki_nodes <wiki_token> [recursive]")
                    return
                recursive = sys.argv[3].lower() in ("true", "1", "yes") if len(sys.argv) > 3 else False
                print(f"--- 知识库子节点: {wiki_token} (recursive={recursive}) ---")
                result = await session.call_tool(
                    "wiki_list_nodes",
                    {"wiki_token": wiki_token, "recursive": recursive}
                )
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
                    print("用法: python test_mcp.py wiki_search <keyword> <wiki_token>")
                    return
                keyword = sys.argv[2]
                wiki_token = sys.argv[3]
                print(f"--- 知识库全文搜索: keyword={keyword}, wiki_token={wiki_token} ---")
                result = await session.call_tool(
                    "wiki_search",
                    {"keyword": keyword, "wiki_token": wiki_token}
                )
                print_json(str(result.content[0].text))

            else:
                print_help()


if __name__ == "__main__":
    asyncio.run(main())
