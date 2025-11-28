#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Faster-Whisper 模型实现
"""
import time
import logging
import platform
from typing import Optional, Tuple
import numpy as np
from faster_whisper import WhisperModel

from .base_model import BaseSpeechToTextModel

logger = logging.getLogger(__name__)


class WhisperSTTModel(BaseSpeechToTextModel):
    """Faster-Whisper 语音转文字模型"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.model_size = config.get('model_size', 'small')
        self.device = config.get('device', 'cpu')
        self.compute_type = config.get('compute_type', 'int8')
        self.cpu_threads = config.get('cpu_threads', 4)
        self.model: Optional[WhisperModel] = None
    
    def initialize(self):
        """初始化 Whisper 模型"""
        try:
            # 自动检测设备配置
            system = platform.system()
            if system == "Darwin":
                if self.model_size == "auto":
                    self.model_size = "small"
            elif system == "Windows":
                if self._check_cuda():
                    self.device = "cuda"
                    self.compute_type = "float16"
                    self.cpu_threads = 0
                    if self.model_size == "auto":
                        self.model_size = "deepdml/faster-whisper-large-v3-turbo-ct2"
                else:
                    if self.model_size == "auto":
                        self.model_size = "small"
            elif system == 'Linux':
                self.device = "cuda"
                self.compute_type = "int8"
                if self.model_size == "auto":
                    self.model_size = "small"
            
            logger.info(f"⚙️ [Whisper] 加载模型: {self.model_size} | {self.device} | {self.compute_type}")
            
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=self.cpu_threads,
                num_workers=1
            )
            logger.info("✅ [Whisper] 模型加载成功")
        except Exception as e:
            logger.error(f"❌ [Whisper] 模型加载失败: {e}")
            raise
    
    def _check_cuda(self):
        """检查 CUDA 是否可用"""
        try:
            import ctypes
            ctypes.cdll.LoadLibrary('nvcuda.dll')
            return True
        except:
            return False
    
    def transcribe(
        self,
        audio_data: np.ndarray,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        prompt: str = ""
    ) -> Tuple[Optional[str], Optional[str], float]:
        """转录音频数据"""
        if not self.model:
            logger.error("[Whisper] 模型未初始化")
            return None, None, 0.0
        
        t0 = time.time()
        try:
            segments, info = self.model.transcribe(
                audio_data,
                beam_size=1,
                best_of=1,
                temperature=0,
                language=language,
                initial_prompt=prompt,
                vad_filter=False,
                vad_parameters=dict(
                    threshold=0.3,
                    min_silence_duration_ms=500,
                    speech_pad_ms=400
                ),
                condition_on_previous_text=False
            )
            text = " ".join([s.text.strip() for s in segments])
            cost = time.time() - t0
            
            if text:
                logger.info(f"👂 [Whisper] 原文 [{info.language}][{cost:.2f}s]: {text}")
                return text, info.language, cost
            return None, None, cost
        except Exception as e:
            logger.error(f"❌ [Whisper] 推理错误: {e}")
            return None, None, time.time() - t0
    
    def is_available(self) -> bool:
        """检查模型是否可用"""
        return self.model is not None
    
    def cleanup(self):
        """清理资源"""
        self.model = None

