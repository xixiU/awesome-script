#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统音频实时字幕翻译服务
直接监听系统音频（Windows/macOS），实现实时语音转文字和翻译
通过悬浮窗口显示翻译结果
"""

import os
import sys
import json
import queue
import threading
import logging
import platform
from typing import Optional, Dict
from pathlib import Path

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from deep_translator import GoogleTranslator
import tkinter as tk
from tkinter import ttk

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FloatingWindow:
    """悬浮窗口类，显示翻译结果"""
    
    def __init__(self, target_lang: str = "zh-CN"):
        self.target_lang = target_lang
        self.root = None
        self.text_label = None
        self.is_running = False
        self.current_text = ""
        self.lock = threading.Lock()
        
    def create_window(self):
        """创建悬浮窗口"""
        self.root = tk.Tk()
        self.root.title("实时字幕翻译")
        self.root.attributes('-topmost', True)  # 始终置顶
        self.root.attributes('-alpha', 0.9)  # 半透明
        
        # 设置窗口大小和位置
        window_width = 600
        window_height = 150
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = screen_height - window_height - 50  # 底部居中
        
        self.root.geometry(f'{window_width}x{window_height}+{x}+{y}')
        self.root.overrideredirect(True)  # 无边框
        
        # 设置背景色
        self.root.configure(bg='#1a1a1a')
        
        # 创建文本标签
        self.text_label = tk.Label(
            self.root,
            text="等待音频输入...",
            font=("Arial", 18, "bold"),
            fg="#FFFFFF",
            bg="#1a1a1a",
            wraplength=550,
            justify="center",
            padx=20,
            pady=20
        )
        self.text_label.pack(expand=True, fill=tk.BOTH)
        
        # 语言选择下拉框
        lang_frame = tk.Frame(self.root, bg="#1a1a1a")
        lang_frame.pack(side=tk.BOTTOM, pady=5)
        
        tk.Label(
            lang_frame,
            text="目标语言:",
            font=("Arial", 10),
            fg="#CCCCCC",
            bg="#1a1a1a"
        ).pack(side=tk.LEFT, padx=5)
        
        self.lang_var = tk.StringVar(value=self.target_lang)
        lang_combo = ttk.Combobox(
            lang_frame,
            textvariable=self.lang_var,
            values=["zh-CN", "en", "ja", "ko", "fr", "de", "es", "ru"],
            width=10,
            state="readonly"
        )
        lang_combo.pack(side=tk.LEFT, padx=5)
        lang_combo.bind("<<ComboboxSelected>>", self.on_lang_change)
        
        # 关闭按钮
        close_btn = tk.Button(
            lang_frame,
            text="×",
            font=("Arial", 14, "bold"),
            fg="#FFFFFF",
            bg="#ff4444",
            width=3,
            command=self.close_window
        )
        close_btn.pack(side=tk.RIGHT, padx=5)
        
        self.is_running = True
        
    def on_lang_change(self, event=None):
        """语言改变回调"""
        self.target_lang = self.lang_var.get()
        logger.info(f"目标语言已更改为: {self.target_lang}")
        
    def update_text(self, text: str):
        """更新显示文本"""
        if not self.is_running or not self.root:
            return
            
        with self.lock:
            self.current_text = text
            
        # 在主线程中更新UI
        if self.root:
            self.root.after(0, self._update_text_ui, text)
    
    def _update_text_ui(self, text: str):
        """在UI线程中更新文本"""
        if self.text_label:
            if text:
                self.text_label.config(text=text)
            else:
                self.text_label.config(text="等待音频输入...")
    
    def close_window(self):
        """关闭窗口"""
        self.is_running = False
        if self.root:
            self.root.quit()
            self.root.destroy()
    
    def run(self):
        """运行窗口主循环"""
        if self.root:
            self.root.mainloop()


class SystemAudioSubtitleService:
    """系统音频字幕服务"""
    
    def __init__(
        self,
        model_size: str = "base",
        target_lang: str = "zh-CN",
        sample_rate: int = 16000,
        chunk_duration: float = 3.0
    ):
        """
        初始化服务
        
        Args:
            model_size: Whisper模型大小
            target_lang: 目标翻译语言
            sample_rate: 采样率
            chunk_duration: 每次处理的音频时长（秒）
        """
        self.model_size = model_size
        self.target_lang = target_lang
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.chunk_samples = int(sample_rate * chunk_duration)
        
        self.model: Optional[WhisperModel] = None
        self.translator: Optional[GoogleTranslator] = None
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.floating_window: Optional[FloatingWindow] = None
        
    def initialize(self):
        """初始化模型和翻译器"""
        try:
            logger.info(f"正在加载 Whisper 模型: {self.model_size}")
            self.model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type="int8"
            )
            logger.info("Whisper 模型加载成功")
            
            logger.info(f"初始化翻译器，目标语言: {self.target_lang}")
            self.translator = GoogleTranslator(source="auto", target=self.target_lang)
            logger.info("翻译器初始化成功")
            
        except Exception as e:
            logger.error(f"初始化失败: {e}")
            raise
    
    def get_system_audio_device(self):
        """获取系统音频输入设备（用于捕获系统声音）"""
        try:
            devices = sd.query_devices()
            logger.info("可用音频设备:")
            for i, device in enumerate(devices):
                logger.info(f"  [{i}] {device['name']} - {device['hostapi']}")
            
            # 尝试找到合适的输入设备
            # macOS: 可能需要使用 BlackHole 或 Soundflower 等虚拟音频设备
            # Windows: 可能需要使用 VB-Audio 等虚拟音频设备
            
            system = platform.system()
            if system == "Darwin":  # macOS
                # 查找包含 "BlackHole" 或 "Soundflower" 的设备
                for i, device in enumerate(devices):
                    if device['max_input_channels'] > 0:
                        name = device['name'].lower()
                        if 'blackhole' in name or 'soundflower' in name or 'loopback' in name:
                            logger.info(f"找到系统音频设备: {device['name']} (索引: {i})")
                            return i
                # 如果没有找到虚拟设备，使用默认输入设备
                default_input = sd.default.device[0]
                logger.info(f"使用默认输入设备: {devices[default_input]['name']} (索引: {default_input})")
                return default_input
                
            elif system == "Windows":
                # Windows: 查找立体声混音或虚拟音频设备
                for i, device in enumerate(devices):
                    if device['max_input_channels'] > 0:
                        name = device['name'].lower()
                        if 'stereo mix' in name or 'what u hear' in name or 'vb-audio' in name:
                            logger.info(f"找到系统音频设备: {device['name']} (索引: {i})")
                            return i
                # 如果没有找到，使用默认输入设备
                default_input = sd.default.device[0]
                logger.info(f"使用默认输入设备: {devices[default_input]['name']} (索引: {default_input})")
                return default_input
            else:
                # Linux 或其他系统
                default_input = sd.default.device[0]
                logger.info(f"使用默认输入设备: {devices[default_input]['name']} (索引: {default_input})")
                return default_input
                
        except Exception as e:
            logger.error(f"获取音频设备失败: {e}")
            return None
    
    def audio_callback(self, indata, frames, time, status):
        """音频输入回调"""
        if status:
            logger.warning(f"音频输入状态: {status}")
        
        if self.is_recording:
            # 将音频数据添加到队列
            self.audio_queue.put(indata.copy())
    
    def process_audio_chunk(self, audio_data: np.ndarray) -> Optional[str]:
        """处理音频块，返回识别的文本"""
        try:
            # 确保音频数据是 float32 格式
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # 归一化到 [-1, 1]
            if audio_data.max() > 1.0 or audio_data.min() < -1.0:
                audio_data = audio_data / np.max(np.abs(audio_data))
            
            # 使用 Whisper 进行识别
            segments, info = self.model.transcribe(
                audio_data,
                language=None,  # 自动检测语言
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=400
                )
            )
            
            # 合并所有片段
            texts = []
            for segment in segments:
                text = segment.text.strip()
                if text:
                    texts.append(text)
            
            if texts:
                combined_text = " ".join(texts)
                logger.info(f"识别结果: {combined_text} (语言: {info.language})")
                return combined_text
            
            return None
            
        except Exception as e:
            logger.error(f"处理音频失败: {e}")
            return None
    
    def translate_text(self, text: str) -> str:
        """翻译文本"""
        try:
            if not self.translator:
                return text
            
            # 更新目标语言
            if self.floating_window:
                target_lang = self.floating_window.target_lang
            else:
                target_lang = self.target_lang
            
            # 如果目标语言改变，重新创建翻译器
            if hasattr(self.translator, 'target') and self.translator.target != target_lang:
                self.translator = GoogleTranslator(source="auto", target=target_lang)
            
            translated = self.translator.translate(text)
            logger.info(f"翻译结果: {translated}")
            return translated
            
        except Exception as e:
            logger.warning(f"翻译失败，返回原文: {e}")
            return text
    
    def start_recording(self):
        """开始录制系统音频"""
        device_index = self.get_system_audio_device()
        if device_index is None:
            logger.error("无法找到合适的音频输入设备")
            return False
        
        try:
            self.is_recording = True
            
            # 启动音频流
            stream = sd.InputStream(
                device=device_index,
                channels=1,  # 单声道
                samplerate=self.sample_rate,
                callback=self.audio_callback,
                blocksize=int(self.sample_rate * 0.5)  # 0.5秒的块大小
            )
            
            stream.start()
            logger.info("开始录制系统音频...")
            
            # 在后台线程中处理音频
            processing_thread = threading.Thread(
                target=self._process_audio_loop,
                args=(stream,),
                daemon=True
            )
            processing_thread.start()
            
            return True
            
        except Exception as e:
            logger.error(f"启动录制失败: {e}")
            self.is_recording = False
            return False
    
    def _process_audio_loop(self, stream):
        """处理音频循环（在后台线程中运行）"""
        audio_buffer = []
        
        try:
            while self.is_recording:
                try:
                    # 从队列获取音频数据（超时1秒）
                    audio_chunk = self.audio_queue.get(timeout=1.0)
                    audio_buffer.append(audio_chunk)
                    
                    # 当缓冲区达到指定时长时，进行处理
                    total_samples = sum(len(chunk) for chunk in audio_buffer)
                    if total_samples >= self.chunk_samples:
                        # 合并音频块
                        combined_audio = np.concatenate(audio_buffer, axis=0)
                        combined_audio = combined_audio.flatten()
                        
                        # 处理音频
                        text = self.process_audio_chunk(combined_audio)
                        
                        if text:
                            # 翻译文本
                            translated = self.translate_text(text)
                            
                            # 更新悬浮窗口
                            if self.floating_window:
                                self.floating_window.update_text(translated)
                        
                        # 清空缓冲区
                        audio_buffer = []
                        
                except queue.Empty:
                    # 超时，继续等待
                    continue
                except Exception as e:
                    logger.error(f"处理音频循环错误: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"音频处理循环失败: {e}")
        finally:
            if stream:
                stream.stop()
                stream.close()
            logger.info("音频处理循环已停止")
    
    def stop_recording(self):
        """停止录制"""
        self.is_recording = False
        logger.info("停止录制系统音频")
    
    def start_floating_window(self):
        """启动悬浮窗口（在独立线程中）"""
        def run_window():
            self.floating_window = FloatingWindow(self.target_lang)
            self.floating_window.create_window()
            self.floating_window.run()
        
        window_thread = threading.Thread(target=run_window, daemon=True)
        window_thread.start()
        
        # 等待窗口创建
        import time
        time.sleep(0.5)
    
    def run(self):
        """运行服务"""
        try:
            # 初始化
            self.initialize()
            
            # 启动悬浮窗口
            logger.info("启动悬浮窗口...")
            self.start_floating_window()
            
            # 等待窗口就绪
            import time
            time.sleep(1)
            
            # 开始录制
            if not self.start_recording():
                logger.error("无法启动音频录制")
                return
            
            logger.info("服务已启动，按 Ctrl+C 停止")
            
            # 保持运行
            try:
                while self.is_recording:
                    time.sleep(1)
            except KeyboardInterrupt:
                logger.info("收到停止信号")
            finally:
                self.stop_recording()
                if self.floating_window:
                    self.floating_window.close_window()
                    
        except Exception as e:
            logger.error(f"服务运行失败: {e}", exc_info=True)


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="系统音频实时字幕翻译服务")
    parser.add_argument(
        "--model",
        type=str,
        default="distil-large-v3",
        help="Whisper模型大小 (tiny, base, small, medium, large)"
    )
    parser.add_argument(
        "--target-lang",
        type=str,
        default="zh-CN",
        help="目标翻译语言 (默认: zh-CN)"
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=16000,
        help="采样率 (默认: 16000)"
    )
    parser.add_argument(
        "--chunk-duration",
        type=float,
        default=3.0,
        help="每次处理的音频时长（秒）(默认: 3.0)"
    )
    
    args = parser.parse_args()
    
    # 创建并运行服务
    service = SystemAudioSubtitleService(
        model_size=args.model,
        target_lang=args.target_lang,
        sample_rate=args.sample_rate,
        chunk_duration=args.chunk_duration
    )
    
    service.run()


if __name__ == "__main__":
    main()

