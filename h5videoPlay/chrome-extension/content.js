/**
 * Chrome 扩展内容脚本
 * 基于 html5videoPlay.js，使用 chrome.tabCapture API 实现字幕功能
 */

'use strict';

console.log('[H5Video Extension] 内容脚本已加载');

// 注入主脚本到页面（使用页面的 jQuery 和 Vue）
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function () {
    this.remove();
    console.log('[H5Video Extension] 主脚本已注入');
};
(document.head || document.documentElement).appendChild(script);

// ==================== 字幕服务（扩展版本）====================
class ExtensionSubtitleService {
    constructor() {
        this.isRunning = false;
        this.config = null;
        this.subtitles = [];
        this.loadConfig();
    }

    async loadConfig() {
        const result = await chrome.storage.sync.get({
            subtitle_serverUrl: 'http://localhost:8765',
            subtitle_targetLang: 'zh-CN',
            subtitle_autoTranslate: true
        });
        this.config = result;
        console.log('[Extension字幕] 配置已加载:', this.config);
    }

    async start() {
        if (this.isRunning) {
            console.log('[Extension字幕] 服务已在运行');
            return { success: false, message: '服务已在运行' };
        }

        console.log('[Extension字幕] 启动服务...');

        // 测试后端连接
        try {
            const response = await fetch(`${this.config.subtitle_serverUrl}/health`);
            if (!response.ok) {
                throw new Error(`后端服务不可用: ${response.status}`);
            }
            const data = await response.json();
            console.log('[Extension字幕] 后端服务状态:', data);
        } catch (error) {
            console.error('[Extension字幕] 后端连接失败:', error);
            this.sendToPage({
                type: 'subtitleError',
                message: '字幕服务连接失败，请检查后端是否运行在 ' + this.config.subtitle_serverUrl
            });
            return { success: false, error: error.message };
        }

        // 请求 background script 开始捕获
        const result = await chrome.runtime.sendMessage({ action: 'startCapture' });

        if (result.success) {
            this.isRunning = true;
            console.log('[Extension字幕] ✅ 服务已启动');
            this.sendToPage({
                type: 'subtitleStarted',
                message: '字幕识别已开启'
            });
            return { success: true };
        } else {
            console.error('[Extension字幕] 启动失败:', result.error);
            this.sendToPage({
                type: 'subtitleError',
                message: '启动失败: ' + result.error
            });
            return { success: false, error: result.error };
        }
    }

    async stop() {
        if (!this.isRunning) return { success: false };

        console.log('[Extension字幕] 停止服务...');

        const result = await chrome.runtime.sendMessage({ action: 'stopCapture' });

        this.isRunning = false;
        this.subtitles = [];

        this.sendToPage({
            type: 'subtitleStopped',
            message: '字幕识别已关闭'
        });

        console.log('[Extension字幕] ✅ 服务已停止');
        return { success: true };
    }

    async toggle() {
        if (this.isRunning) {
            return await this.stop();
        } else {
            return await this.start();
        }
    }

    async processAudioData(audioData, mimeType) {
        console.log('[Extension字幕] 处理音频数据:', audioData.length, 'bytes');

        // 将数组转换回 Blob
        const audioBlob = new Blob([new Uint8Array(audioData)], { type: mimeType });
        console.log(`[Extension字幕] 音频大小: ${(audioBlob.size / 1024).toFixed(2)} KB`);

        // 发送到后端
        await this.sendAudioToBackend(audioBlob);
    }

    async sendAudioToBackend(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        if (this.config.subtitle_autoTranslate) {
            formData.append('translate_to', this.config.subtitle_targetLang);
        }

        console.log('[Extension字幕] 发送音频到后端:', {
            url: `${this.config.subtitle_serverUrl}/transcribe`,
            size: `${(audioBlob.size / 1024).toFixed(2)} KB`
        });

        try {
            const startTime = Date.now();
            const response = await fetch(`${this.config.subtitle_serverUrl}/transcribe`, {
                method: 'POST',
                body: formData
            });

            const elapsed = Date.now() - startTime;
            console.log(`[Extension字幕] 请求耗时: ${elapsed}ms, 状态: ${response.status}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('[Extension字幕] 后端响应:', data);

            if (data.success && data.subtitles && data.subtitles.length > 0) {
                console.log(`[Extension字幕] ✅ 获取 ${data.subtitles.length} 条字幕`);

                // 发送字幕到页面显示
                this.sendToPage({
                    type: 'newSubtitles',
                    subtitles: data.subtitles
                });
            }
        } catch (error) {
            console.error('[Extension字幕] ❌ 服务连接失败:', error);
            this.sendToPage({
                type: 'subtitleError',
                message: '字幕服务连接失败: ' + error.message
            });
        }
    }

    sendToPage(message) {
        window.postMessage({
            source: 'h5video-extension',
            ...message
        }, '*');
    }
}

// 创建字幕服务实例
const subtitleService = new ExtensionSubtitleService();

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processAudio') {
        subtitleService.processAudioData(message.audioData, message.mimeType);
        sendResponse({ success: true });
        return false;
    }

    if (message.action === 'audioDataReady') {
        console.log('[Extension字幕] 音频数据就绪:', message.audioSize, 'bytes');
        sendResponse({ success: true });
        return false;
    }
});

// 监听页面消息
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'h5video-page') return;

    const { type, data } = event.data;

    switch (type) {
        case 'toggleSubtitle':
            const result = await subtitleService.toggle();
            console.log('[Extension字幕] 切换结果:', result);
            break;

        case 'updateConfig':
            await chrome.storage.sync.set(data);
            await subtitleService.loadConfig();
            console.log('[Extension字幕] 配置已更新');
            break;
    }
});

console.log('[H5Video Extension] 内容脚本初始化完成');

