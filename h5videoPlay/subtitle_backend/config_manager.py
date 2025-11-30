#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配置管理器 - 管理模型配置，支持从JSON文件读取和保存
"""
import json
import os
import sys
import platform
import logging
from typing import Dict, Optional, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class ConfigManager:
    """配置管理器"""
    
    def __init__(self, config_file: str = "model_config.json"):
        """
        初始化配置管理器
        
        Args:
            config_file: 配置文件路径（相对于当前工作目录）
        """
        # 获取脚本所在目录
        if getattr(sys, 'frozen', False):
            # 如果是打包后的可执行文件
            exe_path = Path(sys.executable)
            # macOS .app 包特殊处理：将配置生成在 .app 同级目录
            if platform.system() == 'Darwin' and 'Contents/MacOS' in str(exe_path):
                # .../AppName.app/Contents/MacOS/AppName -> .../AppName.app/..
                script_dir = exe_path.parent.parent.parent.parent
            else:
                script_dir = exe_path.parent
        else:
            # 如果是脚本运行
            script_dir = Path(__file__).parent
            
        self.config_path = script_dir / config_file
        self.config: Dict[str, Any] = {}
        self._load_config()
    
    def _load_config(self):
        """从文件加载配置"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    self.config = json.load(f)
                logger.info(f"✅ 加载配置文件: {self.config_path}")
            except Exception as e:
                logger.warning(f"⚠️ 加载配置文件失败: {e}，使用默认配置")
                self.config = self._get_default_config()
        else:
            logger.info(f"📝 配置文件不存在，使用默认配置: {self.config_path}")
            self.config = self._get_default_config()
            self._save_config()
    
    def _get_default_config(self) -> Dict[str, Any]:
        """获取默认配置"""
        return {
            "current_model": "whisper",  # 当前使用的模型
            "models": {
                "whisper": {
                    "type": "whisper",
                    "enabled": True,
                    "config": {
                        "model_size": "small",
                        "device": "cpu",
                        "compute_type": "int8",
                        "cpu_threads": 4
                    }
                },
                "siliconflow": {
                    "type": "siliconflow",
                    "enabled": False,
                    "config": {
                        "api_key": "",
                        "base_url": "https://api.siliconflow.cn/v1",
                        "model_id": "FunAudioLLM/SenseVoiceSmall",
                        "timeout": 30
                    }
                }
            }
        }
    
    def _save_config(self):
        """保存配置到文件"""
        try:
            # 确保目录存在
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            logger.info(f"💾 保存配置文件: {self.config_path}")
        except Exception as e:
            logger.error(f"❌ 保存配置文件失败: {e}")
    
    def get_current_model(self) -> str:
        """获取当前使用的模型名称"""
        return self.config.get("current_model", "whisper")
    
    def set_current_model(self, model_name: str):
        """设置当前使用的模型"""
        if model_name in self.config.get("models", {}):
            self.config["current_model"] = model_name
            self._save_config()
            logger.info(f"🔄 切换模型: {model_name}")
        else:
            logger.warning(f"⚠️ 模型不存在: {model_name}")
    
    def get_model_config(self, model_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        获取模型配置
        
        Args:
            model_name: 模型名称，如果为None则返回当前模型的配置
            
        Returns:
            模型配置字典，如果模型不存在返回None
        """
        if model_name is None:
            model_name = self.get_current_model()
        
        models = self.config.get("models", {})
        if model_name in models:
            model_info = models[model_name]
            return {
                "type": model_info.get("type", model_name),
                **model_info.get("config", {})
            }
        return None
    
    def get_available_models(self) -> list:
        """获取所有可用的模型列表（已启用）"""
        models = self.config.get("models", {})
        return [name for name, info in models.items() if info.get("enabled", True)]
    
    def get_all_models(self) -> Dict[str, Dict]:
        """获取所有模型配置（包括未启用的）"""
        return self.config.get("models", {})
    
    def update_model_config(self, model_name: str, config: Dict[str, Any]):
        """
        更新模型配置
        
        Args:
            model_name: 模型名称
            config: 新的配置字典
        """
        if "models" not in self.config:
            self.config["models"] = {}
        
        if model_name not in self.config["models"]:
            self.config["models"][model_name] = {
                "type": model_name,
                "enabled": True,
                "config": {}
            }
        
        # 更新配置
        self.config["models"][model_name]["config"].update(config)
        self._save_config()
        logger.info(f"📝 更新模型配置: {model_name}")
    
    def enable_model(self, model_name: str, enabled: bool = True):
        """启用或禁用模型"""
        if "models" not in self.config:
            self.config["models"] = {}
        
        if model_name not in self.config["models"]:
            logger.warning(f"⚠️ 模型不存在: {model_name}")
            return
        
        self.config["models"][model_name]["enabled"] = enabled
        self._save_config()
        logger.info(f"{'✅' if enabled else '❌'} 模型状态: {model_name} = {enabled}")
    
    def add_model(self, model_name: str, model_type: str, config: Dict[str, Any], enabled: bool = True):
        """
        添加新模型配置
        
        Args:
            model_name: 模型名称
            model_type: 模型类型（whisper, siliconflow等）
            config: 模型配置
            enabled: 是否启用
        """
        if "models" not in self.config:
            self.config["models"] = {}
        
        self.config["models"][model_name] = {
            "type": model_type,
            "enabled": enabled,
            "config": config
        }
        self._save_config()
        logger.info(f"➕ 添加模型: {model_name} ({model_type})")

