# WebSummarizer Chrome Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有油猴脚本 `WebSummarizer/web_summarizer.js` 完整迁移至 Chrome 插件（Manifest V3），并新增结构化元数据抓取、数据导出、观点纠偏、类型化 Prompt 四项功能。

**Architecture:** Content Script 负责页面 UI 与内容提取，Service Worker 统一处理 AI API 调用（解决 CORS），chrome.storage.local 替代 GM_setValue，options.html 独立设置页替代原页面内配置面板。

**Tech Stack:** Chrome Extension Manifest V3, Vanilla JS (ES Module), chrome.storage.local, chrome.downloads, chrome.runtime messaging

**设计文档参考:** `docs/plans/2026-03-30-websummarizer-chrome-extension-design.md`

---

## Task 1: 基础目录结构与 manifest.json

**Files:**
- Create: `WebSummarizer/chrome_extension/manifest.json`
- Create: `WebSummarizer/chrome_extension/icons/` (占位图标)

**Step 1: 创建完整目录骨架**

```bash
mkdir -p WebSummarizer/chrome_extension/{icons,content,background,options,popup,modules}
```

**Step 2: 编写 manifest.json**

```json
{
  "manifest_version": 3,
  "name": "WebSummarizer - AI 网页智能总结",
  "version": "2.0.0",
  "description": "使用 AI 智能总结网页内容，支持观点纠偏、类型化 Prompt、结构化数据导出",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "permissions": [
    "storage",
    "downloads",
    "activeTab"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background/service_worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "exclude_matches": ["https://www.youtube.com/*"],
      "js": [
        "modules/content-extractor.js",
        "modules/metadata-extractor.js",
        "modules/prompt-manager.js",
        "modules/export-manager.js",
        "content/content.js"
      ],
      "css": ["content/content.css"],
      "run_at": "document_end",
      "all_frames": false
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png"
    }
  },
  "options_page": "options/options.html"
}
```

**Step 3: 生成简单占位图标**

用 canvas 或任意工具生成三个尺寸的 PNG 图标（内容为文字"AI"的渐变圆形），放到 `icons/` 目录。可以先用 1x1 透明 PNG 占位，后续替换。

**Step 4: Commit**

```bash
git add WebSummarizer/chrome_extension/
git commit -m "feat: scaffold chrome extension structure and manifest"
```

---

## Task 2: 迁移正文提取模块

**Files:**
- Create: `WebSummarizer/chrome_extension/modules/content-extractor.js`
- 参考: `WebSummarizer/web_summarizer.js` 第 697-918 行（`ContentExtractor` 类）

**Step 1: 提取 ContentExtractor 类，改造为全局变量（content script 不支持 import）**

```javascript
// modules/content-extractor.js
// ContentExtractor 暴露为全局变量，供 content.js 使用
class ContentExtractor {
    constructor() {
        this.contentSelectors = [
            'article', 'main', '[role="main"]',
            '.article-content', '.articalContent', '.articleContent',
            '.post-content', '.entry-content', '.content',
            '.main-content', '.article-body', '.post-body',
            '#article', '#content', '.markdown-body',
            '.news-content', '.newsContent', '.detail-content',
            '.rich-text', '.story-body', '.article-text',
            '[class*="article-content"]', '[class*="post-content"]',
            '[class*="main-content"]'
        ];
        this.excludeSelectors = [
            'nav', 'header', 'footer', 'aside',
            '.sidebar', '.navigation', '.nav', '.menu',
            '.ad', '.advertisement', '.promo', '.related',
            '.comments', '.comment', '.social-share', '.share',
            '.tags', '.breadcrumb', 'script', 'style', 'iframe', 'noscript'
        ];
    }

    extract() {
        let content = this._tryCommonSelectors();
        if (content && content.length > 100) return this._cleanText(content);

        content = this._extractByTextDensity();
        if (content && content.length > 100) return this._cleanText(content);

        return this._cleanText(document.body.innerText || '');
    }

    // ... 完整迁移原有 tryCommonSelectors / extractByTextDensity / cleanText 等私有方法
}

// 挂载到 window，供同一 content script 环境的其他文件访问
window.ContentExtractor = ContentExtractor;
```

