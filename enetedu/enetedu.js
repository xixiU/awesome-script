// ==UserScript==
// @name         继续教育*全国高校教师网络培训中心-自动刷课
// @namespace    https://onlinenew.enetedu.com/
// @version      0.2
// @description  适用于网址是 https://onlinenew.enetedu.com/ 的网站自动刷课，自动点击播放，检查当前视频是否已经是播放完毕的，当前视频播放完成的则自动播放下一个视频，列表播放完毕后自动返回目录。
// @author       Praglody,vampirehA
// @match        onlinenew.enetedu.com/*/MyTrainCourse/*
// @grant        none
// @require      https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js
// @license MIT
// @downloadURL 
// @updateURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/enetedu/enetedu.js
// ==/UserScript==
(function () {
    'use strict';

    /**
     * 随机生成一个范围内的整数
     * @param {number} minNum - 最小值
     * @param {number} maxNum - 最大值
     * @returns {number} 随机整数
     */
    function randomNum(minNum, maxNum) {
        return Math.floor(Math.random() * (maxNum - minNum + 1) + minNum);
    }

    /**
     * 处理课程学习页面逻辑
     */
    function handleCourseLearning() {
        const intervalId = setInterval(() => {
            const iframe = $(".classcenter-chapter1 iframe").contents();
            const layerIframe = iframe.find(".layui-layer-content iframe");

            // 检测弹窗问题并点击“确定”
            if (layerIframe.length > 0) {
                setTimeout(() => {
                    console.log("点击确定按钮");
                    layerIframe.contents().find("#questionid~div button").trigger("click");
                }, randomNum(15, 40) * 100); // 随机延迟点击
            } else {
                // 开始播放视频并设置音量
                const video = iframe.find("video");
                if (video.length > 0) {
                    video.trigger("play");
                    video[0].volume = 0.01; // 设置音量为 1%
                    console.log("视频已开始播放，音量设置为 1%");
                }
            }

            console.log(`当前时间: ${new Date().toLocaleTimeString()}, iframe长度: ${iframe.length}`);
        }, 5000);

        setTimeout(() => {
            const iframe = $(".classcenter-chapter1 iframe").contents();
            iframe.find("video").on("timeupdate", function () {
                const video = this;
                if (Math.ceil(video.currentTime) >= Math.ceil(video.duration) / 2) {
                    // 视频播放完成，切换到下一个
                    let nextVideoFlag = false;
                    $(".classcenter-chapter2 ul li").each(function () {
                        const backgroundColor = $(this).css("background-color");
                        const progressText = $(this).find("span").text();
                        console.log(`当前视频状态: ${backgroundColor}, 进度: ${progressText}`);
                        if (backgroundColor !== "rgb(204, 197, 197)" && progressText !== "[100%]") {
                            nextVideoFlag = true;
                            $(this).trigger("click");
                            console.log("切换到下一个未完成的视频");
                            return false;
                        }
                    });

                    if (!nextVideoFlag) {
                        clearInterval(intervalId);
                        console.log("所有视频播放完毕，返回课程目录");
                        $(".buttonmore-red").trigger("click");
                    }
                } else {
                    console.log(`视频播放中，当前时间: ${Math.ceil(video.currentTime)}s`);
                }
            });
        }, 8000);
    }

    /**
     * 处理课程列表页面逻辑
     */
    function handleCourseList() {
        $(".per-class2 dl").each(function () {
            const classStatus = $($(this).find("dd span")[0]).html();

            if (classStatus === "学习中") {
                const classLink = "https://onlinenew.enetedu.com/" + $($(this).find("dt a")[0]).attr("href");
                console.log(`跳转到课程链接: ${classLink}`);
                window.location.href = classLink;
            }
        });
    }

    // 页面加载完成后执行逻辑
    window.onload = function () {
        const pageTitle = document.title;
        console.log(`当前页面标题: ${pageTitle}`);

        if (pageTitle === "课程学习") {
            handleCourseLearning();
        } else if (pageTitle === "课单-课程列表") {
            handleCourseList();
        }
    };
})();
