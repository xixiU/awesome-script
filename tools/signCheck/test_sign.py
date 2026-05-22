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
    return parsed.path or "/"


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


def test_api_sign(url: str, method: str = "GET", body=None, token: str = ""):
    """
    通用接口签名测试。打印签名细节、可重放的 curl 命令、HTTP 响应。
    用 curl 命令再跑一遍可验证 nonce 防重放（第二次应返回 401 "签名已使用"）。
    """
    import requests

    sign_headers = build_api_sign_headers(url, method)
    path = extract_path(url)

    req_headers = dict(sign_headers)
    if token:
        req_headers["Authorization"] = "Bearer " + token

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
    ts = str(int(time.time() * 1000))
    sg = fz_sign(ts, SECRET_KEY)
    import requests
    resp = requests.post(
        "https://hktestservice.iflysec.com/ts-service/internet/fz",
        params={"timestamp": ts, "sign": sg},
        json={"orgCode": "O", "courtCode": "C", "trialCode": "T"},
        timeout=5,
    )
    print(resp.status_code, resp.text)


if __name__ == "__main__":
    # ============== 通用接口签名测试（自己改 URL / METHOD / BODY / TOKEN） ==============
    test_api_sign(
        url="https://hktestservice.iflysec.com/ts-service/internet/meet/getMeetingType",
        method="GET",
        body=None,
        token="",
    )

    # test_fz_sign()

    # WebSocket（websocket-client）
    # import websocket
    # ws_url = f"wss://hktestservice.iflysec.com/ts-service/control?orgCode=O&courtCode=C&timestamp={ts}&sign={sg}"
    # ws = websocket.create_connection(ws_url)
