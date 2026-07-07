import hmac, hashlib, time, urllib.parse, urllib.request, urllib.error, uuid as _uuid, json, os, shlex, base64, ssl
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
# 内外网转发专用密钥（服务间认证），对应后端 security.transfer.secret-key
# 与 api_sign_secret_key 隔离；本地配置未填时用后端默认值兜底
TRANSFER_SECRET_KEY = _conf.get("transfer_secret_key", "iflytek#transfer@2026")


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


# ============== 内外网文件传递测试 ==============
# 对应后端 com.iflytek.icourt.internet.transfer.service.TransferSendService#uploadFile(String, byte[])
# 协议要点（客户端逐块上传，服务端 append 落盘）：
#   1. 将文件字节按 file.size.send（默认 1048576）拆分成多块
#   2. 每块封装成 RequestFileVo(url, fileName, base64, times, currentSize,
#      transferredSize, totalSize, isEnd)，base64 为本块字节的 base64
#   3. POST 到 /ts-service/internet/transfer/file
#   4. 首块 url 为空 -> 服务端 initAppend 新建文件并返回落盘 path；
#      后续块携带上一次返回的 path 作为 url -> 服务端 append 续写
#   5. 最后一块 isEnd=true，服务端打印“文件上传完成”
#
# 【鉴权要点】外网环境 InternetGatewayInterceptor 会拦截 /internet/transfer/**，
#   必须携带 Transfer 专用认证头，否则返回 {"msg":"缺少转发认证参数","success":"1"}：
#       X-Transfer-Auth = HmacSHA256(timestamp + transferSecretKey, key=transferSecretKey) 小写hex
#       X-Transfer-Ts   = timestamp（毫秒）
#   timestamp 需在时间窗口内（security.idor.sign-window-seconds，默认 600s）。
#   与业务签名 X-Sign 三件套相互独立，此处只需 Transfer 认证头。

def build_transfer_auth_headers(secret_key: str = None) -> dict:
    """构造内外网转发专用认证头（对应后端 TransferSendService#addTransferAuthHeaders）。"""
    if secret_key is None:
        secret_key = TRANSFER_SECRET_KEY
    timestamp = str(int(time.time() * 1000))
    auth = hmac.new(
        secret_key.encode("utf-8"),
        (timestamp + secret_key).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {
        "X-Transfer-Auth": auth,
        "X-Transfer-Ts": timestamp,
    }


def _http_post_json(url: str, headers: dict, body: dict, timeout: int = 30):
    """标准库 urllib 发 POST JSON 请求，返回 (status_code, body_text)。

    内网无法安装 requests，改用 urllib。HTTPS 默认不校验证书（测试环境自签名/内网证书常见）。
    """
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)

    # 测试脚本：忽略证书校验，避免内网自签名证书报错
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return resp.getcode(), resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        # 非 2xx 会走这里（如 401/403/429），仍读取 body 便于查看错误信息
        return e.code, e.read().decode("utf-8", errors="replace")


def _split_bytes(data: bytes, size: int):
    """字节数组按 size 拆分，等价于后端 splitBytes。"""
    if not data:
        return [b""]
    return [data[i:i + size] for i in range(0, len(data), size)]


