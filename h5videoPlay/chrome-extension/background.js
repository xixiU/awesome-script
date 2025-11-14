/**
 * Chrome 扩展后台脚本
 * 使用 chrome.tabCapture API 捕获标签页音频
 */

console.log('[H5Video Extension] 后台服务已启动');

// 检查 API 可用性
if (!chrome.tabCapture) {
    console.error('[Background] ❌ chrome.tabCapture API 不可用！');
} else {
    console.log('[Background] ✅ chrome.tabCapture API 可用');
    // Manifest V3 使用 getMediaStreamId，而不是 capture
    if (typeof chrome.tabCapture.getMediaStreamId === 'function') {
        console.log('[Background] ✅ chrome.tabCapture.getMediaStreamId 方法可用');
    } else if (typeof chrome.tabCapture.capture === 'function') {
        console.log('[Background] ✅ chrome.tabCapture.capture 方法可用（旧版）');
    } else {
        console.error('[Background] ❌ 找不到可用的捕获方法');
        console.log('[Background] chrome.tabCapture 可用方法:', Object.keys(chrome.tabCapture));
    }
}

// 存储活动的捕获会话
const captureSessions = new Map();

/**
 * 处理捕获到的音频流
 */
function handleStream(stream, tabId, sendResponse) {
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
            }).catch(err => {
                console.warn('[Background] 发送消息失败:', err);
            });

            // 将 Blob 转换为 ArrayBuffer 传递
            const arrayBuffer = await audioBlob.arrayBuffer();
            chrome.tabs.sendMessage(tabId, {
                action: 'processAudio',
                audioData: Array.from(new Uint8Array(arrayBuffer)),
                mimeType: 'audio/webm;codecs=opus'
            }).catch(err => {
                console.warn('[Background] 发送音频数据失败:', err);
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
}

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] 收到消息:', message.action, 'from tab:', sender.tab?.id, 'message.tabId:', message.tabId);

    switch (message.action) {
        case 'startCapture':
            // 优先使用消息中传递的 tabId，否则使用 sender.tab.id
            const tabId = message.tabId || sender.tab?.id;
            if (!tabId) {
                console.error('[Background] 无法获取标签页 ID');
                sendResponse({ success: false, error: '无法获取标签页 ID' });
                return false;
            }
            startAudioCapture(tabId, sendResponse);
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
        // 注意：tabCapture.capture 会捕获当前活动标签页
        // 确保目标标签页是活动状态（通常已经是，因为用户正在交互）
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] 获取标签页失败:', chrome.runtime.lastError);
                sendResponse({
                    success: false,
                    error: chrome.runtime.lastError.message
                });
                return;
            }

            if (!tab) {
                console.error('[Background] 标签页不存在');
                sendResponse({ success: false, error: '标签页不存在' });
                return;
            }

            console.log('[Background] 准备捕获标签页:', tab.url, 'active:', tab.active);

            // 检查是否是 Chrome 内部页面（无法捕获）
            if (tab.url && (tab.url.startsWith('chrome://') ||
                tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('edge://') ||
                tab.url.startsWith('about:'))) {
                console.error('[Background] Chrome 内部页面无法捕获:', tab.url);
                sendResponse({
                    success: false,
                    error: 'Chrome 内部页面无法捕获音频。请在普通网页（如 YouTube、B站）上使用。'
                });
                return;
            }

            // 检查权限：确保我们有访问该标签页的权限
            // 即使有 tabs 权限，某些情况下仍需要确保标签页可访问
            console.log('[Background] 检查权限... tabId:', tabId, 'url:', tab.url);

            // 尝试访问标签页以确保权限（这可能会激活 activeTab）
            // 通过执行一个简单的脚本（即使不执行任何操作）来激活权限
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // 空函数，只是为了激活 activeTab 权限
                    console.log('[Extension] 权限已激活');
                }
            }).then(() => {
                console.log('[Background] ✅ 通过 scripting.executeScript 激活权限');
                // 继续执行捕获逻辑
                continueCapture();
            }).catch((scriptError) => {
                console.warn('[Background] 无法通过 scripting 激活权限:', scriptError);
                // 继续尝试，可能仍然可以工作
                continueCapture();
            });

            function continueCapture() {

                // 确保标签页是活动的（提高权限激活的成功率）
                if (!tab.active) {
                    console.log('[Background] 标签页未激活，尝试激活...');
                    chrome.tabs.update(tabId, { active: true }, () => {
                        if (chrome.runtime.lastError) {
                            console.warn('[Background] 无法激活标签页:', chrome.runtime.lastError);
                        } else {
                            console.log('[Background] 标签页已激活');
                        }
                    });
                }

                // Manifest V3 使用 getMediaStreamId 方法
                if (!chrome.tabCapture) {
                    sendResponse({ success: false, error: 'chrome.tabCapture API 不可用' });
                    return;
                }

                // 方法1: 尝试使用 getMediaStreamId (Manifest V3 推荐)
                if (typeof chrome.tabCapture.getMediaStreamId === 'function') {
                    console.log('[Background] 使用 getMediaStreamId 方法, tabId:', tabId, 'active:', tab.active);

                    // 始终传递 targetTabId，因为我们有 tabs 权限
                    // 这样可以避免 activeTab 权限的激活问题
                    const options = { targetTabId: tabId };

                    const callback = (streamId) => {
                        if (chrome.runtime.lastError) {
                            console.error('[Background] 获取流 ID 失败:', chrome.runtime.lastError);
                            sendResponse({
                                success: false,
                                error: chrome.runtime.lastError.message
                            });
                            return;
                        }

                        if (!streamId) {
                            console.error('[Background] 未获取到流 ID');
                            sendResponse({ success: false, error: '未获取到流 ID' });
                            return;
                        }

                        console.log('[Background] ✅ 获取到流 ID:', streamId);

                        // 检查 navigator.mediaDevices 是否可用（Service Worker 中可能不可用）
                        if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                            // Service Worker 中不可用，发送流 ID 到 content script 处理
                            console.log('[Background] Service Worker 不支持 getUserMedia，发送流 ID 到 content script');
                            chrome.tabs.sendMessage(tabId, {
                                action: 'setupStream',
                                streamId: streamId
                            }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.error('[Background] 发送流 ID 失败:', chrome.runtime.lastError);
                                    sendResponse({
                                        success: false,
                                        error: chrome.runtime.lastError.message
                                    });
                                } else if (response && response.success) {
                                    // content script 会处理流，这里只是确认
                                    sendResponse({ success: true, message: '已在 content script 中设置流' });
                                } else {
                                    sendResponse({ success: false, error: response?.error || '设置流失败' });
                                }
                            });
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
                            handleStream(stream, tabId, sendResponse);
                        }).catch((error) => {
                            console.error('[Background] getUserMedia 失败:', error);
                            sendResponse({
                                success: false,
                                error: `getUserMedia 失败: ${error.message}`
                            });
                        });
                    };

                    // 实际调用 getMediaStreamId，始终传递 targetTabId
                    chrome.tabCapture.getMediaStreamId(options, callback);
                    return;
                }

                // 方法2: 尝试使用 capture 方法 (旧版 API)
                if (typeof chrome.tabCapture.capture === 'function') {
                    console.log('[Background] 使用 capture 方法（旧版）');
                    try {
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
                            handleStream(stream, tabId, sendResponse);
                        });
                    } catch (captureError) {
                        console.error('[Background] capture 调用异常:', captureError);
                        sendResponse({
                            success: false,
                            error: `capture 调用失败: ${captureError.message}`
                        });
                    }
                    return;
                }

                // 如果都不支持
                console.error('[Background] ❌ 不支持任何捕获方法');
                sendResponse({
                    success: false,
                    error: '浏览器不支持标签页音频捕获'
                });
            } // 结束 continueCapture 函数

        }); // 结束 chrome.tabs.get 回调

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

