// 教师网课助手 Pro - Content Script

(function () {
    'use strict';

    // 注入页面脚本 (inject.js)
    function injectScript(file) {
        var th = document.getElementsByTagName('body')[0];
        var s = document.createElement('script');
        s.setAttribute('type', 'text/javascript');
        s.setAttribute('src', chrome.runtime.getURL(file));
        th.appendChild(s);
    }
    // 针对特定域名注入
    if (window.location.href.includes('szh.enetedu.com')) {
        injectScript('inject.js');
    }

    // ================== 1. 鉴权模块 ==================
    const Auth = {
        keyConfig: {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256"
        },

        pemToArrayBuffer(pem) {
            const b64 = pem.replace(/(-----(BEGIN|END) PUBLIC KEY-----|\n)/g, '');
            const binary = atob(b64);
            const buffer = new ArrayBuffer(binary.length);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < binary.length; i++) {
                view[i] = binary.charCodeAt(i);
            }
            return buffer;
        },

        async getNetworkTime() {
            try {
                // 修改：请求当前页面的完整 URL，避免根域名重定向导致的 CORS 问题
                // 使用 cache: 'no-store' 确保获取服务器最新时间
                const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
                const dateHeader = response.headers.get('Date');
                if (dateHeader) {
                    return new Date(dateHeader).getTime();
                }
                return Date.now();
            } catch (e) {
                console.warn("无法获取网络时间，使用本地时间", e);
                return Date.now();
            }
        },

        async check() {
            try {
                const result = await chrome.storage.local.get(['licenseKey']);
                if (!result.licenseKey) return false;

                const [dataB64, signatureB64] = result.licenseKey.split('.');
                if (!dataB64 || !signatureB64) return false;

                const dataStr = atob(dataB64);
                const dataObj = JSON.parse(dataStr);

                if (typeof PUBLIC_KEY_PEM === 'undefined') {
                    console.error("公钥丢失");
                    return false;
                }

                const keyData = this.pemToArrayBuffer(PUBLIC_KEY_PEM);
                const key = await window.crypto.subtle.importKey(
                    "spki", keyData, this.keyConfig, false, ["verify"]
                );

                const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
                const data = new TextEncoder().encode(dataStr);

                const isValid = await window.crypto.subtle.verify(
                    "RSASSA-PKCS1-v1_5", key, signature, data
                );

                if (!isValid) return false;

                const now = await this.getNetworkTime();
                const deadline = new Date(dataObj.deadline).getTime();

                if (now > deadline) {
                    console.log(`授权已过期: ${dataObj.deadline}`);
                    return false;
                }

                return true;
            } catch (e) {
                console.error("鉴权异常", e);
                return false;
            }
        }
    };

    // ================== 2. 核心业务逻辑 (从 enetedu.js 移植) ==================

    // 配置
    const speed = 3.0;
    const liveSpeed = 5.0;
    const SPEEDS = {
        normal: 2.0,
        live: 4.0,
        smartedu: 2.0
    };

    // 工具函数
    const utils = {
        randomNum(minNum, maxNum) {
            return Math.floor(Math.random() * (maxNum - minNum + 1) + minNum);
        },
        log(message) {
            console.log(`[网课助手] ${new Date().toLocaleTimeString()} - ${message}`);
        },
        error(message) {
            console.error(`[网课助手] ${new Date().toLocaleTimeString()} - ${message}`);
        },
        isLivePage() {
            return window.location.href.includes('huiyi.enetedu.com/liveWacth') || window.location.href.includes('szh.enetedu.com');
        },
        isSmartEduPage() {
            return window.location.href.includes('smartedu.cn/p/course');
        },
        isChengKejiPage() {
            return window.location.href.includes("bwgl.qchengkeji.com/user/node");
        },
        isEneteduPage() {
            return window.location.href.includes('onlinenew.enetedu.com');
        },
        isOnlineNewListPage() {
            return window.location.href.includes('onlinenew.enetedu.com') && window.location.href.includes('/MyTrainCourse/Index');
        }
    };

    // 课程缓存管理
    const CourseCache = {
        key: 'enetedu_learning_courses',
        getCourseId(url) {
            const match = url.match(/[?&]id=(\d+)/);
            return match ? match[1] : null;
        },
        getAll() {
            try {
                return JSON.parse(localStorage.getItem(this.key) || '[]');
            } catch (e) {
                return [];
            }
        },
        add(urlOrId) {
            const id = this.getCourseId(urlOrId) || urlOrId;
            if (!id) return;
            const list = this.getAll();
            if (!list.includes(id)) {
                list.push(id);
                localStorage.setItem(this.key, JSON.stringify(list));
                utils.log(`[缓存] 添加课程ID: ${id}`);
            }
        },
        remove(urlOrId) {
            const id = this.getCourseId(urlOrId) || urlOrId;
            if (!id) return;
            const list = this.getAll();
            const newList = list.filter(item => item !== id);
            localStorage.setItem(this.key, JSON.stringify(newList));
            utils.log(`[缓存] 移除课程ID: ${id}`);
        },
        has(urlOrId) {
            const id = this.getCourseId(urlOrId) || urlOrId;
            if (!id) return false;
            return this.getAll().includes(id);
        }
    };

    // 返回课程列表页的通用函数
    function returnToCourseList(delay = 3000, logMessage = '返回课程列表页') {
        if (window.location.href.includes('onlinenew.enetedu.com')) {
            utils.log(logMessage);
            setTimeout(() => {
                const pathParts = window.location.pathname.split('/');
                const schoolCode = pathParts[1];
                if (schoolCode) {
                    const listUrl = `${window.location.origin}/${schoolCode}/MyTrainCourse/Index?newSearchFlag=true`;
                    utils.log(`跳转回列表: ${listUrl}`);
                    window.location.href = listUrl;
                } else {
                    utils.error('无法提取院校代码，执行默认关闭操作');
                    setTimeout(() => { window.close(); }, 3000);
                }
            }, delay);
        } else {
            utils.log('非 onlinenew.enetedu.com 页面，3秒后关闭');
            setTimeout(() => { window.close(); }, 3000);
        }
    }

    // 视频控制器
    class VideoController {
        constructor() {
            this.playInterval = null;
            this.lastForceReportTime = 0;
            this.lastLogTime = 0;
            this.lastProgressUpdateTime = Date.now();
            this.lastProgressValue = 0;
            this.progressCheckInterval = null;
        }

        initVideoPlay() {
            // 注意：Chrome插件多开逻辑由Popup控制，这里不再强制检查缓存互斥，
            // 但保留记录缓存以便状态管理
            CourseCache.add(window.location.href);
            utils.log(`课程已添加到学习缓存: ${window.location.href}`);

            window.addEventListener('beforeunload', () => {
                CourseCache.remove(window.location.href);
            });

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
                        videoElement.play();
                        videoElement.muted = true
                        try {
                            videoElement.playbackRate = speed;
                            // 减少日志频率
                            // utils.log(`视频开始播放，音量设置为1%，播放速度${speed}倍`);
                        } catch (err) {
                            utils.log(`设置播放速度失败: ${err.message}`);
                        }
                    }
                } catch (err) {
                    // utils.log(`播放出错: ${err.message}`);
                }
            }, 5000);
        }

        initProgressMonitor() {
            this.lastProgressUpdateTime = Date.now();
            this.lastProgressValue = 0;

            const STUCK_CHECK_INTERVAL = 600000;
            this.progressCheckInterval = setInterval(() => {
                const now = Date.now();
                const timeSinceLastUpdate = now - this.lastProgressUpdateTime;

                if (timeSinceLastUpdate >= STUCK_CHECK_INTERVAL) {
                    utils.log(`检测到10分钟内进度无变化，刷新页面`);
                    window.location.reload();
                }
            }, 60000);

            // 原始的视频进度监听逻辑
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

        handleVideoProgress(event) {
            const video = event.target;
            const currentTime = Math.ceil(video.currentTime);
            const duration = Math.ceil(video.duration);

            try {
                if (video && video.playbackRate !== speed) {
                    video.playbackRate = speed;
                }
            } catch (err) { }

            if (Math.abs(currentTime - this.lastLogTime) >= 6) {
                utils.log(`当前视频进度: ${currentTime}s/${duration}s，播放速度: ${video.playbackRate}倍`);
                this.lastLogTime = currentTime;
                this.lastProgressUpdateTime = Date.now();
                this.lastProgressValue = currentTime;
                this.checkCurrentProgress();
            }
        }

        checkCurrentProgress() {
            this.checkProgressByAPI().then((apiResult) => {
                if (apiResult !== null) {
                    this.handleProgressResult(apiResult);
                } else {
                    this.checkProgressByElement();
                }
            }).catch((error) => {
                utils.log(`接口检测失败: ${error.message}，使用页面元素检测`);
                this.checkProgressByElement();
            });
        }

        extractDomainWithFirstPath(url) {
            try {
                const urlObj = new URL(url);
                const pathname = urlObj.pathname;
                const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
                const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                if (pathSegments.length > 0) {
                    return `${baseUrl}/${pathSegments[0]}`;
                }
                return baseUrl;
            } catch (error) {
                return null;
            }
        }

        async checkProgressByAPI() {
            try {
                const currentUrl = window.location.href;
                const urlParams = new URLSearchParams(window.location.search);
                const coursetype = urlParams.get('coursetype') || this.extractCourseIdFromUrl(currentUrl) || 2;
                const coursewareId = urlParams.get('coursewareid') || this.extractCoursewareIdFromUrl(currentUrl);

                if (!coursetype || !coursewareId) {
                    return null;
                }

                const apiUrl = this.extractDomainWithFirstPath(currentUrl) + "/MyTrainCourse/PercentageCourse";

                // 使用 fetch 替代 GM.xmlHttpRequest
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': '*/*',
                        'x-requested-with': 'XMLHttpRequest'
                    },
                    body: `coursetype=${coursetype}&coursewareid=${coursewareId}`
                });

                if (!response.ok) throw new Error('API request failed');

                const data = await response.text();
                const percentage = parseFloat(data.replace('%', ''));

                return {
                    percentage: percentage,
                    isComplete: percentage >= 100,
                    source: 'api'
                };
            } catch (error) {
                utils.log(`接口检测异常: ${error.message}`);
                return null;
            }
        }

        extractCourseIdFromUrl(url) {
            let match = url.match(/coursetype=(\d+)/);
            if (match) return match[1];
            match = url.match(/id=(\d+)/);
            return match ? match[1] : null;
        }

        extractCoursewareIdFromUrl(url) {
            const match = url.match(/coursewareid=(\d+)/);
            return match ? match[1] : null;
        }

        handleProgressResult(result) {
            if (result.source === 'api') {
                if (result.isComplete) {
                    utils.log(`接口检测：当前章节已完成 (${result.percentage}%)，准备切换`);
                    this.switchToNextVideo();
                }
            }
        }

        collectVideoElements() {
            const currentFullUrl = window.location.href;
            const videoElements = [];
            let currentVideoIndex = -1;
            let currentVideoComplete = false;

            $(".classcenter-chapter2 ul li").each(function (index) {
                const $this = $(this);
                const onclickAttr = $this.attr('onclick');
                let isCurrentVideo = $this.css("background-color") === "rgb(204, 197, 197)" || $this.css("background-color") === "#ccc5c5";

                if (onclickAttr && onclickAttr.includes('location.href=')) {
                    const onclickUrlPart = onclickAttr.match(/location\.href='([^']+)'/);
                    if (onclickUrlPart && onclickUrlPart[1]) {
                        const relativePath = onclickUrlPart[1].replace(/&/g, '&');
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

                if (isCurrentVideo) {
                    currentVideoIndex = index;
                    currentVideoComplete = isComplete;
                }
            });

            return {
                videoElements: videoElements,
                currentVideoIndex: currentVideoIndex,
                currentVideoComplete: currentVideoComplete
            };
        }

        handleVideoSwitch(source = 'unknown') {
            const { videoElements, currentVideoIndex, currentVideoComplete } = this.collectVideoElements();

            if (currentVideoIndex === -1) return;

            if (source === '页面元素检测' && !currentVideoComplete) return;

            let nextIncompleteVideoIndex = -1;

            if (source === '接口检测') {
                for (let i = currentVideoIndex + 1; i < videoElements.length; i++) {
                    if (!videoElements[i].isComplete) {
                        nextIncompleteVideoIndex = i;
                        break;
                    }
                }
                if (nextIncompleteVideoIndex === -1) {
                    for (let i = 0; i < currentVideoIndex; i++) {
                        if (!videoElements[i].isComplete) {
                            nextIncompleteVideoIndex = i;
                            break;
                        }
                    }
                }
            } else {
                for (let i = 0; i < videoElements.length; i++) {
                    if (!videoElements[i].isComplete) {
                        nextIncompleteVideoIndex = i;
                        break;
                    }
                }
            }

            if (nextIncompleteVideoIndex !== -1) {
                const nextVideo = videoElements[nextIncompleteVideoIndex];
                nextVideo.element.trigger("click");
                utils.log(`切换到下一个视频 (索引: ${nextIncompleteVideoIndex})`);
            } else {
                utils.log(`所有视频播放完成`);
                CourseCache.remove(window.location.href);
                // 自动关闭页面
                setTimeout(() => { window.close(); }, 3000);
            }
        }

        checkProgressByElement() {
            this.handleVideoSwitch('页面元素检测');
        }

        switchToNextVideo() {
            this.handleVideoSwitch('接口检测');
        }
    }

    // (简化版) 直播控制器 - 如需完整功能需补全
    class LiveController {
        init() {
            utils.log("直播页面 - 逻辑初始化");
            setInterval(() => {
                const video = document.querySelector('video');
                if (video && video.paused) video.play();
            }, 3000);
        }
    }

    // (简化版) SmartEduController
    class SmartEduController {
        init() {
            utils.log("SmartEdu 页面 - 逻辑初始化");
        }
    }

    // (简化版) QChengKejiController
    class QChengKejiController {
        startVideoTasks() {
            utils.log("启城科技 - 逻辑初始化");
        }
    }


    // 业务入口管理器
    const App = {
        isRunning: false,

        async start() {
            if (this.isRunning) return;

            const isAuth = await Auth.check();
            if (!isAuth) {
                console.log("未检测到有效授权，脚本待机中...");
                this.showAuthWarning();
                return;
            }

            this.isRunning = true;
            this.removeAuthWarning();
            utils.log("授权验证通过，引擎启动 🚀");

            if (utils.isChengKejiPage()) {
                new QChengKejiController().startVideoTasks();
            } else if (utils.isSmartEduPage()) {
                new SmartEduController().init();
            } else if (utils.isLivePage()) {
                new LiveController().init();
            } else if (utils.isEneteduPage()) {
                if (utils.isOnlineNewListPage()) {
                    utils.log("位于课程列表页，等待指令...");
                } else {
                    const controller = new VideoController();
                    controller.initVideoPlay();
                    controller.initProgressMonitor();
                }
            }
        },

        showAuthWarning() {
            if (document.getElementById('auth-warning-banner')) return;
            const div = document.createElement('div');
            div.id = 'auth-warning-banner';
            div.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#e74c3c;color:white;text-align:center;padding:10px;z-index:999999;font-size:14px;';
            div.innerHTML = '网课助手未授权或已过期，请点击插件图标进行激活。';
            document.body.appendChild(div);
        },

        removeAuthWarning() {
            const div = document.getElementById('auth-warning-banner');
            if (div) div.remove();
        },

        getUnlearnedCourses() {
            const urls = [];
            const $ = window.jQuery || window.$;

            if ($) {
                $(".detail-act2 li").each(function () {
                    const statusSpan = $($(this).find("span.right1")[3]);
                    if (statusSpan && statusSpan.text().trim() === "学习") {
                        const relativeLink = $($(this).find("a")[0]).attr("href");
                        if (relativeLink) {
                            const fullUrl = new URL(relativeLink, window.location.href).href;
                            urls.push(fullUrl);
                        }
                    }
                });
            } else {
                const items = document.querySelectorAll(".detail-act2 li");
                items.forEach(li => {
                    const spans = li.querySelectorAll("span.right1");
                    if (spans.length >= 4 && spans[3].textContent.trim() === "学习") {
                        const a = li.querySelector("a");
                        if (a) urls.push(a.href);
                    }
                });
            }
            return urls;
        }
    };

    // 消息监听
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "start_learning") {
            App.start();
            sendResponse({ status: "started" });
        } else if (request.action === "get_unlearned_courses") {
            Auth.check().then(isAuth => {
                if (isAuth) {
                    const courses = App.getUnlearnedCourses();
                    sendResponse({ courses: courses });
                } else {
                    App.showAuthWarning();
                    sendResponse({ courses: [] });
                }
            });
            return true;
        } else if (request.action === "auth_updated") {
            App.start();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.start());
    } else {
        App.start();
    }

})();
