// ==UserScript==
// @name         ifly视频左右键快进/回退
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  使用左右键控制ifly.21tb.com视频快进/回退10秒，并绑定数字倍速
// @author       yuan
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/control21tbVideoSpeed.js
// @updateURL    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/control21tbVideoSpeed.js
// @match        *://ifly.21tb.com/*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    function setupVideoControl() {
        const video = document.querySelector('div#J_prismPlayer video');
        if (!video) return;

        console.log('[脚本] 视频元素已找到，开始绑定键盘事件');

        // 键盘控制
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            switch (e.key) {
                case 'ArrowLeft':
                    video.currentTime = Math.max(0, video.currentTime - 10);
                    break;
                case 'ArrowRight':
                    video.currentTime = Math.min(video.duration, video.currentTime + 10);
                    break;
                case '1':
                    video.playbackRate = 1.0;
                    updateSpeedDisplay();
                    break;
                case '2':
                    video.playbackRate = 1.5;
                    updateSpeedDisplay();
                    break;
                case '3':
                    video.playbackRate = 2.0;
                    updateSpeedDisplay();
                    break;
            }
        });

        // 如果没有倍速UI，则添加
        if (!document.querySelector('#custom-speed-control')) {
            const speedBox = document.createElement('div');
            speedBox.id = 'custom-speed-control';
            speedBox.style.position = 'fixed';
            speedBox.style.bottom = '20px';
            speedBox.style.right = '20px';
            speedBox.style.background = 'rgba(0,0,0,0.6)';
            speedBox.style.color = 'white';
            speedBox.style.padding = '8px 12px';
            speedBox.style.borderRadius = '10px';
            speedBox.style.fontSize = '14px';
            speedBox.style.zIndex = 9999;
            speedBox.style.cursor = 'pointer';
            speedBox.innerText = `当前速度：${video.playbackRate}x`;
            document.body.appendChild(speedBox);

            speedBox.addEventListener('click', () => {
                const nextRates = [1.0, 1.25, 1.5, 2.0];
                const currentIdx = nextRates.indexOf(video.playbackRate);
                const nextIdx = (currentIdx + 1) % nextRates.length;
                video.playbackRate = nextRates[nextIdx];
                updateSpeedDisplay();
            });
        }

        function updateSpeedDisplay() {
            const box = document.querySelector('#custom-speed-control');
            if (box) {
                box.innerText = `当前速度：${video.playbackRate}x`;
            }
        }
    }

    // 页面加载后可能视频还未加载，做观察/延时处理
    const interval = setInterval(() => {
        const video = document.querySelector('div#J_prismPlayer video');
        if (video) {
            clearInterval(interval);
            setupVideoControl();
        }
    }, 1000);
})();