> 注意：从原文件第 760-918 行完整复制三个私有方法（`tryCommonSelectors`、`extractByTextDensity`、`cleanText`），方法名加下划线前缀以示私有。

**Step 2: 验证方式**

在 Chrome 开发者工具 Console 中执行：
```javascript
new window.ContentExtractor().extract()
```
应返回非空字符串。

**Step 3: Commit**

```bash
git add WebSummarizer/chrome_extension/modules/content-extractor.js
git commit -m "feat: migrate ContentExtractor to chrome extension module"
```

---

## Task 3: 新增结构化元数据抓取模块

**Files:**
- Create: `WebSummarizer/chrome_extension/modules/metadata-extractor.js`

**Step 1: 实现 MetadataExtractor**

```javascript
// modules/metadata-extractor.js
class MetadataExtractor {
    extract() {
        return {
            title: this._getTitle(),
            description: this._getMeta('description') || this._getOG('description'),
            author: this._getAuthor(),
            publishedTime: this._getPublishedTime(),
            tags: this._getTags(),
            ogImage: this._getOG('image'),
            ogType: this._getOG('type'),
            canonicalUrl: this._getCanonicalUrl(),
            siteName: this._getOG('site_name'),
        };
    }

    _getTitle() {
        return this._getOG('title') || document.title || '';
    }

    _getMeta(name) {
        const el = document.querySelector(`meta[name="${name}"]`);
        return el ? el.getAttribute('content') : '';
    }

    _getOG(property) {
        const el = document.querySelector(`meta[property="og:${property}"]`);
        return el ? el.getAttribute('content') : '';
    }

    _getAuthor() {
        return this._getMeta('author')
            || this._getMeta('article:author')
            || document.querySelector('[rel="author"]')?.textContent?.trim()
            || document.querySelector('.author, .byline, [class*="author"]')?.textContent?.trim()
            || '';
    }

    _getPublishedTime() {
        return document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
            || document.querySelector('time[datetime]')?.getAttribute('datetime')
            || document.querySelector('time')?.textContent?.trim()
            || '';
    }

    _getTags() {
        const keywords = this._getMeta('keywords');
        if (keywords) return keywords.split(',').map(k => k.trim()).filter(Boolean);
        const tagEls = document.querySelectorAll('.tag, .tags a, [class*="tag"] a');
        return Array.from(tagEls).map(el => el.textContent.trim()).filter(Boolean).slice(0, 10);
    }

    _getCanonicalUrl() {
        return document.querySelector('link[rel="canonical"]')?.getAttribute('href') || window.location.href;
    }

    formatForAI(metadata) {
        const parts = [];
        if (metadata.title) parts.push(`标题：${metadata.title}`);
        if (metadata.author) parts.push(`作者：${metadata.author}`);
        if (metadata.publishedTime) parts.push(`发布时间：${metadata.publishedTime}`);
        if (metadata.siteName) parts.push(`来源：${metadata.siteName}`);
        if (metadata.tags?.length) parts.push(`标签：${metadata.tags.join('、')}`);
        if (metadata.description) parts.push(`摘要：${metadata.description}`);
        return parts.join('\n');
    }
}

window.MetadataExtractor = MetadataExtractor;
```

**Step 2: Commit**

```bash
git add WebSummarizer/chrome_extension/modules/metadata-extractor.js
git commit -m "feat: add MetadataExtractor module for structured page info"
```

---

## Task 4: 新增 Prompt 管理模块

**Files:**
- Create: `WebSummarizer/chrome_extension/modules/prompt-manager.js`

**Step 1: 实现 PromptManager（预设类别 + 自定义 + 观点纠偏指令）**

