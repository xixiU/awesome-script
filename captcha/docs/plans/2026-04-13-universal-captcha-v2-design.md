# 通用验证码识别系统 v2 设计文档

## 1. 项目目标

将现有的文字验证码识别脚本升级为支持多种验证码类型的通用识别系统，同时提供 Chrome 扩展和油猴脚本两种分发形态，共享核心逻辑。

## 2. 支持的验证码类型

### Phase 1（本次实现）
- **图片 OCR 验证码**：数字、字母、中文、混合文字
- **计算验证码**：数学表达式（如 `3+7=?`、`12-5=?`）
- **滑块验证码**：缺口检测 + 模拟人类拖拽轨迹

### Phase 2（后续）
- **hCaptcha**：图像分类任务，接入多模态 AI API

### Phase 3（远期）
- **reCAPTCHA v2**：图像分类 + 行为检测
- **MTCaptcha**：自定义图像挑战
- 本地 GPU 模型部署，替代云端 AI API

## 3. 整体架构

```
Browser
├── core/                    # 共享核心（~90% 代码量）
│   ├── detector.js          # 验证码检测引擎
│   ├── solver.js            # 识别调度器
│   ├── platform.js          # 平台 API 抽象层
│   ├── config.js            # 配置管理
│   ├── handlers/            # 验证码类型处理器
│   │   ├── base.js          # Handler 基类/接口
│   │   ├── ocr.js           # 文字 OCR
│   │   ├── calc.js          # 计算验证码
│   │   └── slider.js        # 滑块验证码
│   └── utils/
│       ├── image.js         # 图片处理（canvas/blob/base64 转换）
│       ├── dom.js           # DOM 查询、输入框填值
│       └── math-parser.js   # 安全数学表达式解析器
├── tampermonkey/            # 油猴适配层
│   └── entry.js             # GM_* API 桥接 + UserScript 头
├── extension/               # Chrome 扩展适配层
│   ├── manifest.json        # MV3 manifest
│   ├── background.js        # Service Worker
│   └── content.js           # Content Script 入口
└── build/                   # 构建配置
    └── build.js             # esbuild 构建脚本

Backend (FastAPI + Python)
├── main.py                  # FastAPI 应用入口
├── config.py                # 配置管理
├── routers/
│   ├── ocr.py               # /api/ocr - 文字识别
│   ├── slide.py             # /api/slide - 滑块缺口检测
│   └── classify.py          # /api/classify - 图像分类（Phase 2 预留）
├── providers/
│   ├── base.py              # Provider 基类
│   ├── ddddocr_provider.py  # ddddocr 本地 OCR
│   ├── openai_provider.py   # GPT-4o 多模态（Phase 2）
│   └── local_model.py       # 本地 GPU 模型（Phase 3）
└── preprocessing/
    └── image.py             # 图像预处理（迁移现有多策略投票逻辑）
```

## 4. 前端核心设计

### 4.1 Platform 抽象层

统一不同运行环境的 API 差异，core 层通过 platform 接口调用，不直接使用平台特定 API。

```javascript
// platform.js - 接口定义
const Platform = {
  // 网络请求（油猴: GM_xmlhttpRequest, 扩展: fetch）
  request(url, options) {},
  // 持久化存储（油猴: GM_setValue, 扩展: chrome.storage.local）
  storage: { get(key) {}, set(key, value) {}, remove(key) {} },
  // 通知（油猴: GM_notification, 扩展: chrome.notifications）
  notify(message) {},
  // iframe 通信（油猴: 不支持跨域, 扩展: chrome.tabs.sendMessage）
  sendToFrame(frameId, message) {},
};
```

### 4.2 Handler 注册机制

每个验证码类型实现统一接口，通过 detector 自动发现和调度。

```javascript
// handlers/base.js
class CaptchaHandler {
  // 检测页面中是否存在该类型验证码，返回匹配的元素信息
  detect(document) { return []; }
  // 解决验证码，返回结果
  async solve(captchaInfo) { return null; }
  // 处理器优先级（数字越小越优先）
  get priority() { return 100; }
}
```

### 4.3 Detector 检测引擎

```javascript
// detector.js
class CaptchaDetector {
  handlers = [];  // 已注册的 handler 列表

  register(handler) { /* 按 priority 排序插入 */ }

  // 扫描页面，返回所有检测到的验证码
  scan(document) {
    for (const handler of this.handlers) {
      const results = handler.detect(document);
      if (results.length) return { handler, results };
    }
    return null;
  }
}
```

### 4.4 计算验证码处理

OCR 识别出文本后，用安全的数学表达式解析器计算结果（不使用 eval）。

支持的运算：`+`、`-`、`*`、`/`，支持中文数字和运算符（`加`、`减`、`乘`、`除`）。

```javascript
// utils/math-parser.js
function parseAndCalculate(text) {
  // "3+7=?" → 10
  // "十二 减 五 等于 ?" → 7
  // "3×7=?" → 21
}
```

### 4.5 滑块验证码处理

迁移现有 `moveSideCaptcha` 逻辑，增强人类行为模拟：
- 贝塞尔曲线轨迹（非匀速直线）
- 随机加速/减速
- 微小的 Y 轴抖动
- 到达目标位置后的微调回弹

## 5. 后端设计

### 5.1 技术栈
- **框架**：FastAPI（原生 async，自带 OpenAPI 文档）
- **OCR**：ddddocr（保持现有能力）
- **图像处理**：Pillow（迁移现有预处理逻辑）
- **AI Provider**：可配置切换

### 5.2 API 设计

```
POST /api/ocr              # 文字验证码识别
  Body: { "image": "base64..." }
  Response: { "text": "AB12", "confidence": 0.95 }

POST /api/slide             # 滑块缺口检测
  Body: { "target": "base64...", "background": "base64...", "bg_width": 300 }
  Response: { "x": 120, "y": 80 }

POST /api/classify          # 图像分类（Phase 2）
  Body: { "images": ["base64..."], "question": "选出包含红绿灯的图片" }
  Response: { "selected": [0, 2, 5] }

GET  /health                # 健康检查
```

### 5.3 Provider 抽象

```python
class BaseProvider:
    async def recognize_text(self, image_bytes: bytes) -> str: ...
    async def detect_slide_gap(self, target: bytes, bg: bytes) -> dict: ...
    async def classify_images(self, images: list[bytes], question: str) -> list[int]: ...
```

配置文件控制使用哪个 provider：
```yaml
providers:
  ocr: ddddocr          # ddddocr | openai | local_model
  slide: ddddocr
  classify: openai       # Phase 2
```

## 6. 构建系统

使用 esbuild，一条命令产出两种分发包：

```bash
npm run build
# 输出:
#   dist/captcha-helper.user.js    (油猴脚本，含 UserScript 头)
#   dist/extension/                (Chrome 扩展，可直接加载)
```

开发时使用 watch 模式，修改 core 后自动重新构建两个目标。

## 7. 配置系统

前端提供统一配置 UI（扩展用 popup，油猴用注入面板）：
- 后端服务地址
- 各类型验证码的启用/禁用
- AI Provider 选择（Phase 2）
- API Key 管理（Phase 2）

## 8. Phase 1 交付物

1. 前端 core 层 + Chrome 扩展 + 油猴脚本
2. FastAPI 后端（OCR + 滑块）
3. 计算验证码前端解析器
4. esbuild 构建系统
5. 基础配置 UI
