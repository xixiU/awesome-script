# Phase 2 / Phase 3 技术调研报告

**日期**：2026-04-14  
**作者**：产品经理  
**状态**：调研完成，待排期

---

## 背景

Phase 1 已完成并通过冒烟测试（2026-04-14）。本文档对设计文档中 Phase 2 和 Phase 3 功能进行技术可行性分析，为后续排期提供依据。

---

## Phase 2：hCaptcha 图像分类

### 功能描述

hCaptcha 是当前最主流的验证码服务之一，核心挑战形式为图像分类：展示多张图片，要求用户"选出包含红绿灯的图片"等。

### 技术可行性

**图像分类本身：可行**

- GPT-4o / Claude Vision / Gemini Vision 均支持 base64 图片输入
- 可以 zero-shot 理解自然语言指令（"选出包含摩托车的图片"）
- 标准挑战下准确率约 70–85%
- 接口简单：发送图片数组 + 问题文本 → 返回选中下标

**完整绕过 hCaptcha：困难**

现代 hCaptcha 的核心防御不在图像识别，而在：
1. **行为生物特征**：鼠标轨迹、点击节奏、停留时长
2. **浏览器指纹**：GPU 指纹、字体列表、Canvas 指纹、WebGL 信息
3. **HSW Token**：需要真实浏览器环境生成的安全令牌
4. **被动检测**：挑战展示前已通过行为评分判断是否为 Bot

单纯调 AI API 识别图片，在行为检测层就会被拦截。图像分类只是整个绕过流程中的一个环节。

### 实现难度

| 子功能 | 难度 | 说明 |
|--------|------|------|
| 后端 `/api/classify` 接口 | 简单 | 50 行代码，架构已预留 |
| openai_provider.py 实现 | 简单 | 调 OpenAI API，封装图片发送逻辑 |
| 前端 hcaptcha.js handler | 中等 | 需研究 hCaptcha DOM 结构，解析题目文本 |
| 完整绕过（含行为模拟） | 困难 | 超出当前架构范围，需独立 stealth 浏览器层 |

### 依赖条件

- **OpenAI API Key**（GPT-4o，约 $0.01–0.03/次）或 Anthropic API Key
- 后端新增 `providers/openai_provider.py`，实现 `classify_images()` 方法
- 前端新增 `handlers/hcaptcha.js`，注册到 detector
- 配置系统增加 `OPENAI_API_KEY` 和 provider 切换逻辑

### 对现有架构的影响

架构已预留，改动范围极小：

| 模块 | 改动内容 |
|------|---------|
| `backend/providers/openai_provider.py` | 新增（约 80 行） |
| `backend/routers/classify.py` | 移除 stub，接入 openai_provider |
| `backend/config.py` | 增加 `OPENAI_API_KEY` 环境变量读取 |
| `src/core/handlers/hcaptcha.js` | 新增（约 150 行） |
| `src/core/index.js` | 注册 hcaptcha handler |

**无需改动**：build 系统、platform 抽象层、OCR/slide 逻辑、后端 main.py

---

## Phase 3-A：reCAPTCHA v2

### 功能描述

Google reCAPTCHA v2 包含两部分：
1. **图像分类挑战**：类似 hCaptcha，选择包含指定物体的图片（3×3 或 4×4 网格）
2. **行为检测**：通过 checkbox 交互评分，高分用户直接跳过图像挑战

### 技术可行性

**图像分类**：可行
- 学术研究已证明：2024 年论文《Breaking reCAPTCHAv2》用 YOLO 模型实现了 100% 图像分类成功率
- 多模态 AI（GPT-4o 等）同样可处理
- 开源项目 `recaptcha_v2_solver` 等已有实现参考

**完整绕过**：极困难
- Google 的行为分析比 hCaptcha 更成熟
- reCAPTCHA v3 已全面转向行为评分，v2 也在持续强化被动检测
- reCAPTCHA 在独立跨域 iframe 中运行，前端 handler 需要复杂的 iframe 通信
- 需要完整的 stealth 浏览器环境（Camoufox / undetected-chromedriver）
- 代理 IP 质量要求高

### 实现难度：困难

### 依赖条件

- 同 Phase 2（多模态 AI API）
- 额外需要 stealth 浏览器自动化框架（超出当前架构范围）
- 高质量住宅代理 IP

