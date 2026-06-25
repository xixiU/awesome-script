import hmac, hashlib, time, urllib.parse, uuid as _uuid, json, os, shlex
from pathlib import Path

# ============== 密钥从本地配置文件读取（git ignored） ==============
_CONFIG_PATH = Path(__file__).with_name("test_sign.local.json")
_EXAMPLE_PATH = Path(__file__).with_name("test_sign.local.example.json")

if not _CONFIG_PATH.exists():
    raise FileNotFoundError(
        f"未找到本地密钥配置 {_CONFIG_PATH}，请参考 {_EXAMPLE_PATH} 创建并填入真实密钥"
    )

with _CONFIG_PATH.open("r", encoding="utf-8") as f:
    _conf = json.load(f)

SECRET_KEY = _conf["fz_secret_key"]
API_SIGN_SECRET_KEY = _conf["api_sign_secret_key"]


def fz_sign(timestamp: str, secret_key: str) -> str:
    payload = (timestamp + secret_key).encode("utf-8")
    return hmac.new(secret_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def gen_nonce() -> str:
    """32 位大写 hex（UUID 去 -）"""
    return _uuid.uuid4().hex.upper()


def extract_path(url: str) -> str:
    """从完整 URL 提取 path（与后端 request.getRequestURI() 一致，含 /ts-service 前缀，去 query）"""
    parsed = urllib.parse.urlsplit(url)
    path = parsed.path or "/"
    # 剥离网关路由前缀，提取从 /ts-service 开始的路径
    if "/ts-service" in path:
        path = "/ts-service" + path.split("/ts-service", 1)[1]
    return path


def api_sign(nonce: str, method: str, path: str, timestamp: str, secret_key: str) -> str:
    """
    通用接口签名公式：
        sign = HmacSHA256(uuid + METHOD + path + timestamp + secretKey, key=secretKey).toLowerCase()
    """
    raw = nonce + method.upper() + path + timestamp + secret_key
    return hmac.new(
        secret_key.encode("utf-8"),
        raw.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_api_sign_headers(url: str, method: str, secret_key: str = None):
    """给定完整 URL 和 method，返回需要带的签名 Header 三件套。"""
    if secret_key is None:
        secret_key = API_SIGN_SECRET_KEY
    nonce = gen_nonce()
    timestamp = str(int(time.time() * 1000))
    path = extract_path(url)
    sign = api_sign(nonce, method, path, timestamp, secret_key)
    return {
        "X-Sign": sign,
        "X-Timestamp": timestamp,
        "X-Sign-Param": nonce,
    }


def build_curl(url: str, method: str, headers: dict, body=None) -> str:
    """根据 url/method/headers/body 拼出可直接复制到终端跑的 curl 命令（用于重放测试）"""
    parts = ["curl", "-i", "-X", method.upper()]
    for k, v in headers.items():
        parts += ["-H", f"{k}: {v}"]
    if body is not None and method.upper() != "GET":
        parts += ["-H", "Content-Type: application/json;charset=UTF-8"]
        parts += ["--data-raw", json.dumps(body, ensure_ascii=False)]
    parts.append(url)
    return " ".join(shlex.quote(p) for p in parts)


def test_api_sign(url: str, method: str = "GET", body=None, token: str = "", extra_headers: dict = None):
    """
    通用接口签名测试。打印签名细节、可重放的 curl 命令、HTTP 响应。
    用 curl 命令再跑一遍可验证 nonce 防重放（第二次应返回 401 "签名已使用"）。

    参数：
        url: 完整请求 URL
        method: HTTP 方法（GET/POST/PUT/DELETE）
        body: 请求体（dict，会自动转 JSON）
        token: JWT token（自动加 Bearer 前缀）
        extra_headers: 额外的业务 headers（如 terminalType, roleId, deviceId, deviceType 等）

    示例：
        # 模拟小程序请求
        test_api_sign(
            url="https://xxx/ts-service/internet/av/network/status",
            method="POST",
            body={"networkStatus": 3, "trialCode": "TEST123", "deviceId": "xxx"},
            token="eyJ0eXAi...",
            extra_headers={
                "terminalType": "4",
                "roleId": "TEST123",
                "trialCode": "TEST123",
                "deviceId": "xxx",
                "deviceType": "wechat_applet"
            }
        )
    """
    import requests

    sign_headers = build_api_sign_headers(url, method)
    path = extract_path(url)

    req_headers = dict(sign_headers)
    if token:
        req_headers["Authorization"] = "Bearer " + token
    if extra_headers:
        req_headers.update(extra_headers)

    print("=== 签名计算 ===")
    print(f"URL       : {url}")
    print(f"METHOD    : {method.upper()}")
    print(f"path      : {path}")
    print(f"X-Sign-Param (uuid): {sign_headers['X-Sign-Param']}")
    print(f"X-Timestamp        : {sign_headers['X-Timestamp']}")
    print(f"X-Sign             : {sign_headers['X-Sign']}")
    print(
        f"raw to sign        : "
        f"{sign_headers['X-Sign-Param']}{method.upper()}{path}"
        f"{sign_headers['X-Timestamp']}{API_SIGN_SECRET_KEY}"
    )
    print()

    if extra_headers:
        print("=== 额外业务 Headers ===")
        for k, v in extra_headers.items():
            print(f"{k}: {v}")
        print()

    print("=== 重放测试 curl（连续跑两次，第二次应 401 nonce 已使用）===")
    print(build_curl(url, method, req_headers, body))
    print()

    if method.upper() == "GET":
        resp = requests.get(url, headers=req_headers, timeout=10)
    else:
        resp = requests.request(
            method,
            url,
            headers={**req_headers, "Content-Type": "application/json;charset=UTF-8"},
            json=body,
            timeout=10,
        )

    print("=== HTTP 响应（脚本本次发出的请求）===")
    print(f"status: {resp.status_code}")
    print(f"body  : {resp.text[:500]}")
    return resp


# ============== 法正接口签名测试（保留原逻辑） ==============

def test_fz_sign():
    print('法正接口测试')
    ts = str(int(time.time() * 1000))
    sg = fz_sign(ts, SECRET_KEY) 
    import requests
    fz_url = f"{HOST_PREFIX}/ts-service/internet/fz"
    resp = requests.post(
        fz_url,
        # "https://hktestservice.iflysec.com/ts-service/internet/fz",
        # "http://172.31.243.225:9797/ts-service/internet/fz",

        params={"timestamp": ts, "sign": sg},
        json={"courtCode":"dierting","orgCode":"I14","trialCode":"134137"},
        timeout=5,
    )
    print({"url":fz_url,"timestamp": ts, "sign": sg})
    print(resp.status_code, resp.text)


if __name__ == "__main__":
    device_id = gen_nonce()  # 生成设备 UUID
    trial_code = "TEST123"   # 替换为真实庭审码
    # 湖南
    # HOST_PREFIX = 'https://zhft.iflysec.com/hnfy'
    # 吉林
    # HOST_PREFIX = 'https://xfrh-jlfy.e-court.gov.cn:8866/'
    
    # 成都
    # HOST_PREFIX = 'https://zhft.iflysec.com/scdy'

    # 武汉高新
    # HOST_PREFIX = 'http://zhft.iflysec.com/whdx'
    # 湖南长沙
    # HOST_PREFIX = 'http://zhft.iflysec.com/hncs'
    # 天津武清
    HOST_PREFIX= 'https://wqzyserver.iflysec.com'
    # 研发环境
    # HOST_PREFIX = 'https://hktestservice.iflysec.com'

    test_fz_sign()
    # ============== 测试 /av/network/status 接口（模拟小程序请求）==============
    # test_api_sign(
    #     url="/ts-service/internet/av/network/status",
    #     method="POST",
    #     body={
    #         "networkStatus": 3,
    #         "trialCode": trial_code,
    #         "deviceId": device_id,
    #     },
    #     token="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMzUzODI2NDI1MyIsImlzcyI6IklGTFlURUstWkZCRyIsImV4cCI6MTc3OTg4ODM5MywiaWF0IjoxNzc5ODQ1MTkzLCJ1c2VySWQiOiIxMzUzODI2NDI1MyJ9.ap5k8VkkPgCTn_i6a2JEYVk8xc3mFb0U-_0DW25msWE",
    #     extra_headers={
    #         "terminalType": "4",
    #         "roleId": trial_code.upper(),
    #         "trialCode": trial_code,
    #         "deviceId": device_id,
    #         "deviceType": "wechat_applet",
    #     }
    # )

    # ============== 其他接口测试示例 ==============
    # 测试获取会议类型（GET 请求）
    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/meet/getMeetingType",
    #     method="GET",
    #     token="your_token_here",
    #     extra_headers={
    #         "terminalType": "4",
    #         "roleId": "TEST123",
    #         "deviceType": "wechat_applet",
    #     }
    # )

    test_api_sign(
        url=f"{HOST_PREFIX}/ts-service/internet/voice/info/612429",
        method="GET",
        token="your_token_here",
        extra_headers={
            "terminalType": "4",
            "roleId": "TEST123",
            "deviceType": "wechat_applet",
        }
    )

    # 测试短信发送
    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/mobile/getCode/13877909302;19072972843;13877909302/1",
    #     method="GET"
    # )

    # 测试法正接口（旧逻辑）
    # test_fz_sign()

    # WebSocket 测试（需要 websocket-client 库）
    # import websocket
    # ts = str(int(time.time() * 1000))
    # sg = fz_sign(ts, SECRET_KEY)
    # ws_url = f"wss://hktestservice.iflysec.com/ts-service/control?orgCode=O&courtCode=C&timestamp={ts}&sign={sg}"
    # ws = websocket.create_connection(ws_url)
