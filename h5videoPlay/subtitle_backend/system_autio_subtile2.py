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
        model_size: str = "base", # 默认改为 base，CPU 跑 large 必卡
        target_lang: str = "zh-CN",
        sample_rate: int = 16000,
        chunk_duration: float = 2.0 
    ):
        self.model_size = model_size
        self.target_lang = target_lang
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        # 每次处理的样本数
        self.chunk_samples = int(sample_rate * chunk_duration)
        
        self.model: Optional[WhisperModel] = None
        self.translator: Optional[GoogleTranslator] = None
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.floating_window = None

        self.process_thread = None 
        # 性能监控
        self.last_inference_time = 0
        
    def initialize(self):
        """初始化模型和翻译器"""
        try:
            device = "cuda" if  "Windows" in platform.system() and self._check_cuda() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            
            logger.info(f"正在加载 Whisper 模型: {self.model_size} | 设备: {device} | 类型: {compute_type}")
            
            # 关键优化：设置 CPU 线程数，防止单次推理占满所有资源导致录音卡顿
            cpu_threads = 4 if device == "cpu" else 0
            
            self.model = WhisperModel(
                self.model_size,
                device=device,
                compute_type=compute_type,
                cpu_threads=cpu_threads, 
                num_workers=1
            )
            logger.info("Whisper 模型加载成功")
            
            self.translator = GoogleTranslator(source="auto", target=self.target_lang)
            logger.info(f"翻译器初始化成功 ({self.target_lang})")
            
        except Exception as e:
            logger.error(f"初始化失败: {e}")
            # 降级处理：如果加载失败（可能是显存不足），尝试使用 CPU int8
            if device == "cuda":
                logger.info("尝试降级到 CPU 模式...")
                self.model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
            else:
                raise

    def _check_cuda(self):
        """简单检查是否有 NVIDIA 显卡"""
        try:
            import ctypes
            ctypes.cdll.LoadLibrary('nvcuda.dll')
            return True
        except:
            return False

    def get_system_audio_device(self):
        """获取音频设备 (保持原有逻辑，增加 Loopback 提示)"""
        try:
            devices = sd.query_devices()
            system = platform.system()
            
            # 优先查找的关键词
            target_keywords = []
            if system == "Darwin":
                target_keywords = ['blackhole', 'soundflower', 'loopback', 'virtual']
            elif system == "Windows":
                target_keywords = ['stereo mix', 'what u hear', '立体声混音', 'vb-audio', 'virtual']
                
            # 1. 优先匹配虚拟设备
            for i, device in enumerate(devices):
                if device['max_input_channels'] > 0:
                    name = device['name'].lower()
                    if any(k in name for k in target_keywords):
                        logger.info(f"✨ 自动选择音频设备: {device['name']} (ID: {i})")
                        return i
            
            # 2. 回退到默认设备
            default_input = sd.default.device[0]
            logger.warning(f"⚠️ 未找到虚拟内录设备，使用默认麦克风: {devices[default_input]['name']}")
            logger.warning("提示: Windows 请启用'立体声混音'，Mac 请安装 BlackHole 并配置多输出设备。")
            return default_input
                
        except Exception as e:
            logger.error(f"获取音频设备失败: {e}")
            return None

    def audio_callback(self, indata, frames, time, status):
        """音频回调：只负责塞数据，不做耗时操作"""
        if status:
            print(f"Audio Status: {status}", file=sys.stderr)
        if self.is_recording:
            self.audio_queue.put(indata.copy())

    def process_audio_chunk(self, audio_data: np.ndarray):
        """推理核心逻辑"""
        try:
            start_time = time.time()
            
            segments, info = self.model.transcribe(
                audio_data,
                beam_size=1,          # 速度最快
                best_of=1,
                temperature=0,
                vad_filter=True,      # 开启 VAD
                vad_parameters=dict(
                    min_silence_duration_ms=500, 
                    threshold=0.5     # 提高阈值，减少噪音误判
                ),
                condition_on_previous_text=False # 实时流不需要上下文，防止幻觉
            )
            
            texts = [s.text.strip() for s in segments]
            text = " ".join(texts)
            
            inference_time = time.time() - start_time
            if text:
                logger.info(f"识别: {text} [耗时: {inference_time:.2f}s, 语言: {info.language}]")
            
            return (text, info.language) if text else None
            
        except Exception as e:
            logger.error(f"推理错误: {e}")
            return None

    def _process_audio_loop(self, stream):
        """后台处理循环（包含防积压机制）"""
        audio_buffer = []
        current_samples = 0
        
        logger.info("音频处理线程已启动")
        
        while self.is_recording:
            try:
                # 1. 检查队列积压情况
                q_size = self.audio_queue.qsize()
                # 如果积压超过 5 个块（约 1-2 秒延迟），说明处理速度跟不上录音速度
                # 必须丢弃旧数据，否则延迟会无限累积
                if q_size > 5:
                    logger.warning(f"⚠️ 检测到高延迟 (积压 {q_size} 块)，正在丢弃旧音频以追赶实时...")
                    while not self.audio_queue.empty():
                        try:
                            self.audio_queue.get_nowait()
                        except queue.Empty:
                            break
                    audio_buffer = [] # 清空当前 buffer
                    current_samples = 0
                    continue

                # 2. 获取音频数据
                try:
                    # timeout 设短一点，保证循环能响应停止信号
                    chunk = self.audio_queue.get(timeout=0.5) 
                except queue.Empty:
                    continue

                audio_buffer.append(chunk)
                current_samples += len(chunk)

                # 3. 当 buffer 填满时进行处理
                if current_samples >= self.chunk_samples:
                    # 拼接音频
                    audio_np = np.concatenate(audio_buffer, axis=0).flatten().astype(np.float32)
                    
                    # 处理音频
                    result = self.process_audio_chunk(audio_np)
                    
                    if result:
                        text, detected_lang = result
                        
                        # UI更新：显示原文
                        if self.floating_window:
                            self.floating_window.update_text(text, "翻译中...")
                        
                        # 翻译逻辑
                        target = self.floating_window.target_lang if self.floating_window else self.target_lang
                        
                        # 简单的语言代码标准化
                        src_code = detected_lang.lower().split('-')[0] # zh-cn -> zh
                        tgt_code = target.lower().split('-')[0]
                        
                        if src_code != tgt_code and text.strip():
                            self._async_translate(text, detected_lang, target)
                        else:
                            if self.floating_window:
                                self.floating_window.update_text(text, text) # 同语言不翻译
                    
                    # 4. 重置 buffer (保留少量末尾数据以防止切断单词，但为了实时性，这里选择清空)
                    # 实时性优先策略：直接清空，依靠重叠窗口太慢
                    audio_buffer = []
                    current_samples = 0

            except Exception as e:
                logger.error(f"循环异常: {e}")
                time.sleep(0.1)

    def _async_translate(self, text, src, tgt):
        """异步翻译辅助函数"""
        def worker():
            try:
                # 动态调整目标语言
                if hasattr(self.translator, 'target') and self.translator.target != tgt:
                    self.translator = GoogleTranslator(source="auto", target=tgt)
                
                res = self.translator.translate(text)
                if self.floating_window:
                    self.floating_window.update_text(text, res)
            except Exception as e:
                logger.error(f"翻译失败: {e}")
                
        threading.Thread(target=worker, daemon=True).start()

    def start_recording(self):
        device_index = self.get_system_audio_device()
        if device_index is None:
            return False
            
        self.is_recording = True
        
        # 减小 blocksize，提高响应频率
        block_size = int(self.sample_rate * 0.1) # 100ms per block
        
        try:
            stream = sd.InputStream(
                device=device_index,
                channels=1,
                samplerate=self.sample_rate,
                callback=self.audio_callback,
                blocksize=block_size
            )
            stream.start()
            
            # 启动后台处理线程
            self.process_thread = threading.Thread(
                target=self._process_audio_loop,
                args=(stream,),
                daemon=True
            )
            self.process_thread.start()
            return True
        except Exception as e:
            logger.error(f"启动录音流失败: {e}")
            self.is_recording = False
            return False

    def stop_recording(self):
        self.is_recording = False

    def run(self):
        # 初始化
        try:
            self.initialize()
        except Exception as e:
            logger.error(f"初始化致命错误: {e}")
            return

        # UI 必须在主线程
        self.floating_window = FloatingWindow(self.target_lang)
        self.floating_window.create_window()
        
        # 延迟启动录音，等待 UI 加载
        self.floating_window.root.after(1000, self.start_recording)
        
        # 周期性检查录音状态，并在主循环中运行
        def check_status():
            if not self.is_recording and self.process_thread and not self.process_thread.is_alive():
                logger.info("录音线程已结束")
            else:
                self.floating_window.root.after(1000, check_status)
                
        check_status()
        
        try:
            self.floating_window.root.mainloop()
        except KeyboardInterrupt:
            pass
        finally:
            self.stop_recording()


