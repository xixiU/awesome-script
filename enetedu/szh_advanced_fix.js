// ==UserScript==
// @name         szh.enetedu.com 高级Tab限制移除
// @namespace    https://szh.enetedu.com/
// @version      1.0.1
// @description  专门针对szh.enetedu.com网站的具体代码进行tab切换限制移除
// @author       Assistant
// @match        szh.enetedu.com/*
// @grant        unsafeWindow
// @run-at       document-start
// @license MIT
// ==/UserScript==

(function () {
    'use strict';

    console.log('[高级Tab限制移除] 脚本已启动，准备移除具体的tab切换限制...');

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

    // 拦截具体的函数
    function interceptSpecificFunctions() {
        console.log('[高级Tab限制移除] 开始拦截具体的限制函数...');

        // 拦截xe函数（visibilitychange处理函数）
        // 这个函数在您提供的代码中是：
        // function xe() {
        //     document.visibilityState === "hidden" && !Be.value && (b.warning("检测到您在其他标签页操作，当前视频已暂停"), ge())
        // }
        const originalXe = window.xe;
        if (typeof originalXe === 'function') {
            window.xe = function() {
                console.log('[高级Tab限制移除] 拦截xe函数调用（visibilitychange处理），已阻止');
                // 不执行任何操作，直接返回
                return;
            };
            console.log('[高级Tab限制移除] xe函数已重写');
        }

        // 拦截ge函数（暂停视频的函数）
        // 这个函数在您提供的代码中是：
        // function ge() {
        //     u.value && (u.value.pauseVideo(), Y(!1))
        // }
        const originalGe = window.ge;
        if (typeof originalGe === 'function') {
            window.ge = function() {
                console.log('[高级Tab限制移除] 拦截ge函数调用（视频暂停），已阻止');
                // 不执行暂停操作，直接返回
                return;
            };
            console.log('[高级Tab限制移除] ge函数已重写');
        }

        // 拦截ke函数（BroadcastChannel消息发送函数）
        // 这个函数在您提供的代码中是：
        // function ke(t) {
        //     X.value && X.value.postMessage({
        //         type: t ? "play" : "pause",
        //         tabId: pe,
        //         videoId: f.value[0]
        //     })
        // }
        const originalKe = window.ke;
        if (typeof originalKe === 'function') {
            window.ke = function(isPlay) {
                console.log(`[高级Tab限制移除] 拦截ke函数调用（BroadcastChannel消息），参数: ${isPlay}，已阻止`);
                // 不发送消息，直接返回
                return;
            };
            console.log('[高级Tab限制移除] ke函数已重写');
        }

        // 拦截Je函数（播放开始函数）
        // 这个函数在您提供的代码中是：
        // function Je(t) {
        //     if (fe.value) {
        //         ge();
        //         return
        //     }
        //     ke(!0),
        //     !((e = u.value) != null && e.isLoading()) && !((a = u.value) != null && a.isBuffering()) && (console.log("视频播放开始", "触发接口"), Ge())
        // }
        const originalJe = window.Je;
        if (typeof originalJe === 'function') {
            window.Je = function(t) {
                console.log('[高级Tab限制移除] 拦截Je函数调用（播放开始），但允许正常播放');
                // 移除fe.value检查，直接执行播放逻辑
                ke(!0);
                const u = window.u;
                const e = u?.value;
                const a = u?.value;
                if (!(e != null && e.isLoading()) && !(a != null && a.isBuffering())) {
                    console.log("视频播放开始", "触发接口");
                    if (typeof window.Ge === 'function') {
                        window.Ge();
                    }
                }
            };
            console.log('[高级Tab限制移除] Je函数已重写');
        }

        // 拦截He函数（播放暂停函数）
        // 这个函数在您提供的代码中是：
        // function He(t) {
        //     ke(!1),
        //     !((e = u.value) != null && e.isLoading()) && !((a = u.value) != null && a.isBuffering()) && (console.log("播放暂停", "触发接口"), Y())
        // }
        const originalHe = window.He;
        if (typeof originalHe === 'function') {
            window.He = function(t) {
                console.log('[高级Tab限制移除] 拦截He函数调用（播放暂停），但允许正常暂停逻辑');
                // 移除ke(!1)调用，但保留其他逻辑
                const u = window.u;
                const e = u?.value;
                const a = u?.value;
                if (!(e != null && e.isLoading()) && !(a != null && a.isBuffering())) {
                    console.log("播放暂停", "触发接口");
                    if (typeof window.Y === 'function') {
                        window.Y();
                    }
                }
            };
            console.log('[高级Tab限制移除] He函数已重写');
        }
    }

    // 拦截BroadcastChannel相关逻辑
    function interceptBroadcastChannel() {
        console.log('[高级Tab限制移除] 开始拦截BroadcastChannel相关逻辑...');

        // 保存原始的BroadcastChannel构造函数
        const originalBroadcastChannel = window.BroadcastChannel;

        // 重写BroadcastChannel构造函数
        window.BroadcastChannel = function(channelName) {
            console.log(`[高级Tab限制移除] 拦截BroadcastChannel创建: ${channelName}`);

            // 返回一个假的BroadcastChannel对象
            return {
                name: channelName,
                onmessage: null,
                postMessage: function(message) {
                    console.log(`[高级Tab限制移除] 拦截BroadcastChannel消息发送:`, message);
                    // 不发送消息
                },
                close: function() {
                    console.log(`[高级Tab限制移除] 拦截BroadcastChannel关闭`);
                    // 不执行关闭操作
                }
            };
        };

        // 保持原型链
        if (originalBroadcastChannel) {
            window.BroadcastChannel.prototype = originalBroadcastChannel.prototype;
        }

        console.log('[高级Tab限制移除] BroadcastChannel已重写');
    }

    // 拦截事件监听器
    function interceptEventListeners() {
        console.log('[高级Tab限制移除] 开始拦截事件监听器...');

        // 保存原始的事件监听器方法
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

        // 重写addEventListener方法，拦截特定事件
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (type === 'visibilitychange' || type === 'beforeunload' || type === 'pagehide') {
                console.log(`[高级Tab限制移除] 拦截到${type}事件监听器添加`);
                // 不添加这些事件监听器
                return;
            }
            return originalAddEventListener.call(this, type, listener, options);
        };

        // 重写removeEventListener方法
        EventTarget.prototype.removeEventListener = function(type, listener, options) {
            if (type === 'visibilitychange' || type === 'beforeunload' || type === 'pagehide') {
                console.log(`[高级Tab限制移除] 拦截到${type}事件监听器移除`);
                // 不执行移除操作
                return;
            }
            return originalRemoveEventListener.call(this, type, listener, options);
        };

        console.log('[高级Tab限制移除] 事件监听器拦截已设置');
    }

    // 禁用页面可见性API
    function disableVisibilityAPI() {
        console.log('[高级Tab限制移除] 开始禁用页面可见性API...');

        // 重写document.hidden属性
        Object.defineProperty(document, 'hidden', {
            get: function() {
                console.log('[高级Tab限制移除] 访问document.hidden，返回false');
                return false;
            },
            configurable: true
        });

        // 重写document.visibilityState属性
        Object.defineProperty(document, 'visibilityState', {
            get: function() {
                console.log('[高级Tab限制移除] 访问document.visibilityState，返回visible');
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
                console.log('[高级Tab限制移除] 尝试设置onvisibilitychange，已阻止');
            },
            configurable: true
        });

        console.log('[高级Tab限制移除] 页面可见性API已禁用');
    }

    // 拦截视频播放器的暂停方法
    function interceptVideoPause() {
        console.log('[高级Tab限制移除] 开始拦截视频播放器的暂停方法...');

        // 定期检查并重写视频播放器的pauseVideo方法
        const checkAndInterceptPause = () => {
            // 查找视频播放器对象
            if (window.u && window.u.value && typeof window.u.value.pauseVideo === 'function') {
                const originalPauseVideo = window.u.value.pauseVideo;
                window.u.value.pauseVideo = function() {
                    console.log('[高级Tab限制移除] 拦截pauseVideo方法调用，已阻止');
                    // 不执行暂停操作
                };
                console.log('[高级Tab限制移除] pauseVideo方法已重写');
            }

            // 查找所有video元素
            const videos = document.querySelectorAll('video');
            videos.forEach((video, index) => {
                if (video && typeof video.pause === 'function' && !video._pauseIntercepted) {
                    const originalPause = video.pause;
                    video.pause = function() {
                        console.log(`[高级Tab限制移除] 拦截视频${index}的pause方法调用，已阻止`);
                        // 不执行暂停操作
                    };
                    video._pauseIntercepted = true;
                    console.log(`[高级Tab限制移除] 视频${index}的pause方法已重写`);
                }
            });
        };

        // 立即检查一次
        checkAndInterceptPause();

        // 定期检查
        setInterval(checkAndInterceptPause, 1000);

        console.log('[高级Tab限制移除] 视频暂停方法拦截已设置');
    }

    // 移除控制台日志中的暂停信息
    function filterPauseLogs() {
        console.log('[高级Tab限制移除] 开始过滤暂停相关的控制台日志...');

        // 保存原始的console.log方法
        const originalLog = console.log;

        // 重写console.log方法，过滤掉暂停相关的日志
        console.log = function(...args) {
            const message = args.join(' ');
            if (message.includes('播放状态变化: 停止') || 
                message.includes('播放暂停 触发接口') ||
                message.includes('检测到您在其他标签页操作') ||
                message.includes('当前视频已暂停') ||
                message.includes('已有浏览器标签正在播放，无法观看')) {
                console.log('[高级Tab限制移除] 过滤掉暂停相关日志:', message);
                return;
            }
            return originalLog.apply(console, args);
        };

        console.log('[高级Tab限制移除] 暂停相关日志过滤已设置');
    }

    // 主函数
    async function main() {
        console.log('[高级Tab限制移除] 开始执行主函数...');

        // 立即执行基本的拦截操作
        interceptEventListeners();
        disableVisibilityAPI();
        interceptBroadcastChannel();
        filterPauseLogs();

        // 等待页面加载完成
        await waitForPageLoad();

        // 页面加载完成后执行具体的函数拦截
        interceptSpecificFunctions();
        interceptVideoPause();

        console.log('[高级Tab限制移除] 所有限制移除操作已完成！');
        console.log('[高级Tab限制移除] 现在您可以安全地切换tab，视频不会自动停止');
        console.log('[高级Tab限制移除] 已移除以下限制：');
        console.log('[高级Tab限制移除] - visibilitychange事件监听器');
        console.log('[高级Tab限制移除] - BroadcastChannel消息发送');
        console.log('[高级Tab限制移除] - 视频暂停函数调用');
        console.log('[高级Tab限制移除] - 页面可见性API');
    }

    // 启动脚本
    main().catch(error => {
        console.error('[高级Tab限制移除] 脚本执行出错:', error);
    });

})(); 