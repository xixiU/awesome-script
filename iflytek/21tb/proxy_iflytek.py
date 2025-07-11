#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
@File    :   proxy_iflytek.py
@Date    :   2025/07/11 11:24:59
@Author  :   yuan 
@Desc    :   转发dify流量，避免api泄露与前端检测
'''
from flask import Flask, request, jsonify
import requests
import os
app = Flask(__name__)

# 替换为你自己的 Dify API 地址和 KEY
DIFY_API_URL = "https://dify.iflytek.com/v1/chat-messages"
DIFY_API_KEY = os.getenv("DIFY_API_KEY", "")  # ⚠️ 请妥善保管，勿暴露给前端！
if not len(DIFY_API_KEY):
    SystemExit("请配置DIFY_API_KEY")
@app.route("/proxy/dify", methods=["POST"])
def proxy_dify():
    try:
        headers = {
            "Authorization": DIFY_API_KEY,
            "Content-Type": "application/json"
        }

        resp = requests.post(DIFY_API_URL, headers=headers, json=request.get_json(), timeout=10)
        print(resp.json())
        return resp.json(), resp.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005, debug=True)
