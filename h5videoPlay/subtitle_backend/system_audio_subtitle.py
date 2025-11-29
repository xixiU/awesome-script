#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统音频实时字幕服务
整合UI、音频采集、语音转文字、翻译等模块
"""
import logging
import threading
import time
import numpy as np

# 导入各个模块
from ui.floating_window import FloatingWindow
from audio.audio_capture import AudioCapture
from stt_service import STTService
from translation.translator import Translator

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class SystemAudioSubtitleService:
    """系统音频实时字幕服务"""
    
    def __init__(self, model_size="small", device="cpu", target_lang="zh-CN", source_lang=None, 
                 sample_rate=16000, chunk_duration=2.0, config_file="model_config.json",
                 min_rms_for_stt: float = 3e-3):
        """
        初始化服务
        
        Args:
            model_size: 模型大小（保留兼容性，实际从配置文件读取）
            device: 设备（保留兼容性，实际从配置文件读取）
            target_lang: 目标语言，默认"zh-CN"
            source_lang: 源语言，None表示自动检测
            sample_rate: 采样率，默认16000Hz
            chunk_duration: 音频块时长（秒），默认2.0秒
            config_file: 配置文件路径
        """
        self.target_lang = target_lang
        self.source_lang = source_lang
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        # 额外的整体能量门限，用于在进入大模型前再过滤一层静音 / 环境噪声
        self.min_rms_for_stt = min_rms_for_stt
        
        # 初始化各个模块
        self.stt_service = STTService(config_file)
        self.translator = Translator(target_lang=target_lang)
        self.audio_capture = AudioCapture(sample_rate=sample_rate, chunk_duration=chunk_duration)
        
        # UI和线程控制
        self.floating_window = None
        self.process_thread = None
        self.is_recording = False
        
        # 音频处理相关
        self.prev_audio = np.array([], dtype=np.float32)
        self.sentence_buffer = ""
        self.last_speech_time = time.time()
    
    def initialize(self):
        """初始化服务"""
        # 初始化语音转文字服务
        if not self.stt_service.initialize():
            raise RuntimeError("语音转文字服务初始化失败")
        
        logger.info("✅ 服务初始化完成")
    
    def switch_model(self, model_name: str) -> bool:
        """
        切换模型
        
        Args:
            model_name: 模型名称
            
        Returns:
            是否切换成功
        """
        return self.stt_service.switch_model(model_name)
    
    def update_translator(self, new_lang: str):
        """
        更新翻译器目标语言
        
        Args:
            new_lang: 新的目标语言代码
        """
        self.target_lang = new_lang
        self.translator.update_target_lang(new_lang)
    
    def update_source_lang(self, new_lang: str):
        """
        更新源语言
        
        Args:
            new_lang: 新的源语言代码，"Auto"表示自动检测
        """
        # "Auto" 转为 None，其他保持原样
        lang_code = None if new_lang == "Auto" else new_lang
        logger.info(f"🎤 切换源语言: {new_lang} -> {lang_code}")
        self.source_lang = lang_code
        self.translator.update_source_lang(new_lang)
    
    def _is_same_language(self, detected_lang: str, target_lang: str) -> bool:
        """
        判断检测到的语言和目标语言是否相同
        
        Args:
            detected_lang: 检测到的语言代码
            target_lang: 目标语言代码
            
        Returns:
            是否相同
        """
        if not detected_lang or not target_lang:
            return False
        # 取横杠前的部分进行对比: zh-CN -> zh
        d_code = detected_lang.lower().split('-')[0]
        t_code = target_lang.lower().split('-')[0]
        return d_code == t_code
    
    def _is_cjk(self, text: str) -> bool:
        """判断文本是否包含中日韩字符"""
        if not text:
            return False
        return any(u'\u4e00' <= char <= u'\u9fff' for char in text)
    
    def _process_loop(self):
        """音频处理循环"""
        audio_buffer = []
        curr_samples = 0
        overlap_samples = int(self.sample_rate * 0.5)
        
        while self.is_recording:
            try:
                # 检查队列积压
                if self.audio_capture.get_queue_size() > 6:
                    logger.warning("⚡ 丢弃积压数据...")
                    self.audio_capture.clear_queue()
                    audio_buffer = []
                    curr_samples = 0
                    self.sentence_buffer = ""
                    continue

                # 获取音频块
                chunk = self.audio_capture.get_chunk(timeout=0.5)
                if chunk is None:
                    # 超时，检查是否需要处理缓冲区中的文本
                    if time.time() - self.last_speech_time > 3.0 and self.sentence_buffer:
                        self._translate_worker(self.sentence_buffer, 0.0, final=True)
                        self.sentence_buffer = ""
                    continue

                audio_buffer.append(chunk)
                curr_samples += len(chunk)

                # 当积累足够的音频时进行处理
                if curr_samples >= self.audio_capture.chunk_samples:
                    # 拼接音频
                    raw_audio = np.concatenate(audio_buffer, axis=0).flatten().astype(np.float32)
                    if len(self.prev_audio) > 0:
                        proc_audio = np.concatenate((self.prev_audio, raw_audio))
                    else:
                        proc_audio = raw_audio
                    
                    # 保存重叠部分用于下次处理
                    self.prev_audio = raw_audio[-overlap_samples:]
                    
                    # ===== 额外的静音过滤（整体能量门） =====
                    try:
                        rms = float(np.sqrt(np.mean(proc_audio * proc_audio)))
                    except Exception as e:
                        logger.warning(f"计算整体RMS失败，仍然送入识别: {e}")
                        rms = self.min_rms_for_stt

                    if rms < self.min_rms_for_stt:
                        # 整体能量也很低，认为主要是环境底噪 / 静音，直接跳过识别
                        logger.debug(f"跳过静音块，不送入识别 (rms={rms:.6f} < {self.min_rms_for_stt:.6f})")
                        audio_buffer = []
                        curr_samples = 0
                        continue
                    # ===== 额外静音过滤结束 =====

                    # 使用上一句的后50个字符作为提示
                    prompt = self.sentence_buffer[-50:] if self.sentence_buffer else ""
                    
                    # 语音转文字
                    text, lang, cost = self.stt_service.transcribe(
                        proc_audio,
                        sample_rate=self.sample_rate,
                        language=self.source_lang,
                        prompt=prompt
                    )
                    
                    if text:
                        self.last_speech_time = time.time()
                        
                        # 文本拼接逻辑
                        if not self.sentence_buffer.endswith(text):
                            sep = " " if self.sentence_buffer and not self._is_cjk(text) else ""
                            self.sentence_buffer += sep + text
                        self.sentence_buffer = self.sentence_buffer.strip()
                        
                        # 先在原文区域显示（带省略号表示未完）
                        if self.floating_window:
                            self.floating_window.update_text(self.sentence_buffer, "...", {'rec': cost})
                        
                        # 判断是否需要翻译
                        if not self._is_same_language(lang, self.target_lang):
                            self._translate_worker(self.sentence_buffer, cost, final=False)
                        else:
                            # 同语言：译文区直接显示原文
                            logger.info(f"⏭️ 同语言 [{lang}=={self.target_lang}]，跳过翻译")
                            if self.floating_window:
                                self.floating_window.update_text(
                                    self.sentence_buffer, 
                                    self.sentence_buffer, 
                                    {'rec': cost}
                                )
                    
                    # 清空缓冲区
                    audio_buffer = []
                    curr_samples = 0
                    
            except Exception as e:
                logger.error(f"处理音频时出错: {e}", exc_info=True)
    
    def _translate_worker(self, text: str, rec_cost: float = 0.0, final: bool = False):
        """
        翻译工作线程
        
        Args:
            text: 要翻译的文本
            rec_cost: 识别耗时
            final: 是否为最终翻译
        """
        def on_translate_complete(translated_text: str, trans_cost: float):
            """翻译完成回调"""
            if self.floating_window:
                self.floating_window.update_text(
                    text, 
                    translated_text or text, 
                    {'rec': rec_cost, 'trans': trans_cost}
                )
        
        self.translator.translate_async(text, on_translate_complete, rec_cost)
    
    def start(self):
        """启动服务"""
        # 初始化服务
        self.initialize()
        
        # 创建UI窗口
        initial_source_ui = self.source_lang if self.source_lang else "Auto"
        available_models = self.stt_service.get_available_models()
        current_model = self.stt_service.get_current_model()
        
        self.floating_window = FloatingWindow(
            target_lang=self.target_lang,
            source_lang=initial_source_ui,
            lang_callback=self.update_translator,
            source_lang_callback=self.update_source_lang,
            model_callback=self.switch_model,
            available_models=available_models,
            current_model=current_model or "whisper"
        )
        self.floating_window.create_window()
        
        # 启动音频采集
        if not self.audio_capture.start():
            logger.error("音频采集启动失败")
            return
        
        # 启动处理线程
        self.is_recording = True
        self.process_thread = threading.Thread(target=self._process_loop, daemon=True)
        self.process_thread.start()
        
        # 保持主线程运行
        def keep_alive():
            if not self.is_recording:
                if self.process_thread and not self.process_thread.is_alive():
                    if self.floating_window and self.floating_window.root:
                        self.floating_window.root.quit()
            else:
                if self.floating_window and self.floating_window.root:
                    self.floating_window.root.after(1000, keep_alive)
        
        keep_alive()
        
        try:
            if self.floating_window and self.floating_window.root:
                self.floating_window.root.mainloop()
        except KeyboardInterrupt:
            logger.info("收到中断信号，正在关闭...")
        except Exception as e:
            logger.error(f"运行出错: {e}", exc_info=True)
        finally:
            self.stop()
    
    def stop(self):
        """停止服务"""
        logger.info("正在停止服务...")
        self.is_recording = False
        
        # 停止音频采集
        self.audio_capture.stop()
        
        # 清理资源
        self.stt_service.cleanup()
        
        # 关闭UI
        if self.floating_window:
            self.floating_window.close_window()
        
        logger.info("服务已停止")


def main():
    """主函数"""
    import argparse
    parser = argparse.ArgumentParser(description="系统音频实时字幕服务")
    parser.add_argument("--model", type=str, default="auto", help="模型大小（已废弃，使用配置文件）")
    parser.add_argument("--device", type=str, default="cpu", help="设备（已废弃，使用配置文件）")
    parser.add_argument("--source-lang", type=str, default=None, help="源语言")
    parser.add_argument("--target-lang", type=str, default="zh-CN", help="目标语言")
    parser.add_argument("--chunk-duration", type=float, default=2.0, help="音频块时长（秒）")
    parser.add_argument("--config", type=str, default="model_config.json", help="配置文件路径")
    
    args = parser.parse_args()
    
    service = SystemAudioSubtitleService(
        model_size=args.model,
        device=args.device,
        target_lang=args.target_lang,
        source_lang=args.source_lang,
        chunk_duration=args.chunk_duration,
        config_file=args.config
    )
    
    try:
        service.start()
    except KeyboardInterrupt:
        logger.info("程序被用户中断")
    except Exception as e:
        logger.error(f"程序运行出错: {e}", exc_info=True)
    finally:
        service.stop()


if __name__ == "__main__":
    main()
