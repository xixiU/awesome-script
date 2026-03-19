import requests
from config import URL_PREFIX,payload


APP_TOKEN = "basrzK2AfEBf18oK1bsBHXxic5c" # https://xxx.feishu.cn/base/BASCNxxxxxx...
TABLE_ID = 'tblHn6kBKkWgQGfu'
# APP_TOKEN = 'basrzRSkFwyeVSTSF6FASwlwyMb'

def get_tenant_access_token():
    # 1. 获取 Token
    auth_url = f"{URL_PREFIX}/open-apis/auth/v3/tenant_access_token/internal"
    resp = requests.post(auth_url, json=payload)
    print(resp.json())
    token_res = resp.json()
    token = token_res.get("tenant_access_token")
    return token

token = get_tenant_access_token()
headers = {"Authorization": f"Bearer {token}"}

def test_connection():
    
    # 2. 获取表格元数据
    meta_url = f"{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}"
    res = requests.get(meta_url, headers=headers).json()
    print(res)
    if res.get("code") == 0:
        print(f"✅ 绑定成功！表格名称: {res.get('data', {}).get('app', {}).get('name')}")
    else:
        print(f"❌ 绑定失败，错误码: {res.get('code')}, 错误信息: {res.get('msg')}")


# 获取多维表格的角色
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

    params = {"file_tokens":file_token}
    resp = requests.get(url, headers=headers,params = params)

    print(f"下载地址: {resp.text}")

def create_table(name = '默认多维表格'):
    url = f"{URL_PREFIX}/open-apis/bitable/v1/apps"

    data = {"name":name}
    resp = requests.post(url, headers=headers,json=data)

    print(f"创建多维表格: {resp.text}")


# 查询用户id
def query_User_id():
    url = f"{URL_PREFIX}/open-apis/contact/v3/users/batch_get_id"

    data = {
            "emails": [
        "rjyuan2@iflytek.comm"
            ],
            "mobiles": [
        "13877909302"
            ],
        "include_resigned":True
        }
    resp = requests.post(url, headers=headers,json=data)

    print(f"查询用户id: {resp.text}")

"""
@description  :https://open.feishu.cn/document/docs/bitable-v1/faq 
你需通过多维表格页面右上方 「...」 -> 「...更多」 ->「添加文档应用」 入口为应用添加可管理权限。
---------
@param  :
-------
@Returns  :
-------
"""
def query_record():
    # 获取表格记录
    record_url = f'{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/records'
    resp = requests.get(record_url, headers=headers)
    print(resp.text)
    res = resp.json()
    if res.get("code") == 0:
        print(f"✅ 获取表格记录: {res.get('data', {}).get('app', {}).get('name')}")
    else:
        print(f"❌ 查询表格记录失败，错误码: {res.get('code')}, 错误信息: {res.get('msg')}")


query_record()
# download_file_by_link("https://open.xfchat.iflytek.com/open-apis/drive/v1/medias/boxrzqi9eb9NPASEz4SGOOqyxBh/download?extra=%7B%22bitablePerm%22%3A%7B%22tableId%22%3A%22tblHn6kBKkWgQGfu%22%2C%22rev%22%3A76%7D%7D",'入库模板.xlsx')
get_file_download_url("boxrzW8SYPhdJsFl00XGjAOuYBg")
# test_connection()
# create_table()
# query_User_id() 7507499360804930421