```javascript
// modules/prompt-manager.js
const PRESET_CATEGORIES = [
    {
        id: 'default',
        name: '通用（默认）',
        prompt: `请对以下网页内容进行智能总结，提取关键信息，用简洁清晰的语言输出。
输出格式：
## 核心摘要
（2-3句话概括）

## 主要内容
（3-5个要点）

## 关键信息
（重要数据、结论或观点）`
    },
    {
        id: 'news',
        name: '新闻资讯',
        prompt: `请按新闻报道的要素对以下内容进行总结。
输出格式：
## 新闻摘要
## 时间地点人物
## 事件经过
## 影响与意义`
    },
    {
        id: 'tech-blog',
        name: '技术博客',
        prompt: `请从技术视角对以下内容进行总结。
输出格式：
## 核心技术点
## 实现思路/方案
## 适用场景
## 注意事项/局限性`
    },
    {
        id: 'product',
        name: '电商商品',
        prompt: `请对以下商品信息进行总结分析。
输出格式：
## 商品概述
## 核心参数
## 优点
## 缺点/不足
## 适合人群`
    },
    {
        id: 'academic',
        name: '学术论文',
        prompt: `请对以下学术内容进行总结。
输出格式：
## 研究问题
## 研究方法
## 主要发现/结论
## 局限性`
    },
    {
        id: 'forum',
        name: '论坛讨论',
        prompt: `请对以下讨论内容进行总结。
输出格式：
## 讨论主题
## 主要观点（正方）
## 主要观点（反方）
## 共识与分歧`
    }
];

const FACT_CHECK_PROMPT = `

---
## 观点核验（请额外完成以下分析）
基于你的知识，对上文中的数据、观点进行交叉核验：
1. **可疑数据**：列出文中可能不准确或夸大的数据
2. **立场偏差**：识别文章明显的立场倾向或单方面表述
3. **中立补充**：提供更客观平衡的视角补充
如无明显问题，可注明"未发现明显问题"。`;

class PromptManager {
    constructor() {
        this._presets = PRESET_CATEGORIES;
    }

    async getActiveCategory() {
        return new Promise(resolve => {
            chrome.storage.local.get(['activeCategoryId', 'customCategories'], (result) => {
                const id = result.activeCategoryId || 'default';
                const customs = result.customCategories || [];
                const all = [...this._presets, ...customs];
                resolve(all.find(c => c.id === id) || this._presets[0]);
            });
        });
    }

    async buildPrompt(url, content, metadata, options = {}) {
        const category = await this.getActiveCategory();
        const metadataStr = metadata ? `\n\n【页面信息】\n${metadata}` : '';

        let prompt = `${category.prompt}\n\n【页面地址】\n${url}${metadataStr}\n\n【页面内容】\n${content}`;

        if (options.factCheck) {
            prompt += FACT_CHECK_PROMPT;
        }

        return prompt;
    }

    getPresets() {
        return this._presets;
    }

    async getCustomCategories() {
        return new Promise(resolve => {
            chrome.storage.local.get('customCategories', r => resolve(r.customCategories || []));
        });
    }

    async saveCustomCategories(categories) {
        return new Promise(resolve => {
            chrome.storage.local.set({ customCategories: categories }, resolve);
        });
    }
}

