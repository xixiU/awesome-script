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
import json
app = Flask(__name__)

# 替换为你自己的 Dify API 地址和 KEY
DIFY_API_URL = "https://dify.iflytek.com/v1/chat-messages"
DIFY_API_KEY = os.getenv("DIFY_API_KEY", "")  # ⚠️ 请妥善保管，勿暴露给前端！
if not len(DIFY_API_KEY):
    SystemExit("请配置DIFY_API_KEY")

headers = {
            "Authorization": DIFY_API_KEY,
            "Content-Type": "application/json"
        }
@app.route("/proxy/dify", methods=["POST"])
def proxy_dify():
    try:
        

        resp = requests.post(DIFY_API_URL, headers=headers, json=request.get_json(), timeout=10)
        print(resp.json()['answer'])
        return resp.json(), resp.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def test():
    data = {
        "inputs":{ "role": "科大讯飞公司的规章制度专家", "ability": "保密" },
        "query": """{ "题型": "单选题", "题目": "1. 违反《中华人民共和国保守国家秘密法》的规定，（ ）泄露国家秘密，情节严重的，依照刑法有关规定追究刑事责任。", "选项": [ "A. 故意", "B. 故意或过失", "C. 过失" ] }""",
        "response_mode": "blocking",
        "conversation_id": "",
        "user": "test-123"
    }

    response = requests.post(DIFY_API_URL, headers=headers, data=json.dumps(data))
    print(response.json()['answer'])

    return 
if __name__ == "__main__":
    # test()
    app.run(host="0.0.0.0", port=5005, debug=True)
