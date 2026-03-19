import sys
import requests
from pathlib import Path

# 将父目录加入路径，以便导入共用 config.py
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import URL_PREFIX, payload

APP_TOKEN = "basrzK2AfEBf18oK1bsBHXxic5c"
TABLE_ID = 'tblHn6kBKkWgQGfu'

def get_tenant_access_token():
    auth_url = f"{URL_PREFIX}/open-apis/auth/v3/tenant_access_token/internal"
    resp = requests.post(auth_url, json=payload)
    print(resp.text)
    return resp.json().get("tenant_access_token")

token = get_tenant_access_token()
headers = {"Authorization": f"Bearer {token}"}

def test_connection():
    meta_url = f"{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}"
    res = requests.get(meta_url, headers=headers).json()
    print(res)
    if res.get("code") == 0:
        print(f"✅ 绑定成功！表格名称: {res.get('data', {}).get('app', {}).get('name')}")
    else:
        print(f"❌ 绑定失败，错误码: {res.get('code')}, 错误信息: {res.get('msg')}")

def get_fields():
    """查询表格字段列表"""
    url = f"{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/fields"
    resp = requests.get(url, headers=headers)
    res = resp.json()
    if res.get("code") == 0:
        fields = res["data"]["items"]
        print("✅ 表格字段列表:")
        for f in fields:
            print(f"  - {f['field_name']} (type: {f['type']})")
        return fields
    else:
        print(f"❌ 获取字段失败: {res}")
        return []



    url = f"{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}/roles"
    resp = requests.get(url, headers=headers)
    print(f"多维表格的角色: {resp.json()}")
    return resp.json()

def download_file(file_token, file_name):
    url = f"{URL_PREFIX}/open-apis/drive/v1/medias/{file_token}/download"
    resp = requests.get(url, headers=headers)
    with open(file_name, "wb") as f:
        f.write(resp.content)
    print(f"下载完成: {file_name}")

def download_file_by_link(file_link, file_name):
    resp = requests.get(file_link, headers=headers)
    with open(file_name, "wb") as f:
        f.write(resp.content)
    print(f"下载完成: {file_name}")

def get_file_download_url(file_token):
    url = f"{URL_PREFIX}/open-apis/drive/v1/medias/batch_get_tmp_download_url"
    params = {"file_tokens": file_token}
    resp = requests.get(url, headers=headers, params=params)
    print(f"下载地址: {resp.text}")

def create_table(name='默认多维表格'):
    url = f"{URL_PREFIX}/open-apis/bitable/v1/apps"
    resp = requests.post(url, headers=headers, json={"name": name})
    print(f"创建多维表格: {resp.text}")

def query_user_id():
    url = f"{URL_PREFIX}/open-apis/contact/v3/users/batch_get_id"
    data = {
        "emails": ["rjyuan2@iflytek.comm"],
        "mobiles": ["13877909302"],
        "include_resigned": True
    }
    resp = requests.post(url, headers=headers, json=data)
    print(f"查询用户id: {resp.text}")

"""
@description: https://open.feishu.cn/document/docs/bitable-v1/faq
你需通过多维表格页面右上方 「...」 -> 「...更多」 ->「添加文档应用」 入口为应用添加可管理权限。
"""
def query_record():
    record_url = f'{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records'
    resp = requests.get(record_url, headers=headers)
    print(resp.text)
    res = resp.json()
    if res.get("code") == 0:
        print(f"✅ 获取表格记录: {res.get('data', {}).get('app', {}).get('name')}")
    else:
        print(f"❌ 查询表格记录失败，错误码: {res.get('code')}, 错误信息: {res.get('msg')}")


def search_records(filter_field: str = None, filter_value: str = None, page_size: int = 20):
    """根据条件查询多维表格记录

    Args:
        filter_field: 过滤字段名，如 "项目编码"，为 None 时查询所有记录
        filter_value: 过滤字段值，如 "PRJ-001"
        page_size: 每页返回记录数，最大 500

    Example:
        search_records()                                    # 查询所有记录
        search_records("项目编码", "PRJ-001")               # 按项目编码查询
        search_records("区域", "北京市")                    # 按区域查询
    """
    url = f"{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records/search"
    body = {"page_size": page_size}

    if filter_field and filter_value:
        body["filter"] = {
            "conjunction": "and",
            "conditions": [
                {
                    "field_name": filter_field,
                    "operator": "is",
                    "value": [filter_value],
                }
            ],
        }

    resp = requests.post(url, headers=headers, json=body)
    res = resp.json()
    if res.get("code") == 0:
        items = res["data"]["items"]
        total = res["data"].get("total", len(items))
        print(f"✅ 查询成功，共 {total} 条记录:")
        for item in items:
            print(f"  record_id: {item['record_id']} | fields: {item['fields']}")
        return items
    else:
        print(f"❌ 查询失败: {res}")
        return []



def upload_file(file_path):
    """上传文件到多维表格，返回 file_token"""
    file_path = Path(file_path)
    file_size = file_path.stat().st_size

    url = f"{URL_PREFIX}/open-apis/drive/v1/medias/upload_all"
    with open(file_path, "rb") as f:
        resp = requests.post(
            url,
            headers={"Authorization": headers["Authorization"]},
            data={
                "file_name": file_path.name,
                "parent_type": "bitable_file",
                "parent_node": APP_TOKEN,
                "size": str(file_size),
            },
            files={"file": (file_path.name, f)},
        )
    res = resp.json()
    if res.get("code") == 0:
        file_token = res["data"]["file_token"]
        print(f"✅ 文件上传成功，file_token: {file_token}")
        return file_token
    else:
        print(f"❌ 文件上传失败: {res}")
        return None


def create_record_with_file(fields: dict, file_path: str):
    """新增多维表格记录，并附带上传文件

    Args:
        fields: 记录字段，如 {"标题": "测试", "区域": "华东"}
        file_path: 本地文件路径，附件字段名固定为 "附件"

    Example:
        create_record_with_file(
            fields={"标题": "测试记录", "项目编码": "PRJ-001"},
            file_path="入库模板.xlsx"
        )
    """
    # 1. 上传文件
    file_token = upload_file(file_path)
    if not file_token:
        print("❌ 文件上传失败，取消新增记录")
        return None

    # 2. 新增记录，附件字段格式为 [{"file_token": "xxx"}]
    fields["附件"] = [{"file_token": file_token}]
    url = f"{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records"
    resp = requests.post(url, headers=headers, json={"fields": fields})
    res = resp.json()
    if res.get("code") == 0:
        record_id = res["data"]["record"]["record_id"]
        print(f"✅ 记录新增成功，record_id: {record_id}")
        return record_id
    else:
        print(f"❌ 记录新增失败: {res}")
        return None


if __name__ == "__main__":
    # 查询表格字段名
    # get_fields()
#     表格字段列表:
#   - 自动编号 (type: 1005)
#   - 项目编码 (type: 1)
#   - 区域 (type: 3)
#   - 提交时间 (type: 1001)
#   - 提交人 (type: 1003)
#   - 附件 (type: 17)
#   - 文本 2 (type: 1)

    # 新增记录并上传文件（区域为单选，填写选项文字；附件字段名固定为"附件"）
    # create_record_with_file(
    #     fields={"项目编码": "PRJ-003", "区域": "北京市", "文本 2": "测试备注"},
    #     file_path="入库模板.xlsx"
    # )
    # 按字段条件查询
    search_records("项目编码", "PRJ-003")