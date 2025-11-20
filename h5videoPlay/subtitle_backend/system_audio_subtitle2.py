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
import time
import re
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
        self.original_text_label = None
        self.translated_text_label = None
        self.is_running = False
        self.current_original = ""
        self.current_translated = ""
        self.lock = threading.Lock()
        
        # 拖拽相关变量
        self.drag_start_x = 0
        self.drag_start_y = 0
        self.dragging = False
        self.resizing = False
        self.resize_corner = None
        
    def create_window(self):
        """创建悬浮窗口"""
        self.root = tk.Tk()
        self.root.title("实时字幕翻译")
        self.root.attributes('-topmost', True)  # 始终置顶
        self.root.attributes('-alpha', 0.9)  # 半透明
        
        # macOS 多屏幕支持：设置窗口可以在所有空间显示
        if platform.system() == "Darwin":
            try:
                # 尝试设置窗口类型，允许跨屏幕拖拽
                # 使用 'utility' 类型可能有助于跨屏幕
                self.root.attributes('-type', 'utility')
            except:
                # 如果设置失败，尝试其他方法
                try:
                    # 尝试设置为浮动窗口
                    self.root.attributes('-type', 'floating')
                except:
                    pass
        
        # 设置窗口大小和位置
        window_width = 600
        window_height = 180
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = screen_height - window_height - 50  # 底部居中
        
        self.root.geometry(f'{window_width}x{window_height}+{x}+{y}')
        self.root.overrideredirect(True)  # 无边框
        
        # 设置背景色
        self.root.configure(bg='#1a1a1a')
        
        # 创建标题栏（用于拖拽）
        title_bar = tk.Frame(self.root, bg="#2a2a2a", height=30, cursor="fleur")
        title_bar.pack(fill=tk.X, side=tk.TOP)
        title_bar.pack_propagate(False)
        
        # 标题栏标签
        title_label = tk.Label(
            title_bar,
            text="实时字幕翻译 (可拖拽移动，右下角可调整大小)",
            font=("Arial", 9),
            fg="#CCCCCC",
            bg="#2a2a2a"
        )
        title_label.pack(side=tk.LEFT, padx=10, pady=5)
        
        # 绑定拖拽事件到标题栏
        title_bar.bind("<Button-1>", self.start_drag)
        title_bar.bind("<B1-Motion>", self.on_drag)
        title_label.bind("<Button-1>", self.start_drag)
        title_label.bind("<B1-Motion>", self.on_drag)
        
        # 关闭按钮（在标题栏）
        close_btn = tk.Button(
            title_bar,
            text="×",
            font=("Arial", 14, "bold"),
            fg="#FFFFFF",
            bg="#ff4444",
            width=3,
            command=self.close_window,
            relief=tk.FLAT
        )
        close_btn.pack(side=tk.RIGHT, padx=5, pady=2)
        
        # 内容区域
        content_frame = tk.Frame(self.root, bg="#1a1a1a")
        content_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # 原文标签（第一行）
        self.original_text_label = tk.Label(
            content_frame,
            text="等待音频输入...",
            font=("Arial", 16, "bold"),
            fg="#FFFFFF",
            bg="#1a1a1a",
            wraplength=580,
            justify="center",
            padx=10,
            pady=5,
            anchor="n"
        )
        self.original_text_label.pack(fill=tk.X, pady=(5, 0))
        
        # 分隔线
        separator = tk.Frame(content_frame, bg="#444444", height=1)
        separator.pack(fill=tk.X, padx=10, pady=5)
        
        # 译文标签（第二行）
        self.translated_text_label = tk.Label(
            content_frame,
            text="",
            font=("Arial", 16),
            fg="#88CC88",
            bg="#1a1a1a",
            wraplength=580,
            justify="center",
            padx=10,
            pady=5,
            anchor="n"
        )
        self.translated_text_label.pack(fill=tk.X, pady=(0, 5))
        
        # 底部控制栏
        control_frame = tk.Frame(self.root, bg="#1a1a1a")
        control_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=5)
        
        # 语言选择下拉框
        lang_frame = tk.Frame(control_frame, bg="#1a1a1a")
        lang_frame.pack(side=tk.LEFT, padx=10)
        
        tk.Label(
            lang_frame,
            text="目标语言:",
            font=("Arial", 9),
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
        
        # 调整大小区域（右下角）
        resize_area = tk.Frame(self.root, bg="#444444", width=20, height=20, cursor="sizing")
        resize_area.place(relx=1.0, rely=1.0, anchor=tk.SE)
        resize_area.bind("<Button-1>", self.start_resize)
        resize_area.bind("<B1-Motion>", self.on_resize)
        resize_area.bind("<ButtonRelease-1>", self.stop_resize)
        
        # 绑定窗口边缘调整大小（只在右下角区域）
        # 注意：不要在整个窗口上绑定，避免与拖拽冲突
        
        self.is_running = True
    
    def start_drag(self, event):
        """开始拖拽"""
        self.dragging = True
        self.drag_start_x = event.x_root
        self.drag_start_y = event.y_root
    
    def on_drag(self, event):
        """拖拽中"""
        if self.dragging:
            dx = event.x_root - self.drag_start_x
            dy = event.y_root - self.drag_start_y
            x = self.root.winfo_x() + dx
            y = self.root.winfo_y() + dy
            self.root.geometry(f"+{x}+{y}")
            self.drag_start_x = event.x_root
            self.drag_start_y = event.y_root
    
    def start_resize(self, event):
        """开始调整大小"""
        self.resizing = True
        self.resize_start_x = event.x_root
        self.resize_start_y = event.y_root
        self.resize_start_width = self.root.winfo_width()
        self.resize_start_height = self.root.winfo_height()
    
    def on_resize(self, event):
        """调整大小中"""
        if self.resizing:
            dx = event.x_root - self.resize_start_x
            dy = event.y_root - self.resize_start_y
            new_width = max(400, self.resize_start_width + dx)
            new_height = max(150, self.resize_start_height + dy)
            self.root.geometry(f"{new_width}x{new_height}")
            # 更新文本标签的wraplength以适应新宽度
            if self.original_text_label:
                self.original_text_label.config(wraplength=new_width - 40)
            if self.translated_text_label:
                self.translated_text_label.config(wraplength=new_width - 40)
    
    def stop_resize(self, event):
        """停止调整大小"""
        self.resizing = False
        if hasattr(self, 'dragging'):
            self.dragging = False
        
    def on_lang_change(self, event=None):
        """语言改变回调"""
        self.target_lang = self.lang_var.get()
        logger.info(f"目标语言已更改为: {self.target_lang}")
        
    def update_text(self, original_text: str, translated_text: str = ""):
        """更新显示文本
        
        Args:
            original_text: 识别到的原文
            translated_text: 翻译后的文本
        """
        if not self.is_running or not self.root:
            return
            
        with self.lock:
            self.current_original = original_text
            self.current_translated = translated_text
            
        # 在主线程中更新UI
        if self.root:
            self.root.after(0, self._update_text_ui, original_text, translated_text)
    
    def _update_text_ui(self, original_text: str, translated_text: str):
        """在UI线程中更新文本（在主线程中调用）"""
        if self.original_text_label:
            if original_text:
                self.original_text_label.config(text=original_text)
            else:
                self.original_text_label.config(text="等待音频输入...")
        
        if self.translated_text_label:
            if translated_text:
                self.translated_text_label.config(text=translated_text)
            else:
                self.translated_text_label.config(text="")
    
    def close_window(self):
        """关闭窗口"""
        self.is_running = False
        if self.root:
            try:
                self.root.quit()
            except:
                pass
            try:
                self.root.destroy()
            except:
                pass

class SystemAudioSubtitleService:
    def __init__(
        self,
        model_size: str = "small", 
        target_lang: str = "zh-CN",
        source_lang: str = None,   
        sample_rate: int = 16000,
        chunk_duration: float = 2.0 
    ):
        self.model_size = model_size
        self.target_lang = target_lang
        self.source_lang = source_lang 
        self.sample_rate = sample_rate
        self.chunk_samples = int(sample_rate * chunk_duration)
        
        self.model = None
        self.translator = None
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.floating_window = None
        self.process_thread = None
        
        # === 优化变量 ===
        self.prev_audio = np.array([], dtype=np.float32) # 音频重叠缓冲
        self.sentence_buffer = ""     # 文本拼接缓冲（累积未完成的句子）
        self.last_speech_time = time.time() # 最后一次说话的时间

    def initialize(self):
        try:
            system = platform.system()
            
            # 硬件自动选择逻辑
            if system == "Darwin": 
                logger.info("🍎 macOS (Apple Silicon) 模式")
                device = "auto"
                compute_type = "int8" 
                threads = 4
                if self.model_size == "auto": self.model_size = "small"

            elif system == "Windows":
                if self._check_cuda():
                    logger.info("🟢 Windows (CUDA) 模式")
                    device = "cuda"
                    compute_type = "float16"
                    threads = 0
                    if self.model_size == "auto": self.model_size = "deepdml/faster-whisper-large-v3-turbo-ct2"
                else:
                    logger.info("⚠️ Windows (CPU) 模式")
                    device = "cpu"
                    compute_type = "int8"
                    threads = 4
                    if self.model_size == "auto": self.model_size = "small"
            else:
                device = "cpu"; compute_type = "int8"; threads = 4
                if self.model_size == "auto": self.model_size = "small"

            logger.info(f"🚀 配置: [{self.model_size}] | Dev: {device} | Prec: {compute_type}")
            
            self.model = WhisperModel(
                self.model_size,
                device=device,
                compute_type=compute_type,
                cpu_threads=threads,
                num_workers=1,
                download_root="./models"
            )
            
            self.translator = GoogleTranslator(source="auto", target=self.target_lang)
            
        except Exception as e:
            logger.error(f"❌ 初始化失败: {e}")
            raise

    def _check_cuda(self):
        try:
            import ctypes
            ctypes.cdll.LoadLibrary('nvcuda.dll')
            return True
        except: return False

    def get_system_audio_device(self):
        try:
            devices = sd.query_devices()
            keywords = ['blackhole', 'soundflower', 'loopback', 'stereo mix', 'what u hear', '立体声混音']
            for i, d in enumerate(devices):
                if d['max_input_channels'] > 0 and any(k in d['name'].lower() for k in keywords):
                    return i
            return sd.default.device[0]
        except: return None

    def audio_callback(self, indata, frames, time, status):
        if self.is_recording:
            self.audio_queue.put(indata.copy())

    def process_audio_chunk(self, audio_data: np.ndarray, prompt_text: str = ""):
        """
        处理音频块
        :param prompt_text: 上下文提示词（上一句识别的内容）
        """
        try:
            # Whisper 参数优化：加入 initial_prompt 提高连贯性
            segments, info = self.model.transcribe(
                audio_data,
                beam_size=1,
                best_of=1,
                temperature=0,
                language=self.source_lang, 
                initial_prompt=prompt_text,  # 💡 关键：告诉模型上一句说了啥
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=400), 
                condition_on_previous_text=False # 实时流建议关掉，用 prompt 代替
            )
            
            text = " ".join([s.text.strip() for s in segments])
            return (text, info.language) if text else None
            
        except Exception as e:
            logger.error(f"推理错误: {e}")
            return None

    def _is_sentence_end(self, text: str) -> bool:
        """判断一句话是否说完（根据标点符号）"""
        if not text: return False
        # 检查常见的结束标点
        return any(text.endswith(p) for p in ['.', '?', '!', '。', '？', '！'])

    def _process_audio_loop(self, stream):
        audio_buffer = []
        current_samples = 0
        
        # 定义重叠时长（秒）
        overlap_duration = 0.5 
        overlap_samples = int(self.sample_rate * overlap_duration)
        
        while self.is_recording:
            try:
                # 1. 队列防积压（保留最新数据）
                if self.audio_queue.qsize() > 6:
                    with self.audio_queue.mutex:
                        self.audio_queue.queue.clear()
                    audio_buffer = []
                    current_samples = 0
                    # 清空文本缓存，重新开始
                    self.sentence_buffer = ""
                    continue

                try:
                    chunk = self.audio_queue.get(timeout=0.5)
                except queue.Empty:
                    # 如果长时间没有新音频（比如暂停了），清空文本缓冲
                    if time.time() - self.last_speech_time > 3.0 and self.sentence_buffer:
                        if self.floating_window:
                            # 最终翻译一次完整的
                            self._async_translate(self.sentence_buffer, self.target_lang, final=True)
                        self.sentence_buffer = ""
                    continue

                audio_buffer.append(chunk)
                current_samples += len(chunk)

                if current_samples >= self.chunk_samples:
                    # 2. 拼接音频：上一段的尾巴 + 这一段
                    current_audio = np.concatenate(audio_buffer, axis=0).flatten().astype(np.float32)
                    
                    if len(self.prev_audio) > 0:
                        # 加上重叠部分
                        process_audio = np.concatenate((self.prev_audio, current_audio))
                    else:
                        process_audio = current_audio
                        
                    # 保存这段的尾部给下一次用
                    self.prev_audio = current_audio[-overlap_samples:]
                    
                    # 3. 推理：传入当前缓冲区的内容作为提示词，帮助上下文连接
                    # 取缓冲区最后50个字符作为提示
                    prompt = self.sentence_buffer[-50:] if self.sentence_buffer else ""
                    result = self.process_audio_chunk(process_audio, prompt_text=prompt)
                    
                    if result:
                        text, detected_lang = result
                        
                        # 简单清洗文本（去重）
                        # 有时候 Whisper 会因为重叠音频重复输出几个词，这里做简单去重
                        if self.sentence_buffer.endswith(text):
                            text = "" # 完全重复，忽略
                        
                        if text.strip():
                            self.last_speech_time = time.time()
                            
                            # === 💡 核心逻辑：文本拼接缓冲 ===
                            # 如果是新的一句话（比如上一句已经有标点了），加空格
                            if self.sentence_buffer and not self._is_sentence_end(self.sentence_buffer):
                                self.sentence_buffer += " " + text
                            else:
                                # 如果上一句已经结束了，或者缓冲区为空，直接赋值（保留一点上下文? 不，直接开新句）
                                # 这里策略：只要缓冲区不太长，就一直追加，交给谷歌翻译去处理语序
                                if len(self.sentence_buffer) > 200: # 防止无限长
                                    self.sentence_buffer = text
                                else:
                                    self.sentence_buffer += " " + text
                            
                            # 清理多余空格
                            self.sentence_buffer = self.sentence_buffer.strip()
                            
                            # 更新UI显示（显示当前正在积累的完整长句）
                            if self.floating_window:
                                self.floating_window.update_text(self.sentence_buffer, "...")
                            
                            # 4. 翻译逻辑
                            # 只有当原文不是中文时才翻译
                            if self.target_lang.lower() not in detected_lang.lower():
                                self._async_translate(self.sentence_buffer, self.target_lang)
                            else:
                                if self.floating_window:
                                    self.floating_window.update_text(self.sentence_buffer, self.sentence_buffer)
                            
                            # 5. 如果检测到句号，可以在稍后清空缓冲区
                            # 为了视觉稳定性，我们不立即清空，而是等下一句话开始时或者超时后清空
                            if self._is_sentence_end(text):
                                # 可以在这里标记一下，或者什么都不做，等长度超标自动重置
                                pass

                    audio_buffer = []
                    current_samples = 0
            except Exception as e:
                logger.error(f"Loop Error: {e}")

    def _async_translate(self, text, tgt, final=False):
        def worker():
            try:
                if hasattr(self.translator, 'target') and self.translator.target != tgt:
                    self.translator = GoogleTranslator(source="auto", target=tgt)
                
                res = self.translator.translate(text)
                
                if self.floating_window:
                    # 如果是最终确认的句子（超时结算），可以去掉省略号
                    self.floating_window.update_text(text, res)
            except:
                pass
        threading.Thread(target=worker, daemon=True).start()

    # ... (start_recording, stop_recording, run 等方法保持不变，直接复制之前的即可)
    def start_recording(self):
        idx = self.get_system_audio_device()
        if idx is None: return False
        self.is_recording = True
        try:
            stream = sd.InputStream(device=idx, channels=1, samplerate=self.sample_rate,
                                  callback=self.audio_callback, blocksize=int(self.sample_rate * 0.1))
            stream.start()
            self.process_thread = threading.Thread(target=self._process_audio_loop, args=(stream,), daemon=True)
            self.process_thread.start()
            return True
        except Exception as e:
            logger.error(e); return False

    def stop_recording(self):
        self.is_recording = False

    def run(self):
        self.initialize()
        self.floating_window = FloatingWindow(self.target_lang) 
        self.floating_window.create_window()
        self.floating_window.root.after(1000, self.start_recording)
        def check():
            if not self.is_recording:
                if self.process_thread and not self.process_thread.is_alive(): sys.exit(0)
            else: self.floating_window.root.after(1000, check)
        check()
        try: self.floating_window.root.mainloop()
        except: pass
        finally: self.stop_recording()


def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description="系统音频实时字幕翻译服务")
    parser.add_argument(
        "--model",
        type=str,
        #default="deepdml/faster-whisper-large-v3-turbo-ct2",
        default="small",
        #default="distil-large-v3",
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
        default=2.0,
        help="每次处理的音频时长（秒）(默认: 2.0，越小越实时)"
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

