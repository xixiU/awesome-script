// ==UserScript==
// @name         教师网课助手
// @namespace    https://onlinenew.enetedu.com/
// @version      0.6.2.7
// @description  适用于网址是 https://onlinenew.enetedu.com/ 和 smartedu.cn 和 qchengkeji 的网站自动刷课，自动点击播放，检查视频进度，自动切换下一个视频。优先使用接口检测学习进度，页面元素检测作为兜底。已移除tab切换时视频自动停止的限制。
// @author       Praglody,vampirehA
// @match        onlinenew.enetedu.com/*/MyTrainCourse/*
// @match        huiyi.enetedu.com/liveWacth/*
// @match        *.smartedu.cn/p/course/*
// @match        szh.enetedu.com/*
// @match        bwgl.qchengkeji.com/user/node?nodeId=*
// @grant        unsafeWindow
// @grant        window.close
// @grant        GM.xmlHttpRequest
// @run-at       document-start
// @require      https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js
// @license MIT
// @thanks        https://update.greasyfork.org/scripts/497263/%2A2024%E7%89%88%E7%BB%AD%E7%BB%AD%E6%95%99%E8%82%B2%2A%E5%85%A8%E5%9B%BD%E9%AB%98%E6%A0%A1%E6%95%99%E5%B8%88%E7%BD%91%E7%BB%9C%E5%9F%B9%E8%AE%AD%E4%B8%AD%E5%BF%83-%E8%87%AA%E5%8A%A8%E5%88%B7%E8%AF%BE.user.js
// @downloadURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/enetedu/enetedu.js
// @updateURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/enetedu/enetedu.js
// ==/UserScript==

