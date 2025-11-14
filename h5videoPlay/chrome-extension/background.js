/**
 * Chrome 扩展后台脚本
 * 使用 chrome.tabCapture API 捕获标签页音频
 */

console.log('[H5Video Extension] 后台服务已启动');

// 存储活动的捕获会话
const captureSessions = new Map();

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] 收到消息:', message.action, 'from tab:', sender.tab?.id);

    switch (message.action) {
        case 'startCapture':
            startAudioCapture(sender.tab.id, sendResponse);
            return true; // 异步响应

        case 'stopCapture':
            stopAudioCapture(sender.tab.id, sendResponse);
            return true;

        case 'getCaptureStatus':
            const session = captureSessions.get(sender.tab.id);
            sendResponse({
                isCapturing: !!session,
                hasStream: !!(session?.stream)
            });
            return false;
    }
});

/**
 * 开始音频捕获
 */
async function startAudioCapture(tabId, sendResponse) {
    try {
        console.log('[Background] 开始捕获标签页音频, tabId:', tabId);

        // 检查是否已经在捕获
        if (captureSessions.has(tabId)) {
            console.warn('[Background] 标签页已在捕获中');
            sendResponse({ success: false, error: '已在捕获中' });
            return;
        }

        // 使用 chrome.tabCapture API 捕获音频
        chrome.tabCapture.capture({
            audio: true,
            video: false
        }, (stream) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] 捕获失败:', chrome.runtime.lastError);
                sendResponse({
                    success: false,
                    error: chrome.runtime.lastError.message
                });
                return;
            }

            if (!stream) {
                console.error('[Background] 未获取到流');
                sendResponse({ success: false, error: '未获取到音频流' });
                return;
            }

            console.log('[Background] ✅ 音频流捕获成功');

            // 创建 MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });

            const recordedChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                    console.log(`[Background] 📊 收到音频数据: ${event.data.size} bytes`);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log('[Background] 录制停止，处理数据...');

                if (recordedChunks.length > 0) {
                    const audioBlob = new Blob(recordedChunks, {
                        type: 'audio/webm;codecs=opus'
                    });

                    console.log(`[Background] 音频大小: ${(audioBlob.size / 1024).toFixed(2)} KB`);

                    // 发送音频数据到 content script
                    chrome.tabs.sendMessage(tabId, {
                        action: 'audioDataReady',
                        audioSize: audioBlob.size
                    });

                    // 将 Blob 转换为 ArrayBuffer 传递
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    chrome.tabs.sendMessage(tabId, {
                        action: 'processAudio',
                        audioData: Array.from(new Uint8Array(arrayBuffer)),
                        mimeType: 'audio/webm;codecs=opus'
                    });
                }

                // 继续下一轮录制
                const session = captureSessions.get(tabId);
                if (session && session.isRunning) {
                    setTimeout(() => {
                        if (mediaRecorder.state === 'inactive') {
                            recordedChunks.length = 0;
                            mediaRecorder.start(1000);
                        }
                    }, 100);
                }
            };

            // 保存会话
            const session = {
                stream,
                mediaRecorder,
                isRunning: true
            };
            captureSessions.set(tabId, session);

            // 开始录制
            mediaRecorder.start(1000); // 每秒触发 dataavailable
            console.log('[Background] ✅ MediaRecorder 已启动');

            // 5 秒后停止（模拟定时录制）
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, 5000);

            sendResponse({ success: true, message: '音频捕获已启动' });
        });

    } catch (error) {
        console.error('[Background] 捕获失败:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 停止音频捕获
 */
function stopAudioCapture(tabId, sendResponse) {
    console.log('[Background] 停止捕获, tabId:', tabId);

    const session = captureSessions.get(tabId);
    if (!session) {
        sendResponse({ success: false, error: '没有活动的捕获会话' });
        return;
    }

    session.isRunning = false;

    if (session.mediaRecorder && session.mediaRecorder.state === 'recording') {
        session.mediaRecorder.stop();
    }

    if (session.stream) {
        session.stream.getTracks().forEach(track => track.stop());
    }

    captureSessions.delete(tabId);

    console.log('[Background] ✅ 捕获已停止');
    sendResponse({ success: true, message: '音频捕获已停止' });
}

// 标签页关闭时清理
chrome.tabs.onRemoved.addListener((tabId) => {
    if (captureSessions.has(tabId)) {
        console.log('[Background] 标签页关闭，清理会话:', tabId);
        stopAudioCapture(tabId, () => { });
    }
});

