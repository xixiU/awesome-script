#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
字幕服务控制器
提供 HTTP API 来启动/停止系统音频字幕服务
"""

import os
import sys
import subprocess
import signal
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(title="字幕服务控制器", version="1.0.0")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量：存储子进程
subtitle_process: Optional[subprocess.Popen] = None


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": "字幕服务控制器",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/status")
async def get_status():
    """获取服务状态"""
    is_running = subtitle_process is not None and subtitle_process.poll() is None
    return {
        "running": is_running,
        "pid": subtitle_process.pid if is_running else None
    }


@app.post("/start")
async def start_service(target_lang: str = "zh-CN", model: str = "base"):
    """启动字幕服务"""
    global subtitle_process
    
    # 检查是否已在运行
    if subtitle_process is not None and subtitle_process.poll() is None:
        return JSONResponse(content={
            "success": False,
            "message": "服务已在运行",
            "pid": subtitle_process.pid
        })
    
    try:
        # 获取脚本目录
        script_dir = Path(__file__).parent
        subtitle_script = script_dir / "system_audio_subtitle.py"
        
        if not subtitle_script.exists():
            raise HTTPException(
                status_code=404,
                detail=f"字幕服务脚本不存在: {subtitle_script}"
            )
        
        # 启动服务
        logger.info(f"启动字幕服务，目标语言: {target_lang}, 模型: {model}")
        subtitle_process = subprocess.Popen(
            [
                sys.executable,
                str(subtitle_script),
                "--target-lang", target_lang,
                "--model", model
            ],
            cwd=str(script_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        logger.info(f"字幕服务已启动，PID: {subtitle_process.pid}")
        
        return JSONResponse(content={
            "success": True,
            "message": "服务已启动",
            "pid": subtitle_process.pid
        })
        
    except Exception as e:
        logger.error(f"启动服务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/stop")
async def stop_service():
    """停止字幕服务"""
    global subtitle_process
    
    if subtitle_process is None or subtitle_process.poll() is not None:
        return JSONResponse(content={
            "success": False,
            "message": "服务未运行"
        })
    
    try:
        pid = subtitle_process.pid
        logger.info(f"停止字幕服务，PID: {pid}")
        
        # 发送终止信号
        if sys.platform == "win32":
            subtitle_process.terminate()
        else:
            subtitle_process.send_signal(signal.SIGTERM)
        
        # 等待进程结束（最多5秒）
        try:
            subtitle_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            # 强制终止
            logger.warning("服务未响应，强制终止")
            subtitle_process.kill()
            subtitle_process.wait()
        
        subtitle_process = None
        
        logger.info("字幕服务已停止")
        
        return JSONResponse(content={
            "success": True,
            "message": "服务已停止",
            "pid": pid
        })
        
    except Exception as e:
        logger.error(f"停止服务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # 启动控制器服务
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8766,  # 使用不同的端口，避免冲突
        log_level="info"
    )

