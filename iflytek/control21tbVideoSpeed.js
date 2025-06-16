// ==UserScript==
// @name         视频左右键快进/回退
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  使用左右键控制ifly.21tb.com视频快进/回退10秒
// @author       yuan
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/control21tbVideoSpeed.js
// @updateURL    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/control21tbVideoSpeed.js
// @match        *://ifly.21tb.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // 等待页面加载完成
    window.addEventListener('load', function () {
        console.log('Tampermonkey 脚本已加载');

        // 监听键盘事件
        document.addEventListener('keydown', function (event) {
            const LEFT_ARROW = 37;
            const RIGHT_ARROW = 39;

            // 获取 video 元素
            const video = document.querySelector('div#J_prismPlayer video');

            if (!video) {
                console.warn('未找到视频元素');
                return;
            }

            // 左键 ← 回退10秒
            if (event.keyCode === LEFT_ARROW) {
                video.currentTime = Math.max(0, video.currentTime - 10);
                console.log('回退10秒');
            }

            // 右键 → 快进10秒
            if (event.keyCode === RIGHT_ARROW) {
                video.currentTime = Math.min(video.duration, video.currentTime + 10);
                console.log('快进10秒');
            }
        });
    });
})();
