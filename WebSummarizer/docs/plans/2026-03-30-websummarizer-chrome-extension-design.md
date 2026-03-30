# WebSummarizer Chrome 插件迁移与增强设计文档

> 创建日期：2026-03-30  
> 状态：设计已确认，待实现

---

## 背景

现有 `WebSummarizer/web_summarizer.js` 是一个油猴（Tampermonkey）脚本，已具备：

- 三种 AI 引擎：Dify / Chrome Gemini / OpenAI 兼容 API
- 智能正文提取（三层策略：常见选择器 → 文本密度算法 → Body 回退）
- 全文总结 + 选中文本总结
- 浮动按钮 + 结果面板 + 可视化配置面板（GM_setValue 存储）

**本次目标**：将上述功能完整迁移至 Chrome 插件（Manifest V3），同时新增三项能力：
1. 结构化元数据抓取（可开关）
2. 数据导出（可开关）
3. 观点纠偏 + 网页类型化 Prompt 总结

---

## 新增功能说明

### F1 - 结构化元数据抓取（可开关）

在现有纯文本提取之外，额外抓取页面结构化信息：

- OG 标签：`og:title`、`og:description`、`og:image`、`og:type`
- 文章元数据：作者、发布时间、标签/分类
- 页面基础信息：`<title>`、`<meta name="description">`、canonical URL

抓取结果可以：一并传给 AI（丰富上下文），或单独在结果面板显示。

### F2 - 数据导出（可开关）

总结完成后支持将以下内容导出：

- 导出格式：JSON（结构化数据）、Markdown（总结结果）
- 导出内容：页面元数据 + 正文内容 + AI 总结结果
- 实现方式：使用 `chrome.downloads` API 触发浏览器下载

### F3 - 观点纠偏（AI 交叉核验）

对文章中的数据和观点，利用 AI 内部知识做交叉核验：

- AI 识别文章中可疑的数据、夸大表述、单方面立场
- 输出「核验摘要」：哪些观点可能存在问题，中立视角补充
- 实现方式：在发送给 AI 的 Prompt 中追加核验指令

### F4 - 网页类型化 Prompt（预设 + 可扩展）

用户可配置当前偏好的页面类型，脚本据此选择对应 Prompt：

**内置预设类别**：

| 类别 | Prompt 侧重点 |
|---|---|
| 新闻资讯 | 时间、人物、事件、影响 |
| 技术博客 | 核心技术点、实现思路、适用场景 |
| 电商商品 | 核心参数、优缺点、适用人群 |
| 学术论文 | 研究问题、方法、结论、局限性 |
| 论坛讨论 | 主要观点汇总、共识与分歧 |
| 默认（通用） | 通用总结 Prompt |

用户也可自定义新增类别名称 + Prompt 文本。

---

## 架构决策

### 原油猴机制 → Chrome 插件对应

| 原机制 | Chrome 插件方案 | 说明 |
|---|---|---|
| `GM_xmlhttpRequest` | `service_worker.js` 统一发请求 | 解决 CORS，统一管理 API 调用 |
| `GM_setValue/getValue` | `chrome.storage.local` | 异步 API，功能等价 |
| 页面内配置面板 | `options.html` 独立设置页 | 空间更大，配置更完整 |
| 油猴菜单命令 | `popup.html` 工具栏弹窗 | 快捷触发总结 / 导出操作 |
| `@match *://*/*` | `manifest.json` content_scripts | 所有页面注入 |

### 通信流程

```
content.js（提取内容 + 渲染 UI）
    ↓ chrome.runtime.sendMessage
service_worker.js（调用 AI API）
    ↓ 返回结果
content.js（渲染总结结果）
```

---

## 目录结构

