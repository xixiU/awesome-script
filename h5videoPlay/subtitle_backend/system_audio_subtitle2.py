#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import queue
import threading
import logging
import platform
import time
import tkinter as tk
from tkinter import ttk
from typing import Optional

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from deep_translator import GoogleTranslator

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# 1. 悬浮窗口类 (针对 Mac 拖拽优化)
# ---------------------------------------------------------
class FloatingWindow:
    def __init__(self, target_lang: str = "zh-CN"):
        self.target_lang = target_lang
        self.root = None
        self.original_text_label = None
        self.translated_text_label = None
        self.is_running = False
        
        # 拖拽相关变量
        self.drag_start_x = 0
        self.drag_start_y = 0
        self.window_start_x = 0
        self.window_start_y = 0
        self.dragging = False
        self.resizing = False
        
    def create_window(self):
        self.root = tk.Tk()
        self.root.title("实时字幕")
        self.root.attributes('-topmost', True)
        self.root.attributes('-alpha', 0.85) # 稍微透明一点
        
        # === Mac 兼容性关键设置 ===
        system_type = platform.system()
        if system_type == "Darwin":
            # Mac 上完全去除边框会导致难以跨屏
            # 但为了美观我们保留 overrideredirect，通过逻辑修复
            self.root.overrideredirect(True)
            try:
                # 尝试让窗口在所有 Spaces 中可见（Mac特有）
                # 这有助于跨屏拖拽
                self.root.createcommand('::tk::mac::OnHide', lambda: None) 
            except:
                pass
        else:
            self.root.overrideredirect(True)
        
        # 初始位置
        w, h = 800, 180
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - w) // 2
        y = sh - h - 100
        self.root.geometry(f"{w}x{h}+{x}+{y}")
        self.root.configure(bg='#1a1a1a')
        
        # 标题栏（拖拽区）
        title_bar = tk.Frame(self.root, bg="#2a2a2a", height=30, cursor="fleur")
        title_bar.pack(fill=tk.X, side=tk.TOP)
        title_bar.pack_propagate(False)
        
        title_label = tk.Label(title_bar, text="::: 按住此处拖拽 (Mac如卡顿请快速拖动) :::", 
                             fg="#888888", bg="#2a2a2a", font=("Arial", 8))
        title_label.pack(side=tk.LEFT, padx=10, pady=5)
        
        # 绑定拖拽
        for widget in [title_bar, title_label]:
            widget.bind("<Button-1>", self.start_drag)
            widget.bind("<B1-Motion>", self.on_drag)
        
        # 关闭按钮
        tk.Button(title_bar, text="×", command=self.close_window, 
                 bg="#ff4444", fg="white", relief=tk.FLAT, width=3).pack(side=tk.RIGHT)
        
        # 内容区
        content = tk.Frame(self.root, bg="#1a1a1a")
        content.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        self.original_text_label = tk.Label(content, text="Waiting...", 
                                          font=("Arial", 14), fg="#aaaaaa", bg="#1a1a1a", 
                                          wraplength=780, justify="center")
        self.original_text_label.pack(fill=tk.X, pady=(5,5))
        
        tk.Frame(content, bg="#444444", height=1).pack(fill=tk.X, padx=20)
        
        self.translated_text_label = tk.Label(content, text="", 
                                            font=("Arial", 18, "bold"), fg="#44ff44", bg="#1a1a1a", 
                                            wraplength=780, justify="center")
        self.translated_text_label.pack(fill=tk.X, pady=(5,5))
        
        # 调整大小手柄
        resize = tk.Frame(self.root, bg="#555555", width=15, height=15, cursor="sizing")
        resize.place(relx=1.0, rely=1.0, anchor=tk.SE)
        resize.bind("<Button-1>", self.start_resize)
        resize.bind("<B1-Motion>", self.on_resize)
        
        self.is_running = True

    # === 优化后的拖拽逻辑 (绝对坐标) ===
    def start_drag(self, event):
        self.dragging = True
        self.drag_start_x = event.x_root
        self.drag_start_y = event.y_root
        # 记录窗口当前的绝对位置
        self.window_start_x = self.root.winfo_x()
        self.window_start_y = self.root.winfo_y()

    def on_drag(self, event):
        if self.dragging:
            # 计算鼠标移动的绝对距离
            dx = event.x_root - self.drag_start_x
            dy = event.y_root - self.drag_start_y
            
            # 新位置 = 初始位置 + 偏移量
            new_x = self.window_start_x + dx
            new_y = self.window_start_y + dy
            
            self.root.geometry(f"+{new_x}+{new_y}")

    def start_resize(self, event):
        self.resizing = True
        self.resize_start_x = event.x_root
        self.resize_start_y = event.y_root
        self.resize_start_w = self.root.winfo_width()
        self.resize_start_h = self.root.winfo_height()

    def on_resize(self, event):
        if self.resizing:
            dx = event.x_root - self.resize_start_x
            dy = event.y_root - self.resize_start_y
            w = max(300, self.resize_start_w + dx)
            h = max(100, self.resize_start_h + dy)
            self.root.geometry(f"{w}x{h}")
            # 更新自动换行宽度
            self.original_text_label.config(wraplength=w-20)
            self.translated_text_label.config(wraplength=w-20)

    def update_text(self, org, trans):
        if not self.root: return
        self.root.after(0, lambda: self._update_ui(org, trans))
        
    def _update_ui(self, org, trans):
        if self.original_text_label: self.original_text_label.config(text=org)
        if self.translated_text_label: self.translated_text_label.config(text=trans)

    def close_window(self):
        self.is_running = False
        if self.root:
            self.root.destroy()
            self.root = None

