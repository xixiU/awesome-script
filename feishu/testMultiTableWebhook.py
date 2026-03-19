#!/usr/bin/env python
# -*- coding: utf-8 -*-
'''
@File    :   testMultiTableWebhook.py
@Date    :   2026/03/18 16:22:17
@Author  :   yuan 
@Desc    :   需要开通bitable,drive:drive, drive:drive:readonly权限
'''
import logging
import requests
from flask import Flask, request, jsonify
from config import URL_PREFIX,payload

app = Flask(__name__)

# 配置日志
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# 创建一个全局 Session，禁用系统代理环境变量，规避 TUN 模式干扰
session = requests.Session()
session.trust_env = False

def get_tenant_access_token():
    """获取飞书内部应用的鉴权 Token"""
    url = f"{URL_PREFIX}/open-apis/auth/v3/tenant_access_token/internal"
    try:
        # 显式禁用 proxies 以防万一
        r = session.post(url, json=payload, proxies={"http": None, "https": None})
        r.raise_for_status()
        return r.json().get("tenant_access_token")
    except Exception as e:
        logging.error(f"❌ 获取 Token 失败: {e}")
        return None



def get_download_url(file_token):
    """根据 File Token 下载文件并计算大小"""
    token = get_tenant_access_token()
    if not token:
        return "Auth Error"

    # 飞书多维表格附件下载接口
    # url = f"{URL_PREFIX}/open-apis/drive/v1/files/{file_token}/download"
    headers = {"Authorization": f"Bearer {token}"}

    url = f"{URL_PREFIX}/open-apis/drive/v1/medias/batch_get_tmp_download_url"

    params = {"file_tokens":file_token}
    resp = requests.get(url, headers=headers,params = params)
    data = resp.json()
    print(f"下载地址: {resp.text}")
    return data['data']

@app.route('/webhook', methods=['POST'])
def handle_feishu_webhook():
    """接收多维表格自动化推送的接口"""
    data = request.json
    if not data:
        return jsonify({"code": 1, "msg": "no data"}), 400

    # 提取多维表格推送的字段内容
    # 提醒：请确保在多维表格自动化配置中，JSON 键名与此处一致
    fields = data.get('fields', {})
    
    region = fields.get('regin', '未知区域')
    code = fields.get('projectCode', '无编码')
    file_id = fields.get('file') # 对应你在自动化配置里引用的“附件 ID”

    logging.info(f"🔔 接收到新增记录 -> 区域: {region} | 编码: {code}")
    print(file_id)
    if file_id:
        logging.info(f"正在分析文件 ID: {file_id} ...")
        file_size = get_download_url(file_id)
        logging.info(f"✅ 处理完成！地址: {file_size}")
    else:
        logging.warning("⚠️ 未发现文件 ID，请检查多维表格自动化中的 JSON 配置。")

    return jsonify({"code": 0, "msg": "success"}), 200

if __name__ == '__main__':
    # 启动 Flask，监听 5000 端口
    app.run(host='0.0.0.0', port=8080, debug=True)