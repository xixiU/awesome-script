#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统音频实时字幕服务
整合UI、音频采集、语音转文字、翻译等模块
"""
import logging
import threading
import time
import queue
import numpy as np
import multiprocessing
import sys

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
    
    def __init__(self, model_size="small", target_lang="zh-CN", source_lang=None, 
                 sample_rate=16000, chunk_duration=2.0, config_file="model_config.json",
                 min_rms_for_stt: float = 1e-3,
                 silence_duration_for_sentence_end: float = 1.5,
                 max_sentence_duration: float = 10.0):
        """
        初始化服务
        
        Args:
            model_size: 模型大小（保留兼容性，实际从配置文件读取）
            target_lang: 目标语言，默认"zh-CN"
            source_lang: 源语言，None表示自动检测
            sample_rate: 采样率，默认16000Hz
            chunk_duration: 音频块时长（秒），默认2.0秒（用于识别，但会累积句子）
            config_file: 配置文件路径
            min_rms_for_stt: 送入识别的最小RMS阈值
            silence_duration_for_sentence_end: 静音持续时间（秒），超过此值认为句子结束
            max_sentence_duration: 最大句子持续时间（秒），超过此值强制输出
        """
        self.target_lang = target_lang
        self.source_lang = source_lang
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        # 额外的整体能量门限，用于在进入大模型前再过滤一层静音 / 环境噪声
        self.min_rms_for_stt = min_rms_for_stt
        self.silence_duration_for_sentence_end = silence_duration_for_sentence_end
        self.max_sentence_duration = max_sentence_duration
        
        # 日志限流计数器
        self.log_counter = 0
        
        # 初始化各个模块
        self.stt_service = STTService(config_file)
        self.translator = Translator(target_lang=target_lang)
        # 使用较短的chunk_duration进行快速识别，但会累积成完整句子
        self.audio_capture = AudioCapture(sample_rate=sample_rate, chunk_duration=chunk_duration)
        
        # 线程控制
        self.floating_window = None
        self.capture_thread = None
        self.process_thread = None
        self.is_recording = False
        
        # 线程安全的数据队列
        self.data_queue = queue.Queue()
        
        # 音频处理相关
        self.prev_audio = np.array([], dtype=np.float32)
        self.sentence_buffer = ""  # 累积的完整句子
        self.last_speech_time = time.time()
        self.last_silence_start_time = None  # 静音开始时间
        self.sentence_start_time = None  # 当前句子开始时间
        self.is_in_sentence = False  # 是否正在构建句子
        self.pending_translation = None  # 待翻译的句子（避免重复翻译）
        self.last_detected_lang = None  # 最后一次检测到的语言
        self.current_translation_task_id = 0  # 当前翻译任务ID，用于取消旧任务
        self.last_translated_text = ""  # 最后一次翻译的文本
    
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
    
    def _capture_loop(self):
        """
        音频采集线程
        只负责从设备采集音频并放入队列，不做耗时处理
        """
        while self.is_recording:
            try:
                # 从音频设备获取数据
                chunk = self.audio_capture.get_chunk(timeout=0.5)
                if chunk is not None:
                    # 监控队列长度
                    qsize = self.data_queue.qsize()
                    # 计算正常的累积量：chunk_duration (2s) / 0.1s = 20块
                    # 只有远超正常累积量才警告
                    normal_buffer_size = int(self.chunk_duration / 0.1)
                    warning_threshold = max(30, normal_buffer_size * 2)
                    drop_threshold = max(100, normal_buffer_size * 5)

                    if qsize > drop_threshold:
                        # 积压严重，丢弃数据防止内存溢出
                        if self.log_counter % 10 == 0:
                            logger.warning(f"⚡ 队列积压严重 ({qsize}块)，丢弃当前帧...")
                        self.log_counter += 1
                        
                        # 尝试清空一部分旧数据
                        try:
                            for _ in range(10):
                                self.data_queue.get_nowait()
                        except queue.Empty:
                            pass
                    elif qsize > warning_threshold:
                        # 积压警告，但不丢弃（限制打印频率，每10次/1秒打印一次）
                        if self.log_counter % 10 == 0:
                            logger.warning(f"⚠️ 队列积压警告: {qsize}块待处理")
                        self.log_counter += 1
                    else:
                        # 正常状态重置计数器（可选，为了保持计数连续性也可以不重置）
                        pass
                    
                    # 放入内部数据队列
                    self.data_queue.put(chunk)
            except Exception as e:
                logger.error(f"采集线程出错: {e}")
                time.sleep(0.1)

    def _process_loop(self):
        """
        音频处理线程
        负责从队列取出数据进行识别和翻译
        """
        audio_buffer = []
        curr_samples = 0
        overlap_samples = int(self.sample_rate * 0.5)
        current_time = time.time()
        
        while self.is_recording:
            try:
                # 从队列获取音频数据（非阻塞，或者短超时）
                try:
                    # 一次性取出队列中所有积压的数据，防止处理速度跟不上
                    chunks = []
                    while not self.data_queue.empty():
                        chunks.append(self.data_queue.get_nowait())
                    
                    # 如果队列为空，尝试等待一小会儿
                    if not chunks:
                        chunk = self.data_queue.get(timeout=0.1)
                        chunks.append(chunk)
                except queue.Empty:
                    # 超时，检查句子是否应该结束
                    current_time = time.time()
                    self._check_sentence_end(current_time, force_check=True)
                    continue

                # 监控处理延迟
                process_start_time = time.time()
                queue_wait_time = process_start_time - current_time if current_time > 0 else 0
                if queue_wait_time > 1.0:
                    logger.info(f"🕒 处理延迟: {queue_wait_time:.2f}s")

                current_time = process_start_time
                
                # 将所有新获取的块加入缓冲区
                if len(chunks) > 10:
                    logger.info(f"🚀 正在合并处理 {len(chunks)} 个积压音频块 (约 {len(chunks)*0.1:.1f}秒)...")
                
                for chunk in chunks:
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

                    is_silence = rms < self.min_rms_for_stt
                    
                    # 积压处理策略：如果积压严重，且当前是静音，则更激进地丢弃
                    qsize = self.data_queue.qsize()
                    if qsize > 5 and is_silence:
                        # 积压中，且当前是静音，直接跳过，不计入静音时长，加速追赶
                        logger.debug(f"积压追赶：跳过静音块 (qsize={qsize})")
                        audio_buffer = []
                        curr_samples = 0
                        continue

                    if is_silence:
                        # 整体能量很低，认为是静音
                        logger.debug(f"跳过静音块，不送入识别 (rms={rms:.6f} < {self.min_rms_for_stt:.6f})")
                        
                        # 如果正在构建句子，记录静音开始时间
                        if self.is_in_sentence:
                            if self.last_silence_start_time is None:
                                self.last_silence_start_time = current_time
                            # 检查是否应该结束句子
                            self._check_sentence_end(current_time)
                        
                        audio_buffer = []
                        curr_samples = 0
                        continue
                    # ===== 额外静音过滤结束 =====
                    
                    # 检测到有效音频，重置静音计时
                    if self.last_silence_start_time is not None:
                        self.last_silence_start_time = None
                    
                    # 如果这是新句子的开始
                    if not self.is_in_sentence:
                        self.is_in_sentence = True
                        self.sentence_start_time = current_time
                        self.sentence_buffer = ""
                        logger.debug("🎤 开始新句子")

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
                        self.last_speech_time = current_time
                        self.last_detected_lang = lang  # 保存检测到的语言
                        
                        # 文本拼接逻辑
                        if not self.sentence_buffer.endswith(text):
                            sep = " " if self.sentence_buffer and not self._is_cjk(text) else ""
                            self.sentence_buffer += sep + text
                        self.sentence_buffer = self.sentence_buffer.strip()
                        
                        # 实时预览：显示当前累积的句子（带省略号表示未完）
                        current_sentence = self.sentence_buffer + "..."
                        if self.floating_window:
                            # 传 None 给翻译部分，保持上一句翻译或等待实时翻译
                            self.floating_window.update_text(current_sentence, None, {'rec': cost})
                        
                        # 实时翻译：立即翻译当前累积的句子（预览）
                        self._translate_realtime(current_sentence, cost)
                        
                        # 检查句子是否应该结束（基于最大时长）
                        self._check_sentence_end(current_time)
                    
                    # 清空缓冲区
                    audio_buffer = []
                    curr_samples = 0
                    
            except Exception as e:
                logger.error(f"处理音频时出错: {e}", exc_info=True)
    
    def _check_sentence_end(self, current_time: float, force_check: bool = False):
        """
        检查句子是否应该结束
        
        Args:
            current_time: 当前时间
            force_check: 是否强制检查（即使没有静音）
        """
        if not self.is_in_sentence or not self.sentence_buffer:
            return
        
        should_end = False
        reason = ""
        
        # 情况1: 检测到足够长的静音
        if self.last_silence_start_time is not None:
            silence_duration = current_time - self.last_silence_start_time
            if silence_duration >= self.silence_duration_for_sentence_end:
                should_end = True
                reason = f"静音持续 {silence_duration:.2f}秒"
        
        # 情况2: 句子持续时间过长（强制输出，避免延迟）
        if self.sentence_start_time is not None:
            sentence_duration = current_time - self.sentence_start_time
            if sentence_duration >= self.max_sentence_duration:
                should_end = True
                reason = f"句子持续 {sentence_duration:.2f}秒（超时）"
        
        # 情况3: 强制检查且距离上次语音时间过长
        if force_check and (current_time - self.last_speech_time) > 3.0:
            should_end = True
            reason = "长时间无语音"
        
        if should_end:
            logger.info(f"📝 句子结束: {reason}")
            self._finalize_sentence()
    
    def _translate_realtime(self, text: str, rec_cost: float = 0.0):
        """
        实时翻译预览（句子构建过程中）
        
        Args:
            text: 当前累积的文本（可能带省略号）
            rec_cost: 识别耗时
        """
        # 使用最后一次检测到的语言
        detected_lang = self.last_detected_lang
        
        # 判断是否需要翻译
        if detected_lang and not self._is_same_language(detected_lang, self.target_lang):
            # 生成新的翻译任务ID
            self.current_translation_task_id += 1
            task_id = self.current_translation_task_id
            
            def on_translate_complete(translated_text: str, trans_cost: float):
                """翻译完成回调"""
                # 只处理最新的翻译任务，忽略旧的
                if task_id == self.current_translation_task_id:
                    if self.floating_window:
                        # 显示原文和实时翻译预览
                        self.floating_window.update_text(
                            text, 
                            translated_text or text, 
                            {'rec': rec_cost, 'trans': trans_cost}
                        )
                    self.last_translated_text = translated_text or text
            
            # 异步翻译
            self.translator.translate_async(text, on_translate_complete, rec_cost)
        else:
            # 同语言或语言未知：直接显示原文
            if self.floating_window:
                self.floating_window.update_text(text, text, {'rec': rec_cost})
    
    def _finalize_sentence(self):
        """完成当前句子，显示并翻译（最终纠正版）"""
        if not self.sentence_buffer:
            self._reset_sentence_state()
            return
        
        final_text = self.sentence_buffer.strip()
        logger.info(f"✅ 完整句子: {final_text}")
        
        # 使用最后一次检测到的语言
        detected_lang = self.last_detected_lang
        
        # 判断是否需要翻译
        if detected_lang and not self._is_same_language(detected_lang, self.target_lang):
            # 生成新的翻译任务ID（最终翻译会覆盖实时翻译）
            self.current_translation_task_id += 1
            task_id = self.current_translation_task_id
            
            def on_final_translate_complete(translated_text: str, trans_cost: float):
                """最终翻译完成回调"""
                # 只处理最新的翻译任务
                if task_id == self.current_translation_task_id:
                    logger.info(f"🌍 最终翻译: {translated_text}")
                    if self.floating_window:
                        # 显示最终完整句子和最终翻译（覆盖之前的预览）
                        self.floating_window.update_text(
                            final_text, 
                            translated_text or final_text, 
                            {'trans': trans_cost}
                        )
                    self.last_translated_text = translated_text or final_text
            
            # 异步翻译完整句子（最终版本）
            self.translator.translate_async(final_text, on_final_translate_complete, 0.0)
        else:
            # 同语言或语言未知：直接显示完整句子
            logger.info(f"⏭️ 同语言或语言未知 [{detected_lang}=={self.target_lang}]，跳过翻译")
            if self.floating_window:
                self.floating_window.update_text(final_text, final_text, {})
        
        # 重置状态
        self._reset_sentence_state()
    
    def _reset_sentence_state(self):
        """重置句子状态"""
        self.sentence_buffer = ""
        self.is_in_sentence = False
        self.last_silence_start_time = None
        self.sentence_start_time = None
        self.pending_translation = None
        # 注意：不重置 last_detected_lang 和 current_translation_task_id
        # 因为下一句可能还是同一种语言，且翻译任务ID用于区分新旧任务
    
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
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.process_thread = threading.Thread(target=self._process_loop, daemon=True)
        self.capture_thread.start()
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
    parser.add_argument("--source-lang", type=str, default=None, help="源语言")
    parser.add_argument("--target-lang", type=str, default="zh-CN", help="目标语言")
    parser.add_argument("--chunk-duration", type=float, default=2.0, help="音频块时长（秒）")
    parser.add_argument("--config", type=str, default="model_config.json", help="配置文件路径")
    
    args = parser.parse_args()
    
    service = SystemAudioSubtitleService(
        model_size=args.model,
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
    # PyInstaller打包在Windows/macOS下需要此调用来支持multiprocessing
    multiprocessing.freeze_support()
    main()
