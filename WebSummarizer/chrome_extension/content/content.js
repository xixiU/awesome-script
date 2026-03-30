(function () {
    'use strict';

    // 防止重复注入
    if (document.getElementById('dify-summarizer-btn')) return;
    if (window !== window.top) return;

    // ==================== UIManager ====================
    class UIManager {
        constructor() {
            this.button = null;
            this.panel = null;
            this.panelHeader = null;
            this.overlay = null;
            this.fullscreenBtn = null;
            this.isFullscreen = false;
            this.currentResult = '';
            this.currentSummaryMode = 'full';
            this.currentMetadata = null;
            this.currentContent = '';
            this.settings = {};

            this._loadSettings().then(() => this._init());
        }

        async _loadSettings() {
            return new Promise(resolve => {
                chrome.storage.local.get([
                    'enableMetadata', 'enableExport', 'enableFactCheck',
                    'buttonPosition'
                ], (result) => {
                    this.settings = {
                        enableMetadata: result.enableMetadata !== false,
                        enableExport: result.enableExport !== false,
                        enableFactCheck: !!result.enableFactCheck,
                        buttonPosition: result.buttonPosition || null
                    };
                    resolve();
                });
            });
        }

        _init() {
            this._createButton();
            this._createResultPanel();
            this._createOverlay();
            this._initFullscreenDetection();
            this._listenMessages();
        }

        _createButton() {
            const btn = document.createElement('button');
            btn.id = 'dify-summarizer-btn';
            btn.classList.add('edge-mode');
            btn.title = '点击总结全文，或选中文本后点击总结选中部分';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'btn-icon';
            iconSpan.textContent = '📝';

            const textSpan = document.createElement('span');
            textSpan.className = 'btn-text';
            textSpan.textContent = 'AI总结';

            btn.appendChild(iconSpan);
            btn.appendChild(textSpan);
            document.body.appendChild(btn);

            this.button = btn;
            this._setupSelectionListener();
            this._loadButtonPosition();
            this._makeDraggable(btn);

            let isDragging = false;
            let dragStartTime = 0;

            btn.addEventListener('mousedown', () => {
                isDragging = false;
                dragStartTime = Date.now();
            });

            btn.addEventListener('mouseup', () => {
                const dragDuration = Date.now() - dragStartTime;
                if (!isDragging && dragDuration < 200) {
                    this.handleSummarize();
                }
            });
        }

        _setupSelectionListener() {
            let selectionTimeout;
            const updateButtonText = () => {
                clearTimeout(selectionTimeout);
                selectionTimeout = setTimeout(() => {
                    if (this.button.classList.contains('loading') || this.button.classList.contains('hidden')) return;

                    const selection = window.getSelection();
                    const selectedText = selection ? selection.toString().trim() : '';
                    const iconSpan = this.button.querySelector('.btn-icon');
                    const textSpan = this.button.querySelector('.btn-text');

                    if (selectedText && selectedText.length >= 50) {
                        if (iconSpan) iconSpan.textContent = '✂️';
                        if (textSpan) textSpan.textContent = '总结选中';
                        this.button.title = `总结选中的文本（${selectedText.length} 字符）`;
                    } else {
                        if (iconSpan) iconSpan.textContent = '📝';
                        if (textSpan) textSpan.textContent = 'AI总结';
                        this.button.title = '点击总结全文，或选中文本后点击总结选中部分';
                    }
                }, 100);
            };

            document.addEventListener('selectionchange', updateButtonText);
            document.addEventListener('mouseup', updateButtonText);
        }

        _loadButtonPosition() {
            const savedPos = this.settings.buttonPosition;
            if (!savedPos) return;

            const pos = typeof savedPos === 'string' ? JSON.parse(savedPos) : savedPos;
            this.button.classList.remove('free-mode');
            this.button.classList.add('edge-mode');

            if (pos.side === 'left') {
                this.button.style.left = '0px';
                this.button.style.right = 'auto';
                this.button.style.borderTopLeftRadius = '0';
                this.button.style.borderBottomLeftRadius = '0';
                this.button.style.borderTopRightRadius = '25px';
                this.button.style.borderBottomRightRadius = '25px';
            } else {
                this.button.style.left = 'auto';
                this.button.style.right = '0px';
                this.button.style.borderTopLeftRadius = '25px';
                this.button.style.borderBottomLeftRadius = '25px';
                this.button.style.borderTopRightRadius = '0';
                this.button.style.borderBottomRightRadius = '0';
            }

            this.button.style.top = pos.top || 'auto';
            this.button.style.bottom = pos.bottom || '80px';
        }

        _saveButtonPosition(side = 'right') {
            const pos = {
                side,
                top: this.button.style.top,
                bottom: this.button.style.bottom
            };
            chrome.storage.local.set({ buttonPosition: pos });
        }

        _makeDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            let isDragging = false;
            const self = this;

            element.addEventListener('mousedown', dragMouseDown);

            function dragMouseDown(e) {
                if (element.classList.contains('loading')) return;
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.addEventListener('mouseup', closeDragElement);
                document.addEventListener('mousemove', elementDrag);
            }

            const elementDrag = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                if (Math.abs(pos1) > 5 || Math.abs(pos2) > 5) {
                    isDragging = true;
                    element.classList.add('dragging');
                }

                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;
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
                    const buttonCenterX = element.offsetLeft + element.offsetWidth / 2;
                    const windowCenterX = window.innerWidth / 2;

                    if (buttonCenterX < windowCenterX) {
                        element.classList.remove('free-mode');
                        element.classList.add('edge-mode');
                        element.style.left = '0px';
                        element.style.right = 'auto';
                        element.style.bottom = (window.innerHeight - element.offsetTop - element.offsetHeight) + 'px';
                        element.style.borderTopLeftRadius = '0';
                        element.style.borderBottomLeftRadius = '0';
                        element.style.borderTopRightRadius = '25px';
                        element.style.borderBottomRightRadius = '25px';
                        self._saveButtonPosition('left');
                    } else {
                        element.classList.remove('free-mode');
                        element.classList.add('edge-mode');
                        element.style.left = 'auto';
                        element.style.right = '0px';
                        element.style.bottom = (window.innerHeight - element.offsetTop - element.offsetHeight) + 'px';
                        element.style.borderTopLeftRadius = '25px';
                        element.style.borderBottomLeftRadius = '25px';
                        element.style.borderTopRightRadius = '0';
                        element.style.borderBottomRightRadius = '0';
                        self._saveButtonPosition('right');
                    }

                    setTimeout(() => {
                        element.classList.remove('dragging');
                        isDragging = false;
                    }, 100);
                }
            };
        }

        _createResultPanel() {
            const panel = document.createElement('div');
            panel.id = 'dify-result-panel';

            const header = document.createElement('div');
            header.id = 'dify-panel-header';

            const title = document.createElement('h3');
            title.id = 'dify-panel-title';
            title.textContent = '📝 AI总结结果';

            const actionsDiv = document.createElement('div');
            actionsDiv.id = 'dify-panel-actions';

            // 复制按钮
            const copyBtn = document.createElement('button');
            copyBtn.id = 'dify-copy-btn';
            const copyIcon = document.createElement('span');
            copyIcon.className = 'copy-icon';
            copyIcon.textContent = '📋';
            const copyText = document.createElement('span');
            copyText.className = 'copy-text';
            copyText.textContent = '复制结果';
            copyBtn.appendChild(copyIcon);
            copyBtn.appendChild(copyText);

            // 导出按钮（根据开关控制）
            if (this.settings.enableExport) {
                const exportBtn = document.createElement('button');
                exportBtn.id = 'dify-export-btn';
                exportBtn.textContent = '⬇️ 导出';
                exportBtn.title = '导出为 Markdown 文件';
                exportBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.ExportManager) {
                        new window.ExportManager().exportMarkdown({
                            url: window.location.href,
                            metadata: this.currentMetadata,
                            content: this.currentContent,
                            summary: this.currentResult
                        });
                    }
                });
                actionsDiv.appendChild(exportBtn);
            }

            // 全屏按钮
            const fullscreenBtn = document.createElement('button');
            fullscreenBtn.id = 'dify-fullscreen-btn';
            fullscreenBtn.textContent = '⤢';
            fullscreenBtn.title = '全屏显示';

            // 关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.id = 'dify-close-btn';
            closeBtn.textContent = '×';

            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(fullscreenBtn);
            actionsDiv.appendChild(closeBtn);
            header.appendChild(title);
            header.appendChild(actionsDiv);

            const content = document.createElement('div');
            content.id = 'dify-panel-content';

            panel.appendChild(header);
            panel.appendChild(content);
            document.body.appendChild(panel);

            this.panel = panel;
            this.panelHeader = header;
            this.fullscreenBtn = fullscreenBtn;

            closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this._hidePanel(); });
            copyBtn.addEventListener('click', (e) => { e.stopPropagation(); this._copyResult(); });
            fullscreenBtn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleFullscreen(); });

            this._makePanelDraggable();
        }

        _createOverlay() {
            const overlay = document.createElement('div');
            overlay.id = 'dify-overlay';
            overlay.addEventListener('click', () => this._hidePanel());
            document.body.appendChild(overlay);
            this.overlay = overlay;
        }

        // ==================== 总结主流程 ====================
        async handleSummarize(selectedText = '') {
            if (this.button.classList.contains('loading')) return;

            try {
                this.button.classList.add('loading');
                const iconSpan = this.button.querySelector('.btn-icon');
                const textSpan = this.button.querySelector('.btn-text');
                if (iconSpan) iconSpan.textContent = '⏳';
                if (textSpan) textSpan.textContent = '处理中...';

                this._showLoadingPanel();

                // 确定文本内容
                const selection = window.getSelection();
                const selText = selectedText || (selection ? selection.toString().trim() : '');
                let content = '';
                let isSelectionMode = false;

                if (selText && selText.length >= 50) {
                    content = selText;
                    isSelectionMode = true;
                } else {
                    const extractor = new window.ContentExtractor();
                    content = extractor.extract();
                }

                if (!content || content.length < 50) {
                    throw new Error('未能提取到有效的内容，请刷新页面后重试');
                }

                this.currentContent = content;
                this.currentSummaryMode = isSelectionMode ? 'selection' : 'full';

                // 读取最新设置（可能在本次加载后被用户修改）
                await this._loadSettings();

                // 提取元数据（可选）
                let metadataStr = '';
                this.currentMetadata = null;
                if (this.settings.enableMetadata && window.MetadataExtractor) {
                    const metaExtractor = new window.MetadataExtractor();
                    this.currentMetadata = metaExtractor.extract();
                    metadataStr = metaExtractor.formatForAI(this.currentMetadata);
                }

                // 组装 Prompt
                const promptMgr = new window.PromptManager();
                const prompt = await promptMgr.buildPrompt(
                    window.location.href,
                    content,
                    metadataStr,
                    { factCheck: this.settings.enableFactCheck }
                );

                // 发送给 service worker
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(
                        { type: 'SUMMARIZE', payload: { prompt } },
                        (resp) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else if (resp && resp.error) {
                                reject(new Error(resp.error));
                            } else {
                                resolve(resp);
                            }
                        }
                    );
                });

                let result = '';

                // Chrome Gemini 需要在 content script 中本地调用
                if (response.useLocalGemini) {
                    result = await this._callLocalGemini(response.prompt);
                } else {
                    result = response.result || '';
                }

                this.currentResult = result;
                this._showResultPanel(result);

            } catch (error) {
                console.error('[WebSummarizer] 错误:', error);
                this._showErrorPanel(error.message);
            } finally {
                this.button.classList.remove('loading');
                if (this.currentSummaryMode === 'selection') {
                    window.getSelection().removeAllRanges();
                }
                const iconSpan = this.button.querySelector('.btn-icon');
                const textSpan = this.button.querySelector('.btn-text');
                if (iconSpan) iconSpan.textContent = '📝';
                if (textSpan) textSpan.textContent = 'AI总结';
                this.button.title = '点击总结全文，或选中文本后点击总结选中部分';
            }
        }

        async _callLocalGemini(prompt) {
            if (typeof LanguageModel === 'undefined' || !LanguageModel.availability) {
                throw new Error('您的浏览器不支持 Prompt API（LanguageModel）。\n请确保 Chrome 版本 >= 138 并已下载 Gemini Nano 模型。');
            }
            const availability = await LanguageModel.availability();
            if (availability === 'unavailable') {
                throw new Error('Gemini Nano 模型不可用。请在 chrome://components 中检查并下载 Optimization Guide On Device Model。');
            }
            const session = await LanguageModel.create();
            const result = await session.prompt(prompt);
            if (session.destroy) session.destroy();
            return result;
        }

        // ==================== 面板 UI ====================
        _showLoadingPanel() {
            const contentDiv = this.panel.querySelector('#dify-panel-content');
            contentDiv.textContent = '';
            const spinner = document.createElement('div');
            spinner.className = 'dify-loading-spinner';
            contentDiv.appendChild(spinner);

            if (this.isFullscreen) this._toggleFullscreen();
            this.panel.style.top = '50%';
            this.panel.style.left = '50%';
            this.panel.style.transform = 'translate(-50%, -50%)';
            this.panel.classList.add('show');
            this.overlay.classList.add('show');
        }

        _showResultPanel(result) {
            const titleElement = this.panel.querySelector('#dify-panel-title');
            titleElement.textContent = this.currentSummaryMode === 'selection'
                ? '📝 AI总结结果（选中文本）'
                : '📝 AI总结结果（全文）';

            const contentDiv = this.panel.querySelector('#dify-panel-content');
            contentDiv.textContent = '';
            this._renderMarkdownContent(result, contentDiv);
            contentDiv.scrollTop = 0;

            this.panel.classList.add('show');
            this.overlay.classList.add('show');
        }

        _showErrorPanel(errorMessage) {
            const contentDiv = this.panel.querySelector('#dify-panel-content');
            contentDiv.textContent = '';

            const errorDiv = document.createElement('div');
            errorDiv.className = 'dify-error-message';
            const errorTitle = document.createElement('h4');
            errorTitle.style.marginTop = '0';
            errorTitle.textContent = '❌ 处理失败';
            const errorText = document.createElement('p');
            errorText.textContent = errorMessage;
            errorDiv.appendChild(errorTitle);
            errorDiv.appendChild(errorText);
            contentDiv.appendChild(errorDiv);

            this.panel.classList.add('show');
            this.overlay.classList.add('show');
        }

        _hidePanel() {
            if (this.isFullscreen) this._toggleFullscreen();
            this.panel.classList.remove('show');
            this.overlay.classList.remove('show');
        }

        _toggleFullscreen() {
            this.isFullscreen = !this.isFullscreen;
            if (this.isFullscreen) {
                this.panel.classList.add('fullscreen');
                this.panel.classList.remove('draggable');
                this.panelHeader.classList.remove('draggable');
                this.fullscreenBtn.textContent = '⤓';
                this.fullscreenBtn.title = '退出全屏';
            } else {
                this.panel.classList.remove('fullscreen');
                this.panel.classList.add('draggable');
                this.panelHeader.classList.add('draggable');
                this.fullscreenBtn.textContent = '⤢';
                this.fullscreenBtn.title = '全屏显示';
                this.panel.style.top = '50%';
                this.panel.style.left = '50%';
                this.panel.style.transform = 'translate(-50%, -50%)';
            }
        }

        _makePanelDraggable() {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            let isDragging = false;
            const self = this;

            const handleMouseDown = (e) => {
                if (e.target.closest('button') || e.target.tagName === 'BUTTON') return;
                if (e.target.closest('#dify-panel-content')) return;
                if (self.isFullscreen) return;

                e.preventDefault();
                e.stopPropagation();
                isDragging = true;
                pos3 = e.clientX;
                pos4 = e.clientY;

                self.panel.classList.add('dragging');
                self.panelHeader.classList.add('dragging');

                const rect = self.panel.getBoundingClientRect();
                self.panel.style.top = rect.top + 'px';
                self.panel.style.left = rect.left + 'px';
                self.panel.style.transform = 'none';

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            };

            const handleMouseMove = (e) => {
                if (!isDragging || self.isFullscreen) return;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                let newTop = self.panel.offsetTop - pos2;
                let newLeft = self.panel.offsetLeft - pos1;
                const maxX = window.innerWidth - self.panel.offsetWidth;
                const maxY = window.innerHeight - self.panel.offsetHeight;
                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));

                self.panel.style.top = newTop + 'px';
                self.panel.style.left = newLeft + 'px';
            };

            const handleMouseUp = () => {
                if (isDragging) {
                    isDragging = false;
                    self.panel.classList.remove('dragging');
                    self.panelHeader.classList.remove('dragging');
                }
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            this.panelHeader.addEventListener('mousedown', handleMouseDown);
            this.panelHeader.classList.add('draggable');
            this.panel.classList.add('draggable');
        }

        // ==================== Markdown 渲染 ====================
        _renderMarkdownContent(text, container) {
            const lines = text.split('\n');
            let i = 0;
            let currentParagraph = null;
            let inCodeBlock = false;
            let codeBlockContent = [];
            let inTable = false;
            let tableHeaders = [];
            let tableRows = [];

            while (i < lines.length) {
                const line = lines[i];
                const trimmedLine = line.trim();

                if (trimmedLine.startsWith('```')) {
                    if (inCodeBlock) {
                        const pre = document.createElement('pre');
                        const code = document.createElement('code');
                        code.textContent = codeBlockContent.join('\n');
                        pre.appendChild(code);
                        container.appendChild(pre);
                        inCodeBlock = false;
                        codeBlockContent = [];
                        currentParagraph = null;
                    } else {
                        if (currentParagraph) { container.appendChild(currentParagraph); currentParagraph = null; }
                        inCodeBlock = true;
                    }
                    i++; continue;
                }

                if (inCodeBlock) { codeBlockContent.push(line); i++; continue; }

                if (trimmedLine.match(/^[-*_]{3,}$/)) {
                    if (currentParagraph) { container.appendChild(currentParagraph); currentParagraph = null; }
                    container.appendChild(document.createElement('hr'));
                    i++; continue;
                }

                if (trimmedLine.includes('|') && trimmedLine.split('|').length >= 3) {
                    if (trimmedLine.match(/^\|[\s\-:]+\|/)) { i++; continue; }
                    const cells = trimmedLine.split('|').map(c => c.trim()).filter(c => c);
                    if (cells.length > 0) {
                        if (!inTable) { inTable = true; tableHeaders = cells; tableRows = []; }
                        else { tableRows.push(cells); }
                    }
                    i++; continue;
                } else if (inTable) {
                    this._renderTable(tableHeaders, tableRows, container);
                    inTable = false; tableHeaders = []; tableRows = []; currentParagraph = null;
                    continue;
                }

                if (!trimmedLine) {
                    if (currentParagraph) { container.appendChild(currentParagraph); currentParagraph = null; }
                    i++; continue;
                }

                const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
                if (headingMatch) {
                    if (currentParagraph) { container.appendChild(currentParagraph); currentParagraph = null; }
                    const heading = document.createElement(`h${Math.min(headingMatch[1].length, 6)}`);
                    this._appendFormattedText(headingMatch[2], heading);
                    container.appendChild(heading);
                    i++; continue;
                }

                if (trimmedLine.startsWith('> ')) {
                    if (currentParagraph && currentParagraph.tagName !== 'BLOCKQUOTE') { container.appendChild(currentParagraph); currentParagraph = null; }
                    if (!currentParagraph) currentParagraph = document.createElement('blockquote');
                    if (currentParagraph.textContent.trim()) currentParagraph.appendChild(document.createElement('br'));
                    this._appendFormattedText(trimmedLine.substring(2), currentParagraph);
                    i++; continue;
                }

                const ulMatch = trimmedLine.match(/^[\*\-\+]\s+(.+)$/);
                if (ulMatch) {
                    if (currentParagraph && currentParagraph.tagName !== 'UL') { container.appendChild(currentParagraph); currentParagraph = null; }
                    if (!currentParagraph || currentParagraph.tagName !== 'UL') {
                        if (currentParagraph) container.appendChild(currentParagraph);
                        currentParagraph = document.createElement('ul');
                    }
                    const li = document.createElement('li');
                    this._appendFormattedText(ulMatch[1], li);
                    currentParagraph.appendChild(li);
                    i++; continue;
                }

                const olMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
                if (olMatch) {
                    if (currentParagraph && currentParagraph.tagName !== 'OL') { container.appendChild(currentParagraph); currentParagraph = null; }
                    if (!currentParagraph || currentParagraph.tagName !== 'OL') {
                        if (currentParagraph) container.appendChild(currentParagraph);
                        currentParagraph = document.createElement('ol');
                    }
                    const li = document.createElement('li');
                    this._appendFormattedText(olMatch[1], li);
                    currentParagraph.appendChild(li);
                    i++; continue;
                }

                if (currentParagraph && currentParagraph.tagName !== 'P' && currentParagraph.tagName !== 'BLOCKQUOTE') {
                    container.appendChild(currentParagraph); currentParagraph = null;
                }
                if (!currentParagraph) currentParagraph = document.createElement('p');
                this._appendFormattedText(trimmedLine, currentParagraph);
                currentParagraph.appendChild(document.createElement('br'));
                i++;
            }

            if (inCodeBlock && codeBlockContent.length > 0) {
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.textContent = codeBlockContent.join('\n');
                pre.appendChild(code);
                container.appendChild(pre);
            }
            if (inTable && tableRows.length > 0) this._renderTable(tableHeaders, tableRows, container);
            if (currentParagraph && currentParagraph.textContent.trim()) container.appendChild(currentParagraph);
        }

        _renderTable(headers, rows, container) {
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            const tbody = document.createElement('tbody');
            const headerRow = document.createElement('tr');
            headers.forEach(h => {
                const th = document.createElement('th');
                this._appendFormattedText(h, th);
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            rows.forEach(row => {
                const tr = document.createElement('tr');
                row.forEach(cell => {
                    const td = document.createElement('td');
                    this._appendFormattedText(cell, td);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(thead);
            table.appendChild(tbody);
            container.appendChild(table);
        }

        _appendFormattedText(text, container) {
            const parts = [];
            let i = 0;

            while (i < text.length) {
                if (text[i] === '`') {
                    let codeText = '';
                    i++;
                    while (i < text.length && text[i] !== '`') { codeText += text[i]; i++; }
                    if (i < text.length) { parts.push({ type: 'code', content: codeText }); i++; continue; }
                }

                if (text[i] === '[') {
                    let linkText = '';
                    i++;
                    while (i < text.length && text[i] !== ']') { linkText += text[i]; i++; }
                    if (i < text.length && text[i + 1] === '(') {
                        i += 2;
                        let linkUrl = '';
                        while (i < text.length && text[i] !== ')') { linkUrl += text[i]; i++; }
                        if (i < text.length) { parts.push({ type: 'link', text: linkText, url: linkUrl }); i++; continue; }
                    }
                }

                if ((text[i] === '*' && text[i + 1] === '*') || (text[i] === '_' && text[i + 1] === '_')) {
                    const marker = text[i]; i += 2;
                    let boldText = '';
                    while (i < text.length - 1) {
                        if (text[i] === marker && text[i + 1] === marker) { i += 2; break; }
                        boldText += text[i]; i++;
                    }
                    parts.push({ type: 'bold', content: boldText }); continue;
                }

                if ((text[i] === '*' || text[i] === '_') && text[i + 1] !== text[i]) {
                    const marker = text[i]; i++;
                    let italicText = '';
                    while (i < text.length) {
                        if (text[i] === marker && (i === text.length - 1 || text[i + 1] !== marker)) { i++; break; }
                        italicText += text[i]; i++;
                    }
                    parts.push({ type: 'italic', content: italicText }); continue;
                }

                let textStart = i;
                while (i < text.length && !['`', '[', '*', '_'].includes(text[i])) { i++; }
                if (i > textStart) parts.push({ type: 'text', content: text.substring(textStart, i) });
            }

            for (const part of parts) {
                if (part.type === 'text') {
                    container.appendChild(document.createTextNode(part.content));
                } else if (part.type === 'bold') {
                    const strong = document.createElement('strong');
                    this._appendFormattedText(part.content, strong);
                    container.appendChild(strong);
                } else if (part.type === 'italic') {
                    const em = document.createElement('em');
                    this._appendFormattedText(part.content, em);
                    container.appendChild(em);
                } else if (part.type === 'code') {
                    const code = document.createElement('code');
                    code.textContent = part.content;
                    container.appendChild(code);
                } else if (part.type === 'link') {
                    const a = document.createElement('a');
                    a.href = part.url;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    this._appendFormattedText(part.text, a);
                    container.appendChild(a);
                }
            }
        }

        _copyResult() {
            if (!this.currentResult) return;
            const copyBtn = this.panel.querySelector('#dify-copy-btn');
            const copyText = copyBtn.querySelector('.copy-text');
            const copyIcon = copyBtn.querySelector('.copy-icon');

            const doSuccess = () => {
                copyBtn.classList.add('copied');
                copyIcon.textContent = '✓';
                copyText.textContent = '已复制';
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    copyIcon.textContent = '📋';
                    copyText.textContent = '复制结果';
                }, 2000);
            };

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(this.currentResult).then(doSuccess).catch(() => {
                    copyText.textContent = '复制失败';
                    setTimeout(() => { copyText.textContent = '复制结果'; }, 2000);
                });
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = this.currentResult;
                textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                doSuccess();
            }
        }

        _initFullscreenDetection() {
            const handleFullscreenChange = () => {
                if (!this.button) return;
                const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
                if (isFS) {
                    this.button.classList.add('hidden');
                } else {
                    this.button.classList.remove('hidden');
                }
            };
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            handleFullscreenChange();
        }

        _listenMessages() {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.type === 'TRIGGER_SUMMARIZE') {
                    this.handleSummarize();
                    sendResponse({ ok: true });
                }
            });
        }
    }

    // ==================== 启动 ====================
    new UIManager();
})();
