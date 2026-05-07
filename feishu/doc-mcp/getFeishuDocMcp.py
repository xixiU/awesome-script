#!/usr/bin/env python3
import sys
import httpx
import certifi
import asyncio
import json
import yaml
from pathlib import Path
from mcp.server.fastmcp import FastMCP


def _load_config():
    """加载配置文件，优先级：当前目录 config.yml > 父目录 config.py"""
    local_dir = Path(__file__).parent
    local_config = local_dir / "config.yml"
    if local_config.exists():
        with open(local_config, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    # 回退到父目录的 config.py
    sys.path.insert(0, str(local_dir.parent))
    from config import load_config
    return load_config()


# 加载配置
config = _load_config()
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

# --- 通用辅助函数 ---

async def get_tenant_auth():
    """异步获取飞书 Tenant Access Token"""
    url = f"{URL_PREFIX}/open-apis/auth/v3/tenant_access_token/internal"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        response = await client.post(url, json=CONFIG)
        response.raise_for_status()
        return response.json().get("tenant_access_token")


def _make_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }


async def _get_all_pages(client, url, headers, params=None):
    """通用分页请求，自动翻页收集所有 items"""
    params = dict(params or {})
    items = []
    while True:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json().get("data", {})
        items.extend(data.get("items") or [])
        if not data.get("has_more"):
            break
        params["page_token"] = data["page_token"]
    return items


async def _get_document_raw_content(auth_token: str, doc_token: str) -> str:
    """【云空间 docx】获取文档原始文本内容

    接口: GET /open-apis/docx/v1/documents/{doc_token}/raw_content
    适用: 云空间 docx 文档；知识库文档需先经 wiki_get_node_info 换取 obj_token
    参数:
        auth_token: 认证 token
        doc_token: 文档 token（obj_token 或 file_id）
    返回:
        文档的纯文本内容
    """
    url = f"{URL_PREFIX}/open-apis/docx/v1/documents/{doc_token}/raw_content"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        resp = await client.get(url, headers=_make_headers(auth_token))
        resp.raise_for_status()
        data = resp.json().get("data", {})
        return data.get("content", "")


async def _get_wiki_node_info(auth_token: str, wiki_token: str) -> dict:
    """【知识库 wiki】获取节点信息（包含 space_id 与 obj_token）

    接口: GET /open-apis/wiki/v2/spaces/get_node
    适用: 知识库节点；用于从 wiki_token 解析出 space_id、obj_token、obj_type
    参数:
        auth_token: 认证 token
        wiki_token: wiki 节点 token
    返回:
        节点信息字典
    """
    url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/get_node"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        resp = await client.get(url, headers=_make_headers(auth_token), params={"token": wiki_token})
        resp.raise_for_status()
        return resp.json().get("data", {}).get("node", {})


async def _list_wiki_child_nodes(auth_token: str, space_id: str, parent_node_token: str) -> list:
    """【知识库 wiki】列出节点的子节点

    接口: GET /open-apis/wiki/v2/spaces/{space_id}/nodes
    适用: 知识库节点展开
    参数:
        auth_token: 认证 token
        space_id: 知识库空间 ID
        parent_node_token: 父节点 token
    返回:
        子节点列表
    """
    url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/{space_id}/nodes"
    params = {"page_size": 50, "parent_node_token": parent_node_token}
    async with httpx.AsyncClient(verify=certifi.where(), timeout=10.0) as client:
        return await _get_all_pages(client, url, _make_headers(auth_token), params)


async def _list_drive_files(auth_token: str, folder_token: str = None) -> list:
    """【云空间 drive】列出文件夹内文件与子文件夹

    接口: GET /open-apis/drive/v1/files
    适用: 云空间文件夹浏览；不填 folder_token 时列根目录
    参数:
        auth_token: 认证 token
        folder_token: 文件夹 token，不填则列出根目录
    返回:
        文件列表
    """
    url = f"{URL_PREFIX}/open-apis/drive/v1/files"
    params = {"page_size": 200}
    if folder_token:
        params["folder_token"] = folder_token

    async with httpx.AsyncClient(verify=certifi.where(), timeout=15.0) as client:
        files = []
        while True:
            resp = await client.get(url, headers=_make_headers(auth_token), params=params)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            files.extend(data.get("files") or [])
            if not data.get("has_more"):
                break
            params["page_token"] = data.get("page_token")
    return files


