#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
翻译模块
负责文本翻译功能
"""
import logging
import threading
from typing import Optional, Callable
from deep_translator import GoogleTranslator

logger = logging.getLogger(__name__)


class Translator:
    """文本翻译器"""
    
    def __init__(self, target_lang: str = "zh-CN", source_lang: str = "auto"):
        """
        初始化翻译器
        
        Args:
            target_lang: 目标语言代码，默认"zh-CN"
            source_lang: 源语言代码，默认"auto"（自动检测）
        """
        self.target_lang = target_lang
        self.source_lang = source_lang
        self.translator: Optional[GoogleTranslator] = None
        self._initialize_translator()
    
    def _initialize_translator(self):
        """初始化翻译器实例"""
        try:
            self.translator = GoogleTranslator(source=self.source_lang, target=self.target_lang)
            logger.info(f"✅ 翻译器初始化成功 (目标语言: {self.target_lang})")
        except Exception as e:
            logger.error(f"❌ 翻译器初始化失败: {e}")
            self.translator = None
    
    def update_target_lang(self, new_lang: str):
        """
        更新目标语言
        
        Args:
            new_lang: 新的目标语言代码
        """
        if new_lang == self.target_lang:
            return
        
        logger.info(f"🔄 切换目标语言: {self.target_lang} -> {new_lang}")
        self.target_lang = new_lang
        self._initialize_translator()
    
    def update_source_lang(self, new_lang: str):
        """
        更新源语言
        
        Args:
            new_lang: 新的源语言代码，"Auto"表示自动检测
        """
        # "Auto" 转为 "auto"
        lang_code = "auto" if new_lang == "Auto" else new_lang
        
        if lang_code == self.source_lang:
            return
        
        logger.info(f"🎤 切换源语言: {self.source_lang} -> {lang_code}")
        self.source_lang = lang_code
        self._initialize_translator()
    
    def translate(self, text: str) -> Optional[str]:
        """
        同步翻译文本
        
        Args:
            text: 要翻译的文本
            
        Returns:
            翻译后的文本，如果失败返回None
        """
        if not self.translator:
            logger.error("翻译器未初始化")
            return None
        
        if not text or not text.strip():
            return None
        
        try:
            # 确保翻译器使用正确的目标语言
            if hasattr(self.translator, 'target') and self.translator.target != self.target_lang:
                self._initialize_translator()
            
            result = self.translator.translate(text)
            return result
        except Exception as e:
            logger.error(f"翻译失败: {e}")
            return None
    
    def translate_async(self, text: str, callback: Callable[[str, float], None], rec_cost: float = 0.0):
        """
        异步翻译文本
        
        Args:
            text: 要翻译的文本
            callback: 翻译完成后的回调函数，参数为(翻译结果, 翻译耗时)
            rec_cost: 识别耗时（用于统计）
        """
        def task():
            import time
            t0 = time.time()
            result = self.translate(text)
            cost = time.time() - t0
            
            if result:
                logger.info(f"🌍 译文 [{cost:.2f}s]: {result}")
                callback(result, cost)
            else:
                logger.warning("翻译返回空结果")
                callback(None, cost)
        
        threading.Thread(target=task, daemon=True).start()
    
    def is_available(self) -> bool:
        """检查翻译器是否可用"""
        return self.translator is not None

