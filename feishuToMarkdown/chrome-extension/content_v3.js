// 飞书文档转 Markdown - Content Script v3.0
// 自动下载 docx + mammoth.js 转换方案

(function() {
    'use strict';

    let isProcessing = false;

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

    async function findDownloadAPI() {
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
                    type: 'docx',
                    file_extension: 'docx',
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
            showProgress('⏳ 等待导出完成...');
            const resultUrl = `${baseUrl}/space/api/export/result/${ticket}?token=${docId}&type=docx&synced_block_host_token=${docId}&synced_block_host_type=22`;

            let attempts = 0;
            const maxAttempts = 60; // 最多等待 60 秒

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒
                showProgress(`⏳ 等待导出 (${attempts + 1}s)...`);

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
                        showProgress('📥 下载文件...');
                        const fileResponse = await fetch(downloadUrl, {
                            credentials: 'include'
                        });

                        if (!fileResponse.ok) {
                            throw new Error(`下载文件失败: ${fileResponse.status}`);
                        }

                        return await fileResponse.blob();
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
        showProgress('📤 创建导出任务...');

        try {
            const docxBlob = await findDownloadAPI();
            console.log('成功下载 docx, 大小:', docxBlob.size);
            return docxBlob;
        } catch (error) {
            console.error('自动下载失败:', error);
            throw new Error('自动下载失败，请使用手动下载方式');
        }
    }

    async function convertDocxToMarkdown(docxBlob) {
        if (typeof mammoth === 'undefined') {
            throw new Error('mammoth.js 未加载，请检查依赖');
        }

        showProgress('📄 解析 docx...');
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

        showProgress('📝 转换为 Markdown...');
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
        showProgress('📦 打包文件...');
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
        if (document.getElementById('feishu-export-btn')) return;

        const button = document.createElement('button');
        button.id = 'feishu-export-btn';
        button.innerHTML = '📥 导出 Markdown';
        button.style.cssText = `
            position: fixed; top: 80px; right: 20px; z-index: 10000;
            padding: 10px 20px; background: #0066FF; color: white; border: none;
            border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;
            box-shadow: 0 2px 8px rgba(0,102,255,0.3); transition: all 0.3s;
        `;

        button.addEventListener('mouseover', () => {
            button.style.background = '#0052CC';
            button.style.transform = 'translateY(-2px)';
        });

        button.addEventListener('mouseout', () => {
            button.style.background = '#0066FF';
            button.style.transform = 'translateY(0)';
        });

        button.addEventListener('click', handleExport);
        document.body.appendChild(button);
    }

    function showProgress(message) {
        const btn = document.getElementById('feishu-export-btn');
        if (btn) {
            btn.innerHTML = message;
            btn.disabled = true;
        }
    }

    function resetButton() {
        const btn = document.getElementById('feishu-export-btn');
        if (btn) {
            btn.innerHTML = '📥 导出 Markdown';
            btn.disabled = false;
        }
    }

    // ==================== 导出功能 ====================

    async function handleExport() {
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

            showProgress('✅ 导出成功！');
            setTimeout(() => resetButton(), 2000);

        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败: ' + error.message + '\n\n请尝试手动下载:\n1. 点击飞书「···」→「导出」→「Word」\n2. 使用扩展弹窗转换');
            resetButton();
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

        setTimeout(() => {
            createExportButton();
            console.log('飞书文档转 Markdown v3.0 已加载（自动下载模式）');
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
