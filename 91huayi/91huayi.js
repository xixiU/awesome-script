// ==UserScript==
// @name         ztpx终极学习助手 (全局蒙层授权版)
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  [最终方案] 创建一个全局蒙层，强制用户进行一次真实点击以激活浏览器音频权限，解决所有自动播放问题。
// @author       Your Name
// @match        *://ztpx.91huayi.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // --- 状态标记 ---
    let isPlayerControlInitialized = false;

    // ===================================================================================
    // 功能一：API请求拦截 (用于跳过人脸识别)
    // ===================================================================================
    const targetUrlPath = '/Exercise/FaceAuth/GetQRCodeScanResult';
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function (url, options) {
        const requestUrl = (url instanceof Request) ? url.url : url;
        if (requestUrl.includes(targetUrlPath) && (options?.method?.toUpperCase() === 'GET' || options?.method === undefined)) {
            return originalFetch.apply(this, arguments).then(response => response.clone().json().then(data => new Response(JSON.stringify({ ...data, state: 1 }), { status: response.status, statusText: response.statusText, headers: response.headers })).catch(() => response));
        }
        return originalFetch.apply(this, arguments);
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) { this._method = method; this._url = url; return originalOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
        if (this._url?.includes(targetUrlPath) && this._method?.toUpperCase() === 'GET') {
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = function () {
                if (this.readyState === 4 && this.status === 200) {
                    try {
                        const modifiedResponse = { ...JSON.parse(this.responseText), state: 1 };
                        Object.defineProperty(this, 'responseText', { value: JSON.stringify(modifiedResponse), writable: true });
                        Object.defineProperty(this, 'response', { value: JSON.stringify(modifiedResponse), writable: true });
                    } catch (e) { }
                }
                originalOnReadyStateChange?.apply(this, arguments);
            };
        }
        return originalSend.apply(this, arguments);
    };


    // ===================================================================================
    // 功能二：通过“全局授权蒙层”来激活和控制播放器
    // ===================================================================================
    const initializePlayerControl = () => {
        if (isPlayerControlInitialized) return;

        const player = unsafeWindow.bjyV;
        const playerWrap = document.querySelector('.bplayer-wrap');

        // 只有API和播放器DOM都就绪时，才继续
        if (typeof player !== 'object' || player === null || !playerWrap) {
            return;
        }

        // --- 核心逻辑：创建全局蒙层，请求用户点击授权 ---
        isPlayerControlInitialized = true;
        console.log('【播放器API】检测到播放器，正在创建“用户授权”全局蒙层...');

        // 1. 创建蒙层元素
        const overlay = document.createElement('div');
        overlay.id = 'gm-unlock-overlay'; // 赋予ID，方便调试
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            zIndex: '2147483647', // 使用CSS能设置的最大层级
            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            fontSize: '32px', fontWeight: 'bold', fontFamily: 'sans-serif',
            cursor: 'pointer', userSelect: 'none', textAlign: 'center',
            padding: '20px', lineHeight: '1.5'
        });
        overlay.innerHTML = '▶ 点击屏幕任意位置以开始自动播放<br><small style="font-size: 18px; font-weight: normal;">(此为浏览器安全策略要求，仅需一次)</small>';

        // 2. 绑定一次性的点击事件监听器
        overlay.addEventListener('click', () => {
            console.log('【播放器API】接收到“用户授权”点击，正在激活播放器...');
            try {
                if (typeof player.setVolume === 'function') player.setVolume(0);
                if (typeof player.play === 'function') player.play();

                setInterval(() => {
                    const currentPlayer = unsafeWindow.bjyV;
                    if (currentPlayer) {
                        const isPaused = (typeof currentPlayer.isPaused === 'function' && currentPlayer.isPaused()) || currentPlayer.paused === true;
                        if (isPaused) currentPlayer.play?.();
                    }
                }, 3000);
            } finally {
                overlay.remove();
            }
        }, { once: true });

        // 3. 将蒙层添加到页面body
        document.body.appendChild(overlay);
    };


    // ===================================================================================
    // 功能三：自动处理人脸识别弹窗
    // ===================================================================================
    const checkAndClickPopup = () => {
        const popupBox = document.querySelector('.popup_box[style*="display: block"]');
        if (popupBox) {
            const continueButton = popupBox.querySelector('button[onclick="ContinueLearning()"]');
            if (continueButton) continueButton.click();
        }
    };


    // ===================================================================================
    // 主执行逻辑
    // ===================================================================================
    const mainObserver = new MutationObserver(() => {
        initializePlayerControl();
        checkAndClickPopup();
    });

    window.addEventListener('DOMContentLoaded', () => {
        console.log('【终极学习助手 v2.4】脚本已启动，开始监视页面...');
        mainObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    });

})();