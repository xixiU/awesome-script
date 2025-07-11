// ==UserScript==
// @name         ztpx终极学习助手 (网络监听版)
// @namespace    http://tampermonkey.net/
// @version      2.8
// @description  [网络监听] 通过拦截课程完成API请求，实现更精准的自动切换下一课功能，兼容所有场景。
// @author       Your Name
// @match        *://ztpx.91huayi.com/*
// @grant        unsafeWindow
// @grant        window.close
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // --- 全局状态标记 ---
    // 用于确保在页面加载/切换期间，各项逻辑只被正确执行一次
    let isPlayerInitialized = false; // 播放器是否已初始化并设置了轮询
    let isCourseCompleted = false;   // 当前课程是否已被确认为“完成”状态

    // ===================================================================================
    // 功能一：API请求拦截 (处理人脸识别 & 监听课程完成)
    // ===================================================================================
    const faceIdUrlPath = '/Exercise/FaceAuth/GetQRCodeScanResult';

    // 1. 拦截 Fetch API
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function (url, options) {
        const requestUrl = (url instanceof Request) ? url.url : url;

        // a. 处理人脸识别 (修改响应)
        if (requestUrl.includes(faceIdUrlPath) && (options?.method?.toUpperCase() === 'GET' || options?.method === undefined)) {
            console.log('【API拦截】(Fetch)检测到人脸识别请求，修改state=1...');
            return originalFetch.apply(this, arguments).then(response => {
                // 克隆响应以允许我们读取它，同时让浏览器也能正常接收
                const responseClone = response.clone();
                return responseClone.json().then(data => {
                    data.state = 1; // 修改关键状态
                    // 创建并返回一个新的、被修改过的响应
                    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers: response.headers });
                }).catch(() => response); // 如果响应不是JSON，则返回原始响应
            });
        }

        // 对于所有其他请求，正常执行
        return originalFetch.apply(this, arguments);
    };

    // 2. 拦截 XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        // 保存请求的url和method，以便在send和onreadystatechange中可以访问
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        const originalOnReadyStateChange = this.onreadystatechange;
        this.onreadystatechange = function () {
            // 当请求完成且成功时
            if (this.readyState === 4 && this.status === 200) {
                // a. 处理人脸识别
                if (this._url?.includes(faceIdUrlPath)) {
                    try {
                        console.log('【API拦截】(XHR)检测到人脸识别请求，修改state=1...');
                        const modifiedResponse = { ...JSON.parse(this.responseText), state: 1 };
                        Object.defineProperty(this, 'responseText', { value: JSON.stringify(modifiedResponse), writable: true });
                        Object.defineProperty(this, 'response', { value: JSON.stringify(modifiedResponse), writable: true });
                    } catch (e) { }
                }
                // b. 监听课程完成日志
                if (this._url?.includes(completionLogUrl) && !isCourseCompleted) {
                    try {
                        const data = JSON.parse(this.responseText);
                        if (data.status === 1) {
                            console.log('【网络监听】(XHR)检测到课程完成信号，准备切换！');
                            isCourseCompleted = true; // 设置完成标志
                            setTimeout(playNextVideo, 1500); // 切换下一课
                        }
                    } catch (e) { }
                }
            }
            // 确保原始的回调函数（如果存在）也能被执行
            originalOnReadyStateChange?.apply(this, arguments);
        };
        return originalSend.apply(this, arguments);
    };


    // ===================================================================================
    // 功能二：播放器状态管理与智能切换
    // ===================================================================================
    const initializePlayerControl = () => {
        if (isPlayerInitialized) return;
        const player = unsafeWindow.bjyV;
        const playerWrap = document.querySelector('.bplayer-wrap');
        if (typeof player !== 'object' || player === null || !playerWrap) return;

        isPlayerInitialized = true;
        const overlay = document.createElement('div');
        overlay.id = 'gm-unlock-overlay';
        Object.assign(overlay.style, { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white', zIndex: '2147483647', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontSize: '32px', fontWeight: 'bold', fontFamily: 'sans-serif', cursor: 'pointer', userSelect: 'none', textAlign: 'center', padding: '20px', lineHeight: '1.5' });
        overlay.innerHTML = '▶ 点击屏幕任意位置以开始自动学习<br><small style="font-size: 18px; font-weight: normal;">(此为浏览器安全策略要求，仅需一次)</small>';

        overlay.addEventListener('click', () => {
            console.log('【播放器API】接收到“用户授权”点击，正在激活播放器...');

            try {
                if (typeof player.setVolume === 'function') {
                    player.setVolume(0);
                    console.log('【播放器API】已经设置静音');
                }

                if (typeof player.play === 'function') {
                    player.play();
                    player.setSpeed(2.0)
                    console.log('【播放器API】已经开始播放');
                }
                setInterval(() => {
                    const currentPlayer = unsafeWindow.bjyV;
                    // 只有在课程未被标记为“完成”时，才执行防暂停逻辑
                    if (currentPlayer && !isCourseCompleted) {
                        const isPaused = (typeof currentPlayer.isPaused === 'function' && currentPlayer.isPaused()) || currentPlayer.paused === true;
                        if (isPaused) {
                            currentPlayer.play?.();
                            currentPlayer.setSpeed?.(2.0);
                        }
                    }
                }, 3000);
            } finally {
                overlay.remove();
            }
        }, { once: true });
        if (player.paused) {
            // 3. 将蒙层添加到页面body
            document.body.appendChild(overlay);
        } else {
            // 直接触发静音
            overlay.click();
            overlay.remove();
        }

    };

    const playNextVideo = () => {
        console.log("【课程切换】开始寻找下一个 '学习中' 的课程...");
        const listItems = document.querySelectorAll('.listGroup .listItem');
        let nextVideoItem = null;
        for (const item of listItems) {
            const button = item.querySelector('button');
            if (button && (button.textContent.trim() === '学习中' || button.textContent.trim() === '未学习')) {
                nextVideoItem = item;
                break;
            }
        }

        if (nextVideoItem) {
            const clickableTitle = nextVideoItem.querySelector('.text[onclick]');
            if (clickableTitle) {
                console.log(`【课程切换】找到目标课程: "${clickableTitle.textContent.trim()}"。准备点击...`);
                // 在点击切换到新页面前，重置所有状态标志，为新课程的脚本运行做准备
                isPlayerInitialized = false;
                isCourseCompleted = false;
                clickableTitle.click();
            } else {
                console.log("【课程切换】错误：找到了'学习中'的课程行，但未找到可点击的标题。");
            }
        } else {
            console.log('【课程切换】所有课程均已学习完毕，5秒后自动关闭页面...');
            setTimeout(() => { window.close(); }, 5000);
        }
    };


    // ===================================================================================
    // 功能三：处理所有弹窗（人脸识别 & 课程评价）
    // ===================================================================================
    const handlePopups = () => {
        // 1. 优先处理人脸识别弹窗
        const facePopup = document.querySelector('.popup_box[style*="display: block"]');
        if (facePopup) {
            const continueButton = facePopup.querySelector('button[onclick="ContinueLearning()"]');
            if (continueButton) continueButton.click();
            return; // 处理完人脸识别后，暂时不处理其他弹窗，等待页面响应
        }

        // 2. 处理课程评价弹窗（作为备用完成信号）
        const ratingPopup = document.querySelector('.box_item_pj');
        // 只有在弹窗可见，且课程未被网络请求标记为完成时，此逻辑才生效
        if (ratingPopup && ratingPopup.offsetHeight > 0 && !isCourseCompleted) {
            console.log('【课程评价】检测到可见的评价弹窗 (作为备用信号)，标记课程已结束。');
            isCourseCompleted = true; // 设置完成标志

            // // 自动打5星
            // ratingPopup.querySelectorAll('.pj_box_pj dl').forEach(section => {
            //     const stars = section.querySelectorAll('dd i');
            //     if (stars.length > 0) stars[stars.length - 1].click();
            // });

            // // 自动提交
            // const submitButton = ratingPopup.querySelector('.btn_box_pj button');
            // if (submitButton) {
            //     console.log('【课程评价】自动提交5星好评...');
            //     submitButton.click();
            // }

            // 提交后，稍作等待，然后播放下一课
            console.log('【课程评价】处理完毕，准备在2秒后播放下一课...');
            setTimeout(playNextVideo, 2000);
        }
    };


    // ===================================================================================
    // 主执行逻辑：MutationObserver持续监视页面变化
    // ===================================================================================
    const mainObserver = new MutationObserver(() => {
        initializePlayerControl(); // 负责播放器初始化
        handlePopups();             // 统一处理所有弹窗
    });

    window.addEventListener('DOMContentLoaded', () => {
        console.log('【终极学习助手 v2.8】脚本已启动，开始监视页面...');
        mainObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    });

})();