class SystemAudioSubtitleService2:
    """系统音频字幕服务"""
    
    def __init__(
        self,
        model_size: str = "base",
        target_lang: str = "zh-CN",
        sample_rate: int = 16000,
        chunk_duration: float = 2.0  # 减小chunk时长以提高实时性
    ):
        """
        初始化服务
        
        Args:
            model_size: Whisper模型大小
            target_lang: 目标翻译语言
            sample_rate: 采样率
            chunk_duration: 每次处理的音频时长（秒），越小越实时但可能影响准确性
        """
        self.model_size = model_size
        self.target_lang = target_lang
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.chunk_samples = int(sample_rate * chunk_duration)
        
        # 优化：减小chunk时长以提高实时性（如果默认值太大）
        if chunk_duration > 2.0:
            logger.info(f"chunk_duration ({chunk_duration}s) 较大，建议使用 1.5-2.0 秒以提高实时性")
        
        self.model: Optional[WhisperModel] = None
        self.translator: Optional[GoogleTranslator] = None
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.floating_window: Optional[FloatingWindow] = None
        
        # 语言代码映射（Whisper -> Google Translator）
        self.lang_code_map = {
            "zh": "zh-CN",
            "zh-cn": "zh-CN",
            "zh-tw": "zh-TW",
            "en": "en",
            "ja": "ja",
            "ko": "ko",
            "fr": "fr",
            "de": "de",
            "es": "es",
            "ru": "ru"
        }
        
        # 语言代码映射（Whisper -> Google Translator）
        self.lang_code_map = {
            "zh": "zh-CN",
            "zh-cn": "zh-CN",
            "zh-tw": "zh-TW",
            "en": "en",
            "ja": "ja",
            "ko": "ko",
            "fr": "fr",
            "de": "de",
            "es": "es",
            "ru": "ru"
        }
        
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
    
    def process_audio_chunk(self, audio_data: np.ndarray) -> Optional[tuple]:
        """处理音频块，返回识别的文本和语言信息
        
        Returns:
            tuple: (文本, 语言代码) 或 None
        """
        try:
            # 确保音频数据是 float32 格式
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # 归一化到 [-1, 1]
            if audio_data.max() > 1.0 or audio_data.min() < -1.0:
                audio_data = audio_data / np.max(np.abs(audio_data))
            
            # 使用 Whisper 进行识别（优化参数以提高实时性）
            segments, info = self.model.transcribe(
                audio_data,
                language=None,  # 自动检测语言
                beam_size=1,  # 使用greedy解码，最快速度
                best_of=1,  # 不进行多次采样
                temperature=0,  # 确定性解码
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=400,  # 平衡静音检测，避免过度过滤
                    speech_pad_ms=200  # 语音填充
                ),
                condition_on_previous_text=False,  # 不依赖前文，提高速度
                initial_prompt=None,  # 不使用初始提示
                compression_ratio_threshold=2.4,  # 压缩比阈值
                log_prob_threshold=-1.0,  # 日志概率阈值
                no_speech_threshold=0.5  # 降低无语音阈值，避免误判
            )
            
            # 合并所有片段
            texts = []
            for segment in segments:
                text = segment.text.strip()
                if text:
                    texts.append(text)
            
            if texts:
                combined_text = " ".join(texts)
                detected_lang = info.language
                logger.info(f"识别结果: {combined_text} (语言: {detected_lang})")
                return (combined_text, detected_lang)
            
            return None
            
        except Exception as e:
            logger.error(f"处理音频失败: {e}")
            return None
    
    def translate_text_async(self, text: str, source_lang: str, target_lang: str, callback):
        """异步翻译文本
        
        Args:
            text: 要翻译的文本
            source_lang: 源语言代码
            target_lang: 目标语言代码
            callback: 翻译完成后的回调函数 callback(translated_text)
        """
        def translate_worker():
            try:
                if not self.translator:
                    callback(text)
                    return
                
                # 如果目标语言改变，重新创建翻译器
                if hasattr(self.translator, 'target') and self.translator.target != target_lang:
                    self.translator = GoogleTranslator(source="auto", target=target_lang)
                
                translated = self.translator.translate(text)
                logger.info(f"翻译结果: {translated}")
                callback(translated)
                
            except Exception as e:
                logger.warning(f"翻译失败，返回原文: {e}")
                callback(text)
        
        # 在后台线程中执行翻译
        translation_thread = threading.Thread(target=translate_worker, daemon=True)
        translation_thread.start()
    
    def normalize_lang_code(self, lang_code: str) -> str:
        """标准化语言代码（Whisper -> Google Translator）"""
        lang_lower = lang_code.lower()
        return self.lang_code_map.get(lang_lower, lang_code)
    
    def should_translate(self, detected_lang: str, target_lang: str) -> bool:
        """判断是否需要翻译"""
        # 标准化语言代码
        detected_normalized = self.normalize_lang_code(detected_lang)
        target_normalized = self.normalize_lang_code(target_lang)
        
        # 如果检测到的语言和目标语言相同，不需要翻译
        if detected_normalized.lower() == target_normalized.lower():
            return False
        
        # 特殊处理：zh 和 zh-CN 视为相同
        if (detected_normalized.lower() in ['zh', 'zh-cn'] and 
            target_normalized.lower() in ['zh', 'zh-cn']):
            return False
        
        return True
    
    def start_recording(self):
        """开始录制系统音频"""
        device_index = self.get_system_audio_device()
        if device_index is None:
            logger.error("无法找到合适的音频输入设备")
            return False
        
        try:
            self.is_recording = True
            
            # 启动音频流（减小块大小以提高实时性）
            stream = sd.InputStream(
                device=device_index,
                channels=1,  # 单声道
                samplerate=self.sample_rate,
                callback=self.audio_callback,
                blocksize=int(self.sample_rate * 0.25)  # 0.25秒的块大小，提高实时性
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
                    # 从队列获取音频数据（超时0.5秒，提高响应速度）
                    audio_chunk = self.audio_queue.get(timeout=0.5)
                    audio_buffer.append(audio_chunk)
                    
                    # 当缓冲区达到指定时长时，进行处理
                    total_samples = sum(len(chunk) for chunk in audio_buffer)
                    if total_samples >= self.chunk_samples:
                        # 合并音频块
                        combined_audio = np.concatenate(audio_buffer, axis=0)
                        combined_audio = combined_audio.flatten()
                        
                        # 处理音频（返回文本和语言）
                        result = self.process_audio_chunk(combined_audio)
                        
                        if result:
                            original_text, detected_lang = result
                            
                            # 获取目标语言
                            if self.floating_window:
                                target_lang = self.floating_window.target_lang
                            else:
                                target_lang = self.target_lang
                            
                            # 判断是否需要翻译
                            if self.should_translate(detected_lang, target_lang):
                                # 需要翻译：先显示原文，然后异步翻译
                                if self.floating_window:
                                    self.floating_window.update_text(original_text, "")
                                
                                # 异步调用翻译
                                def on_translation_complete(translated_text: str):
                                    if self.floating_window:
                                        self.floating_window.update_text(original_text, translated_text)
                                
                                self.translate_text_async(
                                    original_text,
                                    detected_lang,
                                    target_lang,
                                    on_translation_complete
                                )
                            else:
                                # 相同语言，不需要翻译，直接显示原文（原文和译文都显示原文）
                                logger.info(f"语言相同 ({detected_lang} == {target_lang})，跳过翻译，直接显示原文")
                                if self.floating_window:
                                    self.floating_window.update_text(original_text, original_text)
                        
                        # 清空缓冲区（保留最后一点音频以保持连续性）
                        # 保留最后0.3秒的音频，避免截断单词，同时提高实时性
                        keep_samples = int(self.sample_rate * 0.3)
                        if total_samples > keep_samples:
                            # 只保留最后的部分
                            audio_buffer = [audio_buffer[-1][-keep_samples:]]
                        else:
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
        """启动悬浮窗口（必须在主线程中）"""
        # macOS 要求 tkinter 必须在主线程中创建和运行
        self.floating_window = FloatingWindow(self.target_lang)
        self.floating_window.create_window()
        
        # 等待窗口创建完成
        import time
        time.sleep(0.3)
    
    def run(self):
        """运行服务"""
        try:
            # 初始化
            self.initialize()
            
            # 启动悬浮窗口（必须在主线程中创建）
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
            
            # 保持运行 - 在主线程中运行 tkinter 主循环
            try:
                if self.floating_window and self.floating_window.root:
                    # 使用 tkinter 的主循环来保持运行
                    # 但需要定期检查录制状态
                    def check_recording():
                        if self.is_recording:
                            self.floating_window.root.after(1000, check_recording)
                        else:
                            self.floating_window.root.quit()
                    
                    check_recording()
                    self.floating_window.root.mainloop()
                else:
                    # 如果没有窗口，使用简单的循环
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
        default="deepdml/faster-whisper-large-v3-turbo-ct2",
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

