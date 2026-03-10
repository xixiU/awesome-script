// 飞书文档转 Markdown/Word - Content Script v2.0
// 优化版：悬停展开菜单 + 导出选项 + 修复 Word 导出

(function() {
    'use strict';

    let isProcessing = false;
    let exportOptions = {
        includeImages: true,
        includeText: true,
        includeTables: true
    };

    // ==================== 工具函数 ====================

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); reject(new Error('Element not found')); }, timeout);
        });
    }

    function getDocTitle() {
        const titleSelectors = ['.doc-title', '[data-testid="doc-title"]', '.suite-title-input', '.title-input', 'h1'];
        for (const selector of titleSelectors) {
            const titleEl = document.querySelector(selector);
            if (titleEl && titleEl.textContent.trim()) {
                return titleEl.textContent.trim().replace(/[\\/:*?"<>|]/g, '_');
            }
        }
        return 'feishu_document';
    }

    function getDocumentContent() {
        const contentSelectors = [
            '.doc-content', '[data-testid="doc-content"]', '.suite-editor-content',
            '.editor-content', '.lark-doc-content', 'article', '[role="article"]',
            '.document-content', '.content', 'main article', 'main', '#content', '.main-content'
        ];
        for (const selector of contentSelectors) {
            const content = document.querySelector(selector);
            if (content) {
                console.log('使用选择器获取内容:', selector);
                return content.cloneNode(true);
            }
        }
        console.warn('未找到标准内容选择器，使用 body');
        const body = document.body.cloneNode(true);
        const removeSelectors = ['nav', 'header', 'footer', '.sidebar', '.navigation', 'aside'];
        removeSelectors.forEach(sel => {
            const elements = body.querySelectorAll(sel);
            elements.forEach(el => el.remove());
        });
        return body;
    }

    async function downloadImage(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return blob;
        } catch (error) {
            console.error('下载图片失败:', url, error);
            return null;
        }
    }

    async function processImages(contentElement) {
        if (!exportOptions.includeImages) return [];
        const images = [];
        const imgElements = contentElement.querySelectorAll('img');
        for (let i = 0; i < imgElements.length; i++) {
            const img = imgElements[i];
            let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
            if (src && !src.startsWith('data:')) {
                if (src.startsWith('//')) src = 'https:' + src;
                else if (src.startsWith('/')) src = window.location.origin + src;
                try {
                    const blob = await downloadImage(src);
                    if (blob) {
                        const ext = src.split('.').pop().split('?')[0].toLowerCase() || 'png';
                        const validExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'png';
                        const filename = `image_${String(i + 1).padStart(3, '0')}.${validExt}`;
                        images.push({ blob: blob, filename: filename, originalSrc: src });
                        img.setAttribute('data-md-src', `./images/${filename}`);
                    }
                } catch (error) {
                    console.error('处理图片失败:', src, error);
                }
            }
        }
        return images;
    }

    function downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    // ==================== UI 创建 ====================

    function createExportButton() {
        if (document.getElementById('feishu-export-container')) return;

        const container = document.createElement('div');
        container.id = 'feishu-export-container';
        container.style.cssText = `
            position: fixed; top: 80px; right: 20px; z-index: 10000;
        `;

        const mainButton = document.createElement('button');
        mainButton.id = 'feishu-export-main-btn';
        mainButton.innerHTML = '📥 导出文档';
        mainButton.style.cssText = `
            padding: 10px 20px; background: #0066FF; color: white; border: none;
            border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;
            box-shadow: 0 2px 8px rgba(0,102,255,0.3); transition: all 0.3s;
        `;

        const menu = document.createElement('div');
        menu.id = 'feishu-export-menu';
        menu.style.cssText = `
            position: absolute; top: 45px; right: 0; background: white;
            border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            padding: 8px 0; min-width: 200px; display: none; opacity: 0;
            transition: opacity 0.2s;
        `;

        const menuItems = [
            { text: '📥 导出 Markdown', format: 'markdown', color: '#0066FF' },
            { text: '📄 导出 Word', format: 'word', color: '#2B579A' },
            { text: '⚙️ 导出选项', format: 'options', color: '#666' }
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.style.cssText = `
                padding: 10px 20px; cursor: pointer; transition: background 0.2s;
                color: ${item.color}; font-size: 14px;
            `;
            menuItem.innerHTML = item.text;
            menuItem.addEventListener('mouseover', () => {
                menuItem.style.background = '#f5f5f5';
            });
            menuItem.addEventListener('mouseout', () => {
                menuItem.style.background = 'transparent';
            });
            menuItem.addEventListener('click', () => {
                if (item.format === 'options') {
                    showOptionsDialog();
                } else {
                    handleExport(item.format);
                }
                menu.style.display = 'none';
                menu.style.opacity = '0';
            });
            menu.appendChild(menuItem);
        });

        let hideTimeout;
        container.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            menu.style.display = 'block';
            setTimeout(() => { menu.style.opacity = '1'; }, 10);
        });
        container.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                menu.style.opacity = '0';
                setTimeout(() => { menu.style.display = 'none'; }, 200);
            }, 300);
        });

        mainButton.addEventListener('mouseover', () => {
            mainButton.style.background = '#0052CC';
            mainButton.style.transform = 'translateY(-2px)';
        });
        mainButton.addEventListener('mouseout', () => {
            mainButton.style.background = '#0066FF';
            mainButton.style.transform = 'translateY(0)';
        });

        container.appendChild(mainButton);
        container.appendChild(menu);
        document.body.appendChild(container);
    }

    function showOptionsDialog() {
        const existingDialog = document.getElementById('feishu-options-dialog');
        if (existingDialog) existingDialog.remove();

        const overlay = document.createElement('div');
        overlay.id = 'feishu-options-dialog';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 10001; display: flex;
            align-items: center; justify-content: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white; border-radius: 12px; padding: 24px;
            min-width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #1f2329;">导出选项</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="opt-images" ${exportOptions.includeImages ? 'checked' : ''}
                        style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                    <span style="font-size: 14px; color: #1f2329;">包含图片</span>
                </label>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="opt-text" ${exportOptions.includeText ? 'checked' : ''}
                        style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                    <span style="font-size: 14px; color: #1f2329;">包含文本</span>
                </label>
            </div>
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="opt-tables" ${exportOptions.includeTables ? 'checked' : ''}
                        style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                    <span style="font-size: 14px; color: #1f2329;">包含表格</span>
                </label>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="opt-cancel" style="padding: 8px 16px; border: 1px solid #ddd;
                    background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    取消
                </button>
                <button id="opt-save" style="padding: 8px 16px; border: none;
                    background: #0066FF; color: white; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    保存
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        dialog.querySelector('#opt-cancel').addEventListener('click', () => overlay.remove());
        dialog.querySelector('#opt-save').addEventListener('click', () => {
            exportOptions.includeImages = dialog.querySelector('#opt-images').checked;
            exportOptions.includeText = dialog.querySelector('#opt-text').checked;
            exportOptions.includeTables = dialog.querySelector('#opt-tables').checked;
            overlay.remove();
            console.log('导出选项已更新:', exportOptions);
        });
    }

    function showProgress(message) {
        const btn = document.getElementById('feishu-export-main-btn');
        if (btn) {
            btn.innerHTML = message;
            btn.disabled = true;
        }
    }

    function resetButton() {
        const btn = document.getElementById('feishu-export-main-btn');
        if (btn) {
            btn.innerHTML = '📥 导出文档';
            btn.disabled = false;
        }
    }

    // ==================== 导出功能 ====================

    async function handleExport(format) {
        if (isProcessing) return;
        isProcessing = true;

        try {
            showProgress('⏳ 获取内容...');
            const contentElement = getDocumentContent();
            if (!contentElement) {
                alert('无法找到文档内容，请确保页面已完全加载');
                return;
            }

            showProgress('⏳ 处理图片...');
            const images = await processImages(contentElement);
            console.log(`共处理 ${images.length} 张图片`);

            const title = getDocTitle();

            if (format === 'word') {
                await exportToWord(contentElement, images, title);
            } else {
                await exportToMarkdown(contentElement, images, title);
            }

            console.log('导出成功！');
            showProgress('✅ 导出成功！');
            setTimeout(() => resetButton(), 2000);

        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败: ' + error.message);
            resetButton();
        } finally {
            isProcessing = false;
        }
    }

    function configureTurndown() {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            emDelimiter: '*'
        });
        turndownService.addRule('images', {
            filter: 'img',
            replacement: function(content, node) {
                const alt = node.alt || '';
                const src = node.getAttribute('data-md-src') || node.src;
                return `![${alt}](${src})`;
            }
        });
        turndownService.addRule('codeBlock', {
            filter: function(node) {
                return node.nodeName === 'PRE' && node.querySelector('code');
            },
            replacement: function(content, node) {
                const codeNode = node.querySelector('code');
                const language = (codeNode.className.match(/language-(\w+)/) || [])[1] || '';
                const code = codeNode.textContent;
                return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
            }
        });
        turndownService.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td']);
        return turndownService;
    }

    async function exportToMarkdown(contentElement, images, title) {
        showProgress('⏳ 转换格式...');
        const turndownService = configureTurndown();
        const markdown = turndownService.turndown(contentElement);

        showProgress('⏳ 打包文件...');
        const zip = new JSZip();
        zip.file(`${title}.md`, markdown);

        if (images.length > 0) {
            const imagesFolder = zip.folder('images');
            images.forEach(img => imagesFolder.file(img.filename, img.blob));
        }

        showProgress('⏳ 生成下载...');
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        downloadFile(blob, `${title}.zip`);
    }

    async function exportToWord(contentElement, images, title) {
        showProgress('⏳ 转换格式...');

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell } = docx;

        // 创建图片映射
        const imageMap = new Map();
        for (const img of images) {
            const arrayBuffer = await img.blob.arrayBuffer();
            imageMap.set(img.originalSrc, arrayBuffer);
        }

        // 解析内容
        const paragraphs = [];

        function processTextNode(node, formatting = {}) {
            const text = node.textContent;
            if (!text.trim()) return null;
            return new TextRun({
                text: text,
                bold: formatting.bold || false,
                italics: formatting.italics || false,
                underline: formatting.underline ? {} : undefined
            });
        }

        function processElement(element, formatting = {}) {
            const tag = element.tagName.toLowerCase();

            // 标题
            if (/^h[1-6]$/.test(tag)) {
                const level = parseInt(tag[1]);
                const headingLevels = [
                    HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
                    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6
                ];
                paragraphs.push(new Paragraph({
                    text: element.textContent,
                    heading: headingLevels[level - 1]
                }));
                return;
            }

            // 段落
            if (tag === 'p' || tag === 'div') {
                const runs = [];
                for (const child of element.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        const run = processTextNode(child, formatting);
                        if (run) runs.push(run);
                    } else if (child.nodeType === Node.ELEMENT_NODE) {
                        const childTag = child.tagName.toLowerCase();
                        if (childTag === 'strong' || childTag === 'b') {
                            for (const grandChild of child.childNodes) {
                                if (grandChild.nodeType === Node.TEXT_NODE) {
                                    const run = processTextNode(grandChild, { ...formatting, bold: true });
                                    if (run) runs.push(run);
                                }
                            }
                        } else if (childTag === 'em' || childTag === 'i') {
                            for (const grandChild of child.childNodes) {
                                if (grandChild.nodeType === Node.TEXT_NODE) {
                                    const run = processTextNode(grandChild, { ...formatting, italics: true });
                                    if (run) runs.push(run);
                                }
                            }
                        } else if (childTag === 'img') {
                            const src = child.src || child.getAttribute('data-src');
                            const imgData = imageMap.get(src);
                            if (imgData) {
                                runs.push(new ImageRun({
                                    data: imgData,
                                    transformation: { width: 400, height: 300 }
                                }));
                            }
                        } else {
                            const run = processTextNode(child, formatting);
                            if (run) runs.push(run);
                        }
                    }
                }
                if (runs.length > 0) {
                    paragraphs.push(new Paragraph({ children: runs }));
                }
                return;
            }

            // 图片
            if (tag === 'img') {
                const src = element.src || element.getAttribute('data-src');
                const imgData = imageMap.get(src);
                if (imgData) {
                    paragraphs.push(new Paragraph({
                        children: [new ImageRun({
                            data: imgData,
                            transformation: { width: 500, height: 375 }
                        })]
                    }));
                }
                return;
            }

            // 递归处理子元素
            for (const child of element.children) {
                processElement(child, formatting);
            }
        }

        // 处理所有子元素
        for (const child of contentElement.children) {
            processElement(child);
        }

        // 如果没有内容，添加默认段落
        if (paragraphs.length === 0) {
            paragraphs.push(new Paragraph({ text: '文档内容为空' }));
        }

        showProgress('⏳ 生成文档...');

        const doc = new Document({
            sections: [{ properties: {}, children: paragraphs }]
        });

        const blob = await Packer.toBlob(doc);
        downloadFile(blob, `${title}.docx`);
    }

    // ==================== 初始化 ====================

    async function init() {
        try {
            const selectors = [
                '.doc-content', '[data-testid="doc-content"]', '.suite-editor-content',
                '.lark-doc-content', '.editor-content', 'article', '[role="article"]',
                '.document-content', 'main'
            ];

            let contentFound = false;
            for (const selector of selectors) {
                try {
                    await waitForElement(selector, 2000);
                    contentFound = true;
                    console.log('找到文档内容元素:', selector);
                    break;
                } catch (e) {}
            }

            if (!contentFound) {
                console.warn('未找到标准文档内容元素，将尝试通用方式');
            }

            setTimeout(() => {
                createExportButton();
                console.log('飞书文档转 Markdown/Word 插件已加载');
            }, 1000);

        } catch (error) {
            console.error('初始化失败:', error);
            setTimeout(() => {
                createExportButton();
                console.log('飞书文档转 Markdown/Word 插件已加载（降级模式）');
            }, 2000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
