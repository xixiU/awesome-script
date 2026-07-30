#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
模型管理器 - 负责加载和管理不同的语音转文字模型
"""
import logging
from typing import Dict, Optional, Type
from .base_model import BaseSpeechToTextModel
from .whisper_model import WhisperSTTModel
from .siliconflow_model import SiliconFlowSTTModel

logger = logging.getLogger(__name__)


class ModelManager:
    """模型管理器"""

    # 注册的模型类
    _model_classes: Dict[str, Type[BaseSpeechToTextModel]] = {
        'whisper': WhisperSTTModel,
        'siliconflow': SiliconFlowSTTModel,
    }

    # mlx_whisper 依赖 Apple MLX（仅 Apple Silicon 可用），非 Mac 环境导入会失败，
    # 故延迟按需注册，避免在其它平台上 import 直接崩溃。
    try:
        from .mlx_whisper_model import MLXWhisperSTTModel
        _model_classes['mlx_whisper'] = MLXWhisperSTTModel
    except Exception as _e:  # pragma: no cover
        logger.info(f"ℹ️ mlx_whisper 不可用（非 Apple Silicon 或未安装 mlx-whisper）: {_e}")
    
    @classmethod
    def register_model(cls, name: str, model_class: Type[BaseSpeechToTextModel]):
        """注册新的模型类"""
        cls._model_classes[name] = model_class
        logger.info(f"✅ 注册模型: {name}")
    
    @classmethod
    def get_available_models(cls) -> list:
        """获取所有可用的模型名称"""
        return list(cls._model_classes.keys())
    
    @classmethod
    def create_model(cls, model_type: str, config: dict) -> Optional[BaseSpeechToTextModel]:
        """
        创建模型实例
        
        Args:
            model_type: 模型类型 ('whisper', 'siliconflow', ...)
            config: 模型配置字典
            
        Returns:
            模型实例，如果失败返回None
        """
        if model_type not in cls._model_classes:
            logger.error(f"❌ 未知的模型类型: {model_type}")
            logger.info(f"💡 可用模型: {', '.join(cls.get_available_models())}")
            return None
        
        try:
            model_class = cls._model_classes[model_type]
            model = model_class(config)
            model.initialize()
            logger.info(f"✅ 成功创建模型: {model_type}")
            return model
        except Exception as e:
            logger.error(f"❌ 创建模型失败 [{model_type}]: {e}")
            return None