(function () {
    'use strict';

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

        // 定期检查并拦截
        setInterval(() => {
            interceptFunctions();
            interceptVideoPause();
        }, 1000);

        console.log('[Tab限制移除] 所有限制移除操作已完成！');
    }

    // 立即执行tab切换限制移除
    removeTabSwitchRestrictions();

    // 普通课程倍速
    const speed = 2.0;
    // 直播课程倍速
    const liveSpeed = 4.0;

    // 添加 smartedu 速度设置
    const SPEEDS = {
        normal: 2.0,
        live: 4.0,
        smartedu: 2.0
    };

    // 工具函数增加检测是否为直播页面的方法
    const utils = {
        randomNum(minNum, maxNum) {
            return Math.floor(Math.random() * (maxNum - minNum + 1) + minNum);
        },

        log(message) {
            console.log(`[自动刷课] ${new Date().toLocaleTimeString()} - ${message}`);
        },

        error(message) {
            console.error(`[自动刷课] ${new Date().toLocaleTimeString()} - ${message}`);
        },

        isLivePage() {
            return window.location.href.includes('huiyi.enetedu.com/liveWacth') || isSzhLivePage();
        },

        isSzhLivePage() {
            let isSzhLivePage = window.location.href.includes('szh.enetedu.com')
            if (isSzhLivePage) {
                liveSpeed = 1.5;
            }
            return isSzhLivePage;
        },

        isSmartEduPage() {
            return window.location.href.includes('smartedu.cn/p/course');
        },
        isChengKejiPahe() {
            return window.location.href.includes("bwgl.qchengkeji.com/user/node");
        }
    };

    // 视频控制器
    class VideoController {
        constructor() {
            this.playInterval = null;
            this.lastForceReportTime = 0; // 新增：上次强制上报时间
            this.lastLogTime = 0; // 新增：上次打印视频进度日志的时间
        }

        // 初始化视频播放
        initVideoPlay() {
            this.playInterval = setInterval(() => {
                try {
                    const iframe = $(".classcenter-chapter1 iframe").contents();

                    // 处理弹窗
                    if (iframe.find(".layui-layer-content iframe").length > 0) {
                        setTimeout(() => {
                            utils.log("点击确定按钮");
                            iframe.find(".layui-layer-content iframe").contents()
                                .find("#questionid~div button").trigger("click");
                        }, utils.randomNum(4, 10) * 100);
                        return;
                    }

                    // 播放视频并设置倍速
                    const video = iframe.find("video");
                    if (video.length > 0) {
                        const videoElement = video[0];
                        videoElement.play(); // 使用原生play方法
                        videoElement.muted = true
                        try {
                            videoElement.playbackRate = speed;
                            utils.log(`视频开始播放，音量设置为1%，播放速度${speed}倍`);
                        } catch (err) {
                            utils.log(`设置播放速度失败: ${err.message}`);
                        }
                    }
                } catch (err) {
                    utils.log(`播放出错: ${err.message}`);
                }
            }, 5000);
        }

        // 监听视频进度
        initProgressMonitor() {
            // 针对 onlinenew.enetedu.com 页面，增强学习逻辑
            if (window.location.href.includes('onlinenew.enetedu.com')) {
                const iframeElement = $(".classcenter-chapter1 iframe")[0];

                if (iframeElement) {
                    const enhanceIframeLogic = () => {
                        const iframeWindow = iframeElement.contentWindow;
                        if (iframeWindow) {
                            utils.log("成功获取 iframe 的 contentWindow，开始增强学习逻辑。");

                            // 禁用 GetQuestion 函数
                            if (typeof iframeWindow.GetQuestion === 'function') {
                                iframeWindow.GetQuestion = function (course_id, courseware_id) {
                                    utils.log("拦截并禁用 iframe 中的 GetQuestion 函数，返回空问题列表。");
                                    return { code: 0, list: [], count: 0 };
                                };
                            } else {
                                utils.error("iframeWindow.GetQuestion 函数未找到，可能无法禁用课程问题弹出。");
                            }

                            // 保存原始 RecordDuration 并覆盖
                            let originalRecordDuration = null;
                            if (typeof iframeWindow.RecordDuration === 'function') {
                                originalRecordDuration = iframeWindow.RecordDuration;
                                iframeWindow.RecordDuration = function (start, end) {
                                    utils.log(`拦截 iframe 中的 RecordDuration，阻止页面原有上报。原始调用参数: start=${start}, end=${end}`);
                                };
                            } else {
                                utils.error("iframeWindow.RecordDuration 函数未找到，无法拦截原有上报。");
                            }

                            // 强制定时上报
                            const forceReportInterval = 10; // 每10秒强制上报一次
                            setInterval(() => {
                                if (iframeWindow.h5_player && !iframeWindow.h5_player.paused() && !iframeWindow.h5_player.ended && originalRecordDuration) {
                                    const currentTime = iframeWindow.h5_player.getCurrentTime();
                                    if (typeof currentTime === 'number' && currentTime > 0) {
                                        // 只有当当前时间比上次上报时间有显著增加时才上报，或者发生大跳跃时
                                        if (currentTime - this.lastForceReportTime >= forceReportInterval || currentTime > this.lastForceReportTime + 60) {
                                            utils.log(`强制上报进度: 从 ${this.lastForceReportTime.toFixed(0)}s 到 ${currentTime.toFixed(0)}s`);
                                            originalRecordDuration(this.lastForceReportTime, currentTime);
                                            this.lastForceReportTime = currentTime;
                                        }
                                    }
                                }
                            }, forceReportInterval * 1000);

                            // 监听 h5_player 的 seeked 事件进行拖拽上报
                            let checkH5PlayerInterval = setInterval(() => {
                                if (iframeWindow.h5_player && originalRecordDuration) {
                                    iframeWindow.h5_player.on('seeked', () => {
                                        const currentTime = iframeWindow.h5_player.getCurrentTime();
                                        utils.log(`检测到拖拽 (seeked 事件)，立即上报进度到 ${currentTime.toFixed(0)}s`);
                                        originalRecordDuration(this.lastForceReportTime, currentTime);
                                        this.lastForceReportTime = currentTime;
                                    });
                                    clearInterval(checkH5PlayerInterval); // 停止轮询
                                }
                            }, 1000); // 每秒检查一次
                        } else {
                            utils.error("iframe.contentWindow 在 onload 事件后仍未就绪，无法增强学习逻辑。");
                        }
                    };

                    // 监听 iframe 的 load 事件
                    iframeElement.onload = enhanceIframeLogic;

                    // 如果 iframe 已经加载完成，手动触发增强逻辑
                    // 检查 readyState 是为了确保 contentDocument 已经解析完毕
                    if (iframeElement.contentWindow && iframeElement.contentWindow.document.readyState === 'complete') {
                        utils.log("iframe 似乎已加载完成，立即触发增强逻辑。");
                        enhanceIframeLogic();
                    }
                } else {
                    utils.error("未找到 .classcenter-chapter1 iframe 元素，无法增强学习逻辑。");
                }
            }

            // 原始的视频进度监听逻辑，确保即使 iframe 增强失败，视频播放和倍速设置仍能工作
            setTimeout(() => {
                try {
                    const iframe = $(".classcenter-chapter1 iframe").contents();
                    const video = iframe.find("video");
                    if (video.length > 0) {
                        video.on("timeupdate", this.handleVideoProgress.bind(this));
                    }
                } catch (err) {
                    utils.log(`主视频进度监控初始化失败: ${err.message}`);
                }
            }, 8000);
        }

        // 处理视频进度
        handleVideoProgress(event) {
            const video = event.target;
            const currentTime = Math.ceil(video.currentTime);
            const duration = Math.ceil(video.duration);

            // 修改播放速度设置的方式
            try {
                if (video && video.playbackRate !== speed) {
                    video.playbackRate = speed; // 直接使用video对象而不是video[0]
                    utils.log(`重置播放速度为${speed}倍`);
                }
            } catch (err) {
                utils.log(`设置播放速度失败: ${err.message}`);
            }

            // 每3秒打印一次视频进度日志
            if (Math.abs(currentTime - this.lastLogTime) >= 6) {
                utils.log(`当前视频进度: ${currentTime}s/${duration}s，播放速度: ${video.playbackRate}倍`);
                this.lastLogTime = currentTime;
                this.checkCurrentProgress();
            }
            // if (currentTime >= duration) {
            //     this.handleVideoComplete();
            // } else {

            // }
        }

        // 处理视频完成
        // handleVideoComplete() {
        //     let hasNextVideo = false;
        //     $(".classcenter-chapter2 ul li").each(function () {
        //         if (($(this).css("background-color") !== "rgb(204, 197, 197)" || $(this).css("background-color") !== "#ccc5c5") &&
        //             $(this).find("span").text() !== "[100%]") {
        //             hasNextVideo = true;
        //             let nextVideoLink = $(this).find("a").attr("href");
        //             if (nextVideoLink) {
        //                 window.location.href = nextVideoLink;
        //                 utils.log("切换到下一个视频");
        //                 return false;
        //             } else {
        //                 utils.log("未找到下一个视频的链接");
        //                 return true;
        //             }
        //         }
        //     });

        //     if (!hasNextVideo) {
        //         clearInterval(this.playInterval);
        //         utils.log("所有视频播放完成");
        //         console.log('【课程切换】所有课程均已学习完毕或被锁定，5秒后自动关闭页面...');
        //         setTimeout(() => { window.close(); }, 5000);
        //     }
        // }

        // 检查当前进度
        checkCurrentProgress() {
            // 优先使用接口检测进度
            this.checkProgressByAPI().then((apiResult) => {
                if (apiResult !== null) {
                    // 接口检测成功，使用接口结果
                    this.handleProgressResult(apiResult);
                } else {
                    // 接口检测失败，使用页面元素检测作为兜底
                    this.checkProgressByElement();
                }
            }).catch((error) => {
                utils.log(`接口检测失败: ${error.message}，使用页面元素检测作为兜底`);
                this.checkProgressByElement();
            });
        }

        // 从URL中提取域名和第一个路径
        extractDomainWithFirstPath(url) {
            try {
                const urlObj = new URL(url);
                const pathname = urlObj.pathname;

                // 分割路径并过滤空字符串
                const pathSegments = pathname.split('/').filter(segment => segment.length > 0);

                // 构建基础URL（协议 + 域名）
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

                // 如果有路径段，添加第一个
                if (pathSegments.length > 0) {
                    return `${baseUrl}/${pathSegments[0]}`;
                }

                return baseUrl;
            } catch (error) {
                console.error('URL解析错误:', error);
                return null;
            }
        }

        // 通过接口检测进度
        async checkProgressByAPI() {
            try {
                // 获取当前页面的课程ID和章节ID
                const currentUrl = window.location.href;
                const urlParams = new URLSearchParams(window.location.search);
                const coursetype = urlParams.get('coursetype') || this.extractCourseIdFromUrl(currentUrl) || 2;
                const coursewareId = urlParams.get('coursewareid') || this.extractCoursewareIdFromUrl(currentUrl);

                if (!coursetype || !coursewareId) {
                    utils.log('无法从URL中提取课程ID或章节ID，跳过接口检测');
                    return null;
                }

                // 构造接口URL - 将当前URL中的ChoiceCourse替换为PercentageCourse
                const apiUrl = this.extractDomainWithFirstPath(currentUrl) + "/MyTrainCourse/PercentageCourse";

                // 使用GM.xmlHttpRequest发送POST请求
                return new Promise((resolve, reject) => {
                    GM.xmlHttpRequest({
                        method: 'POST',
                        url: apiUrl,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Accept': '*/*',
                            'x-requested-with': 'XMLHttpRequest'
                        },
                        data: `coursetype=${coursetype}&coursewareid=${coursewareId}`,
                        onload: function (response) {
                            try {
                                // console.log(response.responseText);
                                const data = response.responseText;
                                const percentage = parseFloat(data.replace('%', ''));
                                // utils.log(`接口返回进度: ${percentage}`);
                                resolve({
                                    percentage: percentage,
                                    isComplete: percentage >= 100,
                                    source: 'api'
                                });
                            } catch (error) {
                                utils.log(`解析接口响应失败: ${error.message}`);
                                resolve(null);
                            }
                        },
                        onerror: function (error) {
                            utils.log(`接口请求失败: ${error.statusText || '网络错误'}`);
                            resolve(null);
                        },
                        ontimeout: function () {
                            utils.log('接口请求超时');
                            resolve(null);
                        },
                        timeout: 10000 // 10秒超时
                    });
                });
            } catch (error) {
                utils.log(`接口检测异常: ${error.message}`);
                return null;
            }
        }

        // 从URL中提取课程ID
        extractCourseIdFromUrl(url) {
            // 优先尝试提取coursetype参数
            let match = url.match(/coursetype=(\d+)/);
            if (match) return match[1];

            // 如果没有coursetype，尝试提取id参数
            match = url.match(/id=(\d+)/);
            return match ? match[1] : null;
        }

        // 从URL中提取章节ID
        extractCoursewareIdFromUrl(url) {
            // 尝试提取coursewareid参数
            const match = url.match(/coursewareid=(\d+)/);
            return match ? match[1] : null;
        }

        // 处理进度检测结果
        handleProgressResult(result) {
            if (result.source === 'api') {
                if (result.isComplete) {
                    utils.log(`接口检测：当前章节已完成 (${result.percentage}%)，准备切换下一章节`);
                    this.switchToNextVideo();
                } else {
                    utils.log(`接口检测：当前章节进度 ${result.percentage}%，继续学习`);
                }
            }
        }

        // 收集视频元素信息
        collectVideoElements() {
            const currentFullUrl = window.location.href;
            const videoElements = [];
            let currentVideoIndex = -1;
            let currentVideoComplete = false;

            $(".classcenter-chapter2 ul li").each(function (index) {
                const $this = $(this);
                const onclickAttr = $this.attr('onclick');
                let isCurrentVideo = $this.css("background-color") === "rgb(204, 197, 197)" || $this.css("background-color") === "#ccc5c5";

                // 新增分支逻辑：如果onclick属性包含当前网址的路径部分，也认为是当前章节
                if (onclickAttr && onclickAttr.includes('location.href=')) {
                    const onclickUrlPart = onclickAttr.match(/location\.href='([^']+)'/);
                    if (onclickUrlPart && onclickUrlPart[1]) {
                        const relativePath = onclickUrlPart[1].replace(/&/g, '&'); // 替换 & 为 &
                        if (currentFullUrl.includes(relativePath)) {
                            isCurrentVideo = true;
                        }
                    }
                }
                const isComplete = $this.find("span").text() === "[100%]";

                videoElements.push({
                    element: $this,
                    isCurrent: isCurrentVideo,
                    isComplete: isComplete,
                    index: index
                });

                // 记录当前视频信息
                if (isCurrentVideo) {
                    currentVideoIndex = index;
                    currentVideoComplete = isComplete;
                }

                utils.log(`视频${index}: 当前=${isCurrentVideo}, 完成=${isComplete}`);
            });

            return {
                videoElements: videoElements,
                currentVideoIndex: currentVideoIndex,
                currentVideoComplete: currentVideoComplete
            };
        }

        // 处理视频切换逻辑
        handleVideoSwitch(source = 'unknown') {
            const { videoElements, currentVideoIndex, currentVideoComplete } = this.collectVideoElements();

            // 检查是否找到当前视频
            if (currentVideoIndex === -1) {
                utils.log(`${source}：未找到当前选中的视频`);
                return;
            }

            // 如果是页面元素检测，需要检查当前视频是否完成
            if (source === '页面元素检测') {
                if (!currentVideoComplete) {
                    utils.log(`${source}：当前视频未完成，继续学习`);
                    return;
                }
                utils.log(`${source}：当前视频已完成，寻找下一个未完成的视频`);
            } else {
                // 接口检测：已经确认当前视频完成，直接寻找下一个
                utils.log(`${source}：接口已确认当前视频完成，寻找下一个未完成的视频`);
            }

            // 寻找下一个未完成的视频
            let nextIncompleteVideoIndex = -1;

            if (source === '接口检测') {
                // 接口检测：从当前视频的下一个开始寻找，跳过当前视频（因为接口已确认完成）
                for (let i = currentVideoIndex + 1; i < videoElements.length; i++) {
                    if (!videoElements[i].isComplete) {
                        nextIncompleteVideoIndex = i;
                        break;
                    }
                }
                // 如果从当前视频后面没找到，再从开头找（处理循环情况）
                if (nextIncompleteVideoIndex === -1) {
                    for (let i = 0; i < currentVideoIndex; i++) {
                        if (!videoElements[i].isComplete) {
                            nextIncompleteVideoIndex = i;
                            break;
                        }
                    }
                }
            } else {
                // 页面元素检测：从开头寻找第一个未完成的视频
                for (let i = 0; i < videoElements.length; i++) {
                    if (!videoElements[i].isComplete) {
                        nextIncompleteVideoIndex = i;
                        break;
                    }
                }
            }

            if (nextIncompleteVideoIndex !== -1) {
                // 找到下一个未完成的视频，点击切换
                const nextVideo = videoElements[nextIncompleteVideoIndex];
                nextVideo.element.trigger("click");
                utils.log(`${source}：切换到下一个未完成的视频 (索引: ${nextIncompleteVideoIndex})`);
            } else {
                // 所有视频都已完成
                utils.log(`${source}：所有视频播放完成`);
                const closeDelay = source === '页面元素检测' ? 2000 : 5000;
                console.log(`【课程切换】所有课程均已学习完毕或被锁定，${closeDelay / 1000}秒后自动关闭页面...`);
                setTimeout(() => { window.close(); }, closeDelay);
            }
        }

        // 通过页面元素检测进度（兜底逻辑）
        checkProgressByElement() {
            this.handleVideoSwitch('页面元素检测');
        }

        // 切换到下一个视频
        switchToNextVideo() {
            this.handleVideoSwitch('接口检测');
        }
    }

    // 直播控制器
    class LiveController {
        constructor() {
            this.checkInterval = null;
        }

        init() {
            utils.log('初始化直播控制器');
            this.initLivePlay();
        }

        initLivePlay() {
            this.checkInterval = setInterval(() => {
                try {
                    const video = document.querySelector('video');
                    if (video) {
                        // 确保视频在播放
                        if (video.paused) {
                            video.play();
                        }

                        // 设置音量和播放速度
                        video.muted = true;
                        try {
                            if (video.playbackRate !== liveSpeed) {
                                video.playbackRate = liveSpeed;
                                utils.log(`直播播放速度设置为${liveSpeed}倍`);
                            }
                        } catch (err) {
                            utils.log(`设置直播播放速度失败: ${err.message}`);
                        }

                        // 输出播放状态
                        utils.log(`直播播放中 - 速度: ${video.playbackRate}倍, 音量: ${video.volume}`);
                    }
                } catch (err) {
                    utils.log(`直播控制出错: ${err.message}`);
                }
            }, 5000);
        }
    }

    // 启城科技控制器
    class QChengKejiController {
        constructor() {
            this.videoPlayInterval = null;
            this.mouseMoveInterval = null;
            this.mouseMoveTimeout = null; // Add timeout property
        }

        startVideoTasks() {
            utils.log('[QChengKeji] Starting video tasks.');
            this.applyAntiCheatBypasses(); // Apply bypasses
            this.initVideoPlaybackAndNext();
            this.startMouseMoveSimulation();
        }

        // Add anti-cheat bypass methods
        applyAntiCheatBypasses() {
            utils.log('[QChengKeji] Applying anti-cheat bypasses.');

            // Bypass multi-page detection by modifying localStorage and cookie methods
            // try {
            //     const originalLocalStorageSetItem = window.localStorage.setItem;
            //     window.localStorage.setItem = function(key, value) {
            //         if (key.startsWith('node_play_')) {
            //             utils.log(`[QChengKeji] Blocked localStorage.setItem for key: ${key}`);
            //             return; // Block setting play state
            //         }
            //         originalLocalStorageSetItem.call(this, key, value);
            //     };

            //     const originalLocalStorageGetItem = window.localStorage.getItem;
            //     window.localStorage.getItem = function(key) {
            //          if (key.startsWith('node_play_')) {
            //             utils.log(`[QChengKeji] Faked localStorage.getItem for key: ${key}`);
            //             return null; // Fake no other page is playing
            //         }
            //         return originalLocalStorageGetItem.call(this, key);
            //     };

            //      const originalCookieSet = document.cookie.__lookupSetter__('cookie');
            //      document.__defineSetter__('cookie', function(value) {
            //          if (value.includes('node_play_')) {
            //              utils.log(`[QChengKeji] Blocked document.cookie set for play state`);
            //              return; // Block setting play state cookie
            //          }
            //          originalCookieSet.call(this, value);
            //      });

            //      const originalCookieGet = document.cookie.__lookupGetter__('cookie');
            //      document.__defineGetter__('cookie', function() {
            //          const cookie = originalCookieGet.call(this);
            //          if (cookie.includes('node_play_')) {
            //               utils.log(`[QChengKeji] Faked document.cookie get for play state`);
            //               return cookie.replace(/node_play_[^;]+;?\s*/g, ''); // Remove play state cookie
            //          }
            //          return cookie;
            //      });

            //     utils.log('[QChengKeji] localStorage and cookie methods modified for multi-page bypass.');
            // } catch (e) {
            //     utils.log(`[QChengKeji] Failed to modify localStorage or cookie methods: ${e.message}`);
            // }


            // Intercept AJAX requests to modify studyTime
            $(document).ajaxSend(function (event, jqxhr, settings) {
                if (settings.url && settings.url.includes('/user/node/study') && settings.type === 'POST') {
                    try {
                        // settings.data could be a string or an object
                        let data = settings.data;
                        if (typeof data === 'string') {
                            // Parse query string
                            const params = new URLSearchParams(data);
                            if (params.has('studyTime')) {
                                const originalStudyTime = params.get('studyTime');
                                params.set('studyTime', '9999'); // Force studyTime to a high value
                                settings.data = params.toString();
                                utils.log(`[QChengKeji] Intercepted /user/node/study AJAX. Changed studyTime from ${originalStudyTime} to 9999.`);
                            }
                        } else if (typeof data === 'object') {
                            if (data.hasOwnProperty('studyTime')) {
                                const originalStudyTime = data.studyTime;
                                data.studyTime = 9999; // Force studyTime to a high value
                                utils.log(`[QChengKeji] Intercepted /user/node/study AJAX. Changed studyTime from ${originalStudyTime} to 9999.`);
                            }
                        }
                    } catch (e) {
                        utils.log(`[QChengKeji] Error modifying AJAX data: ${e.message}`);
                    }
                }
            });
            utils.log('[QChengKeji] AJAX send listener added to modify studyTime.');


            // Bypass sendBeacon on page unload
            try {
                if (typeof navigator.sendBeacon === 'function') {
                    const originalSendBeacon = navigator.sendBeacon;
                    navigator.sendBeacon = function (url, data) {
                        if (url && url.includes('/user/node/study')) {
                            utils.log('[QChengKeji] Blocked navigator.sendBeacon for study data.');
                            return true; // Indicate success without sending
                        }
                        return originalSendBeacon.call(this, url, data);
                    };
                    utils.log('[QChengKeji] navigator.sendBeacon method modified.');
                } else {
                    utils.log('[QChengKeji] navigator.sendBeacon not available.');
                }
            } catch (e) {
                utils.log(`[QChengKeji] Failed to modify navigator.sendBeacon: ${e.message}`);
            }

        }


        createAutoPlayHelper(videoElement) {
            if (document.getElementById('qchengkeji-autoplay-helper')) return;

            const helper = document.createElement('button');
            helper.id = 'qchengkeji-autoplay-helper';
            helper.innerHTML = '点击开始播放 (启城科技)';
            helper.style.cssText = `
                position: fixed;
                top: 50px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                padding: 10px 20px;
                background: #FF9800; /* Orange for autoplay */
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            `;

            helper.onclick = () => {
                videoElement.play().then(() => {
                    utils.log('[QChengKeji] User initiated playback successfully.');
                    if (videoElement.volume !== 0.01) videoElement.volume = 0.01;
                    helper.remove();
                }).catch(err => {
                    utils.log(`[QChengKeji] User initiated playback failed: ${err.message}`);
                });
            };

            document.body.appendChild(helper);
            utils.log('[QChengKeji] Added autoplay helper button. Please click it to start.');
        }
        initVideoPlaybackAndNext() {
            this.videoPlayInterval = setInterval(() => {
                try {

                    const video = $('video')[0];
                    if (video) {
                        if (video.paused && !video.ended) {
                            const $captchaContent = $('div.layui-layer-page:visible .layui-layer-content');

                            // 识别验证码
                            const $captchaInput = $captchaContent.find('input[type="text"]:visible');

                            if ($captchaContent.length > 0) {
                                const $captchaImg = $captchaContent.find('img[src*="/service/code/"]:visible');
                                const captchaSrc = $captchaImg.attr('src');

                                if (captchaSrc) {
                                    const img = new Image();
                                    utils.log(`captchaSrc:${captchaSrc}`);

                                    img.crossOrigin = 'Anonymous';
                                    img.onload = () => {
                                        const canvas = document.createElement('canvas');
                                        canvas.width = img.width;
                                        canvas.height = img.height;
                                        const ctx = canvas.getContext('2d');
                                        ctx.drawImage(img, 0, 0);
                                        const base64Image = canvas.toDataURL('image/png').split(',')[1];

                                        utils.log('[QChengKeji] Captcha image loaded. Sending for recognition.');
                                        GM.xmlHttpRequest({
                                            method: "POST",
                                            url: "http://127.0.0.1:9876/recognize_captcha",
                                            headers: {
                                                "Content-Type": "application/json"
                                            },
                                            data: JSON.stringify({ image_base64: base64Image }),
                                            onload: function (response) {
                                                try {
                                                    const result = JSON.parse(response.responseText);
                                                    if (result && result.result) {
                                                        const captchaText = result.result;
                                                        utils.log(`[QChengKeji] Captcha recognized: ${captchaText}`);
                                                        $captchaInput.val(captchaText);
                                                        utils.log('[QChengKeji] Filled captcha input. Clicking play button.');
                                                        const $playButton = $('.layui-layer-btn0');

                                                        if ($playButton.length > 0) {
                                                            const buttonElement = $playButton[0]; // 获取原生DOM元素
                                                            const currentWindow = document.defaultView; // 使用 document.defaultView

                                                            if (!currentWindow) {
                                                                utils.error('[QChengKeji] Failed to get defaultView (window object).');
                                                                return; // 或者尝试回退到 window，或者抛出错误
                                                            }
                                                            // 尝试发送mousedown和mouseup事件，有些复杂的按钮依赖这个顺序
                                                            const downEvent = new MouseEvent('mousedown', {
                                                                bubbles: true,
                                                                cancelable: true,
                                                                view: currentWindow
                                                            });
                                                            buttonElement.dispatchEvent(downEvent);

                                                            // 可以加一个极小的延时
                                                            setTimeout(function () {
                                                                const upEvent = new MouseEvent('mouseup', {
                                                                    bubbles: true,
                                                                    cancelable: true,
                                                                    view: currentWindow
                                                                });
                                                                buttonElement.dispatchEvent(upEvent);

                                                                // 再尝试一次click事件，或者有时候mousedown/up就够了
                                                                const clickEvent = new MouseEvent('click', {
                                                                    bubbles: true,
                                                                    cancelable: true,
                                                                    view: currentWindow
                                                                });
                                                                buttonElement.dispatchEvent(clickEvent);

                                                                utils.log('Dispatched mousedown, mouseup, and click events.');

                                                            }, 50); // 短暂延时

                                                        } else {
                                                            utils.error('Play button .layui-layer-btn0 not found after recognition.');
                                                        }
                                                    } else {
                                                        console.error('[QChengKeji] Captcha recognition response missing result:', result);
                                                        utils.log('[QChengKeji] Captcha recognition failed. Manual input required.');
                                                    }
                                                } catch (e) {
                                                    console.error('[QChengKeji] Error parsing recognition response:', e);
                                                    utils.log('[QChengKeji] Error processing recognition response. Manual input required.');
                                                }
                                            },
                                            onerror: function (response) {
                                                console.error('[QChengKeji] Captcha recognition request failed:', response.status, response.statusText);
                                                utils.log('[QChengKeji] Captcha recognition request failed. Manual input required.');
                                            },
                                            ontimeout: function () {
                                                console.error('[QChengKeji] Captcha recognition request timed out.');
                                                utils.log('[QChengKeji] Captcha recognition request timed out. Manual input required.');
                                            }
                                        });
                                    };
                                    img.onerror = () => {
                                        console.error('[QChengKeji] Failed to load CAPTCHA image for recognition.');
                                        utils.log('[QChengKeji] Failed to load CAPTCHA image. Manual input required.');
                                    };
                                    img.src = "https://bwgl.qchengkeji.com" + captchaSrc;
                                } else {
                                    console.error('[QChengKeji] CAPTCHA image not found.');
                                    utils.log('[QChengKeji] CAPTCHA image not found. Manual input required.');
                                }

                            } else {
                                // No captcha input field, attempt to play video
                                utils.log('[QChengKeji] No captcha input field detected. Attempting to play video.');
                                video.volume = 0.01;
                                const playPromise = video.play();
                                if (playPromise !== undefined) {
                                    playPromise.then(() => {
                                        video.muted = true; // Set desired volume
                                        utils.log('[QChengKeji] Video muted');
                                        const helperButton = document.getElementById('qchengkeji-autoplay-helper');
                                        if (helperButton) {
                                            helperButton.remove();
                                        }
                                    }).catch(e => {
                                        utils.log(`[QChengKeji] Error playing video: ${e.message}.`);
                                        if (e.name === 'NotAllowedError' || e.message.toLowerCase().includes("user didn't interact") || e.message.toLowerCase().includes("interaction")) {
                                            utils.log('[QChengKeji] Autoplay failed due to user interaction policy. Adding helper button.');
                                            this.createAutoPlayHelper(video);
                                        }
                                    });
                                }
                            }
                        } else if (!video.paused && !video.muted) {
                            // Ensure volume is set if video is already playing and not muted
                            video.muted = true;
                            utils.log('[QChengKeji] set video volume muted');
                        }

                        if (video.ended || video.currentTime / video.duration > 0.95) {
                            utils.log('[QChengKeji] Video ended. Attempting to play next.');
                            this.playNextVideo();
                        }
                    }
                } catch (err) {
                    utils.log(`[QChengKeji] Error in video playback interval: ${err.message}`);
                }
            }, 3000);
        }

        startMouseMoveSimulation() {
            // 清除可能已存在的定时器，以防重复启动
            if (this.mouseMoveTimeout) {
                clearTimeout(this.mouseMoveTimeout);
                this.mouseMoveTimeout = null;
            }

            const simulateAndScheduleNext = () => {
                const video = $('video')[0];
                if (video && !video.paused && !video.ended) {
                    const videoRect = video.getBoundingClientRect();
                    // 确保 videoRect.left, top, width, height 是有效数字
                    if (typeof videoRect.left === 'number' &&
                        typeof videoRect.top === 'number' &&
                        videoRect.width > 0 &&
                        videoRect.height > 0) {

                        const randomX = videoRect.left + videoRect.width * Math.random();
                        const randomY = videoRect.top + videoRect.height * Math.random();

                        const eventOptions = {
                            clientX: randomX,
                            clientY: randomY,
                            bubbles: true,
                            cancelable: true,
                            view: document.defaultView // 确保 document.defaultView 有效
                        };

                        // 确保 document.defaultView 存在，否则 MouseEvent 构造可能失败
                        if (document.defaultView) {
                            document.dispatchEvent(new MouseEvent('mousemove', eventOptions));
                            if (typeof utils !== 'undefined' && typeof utils.log === 'function') {
                                utils.log(`[QChengKeji] Dispatched mousemove to ${randomX.toFixed(2)}, ${randomY.toFixed(2)}`);
                            } else {
                                console.log(`[QChengKeji] Dispatched mousemove to ${randomX.toFixed(2)}, ${randomY.toFixed(2)} (utils.log not available)`);
                            }
                        } else {
                            console.error('[QChengKeji] document.defaultView is not available. Cannot dispatch MouseEvent.');
                        }
                    } else {
                        if (typeof utils !== 'undefined' && typeof utils.log === 'function') {
                            utils.log('[QChengKeji] Video dimensions are not valid for mousemove simulation.');
                        } else {
                            console.log('[QChengKeji] Video dimensions are not valid for mousemove simulation.');
                        }
                    }
                }

                // 计算下一个随机延迟时间 (10000ms 到 30000ms)
                const minDelay = 10000; // 10 秒
                const maxDelay = 600000; // 600 秒
                const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

                if (typeof utils !== 'undefined' && typeof utils.log === 'function') {
                    utils.log(`[QChengKeji] Next mousemove scheduled in ${(randomDelay / 1000).toFixed(2)} seconds.`);
                } else {
                    console.log(`[QChengKeji] Next mousemove scheduled in ${(randomDelay / 1000).toFixed(2)} seconds.`);
                }


                // 调度下一次执行
                this.mouseMoveTimeout = setTimeout(simulateAndScheduleNext, randomDelay);
            };

            // 首次启动
            // 为了避免首次执行太快，也可以给第一次执行加一个初始的随机延时
            const initialMinDelay = 10000;
            const initialMaxDelay = 30000;
            const initialRandomDelay = Math.floor(Math.random() * (initialMaxDelay - initialMinDelay + 1)) + initialMinDelay;

            if (typeof utils !== 'undefined' && typeof utils.log === 'function') {
                utils.log(`[QChengKeji] Initial mousemove scheduled in ${(initialRandomDelay / 1000).toFixed(2)} seconds.`);
            } else {
                console.log(`[QChengKeji] Initial mousemove scheduled in ${(initialRandomDelay / 1000).toFixed(2)} seconds.`);
            }

            this.mouseMoveTimeout = setTimeout(simulateAndScheduleNext, initialRandomDelay);
        }

        playNextVideo() {
            utils.log('[QChengKeji] Attempting to find and click next video (specific structure).');
            let clickedNext = false;
            const $navList = $('.detmain-navlist');

            if (!$navList.length) {
                utils.log('[QChengKeji] .detmain-navlist not found. Falling back to generic.');
                this.playNextVideoGeneric();
                return;
            }

            let $currentLink = $navList.find('.item.sel a.on, .item.sel a, .item a.on').first();
            let $currentItem;

            if ($currentLink.length) {
                $currentItem = $currentLink.closest('.item');
            } else {
                // Fallback: if no .sel or .on, try to find any .item and assume the first one if nothing else indicates current
                // This part is tricky without a clear "current" marker if .sel/.on is missing.
                // For now, if .sel or .on is missing, we might be on a page where this logic isn't robust.
                utils.log('[QChengKeji] Could not reliably determine the current active item via .sel or .on classes. Falling back to generic.');
                this.playNextVideoGeneric();
                return;
            }

            if (!$currentItem.length) {
                utils.log('[QChengKeji] Current link found, but cannot find parent .item. Falling back to generic.');
                this.playNextVideoGeneric();
                return;
            }

            let $nextItemAnchor = $currentItem.nextAll('.item:first').find('a').first();

            if ($nextItemAnchor.length) {
                utils.log(`[QChengKeji] Found next item in current list: "${$nextItemAnchor.attr('title') || $nextItemAnchor.text().trim()}".Clicking.`);
                $nextItemAnchor[0].click(); // Use native click
                clickedNext = true;
            } else {
                const $currentGroup = $currentItem.closest('.group');
                if ($currentGroup.length) {
                    const $nextGroup = $currentGroup.nextAll('.group:first');
                    if ($nextGroup.length) {
                        $nextItemAnchor = $nextGroup.find('.list .item:first a').first();
                        if ($nextItemAnchor.length) {
                            utils.log(`[QChengKeji] No more items in current group.Found next group, clicking first item: "${$nextItemAnchor.attr('title') || $nextItemAnchor.text().trim()}".`);
                            $nextItemAnchor[0].click(); // Use native click
                            clickedNext = true;
                        } else {
                            utils.log('[QChengKeji] Found next group, but no clickable items in its list.');
                        }
                    } else {
                        utils.log('[QChengKeji] No next item in current list and no subsequent group found. Potentially end of all content.');
                    }
                } else {
                    utils.log('[QChengKeji] Could not find current group for the item. Structure might be different.');
                }
            }

            if (!clickedNext) {
                utils.log('[QChengKeji] Specific next video logic did not find/click a next item. Falling back to generic.');
                this.playNextVideoGeneric();
            }
        }

        playNextVideoGeneric() {
            utils.log('[QChengKeji] Attempting to find and click next video (Generic Fallback).');
            let clickedNextGeneric = false;

            const nextButtonSelectors = [
                'button:contains("下一节")', 'button:contains("Next")', 'a:contains("下一节")', 'a:contains("Next")',
                '.next-video', '.icon-next', '[class*="next"]', '[aria-label*="Next"]', '[title*="Next"]', '[title*="下一"]',
                '.vjs-next-button', '#nextButton', '#btnNext', '.next_button', '.next-btn',
                '.nextChapter', '.next_video_button', '.jw-button-container .jw-icon-next',
                '.navigation-button-next', '.pagination-next a'
            ];

            for (const selector of nextButtonSelectors) {
                const $buttons = $(selector).filter(':visible');
                if ($buttons.length > 0) {
                    $buttons.first()[0].click(); // Use native click
                    utils.log(`[QChengKeji](Generic) Clicked visible "next" button with selector: ${selector} `);
                    clickedNextGeneric = true;
                    break;
                }
                if (!clickedNextGeneric) {
                    const $hiddenButtons = $(selector);
                    if ($hiddenButtons.length > 0) {
                        $hiddenButtons.first()[0].click(); // Use native click
                        utils.log(`[QChengKeji](Generic) Clicked(possibly hidden) "next" button with selector: ${selector} `);
                        clickedNextGeneric = true;
                        break;
                    }
                }
            }
            if (clickedNextGeneric) return;

            const chapterListSelectors = [
                '.chapter-list li', '.video-list-item', '.playlist-item', '.toc-item',
                '.course-menu ul li', '.lesson-list .item', '.index_item.video', '.video_list li'
            ];

            for (const listSelector of chapterListSelectors) {
                const $items = $(listSelector);
                if ($items.length > 0) {
                    let currentIndex = -1;
                    $items.each(function (index) {
                        if ($(this).is('.active, .current, .playing, .on, .is-current, .current_play, .cur, .current_lesson, .sel')) {
                            currentIndex = index;
                            return false;
                        }
                    });

                    if (currentIndex !== -1 && currentIndex < $items.length - 1) {
                        const $nextItem = $($items[currentIndex + 1]);
                        if ($nextItem.is('.completed, .is_learned, .viewed')) {
                            utils.log(`[QChengKeji](Generic) Next item(index ${currentIndex + 1}) in list(${listSelector}) is marked completed, trying next one.`);
                            if (currentIndex + 2 < $items.length) {
                                const $nextNextItem = $($items[currentIndex + 2]);
                                if (!$nextNextItem.is('.completed, .is_learned, .viewed')) {
                                    const $clickableNN = $nextNextItem.find('a, button, [role="button"], .title, span').first();
                                    ($clickableNN.length > 0 ? $clickableNN : $nextNextItem)[0].click(); // Use native click
                                    utils.log(`[QChengKeji](Generic) Clicked next - next video item(index ${currentIndex + 2}) in list: ${listSelector} `);
                                    clickedNextGeneric = true;
                                    break;
                                }
                            }
                            continue;
                        }

                        const $clickable = $nextItem.find('a, button, [role="button"], .title, span').first();
                        ($clickable.length > 0 ? $clickable : $nextItem)[0].click(); // Use native click
                        utils.log(`[QChengKeji](Generic) Clicked next video item(index ${currentIndex + 1}) in list: ${listSelector} `);
                        clickedNextGeneric = true;
                        break;
                    }
                }
                if (clickedNextGeneric) break;
            }

            if (!clickedNextGeneric) {
                utils.log('[QChengKeji] (Generic Fallback) Could not find a "next video" mechanism. Manual intervention may be needed or selectors need adjustment.');
            }
        }

        destroy() {
            if (this.videoPlayInterval) clearInterval(this.videoPlayInterval);
            const autoPlayHelper = document.getElementById('qchengkeji-autoplay-helper');
            if (autoPlayHelper) autoPlayHelper.remove();
            this.removeCaptchaMessage(); // Ensure CAPTCHA message is removed on destroy
            utils.log('[QChengKeji] Controller destroyed.');
        }
    }

    // 修改 SmartEduController 类
    class SmartEduController {
        constructor() {
            this.confirmInterval = null;
            this.speedInterval = null;
            this.progressCheckInterval = null;
        }

        init() {
            utils.log('初始化 SmartEdu 控制器');
            this.initConfirmCheck();
            this.initSpeedVolumeControl();
            this.initProgressCheck();
        }

        initConfirmCheck() {
            this.confirmInterval = setInterval(() => {
                try {
                    const confirmBtn = $('.layui-layer-btn0');
                    if (confirmBtn.length > 0) {
                        confirmBtn.click();
                        utils.log('点击确定按钮');
                    }
                } catch (err) {
                    utils.log(`确认按钮检查出错: ${err.message} `);
                }
            }, 3000);
        }

        initSpeedVolumeControl() {
            // 添加一个静音播放的标志
            let autoPlayAttempted = false;

            this.speedInterval = setInterval(() => {
                try {
                    const video = document.querySelector('#video-Player video');
                    if (video) {
                        // 首次尝试播放时，先静音播放
                        if (!autoPlayAttempted) {
                            video.muted = true; // 先静音
                            video.play().then(() => {
                                // 播放成功后，设置实际音量
                                video.muted = false;
                                video.muted = true;
                                utils.log('视频开始播放');
                            }).catch(err => {
                                utils.log(`自动播放失败: ${err.message} `);
                                // 如果自动播放失败，添加点击事件监听器
                                if (!document.getElementById('autoPlayHelper')) {
                                    this.createAutoPlayHelper();
                                }
                            });
                            autoPlayAttempted = true;
                        }

                        // 设置播放速度
                        if (video.playbackRate !== SPEEDS.smartedu) {
                            video.playbackRate = SPEEDS.smartedu;
                            utils.log(`设置播放速度为 ${SPEEDS.smartedu} x`);
                        }

                        // 确保音量设置正确
                        if (!video.muted) {
                            video.muted = true;
                        }

                        // 输出当前状态
                        utils.log(`当前状态 - 速度: ${video.playbackRate} x, 音量: ${Math.round(video.volume * 100)}%, 播放中: ${!video.paused} `);
                    }
                } catch (err) {
                    utils.log(`播放控制出错: ${err.message} `);
                }
            }, 5000);
        }

        // 添加创建自动播放辅助按钮的方法
        createAutoPlayHelper() {
            const helper = document.createElement('button');
            helper.id = 'autoPlayHelper';
            helper.innerHTML = '点击开始自动播放';
            helper.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50 %;
    transform: translateX(-50 %);
    z - index: 9999;
    padding: 10px 20px;
    background: #4CAF50;
    color: white;
    border: none;
    border - radius: 5px;
    cursor: pointer;
    font - size: 16px;
    `;

            helper.onclick = () => {
                const video = document.querySelector('#video-Player video');
                if (video) {
                    video.muted = false;
                    video.muted = true;
                    video.play().then(() => {
                        helper.remove();
                        utils.log('用户触发播放成功');
                    }).catch(err => {
                        utils.log(`用户触发播放失败: ${err.message} `);
                    });
                }
            };

            document.body.appendChild(helper);
            utils.log('已添加自动播放辅助按钮，请点击按钮开始播放');
        }

        initProgressCheck() {
            this.progressCheckInterval = setInterval(() => {
                try {
                    // 使用正确的选择器找到当前选中的章节
                    const currentChapter = document.querySelector('div.video-title.clearfix.on');
                    if (!currentChapter) {
                        utils.log('未找到当前选中章节');
                        return;
                    }

                    // 获取进度信息
                    const progressSpan = currentChapter.querySelector('span.four');
                    if (progressSpan && progressSpan.textContent.includes('100')) {
                        utils.log('当前章节已完成，准备切换到下一章节');
                        this.switchToNextChapter(currentChapter);
                    } else {
                        // 输出当前章节的进度
                        const chapterTitle = currentChapter.querySelector('span.two')?.textContent || '未知章节';
                        const progress = progressSpan?.textContent || '0%';
                        utils.log(`当前章节: ${chapterTitle}, 进度: ${progress} `);
                    }
                } catch (err) {
                    utils.log(`进度检查出错: ${err.message} `);
                }
            }, 10000);
        }

        switchToNextChapter(currentChapter) {
            try {
                let foundNext = false;

                // 遍历所有章节，找到下一个未完成的章节
                const allChapters = document.querySelectorAll('div.video-title.clearfix');

                // 从第一个章节查找
                for (let i = 0; i < allChapters.length; i++) {
                    const progressSpan = allChapters[i].querySelector('span.four');
                    if (progressSpan && !progressSpan.textContent.includes('100')) {
                        // 找到下一个未完成的章节，点击其 video-title
                        allChapters[i].click();
                        const nextChapterTitle = allChapters[i].querySelector('span.two')?.textContent || '未知章节';
                        utils.log(`已切换到下一章节: ${nextChapterTitle} `);
                        foundNext = true;
                        break;
                    }
                }

                if (!foundNext) {
                    utils.log('所有章节已完成或未找到下一个可播放章节');
                }
            } catch (err) {
                utils.log(`切换章节出错: ${err.message} `);
            }
        }

        destroy() {
            if (this.confirmInterval) {
                clearInterval(this.confirmInterval);
            }
            if (this.speedInterval) {
                clearInterval(this.speedInterval);
            }
            if (this.progressCheckInterval) {
                clearInterval(this.progressCheckInterval);
            }
        }
    }

    // 主程序修改
    window.onload = function () {
        const pageTitle = document.title;
        utils.log(`当前页面: ${pageTitle} `);

        if (utils.isChengKejiPahe()) { // Check for QChengKeji first
            utils.log('[QChengKeji] Page detected by URL.');
            const qchengController = new QChengKejiController();
            qchengController.startVideoTasks();
        } else if (utils.isSmartEduPage()) {
            // SmartEdu 课程处理
            const smartEduController = new SmartEduController();
            smartEduController.init();
        } else if (utils.isLivePage()) {
            // 直播页面处理
            const liveController = new LiveController();
            liveController.init();
        } else if (pageTitle === "课程学习") {
            // 原有的视频课程处理
            const controller = new VideoController();
            controller.initVideoPlay();
            controller.initProgressMonitor();
        } else if (pageTitle === "我的培训课程") {
            // 原有的课程列表处理
            $(".detail-act2 li").each(function () {
                const statusSpan = $($(this).find("span.right1")[3]);
                if (statusSpan.text().trim() === "学习") {
                    const classLink = "https://onlinenew.enetedu.com/" +
                        $($(this).find("a")[0]).attr("href");

                    // 在后台打开新标签页
                    const newWindow = window.open(classLink, '_blank');
                    if (newWindow) {
                        newWindow.blur(); // 将新窗口置于后台
                        window.focus(); // 保持当前窗口焦点
                        utils.log(`已打开课程: ${classLink} `);
                    }
                }
            });
        }
    };
})();
