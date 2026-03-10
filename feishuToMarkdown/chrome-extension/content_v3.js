// 飞书文档转 Markdown - Content Script v3.0
// 自动下载 docx + mammoth.js 转换方案

(function() {
    'use strict';

    let isProcessing = false;

    // 默认配置
    const defaultConfig = {
        showMarkdown: true,
        showWord: true,
        showPDF: true
    };

    let config = { ...defaultConfig };

    // ==================== 工具函数 ====================

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

    function getDocumentId() {
        // 从 URL 提取文档 ID
        // 格式: https://xxx.feishu.cn/docx/ABC123def 或 /docs/ABC123def
        const match = window.location.pathname.match(/\/(docx|docs)\/([^\/\?]+)/);
        return match ? match[2] : null;
    }

    // 生成请求 ID
    function generateRequestId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 12; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result + '-' + Date.now().toString(16);
    }

    // 获取 CSRF Token
    function getCsrfToken() {
        const match = document.cookie.match(/_csrf_token=([^;]+)/);
        return match ? match[1] : '';
    }

    // 生成 X-TT-LOGID
    function generateLogId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return '02' + timestamp + '0000000000000000000ffff09408b5f0175bd';
    }

    // 构建通用请求头
    function buildHeaders(requestId, csrfToken) {
        return {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'Request-Id': requestId,
            'X-Request-Id': requestId,
            'X-TT-LOGID': generateLogId(),
            'Context': `request_id=${requestId};os=windows;app_version=1.0.18.5345;os_version=10;platform=web`,
            'doc-biz': 'Lark',
            'doc-os': 'windows',
            'doc-platform': 'web',
            'x-lgw-biz': 'Lark',
            'x-lgw-os': 'windows',
            'x-lgw-platform': 'web',
            'x-lsc-biz': 'Lark',
            'x-lsc-os': 'windows',
            'x-lsc-platform': 'web'
        };
    }

    // 加载配置
    function loadConfig() {
        chrome.storage.sync.get(defaultConfig, (items) => {
            config = items;
            updateButtonsVisibility();
        });
    }

    // 保存配置
    function saveConfig(newConfig) {
        config = { ...config, ...newConfig };
        chrome.storage.sync.set(config);
        updateButtonsVisibility();
    }

    async function downloadFromFeishu(fileType, fileExtension) {
        // 使用飞书实际的导出流程：create -> result
        const docId = getDocumentId();
        if (!docId) {
            throw new Error('无法获取文档 ID');
        }

        const baseUrl = window.location.origin;

        // Step 1: 创建导出任务
        console.log('创建导出任务...');
        // URL 需要包含查询参数
        const createUrl = `${baseUrl}/space/api/export/create/?synced_block_host_token=${docId}&synced_block_host_type=22`;

        const requestId = generateRequestId();
        const csrfToken = getCsrfToken();

        try {
            const createResponse = await fetch(createUrl, {
                method: 'POST',
                credentials: 'include',
                headers: buildHeaders(requestId, csrfToken),
                body: JSON.stringify({
                    token: docId,
                    type: fileType,
                    file_extension: fileExtension,
                    event_source: '1',
                    need_comment: false
                })
            });

            if (!createResponse.ok) {
                throw new Error(`创建导出任务失败: ${createResponse.status}`);
            }

            const createData = await createResponse.json();
            console.log('导出任务创建响应:', createData);

            if (createData.code !== 0) {
                throw new Error(`创建导出任务失败: ${createData.msg}`);
            }

            // 提取任务 ticket
            const ticket = createData.data?.ticket;
            if (!ticket) {
                throw new Error('无法获取导出任务 ticket');
            }

            // Step 2: 轮询获取导出结果
            console.log('等待导出完成，ticket:', ticket);
            showProgress('⏳ 等待导出完成...', fileType);
            const resultUrl = `${baseUrl}/space/api/export/result/${ticket}?token=${docId}&type=${fileType}&synced_block_host_token=${docId}&synced_block_host_type=22`;

            let attempts = 0;
            const maxAttempts = 60; // 最多等待 60 秒

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒
                showProgress(`⏳ 等待导出 (${attempts + 1}s)...`, fileType);

                const resultRequestId = generateRequestId();
                const resultResponse = await fetch(resultUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: buildHeaders(resultRequestId, csrfToken)
                });

                if (!resultResponse.ok) {
                    throw new Error(`获取导出结果失败: ${resultResponse.status}`);
                }

                const resultData = await resultResponse.json();
                console.log('导出结果:', resultData);

                // 检查是否完成
                if (resultData.code === 0 && resultData.data && resultData.data.result) {
                    const result = resultData.data.result;
                    const status = result.job_status;

                    if (status === 0) {
                        // 任务完成（job_status: 0 表示成功）
                        const fileToken = result.file_token;
                        if (!fileToken) {
                            throw new Error('未找到文件 token');
                        }

                        // Step 3: 构建下载链接并下载文件
                        const downloadUrl = `${baseUrl}/space/api/box/stream/download/all/${fileToken}/`;
                        console.log('下载文件:', downloadUrl);
                        showProgress('📥 下载文件...', fileType);
                        const fileResponse = await fetch(downloadUrl, {
                            credentials: 'include'
                        });

                        if (!fileResponse.ok) {
                            throw new Error(`下载文件失败: ${fileResponse.status}`);
                        }

                        return { blob: await fileResponse.blob(), fileName: result.file_name, fileExtension };
                    } else if (status < 0) {
                        // 任务失败（负数表示失败）
                        throw new Error(`导出任务失败: ${result.job_error_msg || '未知错误'}`);
                    }
                    // status > 0 表示进行中，继续轮询
                }

                attempts++;
            }

            throw new Error('导出超时，请稍后重试');

        } catch (error) {
            console.error('导出流程失败:', error);
            throw error;
        }
    }

    async function downloadDocxFromFeishu() {
        showProgress('📤 创建导出任务...', 'markdown');

        try {
            const result = await downloadFromFeishu('docx', 'docx');
            console.log('成功下载 docx, 大小:', result.blob.size);
            return result.blob;
        } catch (error) {
            console.error('自动下载失败:', error);
            throw new Error('自动下载失败，请使用手动下载方式');
        }
    }

    async function convertDocxToMarkdown(docxBlob) {
        if (typeof mammoth === 'undefined') {
            throw new Error('mammoth.js 未加载，请检查依赖');
        }

        showProgress('📄 解析 docx...', 'markdown');
        const arrayBuffer = await docxBlob.arrayBuffer();
        const images = [];

        const result = await mammoth.convertToHtml({
            arrayBuffer: arrayBuffer,
            convertImage: mammoth.images.imgElement(function(image) {
                return image.read('base64').then(function(base64Data) {
                    const contentType = image.contentType || 'image/png';
                    const ext = (contentType.split('/')[1] || 'png').split('+')[0];
                    const validExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'png';
                    const index = images.length + 1;
                    const imgFilename = `image_${String(index).padStart(3, '0')}.${validExt}`;
                    images.push({ filename: imgFilename, base64: base64Data, contentType });
                    return { src: `./images/${imgFilename}` };
                });
            })
        });

        showProgress('📝 转换为 Markdown...', 'markdown');
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            emDelimiter: '*'
        });

        turndownService.addRule('images', {
            filter: 'img',
            replacement: function(content, node) {
                const alt = node.getAttribute('alt') || '';
                const src = node.getAttribute('src') || '';
                return src ? `\n![${alt}](${src})\n` : '';
            }
        });

        const markdown = turndownService.turndown(result.value);

        return { markdown, images, warnings: result.messages };
    }

    async function packageOutput(title, markdown, images) {
        showProgress('📦 打包文件...', 'markdown');
        const zip = new JSZip();
        zip.file(`${title}.md`, markdown);

        if (images.length > 0) {
            const imagesFolder = zip.folder('images');
            images.forEach(img => {
                const binaryData = atob(img.base64);
                const bytes = new Uint8Array(binaryData.length);
                for (let i = 0; i < binaryData.length; i++) {
                    bytes[i] = binaryData.charCodeAt(i);
                }
                imagesFolder.file(img.filename, bytes);
            });
        }

        return await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
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

    function createButtonContainer() {
        if (document.getElementById('feishu-export-container')) return;

        const container = document.createElement('div');
        container.id = 'feishu-export-container';
        container.style.cssText = `
            position: fixed; top: 80px; right: 20px; z-index: 10000;
            display: flex; flex-direction: column; gap: 10px;
        `;

        // Markdown 按钮
        const markdownBtn = createButton('feishu-markdown-btn', '📥 导出 Markdown', '#0066FF', () => handleExportMarkdown());
        container.appendChild(markdownBtn);

        // Word 按钮
        const wordBtn = createButton('feishu-word-btn', '📄 下载 Word', '#10B981', () => handleDownloadWord());
        container.appendChild(wordBtn);

        // PDF 按钮
        const pdfBtn = createButton('feishu-pdf-btn', '📕 下载 PDF', '#F59E0B', () => handleDownloadPDF());
        container.appendChild(pdfBtn);

        // 配置按钮
        const configBtn = createButton('feishu-config-btn', '⚙️', '#6B7280', () => toggleConfigPanel());
        configBtn.style.width = '40px';
        configBtn.style.padding = '10px';
        container.appendChild(configBtn);

        document.body.appendChild(container);
        updateButtonsVisibility();
    }

    function createButton(id, text, color, onClick) {
        const button = document.createElement('button');
        button.id = id;
        button.innerHTML = text;
        button.style.cssText = `
            padding: 10px 20px; background: ${color}; color: white; border: none;
            border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15); transition: all 0.3s;
            white-space: nowrap;
        `;

        button.addEventListener('mouseover', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        });

        button.addEventListener('mouseout', () => {
            button.style.transform = 'translateY(0)';
            button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        });

        button.addEventListener('click', onClick);
        return button;
    }

    function createConfigPanel() {
        if (document.getElementById('feishu-config-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'feishu-config-panel';
        panel.style.cssText = `
            position: fixed; top: 80px; right: 80px; z-index: 10001;
            background: white; border-radius: 8px; padding: 20px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            display: none; min-width: 200px;
        `;

        panel.innerHTML = `
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #1f2329;">显示选项</div>
            <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
                <input type="checkbox" id="config-markdown" ${config.showMarkdown ? 'checked' : ''}
                       style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                <span style="font-size: 14px; color: #1f2329;">导出 Markdown</span>
            </label>
            <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
                <input type="checkbox" id="config-word" ${config.showWord ? 'checked' : ''}
                       style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                <span style="font-size: 14px; color: #1f2329;">下载 Word</span>
            </label>
            <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
                <input type="checkbox" id="config-pdf" ${config.showPDF ? 'checked' : ''}
                       style="margin-right: 8px; width: 16px; height: 16px; cursor: pointer;">
                <span style="font-size: 14px; color: #1f2329;">下载 PDF</span>
            </label>
        `;

        document.body.appendChild(panel);

        // 添加事件监听
        document.getElementById('config-markdown').addEventListener('change', (e) => {
            saveConfig({ showMarkdown: e.target.checked });
        });
        document.getElementById('config-word').addEventListener('change', (e) => {
            saveConfig({ showWord: e.target.checked });
        });
        document.getElementById('config-pdf').addEventListener('change', (e) => {
            saveConfig({ showPDF: e.target.checked });
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('feishu-config-panel');
            const configBtn = document.getElementById('feishu-config-btn');
            if (panel && !panel.contains(e.target) && e.target !== configBtn) {
                panel.style.display = 'none';
            }
        });
    }

    function toggleConfigPanel() {
        const panel = document.getElementById('feishu-config-panel');
        if (!panel) {
            createConfigPanel();
            return;
        }
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    function updateButtonsVisibility() {
        const markdownBtn = document.getElementById('feishu-markdown-btn');
        const wordBtn = document.getElementById('feishu-word-btn');
        const pdfBtn = document.getElementById('feishu-pdf-btn');

        if (markdownBtn) markdownBtn.style.display = config.showMarkdown ? 'block' : 'none';
        if (wordBtn) wordBtn.style.display = config.showWord ? 'block' : 'none';
        if (pdfBtn) pdfBtn.style.display = config.showPDF ? 'block' : 'none';
    }

    function showProgress(message, buttonType) {
        const btnId = buttonType === 'word' ? 'feishu-word-btn' :
                      buttonType === 'pdf' ? 'feishu-pdf-btn' : 'feishu-markdown-btn';
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.innerHTML = message;
            btn.disabled = true;
        }
    }

    function resetButton(buttonType, originalText) {
        const btnId = buttonType === 'word' ? 'feishu-word-btn' :
                      buttonType === 'pdf' ? 'feishu-pdf-btn' : 'feishu-markdown-btn';
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.innerHTML = originalText || (buttonType === 'word' ? '📄 下载 Word' :
                                             buttonType === 'pdf' ? '📕 下载 PDF' : '📥 导出 Markdown');
            btn.disabled = false;
        }
    }

    // ==================== 导出功能 ====================

    async function handleExportMarkdown() {
        if (isProcessing) return;
        isProcessing = true;

        try {
            // 检查依赖
            if (typeof mammoth === 'undefined' || typeof JSZip === 'undefined' || typeof TurndownService === 'undefined') {
                alert('缺少依赖库，请确保已下载:\n- mammoth.browser.min.js\n- jszip.min.js\n- turndown.min.js');
                return;
            }

            const title = getDocTitle();

            // Step 1: 自动下载 docx
            const docxBlob = await downloadDocxFromFeishu();

            // Step 2: 转换为 Markdown
            const { markdown, images, warnings } = await convertDocxToMarkdown(docxBlob);
            console.log(`转换完成: ${images.length} 张图片`);
            if (warnings.length > 0) {
                console.warn('转换警告:', warnings);
            }

            // Step 3: 打包下载
            const zipBlob = await packageOutput(title, markdown, images);
            downloadFile(zipBlob, `${title}.zip`);

            showProgress('✅ 导出成功！', 'markdown');
            setTimeout(() => resetButton('markdown'), 2000);

        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败: ' + error.message + '\n\n请尝试手动下载:\n1. 点击飞书「···」→「导出」→「Word」\n2. 使用扩展弹窗转换');
            resetButton('markdown');
        } finally {
            isProcessing = false;
        }
    }

    async function handleDownloadWord() {
        if (isProcessing) return;
        isProcessing = true;

        try {
            const title = getDocTitle();
            showProgress('📤 创建导出任务...', 'word');

            const result = await downloadFromFeishu('docx', 'docx');
            downloadFile(result.blob, `${result.fileName || title}.${result.fileExtension}`);

            showProgress('✅ 下载成功！', 'word');
            setTimeout(() => resetButton('word'), 2000);

        } catch (error) {
            console.error('下载失败:', error);
            alert('下载 Word 失败: ' + error.message);
            resetButton('word');
        } finally {
            isProcessing = false;
        }
    }

    async function handleDownloadPDF() {
        if (isProcessing) return;
        isProcessing = true;

        try {
            const title = getDocTitle();
            showProgress('📤 创建导出任务...', 'pdf');

            const result = await downloadFromFeishu('pdf', 'pdf');
            downloadFile(result.blob, `${result.fileName || title}.${result.fileExtension}`);

            showProgress('✅ 下载成功！', 'pdf');
            setTimeout(() => resetButton('pdf'), 2000);

        } catch (error) {
            console.error('下载失败:', error);
            alert('下载 PDF 失败: ' + error.message);
            resetButton('pdf');
        } finally {
            isProcessing = false;
        }
    }

    // ==================== 初始化 ====================

    function init() {
        // 检查是否在飞书文档页面
        if (!window.location.pathname.match(/\/(docx|docs)\//)) {
            console.log('不在飞书文档页面，跳过初始化');
            return;
        }

        loadConfig();
        setTimeout(() => {
            createButtonContainer(); createConfigPanel();
            console.log('飞书文档转 Markdown v3.0 已加载（多功能模式）');
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
