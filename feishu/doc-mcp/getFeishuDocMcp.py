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
