/**
 * Chrome Extension Background Service Worker
 * 处理扩展生命周期事件
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[CaptchaHelper] 扩展已安装');
  } else if (details.reason === 'update') {
    console.log('[CaptchaHelper] 扩展已更新');
  }
});

// 响应来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    sendResponse({ status: 'ok' });
  }
  return true; // 保持异步响应通道
});
