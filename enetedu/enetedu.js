// ==UserScript==
// @name         教师网课助手
// @namespace    https://onlinenew.enetedu.com/
// @version      0.5.5
// @description  适用于网址是 https://onlinenew.enetedu.com/ 和 smartedu.cn 和 qchengkeji 的网站自动刷课，自动点击播放，检查视频进度，自动切换下一个视频
// @author       Praglody,vampirehA
// @match        onlinenew.enetedu.com/*/MyTrainCourse/*
// @match        huiyi.enetedu.com/liveWacth/*
// @match        *.smartedu.cn/p/course/*
// @match        bwgl.qchengkeji.com/user/node?nodeId=*
// @grant        none
// @require      https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js
// @license MIT
// @thanks        https://update.greasyfork.org/scripts/497263/%2A2024%E7%89%88%E7%BB%A7%E7%BB%AD%E6%95%99%E8%82%B2%2A%E5%85%A8%E5%9B%BD%E9%AB%98%E6%A0%A1%E6%95%99%E5%B8%88%E7%BD%91%E7%BB%9C%E5%9F%B9%E8%AE%AD%E4%B8%AD%E5%BF%83-%E8%87%AA%E5%8A%A8%E5%88%B7%E8%AF%BE.user.js
// @downloadURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/enetedu/enetedu.js
// @updateURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/enetedu/enetedu.js
// ==/UserScript==

(function () {
    'use strict';
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

        isLivePage() {
            return window.location.href.includes('huiyi.enetedu.com/liveWacth');
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
                        videoElement.volume = 0.01;
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
            setTimeout(() => {
                try {
                    const iframe = $(".classcenter-chapter1 iframe").contents();
                    iframe.find("video").on("timeupdate", this.handleVideoProgress.bind(this));
                } catch (err) {
                    utils.log(`进度监控初始化失败: ${err.message}`);
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

            if (currentTime >= duration) {
                this.handleVideoComplete();
            } else {
                this.checkCurrentProgress();
            }
            utils.log(`当前视频进度: ${currentTime}s/${duration}s，播放速度: ${video.playbackRate}倍`);
        }

        // 处理视频完成
        handleVideoComplete() {
            let hasNextVideo = false;
            $(".classcenter-chapter2 ul li").each(function () {
                if ($(this).css("background-color") !== "rgb(204, 197, 197)" &&
                    $(this).find("span").text() !== "[100%]") {
                    hasNextVideo = true;
                    $(this).trigger("click");
                    utils.log("切换到下一个视频");
                    return false;
                }
            });

            if (!hasNextVideo) {
                clearInterval(this.playInterval);
                utils.log("所有视频播放完成");
            }
            // 5s输出一次播放进度
            setTimeout(() => {
                utils.log(`视频播放中，当前时间: ${Math.ceil(video.currentTime)}s`);
            }, 5000);
        }

        // 检查当前进度
        checkCurrentProgress() {
            let nextVideoFound = false;
            let allComplete = true;

            $(".classcenter-chapter2 ul li").each(function () {
                const isCurrentVideo = $(this).css("background-color") === "rgb(204, 197, 197)";
                const isComplete = $(this).find("span").text() === "[100%]";
                if (isCurrentVideo && isComplete && !nextVideoFound) {
                    nextVideoFound = true;
                } else if (!isCurrentVideo && !isComplete && nextVideoFound) {
                    $(this).trigger("click");
                    utils.log("当前视频已完成，切换到下一个");
                    nextVideoFound = false;
                    allComplete = false;
                    return false;
                }
            });

            if (allComplete && nextVideoFound) {
                $(".buttonmore-red").trigger("click");
                utils.log("课程完成，返回目录");
            }
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
                        video.volume = 0.01;
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
                    utils.log(`确认按钮检查出错: ${err.message}`);
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
                                video.volume = 0.01;
                                utils.log('视频开始播放');
                            }).catch(err => {
                                utils.log(`自动播放失败: ${err.message}`);
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
                            utils.log(`设置播放速度为 ${SPEEDS.smartedu}x`);
                        }

                        // 确保音量设置正确
                        if (!video.muted && video.volume !== 0.01) {
                            video.volume = 0.01;
                        }

                        // 输出当前状态
                        utils.log(`当前状态 - 速度: ${video.playbackRate}x, 音量: ${Math.round(video.volume * 100)}%, 播放中: ${!video.paused}`);
                    }
                } catch (err) {
                    utils.log(`播放控制出错: ${err.message}`);
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
                left: 50%;
                transform: translateX(-50%);
                z-index: 9999;
                padding: 10px 20px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            `;

            helper.onclick = () => {
                const video = document.querySelector('#video-Player video');
                if (video) {
                    video.muted = false;
                    video.volume = 0.01;
                    video.play().then(() => {
                        helper.remove();
                        utils.log('用户触发播放成功');
                    }).catch(err => {
                        utils.log(`用户触发播放失败: ${err.message}`);
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
                        utils.log(`当前章节: ${chapterTitle}, 进度: ${progress}`);
                    }
                } catch (err) {
                    utils.log(`进度检查出错: ${err.message}`);
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
                        utils.log(`已切换到下一章节: ${nextChapterTitle}`);
                        foundNext = true;
                        break;
                    }
                }

                if (!foundNext) {
                    utils.log('所有章节已完成或未找到下一个可播放章节');
                }
            } catch (err) {
                utils.log(`切换章节出错: ${err.message}`);
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
        utils.log(`当前页面: ${pageTitle}`);

        if (utils.isSmartEduPage()) {
            // SmartEdu 课程处理
            const smartEduController = new SmartEduController();
            smartEduController.init();
        } else if (utils.isLivePage() || utils.isChengKejiPahe()) {
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
                        utils.log(`已打开课程: ${classLink}`);
                    }
                }
            });
        }
    };
})();