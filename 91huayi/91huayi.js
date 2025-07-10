// ==UserScript==
// @name         ztpx终极学习助手 (修复版 | 完美整合)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  [最终修复] 通过API(bjyV)直控播放器，并恢复了跳过人脸识别的功能。集API修改, 自动播放, 静音, 处理弹窗于一身。
// @author       Your Name
// @match        *://ztpx.91huayi.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ===================================================================================
    // 功能一：恢复完整的API请求拦截 (Fetch & XMLHttpRequest)
    // (已从v1.5恢复，用于跳过人脸识别)
    // ===================================================================================
    const targetUrlPath = '/Exercise/FaceAuth/GetQRCodeScanResult';

    // 1. 拦截 Fetch API
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function (url, options) {
        const requestUrl = (url instanceof Request) ? url.url : url;
        if (requestUrl.includes(targetUrlPath) && (options === undefined || options.method === undefined || options.method.toUpperCase() === 'GET')) {
            console.log('【API拦截】拦截到 Fetch 请求，修改state=1...');
            return originalFetch.apply(this, arguments).then(response => {
                const clonedResponse = response.clone();
                return clonedResponse.json().then(data => {
                    data.state = 1;
                    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers: response.headers });
                }).catch(err => response);
            });
        }
        return originalFetch.apply(this, arguments);
    };

    // 2. 恢复对 XMLHttpRequest 的完整拦截 (这是之前版本缺失的关键部分)
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        if (this._url && this._url.includes(targetUrlPath) && this._method.toUpperCase() === 'GET') {
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = function () {
                if (this.readyState === 4 && this.status === 200) {
                    try {
                        const originalResponse = JSON.parse(this.responseText);
                        const modifiedResponse = { ...originalResponse, state: 1 };
                        Object.defineProperty(this, 'responseText', { value: JSON.stringify(modifiedResponse), writable: true });
                        Object.defineProperty(this, 'response', { value: JSON.stringify(modifiedResponse), writable: true });
                        console.log('【API拦截】拦截到 XHR 请求，已修改state=1。');
                    } catch (e) {
                        // 如果响应不是JSON格式，则不处理
                    }
                }
                if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(this, arguments);
                }
            };
        }
        return originalSend.apply(this, arguments);
    };


    // ===================================================================================
    // 功能二：播放器状态管理 (通过官方API `bjyV` 控制)
    // (保留v1.6的最佳实践)
    // ===================================================================================
    const managePlayerStateWithAPI = () => {
        const player = unsafeWindow.bjyV;
        if (typeof player !== 'object' || player === null) return;

        if (!player._isMutedByScript) {
            if (typeof player.mute === 'function') {
                player.mute();
                player._isMutedByScript = true;
                console.log('【播放器API】已调用 bjyV.mute()。');
            } else if (typeof player.setVolume === 'function') {
                player.setVolume(0);
                player._isMutedByScript = true;
                console.log('【播放器API】已调用 bjyV.setVolume(0)。');
            }
        }

        const playerWrap = document.querySelector('.bplayer-wrap');
        if (playerWrap && !playerWrap.classList.contains('bplayer-playing')) {
            if (typeof player.play === 'function') {
                console.log('【播放器API】检测到播放器未播放，调用 bjyV.play() ...');
                player.play();
            }
        }
    };


    // ===================================================================================
    // 功能三：自动处理人脸识别弹窗 (作为备用方案)
    // ===================================================================================
    const checkAndClickPopup = () => {
        const popupBox = document.querySelector('.popup_box[style*="display: block"]');
        if (popupBox) {
            const continueButton = popupBox.querySelector('button[onclick="ContinueLearning()"]');
            if (continueButton) {
                console.log('【自动人脸】检测到弹窗，自动点击“进入课程学习”...');
                continueButton.click();
            }
        }
    };


    // ===================================================================================
    // 主执行逻辑
    // ===================================================================================
    const mainObserver = new MutationObserver(() => {
        managePlayerStateWithAPI();
        checkAndClickPopup();
    });

    window.addEventListener('DOMContentLoaded', () => {
        console.log('【终极学习助手 v1.7 修复版】脚本已启动...');
        managePlayerStateWithAPI();
        checkAndClickPopup();
        mainObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    });

})();