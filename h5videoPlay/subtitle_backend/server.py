#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
视频实时字幕翻译服务
使用 faster-whisper 进行语音识别，支持多语言翻译
"""

import os
import json
import asyncio
import tempfile
import logging
from typing import Optional, List, Dict
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from faster_whisper import WhisperModel
from deep_translator import GoogleTranslator
import numpy as np

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(title="视频字幕翻译服务", version="1.0.0")

# 配置 CORS - 允许所有来源（油猴脚本需要）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境建议限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量
whisper_model: Optional[WhisperModel] = None
translator_cache: Dict[str, GoogleTranslator] = {}


class SubtitleService:
    """字幕服务类"""
    
    def __init__(self, model_size: str = "distil-large-v3"):
        """
        初始化字幕服务
        
        Args:
            model_size: Whisper模型大小 (tiny, base, small, medium, large)
        """
        self.model_size = model_size
        self.model = None
        self.temp_dir = tempfile.gettempdir()
        
    def initialize(self):
        """初始化 Whisper 模型"""
        try:
            logger.info(f"正在加载 Whisper 模型: {self.model_size}")
            # 使用 CPU，如果有 GPU 可以改为 "cuda"
            self.model = WhisperModel(
                self.model_size,
                # device="cpu",
                #compute_type="int8"  # 使用 int8 量化以提高速度
            )
            logger.info("Whisper 模型加载成功")
        except Exception as e:
            logger.error(f"模型加载失败: {e}")
            raise
    
    async def transcribe_audio(
        self,
        audio_file_path: str,
        language: Optional[str] = None
    ) -> List[Dict]:
        """
        转录音频文件
        
        Args:
            audio_file_path: 音频文件路径
            language: 源语言代码（如 en, zh, ja 等）
            
        Returns:
            字幕列表，每个字幕包含开始时间、结束时间和文本
        """
        try:
            if not self.model:
                raise RuntimeError("Whisper 模型未初始化")
            
            logger.info(f"开始转录音频: {audio_file_path}")
            
            # 使用 faster-whisper 进行转录
            segments, info = self.model.transcribe(
                audio_file_path,
                language=language,
                beam_size=5,
                vad_filter=True,  # 使用 VAD 过滤
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=400
                )
            )
            
            logger.info(f"检测到语言: {info.language} (概率: {info.language_probability:.2f})")
            
            # 转换为字幕格式
            subtitles = []
            for segment in segments:
                subtitles.append({
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "language": info.language
                })
            
            logger.info(f"转录完成，共 {len(subtitles)} 个字幕片段")
            return subtitles
            
        except Exception as e:
            logger.error(f"转录失败: {e}")
            raise
    
    async def translate_text(
        self,
        text: str,
        target_lang: str,
        source_lang: str = "auto"
    ) -> str:
        """
        翻译文本
        
        Args:
            text: 要翻译的文本
            target_lang: 目标语言
            source_lang: 源语言
            
        Returns:
            翻译后的文本
        """
        try:
            # 语言代码映射（Google Translator 使用的代码）
            lang_map = {
                "zh": "zh-CN",
                "zh-cn": "zh-CN",
                "zh-tw": "zh-TW",
                "chinese": "zh-CN",
                "中文": "zh-CN"
            }
            
            target_lang = lang_map.get(target_lang.lower(), target_lang)
            
            # 创建或获取缓存的翻译器
            cache_key = f"{source_lang}_{target_lang}"
            if cache_key not in translator_cache:
                translator_cache[cache_key] = GoogleTranslator(
                    source=source_lang,
                    target=target_lang
                )
            
            translator = translator_cache[cache_key]
            translated = translator.translate(text)
            
            return translated
            
        except Exception as e:
            logger.warning(f"翻译失败，返回原文: {e}")
            return text
    
    async def translate_subtitles(
        self,
        subtitles: List[Dict],
        target_lang: str
    ) -> List[Dict]:
        """
        翻译字幕列表
        
        Args:
            subtitles: 字幕列表
            target_lang: 目标语言
            
        Returns:
            翻译后的字幕列表
        """
        translated_subtitles = []
        
        for subtitle in subtitles:
            source_lang = subtitle.get("language", "auto")
            translated_text = await self.translate_text(
                subtitle["text"],
                target_lang,
                source_lang
            )
            
            translated_subtitles.append({
                **subtitle,
                "translated_text": translated_text,
                "original_text": subtitle["text"],
                "text": translated_text  # 覆盖原文
            })
        
        return translated_subtitles


# 初始化服务
subtitle_service = SubtitleService(model_size="distil-large-v3")


@app.on_event("startup")
async def startup_event():
    """应用启动时初始化"""
    logger.info("正在启动字幕翻译服务...")
    subtitle_service.initialize()
    logger.info("字幕翻译服务启动成功")


@app.get("/")
async def root():
    """根路径"""
    return {
        "service": "视频字幕翻译服务",
        "version": "1.0.0",
        "status": "running",
        "model": subtitle_service.model_size
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "model_loaded": subtitle_service.model is not None
    }


@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = Form(None),
    translate_to: Optional[str] = Form(None)
):
    """
    转录音频文件并可选地翻译
    
    Args:
        file: 音频文件（支持 mp3, wav, m4a, webm 等）
        language: 源语言代码（可选，自动检测）
        translate_to: 目标翻译语言（可选）
        
    Returns:
        字幕数据
    """
    temp_file = None
    
    try:
        # 保存上传的文件到临时目录
        suffix = Path(file.filename).suffix
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        
        # 异步写入文件
        content = await file.read()
        temp_file.write(content)
        temp_file.close()
        
        logger.info(f"接收到音频文件: {file.filename} ({len(content)} bytes)")
        
        # 转录音频
        subtitles = await subtitle_service.transcribe_audio(
            temp_file.name,
            language=language
        )
        
        # 如果指定了翻译语言，进行翻译
        if translate_to:
            logger.info(f"翻译字幕到: {translate_to}")
            subtitles = await subtitle_service.translate_subtitles(
                subtitles,
                translate_to
            )
        
        return JSONResponse(content={
            "success": True,
            "subtitles": subtitles,
            "count": len(subtitles),
            "translated": bool(translate_to)
        })
        
    except Exception as e:
        logger.error(f"处理请求失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # 清理临时文件
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
            except Exception as e:
                logger.warning(f"清理临时文件失败: {e}")


@app.post("/translate")
async def translate_text(
    text: str = Form(...),
    target_lang: str = Form("zh-CN"),
    source_lang: str = Form("auto")
):
    """
    翻译文本
    
    Args:
        text: 要翻译的文本
        target_lang: 目标语言
        source_lang: 源语言（默认自动检测）
        
    Returns:
        翻译结果
    """
    try:
        translated = await subtitle_service.translate_text(
            text,
            target_lang,
            source_lang
        )
        
        return JSONResponse(content={
            "success": True,
            "original": text,
            "translated": translated,
            "source_lang": source_lang,
            "target_lang": target_lang
        })
        
    except Exception as e:
        logger.error(f"翻译失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/languages")
async def get_supported_languages():
    """获取支持的语言列表"""
    languages = {
        "zh-CN": "简体中文",
        "zh-TW": "繁体中文",
        "en": "英语",
        "ja": "日语",
        "ko": "韩语",
        "fr": "法语",
        "de": "德语",
        "es": "西班牙语",
        "ru": "俄语",
        "ar": "阿拉伯语",
        "pt": "葡萄牙语",
        "it": "意大利语"
    }
    
    return JSONResponse(content={
        "languages": languages
    })


if __name__ == "__main__":
    # 启动服务器
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8765,
        log_level="info"
    )

