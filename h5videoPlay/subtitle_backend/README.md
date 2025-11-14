# 视频字幕翻译后端服务

> 基于 faster-whisper 的实时语音识别和翻译服务

## 快速开始

### 1. 启动服务

```bash
cd subtitle_backend
./start.sh
```

服务启动后访问：<http://localhost:8765>5>

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

## 💻 系统要求<http://localhost:8765/docs>

- Python 3.8+
- 4GB+ RAM（推荐 8GB）
- （可选）NVIDIA GPU 用于加速

---

**完整文档：** 查看主目录 [README.md](../README.md)

**API 文档：** <http://localhost:8765/docs>
