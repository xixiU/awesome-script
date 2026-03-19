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

def get_roles():
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


query_record()
get_file_download_url("boxrzW8SYPhdJsFl00XGjAOuYBg")
