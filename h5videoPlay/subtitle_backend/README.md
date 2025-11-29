# 视频字幕翻译后端服务

> 基于 faster-whisper 的实时语音识别和翻译服务

## 快速开始

### 1. 启动服务

```bash
cd subtitle_backend
./start.sh
```

服务启动后访问：<http://localhost:8765>

### 2. 测试服务

```bash
# 健康检查
curl http://localhost:8765/health

# 运行测试
python test_api.py
```

## 📡 API 接口

### 转录音频

```bash
POST /transcribe
```

**参数：**

- `file`: 音频文件（mp3, wav, m4a, webm）
- `language`: （可选）源语言代码
- `translate_to`: （可选）目标翻译语言

**示例：**

```bash
curl -X POST "http://localhost:8765/transcribe" \
  -F "file=@audio.webm" \
  -F "translate_to=zh-CN"
```

**响应：**

```json
{
  "success": true,
  "subtitles": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "你好，世界",
      "language": "en",
      "original_text": "Hello, world"
    }
  ],
  "count": 1,
  "translated": true
}
```

### 翻译文本

```bash
POST /translate
```

**参数：**

- `text`: 要翻译的文本
- `target_lang`: 目标语言（默认 zh-CN）
- `source_lang`: 源语言（默认 auto）

### 支持的语言

```bash
GET /languages
```

返回所有支持的语言列表。

## ⚙️ 配置

### 修改模型

编辑 `server.py`：

```python
# 选择模型大小

subtitle_service = SubtitleService(model_size="base")
```

**可选模型：**

- `tiny` - 最快，准确率较低（~1GB）
- `base` - 推荐，平衡速度和准确率（~1.5GB）
- `small` - 较准确（~2.5GB）
- `medium` - 很准确（~5GB）
- `large` - 最准确，需要 GPU（~10GB）

### 修改端口

```python
uvicorn.run(app, host="0.0.0.0", port=8765)  # 修改端口号
```

### GPU 加速

如果有 NVIDIA GPU：

```python
WhisperModel(model_size, device="cuda", compute_type="float16")
```

## 🔧 故障排查

### 模型下载失败

```bash

# 手动下载模型
pip install huggingface_hub
python -c "from faster_whisper import WhisperModel; WhisperModel('base')"
```

### 内存不足

- 使用更小的模型（tiny 或 base）
- 关闭其他占用内存的程序

### 翻译失败

- 检查网络连接
- 翻译功能需要访问 Google Translate API

## 📚 依赖

主要依赖包（requirements.txt）：

- fastapi - Web 框架
- uvicorn - ASGI 服务器
- faster-whisper - 语音识别
- deep-translator - 翻译
- pydub - 音频处理

## 🔒 安全建议

生产环境使用时：

1. 限制 CORS 域名
2. 添加 API 认证
3. 使用 HTTPS
4. 设置请求限流

## 💻 系统要求

- Python 3.8+
- 4GB+ RAM（推荐 8GB）
- （可选）NVIDIA GPU 用于加速

---

**完整文档：** 查看主目录 [README.md](../README.md)

**API 文档：** <http://localhost:8765/docs>

## 系统音频实时字幕服务

除了 FastAPI 后端接口外，本项目还提供一个独立运行的「系统音频实时字幕 + 翻译」桌面小工具，入口为 `system_audio_subtitle.py`。

### 启动方式

```bash
cd subtitle_backend
python system_audio_subtitle.py --target-lang zh-CN
```

运行后会在桌面显示一个可拖拽、可缩放的悬浮字幕窗体，实时显示：

- 原始识别文本（上行）
- 翻译后的文本（下行）
- 支持模型切换、源语言/目标语言切换，以及显示识别/翻译延迟

### 主要能力

- **系统音频采集**：从系统声卡或虚拟音频设备采集声音（如 BlackHole、Soundflower、loopback 等）
- **多模型识别**：
  - 本地 `Whisper`（基于 `faster-whisper`）
  - 云端 `SiliconFlow`（OpenAI 兼容 API，如 `FunAudioLLM/SenseVoiceSmall`）
- **实时翻译**：使用 `GoogleTranslator` 将识别结果翻译为目标语言
- **UI 控制**：
  - 模型选择下拉框
  - 源语言 / 目标语言选择
  - 显示延迟开关

## 模型配置说明

### 配置文件

- 配置文件位置：`model_config.json`
- 首次运行时自动生成默认配置
- 可参考 `model_config.example.json` 进行手动修改

### 支持的模型

#### 1. Whisper（本地模型）

使用 `faster-whisper` 进行本地语音识别，无需网络连接。

**配置示例：**

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

**常用参数：**

- `model_size`: `tiny` / `base` / `small` / `medium` / `large` / `auto`
- `device`: `cpu` / `cuda` / `auto`
- `compute_type`: `int8` / `float16` / `float32`
- `cpu_threads`: CPU 线程数（仅 CPU 时有效）

#### 2. 硅基流动（SiliconFlow API）

使用硅基流动云端 API 进行语音识别，速度更快，推荐结合 `OpenAI` 兼容接口使用。

**配置示例：**

```json
{
  "type": "siliconflow",
  "enabled": true,
  "config": {
    "api_key": "your-api-key-here",
    "base_url": "https://api.siliconflow.cn/v1",
    "model_id": "FunAudioLLM/SenseVoiceSmall",
    "timeout": 30
  }
}
```

