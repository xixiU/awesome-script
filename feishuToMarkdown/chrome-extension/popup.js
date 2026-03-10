// 飞书文档转 Markdown - Popup 转换器
// 使用 mammoth.js (docx→HTML) + turndown.js (HTML→Markdown) 进行转换

document.addEventListener('DOMContentLoaded', function() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const convertBtn = document.getElementById('convertBtn');
    const statusEl = document.getElementById('status');

    // 配置选项
    const configMarkdown = document.getElementById('config-markdown');
    const configWord = document.getElementById('config-word');
    const configPDF = document.getElementById('config-pdf');
    const imageTypeOption = document.getElementById('image-type-option');
    const imageLocal = document.getElementById('image-local');
    const imageBase64 = document.getElementById('image-base64');

    let selectedFile = null;

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

    // 加载配置
    const config = getConfig();
    configMarkdown.checked = config.showMarkdown;
    configWord.checked = config.showWord;
    configPDF.checked = config.showPDF;

    if (config.imageType === 'base64') {
        imageBase64.checked = true;
    } else {
        imageLocal.checked = true;
    }

    updateImageTypeVisibility();

    // 更新图片类型选项可见性
    function updateImageTypeVisibility() {
        if (configMarkdown.checked) {
            imageTypeOption.classList.add('show');
        } else {
            imageTypeOption.classList.remove('show');
        }
    }

    // 保存配置
    function saveConfig() {
        const config = {
            showMarkdown: configMarkdown.checked,
            showWord: configWord.checked,
            showPDF: configPDF.checked,
            imageType: imageBase64.checked ? 'base64' : 'local'
        };
        localStorage.setItem('feishu-export-config', JSON.stringify(config));
        updateImageTypeVisibility();
    }

    configMarkdown.addEventListener('change', saveConfig);
    configWord.addEventListener('change', saveConfig);
    configPDF.addEventListener('change', saveConfig);
    imageLocal.addEventListener('change', saveConfig);
    imageBase64.addEventListener('change', saveConfig);

    // 检查依赖库是否加载
    function checkDependencies() {
        const missing = [];
        if (typeof mammoth === 'undefined') missing.push('mammoth.browser.min.js');
        if (typeof JSZip === 'undefined') missing.push('jszip.min.js');
        if (typeof TurndownService === 'undefined') missing.push('turndown.min.js');
        return missing;
    }

    // 点击区域选择文件
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    // 拖拽支持
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    dropZone.addEventListener('dragleave', (e) => {
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over');
        }
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.toLowerCase().endsWith('.docx') ||
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
            handleFile(file);
        } else {
            showStatus('❌ 请选择 .docx 格式的 Word 文件', 'error');
        }
    });

    function handleFile(file) {
        selectedFile = file;
        fileInfo.classList.add('show');
        fileName.textContent = '📄 ' + file.name;
        fileSize.textContent = formatFileSize(file.size);
        convertBtn.disabled = false;
        convertBtn.textContent = '开始转换';
        hideStatus();
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    convertBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        // 检查依赖
        const missing = checkDependencies();
        if (missing.length > 0) {
            showStatus(
                '❌ 缺少依赖库，请下载并放到 libs/ 目录：\n' + missing.join(', '),
                'error'
            );
            return;
        }

        convertBtn.disabled = true;
        convertBtn.textContent = '转换中...';

        try {
            const outputName = selectedFile.name.replace(/\.docx$/i, '');
            showStatus('⏳ 解析文档...', 'loading');
            const { markdown, images, warnings } = await convertDocxToMarkdown(selectedFile);

            showStatus(`⏳ 打包文件 (${images.length} 张图片)...`, 'loading');
            const blob = await packageOutput(outputName, markdown, images);

            triggerDownload(blob, `${outputName}.zip`);

            const msg = warnings.length > 0
                ? `✅ 转换完成！${images.length} 张图片\n⚠ 有 ${warnings.length} 条提示，请查看控制台`
                : `✅ 转换完成！${images.length} 张图片`;
            showStatus(msg, 'success');
            convertBtn.textContent = '再次转换';
        } catch (error) {
            console.error('Conversion failed:', error);
            showStatus('❌ 转换失败：' + error.message, 'error');
            convertBtn.textContent = '重试';
        } finally {
            convertBtn.disabled = false;
        }
    });

    async function convertDocxToMarkdown(file) {
        const arrayBuffer = await file.arrayBuffer();
        const images = [];

        // Step 1: 使用 mammoth.js 将 docx 转换为 HTML，同时提取图片
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

        const warnings = result.messages.filter(m => m.type === 'warning');
        if (warnings.length > 0) {
            console.warn('Mammoth conversion warnings:', warnings);
        }

        // Step 2: 使用 turndown.js 将 HTML 转换为 Markdown
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            emDelimiter: '*'
        });

        // 图片规则：使用提取后的路径
        turndownService.addRule('images', {
            filter: 'img',
            replacement: function(content, node) {
                const alt = node.getAttribute('alt') || '';
                const src = node.getAttribute('src') || '';
                return src ? `\n![${alt}](${src})\n` : '';
            }
        });

        // 代码块规则
        turndownService.addRule('preCode', {
            filter: function(node) {
                return node.nodeName === 'PRE' && node.querySelector('code');
            },
            replacement: function(content, node) {
                const code = node.querySelector('code');
                const lang = (code.className.match(/language-(\w+)/) || [])[1] || '';
                return `\n\`\`\`${lang}\n${code.textContent.trim()}\n\`\`\`\n`;
            }
        });

        const markdown = turndownService.turndown(result.value);

        return { markdown, images, warnings };
    }

    async function packageOutput(docName, markdown, images) {
        const zip = new JSZip();
        zip.file(`${docName}.md`, markdown);

        if (images.length > 0) {
            const imgFolder = zip.folder('images');
            for (const img of images) {
                // base64 转 Uint8Array
                const binaryStr = atob(img.base64);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }
                imgFolder.file(img.filename, bytes);
            }
        }

        return zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function showStatus(message, type) {
        statusEl.textContent = message;
        statusEl.className = `status ${type} show`;
    }

    function hideStatus() {
        statusEl.className = 'status';
    }
});
