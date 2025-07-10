// ==UserScript==
// @name         ztpx学习助手 (API修改+视频静音+自动人脸)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  访问ztpx.91huayi.com时, 1.自动修改API响应; 2.视频播放器静音; 3.自动点击人脸识别后的“进入学习”按钮。
// @author       Your Name
// @match        *://ztpx.91huayi.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ===================================================================================
    // 功能一：修改API (GetQRCodeScanResult) 响应，将 state 修改为 1
    // (代码与之前版本相同)
    // ===================================================================================
    const targetUrlPath = '/Exercise/FaceAuth/GetQRCodeScanResult';

    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function (url, options) {
        const requestUrl = (url instanceof Request) ? url.url : url;
        if (requestUrl.includes(targetUrlPath) && (options === undefined || options.method === undefined || options.method.toUpperCase() === 'GET')) {
            console.log('【API拦截】拦截到Fetch请求:', requestUrl);
            return originalFetch.apply(this, arguments).then(response => {
                const clonedResponse = response.clone();
                return clonedResponse.json().then(data => {
                    console.log('【API拦截】原始Fetch响应:', data);
                    data.state = 1;
                    console.log('【API拦截】修改后Fetch响应:', data);
                    const modifiedResponse = new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers: response.headers });
                    return modifiedResponse;
                }).catch(err => response);
            });
        }
        return originalFetch.apply(this, arguments);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) { this._method = method; this._url = url; return originalOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
        if (this._url && this._url.includes(targetUrlPath) && this._method.toUpperCase() === 'GET') {
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = function () {
                if (this.readyState === 4) {
                    try {
                        let responseData = JSON.parse(this.responseText);
                        console.log('【API拦截】原始XHR响应:', responseData);
                        responseData.state = 1;
                        console.log('【API拦截】修改后XHR响应:', responseData);
                        Object.defineProperty(this, 'responseText', { value: JSON.stringify(responseData), writable: false });
                        Object.defineProperty(this, 'response', { value: JSON.stringify(responseData), writable: false });
                    } catch (e) { }
                }
                if (originalOnReadyStateChange) { originalOnReadyStateChange.apply(this, arguments); }
            };
        }
        return originalSend.apply(this, arguments);
    };


    // ===================================================================================
    // 功能二：查找视频播放器并设置为静音
    // (代码与之前版本相同)
    // ===================================================================================
    const setVideoMuted = () => {
        const videoElements = document.querySelectorAll('video');
        if (videoElements.length > 0) {
            videoElements.forEach(video => { if (!video.muted) video.muted = true; });
            console.log('【视频静音】操作完成。');
            return true;
        }
        return false;
    };


    // ===================================================================================
    // 功能三：自动处理人脸识别弹窗
    // ===================================================================================
    const checkAndClickPopup = () => {
        // 查找当前可见的人脸识别弹窗 (style属性包含 "display: block")
        const popupBox = document.querySelector('.popup_box[style*="display: block"]');

        if (popupBox) {
            // 在弹窗内部查找“进入课程学习”按钮
            const continueButton = popupBox.querySelector('button[onclick="ContinueLearning()"]');

            if (continueButton) {
                console.log('【自动人脸】检测到人脸识别弹窗，正在自动点击“进入课程学习”...');
                continueButton.click();
            }
        }
    };


    // ===================================================================================
    // 主执行逻辑: 使用 MutationObserver 监视页面所有变化
    // ===================================================================================
    const mainObserver = new MutationObserver(() => {
        // 每次页面变化时，都执行这两个检查函数
        setVideoMuted(); // 检查并设置视频静音
        checkAndClickPopup(); // 检查并点击人脸识别弹窗按钮
    });

    // 页面加载完成后开始执行
    window.addEventListener('DOMContentLoaded', () => {
        console.log('【学习助手】脚本已启动，开始监视页面...');

        // 立即执行一次，应对页面加载时元素已存在的情况
        setVideoMuted();
        checkAndClickPopup();

        // 启动一个覆盖全局的监视器，以应对动态加载的元素
        mainObserver.observe(document.body, {
            childList: true, // 监视子元素的添加或删除
            subtree: true,   // 监视所有后代节点
            attributes: true // 监视属性变化 (特别是 style)
        });
    });

})();