window.PromptManager = PromptManager;
window.PRESET_CATEGORIES = PRESET_CATEGORIES;
```

**Step 2: Commit**

```bash
git add WebSummarizer/chrome_extension/modules/prompt-manager.js
git commit -m "feat: add PromptManager with preset categories and fact-check prompt"
```

---

## Task 5: 新增数据导出模块

**Files:**
- Create: `WebSummarizer/chrome_extension/modules/export-manager.js`

**Step 1: 实现 ExportManager**

```javascript
// modules/export-manager.js
class ExportManager {
    exportJSON(data) {
        const payload = {
            exportedAt: new Date().toISOString(),
            url: data.url,
            metadata: data.metadata || {},
            content: data.content || '',
            summary: data.summary || '',
            category: data.category || 'default'
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        this._download(blob, `summary-${Date.now()}.json`);
    }

    exportMarkdown(data) {
        const lines = [
            `# ${data.metadata?.title || '网页总结'}`,
            ``,
            `> 来源：${data.url}`,
            `> 导出时间：${new Date().toLocaleString('zh-CN')}`,
            ``,
        ];

        if (data.metadata) {
            const m = data.metadata;
            if (m.author) lines.push(`**作者：** ${m.author}  `);
            if (m.publishedTime) lines.push(`**发布时间：** ${m.publishedTime}  `);
            if (m.tags?.length) lines.push(`**标签：** ${m.tags.join('、')}  `);
            lines.push('');
        }

        lines.push('## AI 总结', '', data.summary || '', '');

        if (data.content) {
            lines.push('## 原文内容', '', data.content, '');
        }

        const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
        this._download(blob, `summary-${Date.now()}.md`);
    }

    _download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

window.ExportManager = ExportManager;
```

**Step 2: Commit**

```bash
git add WebSummarizer/chrome_extension/modules/export-manager.js
git commit -m "feat: add ExportManager for JSON and Markdown export"
```

---

## Task 6: 后台 Service Worker（AI API 调用）

**Files:**
- Create: `WebSummarizer/chrome_extension/background/service_worker.js`
- 参考: `WebSummarizer/web_summarizer.js` 第 919-1101 行（三套 API 类）

**Step 1: 实现 service_worker.js**

Service Worker 监听来自 content script 的消息，统一处理 AI API 调用。

```javascript
// background/service_worker.js

// 读取配置的辅助函数
async function getConfig() {
    return new Promise(resolve => {
        chrome.storage.local.get([
            'aiProvider', 'difyApiUrl', 'difyApiKey',
            'openaiBaseUrl', 'openaiModel', 'openaiApiKey'
        ], resolve);
    });
}

// Dify API 调用
async function callDify(prompt, config) {
    const response = await fetch(config.difyApiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.difyApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputs: { newsUrl: '', newsContent: prompt },
            response_mode: 'blocking',
            user: 'chrome-extension'
        })
    });
    if (!response.ok) throw new Error(`Dify API 错误: ${response.status}`);
    const data = await response.json();
    return data.data?.outputs?.text
        || data.data?.outputs?.result
        || data.answer
        || JSON.stringify(data, null, 2);
}

