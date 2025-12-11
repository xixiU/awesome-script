// 这是一个注入到页面上下文(Main World)运行的脚本
// 用于突破Tab切换限制、Hook全局函数等

(function() {
    // Tab切换限制移除功能 - 专门针对szh.enetedu.com
    function removeTabSwitchRestrictions() {
        if (!window.location.href.includes('szh.enetedu.com')) {
            return; // 只在szh.enetedu.com网站启用
        }

        console.log('[Tab限制移除] 开始移除szh.enetedu.com的tab切换限制...');

        // 拦截事件监听器
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (type === 'visibilitychange' || type === 'beforeunload' || type === 'pagehide') {
                console.log(`[Tab限制移除] 拦截到${type}事件监听器添加`);
                return;
            }
            return originalAddEventListener.call(this, type, listener, options);
        };

        EventTarget.prototype.removeEventListener = function (type, listener, options) {
            if (type === 'visibilitychange' || type === 'beforeunload' || type === 'pagehide') {
                console.log(`[Tab限制移除] 拦截到${type}事件监听器移除`);
                return;
            }
            return originalRemoveEventListener.call(this, type, listener, options);
        };

        // 禁用页面可见性API
        Object.defineProperty(document, 'hidden', {
            get: function () {
                return false;
            },
            configurable: true
        });

        Object.defineProperty(document, 'visibilityState', {
            get: function () {
                return 'visible';
            },
            configurable: true
        });

        Object.defineProperty(document, 'onvisibilitychange', {
            get: function () {
                return null;
            },
            set: function () {
                console.log('[Tab限制移除] 尝试设置onvisibilitychange，已阻止');
            },
            configurable: true
        });

        // 重写BroadcastChannel
        const originalBroadcastChannel = window.BroadcastChannel;
        window.BroadcastChannel = function (channelName) {
            console.log(`[Tab限制移除] 拦截BroadcastChannel创建: ${channelName}`);
            return {
                name: channelName,
                onmessage: null,
                postMessage: function (message) {
                    console.log(`[Tab限制移除] 拦截BroadcastChannel消息发送:`, message);
                },
                close: function () {
                    console.log(`[Tab限制移除] 拦截BroadcastChannel关闭`);
                }
            };
        };
        if (originalBroadcastChannel) {
            window.BroadcastChannel.prototype = originalBroadcastChannel.prototype;
        }

        // 拦截特定函数
        const interceptFunctions = () => {
            // 拦截xe函数（visibilitychange处理函数）
            if (typeof window.xe === 'function') {
                window.xe = function () {
                    console.log('[Tab限制移除] 拦截xe函数调用，已阻止');
                    return;
                };
            }

            // 拦截ge函数（暂停视频的函数）
            if (typeof window.ge === 'function') {
                window.ge = function () {
                    console.log('[Tab限制移除] 拦截ge函数调用，已阻止');
                    return;
                };
            }

            // 拦截ke函数（BroadcastChannel消息发送函数）
            if (typeof window.ke === 'function') {
                window.ke = function (isPlay) {
                    console.log(`[Tab限制移除] 拦截ke函数调用，参数: ${isPlay}，已阻止`);
                    return;
                };
            }

            // 拦截Je函数（播放开始函数）
            if (typeof window.Je === 'function') {
                window.Je = function (t) {
                    console.log('[Tab限制移除] 拦截Je函数调用，但允许正常播放');
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
            }

            // 拦截He函数（播放暂停函数）
            if (typeof window.He === 'function') {
                window.He = function (t) {
                    console.log('[Tab限制移除] 拦截He函数调用，但允许正常暂停逻辑');
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
            }
        };

        // 拦截视频播放器的暂停方法
        const interceptVideoPause = () => {
            if (window.u && window.u.value && typeof window.u.value.pauseVideo === 'function') {
                window.u.value.pauseVideo = function () {
                    console.log('[Tab限制移除] 拦截pauseVideo方法调用，已阻止');
                };
            }

            const videos = document.querySelectorAll('video');
            videos.forEach((video, index) => {
                if (video && typeof video.pause === 'function' && !video._pauseIntercepted) {
                    video.pause = function () {
                        console.log(`[Tab限制移除] 拦截视频${index}的pause方法调用，已阻止`);
                    };
                    video._pauseIntercepted = true;
                }
            });
        };

        // 修改上报间隔逻辑
        const modifyReportingInterval = () => {
             // 简化的逻辑，完整逻辑请参考原脚本，此处只保留核心部分以减小文件体积
             // 如果需要针对直播页面的复杂Hook，请将原脚本完整逻辑拷入
        };

        // 定期检查并拦截
        setInterval(() => {
            interceptFunctions();
            interceptVideoPause();
        }, 1000);

        console.log('[Tab限制移除] 注入完成');
    }

    removeTabSwitchRestrictions();
})();

