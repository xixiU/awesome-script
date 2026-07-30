#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MLX-Whisper 模型实现（Apple Silicon GPU 加速）

faster-whisper 基于 CTranslate2，在 macOS 上无 Metal 后端，只能跑 CPU。
本实现基于 Apple 官方 MLX 框架，直接使用 M 系列芯片的 GPU，
相比 faster-whisper CPU 有数倍提速，适合 Apple Silicon 上的实时字幕。
"""
import time
import logging
from typing import Optional, Tuple
import numpy as np

import mlx_whisper

from .base_model import BaseSpeechToTextModel

logger = logging.getLogger(__name__)

# distil-large-v3 的 MLX 权重（英语最佳，实测多语言也可出结果）
DEFAULT_MLX_REPO = "mlx-community/distil-whisper-large-v3"


class MLXWhisperSTTModel(BaseSpeechToTextModel):
    """基于 Apple MLX 的 Whisper 语音转文字模型（跑 Apple GPU）"""

    def __init__(self, config: dict):
        super().__init__(config)
        # model_size 在此充当 HF 仓库 ID（mlx-community/...）
        self.repo = config.get('model_size') or config.get('repo') or DEFAULT_MLX_REPO
        self._initialized = False

    def initialize(self):
        """初始化：mlx-whisper 首次 transcribe 时自动下载并缓存模型，这里仅做标记。"""
        try:
            logger.info(f"⚙️ [MLX-Whisper] 使用模型: {self.repo}（Apple GPU）")
            self._initialized = True
            logger.info("✅ [MLX-Whisper] 就绪（模型将在首次识别时加载/下载）")
        except Exception as e:
            logger.error(f"❌ [MLX-Whisper] 初始化失败: {e}")
            raise

    def transcribe(
        self,
        audio_data: np.ndarray,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        prompt: str = ""
    ) -> Tuple[Optional[str], Optional[str], float]:
        """转录音频数据"""
        if not self._initialized:
            logger.error("[MLX-Whisper] 模型未初始化")
            return None, None, 0.0

        t0 = time.time()
        try:
            # mlx-whisper 需要 float32、单声道、[-1,1] 的一维数组，采样率 16k
            audio = np.asarray(audio_data, dtype=np.float32).flatten()

            kwargs = {
                "path_or_hf_repo": self.repo,
                # 贪心解码，最快；实时字幕够用
                "temperature": 0,
            }
            if language and language != "auto":
                kwargs["language"] = language
            if prompt:
                kwargs["initial_prompt"] = prompt

            result = mlx_whisper.transcribe(audio, **kwargs)

            text = (result.get("text") or "").strip()
            detected_lang = result.get("language", language or "auto")
            cost = time.time() - t0

            if text:
                logger.info(f"👂 [MLX-Whisper] 原文 [{detected_lang}][{cost:.2f}s]: {text}")
                return text, detected_lang, cost
            return None, detected_lang, cost
        except Exception as e:
            logger.error(f"❌ [MLX-Whisper] 推理错误: {e}")
            return None, None, time.time() - t0

    def is_available(self) -> bool:
        return self._initialized

    def cleanup(self):
        self._initialized = False
