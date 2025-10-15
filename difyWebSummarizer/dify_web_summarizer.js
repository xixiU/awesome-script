// ==UserScript==
// @name         Dify网页智能总结
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  使用Dify工作流智能总结网页内容，支持各类知识型网站
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置区域 ====================
    const CONFIG = {
        // Dify API配置 - 需要用户自行配置
        difyApiUrl: GM_getValue('difyApiUrl', 'https://api.dify.ai/v1/workflows/run'), // 替换为你的Dify工作流API地址
        difyApiKey: GM_getValue('difyApiKey', ''), // 替换为你的Dify API Key

        // 按钮样式配置
        buttonPosition: {
            bottom: '80px',
            right: '20px'
        }
    };

    // ==================== 样式定义 ====================
    const styles = `
        #dify-summarizer-btn {
            position: fixed;
            bottom: ${CONFIG.buttonPosition.bottom};
            right: ${CONFIG.buttonPosition.right};
            z-index: 999999;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        
        #dify-summarizer-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }
        
        #dify-summarizer-btn:active {
            transform: translateY(0);
        }
        
        #dify-summarizer-btn.loading {
            background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
            cursor: wait;
        }
        
        #dify-result-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 800px;
            max-height: 80vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 1000000;
            display: none;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        
        #dify-result-panel.show {
            display: block;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translate(-50%, -45%);
            }
            to {
                opacity: 1;
                transform: translate(-50%, -50%);
            }
        }
        
        #dify-panel-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        #dify-panel-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }
        
        #dify-close-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 20px;
            line-height: 1;
            transition: background 0.2s;
        }
        
        #dify-close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        #dify-panel-content {
            padding: 24px;
            overflow-y: auto;
            max-height: calc(80vh - 80px);
            line-height: 1.8;
            color: #333;
        }
        
        #dify-panel-content h1, 
        #dify-panel-content h2, 
        #dify-panel-content h3 {
            margin-top: 20px;
            margin-bottom: 12px;
            color: #1f2937;
        }
        
        #dify-panel-content p {
            margin-bottom: 12px;
        }
        
        #dify-panel-content ul, 
        #dify-panel-content ol {
            margin-left: 24px;
            margin-bottom: 12px;
        }
        
        #dify-panel-content li {
            margin-bottom: 8px;
        }
        
        #dify-panel-content code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
        }
        
        #dify-panel-content pre {
            background: #f3f4f6;
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin-bottom: 12px;
        }
        
        .dify-loading-spinner {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 40px auto;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .dify-error-message {
            color: #dc2626;
            background: #fee2e2;
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid #dc2626;
        }
        
        #dify-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999999;
            display: none;
        }
        
        #dify-overlay.show {
            display: block;
        }
        
        #dify-settings-btn {
            position: fixed;
            bottom: 140px;
            right: 20px;
            z-index: 999999;
            width: 40px;
            height: 40px;
            background: #6b7280;
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
        }
        
        #dify-settings-btn:hover {
            background: #4b5563;
            transform: scale(1.1);
        }
    `;

    // ==================== 智能正文提取器 ====================
    class ContentExtractor {
        constructor() {
            // 常见的正文容器选择器
            this.contentSelectors = [
                'article',
                'main',
                '[role="main"]',
                '.article-content',
                '.post-content',
                '.entry-content',
                '.content',
                '.main-content',
                '.article-body',
                '.post-body',
                '#article',
                '#content',
                '.markdown-body',
                '.news-content',
                '.detail-content',
                '.rich-text',
                '.story-body',
                '.article-text'
            ];

            // 需要排除的元素选择器
            this.excludeSelectors = [
                'nav',
                'header',
                'footer',
                'aside',
                '.sidebar',
                '.navigation',
                '.nav',
                '.menu',
                '.ad',
                '.advertisement',
                '.promo',
                '.related',
                '.comments',
                '.comment',
                '.social-share',
                '.share',
                '.tags',
                '.breadcrumb',
                'script',
                'style',
                'iframe',
                'noscript'
            ];
        }

        // 主提取方法
        extract() {
            let content = '';

            // 策略1: 尝试使用常见选择器
            content = this.tryCommonSelectors();
            if (content && content.length > 200) {
                return this.cleanText(content);
            }

            // 策略2: 使用文本密度算法
            content = this.extractByTextDensity();
            if (content && content.length > 200) {
                return this.cleanText(content);
            }

            // 策略3: 回退到body内容
            content = this.extractFromBody();
            return this.cleanText(content);
        }

        // 尝试常见选择器
        tryCommonSelectors() {
            for (let selector of this.contentSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    let text = '';
                    elements.forEach(el => {
                        text += this.extractTextFromElement(el) + '\n\n';
                    });
                    if (text.trim().length > 200) {
                        console.log(`[Dify] 使用选择器提取: ${selector}`);
                        return text;
                    }
                }
            }
            return '';
        }

        // 基于文本密度的提取
        extractByTextDensity() {
            const body = document.body;
            const candidates = this.findContentCandidates(body);

            if (candidates.length === 0) return '';

            // 按分数排序
            candidates.sort((a, b) => b.score - a.score);

            console.log(`[Dify] 使用文本密度算法提取，候选元素: ${candidates.length}`);
            return this.extractTextFromElement(candidates[0].element);
        }

        // 查找内容候选元素
        findContentCandidates(root) {
            const candidates = [];
            const elements = root.querySelectorAll('div, section, article, main');

            elements.forEach(el => {
                // 跳过排除的元素
                if (this.shouldExclude(el)) return;

                const text = el.innerText || '';
                const textLength = text.length;

                if (textLength < 100) return; // 太短的忽略

                // 计算文本密度分数
                const linkLength = this.getLinkTextLength(el);
                const linkDensity = textLength > 0 ? linkLength / textLength : 1;

                // 计算标点符号密度（中文和英文）
                const punctuationCount = (text.match(/[。！？,.!?;；]/g) || []).length;
                const punctuationDensity = textLength > 0 ? punctuationCount / textLength : 0;

                // 计算段落数
                const paragraphs = el.querySelectorAll('p').length;

                // 综合评分
                let score = textLength;
                score *= (1 - linkDensity); // 链接密度低的加分
                score += punctuationDensity * 1000; // 标点密度适中的加分
                score += paragraphs * 100; // 段落多的加分

                candidates.push({ element: el, score: score, textLength: textLength });
            });

            return candidates;
        }

        // 检查是否应该排除
        shouldExclude(element) {
            for (let selector of this.excludeSelectors) {
                if (element.matches(selector)) return true;
                if (element.querySelector(selector) === element.parentElement) return true;
            }

            // 检查是否在排除元素内部
            let parent = element.parentElement;
            while (parent) {
                for (let selector of this.excludeSelectors) {
                    if (parent.matches(selector)) return true;
                }
                parent = parent.parentElement;
            }

            return false;
        }

        // 获取链接文本长度
        getLinkTextLength(element) {
            const links = element.querySelectorAll('a');
            let length = 0;
            links.forEach(link => {
                length += (link.innerText || '').length;
            });
            return length;
        }

        // 从元素提取文本
        extractTextFromElement(element) {
            const clone = element.cloneNode(true);

            // 移除排除的元素
            this.excludeSelectors.forEach(selector => {
                clone.querySelectorAll(selector).forEach(el => el.remove());
            });

            // 处理段落和换行
            clone.querySelectorAll('p, br, div, h1, h2, h3, h4, h5, h6, li').forEach(el => {
                if (el.tagName === 'BR') {
                    el.replaceWith('\n');
                } else {
                    const text = el.innerText || el.textContent || '';
                    if (text.trim()) {
                        el.insertAdjacentText('afterend', '\n');
                    }
                }
            });

            return clone.innerText || clone.textContent || '';
        }

        // 从body提取（最后的回退方案）
        extractFromBody() {
            console.log('[Dify] 使用body回退方案');
            return this.extractTextFromElement(document.body);
        }

        // 清理文本
        cleanText(text) {
            return text
                .replace(/\n{3,}/g, '\n\n')  // 多个换行替换为两个
                .replace(/[ \t]{2,}/g, ' ')   // 多个空格替换为一个
                .replace(/^\s+|\s+$/gm, '')   // 去除每行首尾空格
                .trim();
        }
    }

    // ==================== Dify API调用 ====================
    class DifyAPI {
        static async summarize(newsUrl, newsContent) {
            return new Promise((resolve, reject) => {
                if (!CONFIG.difyApiKey) {
                    reject(new Error('请先配置Dify API Key！点击设置按钮进行配置。'));
                    return;
                }

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: CONFIG.difyApiUrl,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${CONFIG.difyApiKey}`
                    },
                    data: JSON.stringify({
                        inputs: {
                            newsUrl: newsUrl,
                            newsContent: newsContent
                        },
                        response_mode: 'blocking',
                        user: 'tampermonkey-user'
                    }),
                    timeout: 60000,
                    onload: function (response) {
                        try {
                            if (response.status === 200) {
                                const data = JSON.parse(response.responseText);
                                // Dify工作流返回的数据结构可能是 data.data.outputs.text 或其他
                                // 这里需要根据实际的Dify响应结构调整
                                const result = data.data?.outputs?.text || data.data?.outputs?.result || data.answer || JSON.stringify(data, null, 2);
                                resolve(result);
                            } else {
                                reject(new Error(`API请求失败: ${response.status} ${response.statusText}\n${response.responseText}`));
                            }
                        } catch (e) {
                            reject(new Error(`解析响应失败: ${e.message}\n${response.responseText}`));
                        }
                    },
                    onerror: function (error) {
                        reject(new Error(`网络请求失败: ${error.message || '未知错误'}`));
                    },
                    ontimeout: function () {
                        reject(new Error('请求超时，请稍后重试'));
                    }
                });
            });
        }
    }

    // ==================== UI管理 ====================
    class UIManager {
        constructor() {
            this.init();
        }

        init() {
            // 添加样式
            const styleEl = document.createElement('style');
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);

            // 创建按钮
            this.createButton();

            // 创建设置按钮
            this.createSettingsButton();

            // 创建结果面板
            this.createResultPanel();

            // 创建遮罩层
            this.createOverlay();
        }

        createButton() {
            const btn = document.createElement('button');
            btn.id = 'dify-summarizer-btn';
            btn.textContent = '📝 AI总结';
            btn.addEventListener('click', () => this.handleSummarize());
            document.body.appendChild(btn);
            this.button = btn;
        }

        createSettingsButton() {
            const btn = document.createElement('button');
            btn.id = 'dify-settings-btn';
            btn.textContent = '⚙️';
            btn.title = '配置Dify API';
            btn.addEventListener('click', () => this.showSettings());
            document.body.appendChild(btn);
        }

        createResultPanel() {
            const panel = document.createElement('div');
            panel.id = 'dify-result-panel';
            panel.innerHTML = `
                <div id="dify-panel-header">
                    <h3>📝 AI总结结果</h3>
                    <button id="dify-close-btn">×</button>
                </div>
                <div id="dify-panel-content"></div>
            `;
            document.body.appendChild(panel);
            this.panel = panel;

            // 关闭按钮事件
            panel.querySelector('#dify-close-btn').addEventListener('click', () => this.hidePanel());
        }

        createOverlay() {
            const overlay = document.createElement('div');
            overlay.id = 'dify-overlay';
            overlay.addEventListener('click', () => this.hidePanel());
            document.body.appendChild(overlay);
            this.overlay = overlay;
        }

        async handleSummarize() {
            // 防止重复点击
            if (this.button.classList.contains('loading')) return;

            try {
                // 显示加载状态
                this.button.classList.add('loading');
                this.button.textContent = '⏳ 处理中...';

                // 显示面板并展示加载动画
                this.showPanel('<div class="dify-loading-spinner"></div>');

                // 提取网页内容
                const extractor = new ContentExtractor();
                const newsContent = extractor.extract();
                const newsUrl = window.location.href;

                console.log('[Dify] 提取的内容长度:', newsContent.length);
                console.log('[Dify] 内容预览:', newsContent.substring(0, 500));

                if (!newsContent || newsContent.length < 50) {
                    throw new Error('未能提取到有效的网页内容，请刷新页面后重试');
                }

                // 调用Dify API
                const result = await DifyAPI.summarize(newsUrl, newsContent);

                // 显示结果
                this.showPanel(this.formatResult(result));

            } catch (error) {
                console.error('[Dify] 错误:', error);
                this.showPanel(`
                    <div class="dify-error-message">
                        <h4 style="margin-top: 0;">❌ 处理失败</h4>
                        <p>${error.message}</p>
                    </div>
                `);
            } finally {
                // 恢复按钮状态
                this.button.classList.remove('loading');
                this.button.textContent = '📝 AI总结';
            }
        }

        showPanel(content) {
            const contentDiv = this.panel.querySelector('#dify-panel-content');
            contentDiv.innerHTML = content;
            this.panel.classList.add('show');
            this.overlay.classList.add('show');
        }

        hidePanel() {
            this.panel.classList.remove('show');
            this.overlay.classList.remove('show');
        }

        formatResult(result) {
            // 将markdown转换为HTML（简单处理）
            let html = result
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/#{3}\s(.+)/g, '<h3>$1</h3>')
                .replace(/#{2}\s(.+)/g, '<h2>$1</h2>')
                .replace(/#{1}\s(.+)/g, '<h1>$1</h1>')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>');

            return `<p>${html}</p>`;
        }

        showSettings() {
            const currentApiUrl = CONFIG.difyApiUrl;
            const currentApiKey = CONFIG.difyApiKey;

            const apiUrl = prompt('请输入Dify工作流API地址:', currentApiUrl);
            if (apiUrl !== null && apiUrl.trim()) {
                CONFIG.difyApiUrl = apiUrl.trim();
                GM_setValue('difyApiUrl', apiUrl.trim());
            }

            const apiKey = prompt('请输入Dify API Key:', currentApiKey);
            if (apiKey !== null && apiKey.trim()) {
                CONFIG.difyApiKey = apiKey.trim();
                GM_setValue('difyApiKey', apiKey.trim());
            }

            if ((apiUrl !== null && apiUrl.trim()) || (apiKey !== null && apiKey.trim())) {
                alert('配置已保存！');
            }
        }
    }

    // ==================== 初始化 ====================
    function init() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                new UIManager();
            });
        } else {
            new UIManager();
        }
    }

    // 启动脚本
    init();

    console.log('[Dify Web Summarizer] 脚本已加载');
})();