# --- MCP 工具 ---
# 工具按「归属系统」分成三类，命名统一：
#   1. 统一入口（无前缀）：list_children / read_document / search_all_docs
#      适用于不确定 token 属于知识库还是云空间的场景（如只给 token 没给 URL），
#      自动识别，auto 模式下先试知识库再回落到云空间。
#
#   2. 云空间专用（drive_ 前缀）：drive_list_folder / drive_read_document
#      适用于用户明确给出云空间 URL 的场景，如 /docx/xxx、/drive/folder/xxx，
#      大模型可直接选用，无需探测。
#
#   3. 知识库专用（wiki_ 前缀）：wiki_list_spaces / wiki_get_node_info / wiki_list_nodes
#      / wiki_read_document / wiki_search
#      适用于用户明确给出知识库 URL 的场景，如 /wiki/xxx，或需要知识库特有能力
#      （如 space 列举、递归全文检索）。


# ========== 统一入口（无前缀） ==========
# 这个接口很慢，先不要使用
# @mcp.tool()
# async def search_all_docs(
#     keyword: str,
#     count: int = 20,
#     offset: int = 0,
#     docs_types: list = None,
# ) -> str:
#     """【统一入口】全局搜索所有有权限的飞书文档。

#     覆盖云空间（docx/doc/sheet/bitable/mindnote/file）以及知识库内挂载的文档。
#     无需指定 wiki_token 或 folder_token，会搜索当前应用有权限访问的所有文档。

#     参数:
#         keyword: 搜索关键词
#         count: 返回结果数量（默认 20，范围 [0, 50]）
#         offset: 分页偏移量（默认 0，offset + count < 200）
#         docs_types: 文档类型过滤（可选），如 ['docx', 'doc', 'sheet', 'bitable', 'mindnote', 'file']
#     返回:
#         匹配的文档列表，包含 docs_token、docs_type、title、owner_id
#     """
#     token = await get_tenant_auth()
#     url = f"{URL_PREFIX}/open-apis/suite/docs-api/search/object"
#     body = {
#         "search_key": keyword,
#         "count": min(max(count, 1), 50),
#         "offset": offset,
#     }
#     if docs_types:
#         body["docs_types"] = docs_types

#     async with httpx.AsyncClient(verify=certifi.where(), timeout=15.0) as client:
#         resp = await client.post(url, headers=_make_headers(token), json=body)
#         resp.raise_for_status()
#         data = resp.json().get("data", {})

#     return json.dumps({
#         "total": data.get("total", 0),
#         "has_more": data.get("has_more", False),
#         "docs": data.get("docs_entities", []),
#     }, ensure_ascii=False, indent=2)


@mcp.tool()
async def list_children(token: str, type: str = "auto") -> str:
    """【统一入口】列出目录/节点下的子内容（自动识别知识库或云空间）。

    参数:
        token: 知识库 wiki_token（如 /wiki/xxx 中的 xxx）
               或云空间 folder_token（如 /drive/folder/xxx 中的 xxx）
               不填时 type 必须为 "drive"，用于列出云空间根目录
        type: 类型提示
              - "wiki": 知识库节点
              - "drive": 云空间文件夹
              - "auto"（默认）: 自动识别，先尝试知识库，失败后尝试云空间
    返回:
        子节点/文件列表（JSON 格式），每项含 source 字段标识 wiki/drive 来源
    """
    auth_token = await get_tenant_auth()

    # 尝试知识库
    if type in ("wiki", "auto"):
        try:
            node_info = await _get_wiki_node_info(auth_token, token)
            space_id = node_info.get("space_id")
            if space_id:
                nodes = await _list_wiki_child_nodes(auth_token, space_id, token)
                results = []
                for n in nodes:
                    results.append({
                        "token": n.get("node_token"),
                        "name": n.get("title"),
                        "type": n.get("obj_type"),
                        "has_child": n.get("has_child"),
                        "obj_token": n.get("obj_token"),
                        "created_time": n.get("obj_create_time"),
                        "modified_time": n.get("obj_edit_time"),
                        "source": "wiki",
                    })
                return json.dumps(results, ensure_ascii=False, indent=2)
        except Exception:
            if type == "wiki":
                raise

    # 尝试云空间
    if type in ("drive", "auto"):
        files = await _list_drive_files(auth_token, token)
        results = []
        for f in files:
            results.append({
                "token": f.get("token"),
                "name": f.get("name"),
                "type": f.get("type"),
                "has_child": f.get("type") == "folder",
                "obj_token": f.get("token"),
                "created_time": f.get("created_time"),
                "modified_time": f.get("modified_time"),
                "source": "drive",
            })
        return json.dumps(results, ensure_ascii=False, indent=2)

    return json.dumps({"error": "无法识别 token 类型"}, ensure_ascii=False)


