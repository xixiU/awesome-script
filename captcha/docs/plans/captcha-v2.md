# 通用验证码识别系统 v2

## 1. 项目概述

将现有文字验证码识别脚本升级为支持多种验证码类型的通用识别系统，提供 Chrome 扩展（MV3）和油猴脚本两种分发形态，共享核心逻辑。

**技术栈**：JavaScript (ES2020) + esbuild / Python 3.10+ + FastAPI + ddddocr + Pillow + OpenAI API / Ollama

**整体架构**：

```
Browser
├── core/                    # 共享核心（~90% 代码量）
│   ├── detector.js          # 验证码检测引擎
│   ├── solver.js            # 识别调度器
│   ├── platform.js          # 平台 API 抽象层
│   ├── config.js            # 配置管理
│   ├── handlers/
│   │   ├── base.js          # Handler 基类
│   │   ├── ocr.js           # 文字 OCR
│   │   ├── calc.js          # 计算验证码
│   │   ├── slider.js        # 滑块验证码
│   │   └── hcaptcha.js      # hCaptcha 图像分类 ✅ Phase 2
│   └── utils/
│       ├── image.js         # canvas/blob/base64 转换
│       ├── dom.js           # DOM 查询、输入框填值
│       └── math-parser.js   # 安全数学表达式解析器
├── tampermonkey/entry.js    # GM_* API 桥接 + UserScript 头
├── extension/               # Chrome 扩展适配层（MV3）
│   ├── manifest.json
│   ├── background.js
│   └── content.js
└── build/build.js           # esbuild 构建脚本

Backend (FastAPI + Python)
├── main.py                  # FastAPI 应用入口
├── config.py                # 配置管理（含环境变量读取）
├── routers/
│   ├── ocr.py               # POST /api/ocr
│   ├── slide.py             # POST /api/slide
│   └── classify.py          # POST /api/classify
├── providers/
│   ├── base.py              # Provider 基类（ABC）
│   ├── factory.py           # 动态 Provider 选择 ✅ Phase 2
│   ├── ddddocr_provider.py  # ddddocr 本地 OCR
│   ├── openai_provider.py   # GPT-4o 多模态 ✅ Phase 2
│   ├── ollama_provider.py   # 本地 GPU 模型 ✅ Phase 2
│   └── local_model.py       # Phase 3 预留
└── preprocessing/image.py   # 多策略投票图像预处理
```

---

## 2. 已实现功能

### Phase 1（基础验证码）✅ 2026-04-13

**功能**：图片 OCR / 计算验证码 / 滑块验证码

| Task | 内容 | 关键文件 |
|------|------|---------|
| 1 | 项目脚手架 + esbuild 构建 | `package.json`, `build/build.js` |
| 2 | Platform 抽象层 | `src/core/platform.js` |
| 3 | 工具模块 | `utils/image.js`, `dom.js`, `math-parser.js` |
| 4 | Handler 系统 | `handlers/base.js`, `detector.js`, `solver.js`, `config.js` |
| 5 | OCR Handler | `handlers/ocr.js` |
| 6 | 计算验证码 Handler | `handlers/calc.js` |
| 7 | 滑块 Handler | `handlers/slider.js` |
| 8 | Core 启动 + DOM Observer | `src/core/index.js` |
| 9 | Chrome 扩展 | `extension/manifest.json` + 4 文件 |
| 10 | 油猴脚本入口 | `tampermonkey/entry.js` |
| 11 | FastAPI 后端 | `backend/` 10+ 文件 |
| 12 | 构建验证 + 冒烟测试 | — |

**冒烟测试结果**：

| 接口 | 结果 |
|------|------|
| GET /health | ✅ `{"status":"ok","service":"running"}` |
| POST /api/ocr | ✅ `{"text":"pwq4u","confidence":0.58}` |
| POST /api/slide | ✅ `{"x":0,"y":0}` |

### Phase 2（AI 图像分类）✅ 2026-04-14

**功能**：hCaptcha 图像分类，支持 GPT-4o 云端 API 和 Ollama 本地 GPU 模型

| Task | 内容 | 文件 |
|------|------|------|
| P2.1 | hCaptcha Handler（前端） | `src/core/handlers/hcaptcha.js` |
| P2.2 | OpenAI Provider（后端） | `backend/providers/openai_provider.py` |
| P2.3 | Ollama Provider（后端） | `backend/providers/ollama_provider.py` |
| P2.4 | Provider Factory（后端） | `backend/providers/factory.py` |
| P2.5 | /api/classify 激活 | `backend/routers/classify.py` |
| P2.6 | API Key 管理 UI | popup + config |

**实现难度总结**：

| 子功能 | 难度 | 说明 |
|--------|------|------|
| 后端 classify 接口 + openai_provider | 简单 | 架构已预留，约 80 行 |
| ollama_provider | 简单 | 复用 OpenAI 兼容接口，修改 base_url |
| factory.py 动态选择 | 简单 | 读配置决定实例化哪个 provider |
| 前端 hcaptcha.js | 中等 | 需解析 hCaptcha DOM 结构和题目文本 |
| 完整绕过（含行为模拟） | 困难 | 超出当前架构范围，Phase 3 评估 |

---

## 3. 待实现功能

### Phase 3-A：reCAPTCHA v2（困难）

