// 飞书文档转 Markdown - Content Script

(function() {
    'use strict';

    let isProcessing = false;

    // 等待元素加载
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

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Element not found'));
            }, timeout);
        });
    }

    // 创建导出按钮
    function createExportButton() {
        // 检查按钮是否已存在
        if (document.getElementById('feishu-md-export-btn')) {
            return;
        }

        // 创建容器
        const container = document.createElement('div');
        container.id = 'feishu-md-export-container';
        container.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
            display: flex;
            gap: 10px;
        `;

        // 创建 Markdown 按钮
        const mdButton = document.createElement('button');
        mdButton.id = 'feishu-md-export-btn';
        mdButton.innerHTML = '📥 导出 Markdown';
        mdButton.style.cssText = `
            padding: 10px 20px;
            background: #0066FF;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 2px 8px rgba(0,102,255,0.3);
            transition: all 0.3s;
        `;

        // 创建 Word 按钮
        const wordButton = document.createElement('button');
        wordButton.id = 'feishu-word-export-btn';
        wordButton.innerHTML = '📄 导出 Word';
        wordButton.style.cssText = `
            padding: 10px 20px;
            background: #2B579A;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 2px 8px rgba(43,87,154,0.3);
            transition: all 0.3s;
        `;

        // Markdown 按钮悬停效果
        mdButton.addEventListener('mouseover', () => {
            mdButton.style.background = '#0052CC';
            mdButton.style.transform = 'translateY(-2px)';
            mdButton.style.boxShadow = '0 4px 12px rgba(0,102,255,0.4)';
        });

        mdButton.addEventListener('mouseout', () => {
            mdButton.style.background = '#0066FF';
            mdButton.style.transform = 'translateY(0)';
            mdButton.style.boxShadow = '0 2px 8px rgba(0,102,255,0.3)';
        });

        // Word 按钮悬停效果
        wordButton.addEventListener('mouseover', () => {
            wordButton.style.background = '#1F4788';
            wordButton.style.transform = 'translateY(-2px)';
            wordButton.style.boxShadow = '0 4px 12px rgba(43,87,154,0.4)';
        });

        wordButton.addEventListener('mouseout', () => {
            wordButton.style.background = '#2B579A';
            wordButton.style.transform = 'translateY(0)';
            wordButton.style.boxShadow = '0 2px 8px rgba(43,87,154,0.3)';
        });

        mdButton.addEventListener('click', () => handleExport('markdown'));
        wordButton.addEventListener('click', () => handleExport('word'));

        container.appendChild(mdButton);
        container.appendChild(wordButton);
        document.body.appendChild(container);
    }

    // 获取文档标题
    function getDocTitle() {
        const titleSelectors = [
            '.doc-title',
            '[data-testid="doc-title"]',
            '.suite-title-input',
            '.title-input',
            'h1'
        ];

        for (const selector of titleSelectors) {
            const titleEl = document.querySelector(selector);
            if (titleEl && titleEl.textContent.trim()) {
                return titleEl.textContent.trim().replace(/[\\/:*?"<>|]/g, '_');
            }
        }
        return 'feishu_document';
    }

    // 获取文档内容
    function getDocumentContent() {
        const contentSelectors = [
            '.doc-content',
            '[data-testid="doc-content"]',
            '.suite-editor-content',
            '.editor-content',
            '.lark-doc-content',
            'article',
            '[role="article"]',
            '.document-content',
            '.content',
            'main article',
            'main',
            '#content',
            '.main-content'
        ];

        for (const selector of contentSelectors) {
            const content = document.querySelector(selector);
            if (content) {
                console.log('使用选择器获取内容:', selector);
                return content.cloneNode(true);
            }
        }

        // 如果都找不到，尝试获取 body 的主要内容区域
        console.warn('未找到标准内容选择器，使用 body');
        const body = document.body.cloneNode(true);

        // 移除导航、侧边栏等不需要的元素
        const removeSelectors = ['nav', 'header', 'footer', '.sidebar', '.navigation', 'aside'];
        removeSelectors.forEach(sel => {
            const elements = body.querySelectorAll(sel);
            elements.forEach(el => el.remove());
        });

        return body;
    }

    // 下载图片
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

    // 处理图片
    async function processImages(contentElement) {
        const images = [];
        const imgElements = contentElement.querySelectorAll('img');

        for (let i = 0; i < imgElements.length; i++) {
            const img = imgElements[i];
            let src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');

            if (src && !src.startsWith('data:')) {
                // 处理相对路径
                if (src.startsWith('//')) {
                    src = 'https:' + src;
                } else if (src.startsWith('/')) {
                    src = window.location.origin + src;
                }

                try {
                    const blob = await downloadImage(src);
                    if (blob) {
                        const ext = src.split('.').pop().split('?')[0].toLowerCase() || 'png';
                        const validExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'png';
                        const filename = `image_${String(i + 1).padStart(3, '0')}.${validExt}`;

                        images.push({
                            blob: blob,
                            filename: filename,
                            originalSrc: src
                        });

                        // 替换为本地路径
                        img.setAttribute('data-md-src', `./images/${filename}`);
                    }
                } catch (error) {
                    console.error('处理图片失败:', src, error);
                }
            }
        }

        return images;
    }

    // 配置 Turndown
    function configureTurndown() {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            emDelimiter: '*'
        });

        // 处理图片
        turndownService.addRule('images', {
            filter: 'img',
            replacement: function(content, node) {
                const alt = node.alt || '';
                const src = node.getAttribute('data-md-src') || node.src;
                return `![${alt}](${src})`;
            }
        });

        // 处理代码块
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

        // 处理表格
        turndownService.keep(['table', 'thead', 'tbody', 'tr', 'th', 'td']);

        return turndownService;
    }

    // 显示进度提示
    function showProgress(message, format = 'markdown') {
        const buttonId = format === 'word' ? 'feishu-word-export-btn' : 'feishu-md-export-btn';
        const button = document.getElementById(buttonId);
        if (button) {
            button.innerHTML = message;
            button.disabled = true;
        }
    }

    // 恢复按钮状态
    function resetButton(format = 'markdown') {
        const buttonId = format === 'word' ? 'feishu-word-export-btn' : 'feishu-md-export-btn';
        const button = document.getElementById(buttonId);
        if (button) {
            button.innerHTML = format === 'word' ? '📄 导出 Word' : '📥 导出 Markdown';
            button.disabled = false;
        }
    }

    // 处理导出
    async function handleExport(format = 'markdown') {
        if (isProcessing) {
            return;
        }

        isProcessing = true;

        try {
            showProgress('⏳ 获取内容...', format);

            // 获取文档内容
            const contentElement = getDocumentContent();
            if (!contentElement) {
                alert('无法找到文档内容，请确保页面已完全加载');
                return;
            }

            showProgress('⏳ 处理图片...', format);

            // 处理图片
            const images = await processImages(contentElement);
            console.log(`共处理 ${images.length} 张图片`);

            // 获取文档标题
            const title = getDocTitle();

            if (format === 'word') {
                await exportToWord(contentElement, images, title);
            } else {
                await exportToMarkdown(contentElement, images, title);
            }

            console.log('导出成功！');
            showProgress('✅ 导出成功！', format);

            setTimeout(() => {
                resetButton(format);
            }, 2000);

        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败: ' + error.message);
            resetButton(format);
        } finally {
            isProcessing = false;
        }
    }

    // 导出为 Markdown
    async function exportToMarkdown(contentElement, images, title) {
        showProgress('⏳ 转换格式...', 'markdown');

        // 转换为 Markdown
        const turndownService = configureTurndown();
        const markdown = turndownService.turndown(contentElement);

        showProgress('⏳ 打包文件...', 'markdown');

        // 创建 ZIP 文件
        const zip = new JSZip();
        zip.file(`${title}.md`, markdown);

        // 添加图片
        if (images.length > 0) {
            const imagesFolder = zip.folder('images');
            images.forEach(img => {
                imagesFolder.file(img.filename, img.blob);
            });
        }

        showProgress('⏳ 生成下载...', 'markdown');

        // 生成并下载
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        downloadFile(blob, `${title}.zip`);
    }

    // 导出为 Word
    async function exportToWord(contentElement, images, title) {
        showProgress('⏳ 转换格式...', 'word');

        const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } = docx;

        // 解析 HTML 内容为 Word 段落
        const paragraphs = await parseHTMLToWordParagraphs(contentElement, images);

        // 创建 Word 文档
        const doc = new Document({
            sections: [{
                properties: {},
                children: paragraphs
            }]
        });

        showProgress('⏳ 生成文档...', 'word');

        // 生成 Word 文件
        const blob = await Packer.toBlob(doc);

        downloadFile(blob, `${title}.docx`);
    }

    // 解析 HTML 为 Word 段落
    async function parseHTMLToWordParagraphs(element, images) {
        const { Paragraph, TextRun, HeadingLevel, ImageRun } = docx;
        const paragraphs = [];
        const imageMap = new Map();

        // 创建图片映射
        images.forEach(img => {
            imageMap.set(img.originalSrc, img.blob);
        });

        // 递归处理节点
        async function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    return [new TextRun(text)];
                }
                return [];
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                return [];
            }

            const tagName = node.tagName.toLowerCase();
            const runs = [];

            switch (tagName) {
                case 'h1':
                case 'h2':
                case 'h3':
                case 'h4':
                case 'h5':
                case 'h6':
                    const level = parseInt(tagName[1]);
                    const headingLevels = [
                        HeadingLevel.HEADING_1,
                        HeadingLevel.HEADING_2,
                        HeadingLevel.HEADING_3,
                        HeadingLevel.HEADING_4,
                        HeadingLevel.HEADING_5,
                        HeadingLevel.HEADING_6
                    ];
                    paragraphs.push(new Paragraph({
                        text: node.textContent,
                        heading: headingLevels[level - 1]
                    }));
                    return [];

                case 'p':
                    const pRuns = [];
                    for (const child of node.childNodes) {
                        const childRuns = await processNode(child);
                        pRuns.push(...childRuns);
                    }
                    if (pRuns.length > 0) {
                        paragraphs.push(new Paragraph({ children: pRuns }));
                    }
                    return [];

                case 'strong':
                case 'b':
                    for (const child of node.childNodes) {
                        const childRuns = await processNode(child);
                        childRuns.forEach(run => {
                            if (run instanceof TextRun) {
                                run.bold();
                            }
                        });
                        runs.push(...childRuns);
                    }
                    return runs;

                case 'em':
                case 'i':
                    for (const child of node.childNodes) {
                        const childRuns = await processNode(child);
                        childRuns.forEach(run => {
                            if (run instanceof TextRun) {
                                run.italics();
                            }
                        });
                        runs.push(...childRuns);
                    }
                    return runs;

                case 'img':
                    const src = node.src || node.getAttribute('data-src');
                    const blob = imageMap.get(src);
                    if (blob) {
                        try {
                            const arrayBuffer = await blob.arrayBuffer();
                            const imageRun = new ImageRun({
                                data: arrayBuffer,
                                transformation: {
                                    width: Math.min(node.width || 600, 600),
                                    height: Math.min(node.height || 400, 400)
                                }
                            });
                            paragraphs.push(new Paragraph({ children: [imageRun] }));
                        } catch (error) {
                            console.error('添加图片失败:', error);
                        }
                    }
                    return [];

                case 'br':
                    paragraphs.push(new Paragraph({ text: '' }));
                    return [];

                default:
                    for (const child of node.childNodes) {
                        const childRuns = await processNode(child);
                        runs.push(...childRuns);
                    }
                    return runs;
            }
        }

        // 处理所有子节点
        for (const child of element.childNodes) {
            await processNode(child);
        }

        return paragraphs;
    }

    // 下载文件
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

    // 初始化
    async function init() {
        try {
            // 尝试等待文档内容元素
            // 支持多种文档平台的选择器
            const selectors = [
                '.doc-content',
                '[data-testid="doc-content"]',
                '.suite-editor-content',
                '.lark-doc-content',
                '.editor-content',
                'article',
                '[role="article"]',
                '.document-content',
                'main'
            ];

            let contentFound = false;
            for (const selector of selectors) {
                try {
                    await waitForElement(selector, 2000);
                    contentFound = true;
                    console.log('找到文档内容元素:', selector);
                    break;
                } catch (e) {
                    // 继续尝试下一个选择器
                }
            }

            // 即使没找到特定元素，也创建按钮（可能是新的文档平台）
            if (!contentFound) {
                console.warn('未找到标准文档内容元素，将尝试通用方式');
            }

            // 延迟创建按钮，避免影响页面加载
            setTimeout(() => {
                createExportButton();
                console.log('飞书文档转 Markdown 插件已加载');
            }, 1000);

        } catch (error) {
            console.error('初始化失败:', error);
            // 即使初始化失败，也尝试创建按钮
            setTimeout(() => {
                createExportButton();
                console.log('飞书文档转 Markdown 插件已加载（降级模式）');
            }, 2000);
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