@mcp.tool()
async def read_document(token: str) -> str:
    """【统一入口】读取文档内容（支持知识库文档和云空间文档）。

    参数:
        token: 文档 token，支持以下格式：
               - obj_token/file_id: 直接读取（如 doxrzXXX，云空间 docx）
               - wiki_token: 知识库节点 token（如 CQv6wuy5qiNGVIkyaetrbzOrzdf）
                            会自动获取其 obj_token 后读取
    返回:
        文档的纯文本内容
    """
    auth_token = await get_tenant_auth()

    # 先尝试直接读取（假设是 obj_token / file_id）
    try:
        return await _get_document_raw_content(auth_token, token)
    except httpx.HTTPStatusError as e:
        # 如果 404，尝试作为 wiki_token 处理
        if e.response.status_code == 404:
            try:
                node = await _get_wiki_node_info(auth_token, token)
                obj_token = node.get("obj_token")
                if obj_token:
                    return await _get_document_raw_content(auth_token, obj_token)
            except Exception:
                pass
        # 其他错误，重新抛出
        raise


# ========== 云空间专用（drive_ 前缀） ==========

@mcp.tool()
async def drive_list_folder(folder_token: str = None) -> str:
    """【云空间】列出云空间文件夹中的文件和子文件夹。

    接口: GET /open-apis/drive/v1/files
    适用场景：URL 形如 /drive/folder/xxx 时直接使用；不填 folder_token 列出根目录。
    参数:
        folder_token: 文件夹 token（从云空间 URL 中提取，如 /drive/folder/xxx）
                     不填则列出根目录
    返回:
        文件夹内的文件列表，包含 token、type、name、owner_id 等信息
    """
    token = await get_tenant_auth()
    files = await _list_drive_files(token, folder_token)

    results = []
    for f in files:
        results.append({
            "token": f.get("token"),
            "name": f.get("name"),
            "type": f.get("type"),  # folder, doc, sheet, bitable, docx, file 等
            "parent_token": f.get("parent_token"),
            "owner_id": f.get("owner_id"),
            "created_time": f.get("created_time"),
            "modified_time": f.get("modified_time"),
        })
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool()
async def drive_read_document(file_id: str) -> str:
    """【云空间】读取云空间 docx 文档的原始文本内容。

    接口: GET /open-apis/docx/v1/documents/{file_id}/raw_content
    适用场景：URL 形如 /docx/xxx 时直接使用，file_id 即 URL 中的 xxx。
    参数:
        file_id: 云空间文档 ID，从 /docx/xxx 的 URL 中提取
    返回:
        文档的纯文本内容
    """
    token = await get_tenant_auth()
    return await _get_document_raw_content(token, file_id)


# ========== 知识库专用（wiki_ 前缀) ==========

