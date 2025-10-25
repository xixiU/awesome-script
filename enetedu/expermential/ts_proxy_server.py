#!/usr/bin/env python3
"""
TS 文件代理服务器
提供本地 TS 文件服务，减少网络流量
使用方法：python ts_proxy_server.py
"""
from flask import Flask, send_file, Response
from flask_cors import CORS
import os
import re

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# TS 文件路径（优先使用 1秒短视频，降低内存占用）
BASE_DIR = os.path.dirname(__file__)
TS_FILES = {
    'short': os.path.join(BASE_DIR, 'small-1seconds.ts'),  # 1秒短视频（推荐）
    'long': os.path.join(BASE_DIR, 'example.ts')            # 完整视频（备用）
}

# 选择使用的 TS 文件（优先使用短视频）
ACTIVE_TS_FILE = None
for key in ['short', 'long']:
    if os.path.exists(TS_FILES[key]):
        ACTIVE_TS_FILE = TS_FILES[key]
        print(f"✓ 使用 TS 文件: {os.path.basename(ACTIVE_TS_FILE)} ({os.path.getsize(ACTIVE_TS_FILE)} 字节)")
        break

@app.route('/ts/<path:filename>')
def serve_ts(filename):
    """
    提供 TS 文件服务
    
    HLS 播放器工作原理：
    1. 加载 m3u8 播放列表，包含多个 TS 片段的 URL
    2. 每个 TS 片段对应视频的一个时间段（如 0-10s, 10-20s...）
    3. 播放器按顺序请求这些片段并连续播放
    
    我们的策略：
    - 所有 TS 请求都返回同一个短视频片段（1秒）
    - 播放器会认为在正常加载和播放
    - 时间轴可以正常推进，进度上报也能正常工作
    """
    try:
        if not ACTIVE_TS_FILE or not os.path.exists(ACTIVE_TS_FILE):
            return Response("TS file not found", status=404)
        
        # 从文件名中提取时间信息（如果有）
        # 例如: start_0-end_10000-record.gv.ts
        time_match = re.search(r'start_(\d+)-end_(\d+)', filename)
        if time_match:
            start_time = int(time_match.group(1))
            end_time = int(time_match.group(2))
            duration = end_time - start_time
            print(f"[请求] {filename} | 时间段: {start_time}ms - {end_time}ms (时长: {duration}ms)")
        else:
            print(f"[请求] {filename}")
        
        # 返回固定的 TS 文件
        return send_file(
            ACTIVE_TS_FILE,
            mimetype='video/mp2t',  # MPEG-TS MIME type
            as_attachment=False,
            download_name=filename,
            max_age=3600  # 缓存1小时
        )
    except Exception as e:
        print(f"[错误] 处理请求失败: {str(e)}")
        return Response(f"Error: {str(e)}", status=500)

@app.route('/health')
def health_check():
    """健康检查接口"""
    return {
        'status': 'ok', 
        'ts_file': os.path.basename(ACTIVE_TS_FILE) if ACTIVE_TS_FILE else None,
        'ts_file_exists': os.path.exists(ACTIVE_TS_FILE) if ACTIVE_TS_FILE else False,
        'ts_file_size': os.path.getsize(ACTIVE_TS_FILE) if ACTIVE_TS_FILE and os.path.exists(ACTIVE_TS_FILE) else 0
    }

if __name__ == '__main__':
    print("\n" + "="*50)
    print("   TS 代理服务器")
    print("="*50)
    
    if not ACTIVE_TS_FILE:
        print("\n❌ 错误: 未找到任何 TS 文件")
        print("请确保以下文件之一存在:")
        print("  - small-1seconds.ts (推荐，1秒短视频)")
        print("  - example.ts (备用，完整视频)")
        exit(1)
    
    print(f"\n✓ 监听地址: http://127.0.0.1:8888")
    print(f"✓ 健康检查: http://127.0.0.1:8888/health")
    print("\n💡 工作原理:")
    print("  - 拦截浏览器的 TS 文件请求")
    print("  - 所有请求返回同一个短视频片段")
    print("  - 播放器正常播放，时间轴正常推进")
    print("  - 流量消耗大幅降低（99%+）")
    print("\n按 Ctrl+C 停止服务器\n")
    print("="*50 + "\n")
    
    app.run(host='127.0.0.1', port=8888, debug=False, threaded=True)

