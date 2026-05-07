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


# --- MCP 工具 ---

@mcp.tool()
async def get_document_content(file_id: str) -> str:
    """获取飞书文档的原始文本内容。
    参数:
        file_id: 飞书文档 ID，从文档 URL 中提取
    """
    token = await get_tenant_auth()
    url = f"{URL_PREFIX}/open-apis/docx/v1/documents/{file_id}/raw_content"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        response = await client.get(url, headers=_make_headers(token))
        response.encoding = 'utf-8'
        return response.text


@mcp.tool()
async def search_all_docs(
    keyword: str,
    count: int = 20,
    offset: int = 0,
    docs_types: list = None,
) -> str:
    """全局搜索所有有权限的飞书云文档（包括 docx、sheet、知识库等）。
    无需指定 wiki_token，会搜索当前应用有权限访问的所有文档。

    参数:
        keyword: 搜索关键词
        count: 返回结果数量（默认 20，范围 [0, 50]）
        offset: 分页偏移量（默认 0，offset + count < 200）
        docs_types: 文档类型过滤（可选），如 ['docx', 'doc', 'sheet', 'bitable', 'mindnote', 'file']
    返回:
        匹配的文档列表，包含 docs_token、docs_type、title、owner_id
    """
    token = await get_tenant_auth()
    url = f"{URL_PREFIX}/open-apis/suite/docs-api/search/object"
    body = {
        "search_key": keyword,
        "count": min(max(count, 1), 50),
        "offset": offset,
    }
    if docs_types:
        body["docs_types"] = docs_types

    async with httpx.AsyncClient(verify=certifi.where(), timeout=15.0) as client:
        resp = await client.post(url, headers=_make_headers(token), json=body)
        resp.raise_for_status()
        data = resp.json().get("data", {})

    return json.dumps({
        "total": data.get("total", 0),
        "has_more": data.get("has_more", False),
        "docs": data.get("docs_entities", []),
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def list_drive_folder(folder_token: str = None) -> str:
    """列出云空间文件夹中的文件和子文件夹。

    参数:
        folder_token: 文件夹 token（从云空间 URL 中提取，如 /drive/folder/xxx）
                     不填则列出根目录
    返回:
        文件夹内的文件列表，包含 token、type、name、owner_id 等信息
    """
    token = await get_tenant_auth()
    url = f"{URL_PREFIX}/open-apis/drive/v1/files"
    params = {"page_size": 200}
    if folder_token:
        params["folder_token"] = folder_token

    async with httpx.AsyncClient(verify=certifi.where(), timeout=15.0) as client:
        # Drive API 返回的是 files 而不是 items，需要特殊处理
        files = []
        while True:
            resp = await client.get(url, headers=_make_headers(token), params=params)
            resp.raise_for_status()
            data = resp.json().get("data", {})
            files.extend(data.get("files") or [])
            if not data.get("has_more"):
                break
            params["page_token"] = data.get("page_token")

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
async def list_wiki_spaces() -> str:
    """列出当前应用可访问的所有知识库(Wiki)空间。
    返回每个知识库的 space_id、名称、描述等信息。
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
async def get_wiki_node_info(wiki_token: str) -> str:
    """通过 wiki_token 获取知识库节点信息（包括 space_id）。
    参数:
        wiki_token: 知识库节点 token，从知识库 URL 中提取
                   例如: https://xxx.feishu.cn/wiki/C5RNwyHtWikA4LkBN9trd4u8zFd
                   wiki_token 为: C5RNwyHtWikA4LkBN9trd4u8zFd
    """
    token = await get_tenant_auth()
    url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/get_node"
    params = {"token": wiki_token}
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        resp = await client.get(url, headers=_make_headers(token), params=params)
        resp.raise_for_status()
        node = resp.json().get("data", {}).get("node", {})
    return json.dumps({
        "node_token": node.get("node_token"),
        "space_id": node.get("space_id"),
        "obj_token": node.get("obj_token"),
        "obj_type": node.get("obj_type"),
        "title": node.get("title"),
        "has_child": node.get("has_child"),
        "parent_node_token": node.get("parent_node_token"),
    }, ensure_ascii=False, indent=2)


@mcp.tool()
async def list_wiki_nodes(wiki_token: str) -> str:
    """列出知识库节点的子节点。
    参数:
        wiki_token: 父节点的 wiki_token（从知识库 URL 或 get_wiki_node_info 获取）
    """
    token = await get_tenant_auth()

    # 1. 先获取节点信息，得到 space_id
    node_url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/get_node"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        resp = await client.get(node_url, headers=_make_headers(token), params={"token": wiki_token})
        resp.raise_for_status()
        node_info = resp.json().get("data", {}).get("node", {})

    space_id = node_info.get("space_id")
    if not space_id:
        return json.dumps({"error": "无法获取 space_id"}, ensure_ascii=False)

    # 2. 用 space_id + wiki_token 作为 parent_node_token 获取子节点
    nodes_url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/{space_id}/nodes"
    params = {"page_size": 50, "parent_node_token": wiki_token}

    async with httpx.AsyncClient(verify=certifi.where()) as client:
        nodes = await _get_all_pages(client, nodes_url, _make_headers(token), params)

    results = []
    for n in nodes:
        results.append({
            "node_token": n.get("node_token"),
            "obj_token": n.get("obj_token"),
            "obj_type": n.get("obj_type"),
            "title": n.get("title"),
            "has_child": n.get("has_child"),
            "parent_node_token": n.get("parent_node_token"),
        })
    return json.dumps(results, ensure_ascii=False, indent=2)


@mcp.tool()
async def search_wiki_by_keyword(wiki_token: str, keyword: str, max_results: int = 10) -> str:
    """在知识库中递归搜索包含关键词的文档。
    参数:
        wiki_token: 知识库根节点的 wiki_token（从知识库 URL 中提取）
        keyword: 搜索关键词
        max_results: 最多返回结果数（默认 10）
    返回:
        匹配的文档列表，包含标题、obj_token 和匹配的内容片段
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
            node_url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/get_node"
            async with httpx.AsyncClient(verify=certifi.where(), timeout=10.0) as client:
                resp = await client.get(node_url, headers=_make_headers(token), params={"token": node_token})
                resp.raise_for_status()
                node_info = resp.json().get("data", {}).get("node", {})

            obj_type = node_info.get("obj_type")
            obj_token = node_info.get("obj_token")
            title = node_info.get("title", "")
            space_id = node_info.get("space_id")
            has_child = node_info.get("has_child")

            # 2. 如果是文档，检查是否匹配关键词
            if obj_type == "docx":
                try:
                    doc_url = f"{URL_PREFIX}/open-apis/docx/v1/documents/{obj_token}/raw_content"
                    async with httpx.AsyncClient(verify=certifi.where(), timeout=10.0) as client:
                        resp = await client.get(doc_url, headers=_make_headers(token))
                        resp.raise_for_status()
                        content = resp.json().get("data", {}).get("content", "")

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
                    nodes_url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/{space_id}/nodes"
                    params = {"page_size": 50, "parent_node_token": node_token}
                    async with httpx.AsyncClient(verify=certifi.where(), timeout=10.0) as client:
                        child_nodes = await _get_all_pages(client, nodes_url, _make_headers(token), params)

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


@mcp.tool()
async def get_wiki_document_full_content(obj_token: str) -> str:
    """获取知识库文档的完整内容。
    参数:
        obj_token: 文档的 obj_token（从 list_wiki_nodes 或 search_wiki_by_keyword 获取）
    """
    token = await get_tenant_auth()
    url = f"{URL_PREFIX}/open-apis/docx/v1/documents/{obj_token}/raw_content"
    async with httpx.AsyncClient(verify=certifi.where()) as client:
        response = await client.get(url, headers=_make_headers(token))
        response.raise_for_status()
        return response.json().get("data", {}).get("content", "")


# --- 统一工具（推荐使用） ---

@mcp.tool()
async def list_children(token: str, type: str = "auto") -> str:
    """列出目录/节点下的子内容（自动识别知识库或云空间）。

    参数:
        token: 知识库 wiki_token（如 /wiki/xxx 中的 xxx）
               或云空间 folder_token（如 /drive/folder/xxx 中的 xxx）
        type: 类型提示
              - "wiki": 知识库节点
              - "drive": 云空间文件夹
              - "auto"（默认）: 自动识别，先尝试知识库，失败后尝试云空间
    返回:
        子节点/文件列表（JSON 格式）
    """
    auth_token = await get_tenant_auth()

    # 尝试知识库
    if type in ("wiki", "auto"):
        try:
            node_url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/get_node"
            async with httpx.AsyncClient(verify=certifi.where(), timeout=10.0) as client:
                resp = await client.get(node_url, headers=_make_headers(auth_token), params={"token": token})
                resp.raise_for_status()
                node_info = resp.json().get("data", {}).get("node", {})

            space_id = node_info.get("space_id")
            if space_id:
                nodes_url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/{space_id}/nodes"
                params = {"page_size": 50, "parent_node_token": token}
                async with httpx.AsyncClient(verify=certifi.where(), timeout=10.0) as client:
                    nodes = await _get_all_pages(client, nodes_url, _make_headers(auth_token), params)

                results = []
                for n in nodes:
                    results.append({
                        "token": n.get("node_token"),
                        "name": n.get("title"),
                        "type": n.get("obj_type"),
                        "has_child": n.get("has_child"),
                        "obj_token": n.get("obj_token"),
                        "source": "wiki",
                    })
                return json.dumps(results, ensure_ascii=False, indent=2)
        except Exception:
            if type == "wiki":
                raise

    # 尝试云空间
    if type in ("drive", "auto"):
        url = f"{URL_PREFIX}/open-apis/drive/v1/files"
        params = {"page_size": 200, "folder_token": token}
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

        results = []
        for f in files:
            results.append({
                "token": f.get("token"),
                "name": f.get("name"),
                "type": f.get("type"),
                "has_child": f.get("type") == "folder",
                "obj_token": f.get("token"),
                "source": "drive",
            })
        return json.dumps(results, ensure_ascii=False, indent=2)

    return json.dumps({"error": "无法识别 token 类型"}, ensure_ascii=False)


@mcp.tool()
async def read_document(token: str) -> str:
    """读取文档内容（统一入口，支持知识库文档和云空间文档）。

    参数:
        token: 文档 token，支持以下格式：
               - obj_token/file_id: 直接读取（如 doxrzXXX）
               - wiki_token: 知识库节点 token（如 CQv6wuy5qiNGVIkyaetrbzOrzdf）
                            会自动获取其 obj_token 后读取
    返回:
        文档的纯文本内容
    """
    auth_token = await get_tenant_auth()

    # 先尝试直接读取（假设是 obj_token）
    url = f"{URL_PREFIX}/open-apis/docx/v1/documents/{token}/raw_content"
    async with httpx.AsyncClient(verify=certifi.where(), timeout=10.0) as client:
        resp = await client.get(url, headers=_make_headers(auth_token))

        # 如果成功，直接返回
        if resp.status_code == 200:
            data = resp.json().get("data", {})
            return data.get("content", resp.text)

        # 如果 404，尝试作为 wiki_token 处理
        if resp.status_code == 404:
            try:
                # 获取 wiki 节点信息
                node_url = f"{URL_PREFIX}/open-apis/wiki/v2/spaces/get_node"
                resp2 = await client.get(node_url, headers=_make_headers(auth_token), params={"token": token})
                resp2.raise_for_status()
                node = resp2.json().get("data", {}).get("node", {})
                obj_token = node.get("obj_token")

                if obj_token:
                    # 用 obj_token 读取文档
                    doc_url = f"{URL_PREFIX}/open-apis/docx/v1/documents/{obj_token}/raw_content"
                    resp3 = await client.get(doc_url, headers=_make_headers(auth_token))
                    resp3.raise_for_status()
                    data = resp3.json().get("data", {})
                    return data.get("content", resp3.text)
            except Exception:
                pass

        # 其他错误，抛出
        resp.raise_for_status()


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
