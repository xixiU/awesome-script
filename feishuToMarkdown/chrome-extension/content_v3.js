// 飞书文档转 Markdown - Content Script v3.0
// 自动下载 docx + mammoth.js 转换方案

(function() {
    'use strict';

    let isProcessing = false;

    // 默认配置
    const defaultConfig = {
        showMarkdown: true,
        showWord: true,
        showPDF: true,
        imageType: 'local'
    };

    // 从 localStorage 读取配置
    function getConfig() {
        const saved = localStorage.getItem('feishu-export-config');
        return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
    }

    let config = getConfig();

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
        config = getConfig();
        console.log('配置已加载:', config);
        updateButtonsVisibility();
    }

    function saveConfig(newConfig) {
        config = { ...config, ...newConfig };
        localStorage.setItem('feishu-export-config', JSON.stringify(config));
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
        const useBase64 = config.imageType === 'base64';

        const result = await mammoth.convertToHtml({
            arrayBuffer: arrayBuffer,
            convertImage: mammoth.images.imgElement(function(image) {
                return image.read('base64').then(function(base64Data) {
                    const contentType = image.contentType || 'image/png';
                    const ext = (contentType.split('/')[1] || 'png').split('+')[0];
                    const validExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) ? ext : 'png';
                    const index = images.length + 1;
                    const imgFilename = `image_${String(index).padStart(3, '0')}.${validExt}`;

                    if (useBase64) {
                        // Base64 编码：直接嵌入 markdown，不保存到 images 数组
                        return { src: `data:${contentType};base64,${base64Data}` };
                    } else {
                        // 本地图片：保存到 images 数组，使用相对路径
                        images.push({ filename: imgFilename, base64: base64Data, contentType });
                        return { src: `./images/${imgFilename}` };
                    }
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

    function createExportButton() {
        if (document.getElementById('feishu-export-container')) return;

        // 从存储中加载位置
        const savedPosition = JSON.parse(localStorage.getItem('feishu-export-position') || '{"top": 80, "right": 20}');

        const container = document.createElement('div');
        container.id = 'feishu-export-container';
        container.style.cssText = `
            position: fixed; top: ${savedPosition.top}px; right: ${savedPosition.right}px; z-index: 10000;
            cursor: move;
        `;

        const mainBtn = document.createElement('button');
        mainBtn.id = 'feishu-export-btn';
        mainBtn.innerHTML = '📥';
        mainBtn.style.cssText = `
            padding: 8px 12px; background: #0066FF; color: white; border: none;
            border-radius: 6px; cursor: move; font-size: 16px; font-weight: 500;
            box-shadow: 0 2px 8px rgba(0,102,255,0.3); transition: all 0.3s;
        `;

        const menu = document.createElement('div');
        menu.id = 'feishu-export-menu';
        menu.style.cssText = `
            position: absolute; top: 45px; right: 0;
            background: white; border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
            min-width: 160px; display: none; overflow: hidden;
        `;

        container.appendChild(mainBtn);
        container.appendChild(menu);
        document.body.appendChild(container);

        // 拖动功能
        let isDragging = false;
        let startX, startY, startRight, startTop;

        mainBtn.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startRight = parseInt(container.style.right);
            startTop = parseInt(container.style.top);
            mainBtn.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaX = startX - e.clientX;
            const deltaY = e.clientY - startY;
            const newRight = startRight + deltaX;
            const newTop = startTop + deltaY;

            // 限制在视口内
            const maxRight = window.innerWidth - container.offsetWidth;
            const maxTop = window.innerHeight - container.offsetHeight;

            container.style.right = Math.max(0, Math.min(newRight, maxRight)) + 'px';
            container.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                mainBtn.style.cursor = 'move';
                // 保存位置
                const position = {
                    top: parseInt(container.style.top),
                    right: parseInt(container.style.right)
                };
                localStorage.setItem('feishu-export-position', JSON.stringify(position));
            }
        });

        let hideTimer = null;

        container.addEventListener('mouseenter', () => {
            if (!isDragging) {
                clearTimeout(hideTimer);
                updateMenu();
                menu.style.display = 'block';
            }
        });

        container.addEventListener('mouseleave', () => {
            hideTimer = setTimeout(() => { menu.style.display = 'none'; }, 200);
        });

        mainBtn.addEventListener('mouseover', () => {
            if (!isDragging) {
                mainBtn.style.background = '#0052CC';
                mainBtn.style.transform = 'translateY(-2px)';
            }
        });

        mainBtn.addEventListener('mouseout', () => {
            if (!isDragging) {
                mainBtn.style.background = '#0066FF';
                mainBtn.style.transform = 'translateY(0)';
            }
        });
    }

    function updateMenu() {
        const menu = document.getElementById('feishu-export-menu');
        if (!menu) return;
        menu.innerHTML = '';
        if (config.showMarkdown) menu.appendChild(createMenuItem('📝 导出 Markdown', handleExportMarkdown));
        if (config.showWord) menu.appendChild(createMenuItem('📄 下载 Word', handleDownloadWord));
        if (config.showPDF) menu.appendChild(createMenuItem('📕 下载 PDF', handleDownloadPDF));
    }

    function createMenuItem(text, onClick) {
        const item = document.createElement('div');
        item.textContent = text;
        item.style.cssText = `
            padding: 12px 16px; cursor: pointer; font-size: 14px; color: #1f2329;
            transition: background 0.2s; border-bottom: 1px solid #f0f0f0;
        `;
        item.addEventListener('mouseenter', () => { item.style.background = '#f7f8fa'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'white'; });
        item.addEventListener('click', () => {
            const menu = document.getElementById('feishu-export-menu');
            if (menu) menu.style.display = 'none';
            onClick();
        });
        return item;
    }

    function showProgress(message, buttonType) {
        const btn = document.getElementById('feishu-export-btn');
        if (btn) { btn.innerHTML = message; btn.disabled = true; btn.style.cursor = 'not-allowed'; }
    }

    function resetButton(buttonType) {
        const btn = document.getElementById('feishu-export-btn');
        if (btn) { btn.innerHTML = '📥 导出'; btn.disabled = false; btn.style.cursor = 'pointer'; }
    }

    function updateButtonsVisibility() {}

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

            // 重新读取最新配置
            config = getConfig();
            const docxBlob = await downloadDocxFromFeishu();

            // Step 2: 转换为 Markdown
            const { markdown, images, warnings } = await convertDocxToMarkdown(docxBlob);
            console.log(`转换完成: ${images.length} 张图片`);
            console.log('当前配置 imageType:', config.imageType);
            if (warnings.length > 0) {
                console.warn('转换警告:', warnings);
            }

            // Step 3: 根据图片类型决定输出方式
            if (config.imageType === 'base64') {
                // Base64 模式：直接下载 .md 文件
                console.log('使用 Base64 模式，下载 .md 文件');
                const mdBlob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
                downloadFile(mdBlob, `${title}.md`);
            } else {
                // 本地图片模式：打包为 zip
                console.log('使用本地图片模式，打包 ZIP，图片数量:', images.length);
                const zipBlob = await packageOutput(title, markdown, images);
                downloadFile(zipBlob, `${title}.zip`);
            }

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
            showProgress('📤 创建任务...', 'word');

            const result = await downloadFromFeishu('docx', 'docx');

            showProgress('💾 自动下载中...', 'word');
            downloadFile(result.blob, `${result.fileName || title}.${result.fileExtension}`);

            showProgress('✅ 已下载！', 'word');
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
            showProgress('📤 创建任务...', 'pdf');

            const result = await downloadFromFeishu('docx', 'pdf');

            showProgress('💾 自动下载中...', 'pdf');
            downloadFile(result.blob, `${result.fileName || title}.${result.fileExtension}`);

            showProgress('✅ 已下载！', 'pdf');
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
            createExportButton();
            console.log('飞书文档转 Markdown v3.0 已加载（多功能模式）');
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
