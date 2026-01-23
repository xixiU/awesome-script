#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
语音转文字服务层
负责管理语音识别模型，提供统一的语音转文字接口
"""
import logging
import platform
from typing import Optional, Tuple
import numpy as np

from models.model_manager import ModelManager
from models.base_model import BaseSpeechToTextModel
from config_manager import ConfigManager

logger = logging.getLogger(__name__)


class STTService:
    """语音转文字服务"""
    
    def __init__(self, config_file: str = "model_config.json"):
        """
        初始化语音转文字服务
        
        Args:
            config_file: 配置文件路径
        """
        self.config_manager = ConfigManager(config_file)
        self.model: Optional[BaseSpeechToTextModel] = None
        self.current_model_name = None
    
    def initialize(self, model_name: Optional[str] = None) -> bool:
        """
        初始化模型
        
        Args:
            model_name: 模型名称，如果为None则使用配置中的当前模型
            
        Returns:
            是否初始化成功
        """
        if model_name is None:
            model_name = self.config_manager.get_current_model()
        
        model_config = self.config_manager.get_model_config(model_name)
        
        if not model_config:
            logger.error(f"❌ 无法加载模型配置: {model_name}")
            # 回退到默认whisper配置
            model_name = "whisper"
            model_config = self.config_manager.get_model_config("whisper")
            if not model_config:
                logger.error("❌ 无法加载默认模型配置")
                return False
        
        model_type = model_config.get("type", model_name)
        logger.info(f"🚀 初始化模型: {model_name} (类型: {model_type})")
        
        # 如果是whisper模型，需要自动检测设备配置
        if model_type == "whisper":
            self._auto_config_whisper(model_config)
        
        # 使用模型管理器创建模型
        self.model = ModelManager.create_model(model_type, model_config)
        
        if not self.model:
            logger.error(f"❌ 模型创建失败: {model_name}")
            return False
        
        self.current_model_name = model_name
        logger.info("✅ 语音转文字服务就绪")
        return True
    
    def _auto_config_whisper(self, model_config: dict):
        """自动配置Whisper模型参数"""
        system = platform.system()
        
        # 自动检测设备
        if "device" not in model_config or model_config["device"] == "auto":
            if system == "Darwin":
                logger.info("💻 系统: macOS (Apple Silicon)")
                model_config["device"] = "mps"
                model_config["compute_type"] = "int8"
                model_config["cpu_threads"] = 4
            elif system == "Windows":
                if self._check_cuda():
                    logger.info("🚀 系统: Windows (CUDA加速)")
                    model_config["device"] = "cuda"
                    model_config["compute_type"] = "float16"
                    model_config["cpu_threads"] = 0
                else:
                    logger.info("💻 系统: Windows (CPU)")
                    model_config["device"] = "cpu"
                    model_config["compute_type"] = "int8"
                    model_config["cpu_threads"] = 4
            elif system == 'Linux':
                model_config["device"] = "cuda"
                model_config["compute_type"] = "int8"
                model_config["cpu_threads"] = 4
        
        # 自动选择模型大小
        if model_config.get("model_size") == "auto":
            system = platform.system()
            if system == "Windows" and model_config.get("device") == "cuda":
                model_config["model_size"] = "deepdml/faster-whisper-large-v3-turbo-ct2"
            else:
                model_config["model_size"] = "small"
    
    def _check_cuda(self) -> bool:
        """检查CUDA是否可用"""
        try:
            import ctypes
            ctypes.cdll.LoadLibrary('nvcuda.dll')
            return True
        except:
            return False
    
    def switch_model(self, model_name: str) -> bool:
        """
        切换模型
        
        Args:
            model_name: 新模型名称
            
        Returns:
            是否切换成功
        """
        logger.info(f"🔄 切换模型: {model_name}")
        
        # 保存旧模型
        old_model = self.model
        
        # 获取新模型配置
        model_config = self.config_manager.get_model_config(model_name)
        if not model_config:
            logger.error(f"❌ 无法加载模型配置: {model_name}")
            return False
        
        model_type = model_config.get("type", model_name)
        
        # 如果是whisper模型，自动配置
        if model_type == "whisper":
            self._auto_config_whisper(model_config)
        
        # 创建新模型
        new_model = ModelManager.create_model(model_type, model_config)
        if not new_model:
            logger.error(f"❌ 模型创建失败: {model_name}")
            return False
        
        # 切换模型
        if old_model:
            try:
                old_model.cleanup()
            except Exception as e:
                logger.warning(f"清理旧模型时出错: {e}")
        
        self.model = new_model
        self.current_model_name = model_name
        self.config_manager.set_current_model(model_name)
        logger.info(f"✅ 模型切换成功: {model_name}")
        return True
    
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
            audio_data: 音频数据 (numpy array, float32)
            sample_rate: 采样率
            language: 源语言代码（可选，None表示自动检测）
            prompt: 提示文本（可选）
            
        Returns:
            (text, detected_language, cost_time)
            - text: 转录的文本，如果失败返回None
            - detected_language: 检测到的语言代码，如果失败返回None
            - cost_time: 处理耗时（秒）
        """
        if not self.model:
            logger.error("模型未初始化")
            return None, None, 0.0
        
        try:
            text, detected_lang, cost = self.model.transcribe(
                audio_data,
                sample_rate=sample_rate,
                language=language,
                prompt=prompt
            )
            
            if text:
                logger.info(f"👂 原文 [{detected_lang}][{cost:.2f}s]: {text}")
            
            return text, detected_lang, cost
        except Exception as e:
            logger.error(f"推理错误: {e}")
            return None, None, 0.0
    
    def get_available_models(self) -> list:
        """获取所有可用的模型列表"""
        return self.config_manager.get_available_models()
    
    def get_current_model(self) -> Optional[str]:
        """获取当前使用的模型名称"""
        return self.current_model_name
    
    def is_available(self) -> bool:
        """检查服务是否可用"""
        return self.model is not None and self.model.is_available()
    
    def cleanup(self):
        """清理资源"""
        if self.model:
            try:
                self.model.cleanup()
            except Exception as e:
                logger.warning(f"清理模型时出错: {e}")
            finally:
                self.model = None

