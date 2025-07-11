from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

# 替换为你自己的 Dify API 地址和 KEY
DIFY_API_URL = "https://dify.iflytek.com/v1/chat-messages"
DIFY_API_KEY = "Bearer app-XjUXoBgiKFCrK4KEISRthwDj"  # ⚠️ 请妥善保管，勿暴露给前端！

@app.route("/proxy/dify", methods=["POST"])
def proxy_dify():
    try:
        headers = {
            "Authorization": DIFY_API_KEY,
            "Content-Type": "application/json"
        }

        resp = requests.post(DIFY_API_URL, headers=headers, json=request.get_json(), timeout=10)
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005, debug=True)