@mcp.tool()
async def wiki_list_spaces() -> str:
    """【知识库】列出当前应用可访问的所有知识库(Wiki)空间。

    接口: GET /open-apis/wiki/v2/spaces
    返回每个知识库的 space_id、名称、描述等信息。
    注意：部分飞书私有化部署（如讯飞飞书）此接口可能返回空列表，此时需由用户直接提供 wiki_token。
    """
    token = await get_tenant_auth()
    url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        spaces = await _get_all_pages(
            client, url, _make_headers(token), {"page_size": 50}
        )
    results = []
    for s in spaces:
        results.append({
            "space_id": s.get("space_id"),
            "name": s.get("name"),
            "description": s.get("description"),
            "visibility": s.get("visibility"),
        })
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool()
async def wiki_get_node_info(wiki_token: str) -> str:
    """【知识库】通过 wiki_token 获取知识库节点信息（包括 space_id、obj_token）。

    接口: GET /open-apis/wiki/v2/spaces/get_node
    参数:
        wiki_token: 知识库节点 token，从知识库 URL 中提取
                   例如: https://xxx.feishu.cn/wiki/C5RNwyHtWikA4LkBN9trd4u8zFd
                   wiki_token 为: C5RNwyHtWikA4LkBN9trd4u8zFd
    返回:
        节点元信息 JSON（node_token / space_id / obj_token / obj_type / title / has_child / parent_node_token）
    """
    token = await get_tenant_auth()
    node = await _get_wiki_node_info(token, wiki_token)
    return json.dumps({
        "node_token": node.get("node_token"),
        "space_id": node.get("space_id"),
        "obj_token": node.get("obj_token"),
        "obj_type": node.get("obj_type"),
        "title": node.get("title"),
        "has_child": node.get("has_child"),
        "parent_node_token": node.get("parent_node_token"),
        "created_time": node.get("obj_create_time"),
        "modified_time": node.get("obj_edit_time"),
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def wiki_list_nodes(wiki_token: str) -> str:
    """【知识库】列出知识库节点的子节点。

    接口: GET /open-apis/wiki/v2/spaces/{space_id}/nodes
    适用场景：URL 形如 /wiki/xxx 时直接使用，展开该节点下的子节点。
    参数:
        wiki_token: 父节点的 wiki_token（从知识库 URL /wiki/xxx 或 wiki_get_node_info 获取）
    返回:
        子节点列表，包含 node_token / obj_token / obj_type / title / has_child / parent_node_token
    """
    token = await get_tenant_auth()

    # 获取节点信息，得到 space_id
    node_info = await _get_wiki_node_info(token, wiki_token)
    space_id = node_info.get("space_id")
    if not space_id:
        return json.dumps({"error": "无法获取 space_id"}, ensure_ascii=False)

    # 获取子节点
    nodes = await _list_wiki_child_nodes(token, space_id, wiki_token)

    results = []
    for n in nodes:
        results.append({
            "node_token": n.get("node_token"),
            "obj_token": n.get("obj_token"),
            "obj_type": n.get("obj_type"),
            "title": n.get("title"),
            "has_child": n.get("has_child"),
            "parent_node_token": n.get("parent_node_token"),
            "created_time": n.get("obj_create_time"),
            "modified_time": n.get("obj_edit_time"),
        })
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool()
async def wiki_read_document(wiki_token: str) -> str:
    """【知识库】读取知识库文档的完整内容。

    组合调用: wiki_get_node_info 取 obj_token → docx raw_content 读内容
    适用场景：URL 形如 /wiki/xxx 时直接使用。
    参数:
        wiki_token: 知识库节点 token（从 /wiki/xxx 的 URL 中提取）
    返回:
        文档的纯文本内容
    """
    auth_token = await get_tenant_auth()
    node = await _get_wiki_node_info(auth_token, wiki_token)
    obj_token = node.get("obj_token")
    if not obj_token:
        return json.dumps({"error": "无法获取 obj_token，该 wiki 节点可能不是文档类型"}, ensure_ascii=False)
    return await _get_document_raw_content(auth_token, obj_token)


@mcp.tool()
async def wiki_search(wiki_token: str, keyword: str, max_results: int = 10) -> str:
    """【知识库】在知识库中递归搜索包含关键词的文档（全文检索）。

    通过递归遍历 wiki 节点并读取每个 docx 文档内容进行匹配。
    参数:
        wiki_token: 知识库根节点的 wiki_token（从知识库 URL 中提取）
        keyword: 搜索关键词
        max_results: 最多返回结果数（默认 10）
    返回:
        匹配的文档列表，包含 title、obj_token、node_token 和匹配的内容片段
    """
    token = await get_tenant_auth()
    results = []
    visited = set()  # 防止循环引用

    async def search_node(node_token: str, depth: int = 0):
        """递归搜索节点及其子节点"""
        if len(results) >= max_results or depth > 10 or node_token in visited:
            return
        visited.add(node_token)

        try:
            # 1. 获取节点信息
            node_info = await _get_wiki_node_info(token, node_token)
            obj_type = node_info.get("obj_type")
            obj_token = node_info.get("obj_token")
            title = node_info.get("title", "")
            space_id = node_info.get("space_id")
            has_child = node_info.get("has_child")

            # 2. 如果是文档，检查是否匹配关键词
            if obj_type == "docx":
                try:
                    content = await _get_document_raw_content(token, obj_token)
                    if keyword.lower() in content.lower() or keyword.lower() in title.lower():
                        idx = content.lower().find(keyword.lower())
                        if idx >= 0:
                            start = max(0, idx - 50)
                            end = min(len(content), idx + len(keyword) + 50)
                            snippet = content[start:end]
                        else:
                            snippet = content[:100]

                        results.append({
                            "title": title,
                            "obj_token": obj_token,
                            "node_token": node_token,
                            "snippet": snippet,
                        })
                except Exception:
                    pass

            # 3. 如果有子节点，递归搜索
            if has_child and space_id:
                try:
                    child_nodes = await _list_wiki_child_nodes(token, space_id, node_token)
                    for child in child_nodes:
                        if len(results) >= max_results:
                            break
                        await search_node(child.get("node_token"), depth + 1)
                except Exception:
                    pass

        except Exception:
            pass

    # 从根节点开始搜索
    await search_node(wiki_token)
    return json.dumps(results, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    import asyncio

    if len(sys.argv) > 1:
        test_token = sys.argv[1]
        print(f"测试读取文档: {test_token}")

        async def test():
            auth = await get_tenant_auth()
            content = await _get_document_raw_content(auth, test_token)
            print(f"文档内容长度: {len(content)} 字符")
            print(f"内容预览: {content[:200]}...")

        asyncio.run(test())
    else:
        print(f"启动 MCP 服务器: {config['server']['host']}:{config['server']['port']}")
        mcp.run(transport="sse")
