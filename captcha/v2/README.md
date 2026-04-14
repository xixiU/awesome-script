# 通用验证码识别系统 v2

自动识别并填充多种类型验证码的浏览器工具，支持 Chrome 扩展和油猴脚本两种形态。

## 功能特性

### 已实现功能

#### Phase 1（基础验证码）✅
- **图片 OCR 验证码**：识别数字、字母、中文、混合文字验证码
  - 4 种检测策略（关键词、placeholder、图片特征、通用输入框）
  - 多策略图像预处理 + 投票机制
- **计算验证码**：自动计算数学表达式（如 `3+7=?`、`12-5=?`）
  - 递归下降解析器，支持中文数字和运算符
  - 无 `eval()`，安全可靠
- **滑块验证码**：缺口检测 + 模拟人类拖拽轨迹
  - 贝塞尔曲线轨迹生成
  - 完整鼠标事件链（mousedown → mousemove → mouseup）

#### Phase 2（AI 图像分类）✅
- **hCaptcha 支持**：图像分类任务识别
  - 自动提取题目文本和图片
  - 调用多模态 AI API 进行分类
  - 仅 Chrome 扩展可用（油猴脚本受跨域 iframe 限制）
- **多 AI Provider 支持**：
  - **OpenAI GPT-4o**：云端多模态 API
  - **Ollama 本地模型**：支持 qwen2-vl 等开源模型，零成本
  - **ddddocr**：本地 OCR 和滑块检测
- **灵活配置**：
  - 按接口独立选择 Provider（OCR/滑块/分类可用不同引擎）
  - 支持前端 UI 配置 API Key，也可通过 config.yaml 管理
  - 环境变量覆盖支持

### 待实现功能

#### Phase 3（高级验证码）
- **reCAPTCHA v2**：图像分类 + 行为检测
  - 需要 stealth 浏览器环境
  - 完整绕过难度高，需独立架构评估
- **MTCaptcha**：自定义图像挑战
- **本地 GPU 模型优化**：
  - 模型调优和性能优化
  - 更多开源多模态模型支持

> 详细调研见：[Phase 2/3 技术调研报告](../docs/plans/2026-04-14-phase2-3-research.md)

## 项目结构

```
v2/
├── src/                          # 前端源码
│   ├── core/                     # 共享核心逻辑（90% 代码）
│   │   ├── detector.js           # 验证码检测引擎
│   │   ├── solver.js             # 识别调度器
│   │   ├── platform.js           # 平台 API 抽象层
│   │   ├── config.js             # 配置管理
│   │   ├── handlers/             # 验证码类型处理器
│   │   │   ├── base.js           # Handler 基类
│   │   │   ├── ocr.js            # 文字 OCR
│   │   │   ├── calc.js           # 计算验证码
│   │   │   ├── slider.js         # 滑块验证码
│   │   │   └── hcaptcha.js       # hCaptcha 图像分类
│   │   └── utils/
│   │       ├── image.js          # 图片处理
│   │       ├── dom.js            # DOM 操作
│   │       └── math-parser.js    # 数学表达式解析
│   ├── extension/                # Chrome 扩展适配层
│   │   ├── manifest.json         # MV3 manifest
│   │   ├── background.js         # Service Worker
│   │   ├── content.js            # Content Script
│   │   ├── popup.html            # 配置 UI
│   │   └── popup.js              # 配置逻辑
│   └── tampermonkey/             # 油猴脚本适配层
│       └── entry.js              # GM_* API 桥接
├── backend/                      # 后端服务（FastAPI + Python）
│   ├── main.py                   # FastAPI 应用入口
│   ├── config.py                 # 配置管理
│   ├── routers/                  # API 路由
│   │   ├── ocr.py                # POST /api/ocr - 文字识别
│   │   ├── slide.py              # POST /api/slide - 滑块缺口检测
│   │   └── classify.py           # POST /api/classify - 图像分类
│   ├── providers/                # 识别引擎抽象层
│   │   ├── base.py               # Provider 基类
│   │   ├── factory.py            # Provider 工厂函数
│   │   ├── ddddocr_provider.py   # ddddocr 本地引擎
│   │   ├── openai_provider.py    # OpenAI GPT-4o
│   │   └── ollama_provider.py    # Ollama 本地模型
│   └── preprocessing/
│       └── image.py              # 图像预处理（11 种策略）
├── build/                        # 构建配置
│   ├── build.js                  # esbuild 构建脚本
│   └── userscript-banner.js      # 油猴脚本头生成
├── dist/                         # 构建产物
│   ├── extension/                # Chrome 扩展
│   └── captcha-helper.user.js    # 油猴脚本
└── docs/                         # 文档
    └── plans/                    # 设计和实施文档
```

## 快速开始

### 前端构建

支持 npm 和 pnpm 两种包管理器：

**使用 npm：**
```bash
# 安装依赖
npm install

# 构建所有目标
npm run build

# 构建指定目标
npm run build -- --target extension  # 仅构建 Chrome 扩展
npm run build -- --target tampermonkey  # 仅构建油猴脚本

# 开发模式（监听文件变化）
npm run build -- --watch
```

