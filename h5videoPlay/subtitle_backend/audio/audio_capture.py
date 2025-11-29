#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
音频采集模块
负责从系统音频设备采集音频数据
"""
import queue
import platform
import logging
import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


class AudioCapture:
    """音频采集器
    
    目标：
    - 尽量过滤掉纯静音 / 环境噪声，避免把空白音频送去识别
    - 保证一旦出现语音，能及时、连续地采集，尽量不丢字
    """
    
    def __init__(
        self,
        sample_rate: int = 16000,
        chunk_duration: float = 2.0,
        silence_threshold: float = 1e-3,
        vad_hangover_chunks: int = 3,
    ):
        """
        初始化音频采集器
        
        Args:
            sample_rate: 采样率，默认16000Hz
            chunk_duration: 每次处理的音频时长（秒），默认2.0秒
            silence_threshold: 静音判定阈值（基于 RMS），越小越敏感
            vad_hangover_chunks: 语音结束后保留的尾部块数，防止尾音被截断
        """
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.chunk_samples = int(sample_rate * chunk_duration)
        self.silence_threshold = silence_threshold
        self.vad_hangover_chunks = vad_hangover_chunks
        
        self.audio_queue = queue.Queue()
        self.is_recording = False
        self.stream = None
        self.device_index = None
        
        # 简单 VAD 状态
        self._speech_active = False     # 当前是否处于“有语音”的状态
        self._hangover_count = 0        # 已经保留了多少个尾部静音块
    
    def get_audio_device(self) -> int:
        """
        自动选择音频输入设备
        
        Returns:
            设备索引，如果失败返回None
        """
        try:
            devices = sd.query_devices()
            system_type = platform.system()
            
            # 1. 定义关键词优先级
            if system_type == 'Linux':
                # Linux 必须优先找 pulse，否则容易崩
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
                        logger.info(f"🎤 [自动选择] 选中设备: {d['name']} (ID: {i})")
                        return i
            
            # 3. 如果 Linux 上没找到 pulse，再尝试暴力搜索一次
            if system_type == 'Linux':
                for i, d in enumerate(devices):
                    if 'pulse' in d['name'].lower() and d['max_input_channels'] > 0:
                        logger.info(f"🎤 [自动选择] 选中设备: {d['name']} (ID: {i})")
                        return i
                        
            logger.warning('⚠️ 未匹配到优选设备，将使用系统默认输入设备。')
            logger.info('📋 当前可用设备列表:')
            for i, d in enumerate(devices):
                logger.info(f"  [{i}] {d['name']} (In: {d['max_input_channels']}, Out: {d['max_output_channels']})")
            
            logger.info('💡 提示: macOS 若需内录系统声音，请安装 BlackHole 并在系统声音设置中选为输出，同时在此脚本中被选中。')
            return sd.default.device[0]
            
        except Exception as e:
            logger.error(f"❌ 获取设备失败: {e}")
            return None
    
    def audio_callback(self, indata, frames, time, status):
        """音频回调函数（带简单 VAD）"""
        if not self.is_recording:
            return
        
        # indata: shape = (frames, channels)
        # 转为 float32 一维数据做能量计算，但队列里仍然放原始形状
        try:
            audio = indata.astype(np.float32, copy=False).flatten()
            if audio.size == 0:
                return
            
            # 计算 RMS 能量，范围大致在 0~1
            rms = float(np.sqrt(np.mean(audio * audio)))
        except Exception as e:
            logger.warning(f"计算音频能量失败: {e}")
            # 出现异常时，为了安全起见仍然入队，避免丢失数据
            self.audio_queue.put(indata.copy())
            return
        
        # 判定是否为“静音块”
        is_silence = rms < self.silence_threshold
        
        if not is_silence:
            # 检测到明显语音：进入语音活动状态，重置尾部计数
            if not self._speech_active:
                logger.debug(f"VAD: 语音开始，rms={rms:.6f}")
            self._speech_active = True
            self._hangover_count = 0
            self.audio_queue.put(indata.copy())
        else:
            if self._speech_active:
                # 语音刚结束的一小段静音，仍然保留若干块，防止尾音被截断
                if self._hangover_count < self.vad_hangover_chunks:
                    self._hangover_count += 1
                    self.audio_queue.put(indata.copy())
                else:
                    # 尾部静音结束，复位状态，不再入队这类静音
                    logger.debug("VAD: 语音结束，进入静音段")
                    self._speech_active = False
                    self._hangover_count = 0
            else:
                # 纯静音段：直接丢弃，不入队，避免送入大模型
                pass
    
    def start(self, device_index: int = None) -> bool:
        """
        开始音频采集
        
        Args:
            device_index: 设备索引，如果为None则自动选择
            
        Returns:
            是否成功启动
        """
        if self.is_recording:
            logger.warning("音频采集已在运行")
            return False
        
        if device_index is None:
            device_index = self.get_audio_device()
            if device_index is None:
                logger.error("无法获取音频设备")
                return False
        
        self.device_index = device_index
        self.is_recording = True
        
        try:
            self.stream = sd.InputStream(
                device=device_index,
                channels=1,
                samplerate=self.sample_rate,
                callback=self.audio_callback,
                blocksize=int(self.sample_rate * 0.1)
            )
            self.stream.start()
            logger.info(f"✅ 音频采集已启动 (设备: {device_index}, 采样率: {self.sample_rate}Hz)")
            return True
        except Exception as e:
            logger.error(f"❌ 启动音频采集失败: {e}")
            self.is_recording = False
            return False
    
    def stop(self):
        """停止音频采集"""
        self.is_recording = False
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
                logger.info("✅ 音频采集已停止")
            except Exception as e:
                logger.error(f"停止音频采集时出错: {e}")
            finally:
                self.stream = None
        
        # 清空队列
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break
    
    def get_chunk(self, timeout: float = 0.5) -> np.ndarray:
        """
        获取一个音频块
        
        Args:
            timeout: 超时时间（秒）
            
        Returns:
            音频数据（numpy数组），如果超时返回None
        """
        try:
            chunk = self.audio_queue.get(timeout=timeout)
            return chunk
        except queue.Empty:
            return None
    
    def get_queue_size(self) -> int:
        """获取队列中积压的音频块数量"""
        return self.audio_queue.qsize()
    
    def clear_queue(self):
        """清空音频队列"""
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except queue.Empty:
                break

