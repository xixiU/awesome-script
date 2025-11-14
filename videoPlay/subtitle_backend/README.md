# 视频字幕翻译服务

基于 faster-whisper 的实时视频字幕识别和翻译服务。

## 功能特性

- 🎯 **实时语音识别**：使用 faster-whisper 进行高效语音转文字
- 🌍 **多语言翻译**：支持多种语言互译
- ⚡ **高性能**：使用 int8 量化，在 CPU 上也能快速运行
- 🎬 **VAD 过滤**：自动过滤静音部分，提高准确率
- 🔌 **RESTful API**：简单易用的 API 接口

## 系统要求

- Python 3.8+
- 4GB+ RAM（推荐 8GB）
- （可选）NVIDIA GPU 用于加速

## 快速开始

### 1. 安装依赖

```bash
cd subtitle_backend
./start.sh
```

脚本会自动：

- 创建 Python 虚拟环境
- 安装所需依赖
- 启动服务

### 2. 手动安装（可选）

```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python server.py
```

## API 文档

服务启动后访问：<http://localhost:8765/docs>

### 主要接口

#### 1. 转录音频

```bash
POST /transcribe
```

**参数：**

- `file`: 音频文件（支持 mp3, wav, m4a, webm 等）
- `language`: （可选）源语言代码
- `translate_to`: （可选）目标翻译语言

**示例：**

```bash
curl -X POST "http://localhost:8765/transcribe" \
  -F "file=@audio.mp3" \
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
      "original_text": "Hello, world",
      "translated_text": "你好，世界"
    }
  ],
  "count": 1,
  "translated": true
}
```

#### 2. 翻译文本

```bash
POST /translate
```

**参数：**

- `text`: 要翻译的文本
- `target_lang`: 目标语言（默认 zh-CN）
- `source_lang`: 源语言（默认 auto）

#### 3. 支持的语言

```bash
GET /languages
```

## 模型选择

服务默认使用 `base` 模型，可以在 `server.py` 中修改：

```python
subtitle_service = SubtitleService(model_size="base")
```

可选模型：

- `tiny`: 最快，准确率较低（~1GB）
- `base`: 平衡速度和准确率（~1.5GB）推荐
- `small`: 较准确（~2.5GB）
- `medium`: 很准确（~5GB）
- `large`: 最准确（~10GB）需要 GPU

## 性能优化

### CPU 优化

脚本默认使用 int8 量化：

```python
WhisperModel(
    model_size,
    device="cpu",
    compute_type="int8"
)
```

### GPU 加速

如果有 NVIDIA GPU，修改为：

```python
WhisperModel(
    model_size,
    device="cuda",
    compute_type="float16"
)
```

## 配置项

### 端口修改

在 `server.py` 最后修改：

```python
uvicorn.run(
    app,
    host="0.0.0.0",
    port=8765,  # 修改端口号
    log_level="info"
)
```

### VAD 参数调整

在 `transcribe_audio` 方法中调整：

```python
vad_parameters=dict(
    min_silence_duration_ms=500,  # 最小静音时长
    speech_pad_ms=400  # 语音填充
)
```

## 故障排查

### 1. 模型下载失败

faster-whisper 首次运行时会自动下载模型。如果下载失败：

```bash
# 手动下载模型
pip install huggingface_hub
python -c "from faster_whisper import WhisperModel; WhisperModel('base')"
```

### 2. 内存不足

- 使用更小的模型（tiny 或 base）
- 增加系统交换空间
- 关闭其他占用内存的程序

### 3. 翻译失败

翻译功能需要网络访问 Google Translate API。如果失败：

- 检查网络连接
- 考虑使用本地翻译模型（需额外配置）

## 与前端集成

前端脚本会自动连接此服务。确保：

1. 服务正在运行（<http://localhost:8765）>
2. 前端配置中的服务地址正确
3. 浏览器允许跨域请求（CORS 已配置）

## 日志

服务日志会输出到控制台，包括：

- 音频接收信息
- 转录进度
- 翻译状态
- 错误信息

## 安全建议

生产环境使用时：

1. **限制 CORS**：在 `server.py` 中限制允许的域名
2. **添加认证**：使用 API Key 或 JWT Token
3. **使用 HTTPS**：配置 SSL 证书
4. **限流**：防止滥用 API

## 许可证

MIT License

## 致谢

- [faster-whisper](https://github.com/guillaumekln/faster-whisper) - 高效的 Whisper 实现
- [OpenAI Whisper](https://github.com/openai/whisper) - 强大的语音识别模型
- [deep-translator](https://github.com/nidhaloff/deep-translator) - 多翻译引擎支持
