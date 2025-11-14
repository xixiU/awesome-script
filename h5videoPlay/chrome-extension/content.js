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
        this.contentStreamSession = null; // 存储 content script 中的录制会话
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

        // 获取当前标签页的 tabId
        let tabId = null;
        try {
            // 尝试从 sender 获取（但这只能在回调中获取）
            // 所以我们先获取当前活动标签页
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs.length > 0) {
                tabId = tabs[0].id;
                console.log('[Extension字幕] 获取到当前标签页 ID:', tabId);
            }
        } catch (error) {
            console.warn('[Extension字幕] 无法获取标签页 ID:', error);
        }

        // 请求 background script 开始捕获，传递 tabId
        const result = await chrome.runtime.sendMessage({
            action: 'startCapture',
            tabId: tabId // 如果为 null，background 会尝试从 sender.tab.id 获取
        });

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

            // 检查是否是权限问题
            let errorMessage = result.error;
            if (result.error && result.error.includes('activeTab permission')) {
                errorMessage = '⚠️ 权限未激活！请先点击扩展图标激活权限，然后再按 S 键。';
            }

            this.sendToPage({
                type: 'subtitleError',
                message: errorMessage
            });
            return { success: false, error: result.error };
        }
    }

    async stop() {
        if (!this.isRunning) return { success: false };

        console.log('[Extension字幕] 停止服务...');

        // 停止 content script 中的录制
        if (this.contentStreamSession && this.contentStreamSession.isRunning) {
            this.contentStreamSession.isRunning = false;
            if (this.contentStreamSession.mediaRecorder && this.contentStreamSession.mediaRecorder.state === 'recording') {
                this.contentStreamSession.mediaRecorder.stop();
            }
            if (this.contentStreamSession.stream) {
                this.contentStreamSession.stream.getTracks().forEach(track => track.stop());
            }
            this.contentStreamSession = null;
            console.log('[Extension字幕] Content script 中的录制已停止');
        }

        // 停止 background 中的录制
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

    async processAudioBlob(audioBlob) {
        // 直接处理 Blob 对象（用于 content script 中的流处理）
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

/**
 * 在 content script 中处理流 ID
 */
function handleStreamInContentScript(streamId, sendResponse) {
    console.log('[Extension字幕] 在 content script 中使用流 ID 获取媒体流');

    // 检查是否已经在录制
    if (subtitleService.contentStreamSession && subtitleService.contentStreamSession.isRunning) {
        console.warn('[Extension字幕] 已经在录制中');
        sendResponse({ success: false, error: '已经在录制中' });
        return;
    }

    // 使用 getUserMedia 获取实际的媒体流
    navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
            }
        },
        video: false
    }).then((stream) => {
        console.log('[Extension字幕] ✅ 获取到音频流');

        // 创建 MediaRecorder
        const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 128000
        });

        const recordedChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
                console.log(`[Extension字幕] 📊 收到音频数据: ${event.data.size} bytes`);
            }
        };

        mediaRecorder.onstop = async () => {
            console.log('[Extension字幕] 录制停止，处理数据...');

            if (recordedChunks.length > 0) {
                const audioBlob = new Blob(recordedChunks, {
                    type: 'audio/webm;codecs=opus'
                });

                console.log(`[Extension字幕] 音频大小: ${(audioBlob.size / 1024).toFixed(2)} KB`);

                // 发送到后端处理
                await subtitleService.processAudioBlob(audioBlob);
            }

            // 继续下一轮录制
            if (subtitleService.contentStreamSession && subtitleService.contentStreamSession.isRunning) {
                setTimeout(() => {
                    if (mediaRecorder.state === 'inactive') {
                        recordedChunks.length = 0;
                        mediaRecorder.start(1000);
                    }
                }, 100);
            }
        };

        // 保存会话
        subtitleService.contentStreamSession = {
            stream,
            mediaRecorder,
            isRunning: true
        };

        // 开始录制
        mediaRecorder.start(1000); // 每秒触发 dataavailable
        console.log('[Extension字幕] ✅ MediaRecorder 已启动');

        // 5 秒后停止（模拟定时录制）
        setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, 5000);

        sendResponse({ success: true, message: '已在 content script 中设置流并开始录制' });
    }).catch((error) => {
        console.error('[Extension字幕] getUserMedia 失败:', error);
        sendResponse({
            success: false,
            error: `getUserMedia 失败: ${error.message}`
        });
    });
}

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

    // 处理流 ID（如果 Service Worker 不支持 getUserMedia）
    if (message.action === 'setupStream') {
        console.log('[Extension字幕] 收到流 ID，在 content script 中设置流:', message.streamId);
        handleStreamInContentScript(message.streamId, sendResponse);
        return true; // 异步响应
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