# ---------------------------------------------------------
# 2. 核心服务类 (日志已加回)
# ---------------------------------------------------------
class SystemAudioSubtitleService:
    def __init__(self, model_size="small", target_lang="zh-CN", source_lang=None, 
                 sample_rate=16000, chunk_duration=2.0):
        self.model_size = model_size
        self.target_lang = target_lang
        self.source_lang = source_lang
        self.sample_rate = sample_rate
        self.chunk_samples = int(sample_rate * chunk_duration)
        
        self.model = None
        self.translator = None
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.process_thread = None
        self.floating_window = None
        
        # 缓冲变量
        self.prev_audio = np.array([], dtype=np.float32)
        self.sentence_buffer = ""
        self.last_speech_time = time.time()

    def initialize(self):
        system = platform.system()
        device = "cpu"
        compute_type = "int8"
        threads = 4
        
        # 硬件自动配置
        if system == "Darwin":
            logger.info("💻 系统: macOS (Apple Silicon)")
            if self.model_size == "auto": self.model_size = "small"
        elif system == "Windows":
            logger.info("💻 系统: Windows")
            if self._check_cuda():
                logger.info("🚀 加速: 检测到 NVIDIA 显卡 (CUDA)")
                device = "cuda"
                compute_type = "float16"
                threads = 0
                if self.model_size == "auto": self.model_size = "deepdml/faster-whisper-large-v3-turbo-ct2"
            else:
                logger.info("🐢 模式: 纯 CPU 运行")
                if self.model_size == "auto": self.model_size = "small"
        
        logger.info(f"⚙️ 模型配置: {self.model_size} | 设备: {device} | 精度: {compute_type}")
        
        try:
            self.model = WhisperModel(self.model_size, device=device, compute_type=compute_type, 
                                    cpu_threads=threads, num_workers=1, download_root="./models")
            self.translator = GoogleTranslator(source="auto", target=self.target_lang)
            logger.info("✅ 服务初始化完成")
        except Exception as e:
            logger.error(f"❌ 初始化失败: {e}")
            sys.exit(1)

    def _check_cuda(self):
        try:
            import ctypes
            ctypes.cdll.LoadLibrary('nvcuda.dll')
            return True
        except: return False

    def get_audio_device(self):
        try:
            devices = sd.query_devices()
            keywords = ['blackhole', 'soundflower', 'loopback', 'stereo mix', 'what u hear']
            for i, d in enumerate(devices):
                if d['max_input_channels'] > 0 and any(k in d['name'].lower() for k in keywords):
                    logger.info(f"🎤 选中内录设备: {d['name']} (ID: {i})")
                    return i
            logger.warning(f"⚠️ 未找到内录设备，使用默认: {devices[sd.default.device[0]]['name']}")
            return sd.default.device[0]
        except: return None

    def audio_callback(self, indata, frames, time, status):
        if self.is_recording: self.audio_queue.put(indata.copy())

    def process_audio_chunk(self, audio_data, prompt=""):
        start_time = time.time()
        try:
            segments, info = self.model.transcribe(
                audio_data, beam_size=1, best_of=1, temperature=0,
                language=self.source_lang, initial_prompt=prompt,
                vad_filter=True, vad_parameters=dict(min_silence_duration_ms=400),
                condition_on_previous_text=False
            )
            text = " ".join([s.text.strip() for s in segments])
            cost = time.time() - start_time
            
            if text:
                # === 日志 1：原文识别 ===
                logger.info(f"👂 原文 [{info.language}][{cost:.2f}s]: {text}")
                return text, info.language
            return None, None
        except Exception as e:
            logger.error(f"推理错误: {e}")
            return None, None

    def _process_loop(self, stream):
        audio_buffer = []
        curr_samples = 0
        overlap_sec = 0.5
        overlap_samples = int(self.sample_rate * overlap_sec)
        
        while self.is_recording:
            try:
                # 积压处理
                q_size = self.audio_queue.qsize()
                if q_size > 6:
                    logger.warning(f"⚡ 丢弃积压数据 ({q_size}块) 以追赶实时...")
                    with self.audio_queue.mutex: self.audio_queue.queue.clear()
                    audio_buffer = []
                    curr_samples = 0
                    self.sentence_buffer = ""
                    continue

                try: chunk = self.audio_queue.get(timeout=0.5)
                except: 
                    # 超时检测：如果很久没说话，强制结算
                    if time.time() - self.last_speech_time > 3.0 and self.sentence_buffer:
                        self._translate(self.sentence_buffer, final=True)
                        self.sentence_buffer = ""
                    continue

                audio_buffer.append(chunk)
                curr_samples += len(chunk)

                if curr_samples >= self.chunk_samples:
                    raw_audio = np.concatenate(audio_buffer, axis=0).flatten().astype(np.float32)
                    
                    # 拼接重叠部分
                    if len(self.prev_audio) > 0:
                        proc_audio = np.concatenate((self.prev_audio, raw_audio))
                    else:
                        proc_audio = raw_audio
                        
                    self.prev_audio = raw_audio[-overlap_samples:]
                    
                    # 提示词
                    prompt = self.sentence_buffer[-50:] if self.sentence_buffer else ""
                    text, lang = self.process_audio_chunk(proc_audio, prompt)
                    
                    if text:
                        self.last_speech_time = time.time()
                        
                        # 简单去重
                        if not self.sentence_buffer.endswith(text):
                            if self.sentence_buffer and not self.sentence_buffer.endswith(('?','.','!','。','！')):
                                self.sentence_buffer += " " + text
                            else:
                                self.sentence_buffer = text
                        
                        self.sentence_buffer = self.sentence_buffer.strip().replace("  ", " ")
                        
                        if self.floating_window:
                            self.floating_window.update_text(self.sentence_buffer, "...")
                        
                        # 翻译
                        if self.target_lang.lower() not in lang.lower():
                            self._translate(self.sentence_buffer)
                        else:
                            # 同语言不翻译
                            if self.floating_window:
                                self.floating_window.update_text(self.sentence_buffer, self.sentence_buffer)
                    
                    audio_buffer = []
                    curr_samples = 0
                    
            except Exception as e:
                logger.error(f"循环异常: {e}")

    def _translate(self, text, final=False):
        def worker():
            t0 = time.time()
            try:
                if hasattr(self.translator, 'target') and self.translator.target != self.target_lang:
                    self.translator = GoogleTranslator(source="auto", target=self.target_lang)
                
                res = self.translator.translate(text)
                cost = time.time() - t0
                
                # === 日志 2：翻译 ===
                logger.info(f"🌍 译文 [{cost:.2f}s]: {res}")
                
                if self.floating_window:
                    self.floating_window.update_text(text, res)
            except Exception as e:
                logger.error(f"翻译失败: {e}")
        
        threading.Thread(target=worker, daemon=True).start()

    def start(self):
        self.initialize()
        self.floating_window = FloatingWindow(self.target_lang)
        self.floating_window.create_window()
        
        dev_idx = self.get_audio_device()
        if dev_idx is None: return
        
        self.is_recording = True
        stream = sd.InputStream(device=dev_idx, channels=1, samplerate=self.sample_rate,
                              callback=self.audio_callback, blocksize=int(self.sample_rate*0.1))
        stream.start()
        
        self.process_thread = threading.Thread(target=self._process_loop, args=(stream,), daemon=True)
        self.process_thread.start()
        
        logger.info("🚀 服务已启动，请查看悬浮窗")
        
        # 保持运行的检查
        def keep_alive():
            if not self.is_recording:
                if self.process_thread and not self.process_thread.is_alive():
                    self.floating_window.root.quit()
            else:
                self.floating_window.root.after(1000, keep_alive)
        
        keep_alive()
        try:
            self.floating_window.root.mainloop()
        except: pass
        finally:
            self.is_recording = False
            stream.stop()

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default="auto", help="auto, small, medium")
    parser.add_argument("--source-lang", type=str, default=None, help="en, ja, de")
    parser.add_argument("--target-lang", type=str, default="zh-CN")
    args = parser.parse_args()
    
    service = SystemAudioSubtitleService(
        model_size=args.model,
        target_lang=args.target_lang,
        source_lang=args.source_lang
    )
    service.start()

if __name__ == "__main__":
    main()