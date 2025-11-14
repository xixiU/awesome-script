# 视频实时字幕翻译功能使用指南

这是一个完整的视频实时字幕识别和翻译系统，包括：

- 后端：Python + faster-whisper + FastAPI
- 前端：油猴脚本集成

## 🎯 功能特性

- ✅ 实时语音识别（支持多种语言）
- ✅ 自动翻译（支持多语言互译）
- ✅ 美观的字幕显示
- ✅ 便捷的控制面板
- ✅ 与现有视频播放工具完美集成

## 📋 系统要求

### 后端

- Python 3.8+
- 4GB+ RAM（推荐 8GB）
- （可选）NVIDIA GPU 用于加速

### 前端

- Chrome/Edge/Firefox 浏览器
- Tampermonkey 扩展

## 🚀 快速开始

### 步骤 1：启动后端服务

```bash
cd subtitle_backend
./start.sh
```

等待输出：

```
服务地址: http://localhost:8765
按 Ctrl+C 停止服务
```

验证服务运行：

```bash
curl http://localhost:8765/health
```

### 步骤 2：安装前端脚本

有两种方式：

#### 方式 A：独立脚本（推荐）

1. 打开 Tampermonkey 管理面板
2. 创建新脚本
3. 复制 `subtitle_module.js` 的内容
4. 保存并启用

#### 方式 B：集成到现有脚本

如果你已经在使用 `html5videoPlay.js`，可以同时安装两个脚本。

### 步骤 3：使用字幕功能

1. 访问任何视频网站（YouTube, B站等）
2. 播放视频
3. 在页面右上角会出现"📝 字幕控制"面板
4. 点击"启动字幕"开始识别

## ⚙️ 配置说明

### 后端配置

编辑 `subtitle_backend/server.py`：

```python
# 修改模型大小（影响速度和准确率）
subtitle_service = SubtitleService(model_size="base")
# 可选: tiny, base, small, medium, large

# 修改端口
uvicorn.run(app, host="0.0.0.0", port=8765)
```

### 前端配置

点击控制面板的"配置"按钮，或在代码中修改：

```javascript
const SubtitleConfig = {
    defaults: {
        enabled: false,           // 是否自动启用
        serverUrl: 'http://localhost:8765',  // 后端服务地址
        targetLanguage: 'zh-CN',  // 目标语言
        autoTranslate: true,      // 是否自动翻译
        fontSize: 20,             // 字体大小
        fontColor: '#FFFFFF',     // 字体颜色
        backgroundColor: 'rgba(0, 0, 0, 0.7)',  // 背景颜色
        position: 'bottom',       // 位置 (top/bottom)
        captureInterval: 5        // 音频捕获间隔（秒）
    }
};
```

### 支持的语言

**目标语言代码：**

- `zh-CN`: 简体中文
- `zh-TW`: 繁体中文
- `en`: 英语
- `ja`: 日语
- `ko`: 韩语
- `fr`: 法语
- `de`: 德语
- `es`: 西班牙语
- `ru`: 俄语

查看完整列表：

```bash
curl http://localhost:8765/languages
```

## 🎨 UI 说明

### 字幕显示

字幕会自动显示在视频的底部（或顶部），样式包括：

- 黑色半透明背景
- 白色文字
- 自动换行
- 居中对齐

### 控制面板

位于页面右上角，包含：

- **启动/停止按钮**：控制字幕识别
- **配置按钮**：修改设置
- **状态指示器**：显示运行状态

## 🔧 高级功能

### 自定义字幕样式

在 `subtitle_module.js` 中修改 `SubtitleUI.create()` 方法：

```javascript
this.subtitleElement.style.cssText = `
    font-size: 24px;              // 更大的字体
    color: #FFD700;                // 金色文字
    background: rgba(0, 0, 0, 0.9);  // 更深的背景
    border: 2px solid #FFD700;     // 金色边框
    // ... 更多样式
`;
```

### 调整捕获间隔

默认每 5 秒捕获一次音频。修改配置：

```javascript
captureInterval: 3  // 改为 3 秒，更频繁但占用更多资源
```

### 使用不同的 Whisper 模型

| 模型 | 速度 | 准确率 | 内存 | 推荐场景 |
|------|------|--------|------|----------|
| tiny | ⚡⚡⚡⚡⚡ | ⭐⭐ | ~1GB | 快速预览 |
| base | ⚡⚡⚡⚡ | ⭐⭐⭐ | ~1.5GB | 日常使用（推荐） |
| small | ⚡⚡⚡ | ⭐⭐⭐⭐ | ~2.5GB | 高质量需求 |
| medium | ⚡⚡ | ⭐⭐⭐⭐⭐ | ~5GB | 专业用途 |
| large | ⚡ | ⭐⭐⭐⭐⭐ | ~10GB | 最高质量（需GPU） |