```
WebSummarizer/
└── chrome_extension/
    ├── manifest.json
    ├── icons/
    │   ├── icon16.png
    │   ├── icon48.png
    │   └── icon128.png
    ├── content/
    │   ├── content.js             # 注入页面：UI + 调度逻辑
    │   └── content.css            # 浮动按钮 & 面板样式
    ├── background/
    │   └── service_worker.js      # 后台：统一处理 AI API 调用
    ├── options/
    │   ├── options.html           # 设置页：AI 配置 + 功能开关 + Prompt 管理
    │   ├── options.js
    │   └── options.css
    ├── popup/
    │   ├── popup.html             # 工具栏弹窗：快捷操作
    │   ├── popup.js
    │   └── popup.css
    └── modules/
        ├── content-extractor.js   # 迁移：智能正文提取
        ├── metadata-extractor.js  # 新增：结构化元数据抓取
        ├── prompt-manager.js      # 新增：Prompt 类别管理
        └── export-manager.js      # 新增：数据导出
```

---

## 任务清单

### T01 - 项目基础搭建

- [ ] 创建 `chrome_extension` 目录结构
- [ ] 编写 `manifest.json`（Manifest V3，声明权限、content_scripts、service_worker）
- [ ] 生成占位图标（icon16/48/128）

### T02 - 迁移：正文提取模块

- [ ] 将 `ContentExtractor` 类迁移至 `modules/content-extractor.js`
- [ ] 适配为 ES Module 或 IIFE（content script 环境）
- [ ] 保留三层提取策略不变

### T03 - 迁移：AI API 调用模块

- [ ] 将 Dify / OpenAI / Chrome Gemini 三套 API 逻辑迁移至 `background/service_worker.js`
- [ ] 改用 `chrome.runtime.onMessage` 接收 content.js 的请求
- [ ] 改用原生 `fetch` 替代 `GM_xmlhttpRequest`

### T04 - 迁移：UI 层（浮动按钮 + 结果面板）

- [ ] 将浮动按钮、结果面板、加载动画迁移至 `content/content.js` + `content.css`
- [ ] 将原配置面板功能拆出，移至 `options/` 独立页面
- [ ] 改用 `chrome.storage.local` 替代 `GM_setValue/getValue`

### T05 - 迁移：设置页

- [ ] 实现 `options.html` 页面，包含 AI 提供商配置（Dify / OpenAI / Chrome Gemini）
- [ ] 新增功能开关：结构化抓取开关、数据导出开关、观点纠偏开关
- [ ] 实现配置保存与读取（`chrome.storage.local`）

### T06 - 新增：结构化元数据抓取（F1）

- [ ] 实现 `modules/metadata-extractor.js`，提取 OG / 作者 / 发布时间 / 标签
- [ ] 在 `content.js` 中根据开关决定是否执行
- [ ] 将元数据追加到 AI 请求上下文中

### T07 - 新增：Prompt 类别管理（F4）

- [ ] 实现 `modules/prompt-manager.js`，内置 5 个预设类别 + 自定义类别
- [ ] 在 `options.html` 中提供类别选择 + 自定义 Prompt 编辑界面
- [ ] `service_worker.js` 根据当前选中类别组装 Prompt

### T08 - 新增：观点纠偏（F3）

- [ ] 设计纠偏 Prompt 指令（追加在主 Prompt 之后）
- [ ] 在 `service_worker.js` 中根据开关决定是否注入纠偏指令
- [ ] 结果面板中单独展示「核验摘要」区块

### T09 - 新增：数据导出（F2）

- [ ] 实现 `modules/export-manager.js`，支持 JSON 和 Markdown 格式
- [ ] 在结果面板新增导出按钮（根据开关显示/隐藏）
- [ ] 使用 `chrome.downloads` API 触发下载

### T10 - 工具栏弹窗

- [ ] 实现 `popup.html`，提供快捷操作：触发总结、触发导出、跳转设置页

### T11 - 整体联调与测试

- [ ] 所有模块联通测试
- [ ] 在常见网站验证（新闻、博客、电商、论坛）
- [ ] 错误处理与边界情况覆盖

---

## 变更记录

| 日期 | 内容 |
|---|---|
| 2026-03-30 | 初版设计文档，完成需求探讨与架构确认 |
