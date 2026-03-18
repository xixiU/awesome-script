import requests
from config import URL_PREFIX,payload


APP_TOKEN = "basrzK2AfEBf18oK1bsBHXxic5c" # https://xxx.feishu.cn/base/BASCNxxxxxx...

def test_connection():
    # 1. 获取 Token
    auth_url = f"{URL_PREFIX}/open-apis/auth/v3/tenant_access_token/internal"
    resp = requests.post(auth_url, json=payload)
    print(resp.json())
    token_res = resp.json()
    token = token_res.get("tenant_access_token")
    
    # 2. 获取表格元数据
    meta_url = f"{URL_PREFIX}/open-apis/bitable/v1/apps/{APP_TOKEN}"
    headers = {"Authorization": f"Bearer {token}"}
    res = requests.get(meta_url, headers=headers).json()
    print(res)
    if res.get("code") == 0:
        print(f"✅ 绑定成功！表格名称: {res.get('data', {}).get('app', {}).get('name')}")
    else:
        print(f"❌ 绑定失败，错误码: {res.get('code')}, 错误信息: {res.get('msg')}")

test_connection()