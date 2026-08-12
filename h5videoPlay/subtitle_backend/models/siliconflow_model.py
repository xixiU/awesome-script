#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
硅基流动 (SiliconFlow) 语音转文字模型实现 - 使用OpenAI兼容API
"""
import time
import logging
import io
import requests
from typing import Optional, Tuple
import numpy as np
import soundfile as sf

from .base_model import BaseSpeechToTextModel

logger = logging.getLogger(__name__)

#https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions
class SiliconFlowSTTModel(BaseSpeechToTextModel):
    """硅基流动语音转文字模型 - OpenAI兼容API"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.api_key = config.get('api_key', '')
        # 使用OpenAI兼容的API端点
        self.base_url = config.get('base_url', 'https://api.siliconflow.cn/v1')
        self.api_url = f"{self.base_url}/audio/transcriptions"
        # 硅基流动支持的模型ID，可根据实际调整,支持FunAudioLLM/SenseVoiceSmall，TeleAI/TeleSpeechASR
        self.model_id = config.get('model_id', 'FunAudioLLM/SenseVoiceSmall')
        self.timeout = config.get('timeout', 30)
        self._initialized = False
    
    def initialize(self):
        """初始化模型（API模型无需本地加载）"""
        if not self.api_key:
            raise ValueError("硅基流动 API Key 未配置")
        
        # 测试API连接
        try:
            logger.info(f"🔗 [硅基流动] 测试API连接: {self.api_url}")
            logger.info(f"🔗 [硅基流动] 使用模型: {self.model_id}")
            self._initialized = True
            logger.info("✅ [硅基流动] 模型初始化成功")
        except Exception as e:
            logger.error(f"❌ [硅基流动] 初始化失败: {e}")
            raise
    
    def _audio_to_wav_bytes(self, audio_data: np.ndarray, sample_rate: int = 16000) -> bytes:
        """将音频数据转换为WAV格式的字节流"""
        # 确保音频数据是float32格式，范围在[-1, 1]
        if audio_data.dtype != np.float32:
            audio_data = audio_data.astype(np.float32)
        
        # 归一化到[-1, 1]范围
        if len(audio_data) > 0:
            max_val = np.max(np.abs(audio_data))
            if max_val > 1.0:
                audio_data = audio_data / max_val
        
        # 转换为WAV格式的字节流
        buffer = io.BytesIO()
        sf.write(buffer, audio_data, sample_rate, format='WAV', subtype='PCM_16')
        buffer.seek(0)
        return buffer.read()
    
    def transcribe(
        self,
        audio_data: np.ndarray,
        sample_rate: int = 16000,
        language: Optional[str] = None,
        prompt: str = ""
    ) -> Tuple[Optional[str], Optional[str], float]:
        """转录音频数据 - 使用OpenAI兼容的multipart/form-data格式"""
        if not self._initialized:
            logger.error("[硅基流动] 模型未初始化")
            return None, None, 0.0
        
        t0 = time.time()
        try:
            # 将音频转换为WAV字节流
            audio_bytes = self._audio_to_wav_bytes(audio_data, sample_rate)
            
            # 构建请求 - 使用multipart/form-data格式（OpenAI兼容）
            headers = {
                "Authorization": f"Bearer {self.api_key}"
            }
            
            # 准备multipart/form-data数据
            files = {
                'file': ('audio.wav', audio_bytes, 'audio/wav')
            }
            
            data = {
                'model': self.model_id,
                'response_format': 'json'
            }

            # 添加可选参数
            if language and language != "auto":
                data['language'] = language

            if prompt:
                data['prompt'] = prompt

            # 记录实际传给 API 的参数
            logger.debug(f"[硅基流动] 传入 language={data.get('language', 'None(自动检测)')}, prompt={prompt[:30] if prompt else 'None'}")

            # 发送请求
            audio_duration = len(audio_data) / sample_rate
            logger.info(f"📡 [硅基流动] 发送请求... (音频: {audio_duration:.2f}s)")
            
            response = requests.post(
                self.api_url,
                headers=headers,
                files=files,
                data=data,
                timeout=self.timeout
            )
            
            response.raise_for_status()
            result = response.json()
            #logger.warning(f"👂 [硅基流动] 原始响应: {result}")
            
            cost = time.time() - t0
            
            # 硅基流动返回格式：{"text": "..."}
            text = result.get('text', '') 
            detected_lang = result.get('language', language) if language else result.get('language', 'auto')
            
            if text:
                logger.info(f"👂 [硅基流动] 原文 [{detected_lang}][{cost:.2f}s]: {text}")
                return text.strip(), detected_lang, cost
            else:
                logger.warning(f"⚠️ [硅基流动] 未识别到文本")
                return None, detected_lang, cost
                
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ [硅基流动] API请求失败: {e}")
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_detail = e.response.json()
                    logger.error(f"错误详情: {error_detail}")
                except:
                    logger.error(f"响应内容: {e.response.text}")
            return None, None, time.time() - t0
        except Exception as e:
            logger.error(f"❌ [硅基流动] 处理错误: {e}")
            return None, None, time.time() - t0
    
    def is_available(self) -> bool:
        """检查模型是否可用"""
        return self._initialized and bool(self.api_key)
    
    def cleanup(self):
        """清理资源"""
        self._initialized = False

