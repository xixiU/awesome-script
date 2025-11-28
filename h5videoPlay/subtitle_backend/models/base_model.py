#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
语音转文字模型抽象基类
"""
from abc import ABC, abstractmethod
from typing import Optional, Tuple
import numpy as np


class BaseSpeechToTextModel(ABC):
    """语音转文字模型抽象基类"""
    
    def __init__(self, config: dict):
        """
        初始化模型
        
        Args:
            config: 模型配置字典
        """
        self.config = config
        self.model_name = config.get('name', 'unknown')
    
    @abstractmethod
    def initialize(self):
        """初始化模型，加载必要的资源"""
        pass
    
    @abstractmethod
    def transcribe(
        self, 
        audio_data: np.ndarray, 
        sample_rate: int = 16000,
        language: Optional[str] = None,
        prompt: str = ""
    ) -> Tuple[Optional[str], Optional[str], float]:
        """
        转录音频数据
        
        Args:
            audio_data: 音频数据 (numpy array, float32, shape: [samples])
            sample_rate: 采样率
            language: 源语言代码（可选，None表示自动检测）
            prompt: 提示文本（可选）
            
        Returns:
            (text, detected_language, cost_time)
            - text: 转录的文本，如果失败返回None
            - detected_language: 检测到的语言代码，如果失败返回None
            - cost_time: 处理耗时（秒）
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """检查模型是否可用"""
        pass
    
    def cleanup(self):
        """清理资源（可选实现）"""
        pass

