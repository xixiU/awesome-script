#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
悬浮窗口UI模块
负责显示实时字幕和控制界面
"""
import queue
import platform
import tkinter as tk
from tkinter import ttk
from typing import Optional, Callable


class FloatingWindow:
    """实时字幕悬浮窗口"""
    
    def __init__(self, target_lang: str = "zh-CN", source_lang: str = "Auto", 
                 lang_callback: Callable = None, source_lang_callback: Callable = None,
                 model_callback: Callable = None, available_models: list = None, current_model: str = "whisper"):
        self.target_lang = target_lang
        self.source_lang = source_lang if source_lang else "Auto"
        self.lang_callback = lang_callback
        self.source_lang_callback = source_lang_callback
        self.model_callback = model_callback
        self.available_models = available_models or ["whisper"]
        self.current_model = current_model
        self.root = None
        self.original_text_label = None
        self.translated_text_label = None
        self.is_running = False
        self.show_latency_var = None  # 延迟显示开关
        
        # 缓存最后一次显示的文本和延迟信息，用于切换开关时即时刷新
        self.last_org = "Waiting for audio..."
        self.last_trans = ""
        self.last_latencies = {}

        # 拖拽相关
        self.drag_start_x = 0
        self.drag_start_y = 0
        self.window_start_x = 0
        self.window_start_y = 0
        self.dragging = False
        self.resizing = False
        
        # UI 更新队列 (解决 Linux 下直接 callback 导致的 UI 卡死问题)
        self.ui_queue = queue.Queue()
        self.resize_mode = None

    def create_window(self):
        """创建并显示窗口"""
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
        
        # --- 创建一个内部容器，留出 5px 间距作为边缘调整区 ---
        self.container = tk.Frame(self.root, bg="#1a1a1a")
        self.container.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # --- 绑定边缘调整事件到 root ---
        self.root.bind("<Motion>", self._on_root_motion)
        self.root.bind("<Button-1>", self._start_root_drag)
        self.root.bind("<B1-Motion>", self._on_root_drag)
        self.root.bind("<ButtonRelease-1>", self._end_root_drag)

        # --- 标题栏 ---
        title_bar = tk.Frame(self.container, bg="#2a2a2a", height=25, cursor="fleur")
        title_bar.pack(fill=tk.X, side=tk.TOP)
        title_bar.pack_propagate(False)
        
        title_lbl = tk.Label(title_bar, text="::: 拖拽移动 :::", fg="#888888", bg="#2a2a2a", font=("Arial", 8))
        title_lbl.pack(side=tk.LEFT, padx=10)
        
        # 标题栏保留原有的移动窗口逻辑
        for w in [title_bar, title_lbl]:
            w.bind("<Button-1>", self.start_drag)
            w.bind("<B1-Motion>", self.on_drag)
            
        tk.Button(title_bar, text="×", command=self.close_window, 
                 bg="#ff4444", fg="white", relief=tk.FLAT, width=3).pack(side=tk.RIGHT)

        # --- 内容区 ---
        content = tk.Frame(self.container, bg="#1a1a1a")
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

        # --- 底部控制栏 (语言选择和模型选择) ---
        control_bar = tk.Frame(self.container, bg="#1a1a1a", height=30)
        control_bar.pack(side=tk.BOTTOM, fill=tk.X, padx=10, pady=5)
        
        # 0. 模型选择
        tk.Label(control_bar, text="模型:", fg="#888888", bg="#1a1a1a", font=("Arial", 10)).pack(side=tk.LEFT)
        self.model_var = tk.StringVar(value=self.current_model)
        
        style = ttk.Style()
        style.theme_use('default')
        style.configure("TCombobox", fieldbackground="#333333", background="#333333", foreground="white")
        
        # 模型显示名称映射
        model_display_names = {
            "whisper": "Whisper (本地)",
            "siliconflow": "硅基流动 (API)"
        }
        model_values = [model_display_names.get(m, m) for m in self.available_models]
        
        self.model_combo = ttk.Combobox(control_bar, textvariable=self.model_var, values=model_values, 
                                     width=15, state="readonly", style="TCombobox")
        self.model_combo.pack(side=tk.LEFT, padx=5)
        self.model_combo.bind("<<ComboboxSelected>>", self.on_model_change)
        
        # 设置当前选中的模型
        if self.current_model in self.available_models:
            current_display = model_display_names.get(self.current_model, self.current_model)
            self.model_var.set(current_display)
        
        # 间隔
        tk.Label(control_bar, text="  |  ", fg="#555555", bg="#1a1a1a", font=("Arial", 10)).pack(side=tk.LEFT)
        
        # 1. 源语言选择
        tk.Label(control_bar, text="源语言:", fg="#888888", bg="#1a1a1a", font=("Arial", 10)).pack(side=tk.LEFT)
        self.source_lang_var = tk.StringVar(value=self.source_lang)
        # Whisper 支持的常用语言代码
        source_langs = ["Auto", "zh", "en", "ja", "ko", "fr", "de", "es", "ru"]
        
        self.source_combo = ttk.Combobox(control_bar, textvariable=self.source_lang_var, values=source_langs, 
                                     width=6, state="readonly", style="TCombobox")
        self.source_combo.pack(side=tk.LEFT, padx=5)
        self.source_combo.bind("<<ComboboxSelected>>", self.on_source_lang_change)

        # 间隔
        tk.Label(control_bar, text="  →  ", fg="#555555", bg="#1a1a1a", font=("Arial", 10)).pack(side=tk.LEFT)

        # 2. 目标语言选择
        tk.Label(control_bar, text="目标语言:", fg="#888888", bg="#1a1a1a", font=("Arial", 10)).pack(side=tk.LEFT)
        
        self.lang_var = tk.StringVar(value=self.target_lang)
        langs = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr", "de", "es", "ru"]
        
        self.lang_combo = ttk.Combobox(control_bar, textvariable=self.lang_var, values=langs, 
                                     width=8, state="readonly", style="TCombobox")
        self.lang_combo.pack(side=tk.LEFT, padx=5)
        self.lang_combo.bind("<<ComboboxSelected>>", self.on_lang_change)

        # 3. 延迟显示开关
        self.show_latency_var = tk.BooleanVar(value=False)
        tk.Checkbutton(control_bar, text="显示延迟", variable=self.show_latency_var, 
                      command=self.on_latency_toggle,
                      bg="#1a1a1a", fg="#888888", selectcolor="#333333", 
                      activebackground="#1a1a1a", activeforeground="#ffffff").pack(side=tk.LEFT, padx=10)
        
        self.is_running = True
        
        # 启动 UI 轮询循环
        self._process_ui_queue()

    # --- 边缘拖拽调整大小逻辑 ---
    def _on_root_motion(self, event):
        """鼠标移动事件处理"""
        if self.resizing: return
        
        w, h = self.root.winfo_width(), self.root.winfo_height()
        x, y = event.x, event.y
        margin = 10  # 边缘检测范围
        
        self.resize_mode = None
        cursor = ""
        
        on_right = (x > w - margin)
        on_bottom = (y > h - margin)
        
        if on_right and on_bottom:
            self.resize_mode = "se"
            cursor = "bottom_right_corner" if platform.system() != "Windows" else "size_nw_se"
        elif on_right:
            self.resize_mode = "e"
            cursor = "sb_h_double_arrow" if platform.system() != "Windows" else "size_we"
        elif on_bottom:
            self.resize_mode = "s"
            cursor = "sb_v_double_arrow" if platform.system() != "Windows" else "size_ns"
            
        if cursor:
            self.root.config(cursor=cursor)
        else:
            self.root.config(cursor="")

    def _start_root_drag(self, event):
        """开始拖拽调整大小"""
        if self.resize_mode:
            self.resizing = True
            self.resize_start_x = event.x_root
            self.resize_start_y = event.y_root
            self.resize_start_w = self.root.winfo_width()
            self.resize_start_h = self.root.winfo_height()

    def _on_root_drag(self, event):
        """拖拽调整大小中"""
        if self.resizing and self.resize_mode:
            dx = event.x_root - self.resize_start_x
            dy = event.y_root - self.resize_start_y
            
            new_w = self.resize_start_w
            new_h = self.resize_start_h
            
            if "e" in self.resize_mode:
                new_w = max(300, self.resize_start_w + dx)
            if "s" in self.resize_mode:
                new_h = max(150, self.resize_start_h + dy)
                
            self.root.geometry(f"{new_w}x{new_h}")
            
            # 更新换行宽度
            if self.original_text_label:
                self.original_text_label.config(wraplength=new_w-40)
            if self.translated_text_label:
                self.translated_text_label.config(wraplength=new_w-40)

    def _end_root_drag(self, event):
        """结束拖拽调整大小"""
        self.resizing = False
        self.resize_mode = None
        self.root.config(cursor="")

    def _process_ui_queue(self):
        """
        定时轮询 UI 队列，在主线程中更新界面。
        这种 'Queue + Polling' 模式比直接 'root.after' 更稳健，
        特别是在 Linux (X11/Wayland) 下能防止 UI 假死。
        """
        try:
            latest = None
            # 消费掉队列中积压的所有更新，只保留最新的一个
            while True:
                latest = self.ui_queue.get_nowait()
        except queue.Empty:
            pass
        
        if latest:
            # 兼容旧的队列数据格式 (org, trans) 或 (org, trans, latencies)
            if len(latest) == 3:
                org, trans, latencies = latest
            else:
                org, trans = latest
                latencies = {}
            self._update_ui(org, trans, latencies)
            
        # 每 100ms 轮询一次
        if self.is_running and self.root:
            self.root.after(100, self._process_ui_queue)

    def on_model_change(self, event):
        """模型切换回调"""
        display_name = self.model_var.get()
        # 从显示名称映射回模型名称
        model_display_map = {
            "Whisper (本地)": "whisper",
            "硅基流动 (API)": "siliconflow"
        }
        # 反向查找
        model_name = None
        for display, name in model_display_map.items():
            if display == display_name:
                model_name = name
                break
        if not model_name:
            # 如果找不到映射，直接使用显示名称
            model_name = display_name
        
        if self.model_callback:
            self.model_callback(model_name)
    
    def on_source_lang_change(self, event):
        """源语言切换回调"""
        new_lang = self.source_lang_var.get()
        if self.source_lang_callback:
            self.source_lang_callback(new_lang)

    def on_lang_change(self, event):
        """目标语言切换回调"""
        new_lang = self.lang_var.get()
        if self.lang_callback:
            self.lang_callback(new_lang)

    def on_latency_toggle(self):
        """延迟显示开关切换"""
        # 切换开关时，使用缓存的数据立即刷新 UI
        self._update_ui(self.last_org, self.last_trans, self.last_latencies)

    def start_drag(self, event):
        """开始拖拽窗口"""
        self.dragging = True
        self.drag_start_x = event.x_root
        self.drag_start_y = event.y_root
        self.window_start_x = self.root.winfo_x()
        self.window_start_y = self.root.winfo_y()

    def on_drag(self, event):
        """拖拽窗口中"""
        if self.dragging:
            dx = event.x_root - self.drag_start_x
            dy = event.y_root - self.drag_start_y
            self.root.geometry(f"+{self.window_start_x + dx}+{self.window_start_y + dy}")

    def update_text(self, org, trans, latencies=None):
        """更新显示的文本（线程安全）"""
        # 将更新请求放入队列，而不是直接操作 UI
        self.ui_queue.put((org, trans, latencies))
        
    def _update_ui(self, org, trans, latencies=None):
        """实际更新UI（在主线程中调用）"""
        # 更新缓存
        self.last_org = org
        self.last_trans = trans
        self.last_latencies = latencies or {}

        show_latency = self.show_latency_var.get() if self.show_latency_var else False
        
        # 格式化显示文本
        org_display = org
        trans_display = trans
        
        if show_latency and latencies:
            if 'rec' in latencies:
                org_display = f"{org}  [{latencies['rec']:.2f}s]"
            if 'trans' in latencies:
                trans_display = f"{trans}  [{latencies['trans']:.2f}s]"

        if self.original_text_label: 
            self.original_text_label.config(text=org_display)
        if self.translated_text_label: 
            self.translated_text_label.config(text=trans_display)

    def close_window(self):
        """关闭窗口"""
        self.is_running = False
        if self.root:
            self.root.destroy()
            self.root = None

