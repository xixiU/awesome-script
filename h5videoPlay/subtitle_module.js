// ==UserScript==
// @name       HTML5视频字幕翻译模块
// @version    1.0.0
// @description 为HTML5视频添加实时字幕识别和翻译功能
// @require    https://cdn.jsdelivr.net/npm/jquery@3.6.4/dist/jquery.min.js
// @grant      GM_xmlhttpRequest
// @grant      GM_setValue
// @grant      GM_getValue
// @grant      unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置管理 ====================
    const SubtitleConfig = {
        // 默认配置
        defaults: {
            enabled: false,
            serverUrl: 'http://localhost:8765',
            targetLanguage: 'zh-CN',
            autoTranslate: true,
            fontSize: 20,
            fontColor: '#FFFFFF',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            position: 'bottom',
            captureInterval: 5  // 每5秒捕获一次音频
        },

        // 加载配置
        load() {
            const saved = GM_getValue('subtitle_config', '{}');
            try {
                const config = JSON.parse(saved);
                return { ...this.defaults, ...config };
            } catch (e) {
                return { ...this.defaults };
            }
        },

        // 保存配置
        save(config) {
            GM_setValue('subtitle_config', JSON.stringify(config));
        },

        // 获取单个配置
        get(key) {
            const config = this.load();
            return config[key];
        },

        // 设置单个配置
        set(key, value) {
            const config = this.load();
            config[key] = value;
            this.save(config);
        }
    };

    // ==================== 字幕服务类 ====================
    class SubtitleService {
        constructor(video, config) {
            this.video = video;
            this.config = config;
            this.isRunning = false;
            this.audioContext = null;
            this.mediaStreamSource = null;
            this.mediaRecorder = null;
            this.recordedChunks = [];
            this.subtitles = [];
            this.currentSubtitleIndex = 0;
        }

        /**
         * 初始化音频捕获
         */
        async initAudioCapture() {
            try {
                // 创建音频上下文
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();

                // 从视频元素捕获音频
                const stream = this.video.captureStream
                    ? this.video.captureStream()
                    : this.video.mozCaptureStream();

                if (!stream) {
                    throw new Error('浏览器不支持音频捕获');
                }

                this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);

                // 创建 MediaRecorder
                this.mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm;codecs=opus'
                });

                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.recordedChunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = async () => {
                    await this.processRecordedAudio();
                };

                console.log('[字幕服务] 音频捕获初始化成功');
                return true;
            } catch (error) {
                console.error('[字幕服务] 音频捕获初始化失败:', error);
                return false;
            }
        }

        /**
         * 开始录制音频
         */
        startRecording() {
            if (!this.mediaRecorder) {
                console.error('[字幕服务] MediaRecorder 未初始化');
                return;
            }

            this.recordedChunks = [];
            this.mediaRecorder.start();
            console.log('[字幕服务] 开始录制音频');

            // 定时停止录制
            setTimeout(() => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.stop();
                }
            }, this.config.captureInterval * 1000);
        }

        /**
         * 处理录制的音频
         */
        async processRecordedAudio() {
            if (this.recordedChunks.length === 0) {
                console.log('[字幕服务] 没有音频数据');
                // 继续下一轮录制
                if (this.isRunning) {
                    this.startRecording();
                }
                return;
            }

            console.log('[字幕服务] 处理音频数据...');

            // 创建音频 Blob
            const audioBlob = new Blob(this.recordedChunks, {
                type: 'audio/webm;codecs=opus'
            });

            // 发送到后端处理
            await this.sendAudioToBackend(audioBlob);

            // 继续下一轮录制
            if (this.isRunning) {
                this.startRecording();
            }
        }

        /**
         * 发送音频到后端
         */
        async sendAudioToBackend(audioBlob) {
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');

            if (this.config.autoTranslate) {
                formData.append('translate_to', this.config.targetLanguage);
            }

            try {
                const response = await fetch(
                    `${this.config.serverUrl}/transcribe`,
                    {
                        method: 'POST',
                        body: formData
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (data.success && data.subtitles && data.subtitles.length > 0) {
                    this.addSubtitles(data.subtitles);
                    console.log(`[字幕服务] 获取到 ${data.subtitles.length} 条字幕`);
                }
            } catch (error) {
                console.error('[字幕服务] 发送音频失败:', error);
                this.showError('字幕服务连接失败，请检查后端服务是否运行');
            }
        }

        /**
         * 添加字幕
         */
        addSubtitles(newSubtitles) {
            // 调整时间戳（相对于当前视频时间）
            const currentTime = this.video.currentTime;
            const adjustedSubtitles = newSubtitles.map(sub => ({
                ...sub,
                start: currentTime + sub.start,
                end: currentTime + sub.end
            }));

            this.subtitles.push(...adjustedSubtitles);

            // 按时间排序
            this.subtitles.sort((a, b) => a.start - b.start);
        }

        /**
         * 获取当前应该显示的字幕
         */
        getCurrentSubtitle() {
            const currentTime = this.video.currentTime;

            for (const subtitle of this.subtitles) {
                if (currentTime >= subtitle.start && currentTime <= subtitle.end) {
                    return subtitle.text;
                }
            }

            return '';
        }

        /**
         * 启动服务
         */
        async start() {
            if (this.isRunning) {
                console.log('[字幕服务] 服务已在运行');
                return;
            }

            console.log('[字幕服务] 启动服务...');

            // 初始化音频捕获
            const success = await this.initAudioCapture();
            if (!success) {
                this.showError('无法初始化音频捕获');
                return;
            }

            this.isRunning = true;
            this.startRecording();

            console.log('[字幕服务] 服务已启动');
        }

        /**
         * 停止服务
         */
        stop() {
            if (!this.isRunning) {
                return;
            }

            console.log('[字幕服务] 停止服务...');

            this.isRunning = false;

            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }

            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }

            this.subtitles = [];
            console.log('[字幕服务] 服务已停止');
        }

        /**
         * 显示错误信息
         */
        showError(message) {
            console.error('[字幕服务]', message);
            // 可以在这里添加 UI 提示
        }
    }

    // ==================== 字幕显示UI ====================
    class SubtitleUI {
        constructor(video, service, config) {
            this.video = video;
            this.service = service;
            this.config = config;
            this.container = null;
            this.subtitleElement = null;
            this.controlPanel = null;
            this.updateInterval = null;
        }

        /**
         * 创建UI
         */
        create() {
            // 创建容器
            this.container = document.createElement('div');
            this.container.id = 'subtitle-container';
            this.container.style.cssText = `
                position: absolute;
                left: 0;
                right: 0;
                ${this.config.position === 'top' ? 'top: 10%' : 'bottom: 10%'};
                text-align: center;
                pointer-events: none;
                z-index: 9999;
                font-family: Arial, sans-serif;
            `;

            // 创建字幕元素
            this.subtitleElement = document.createElement('div');
            this.subtitleElement.style.cssText = `
                display: inline-block;
                padding: 8px 16px;
                font-size: ${this.config.fontSize}px;
                color: ${this.config.fontColor};
                background: ${this.config.backgroundColor};
                border-radius: 4px;
                max-width: 80%;
                word-wrap: break-word;
                line-height: 1.4;
            `;

            this.container.appendChild(this.subtitleElement);

            // 将容器添加到视频父元素
            const videoParent = this.video.parentElement;
            if (videoParent.style.position === '' || videoParent.style.position === 'static') {
                videoParent.style.position = 'relative';
            }
            videoParent.appendChild(this.container);

            // 创建控制面板
            this.createControlPanel();

            // 开始更新字幕
            this.startUpdating();
        }

        /**
         * 创建控制面板
         */
        createControlPanel() {
            this.controlPanel = document.createElement('div');
            this.controlPanel.id = 'subtitle-control-panel';
            this.controlPanel.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                background: white;
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 10001;
                font-family: Arial, sans-serif;
                min-width: 200px;
            `;

            this.controlPanel.innerHTML = `
                <div style="margin-bottom: 10px; font-weight: bold; color: #333;">
                    📝 字幕控制
                </div>
                <button id="subtitle-toggle-btn" style="
                    width: 100%;
                    padding: 8px;
                    margin-bottom: 8px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">停止字幕</button>
                <button id="subtitle-config-btn" style="
                    width: 100%;
                    padding: 8px;
                    background: #2196F3;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">配置</button>
                <div style="margin-top: 10px; font-size: 12px; color: #666;">
                    状态: <span id="subtitle-status" style="color: #4CAF50;">运行中</span>
                </div>
            `;

            document.body.appendChild(this.controlPanel);

            // 绑定事件
            const toggleBtn = document.getElementById('subtitle-toggle-btn');
            const configBtn = document.getElementById('subtitle-config-btn');

            toggleBtn.addEventListener('click', () => {
                if (this.service.isRunning) {
                    this.service.stop();
                    this.stopUpdating();
                    toggleBtn.textContent = '启动字幕';
                    toggleBtn.style.background = '#4CAF50';
                    document.getElementById('subtitle-status').textContent = '已停止';
                    document.getElementById('subtitle-status').style.color = '#f44336';
                } else {
                    this.service.start();
                    this.startUpdating();
                    toggleBtn.textContent = '停止字幕';
                    toggleBtn.style.background = '#f44336';
                    document.getElementById('subtitle-status').textContent = '运行中';
                    document.getElementById('subtitle-status').style.color = '#4CAF50';
                }
            });

            configBtn.addEventListener('click', () => {
                this.showConfigDialog();
            });
        }

        /**
         * 显示配置对话框
         */
        showConfigDialog() {
            // 这里可以集成 ConfigManager 或创建简单的配置界面
            const serverUrl = prompt('后端服务地址:', this.config.serverUrl);
            if (serverUrl) {
                SubtitleConfig.set('serverUrl', serverUrl);
                this.config.serverUrl = serverUrl;
            }

            const targetLang = prompt('目标语言 (zh-CN, en, ja等):', this.config.targetLanguage);
            if (targetLang) {
                SubtitleConfig.set('targetLanguage', targetLang);
                this.config.targetLanguage = targetLang;
            }

            alert('配置已保存！请重新启动字幕服务生效。');
        }

        /**
         * 开始更新字幕显示
         */
        startUpdating() {
            this.updateInterval = setInterval(() => {
                const currentSubtitle = this.service.getCurrentSubtitle();
                if (currentSubtitle) {
                    this.subtitleElement.textContent = currentSubtitle;
                    this.subtitleElement.style.display = 'inline-block';
                } else {
                    this.subtitleElement.style.display = 'none';
                }
            }, 100);  // 每100ms更新一次
        }

        /**
         * 停止更新字幕显示
         */
        stopUpdating() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            this.subtitleElement.style.display = 'none';
        }

        /**
         * 销毁UI
         */
        destroy() {
            this.stopUpdating();

            if (this.container) {
                this.container.remove();
                this.container = null;
            }

            if (this.controlPanel) {
                this.controlPanel.remove();
                this.controlPanel = null;
            }
        }
    }

    // ==================== 主初始化函数 ====================
    function initSubtitleModule(video) {
        console.log('[字幕模块] 初始化字幕功能...');

        // 加载配置
        const config = SubtitleConfig.load();

        // 创建服务和UI
        const service = new SubtitleService(video, config);
        const ui = new SubtitleUI(video, service, config);

        // 创建UI
        ui.create();

        // 如果配置为自动启动，则启动服务
        if (config.enabled) {
            service.start();
        }

        console.log('[字幕模块] 字幕功能初始化完成');

        return { service, ui };
    }

    // 导出到全局
    unsafeWindow.SubtitleModule = {
        init: initSubtitleModule,
        SubtitleConfig: SubtitleConfig,
        SubtitleService: SubtitleService,
        SubtitleUI: SubtitleUI
    };

    console.log('[字幕模块] 模块已加载');
})();

