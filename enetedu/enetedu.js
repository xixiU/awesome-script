// ==UserScript==
// @name         继续教育*全国高校教师网络培训中心-自动刷课
// @namespace    https://onlinenew.enetedu.com/
// @version      0.4
// @description  适用于网址是 https://onlinenew.enetedu.com/ 的网站自动刷课，自动点击播放，检查视频进度，自动切换下一个视频
// @author       Praglody,vampirehA
// @match        onlinenew.enetedu.com/*/MyTrainCourse/*
// @grant        none
// @require      https://cdn.bootcdn.net/ajax/libs/jquery/3.7.1/jquery.min.js
// @license MIT
// @downloadURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/enetedu/enetedu.js
// @updateURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/enetedu/enetedu.js
// ==/UserScript==

(function () {
    'use strict';

    // 工具函数
    const utils = {
        randomNum(minNum, maxNum) {
            return Math.floor(Math.random() * (maxNum - minNum + 1) + minNum);
        },

        log(message) {
            console.log(`[自动刷课] ${new Date().toLocaleTimeString()} - ${message}`);
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
                        }, utils.randomNum(15, 40) * 100);
                        return;
                    }

                    // 播放视频
                    const video = iframe.find("video");
                    if (video.length > 0) {
                        video.trigger("play");
                        video[0].volume = 0.01;
                        utils.log("视频开始播放，音量设置为1%");
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

            if (currentTime >= duration) {
                this.handleVideoComplete();
            } else {
                this.checkCurrentProgress();
            }
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
            utils.log(`视频播放中，当前时间: ${Math.ceil(video.currentTime)}s`);
        }

        // 检查当前进度
        checkCurrentProgress() {
            let nextVideoFound = false;
            let allComplete = true;

            $(".classcenter-chapter2 ul li").each(function () {
                const isCurrentVideo = $(this).css("background-color") === "rgb(204, 197, 197)";
                const isComplete = $(this).find("span").text() === "[100%]";
                utils.log(`当前视频进度: ${isCurrentVideo ? "播放中" : "未播放"}, 是否完成: ${isComplete}`);
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

    // 主程序
    window.onload = function () {
        const pageTitle = document.title;
        utils.log(`当前页面: ${pageTitle}`);

        if (pageTitle === "课程学习") {
            const controller = new VideoController();
            controller.initVideoPlay();
            controller.initProgressMonitor();
        } else if (pageTitle === "课单-课程列表") {
            $(".per-class2 dl").each(function () {
                const statusSpan = $($(this).find("dd span")[0]).html();
                if (statusSpan === "学习中") {
                    const classLink = "https://onlinenew.enetedu.com/" +
                        $($(this).find("dt a")[0]).attr("href");
                    window.location.href = classLink;
                    return false;
                }
            });
        }
    };
})();