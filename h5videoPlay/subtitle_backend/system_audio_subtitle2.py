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
from typing import Optional, Callable

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
# 1. 悬浮窗口类
# ---------------------------------------------------------
class FloatingWindow:
    def __init__(self, target_lang: str = "zh-CN", lang_callback: Callable = None):
        self.target_lang = target_lang
        self.lang_callback = lang_callback
        self.root = None
        self.original_text_label = None
        self.translated_text_label = None
        self.is_running = False
        
        # 拖拽相关
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
        self.root.attributes('-alpha', 0.85)
        
        # Mac 兼容性设置
        system_type = platform.system()
        self.root.overrideredirect(True)
        if system_type == "Darwin":
            try:
                self.root.createcommand('::tk::mac::OnHide', lambda: None)
            except: pass
        
        # 初始位置
        w, h = 800, 200
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - w) // 2
        y = sh - h - 100
        self.root.geometry(f"{w}x{h}+{x}+{y}")
        self.root.configure(bg='#1a1a1a')
        
        # --- 标题栏 ---
        title_bar = tk.Frame(self.root, bg="#2a2a2a", height=25, cursor="fleur")
        title_bar.pack(fill=tk.X, side=tk.TOP)
        title_bar.pack_propagate(False)
        
        title_lbl = tk.Label(title_bar, text="::: 拖拽移动 :::", fg="#888888", bg="#2a2a2a", font=("Arial", 8))
        title_lbl.pack(side=tk.LEFT, padx=10)
        
        for w in [title_bar, title_lbl]:
            w.bind("<Button-1>", self.start_drag)
            w.bind("<B1-Motion>", self.on_drag)
            
        tk.Button(title_bar, text="×", command=self.close_window, 
                 bg="#ff4444", fg="white", relief=tk.FLAT, width=3).pack(side=tk.RIGHT)

        # --- 内容区 ---
        content = tk.Frame(self.root, bg="#1a1a1a")
        content.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        self.original_text_label = tk.Label(content, text="Waiting for audio...", 
                                          font=("Arial", 14), fg="#aaaaaa", bg="#1a1a1a", 
                                          wraplength=780, justify="center")
        self.original_text_label.pack(fill=tk.X, pady=(5,5))
        
        tk.Frame(content, bg="#444444", height=1).pack(fill=tk.X, padx=20)
        
        self.translated_text_label = tk.Label(content, text="", 
                                            font=("Arial", 18, "bold"), fg="#44ff44", bg="#1a1a1a", 
                                            wraplength=780, justify="center")
        self.translated_text_label.pack(fill=tk.X, pady=(5,5))

        # --- 底部控制栏 (语言选择) ---
        control_bar = tk.Frame(self.root, bg="#1a1a1a", height=30)
        control_bar.pack(side=tk.BOTTOM, fill=tk.X, padx=10, pady=5)
        
        tk.Label(control_bar, text="目标语言:", fg="#888888", bg="#1a1a1a", font=("Arial", 10)).pack(side=tk.LEFT)
        
        self.lang_var = tk.StringVar(value=self.target_lang)
        langs = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr", "de", "es", "ru"]
        
        style = ttk.Style()
        style.theme_use('default')
        style.configure("TCombobox", fieldbackground="#333333", background="#333333", foreground="white")
        
        self.lang_combo = ttk.Combobox(control_bar, textvariable=self.lang_var, values=langs, 
                                     width=8, state="readonly", style="TCombobox")
        self.lang_combo.pack(side=tk.LEFT, padx=5)
        self.lang_combo.bind("<<ComboboxSelected>>", self.on_lang_change)
        
        resize = tk.Frame(control_bar, bg="#555555", width=12, height=12, cursor="sizing")
        resize.pack(side=tk.RIGHT, anchor=tk.SE)
        resize.bind("<Button-1>", self.start_resize)
        resize.bind("<B1-Motion>", self.on_resize)

        self.is_running = True

    def on_lang_change(self, event):
        new_lang = self.lang_var.get()
        if self.lang_callback:
            self.lang_callback(new_lang)

    def start_drag(self, event):
        self.dragging = True
        self.drag_start_x = event.x_root
        self.drag_start_y = event.y_root
        self.window_start_x = self.root.winfo_x()
        self.window_start_y = self.root.winfo_y()

    def on_drag(self, event):
        if self.dragging:
            dx = event.x_root - self.drag_start_x
            dy = event.y_root - self.drag_start_y
            self.root.geometry(f"+{self.window_start_x + dx}+{self.window_start_y + dy}")

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
            h = max(150, self.resize_start_h + dy)
            self.root.geometry(f"{w}x{h}")
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
# 2. 服务类 (已修复语言判断逻辑)
# ---------------------------------------------------------
class SystemAudioSubtitleService:
    def __init__(self, model_size="small", device = "cpu", target_lang="zh-CN", source_lang=None, 
                 sample_rate=16000, chunk_duration=2.0):
        self.model_size = model_size
        self.device = device
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
        
        self.prev_audio = np.array([], dtype=np.float32)
        self.sentence_buffer = ""
        self.last_speech_time = time.time()

    def initialize(self):
        system = platform.system()
        compute_type = "int8"
        threads = 4
        device = self.device
        if system == "Darwin":
            logger.info("💻 系统: macOS (Apple Silicon)")
            if self.model_size == "auto": self.model_size = "small"
        elif system == "Windows":
            if self._check_cuda():
                logger.info("🚀 系统: Windows (CUDA加速)")
                device = "cuda"
                compute_type = "float16"
                threads = 0
                if self.model_size == "auto": self.model_size = "deepdml/faster-whisper-large-v3-turbo-ct2"
            else:
                logger.info("💻 系统: Windows (CPU)")
                if self.model_size == "auto": self.model_size = "small"
        elif system == 'Linux':
            device = "cuda"
            compute_type = "int8"
            if self.model_size == "auto": self.model_size = "small"
        logger.info(f"⚙️ 配置: {self.model_size} | {device} | {compute_type}")
        
        self.model = WhisperModel(self.model_size, device=device, compute_type=compute_type, 
                                cpu_threads=threads, num_workers=1)
        self.update_translator(self.target_lang)
        logger.info("✅ 服务就绪")

    def _check_cuda(self):
        try:
            import ctypes
            ctypes.cdll.LoadLibrary('nvcuda.dll')
            return True
        except: return False

    def update_translator(self, new_lang):
        logger.info(f"🔄 切换目标语言: {new_lang}")
        self.target_lang = new_lang
        try:
            self.translator = GoogleTranslator(source="auto", target=new_lang)
        except Exception as e:
            logger.error(f"切换语言失败: {e}")

    def get_audio_device(self):
        try:
            devices = sd.query_devices()
            system_type = platform.system() # 获取操作系统类型: 'Linux', 'Windows', 'Darwin'
            
            # 1. 定义关键词优先级
            if system_type == 'Linux':
                # Linux 必须优先找 pulse，否则容易崩
                # 注意：Linux 下如果要“内录系统声音”，通常设备名里包含 'monitor'
                # 如果只是想不崩（录麦克风），找 'pulse'
                keywords = ['pulse', 'default'] 
            else:
                # Windows / Mac 继续找内录设备
                keywords = ['blackhole', 'soundflower', 'loopback', 'stereo mix', 'what u hear']

            # 2. 遍历查找
            for i, d in enumerate(devices):
                device_name = d['name'].lower()
                if d['max_input_channels'] > 0:
                    # 只要名字里包含关键词，就选中
                    if any(k in device_name for k in keywords):
                        # Linux 特殊处理：优先找 monitor (内录)，找不到再找普通的 pulse (麦克风)
                        if system_type == 'Linux' and 'monitor' not in device_name:
                            # 如果你想录系统声音，这里可以加个 pass 继续找 monitor
                            # 但为了保证能跑，先选中它也行
                            pass 
                        
                        print(f"🎤 [自动选择] 选中设备: {d['name']} (ID: {i})")
                        return i
            
            # 3. 如果 Linux 上没找到 pulse，千万别直接返回 default[0]，会崩
            if system_type == 'Linux':
                # 再尝试暴力搜索一次包含 'pulse' 的
                for i, d in enumerate(devices):
                    if 'pulse' in d['name'].lower() and d['max_input_channels'] > 0:
                        print(f"🎤 [自动选择] 选中设备: {d['name']} (ID: {i})")
                        return i
                        
            print('⚠️ 未匹配到优选设备，使用系统默认')
            return sd.default.device[0]
            
        except Exception as e:
            print(f"❌ 获取设备失败: {e}")
            return None

    def audio_callback(self, indata, frames, time, status):
        if self.is_recording: self.audio_queue.put(indata.copy())

    def process_audio_chunk(self, audio_data, prompt=""):
        t0 = time.time()
        try:
            segments, info = self.model.transcribe(
                audio_data, beam_size=2, best_of=1, temperature=0,
                language=self.source_lang, initial_prompt=prompt,
                vad_filter=True, vad_parameters=dict(min_silence_duration_ms=100),
                condition_on_previous_text=False
            )
            text = " ".join([s.text.strip() for s in segments])
            cost = time.time() - t0
            
            if text:
                logger.info(f"👂 原文 [{info.language}][{cost:.2f}s]: {text}")
                return text, info.language
            return None, None
        except Exception as e:
            logger.error(f"推理错误: {e}")
            return None, None

    # === 新增：判断语言是否一致 ===
    def _is_same_language(self, detected_lang, target_lang):
        """
        标准化语言代码对比
        例如: zh (Whisper) vs zh-CN (Google) -> 认为是同一种语言
        """
        if not detected_lang or not target_lang:
            return False
        # 取横杠前的部分进行对比: zh-CN -> zh
        d_code = detected_lang.lower().split('-')[0]
        t_code = target_lang.lower().split('-')[0]
        return d_code == t_code

    def _process_loop(self, stream):
        audio_buffer = []
        curr_samples = 0
        overlap_samples = int(self.sample_rate * 0.5)
        
        while self.is_recording:
            try:
                if self.audio_queue.qsize() > 6:
                    logger.warning("⚡ 丢弃积压数据...")
                    with self.audio_queue.mutex: self.audio_queue.queue.clear()
                    audio_buffer = []
                    curr_samples = 0
                    self.sentence_buffer = ""
                    continue

                try: chunk = self.audio_queue.get(timeout=0.5)
                except:
                    if time.time() - self.last_speech_time > 3.0 and self.sentence_buffer:
                        self._translate_worker(self.sentence_buffer, final=True)
                        self.sentence_buffer = ""
                    continue

                audio_buffer.append(chunk)
                curr_samples += len(chunk)

                if curr_samples >= self.chunk_samples:
                    raw_audio = np.concatenate(audio_buffer, axis=0).flatten().astype(np.float32)
                    if len(self.prev_audio) > 0:
                        proc_audio = np.concatenate((self.prev_audio, raw_audio))
                    else:
                        proc_audio = raw_audio
                    
                    self.prev_audio = raw_audio[-overlap_samples:]
                    prompt = self.sentence_buffer[-50:] if self.sentence_buffer else ""
                    
                    text, lang = self.process_audio_chunk(proc_audio, prompt)
                    
                    if text:
                        self.last_speech_time = time.time()
                        
                        # 文本拼接逻辑
                        if not self.sentence_buffer.endswith(text):
                            sep = " " if self.sentence_buffer and not self._is_cjk(text) else ""
                            self.sentence_buffer += sep + text
                        self.sentence_buffer = self.sentence_buffer.strip()
                        
                        # 1. 先在原文区域显示（带省略号表示未完）
                        if self.floating_window:
                            self.floating_window.update_text(self.sentence_buffer, "...")
                        
                        # 2. 判断是否需要翻译 (修复后的逻辑)
                        if not self._is_same_language(lang, self.target_lang):
                            self._translate_worker(self.sentence_buffer, final=False)
                        else:
                            # 同语言：译文区直接显示原文
                            logger.info(f"⏭️ 同语言 [{lang}=={self.target_lang}]，跳过翻译")
                            if self.floating_window:
                                self.floating_window.update_text(self.sentence_buffer, self.sentence_buffer)
                    
                    audio_buffer = []
                    curr_samples = 0
            except Exception as e:
                pass

    def _is_cjk(self, text):
        if not text: return False
        return any(u'\u4e00' <= char <= u'\u9fff' for char in text)

    def _translate_worker(self, text, final=False):
        def task():
            t0 = time.time()
            try:
                if hasattr(self.translator, 'target') and self.translator.target != self.target_lang:
                    self.translator = GoogleTranslator(source="auto", target=self.target_lang)
                
                res = self.translator.translate(text)
                cost = time.time() - t0
                logger.info(f"🌍 译文 [{cost:.2f}s]: {res}")
                
                if self.floating_window:
                    self.floating_window.update_text(text, res)
            except Exception as e:
                logger.error(f"翻译失败: {e}")
        threading.Thread(target=task, daemon=True).start()

    def start(self):
        self.initialize()
        self.floating_window = FloatingWindow(self.target_lang, self.update_translator)
        self.floating_window.create_window()
        
        idx = self.get_audio_device()
        if idx is None: return
        
        self.is_recording = True
        stream = sd.InputStream(device=idx, channels=1, samplerate=self.sample_rate,
                              callback=self.audio_callback, blocksize=int(self.sample_rate*0.1))
        stream.start()
        
        self.process_thread = threading.Thread(target=self._process_loop, args=(stream,), daemon=True)
        self.process_thread.start()
        
        def keep_alive():
            if not self.is_recording:
                if self.process_thread and not self.process_thread.is_alive():
                    self.floating_window.root.quit()
            else:
                self.floating_window.root.after(1000, keep_alive)
        keep_alive()
        
        try: self.floating_window.root.mainloop()
        except: pass
        finally:
            self.is_recording = False
            stream.stop()

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default="auto")
    parser.add_argument("--device", type=str, default="cpu")
    parser.add_argument("--source-lang", type=str, default=None)
    parser.add_argument("--target-lang", type=str, default="zh-CN")
    parser.add_argument("--chunk-duration", type=float, default=2.0)
    
    args = parser.parse_args()
    
    s = SystemAudioSubtitleService(
        model_size=args.model,device=args.device, target_lang=args.target_lang, source_lang=args.source_lang, chunk_duration=args.chunk_duration
    )
    s.start()

if __name__ == "__main__":
    main()