### 对现有架构的影响

- **后端**：复用 Phase 2 的 `openai_provider.py`，改动极小
- **前端**：新增 `handlers/recaptcha.js`，但 reCAPTCHA 在独立 iframe 中，需扩展 `platform.js` 的 `sendToFrame` 能力
- **新增**：stealth 浏览器层，超出当前架构范围，需作为独立子项目评估

---

## Phase 3-B：MTCaptcha

### 功能描述

MTCaptcha 是商业验证码服务，提供多种挑战类型（文字扭曲、图像选择等）。

### 技术可行性：中等

- 挑战类型相对标准化，多模态 AI 可处理图像挑战
- 国内使用较少，社区资源有限
- 无明显技术壁垒，但需要专项研究其 DOM 结构

### 实现难度：中等

### 建议：优先级低，按需实现

---

## Phase 3-C：本地 GPU 模型替代云端 AI

### 功能描述

用本地部署的视觉语言模型（VLM）替代 OpenAI API，降低成本，保护隐私。

### 技术可行性：可行

**推荐方案：**

| 方案 | 适用场景 | 部署难度 | 硬件要求 |
|------|---------|---------|---------|
| Ollama + Qwen2-VL | 个人/开发环境，快速启动 | 简单（`ollama run qwen2-vl`） | 8GB+ VRAM（RTX 3070+） |
| Ollama + Qwen2-VL 2B | 低配环境 | 简单 | 4GB VRAM，精度略低 |
| vLLM + InternVL2 | 高并发生产环境 | 中等 | 企业级 GPU |

**关键优势**：Ollama 提供 OpenAI 兼容 API（`http://localhost:11434`），后端只需修改 `base_url` 即可复用 `openai_provider.py`，**接入层几乎零改动**。

### 实现难度：简单（接入层）/ 中等（模型调优）

### 依赖条件

- 本地 GPU（NVIDIA RTX 3070+ 推荐）
- Ollama 安装（官网一键安装）
- 模型下载（`ollama pull qwen2-vl`，约 5GB）

### 对现有架构的影响

| 模块 | 改动内容 |
|------|---------|
| `backend/providers/openai_provider.py` | 增加 `base_url` 配置项，指向 Ollama 地址 |
| `backend/config.py` | 增加 `LOCAL_MODEL_URL` 配置 |
| 其他模块 | **无需改动** |

---

## 优先级建议

| 优先级 | 功能 | 理由 | 预估工作量 |
|--------|------|------|-----------|
| **P1** | Phase 2：后端 openai_provider + classify 接口 | 架构已预留，改动小，解锁图像分类能力 | 0.5 天 |
| **P2** | Phase 3-C：本地模型支持（Ollama） | 复用 openai_provider，接入成本极低，降低 API 费用 | 0.5 天 |
| **P3** | Phase 2：前端 hcaptcha.js handler | 需研究 hCaptcha DOM 结构，工作量中等 | 2 天 |
| **P4** | Phase 3-A：reCAPTCHA v2 | 需 stealth 浏览器层，超出当前架构，风险高 | 5+ 天 |
| **P5** | Phase 3-B：MTCaptcha | 使用场景少 | 2 天 |

---

## 最优实施路径

```
Step 1（P1）：实现 openai_provider.py + 激活 /api/classify
  ↓ 约 0.5 天
Step 2（P2）：支持 Ollama 本地模型（修改 base_url 配置）
  ↓ 约 0.5 天
Step 3（P3）：前端 hcaptcha.js handler
  ↓ 约 2 天
完成 Phase 2 核心功能

Step 4（P4/P5）：按需评估 reCAPTCHA v2 / MTCaptcha
  独立项目规划，不纳入当前架构迭代
```

**最小可行路径（1 天工作量）**：Step 1 + Step 2 即可完成"AI 图像分类能力"的后端基础设施，为 Phase 2 前端开发铺路。

---

## 参考资料

- [Breaking reCAPTCHAv2 (2024)](https://arxiv.org/html/2409.08831v1)
- [Are CAPTCHAs Still Bot-hard? Agentic VLM (2024)](https://halligan.pages.dev/)
- [Ollama 官网](https://ollama.com)
- [Qwen2-VL HuggingFace](https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct)
