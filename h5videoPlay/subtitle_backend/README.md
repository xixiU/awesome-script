# 视频字幕翻译后端服务

> 基于 faster-whisper 和 大语言模型 的实时语音识别和翻译服务

## ✨ 主要特性

- **多模型支持**：
  - **本地模型**：内置 `faster-whisper`，无需联网，保护隐私。
  - **云端大模型**：支持 **硅基流动 (SiliconFlow)** 等 OpenAI 兼容 API，识别准确率更高。
- **实时预览 + 最终修正**：
  - 说话时实时上屏预览，句子结束后利用大模型进行整句修正和翻译，兼顾实时性与准确性。
- **智能积压处理**：
  - 采用多线程架构（采集与处理分离），配合智能 VAD（语音活动检测）和批量合并策略，有效防止识别卡顿和积压。
- **悬浮窗 UI**：
  - 跨平台（Windows/macOS/Linux）悬浮窗，支持**置顶显示**（包括 macOS 全屏场景优化）。
  - 实时显示原文、译文及处理延迟。
  - 支持动态切换模型、源语言和目标语言。

## 🚀 快速开始

### 1. 安装依赖

确保系统已安装 Python 3.8+ 和 FFmpeg。

```bash
cd h5videoPlay/subtitle_backend
pip install -r requirements.txt
```

### 2. 启动服务

**方式一：桌面悬浮字幕工具（推荐）**

这是带有 GUI 界面的实时字幕工具，适合观看视频或会议时使用。

```bash
python system_audio_subtitle.py
```

启动后，会在屏幕下方显示一个半透明悬浮窗。

**方式二：HTTP API 服务**

如果你需要为其他应用提供 API 服务，可以使用此模式。

```bash
./start.sh
# 服务默认运行在 http://localhost:8765
```

## ⚙️ 配置说明

### 模型配置 (`model_config.json`)

程序首次运行会自动生成 `model_config.json`。你可以编辑此文件来配置 API Key 或调整模型参数。

#### 1. 硅基流动 (SiliconFlow) - 推荐

使用云端大模型，识别效果最佳。需要注册并获取 API Key。

```json
{
  "type": "siliconflow",
  "enabled": true,
  "config": {
    "api_key": "sk-xxxxxxxxxxxxxxxxxxxxxxxx", 
    "base_url": "https://api.siliconflow.cn/v1",
    "model_id": "FunAudioLLM/SenseVoiceSmall",
    "timeout": 30
  }
}
```

- **api_key**: 必填，从硅基流动控制台获取。

- **model_id**: 支持 `FunAudioLLM/SenseVoiceSmall` (推荐) 等模型。

#### 2. Whisper (本地)

使用本地 CPU/GPU 运行，完全离线。

```json
{
  "type": "whisper",
  "enabled": true,
  "config": {
    "model_size": "small",
    "device": "cpu", 
    "compute_type": "int8",
    "cpu_threads": 4
  }
}
```

- **device**: `cpu` 或 `cuda` (需要 NVIDIA 显卡)。

- **model_size**: `tiny`, `base`, `small`, `medium`, `large-v2`。

### UI 操作

- **切换模型**：在悬浮窗底部下拉框直接切换，无需重启。
- **切换语言**：支持源语言（Auto/指定）和目标语言切换。
- **显示延迟**：勾选“显示延迟”可查看 STT 和翻译的耗时。
- **拖拽与缩放**：点击标题栏拖拽窗口，拖拽右下角调整大小。

## ❓ 常见问题

### Q: macOS 全屏应用遮挡字幕怎么办？

**A:** 本程序已针对 macOS 做了优化，包含周期性强制置顶。但在 macOS 的**原生全屏**（Native Full Screen，即独立桌面）模式下，普通窗口无法覆盖。
**建议方案**：

1. 使用播放器/浏览器的“网页全屏”或“窗口最大化”，而不是系统级全屏。
2. 如果必须用原生全屏，请尝试在系统设置中允许应用在所有桌面显示（需系统层面支持）。

### Q: 总是提示“队列积压警告”？

**A:**

1. **轻微积压（< 20块）**：属于正常缓冲，通常在说话停顿间隙会自动消化。
2. **严重积压**：程序会自动触发“批量合并处理”或丢弃静音块来追赶进度。
3. **持续报警**：可能是网络太慢（API 模式）或 CPU 性能不足（本地模式）。尝试切换到更小的模型或检查网络。

### Q: Linux 提示 `Failed to build 'av'`？

**A:** 缺少 FFmpeg 开发库。请运行：

```bash
sudo apt-get install libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev libswscale-dev libswresample-dev libavfilter-dev pkg-config
```

## 🏗️ 架构与技术实现

### 目录结构

```text
subtitle_backend/
├── ui/                  # 悬浮窗 UI (tkinter)
├── audio/               # 音频采集 & VAD
├── translation/         # 翻译服务 (Google/DeepL等)
├── models/              # STT 模型适配 (Whisper/SiliconFlow)
├── stt_service.py       # 语音转文字核心服务
├── config_manager.py    # 配置管理
└── system_audio_subtitle.py  # 主程序入口
```

### 核心技术点 (2025-11-29 更新)

1. **多线程生产者-消费者模型**：
    - **采集线程**：专注于音频流读取，确保不丢帧。
    - **处理线程**：异步执行 VAD、STT 和翻译，避免网络 IO 阻塞采集。

2. **自适应积压追赶**：
    - **批量处理**：当检测到积压时，不再逐个处理小切片，而是将多个音频块合并为一次 API 调用，大幅提升吞吐量。
    - **智能丢帧**：在积压严重时，激进地丢弃静音片段，优先保证实时性。

3. **UI 体验优化**：
    - **状态保持**：在等待新翻译时保持上一句显示，避免界面闪烁。
    - **实时预览**：句子未结束时显示流式预览，结束后进行最终修正。

## 📝 待办事项

- [ ] 支持流式 STT (WebSocket) 以进一步降低延迟
- [ ] 添加更多翻译源 (DeepL, OpenAI)
- [ ] 支持导出字幕文件 (.srt)
