# 验证码识别系统

## 🎯 系统概述

这是一个完整的验证码识别解决方案，包含：
- **后端识别引擎**：基于 ddddocr 的高性能 OCR 服务
- **前端捕获脚本**：浏览器自动化脚本（Tampermonkey）

## 📋 功能特性

### 支持的验证码类型

1. **普通文字验证码**
   - 数字验证码（4-6位数字）
   - 字母验证码（大小写）
   - 混合验证码（数字+字母）
   - 中文验证码

2. **滑动验证码**
   - 缺口识别
   - 自动滑动定位

3. **智能检测**
   - 自动识别网页中的验证码
   - 支持手动选择验证码位置
   - 缓存机制避免重复识别

## 🚀 快速开始

### 后端服务安装

#### 1. 安装依赖

```bash
cd enetedu
pip install -r requirements.txt
```

#### 2. 启动服务

```bash
# 开发环境
python recognize_captcha.py

# 生产环境（推荐使用 gunicorn）
gunicorn -w 4 -b 0.0.0.0:9876 recognize_captcha:app
```

服务将在 `http://localhost:9876` 启动

#### 3. 验证服务状态

```bash
# 检查健康状态
curl http://localhost:9876/health
```

### 前端脚本安装

1. 安装 Tampermonkey 浏览器扩展
2. 导入 `captcha/browser_capture.js` 脚本
3. 脚本会自动在网页中检测验证码

## 📡 API 接口文档

### 1. `/recognize_captcha` - 原始接口（保持兼容）

**请求方式**: POST  
**Content-Type**: application/json

**请求示例**:
```json
{
  "image_base64": "data:image/png;base64,iVBORw0KG..."
}
```

**响应示例**:
```json
{
  "result": "AB12"
}
```

### 2. `/captcha` - 通用验证码识别（推荐）

**请求方式**: POST  
**Content-Type**: multipart/form-data

**参数**:
- `img`: 图像文件
- `detail`: JSON 字符串（可选），包含额外信息

**响应示例**:
```json
{
  "data": {
    "code": "AB12"
  },
  "msg": "success"
}
```

### 3. `/slideCaptcha` - 滑动验证码识别

**请求方式**: POST  
**Content-Type**: multipart/form-data

**参数**:
- `target_img`: 目标小图（缺口图）
- `bg_img`: 背景大图
- `targetWidth`: 目标图片显示宽度
- `bgWidth`: 背景图片显示宽度

**响应示例**:
```json
{
  "result": {
    "target": [120, 80, 50, 50]
  },
  "msg": "success"
}
```

### 4. `/health` - 健康检查

**请求方式**: GET

**响应示例**:
```json
{
  "service": "running",
  "ocr_available": true,
  "slide_detection_available": true,
  "timestamp": "2025-10-21 10:30:00"
}
```

## 🔧 配置说明

### 修改服务端口

编辑 `recognize_captcha.py` 末尾：

```python
app.run(host='0.0.0.0', port=9876, debug=True)
```

### 修改前端服务地址

编辑 `captcha/browser_capture.js` 第49行：

```javascript
var routePrefix = 'http://localhost:9876'
```

## 💡 使用技巧

### 1. 自动模式

脚本会自动检测并识别网页中的验证码，无需手动操作。

### 2. 手动选择模式

如果自动检测失败，可以：
1. 点击 Tampermonkey 菜单中的"手动选择验证码和输入框"
2. 依次点击验证码图片和输入框
3. 完成选择后，脚本会记住配置

### 3. 清除配置

- "清空所有验证码配置" - 清除所有网站的配置
- "清空当前页面验证码配置" - 只清除当前页面配置

### 4. 黑名单功能

对于没有验证码的网站，可以标记为黑名单，避免不必要的检测。

## 🏗️ 系统架构

```
┌─────────────────┐
│  浏览器网页      │
│  (验证码图片)    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ Tampermonkey    │
│ browser_capture │  ← 捕获验证码
│     .js         │     转换为文件
└────────┬────────┘
         │ HTTP POST
         │ (multipart/form-data)
         ↓
┌─────────────────┐
│   Flask API     │
│ recognize_      │  ← 接收图像
│  captcha.py     │     OCR 识别
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   ddddocr       │  ← AI 模型
│   引擎          │     图像识别
└─────────────────┘
```

## 📊 性能优化

### 1. 引擎初始化

OCR 引擎在服务启动时初始化一次，避免每次请求都重新加载模型。

### 2. 图像缓存

前端脚本会缓存已识别的验证码，避免重复请求。

### 3. 异步处理

前端使用异步请求，不阻塞页面操作。

## ⚠️ 注意事项

1. **合法使用**: 仅用于合法授权的场景，不得用于非法用途
2. **精度限制**: 某些复杂验证码可能识别失败
3. **网络延迟**: 识别速度受网络状况影响
4. **隐私保护**: 不上传敏感信息到第三方服务器

## 🐛 故障排除

### 问题1: 服务无法启动

**解决方案**:
```bash
# 检查端口是否被占用
lsof -i:9876

# 或更换端口
python recognize_captcha.py --port 8888
```

### 问题2: 识别失败

**可能原因**:
- 图像质量差
- 验证码类型不支持
- OCR 模型未正确加载

**解决方案**:
1. 检查 `/health` 接口确认服务状态
2. 查看服务器日志
3. 尝试手动选择验证码位置

### 问题3: CORS 跨域错误

**解决方案**:
确保已安装 flask-cors：
```bash
pip install flask-cors
```

## 🔄 更新日志

### v2.0 (当前版本)
- ✨ 新增 `/captcha` 接口支持文件上传
- ✨ 新增 `/slideCaptcha` 滑动验证码识别
- ✨ 新增 `/health` 健康检查接口
- 🔧 保持 `/recognize_captcha` 向后兼容
- 📝 完善注释和文档
- 🎨 改进代码结构和可读性

### v1.0
- 基础 OCR 识别功能
- 浏览器自动化脚本

## 📞 技术支持

遇到问题？
1. 查看日志文件
2. 检查 GitHub Issues
3. 提交 Bug 报告

## 📄 许可证

MIT License

