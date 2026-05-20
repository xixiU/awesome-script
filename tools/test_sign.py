import hmac, hashlib, time, urllib.parse

SECRET_KEY = "Iflytek@zhft"

def fz_sign(timestamp: str, secret_key: str) -> str:
    payload = (timestamp + secret_key).encode("utf-8")
    return hmac.new(secret_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()

ts = str(int(time.time() * 1000))
sg = fz_sign(ts, SECRET_KEY)

# HTTP
# import requests
# resp = requests.post(
#     "https://hktestservice.iflysec.com/ts-service/internet/fz",
#     params={"timestamp": ts, "sign": sg},
#     json={"orgCode": "O", "courtCode": "C", "trialCode": "T"},
#     timeout=5,
# )
# print(resp.status_code, resp.text)

# WebSocket（websocket-client）
# import websocket
# ws_url = f"wss://hktestservice.iflysec.com/ts-service/control?orgCode=O&courtCode=C&timestamp={ts}&sign={sg}"
# ws = websocket.create_connection(ws_url)