**常用参数：**

- `api_key`: 硅基流动 API Key（必填）
- `base_url`: OpenAI 兼容 API 基础地址
- `model_id`: 语音识别模型 ID（例如 `FunAudioLLM/SenseVoiceSmall`）
- `timeout`: 请求超时时间（秒）

### 使用方式

1. 编辑 `model_config.json`，配置各模型的参数及是否启用
2. 启动 `system_audio_subtitle.py`
3. 在悬浮窗底部「模型」下拉框中选择要使用的模型
4. 运行过程中可随时切换模型，系统会自动重新加载

### 扩展新模型

1. 在 `models/` 目录下创建模型类，继承 `BaseSpeechToTextModel`
2. 实现 `initialize()`, `transcribe()`, `is_available()` 等方法
3. 在 `model_manager.py` 中注册新模型
4. 在 `model_config.json` 中添加对应配置

## 代码结构概览

### 目录结构（核心部分）

```text
subtitle_backend/
├── ui/                          # UI 模块
│   ├── __init__.py
│   └── floating_window.py       # 悬浮字幕窗口
├── audio/                       # 音频采集模块
│   ├── __init__.py
│   └── audio_capture.py         # 系统音频采集器
├── translation/                 # 翻译模块
│   ├── __init__.py
│   └── translator.py            # 文本翻译器
├── models/                      # 语音转文字模型
│   ├── base_model.py            # 模型基类
│   ├── model_manager.py         # 模型管理器
│   ├── whisper_model.py         # Whisper STT
│   └── siliconflow_model.py     # SiliconFlow STT
├── stt_service.py               # 语音转文字服务层
├── config_manager.py            # 模型配置管理
├── system_audio_subtitle.py     # 系统音频实时字幕主入口
└── server.py                    # FastAPI HTTP 服务入口
```

### 模块职责

- **UI (`ui/`)**: 悬浮字幕窗口，负责展示原文/译文以及模型与语言控制
- **音频采集 (`audio/`)**: 从系统音频设备采集数据并通过队列提供给识别模块
- **语音转文字 (`stt_service.py` + `models/`)**:
  - `STTService` 统一封装模型创建与调用
  - `ModelManager` 负责模型注册与实例化
  - 各具体模型实现 `BaseSpeechToTextModel` 接口
- **翻译 (`translation/`)**: 负责文本翻译，提供同步与异步两种接口
- **配置 (`config_manager.py`)**: 负责读取、写入和管理 `model_config.json`

## 更新日志与技术实现 (2025-11-29)

### 1. 架构重构：多线程生产者-消费者模型

**问题**：原单线程模式下，语音识别（STT）或翻译的网络/计算耗时会阻塞音频读取，导致音频丢失（丢字）和界面卡顿。

**解决手段**：

- **分离采集与处理**：实现了标准的生产者-消费者模型。
  - **生产者 (`_capture_loop`)**：独立线程，只负责从 `PyAudio` 极速读取音频流并推入 `queue`，确保 0 丢帧。
  - **消费者 (`_process_loop`)**：独立线程，负责从队列取出数据，执行 VAD、STT 和翻译等耗时操作。
- **队列缓冲**：使用 `queue.Queue` 作为线程间缓冲区，平滑处理速度波动。

### 2. 性能优化：自适应积压追赶策略

**问题**：当大模型响应慢或网络波动时，待处理音频队列会堆积，导致识别结果严重滞后于当前语音。

**解决手段**：

- **队列深度监控**：实时监控处理队列的积压数量 (`qsize`)。
- **智能丢帧**：当积压严重（>5个块，约0.5s）且当前音频块判断为静音（低 RMS 能量）时，**直接丢弃**该块，跳过后续复杂的 VAD 和 STT 计算。这使得系统能在说话间歇期迅速“消化”积压，追赶实时进度。

### 3. 用户体验：UI 状态保持与增量更新

**问题**：新句子刚开始识别时只有原文，导致翻译区被清空，出现视觉上的“闪烁”和“信息断层”。

**解决手段**：

- **UI 缓存机制**：在 `FloatingWindow` 中引入 `last_trans` 缓存。
- **条件更新逻辑**：
  - 当 STT 输出实时预览（只有原文）时，向 UI 发送 `trans=None`。
  - UI层接收到 `None` 时**保持显示上一句的翻译结果**，直到该句的第一个有效翻译到达才覆盖更新。

### 4. 扩展性：OpenAI 兼容接口集成

**问题**：为了支持 SiliconFlow 等高性能大模型，且保持未来对其他模型的兼容性。

**解决手段**：

- **接口标准化**：严格遵循 OpenAI Audio API (`/v1/audio/transcriptions`) 规范封装 `SiliconFlowModel`。
- **协议适配**：实现了 `multipart/form-data` 格式的内存音频文件上传，无需落地临时文件，统一了不同下游模型的调用方式。

## 后续优化方向

- UI：主题/样式自定义、字幕历史、导出 SRT/ASS 文件
- 音频：降噪、增益、设备选择 UI、音频可视化
- STT：流式识别、结果缓存、性能监控、多模型智能选择
- 翻译：接入多家翻译服务、结果缓存、质量评估