## 📝 使用技巧

### 1. 获得最佳效果

- ✅ 确保视频音质清晰
- ✅ 避免背景噪音过大
- ✅ 使用有线网络连接
- ✅ 关闭其他占用资源的程序

### 2. 性能优化

**降低延迟：**

- 使用更小的模型（tiny/base）
- 减少捕获间隔
- 使用 GPU 加速

**提高准确率：**

- 使用更大的模型（small/medium）
- 指定源语言（而不是自动检测）
- 增加捕获间隔，处理更长的音频片段

### 3. 故障排查

**字幕不显示？**

1. 检查后端服务是否运行：`curl http://localhost:8765/health`
2. 打开浏览器控制台（F12），查看错误信息
3. 确认浏览器支持音频捕获API

**识别不准确？**

1. 尝试更大的模型
2. 手动指定源语言
3. 调整 VAD 参数

**翻译失败？**

1. 检查网络连接
2. 确认目标语言代码正确
3. 查看后端日志

## 🎓 工作原理

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   视频播放   │────▶│  音频捕获   │────▶│  临时存储   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  显示字幕   │◀────│   翻译文本   │◀────│  语音识别   │
└─────────────┘     └─────────────┘     └─────────────┘
```

**详细流程：**

1. **音频捕获**：使用 `captureStream()` API 从视频元素捕获音频流
2. **录制音频**：使用 `MediaRecorder` 录制 5 秒的音频片段
3. **发送后端**：将音频以 WebM 格式发送到后端服务
4. **语音识别**：后端使用 faster-whisper 进行语音转文字
5. **翻译**（可选）：使用 Google Translator 翻译文本
6. **返回字幕**：返回带时间戳的字幕数据
7. **显示字幕**：前端根据视频时间显示相应字幕

## 🔒 隐私和安全

### 数据处理

- ✅ 音频仅在本地网络传输（localhost）
- ✅ 不会上传到第三方服务器（除了翻译API）
- ✅ 临时文件自动删除
- ✅ 不保存任何视频或音频数据

### 安全建议

1. **仅在本地使用**：不要将后端服务暴露到公网
2. **使用 VPN**：如果需要远程访问，使用 VPN
3. **定期更新**：保持依赖包最新，修复安全漏洞

## 📚 API 参考

### 后端 API

#### 转录音频

```bash
curl -X POST "http://localhost:8765/transcribe" \
  -F "file=@audio.webm" \
  -F "language=en" \
  -F "translate_to=zh-CN"
```

响应：

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

#### 翻译文本

```bash
curl -X POST "http://localhost:8765/translate" \
  -d "text=Hello" \
  -d "target_lang=zh-CN" \
  -d "source_lang=auto"
```

#### 健康检查

```bash
curl http://localhost:8765/health
```

## 🤝 集成 ConfigManager

如果要使用统一的配置管理器：

```javascript
// 引入 ConfigManager
const subtitleConfigManager = new ConfigManager('字幕翻译', {
    serverUrl: 'http://localhost:8765',
    targetLanguage: 'zh-CN',
    autoTranslate: true,
    fontSize: 20,
    enabled: false
});

// 定义配置项
subtitleConfigManager.init([
    {
        key: 'serverUrl',
        label: '后端服务地址',
        type: 'text',
        placeholder: 'http://localhost:8765',
        help: '字幕识别服务的地址'
    },
    {
        key: 'targetLanguage',
        label: '目标语言',
        type: 'text',
        placeholder: 'zh-CN',
        help: '字幕翻译的目标语言代码'
    },
    {
        key: 'autoTranslate',
        label: '自动翻译',
        type: 'checkbox',
        help: '是否自动翻译识别的字幕'
    },
    {
        key: 'fontSize',
        label: '字体大小',
        type: 'number',
        placeholder: '20',
        help: '字幕文字大小（像素）'
    }
]);

// 使用配置
const config = subtitleConfigManager.getAll();
```

## 🎉 完整示例

查看 `examples/` 目录中的完整示例：

- `basic_usage.html` - 基础使用示例
- `custom_style.html` - 自定义样式示例
- `advanced_config.html` - 高级配置示例

## 📞 支持和反馈

遇到问题？

1. 查看日志文件
2. 阅读故障排查部分
3. 提交 Issue 或 PR

## 📄 许可证

MIT License

---

**享受无障碍的视频观看体验！** 🎊
