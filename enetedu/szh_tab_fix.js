// ==UserScript==
// @name         szh.enetedu.com Tab切换限制移除
// @namespace    https://szh.enetedu.com/
// @version      1.0.0
// @description  移除szh.enetedu.com网站中切换tab时视频自动停止的限制
// @author       Assistant
// @match        szh.enetedu.com/*
// @grant        unsafeWindow
// @run-at       document-start
// @license MIT
// ==/UserScript==

(function () {
    'use strict';

    console.log('[Tab限制移除] 脚本已启动，准备移除tab切换限制...');

    // 等待页面加载完成
    function waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });
    }

    // 移除visibilitychange事件监听器
    function removeVisibilityChangeListeners() {
        console.log('[Tab限制移除] 开始移除visibilitychange事件监听器...');
        
        // 保存原始的事件监听器方法
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
        
        // 重写addEventListener方法，拦截visibilitychange事件
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (type === 'visibilitychange') {
                console.log('[Tab限制移除] 拦截到visibilitychange事件监听器添加');
                // 不添加visibilitychange事件监听器
                return;
            }
            return originalAddEventListener.call(this, type, listener, options);
        };
        
        // 重写removeEventListener方法
        EventTarget.prototype.removeEventListener = function(type, listener, options) {
            if (type === 'visibilitychange') {
                console.log('[Tab限制移除] 拦截到visibilitychange事件监听器移除');
                // 不执行移除操作
                return;
            }
            return originalRemoveEventListener.call(this, type, listener, options);
        };
        
        console.log('[Tab限制移除] visibilitychange事件监听器拦截已设置');
    }

    // 移除beforeunload和pagehide事件监听器
    function removePageUnloadListeners() {
        console.log('[Tab限制移除] 开始移除页面卸载事件监听器...');
        
        // 保存原始的事件监听器方法
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        
        // 重写addEventListener方法，拦截beforeunload和pagehide事件
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (type === 'beforeunload' || type === 'pagehide') {
                console.log(`[Tab限制移除] 拦截到${type}事件监听器添加`);
                // 不添加这些事件监听器
                return;
            }
            return originalAddEventListener.call(this, type, listener, options);
        };
        
        console.log('[Tab限制移除] 页面卸载事件监听器拦截已设置');
    }

    // 禁用页面可见性API
    function disableVisibilityAPI() {
        console.log('[Tab限制移除] 开始禁用页面可见性API...');
        
        // 重写document.hidden属性
        Object.defineProperty(document, 'hidden', {
            get: function() {
                console.log('[Tab限制移除] 访问document.hidden，返回false');
                return false;
            },
            configurable: true
        });
        
        // 重写document.visibilityState属性
        Object.defineProperty(document, 'visibilityState', {
            get: function() {
                console.log('[Tab限制移除] 访问document.visibilityState，返回visible');
                return 'visible';
            },
            configurable: true
        });
        
        // 重写document.onvisibilitychange
        Object.defineProperty(document, 'onvisibilitychange', {
            get: function() {
                return null;
            },
            set: function() {
                console.log('[Tab限制移除] 尝试设置onvisibilitychange，已阻止');
            },
            configurable: true
        });
        
        console.log('[Tab限制移除] 页面可见性API已禁用');
    }

    // 移除BroadcastChannel相关逻辑
    function removeBroadcastChannel() {
        console.log('[Tab限制移除] 开始移除BroadcastChannel相关逻辑...');
        
        // 保存原始的BroadcastChannel构造函数
        const originalBroadcastChannel = window.BroadcastChannel;
        
        // 重写BroadcastChannel构造函数
        window.BroadcastChannel = function(channelName) {
            console.log(`[Tab限制移除] 拦截BroadcastChannel创建: ${channelName}`);
            
            // 返回一个假的BroadcastChannel对象
            return {
                name: channelName,
                onmessage: null,
                postMessage: function(message) {
                    console.log(`[Tab限制移除] 拦截BroadcastChannel消息发送:`, message);
                    // 不发送消息
                },
                close: function() {
                    console.log(`[Tab限制移除] 拦截BroadcastChannel关闭`);
                    // 不执行关闭操作
                }
            };
        };
        
        // 保持原型链
        window.BroadcastChannel.prototype = originalBroadcastChannel.prototype;
        
        console.log('[Tab限制移除] BroadcastChannel已重写');
    }

    // 移除特定的暂停函数
    function removePauseFunctions() {
        console.log('[Tab限制移除] 开始移除暂停相关函数...');
        
        // 查找并移除ge函数（暂停视频的函数）
        const originalGe = window.ge;
        if (typeof originalGe === 'function') {
            window.ge = function() {
                console.log('[Tab限制移除] 拦截ge函数调用（视频暂停），已阻止');
                // 不执行暂停操作
            };
            console.log('[Tab限制移除] ge函数已重写');
        }
        
        // 查找并移除xe函数（visibilitychange处理函数）
        const originalXe = window.xe;
        if (typeof originalXe === 'function') {
            window.xe = function() {
                console.log('[Tab限制移除] 拦截xe函数调用（visibilitychange处理），已阻止');
                // 不执行任何操作
            };
            console.log('[Tab限制移除] xe函数已重写');
        }
        
        // 查找并移除ke函数（BroadcastChannel消息发送函数）
        const originalKe = window.ke;
        if (typeof originalKe === 'function') {
            window.ke = function(isPlay) {
                console.log(`[Tab限制移除] 拦截ke函数调用（BroadcastChannel消息），参数: ${isPlay}，已阻止`);
                // 不发送消息
            };
            console.log('[Tab限制移除] ke函数已重写');
        }
    }

    // 移除视频播放器的暂停功能
    function disableVideoPause() {
        console.log('[Tab限制移除] 开始禁用视频播放器的暂停功能...');
        
        // 定期检查并重写视频播放器的pause方法
        const checkAndDisablePause = () => {
            const videos = document.querySelectorAll('video');
            videos.forEach((video, index) => {
                if (video && typeof video.pause === 'function' && !video._pauseDisabled) {
                    const originalPause = video.pause;
                    video.pause = function() {
                        console.log(`[Tab限制移除] 拦截视频${index}的pause方法调用，已阻止`);
                        // 不执行暂停操作
                    };
                    video._pauseDisabled = true;
                    console.log(`[Tab限制移除] 视频${index}的pause方法已重写`);
                }
            });
        };
        
        // 立即检查一次
        checkAndDisablePause();
        
        // 定期检查
        setInterval(checkAndDisablePause, 2000);
        
        console.log('[Tab限制移除] 视频暂停功能禁用已设置');
    }

    // 移除控制台日志中的暂停信息
    function removePauseLogs() {
        console.log('[Tab限制移除] 开始移除暂停相关的控制台日志...');
        
        // 保存原始的console.log方法
        const originalLog = console.log;
        
        // 重写console.log方法，过滤掉暂停相关的日志
        console.log = function(...args) {
            const message = args.join(' ');
            if (message.includes('播放状态变化: 停止') || 
                message.includes('播放暂停 触发接口') ||
                message.includes('检测到您在其他标签页操作') ||
                message.includes('当前视频已暂停')) {
                console.log('[Tab限制移除] 过滤掉暂停相关日志:', message);
                return;
            }
            return originalLog.apply(console, args);
        };
        
        console.log('[Tab限制移除] 暂停相关日志过滤已设置');
    }

    // 主函数
    async function main() {
        console.log('[Tab限制移除] 开始执行主函数...');
        
        // 立即执行一些基本的移除操作
        removeVisibilityChangeListeners();
        removePageUnloadListeners();
        disableVisibilityAPI();
        removeBroadcastChannel();
        removePauseFunctions();
        removePauseLogs();
        
        // 等待页面加载完成
        await waitForPageLoad();
        
        // 页面加载完成后执行额外的操作
        disableVideoPause();
        
        console.log('[Tab限制移除] 所有限制移除操作已完成！');
        console.log('[Tab限制移除] 现在您可以安全地切换tab，视频不会自动停止');
    }

    // 启动脚本
    main().catch(error => {
        console.error('[Tab限制移除] 脚本执行出错:', error);
    });

})(); 