- 图像分类可行（YOLO / 多模态 AI），但完整绕过极困难
- reCAPTCHA 在独立跨域 iframe 中运行，需扩展 `platform.js` 的 `sendToFrame` 能力
- 需要 stealth 浏览器自动化框架（Camoufox / undetected-chromedriver），超出当前架构范围
- **建议**：作为独立子项目评估，不纳入当前架构迭代

### Phase 3-B：MTCaptcha（中等）

- 挑战类型标准化，多模态 AI 可处理
- 国内使用较少，社区资源有限
- **建议**：优先级低，按需实现

### Phase 3-C：本地 GPU 模型优化

- Ollama + Qwen2-VL 已在 Phase 2 接入，接入层零改动
- 后续可评估 vLLM + InternVL2 用于高并发生产环境
- 硬件要求：RTX 3070+（8GB VRAM）

**优先级建议**：

| 优先级 | 功能 | 状态 |
|--------|------|------|
| P1–P3 | Phase 2 全部功能 | ✅ 已完成 |
| P4 | Phase 3-A：reCAPTCHA v2 | 待排期（5+ 天，高风险） |
| P5 | Phase 3-B：MTCaptcha | 待排期（优先级低） |

---

## 4. 核心设计

### Platform 抽象层

统一 Tampermonkey（`GM_*`）和 Chrome Extension（`chrome.*`）的 API 差异。实际采用 `setPlatform` / `getPlatform` 依赖注入模式，core 层不直接使用平台特定 API。

```javascript
// 接口：request / storage.get|set|remove / notify / sendToFrame
setPlatform(createTampermonkeyAdapter({ GM_xmlhttpRequest, ... }));
// 或
setPlatform(createExtensionAdapter());
```

> 注意：extension adapter 的 `storage.get` 为同步返回，由 `initConfig()` 的 `Promise.resolve` 统一兼容。

### Handler 注册机制

每个验证码类型实现 `detect(doc)` + `async solve(captchaInfo, api)` 接口，按 `priority` 排序注册到 `CaptchaDetector`。`scan()` 返回第一个有结果的 handler 的所有匹配项（handler 级别优先级，同一 handler 内多个验证码均处理）。

CalcHandler 未独立注册，作为 OcrHandler 内部后处理步骤：OCR 识别文本后，若匹配数学表达式模式则调用递归下降解析器计算结果（无 eval，支持中文数字和全角运算符）。

### Provider 工厂模式

```python
# factory.py 根据 config.yaml 动态选择 provider
providers:
  ocr: ddddocr          # ddddocr | openai | ollama
  slide: ddddocr
  classify: openai       # openai | ollama
```

Ollama 复用 `openai_provider.py`，仅修改 `base_url` 指向 `http://localhost:11434`。

### 配置系统

- 前端：扩展用 popup，油猴用 `GM_registerMenuCommand` 注入面板
- 配置项：后端地址、各类型启用/禁用、AI Provider 选择、OpenAI Key / Ollama 地址
- 存储：油猴用 `GM_setValue`，扩展用 `chrome.storage.local`，key 为 `captchaHelperV2Config`

### API 接口

```
POST /api/ocr
  Body: { "image": "base64..." }
  Response: { "text": "AB12", "confidence": 0.95 }

POST /api/slide
  Body: { "target": "base64...", "background": "base64...", "bg_width": 300 }
  Response: { "x": 120, "y": 0 }

POST /api/classify
  Body: { "images": ["base64..."], "question": "选出包含红绿灯的图片" }
  Response: { "selected": [0, 2, 5] }

GET /health
  Response: { "status": "ok", "service": "running" }
```

---

## 5. 已知限制与踩坑记录

| 问题 | 原因 | 处理方式 |
|------|------|---------|
| OCR 对极小图片（< 10px）报 `OSError` | ddddocr 库本身限制 | 正常验证码不受影响，无需处理 |
| slide 接口字段名为 `target`/`background`（非 `bg`/`piece`） | 实现与早期设计草稿不一致 | 已在冒烟测试中确认，文档已更正 |
| hCaptcha 油猴跨域 iframe 限制 | Tampermonkey 无法向跨域 iframe 发消息 | 油猴版 hCaptcha handler 仅支持同域场景；跨域需 Chrome 扩展版 |
| extension adapter `storage.get` 同步返回 | Chrome Extension API 异步，但 TM 同步 | `initConfig()` 统一用 `Promise.resolve` 包装，兼容两端 |

---

## 6. 开发指南

**快速开始**：参见 `captcha/v2/README.md`

**构建**：

```bash
cd captcha/v2
npm install
npm run build          # 同时构建油猴脚本 + Chrome 扩展
npm run build:watch    # 开发模式，文件变更自动重建
```

产出：
- `dist/captcha-helper.user.js`（油猴脚本，含 UserScript 头）
- `dist/extension/`（Chrome 扩展，可直接加载）

**启动后端**：

```bash
cd captcha/v2
uvicorn backend.main:app --host 0.0.0.0 --port 9876 --reload
# 或
bash backend/start.sh
```

**项目结构**：

```
captcha/v2/
├── src/
│   ├── core/           # 共享核心逻辑
│   ├── extension/      # Chrome 扩展适配
│   └── tampermonkey/   # 油猴脚本适配
├── backend/            # FastAPI 后端
├── build/              # esbuild 构建脚本
└── dist/               # 构建产物（gitignore）
```
