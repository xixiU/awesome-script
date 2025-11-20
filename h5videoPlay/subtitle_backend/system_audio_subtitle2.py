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
                #device=device,
                #compute_type=compute_type,
                compute_type="int8",
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