def test_transfer_file(
    file_path: str = None,
    file_name: str = None,
    file_bytes: bytes = None,
    chunk_size: int = 1048576,
    host_prefix: str = None,
):
    """
    内外网文件传递测试：模拟 TransferSendService#uploadFile 的逐块上传流程。

    参数：
        file_path:   本地文件路径（读取其字节上传）。与 file_bytes 二选一。
        file_name:   上传使用的文件名；不传时取 file_path 的文件名。
                     后端逻辑：文件名无扩展名时会自动补 ".doc"。
        file_bytes:  直接指定要上传的字节（用于构造测试数据）。
        chunk_size:  每块大小，对应后端 file.size.send（默认 1048576）。
        host_prefix: 服务地址前缀；不传则用 __main__ 中的 HOST_PREFIX。

    返回：
        服务端最终返回的文件落盘 path（字符串）。
    """
    # 仅用标准库 urllib，内网无法安装 requests 时可直接运行

    prefix = host_prefix if host_prefix is not None else HOST_PREFIX
    url = f"{prefix}/ts-service/internet/transfer/file"

    # 准备文件字节与文件名
    if file_bytes is None:
        if file_path is None:
            raise ValueError("file_path 与 file_bytes 至少提供一个")
        with open(file_path, "rb") as f:
            file_bytes = f.read()
        if file_name is None:
            file_name = os.path.basename(file_path)
    if file_name is None:
        file_name = "test_transfer.doc"

    # 与后端一致：文件名无扩展名时补 .doc
    if "." not in file_name:
        file_name += ".doc"

    total_size = len(file_bytes)
    chunks = _split_bytes(file_bytes, chunk_size)

    print("=== 内外网文件传递测试 ===")
    print(f"URL        : {url}")
    print(f"fileName   : {file_name}")
    print(f"totalSize  : {total_size} bytes")
    print(f"chunkSize  : {chunk_size} bytes")
    print(f"chunks     : {len(chunks)}")
    print()

    current_url = ""          # 服务端返回的落盘 path，首块为空
    transferred = 0           # 已传输大小
    result_path = ""

    for index, chunk in enumerate(chunks):
        transferred += len(chunk)
        is_end = index == len(chunks) - 1
        request_file_vo = {
            "url": current_url,
            "fileName": file_name,
            "base64": base64.b64encode(chunk).decode("ascii"),
            "times": index + 1,
            "currentSize": len(chunk),
            "transferredSize": transferred,
            "totalSize": total_size,
            "isEnd": is_end,
        }

        # 每块都重新生成认证头（时间戳需在窗口内，大文件多块耗时久时避免整体过期）
        headers = {"Content-Type": "application/json;charset=UTF-8"}
        headers.update(build_transfer_auth_headers())

        status_code, body_text = _http_post_json(url, headers, request_file_vo)

        print(f"--- 第 {index + 1}/{len(chunks)} 块 (currentSize={len(chunk)}, "
              f"transferred={transferred}/{total_size}, isEnd={is_end}) ---")
        print(f"status: {status_code}")
        print(f"body  : {body_text[:500]}")

        if status_code != 200:
            print("!! 上传中断：非 200 响应")
            break

        try:
            data = json.loads(body_text).get("data")
        except Exception:
            print("!! 响应无法解析为 JSON，上传中断")
            break

        if data:
            current_url = str(data)
            result_path = current_url
        print()

    print("=== 文件传递完成 ===")
    print(f"最终落盘 path: {result_path}")
    return result_path


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
    # 广东
    # HOST_PREFIX = 'https://wxkt.hqcourt.gov.cn:18686/'
    # 湖南
    # HOST_PREFIX = 'https://zhft.iflysec.com/hnfy'
    # 吉林
    # HOST_PREFIX = 'https://xfrh-jlfy.e-court.gov.cn:8866/'
    
    # 成都
    # HOST_PREFIX = 'https://zhft.iflysec.com/scmz'

    # 武汉高新
    # HOST_PREFIX = 'http://zhft.iflysec.com/whdx'
    # 湖南长沙
    # HOST_PREFIX = 'http://zhft.iflysec.com/hncs'
    # 天津武清
    HOST_PREFIX= 'https://wqzyserver.iflysec.com'
    # 研发环境
    # HOST_PREFIX = 'https://hktestservice.iflysec.com'
    # 测试环境
    # HOST_PREFIX = 'https://ys-slfdfs.iflysec.com'

    TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxNTgyNjc5Nzg1NSIsImlzcyI6IklGTFlURUstWkZCRyIsImV4cCI6MTc4Mzk1NjU5MywiaWF0IjoxNzgzOTEzMzkzLCJ1c2VySWQiOiIxNTgyNjc5Nzg1NSJ9.E3CX6dbW6qNzbTm5cCdGwCeBYo8Rd_-LU3by-e7I3UA'
    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/matreial/sign/info?ah=(2025)川0703民初7897979号&trialNum=1",
    #     method="GET",
    #     token=TOKEN
    # )
    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/dossier/5327",
    #     method="POST",
    #     token=TOKEN
    # )
    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/mobile/list",
    #     method="POST",
    #     body={"pageNumber":1,"pageSize":10,"mobile":"13111111111"},
    #     token=TOKEN
    # )
    
    # test_fz_sign()

    # ============== 内外网文件传递测试 ==============
    # 方式一：上传本地文件
    test_transfer_file(file_path=r"C:\Users\rjyuan2\Downloads\二维码.png")
    #
    # 方式二：直接构造字节（会自动分块，构造大于 chunk_size 的数据可测试多块场景）
    # test_transfer_file(
    #     file_bytes=b"hello inner-outer net transfer" * 100000,
    #     file_name="mock_test",   # 无扩展名会自动补 .doc
    #     chunk_size=1048576,
    # )

    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/sign/qrcodeAuth/55910306/646206/2",
    #     method="GET",
    #     token=HOST_PREFIX
    # )
    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/asyncMessage/sendMessage",
    #     method="POST",
    #     body={"asyncPqxxId":338,"message":"1111","userId":"13111111112"},
    #     token=HOST_PREFIX
    # )
    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/asyncMessage/uploadCross",
    #     method="POST",
    #     body={"type":"1","userId":"13111111112","asyncPqxxId":'aaa',"fileList":[{"fdfsUrl":"https://hktestservice.iflysec.com/","fileName":"jackMa.jpg","fileUrl":"group1/M00/91/6B/rB1kimpCbISAKM-nAAEZs-FCseg263.jpg"}],"evidenceSources":"111","evidencePurpose":"1111"},
    #     token=TOKEN
    # )

    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/async/case/intoAsyncCross/338/13111111112",
    #     method="GET",
    #     token=HOST_PREFIX
    # )
    # ============== 测试 /av/network/status 接口（模拟小程序请求）==============
    # test_api_sign(
    #     url="/ts-service/internet/av/network/status",
    #     method="POST",
    #     body={
    #         "networkStatus": 3,
    #         "trialCode": trial_code,
    #         "deviceId": device_id,
    #     },
    #     token=HOST_PREFIX,
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
    #     extra_headers={
    #         "terminalType": "4",
    #         "roleId": "TEST123",
    #         "deviceType": "wechat_applet",
    #     }
    # )

    # test_api_sign(
    #     url=f"{HOST_PREFIX}/ts-service/internet/voice/info/612429",
    #     method="GET",
    #     token="your_token_here",
    #     extra_headers={
    #         "terminalType": "4",
    #         "roleId": "TEST123",
    #         "deviceType": "wechat_applet",
    #     }
    # )

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