// OpenAI 兼容 API 调用
async function callOpenAI(prompt, config) {
    const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.openaiApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: config.openaiModel || 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            stream: false
        })
    });
    if (!response.ok) throw new Error(`OpenAI API 错误: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}

// 消息监听入口
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SUMMARIZE') {
        handleSummarize(message.payload).then(sendResponse).catch(err => {
            sendResponse({ error: err.message });
        });
        return true; // 保持消息通道开放（异步响应必须）
    }
});

async function handleSummarize(payload) {
    const config = await getConfig();
    const provider = config.aiProvider || 'openai';
    const { prompt } = payload;

    let result;
    if (provider === 'dify') {
        result = await callDify(prompt, config);
    } else if (provider === 'chrome-gemini') {
        // Chrome Gemini 只能在 content script 中直接调用，Service Worker 不可用
        // 返回特殊标记，让 content.js 自行处理
        return { useLocalGemini: true, prompt };
    } else {
        result = await callOpenAI(prompt, config);
    }

    return { result };
}
```

**Step 2: Commit**

```bash
git add WebSummarizer/chrome_extension/background/service_worker.js
git commit -m "feat: add service worker for AI API calls (Dify + OpenAI)"
```

---

## Task 7: Content Script 主逻辑

**Files:**
- Create: `WebSummarizer/chrome_extension/content/content.js`
- 参考: `WebSummarizer/web_summarizer.js` 第 1102-2811 行（UIManager 及之后全部）

**Step 1: 实现 content.js 核心流程**

content.js 负责：初始化 UI（浮动按钮 + 结果面板）、监听用户操作、协调各模块、与 service worker 通信。

关键结构：

```javascript
// content/content.js
(function () {
    'use strict';

    // 防止重复注入
    if (document.getElementById('ws-summarizer-btn')) return;

    // 读取配置
    async function getSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get([
                'enableMetadata', 'enableExport', 'enableFactCheck', 'activeCategoryId'
            ], resolve);
        });
    }

    // 主总结流程
    async function handleSummarize(selectedText = '') {
        const settings = await getSettings();

        // 1. 提取内容
        const extractor = new window.ContentExtractor();
        const content = selectedText || extractor.extract();

        // 2. 提取元数据（可选）
        let metadata = null;
        let metadataStr = '';
        if (settings.enableMetadata) {
            const metaExtractor = new window.MetadataExtractor();
            metadata = metaExtractor.extract();
            metadataStr = metaExtractor.formatForAI(metadata);
        }

        // 3. 组装 Prompt
        const promptMgr = new window.PromptManager();
        const prompt = await promptMgr.buildPrompt(
            window.location.href,
            content,
            metadataStr,
            { factCheck: settings.enableFactCheck }
        );

        // 4. 发送给 service worker
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: 'SUMMARIZE', payload: { prompt } },
                (response) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else if (response.error) reject(new Error(response.error));
                    else if (response.useLocalGemini) resolve({ useLocalGemini: true, prompt: response.prompt, metadata, content });
                    else resolve({ result: response.result, metadata, content });
                }
            );
        });
    }

    // UIManager - 迁移自油猴脚本，保留原有浮动按钮、结果面板等 UI 逻辑
    // 主要改动：
    // - 移除所有 GM_* API 调用
    // - 配置读写改为 chrome.storage.local
    // - 调用 AI 改为 handleSummarize()
    // - 结果面板新增"导出"按钮（根据 enableExport 开关控制显示）
    class UIManager {
        // ... 从原脚本迁移，修改上述三处
    }

    const uiManager = new UIManager();
})();
```

> 完整实现：将原 `UIManager` 类（第 1103-2748 行）全量复制，按上述三处改动修改，其余 UI 逻辑（拖拽、全屏检测、Markdown 渲染等）保持不变。

**Step 2: 在结果面板新增导出按钮**

在原 `showResultPanel` 方法的操作按钮区域，追加导出按钮逻辑：

```javascript
// 在操作按钮区域追加（受 enableExport 开关控制）
if (settings.enableExport) {
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '⬇️ 导出';
    exportBtn.addEventListener('click', () => {
        const exportMgr = new window.ExportManager();
        exportMgr.exportMarkdown({
            url: window.location.href,
            metadata: this.currentMetadata,
            content: this.currentContent,
            summary: this.currentResult
        });
    });
    actionsDiv.appendChild(exportBtn);
}
```

**Step 3: Commit**

```bash
git add WebSummarizer/chrome_extension/content/content.js
git commit -m "feat: migrate UIManager to content script with chrome APIs"
```

---

## Task 8: Content CSS（样式迁移）

**Files:**
- Create: `WebSummarizer/chrome_extension/content/content.css`

**Step 1: 将原脚本样式块迁移至独立 CSS 文件**

从 `web_summarizer.js` 第 43-696 行的 `styles` 字符串常量中提取所有 CSS 规则，原样写入 `content.css`。

注意：去掉 JS 字符串包裹（模板字符串的反引号），直接保存为纯 CSS 文件。

**Step 2: Commit**

```bash
git add WebSummarizer/chrome_extension/content/content.css
git commit -m "feat: extract styles to content.css"
```

---

## Task 9: Options 设置页

**Files:**
- Create: `WebSummarizer/chrome_extension/options/options.html`
- Create: `WebSummarizer/chrome_extension/options/options.js`
- Create: `WebSummarizer/chrome_extension/options/options.css`

**Step 1: options.html 结构（四个 Tab）**

```html
<!-- Tab 1: AI 提供商配置（迁移原设置面板内容） -->
<!-- Tab 2: 功能开关（结构化抓取 / 数据导出 / 观点纠偏） -->
<!-- Tab 3: Prompt 类别管理（预设列表 + 自定义编辑器） -->
<!-- Tab 4: 关于 -->
```

**Step 2: options.js 逻辑要点**

- 页面加载时从 `chrome.storage.local` 读取所有配置并填充表单
- 保存时写回 `chrome.storage.local`
- Tab 3 中展示 `PRESET_CATEGORIES` 列表（只读），以及自定义类别的增删改功能
- 自定义类别格式：`{ id, name, prompt }`，存储键：`customCategories`

**Step 3: Commit**

```bash
git add WebSummarizer/chrome_extension/options/
git commit -m "feat: add options page with AI config, feature toggles, and prompt management"
```

---

## Task 10: Popup 工具栏弹窗

**Files:**
- Create: `WebSummarizer/chrome_extension/popup/popup.html`
- Create: `WebSummarizer/chrome_extension/popup/popup.js`
- Create: `WebSummarizer/chrome_extension/popup/popup.css`

**Step 1: popup 功能**

- 「📝 AI 总结当前页面」按钮 → 向当前 Tab 的 content script 发消息触发总结
- 「⬇️ 导出」按钮（受 enableExport 开关控制）
- 「⚙️ 设置」按钮 → `chrome.runtime.openOptionsPage()`
- 显示当前激活的 AI 提供商和 Prompt 类别

```javascript
// popup.js
document.getElementById('btn-summarize').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SUMMARIZE' });
    window.close();
});

document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});
```

**Step 2: Commit**

```bash
git add WebSummarizer/chrome_extension/popup/
git commit -m "feat: add popup with quick actions"
```

---

## Task 11: 联调与验证

**Step 1: 在 Chrome 中加载插件**

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `WebSummarizer/chrome_extension/` 目录
4. 确认插件出现在扩展列表中，无报错

**Step 2: 验证核心功能**

| 验证项 | 预期结果 |
|---|---|
| 浮动按钮出现在页面右侧 | ✅ |
| 点击按钮触发 AI 总结 | ✅ 结果面板弹出 |
| 选中文本后点击按钮 | ✅ 总结选中内容 |
| 开启元数据抓取后总结 | ✅ AI 收到作者/时间等信息 |
| 开启观点纠偏后总结 | ✅ 结果中包含「观点核验」区块 |
| 切换 Prompt 类别后总结 | ✅ 输出格式符合对应类别 |
| 点击导出按钮 | ✅ 下载 .md 文件 |
| 打开 options 页配置 API | ✅ 保存后立即生效 |

**Step 3: 在新闻、技术博客、电商三类页面各测试一次**

**Step 4: 最终 Commit**

```bash
git add .
git commit -m "feat: complete WebSummarizer Chrome extension v2.0"
```

---

## 注意事项

1. **Chrome Gemini**：`window.ai` API 只能在 content script 中调用，不能在 service worker 中使用。收到 `useLocalGemini: true` 标记时，由 `content.js` 直接调用本地模型。

2. **content script 模块加载顺序**：`manifest.json` 中 `js` 数组的顺序即执行顺序，`content-extractor.js` 等模块必须在 `content.js` 之前加载，因为 content script 环境不支持 `import`，通过 `window.*` 挂载全局变量来共享。

3. **chrome.storage.local 异步**：所有配置读取必须 `await`，不能像原脚本同步调用 `GM_getValue`。

4. **CSP 限制**：插件的 options/popup 页面有 Content Security Policy 限制，不能使用 `eval` 或内联脚本，所有 JS 必须在独立 `.js` 文件中。