**使用 pnpm：**
```bash
# 安装依赖
pnpm install

# 构建所有目标
pnpm run build

# 构建指定目标
pnpm run build -- --target extension
pnpm run build -- --target tampermonkey

# 开发模式
pnpm run build -- --watch
```

构建产物：
- Chrome 扩展：`dist/extension/`
- 油猴脚本：`dist/captcha-helper.user.js`

### 后端服务

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 复制配置文件
cp config.example.yaml config.yaml

# 编辑配置（设置 API Key 等）
vim config.yaml

# 启动服务
bash start.sh
# 或手动启动
uvicorn main:app --host 0.0.0.0 --port 9876
```

服务默认监听 `http://localhost:9876`

### 配置说明

#### 后端配置（config.yaml）

```yaml
# Provider 选择
providers:
  ocr: ddddocr       # 文字识别：ddddocr | openai | ollama
  slide: ddddocr     # 滑块检测：ddddocr
  classify: openai   # 图像分类：openai | ollama

# OpenAI 配置
openai:
  api_key: "sk-xxx"  # 也可通过环境变量 OPENAI_API_KEY 设置
  model: "gpt-4o"
  base_url: ""       # 留空使用官方地址，可设置代理

# Ollama 本地模型配置
ollama:
  base_url: "http://localhost:11434/v1"
  model: "qwen2-vl"  # 需先执行：ollama pull qwen2-vl
```

#### 前端配置

**Chrome 扩展**：点击扩展图标 → 配置后端地址、AI Provider、API Key

**油猴脚本**：右键菜单 → 脚本命令 → 配置验证码助手

## 使用方法

### Chrome 扩展

1. 构建扩展：`npm run build -- --target extension`
2. 打开 Chrome 扩展管理页面：`chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"，选择 `dist/extension/` 目录
5. 访问包含验证码的网页，扩展会自动检测并识别

### 油猴脚本

1. 安装 Tampermonkey 扩展
2. 构建脚本：`npm run build -- --target tampermonkey`
3. 打开 `dist/captcha-helper.user.js`，复制内容
4. Tampermonkey 管理面板 → 添加新脚本 → 粘贴并保存
5. 访问包含验证码的网页，脚本会自动运行

### 本地模型部署（可选）

使用 Ollama 部署本地多模态模型，零 API 费用：

```bash
# 安装 Ollama（macOS/Linux）
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型（需要 8GB+ VRAM）
ollama pull qwen2-vl

# 启动服务（默认监听 11434 端口）
ollama serve
```

修改 `backend/config.yaml`：
```yaml
providers:
  classify: ollama
```

## API 接口

### POST /api/ocr
文字验证码识别

**请求**：
```json
{
  "image": "data:image/png;base64,iVBORw0KG..."
}
```

**响应**：
```json
{
  "text": "abc123",
  "confidence": 0.95
}
```

### POST /api/slide
滑块缺口检测

**请求**：
```json
{
  "target": "data:image/png;base64,...",      // 缺口图
  "background": "data:image/png;base64,...",  // 背景图
  "bg_width": 300
}
```

**响应**：
```json
{
  "x": 120,
  "y": 0
}
```

### POST /api/classify
图像分类（hCaptcha）

**请求**：
```json
{
  "images": [
    "data:image/png;base64,...",
    "data:image/png;base64,..."
  ],
  "question": "选出包含红绿灯的图片",
  "api_key": "sk-xxx"  // 可选，优先级高于 config.yaml
}
```

**响应**：
```json
{
  "selected": [0, 2, 5]  // 选中的图片索引
}
```

### GET /health
健康检查

**响应**：
```json
{
  "status": "ok",
  "service": "running"
}
```

## 技术栈

### 前端
- **构建工具**：esbuild
- **平台抽象**：自研 Platform 适配层（统一 GM_* API 和 Chrome Extension API）
- **图像处理**：Canvas API
- **数学解析**：递归下降解析器（无 eval）

### 后端
- **框架**：FastAPI
- **OCR 引擎**：ddddocr
- **AI Provider**：
  - OpenAI GPT-4o（云端）
  - Ollama + qwen2-vl（本地）
- **图像预处理**：OpenCV（通过 ddddocr）

## 已知限制

1. **hCaptcha 油猴脚本限制**：由于跨域 iframe 限制，hCaptcha 功能仅在 Chrome 扩展中可用
2. **滑块验证码**：当前实现缺少 Y 轴抖动和回弹，部分高安全等级滑块可能被识别为机器行为
3. **reCAPTCHA**：完整绕过需要 stealth 浏览器环境，超出当前架构范围

## 开发文档

- [设计文档](../docs/plans/2026-04-13-universal-captcha-v2-design.md)
- [实施方案](../docs/plans/2026-04-13-universal-captcha-v2-impl.md)
- [Phase 2/3 调研报告](../docs/plans/2026-04-14-phase2-3-research.md)

## 许可证

MIT
