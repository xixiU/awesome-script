// ==UserScript==
// @name         Dify网页智能总结
// @namespace    http://tampermonkey.net/
// @version      1.4.2
// @description  使用Dify工作流智能总结网页内容，支持各类知识型网站
// @author       xixiu
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// @downloadURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/difyWebSummarizer/dify_web_summarizer.js
// @updateURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/difyWebSummarizer/dify_web_summarizer.js
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
            bottom: 80px;
            right: 0px;
            z-index: 999999;
            padding: 12px 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-top-left-radius: 25px;
            border-bottom-left-radius: 25px;
            border-top-right-radius: 0;
            border-bottom-right-radius: 0;
            cursor: move;
            font-size: 20px;
            font-weight: bold;
            box-shadow: -2px 2px 10px rgba(0, 0, 0, 0.2);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            user-select: none;
            touch-action: none;
            width: 48px;
            overflow: hidden;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        #dify-summarizer-btn .btn-icon {
            flex-shrink: 0;
            display: inline-block;
            width: 20px;
            text-align: center;
        }

        #dify-summarizer-btn .btn-text {
            font-size: 14px;
            opacity: 0;
            transform: translateX(-10px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* 贴边模式：悬停时展开 */
        #dify-summarizer-btn.edge-mode:hover {
            width: 140px;
            padding: 12px 20px;
            right: 0px;
            box-shadow: -4px 4px 20px rgba(0, 0, 0, 0.3);
        }

        #dify-summarizer-btn.edge-mode:hover .btn-text {
            opacity: 1;
            transform: translateX(0);
        }

        /* 自由模式：始终展开，圆角按钮 */
        #dify-summarizer-btn.free-mode {
            width: 140px;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }

        #dify-summarizer-btn.free-mode .btn-text {
            opacity: 1;
            transform: translateX(0);
        }

        #dify-summarizer-btn.free-mode:hover {
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }

        #dify-summarizer-btn.dragging {
            cursor: grabbing;
            opacity: 0.8;
            transition: none;
            width: 140px;
            padding: 12px 20px;
        }

        #dify-summarizer-btn.dragging .btn-text {
            opacity: 1;
            transform: translateX(0);
        }

        #dify-summarizer-btn.loading {
            background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
            cursor: wait;
            width: 140px;
            padding: 12px 20px;
        }

        #dify-summarizer-btn.loading .btn-text {
            opacity: 1;
            transform: translateX(0);
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

        #dify-panel-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        #dify-copy-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        #dify-copy-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-1px);
        }

        #dify-copy-btn.copied {
            background: rgba(16, 185, 129, 0.9);
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

        #dify-settings-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 500px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 1000001;
            display: none;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        #dify-settings-panel.show {
            display: block;
            animation: slideIn 0.3s ease;
        }

        #dify-settings-header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #dify-settings-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }

        #dify-settings-close-btn {
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

        #dify-settings-close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        #dify-settings-content {
            padding: 24px;
        }

        .dify-form-group {
            margin-bottom: 20px;
        }

        .dify-form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #374151;
            font-size: 14px;
        }

        .dify-form-group input {
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.2s;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        .dify-form-group input:focus {
            outline: none;
            border-color: #10b981;
        }

        .dify-form-group input::placeholder {
            color: #9ca3af;
        }

        .dify-form-help {
            margin-top: 6px;
            font-size: 12px;
            color: #6b7280;
            line-height: 1.5;
        }

        .dify-form-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }

        .dify-btn {
            flex: 1;
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        .dify-btn-primary {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
        }

        .dify-btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .dify-btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }

        .dify-btn-secondary:hover {
            background: #e5e7eb;
        }

        .dify-success-message {
            background: #d1fae5;
            color: #065f46;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 14px;
            display: none;
            border-left: 4px solid #10b981;
        }

        .dify-success-message.show {
            display: block;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .dify-config-status {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            margin-left: 8px;
        }

        .dify-config-status.configured {
            background: #d1fae5;
            color: #065f46;
        }

        .dify-config-status.not-configured {
            background: #fee2e2;
            color: #991b1b;
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
                '.articalContent',  // 常见拼写错误
                '.articleContent',
                '.post-content',
                '.entry-content',
                '.content',
                '.main-content',
                '.article-body',
                '.post-body',
                '.entry-body',
                '#article',
                '#content',
                '.markdown-body',
                '.news-content',
                '.newsContent',
                '.detail-content',
                '.detailContent',
                '.rich-text',
                '.story-body',
                '.article-text',
                '.text-content',
                '.textContent',
                '[class*="article-content"]',
                '[class*="post-content"]',
                '[class*="entry-content"]',
                '[class*="main-content"]'
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
            if (content && content.length > 100) {
                return this.cleanText(content);
            }

            // 策略2: 使用文本密度算法
            content = this.extractByTextDensity();
            if (content && content.length > 100) {
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
                    if (text.trim().length > 100) {
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

                if (textLength < 50) return; // 太短的忽略

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

            // 创建结果面板
            this.createResultPanel();

            // 创建设置面板
            this.createSettingsPanel();

            // 创建遮罩层
            this.createOverlay();
        }

        createButton() {
            const btn = document.createElement('button');
            btn.id = 'dify-summarizer-btn';
            btn.innerHTML = '<span class="btn-icon">📝</span><span class="btn-text">AI总结</span>';
            btn.classList.add('edge-mode'); // 默认贴边模式
            document.body.appendChild(btn);
            this.button = btn;

            // 加载保存的位置
            this.loadButtonPosition();

            // 添加拖拽功能
            this.makeDraggable(btn);

            // 添加点击事件（需要区分点击和拖拽）
            let isDragging = false;
            let dragStartTime = 0;

            btn.addEventListener('mousedown', () => {
                isDragging = false;
                dragStartTime = Date.now();
            });

            btn.addEventListener('mouseup', (e) => {
                const dragDuration = Date.now() - dragStartTime;
                // 如果移动时间很短且没有标记为拖拽，则视为点击
                if (!isDragging && dragDuration < 200) {
                    this.handleSummarize();
                }
            });
        }

        loadButtonPosition() {
            const savedPos = GM_getValue('buttonPosition', null);
            if (savedPos) {
                const pos = JSON.parse(savedPos);

                if (pos.mode === 'edge') {
                    // 贴边模式
                    this.button.classList.remove('free-mode');
                    this.button.classList.add('edge-mode');
                    this.button.style.left = 'auto';
                    this.button.style.top = pos.top || 'auto';
                    this.button.style.right = '0px';
                    this.button.style.bottom = pos.bottom || '80px';
                } else if (pos.mode === 'free') {
                    // 自由模式
                    this.button.classList.remove('edge-mode');
                    this.button.classList.add('free-mode');
                    this.button.style.left = pos.left;
                    this.button.style.top = pos.top;
                    this.button.style.right = 'auto';
                    this.button.style.bottom = 'auto';
                }
            }
        }

        saveButtonPosition(mode = 'edge') {
            const pos = {
                mode: mode,
                left: this.button.style.left,
                top: this.button.style.top,
                bottom: this.button.style.bottom
            };
            GM_setValue('buttonPosition', JSON.stringify(pos));
        }

        makeDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            let isDragging = false;
            const self = this; // 保存 this 引用

            element.addEventListener('mousedown', dragMouseDown);

            function dragMouseDown(e) {
                // 如果正在加载，不允许拖拽
                if (element.classList.contains('loading')) return;

                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;

                document.addEventListener('mouseup', closeDragElement);
                document.addEventListener('mousemove', elementDrag);
            }

            const elementDrag = (e) => {
                e.preventDefault();

                // 计算移动距离
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                // 如果移动距离超过5px，标记为拖拽
                if (Math.abs(pos1) > 5 || Math.abs(pos2) > 5) {
                    isDragging = true;
                    element.classList.add('dragging');
                }

                // 设置新位置
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;

                // 边界检查
                const maxX = window.innerWidth - element.offsetWidth;
                const maxY = window.innerHeight - element.offsetHeight;

                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));

                element.style.top = newTop + 'px';
                element.style.left = newLeft + 'px';
                element.style.right = 'auto';
                element.style.bottom = 'auto';
            };

            const closeDragElement = () => {
                document.removeEventListener('mouseup', closeDragElement);
                document.removeEventListener('mousemove', elementDrag);

                if (isDragging) {
                    // 计算按钮右边缘到窗口右边缘的距离
                    const distanceToRight = window.innerWidth - (element.offsetLeft + element.offsetWidth);

                    // 如果距离右边缘小于 100px，自动吸附到右边（贴边模式）
                    if (distanceToRight < 100) {
                        element.classList.remove('free-mode');
                        element.classList.add('edge-mode');
                        element.style.left = 'auto';
                        element.style.right = '0px';
                        element.style.bottom = (window.innerHeight - element.offsetTop - element.offsetHeight) + 'px';
                        self.saveButtonPosition('edge');
                    } else {
                        // 自由模式：按钮保持在拖动的位置，始终展开
                        element.classList.remove('edge-mode');
                        element.classList.add('free-mode');
                        self.saveButtonPosition('free');
                    }

                    // 延迟移除拖拽状态，避免触发点击
                    setTimeout(() => {
                        element.classList.remove('dragging');
                        isDragging = false;
                    }, 100);
                }
            };
        }

        createResultPanel() {
            const panel = document.createElement('div');
            panel.id = 'dify-result-panel';
            panel.innerHTML = `
                <div id="dify-panel-header">
                    <h3>📝 AI总结结果</h3>
                    <div id="dify-panel-actions">
                        <button id="dify-copy-btn">
                            <span class="copy-icon">📋</span>
                            <span class="copy-text">复制结果</span>
                        </button>
                        <button id="dify-close-btn">×</button>
                    </div>
                </div>
                <div id="dify-panel-content"></div>
            `;
            document.body.appendChild(panel);
            this.panel = panel;

            // 关闭按钮事件
            panel.querySelector('#dify-close-btn').addEventListener('click', () => this.hidePanel());

            // 复制按钮事件
            panel.querySelector('#dify-copy-btn').addEventListener('click', () => this.copyResult());
        }

        createSettingsPanel() {
            const panel = document.createElement('div');
            panel.id = 'dify-settings-panel';
            panel.innerHTML = `
                <div id="dify-settings-header">
                    <h3>⚙️ Dify API 配置</h3>
                    <button id="dify-settings-close-btn">×</button>
                </div>
                <div id="dify-settings-content">
                    <div class="dify-success-message" id="dify-save-success">
                        ✓ 配置已成功保存！
                    </div>
                    
                    <div class="dify-form-group">
                        <label for="dify-api-url">
                            Dify 工作流 API 地址
                            <span class="dify-config-status" id="dify-url-status"></span>
                        </label>
                        <input 
                            type="text" 
                            id="dify-api-url" 
                            placeholder="https://api.dify.ai/v1/workflows/run"
                            autocomplete="off"
                        />
                        <div class="dify-form-help">
                            在 Dify 平台的工作流设置中获取 API 端点地址
                        </div>
                    </div>
                    
                    <div class="dify-form-group">
                        <label for="dify-api-key">
                            Dify API Key
                            <span class="dify-config-status" id="dify-key-status"></span>
                        </label>
                        <input 
                            type="password" 
                            id="dify-api-key" 
                            placeholder="app-xxxxxxxxxxxxxxxx"
                            autocomplete="off"
                        />
                        <div class="dify-form-help">
                            在 Dify 平台的工作流 API 访问页面获取密钥（以 app- 开头）
                        </div>
                    </div>
                    
                    <div class="dify-form-actions">
                        <button class="dify-btn dify-btn-secondary" id="dify-cancel-btn">取消</button>
                        <button class="dify-btn dify-btn-primary" id="dify-save-btn">保存配置</button>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
            this.settingsPanel = panel;

            // 绑定事件
            panel.querySelector('#dify-settings-close-btn').addEventListener('click', () => this.hideSettingsPanel());
            panel.querySelector('#dify-cancel-btn').addEventListener('click', () => this.hideSettingsPanel());
            panel.querySelector('#dify-save-btn').addEventListener('click', () => this.saveSettings());

            // 按 Enter 键保存
            panel.querySelector('#dify-api-url').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveSettings();
            });
            panel.querySelector('#dify-api-key').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveSettings();
            });
        }

        createOverlay() {
            const overlay = document.createElement('div');
            overlay.id = 'dify-overlay';
            overlay.addEventListener('click', () => {
                this.hidePanel();
                this.hideSettingsPanel();
            });
            document.body.appendChild(overlay);
            this.overlay = overlay;
        }

        async handleSummarize() {
            // 防止重复点击
            if (this.button.classList.contains('loading')) return;

            try {
                // 显示加载状态
                this.button.classList.add('loading');
                this.button.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">处理中...</span>';

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

                // 保存原始结果文本（用于复制）
                this.currentResult = result;

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
                this.button.innerHTML = '<span class="btn-icon">📝</span><span class="btn-text">AI总结</span>';
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

        copyResult() {
            // 如果没有结果，直接返回
            if (!this.currentResult) {
                console.warn('[Dify] 没有可复制的内容');
                return;
            }

            const copyBtn = this.panel.querySelector('#dify-copy-btn');
            const copyText = copyBtn.querySelector('.copy-text');
            const copyIcon = copyBtn.querySelector('.copy-icon');

            try {
                // 创建临时文本区域
                const textarea = document.createElement('textarea');
                textarea.value = this.currentResult;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '0';
                document.body.appendChild(textarea);

                // 选择并复制文本
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
                const successful = document.execCommand('copy');

                // 移除临时元素
                document.body.removeChild(textarea);

                if (successful) {
                    // 显示复制成功状态
                    copyBtn.classList.add('copied');
                    copyIcon.textContent = '✓';
                    copyText.textContent = '已复制';

                    console.log('[Dify] 复制成功，内容长度:', this.currentResult.length);

                    // 2秒后恢复按钮状态
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyIcon.textContent = '📋';
                        copyText.textContent = '复制结果';
                    }, 2000);
                } else {
                    throw new Error('复制命令执行失败');
                }
            } catch (error) {
                console.error('[Dify] 复制失败:', error);

                // 尝试使用现代 Clipboard API
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(this.currentResult)
                        .then(() => {
                            copyBtn.classList.add('copied');
                            copyIcon.textContent = '✓';
                            copyText.textContent = '已复制';

                            setTimeout(() => {
                                copyBtn.classList.remove('copied');
                                copyIcon.textContent = '📋';
                                copyText.textContent = '复制结果';
                            }, 2000);
                        })
                        .catch(err => {
                            console.error('[Dify] Clipboard API 失败:', err);
                            copyText.textContent = '复制失败';
                            setTimeout(() => {
                                copyText.textContent = '复制结果';
                            }, 2000);
                        });
                } else {
                    copyText.textContent = '复制失败';
                    setTimeout(() => {
                        copyText.textContent = '复制结果';
                    }, 2000);
                }
            }
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
            // 填充当前配置值
            const urlInput = this.settingsPanel.querySelector('#dify-api-url');
            const keyInput = this.settingsPanel.querySelector('#dify-api-key');

            urlInput.value = CONFIG.difyApiUrl;
            keyInput.value = CONFIG.difyApiKey;

            // 隐藏成功消息
            this.settingsPanel.querySelector('#dify-save-success').classList.remove('show');

            // 更新配置状态标识
            this.updateConfigStatus();

            // 显示面板
            this.settingsPanel.classList.add('show');
            this.overlay.classList.add('show');

            // 聚焦到第一个输入框
            setTimeout(() => urlInput.focus(), 100);
        }

        hideSettingsPanel() {
            this.settingsPanel.classList.remove('show');
            this.overlay.classList.remove('show');
        }

        saveSettings() {
            const urlInput = this.settingsPanel.querySelector('#dify-api-url');
            const keyInput = this.settingsPanel.querySelector('#dify-api-key');
            const successMsg = this.settingsPanel.querySelector('#dify-save-success');

            const apiUrl = urlInput.value.trim();
            const apiKey = keyInput.value.trim();

            // 基本验证
            if (!apiUrl) {
                urlInput.focus();
                urlInput.style.borderColor = '#ef4444';
                setTimeout(() => {
                    urlInput.style.borderColor = '';
                }, 2000);
                return;
            }

            if (!apiKey) {
                keyInput.focus();
                keyInput.style.borderColor = '#ef4444';
                setTimeout(() => {
                    keyInput.style.borderColor = '';
                }, 2000);
                return;
            }

            // 验证 URL 格式
            try {
                new URL(apiUrl);
            } catch (e) {
                urlInput.focus();
                urlInput.style.borderColor = '#ef4444';
                alert('请输入有效的 API 地址（必须以 http:// 或 https:// 开头）');
                setTimeout(() => {
                    urlInput.style.borderColor = '';
                }, 2000);
                return;
            }

            // 保存配置
            CONFIG.difyApiUrl = apiUrl;
            CONFIG.difyApiKey = apiKey;
            GM_setValue('difyApiUrl', apiUrl);
            GM_setValue('difyApiKey', apiKey);

            // 更新状态标识
            this.updateConfigStatus();

            // 显示成功消息
            successMsg.classList.add('show');

            // 3秒后自动关闭面板
            setTimeout(() => {
                this.hideSettingsPanel();
                successMsg.classList.remove('show');
            }, 2000);

            console.log('[Dify] 配置已保存');
        }

        updateConfigStatus() {
            const urlStatus = this.settingsPanel.querySelector('#dify-url-status');
            const keyStatus = this.settingsPanel.querySelector('#dify-key-status');

            // 更新 URL 状态
            if (CONFIG.difyApiUrl && CONFIG.difyApiUrl !== 'https://api.dify.ai/v1/workflows/run') {
                urlStatus.textContent = '已配置';
                urlStatus.className = 'dify-config-status configured';
            } else {
                urlStatus.textContent = '未配置';
                urlStatus.className = 'dify-config-status not-configured';
            }

            // 更新 Key 状态
            if (CONFIG.difyApiKey) {
                keyStatus.textContent = '已配置';
                keyStatus.className = 'dify-config-status configured';
            } else {
                keyStatus.textContent = '未配置';
                keyStatus.className = 'dify-config-status not-configured';
            }
        }
    }

    // ==================== 初始化 ====================
    let uiManager = null;

    function init() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                uiManager = new UIManager();
                registerMenuCommands();
            });
        } else {
            uiManager = new UIManager();
            registerMenuCommands();
        }
    }

    // 注册油猴菜单命令
    function registerMenuCommands() {
        GM_registerMenuCommand('⚙️ 打开设置', () => {
            if (uiManager) {
                uiManager.showSettings();
            }
        });

        GM_registerMenuCommand('📍 重置按钮位置', () => {
            if (uiManager && uiManager.button) {
                // 重置到默认位置（贴边模式）
                uiManager.button.classList.remove('free-mode');
                uiManager.button.classList.add('edge-mode');
                uiManager.button.style.left = 'auto';
                uiManager.button.style.top = 'auto';
                uiManager.button.style.right = '0px';
                uiManager.button.style.bottom = '80px';
                GM_setValue('buttonPosition', null);
                console.log('[Dify] 按钮位置已重置为贴边模式');
            }
        });
    }

    // 启动脚本
    init();

    console.log('[Dify Web Summarizer] 脚本已加载');
})();
