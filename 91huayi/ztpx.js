// ==UserScript==
// @name         终极学习助手 
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  过拦截课程完成API请求，实现更精准的自动切换下一课功能，兼容所有场景。
// @author       Your Name
// @match        *://ztpx.91huayi.com/*
// @grant        unsafeWindow
// @grant        window.close
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // --- 全局状态标记 ---
    // 用于确保在页面加载/切换期间，各项逻辑只被正确执行一次
    let isPlayerInitialized = false; // 播放器是否已初始化并设置了轮询
    let isCourseCompleted = false;   // 当前课程是否已被确认为“完成”状态

    const tabId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const LOCK_EXPIRE_MS = 80 * 60 * 1000; // 锁过期时间 80分钟 

    // ===================================================================================
    // 【新增功能】破解“单课程播放”限制 (补丁模块)
    // ===================================================================================
    const patcherInterval = setInterval(() => {
        if (typeof unsafeWindow.GetCoursePlayCourseware === 'function') {
            clearInterval(patcherInterval);
            console.log('【破解模块】轮询成功，检测到“单课程播放”限制函数，准备重写...');
            unsafeWindow.GetCoursePlayCourseware = function (userId, titleId) {
                console.log('【破解模块】已拦截“单课程播放”检查，返回当前课程ID以绕过限制。');
                return titleId;
            };
        }
    }, 200);

    setTimeout(() => {
        clearInterval(patcherInterval);
    }, 10000);

    // ===================================================================================
    // 功能一：API请求拦截 (处理人脸识别 & 监听课程完成)
    // ===================================================================================
    const faceIdUrlPath = '/Exercise/FaceAuth/GetQRCodeScanResult';

    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function (url, options) {
        const requestUrl = (url instanceof Request) ? url.url : url;
        if (requestUrl.includes(faceIdUrlPath) && (options?.method?.toUpperCase() === 'GET' || options?.method === undefined)) {
            console.log('【API拦截】(Fetch)检测到人脸识别请求，修改state=1...');
            return originalFetch.apply(this, arguments).then(response => {
                const responseClone = response.clone();
                return responseClone.json().then(data => {
                    data.state = 1;
                    return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers: response.headers });
                }).catch(() => response);
            });
        }
        return originalFetch.apply(this, arguments);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        const originalOnReadyStateChange = this.onreadystatechange;
        this.onreadystatechange = function () {
            if (this.readyState === 4 && this.status === 200) {
                if (this._url?.includes(faceIdUrlPath)) {
                    try {
                        console.log('【API拦截】(XHR)检测到人脸识别请求，修改state=1...');
                        const modifiedResponse = { ...JSON.parse(this.responseText), state: 1 };
                        Object.defineProperty(this, 'responseText', { value: JSON.stringify(modifiedResponse), writable: true });
                        Object.defineProperty(this, 'response', { value: JSON.stringify(modifiedResponse), writable: true });
                    } catch (e) { }
                }
            }
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
        console.log('【播放器控制】检测到播放器对象，启动智能控制逻辑...');

        const activateAutoPlay = () => {
            console.log('【播放器控制】正在激活自动播放功能...');
            try {
                if (typeof player.setVolume === 'function') {
                    player.setVolume(0);
                    console.log('【播放器控制】已设置静音');
                }
                if (typeof player.play === 'function') {
                    player.play();
                    console.log('【播放器控制】已触发播放');
                }
                setInterval(() => {
                    const currentPlayer = unsafeWindow.bjyV;
                    if (currentPlayer && !isCourseCompleted) {
                        const isPaused = (typeof currentPlayer.isPaused === 'function' && currentPlayer.isPaused()) || currentPlayer.paused === true;
                        if (isPaused) {
                            console.log('【播放器控制】检测到视频暂停，尝试恢复播放...');
                            currentPlayer.play?.();
                        }
                    }
                }, 3000);
            } catch (error) {
                console.error('【播放器控制】激活自动播放时发生错误:', error);
            } finally {
                const existingOverlay = document.getElementById('gm-unlock-overlay');
                if (existingOverlay) {
                    existingOverlay.remove();
                }
            }
        };

        let attempts = 0;
        const maxAttempts = 8;
        const pollInterval = setInterval(() => {
            const currentPlayer = unsafeWindow.bjyV;
            if (currentPlayer && !currentPlayer.paused) {
                clearInterval(pollInterval);
                console.log('【播放器控制】轮询成功：视频已自动播放。直接进入自动学习模式。');
                activateAutoPlay();
                return;
            }
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(pollInterval);
                console.log('【播放器控制】轮询超时：视频仍处于暂停状态。尝试自动触发点击逻辑。');
                const tempOverlay = document.createElement('div');
                tempOverlay.id = 'gm-unlock-overlay';
                tempOverlay.addEventListener('click', activateAutoPlay, { once: true });
                tempOverlay.click();
            }
        }, 250);
    };

    const lockPrefix = 'video_lock_';

    const playNextVideo = () => {
        console.log("【课程切换】开始寻找下一个可学习的课程...");
        const listItems = document.querySelectorAll('.listGroup .listItem');
        let foundAndClicked = false;

        for (const item of listItems) {
            const button = item.querySelector('button');
            const clickableTitle = item.querySelector('.text[onclick]');

            if (button && clickableTitle && (button.textContent.trim() === '学习中' || button.textContent.trim() === '未学习')) {
                const onclickAttr = clickableTitle.getAttribute('onclick');
                const match = onclickAttr.match(/VideoPlay\('([^']+)'/);

                if (match && match[1]) {
                    const nextVideoId = match[1];
                    const nextVideoLockKey = lockPrefix + nextVideoId;
                    const lock = GM_getValue(nextVideoLockKey, null);

                    if (lock && Date.now() - (lock.timestamp || 0) < LOCK_EXPIRE_MS) {
                        console.log(`【课程切换】课程 "${clickableTitle.textContent.trim()}" 已被其他页面锁定，跳过...`);
                        continue;
                    }

                    const currentUrl = window.location.href;
                    const currentVideoIdMatch = currentUrl.match(/courseware_id=([a-f0-9\-]+)/);
                    if (currentVideoIdMatch && currentVideoIdMatch[1]) {
                        const currentVideoLockKey = lockPrefix + currentVideoIdMatch[1];
                        const currentLock = GM_getValue(currentVideoLockKey);
                        if (currentLock && currentLock.owner === tabId) {
                            // GM_setValue(currentVideoLockKey, null);
                            GM_deleteValue(currentVideoLockKey);
                            console.log(`【课程切换】已释放当前视频 (${currentVideoIdMatch[1]}) 的锁。`);
                        }
                    }

                    // console.log(`【课程切换】找到目标课程: "${clickableTitle.textContent.trim()}"。设置锁并准备点击...`);
                    // GM_setValue(nextVideoLockKey, { locked: true, owner: tabId, timestamp: Date.now() });

                    isPlayerInitialized = false;
                    isCourseCompleted = false;
                    clickableTitle.click();
                    foundAndClicked = true;
                    break;
                }
            }
        }
        if (!foundAndClicked) {
            console.log('【课程切换】所有课程均已学习完毕或被锁定，20秒后自动关闭页面...');
            setTimeout(() => { window.close(); }, 20000);
        }
    };

    const checkLockOnLoad = () => {
        const currentUrl = window.location.href;
        if (!currentUrl.includes('BJYCoursePlay')) {
            return true;
        }

        const currentVideoIdMatch = currentUrl.match(/courseware_id=([a-f0-9\-]+)/);
        if (currentVideoIdMatch && currentVideoIdMatch[1]) {
            const videoId = currentVideoIdMatch[1];
            const lockKey = lockPrefix + videoId;
            const lock = GM_getValue(lockKey, null);

            if (lock && lock.owner !== tabId && Date.now() - (lock.timestamp || 0) < LOCK_EXPIRE_MS) {
                console.log(`【锁检查】当前视频 (${videoId}) 已被其他页面锁定。将等待课程列表加载后尝试切换${JSON.stringify(lock)}...`);
                const listObserver = new MutationObserver((mutations, observer) => {
                    if (document.querySelector('.listGroup')) {
                        console.log('【锁检查】课程列表已加载，现在尝试切换到下一个视频。');
                        playNextVideo();
                        observer.disconnect();
                    }
                });

                listObserver.observe(document.body, { childList: true, subtree: true });

                setTimeout(() => {
                    listObserver.disconnect();
                    console.log('【锁检查】等待课程列表超时，将直接尝试切换。');
                    playNextVideo();
                }, 10000);

                return false;
            } else {
                console.log(`【锁检查】当前视频 (${videoId}) 未被锁定或锁已过期。本页面将获取锁并开始学习。`);
                GM_setValue(lockKey, { locked: true, owner: tabId, timestamp: Date.now() });
                return true;
            }
        }
        return true;
    };

    // ===================================================================================
    // 功能三：处理所有弹窗（人脸识别 & 课程评价）
    // ===================================================================================
    const handlePopups = () => {
        const facePopup = document.querySelector('.popup_box[style*="display: block"]');
        if (facePopup) {
            const continueButton = facePopup.querySelector('button[onclick="ContinueLearning()"]');
            if (continueButton) continueButton.click();
            return;
        }

        const ratingPopup = document.querySelector('.box_item_pj');
        if (ratingPopup && ratingPopup.offsetHeight > 0 && !isCourseCompleted) {
            console.log('【课程评价】检测到可见的评价弹窗 (作为备用信号)，标记课程已结束。');
            isCourseCompleted = true;
            console.log('【课程评价】处理完毕，准备在2秒后播放下一课...');
            setTimeout(playNextVideo, 2000);
        }
    };

    // ===================================================================================
    // 主执行逻辑：MutationObserver持续监视页面变化
    // ===================================================================================
    const mainObserver = new MutationObserver(() => {
        initializePlayerControl();
        handlePopups();
    });

    window.addEventListener('DOMContentLoaded', () => {
        console.log('【终极学习助手 v3.0】脚本已启动，开始监视页面...');
        if (checkLockOnLoad()) {
            mainObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
        }
    });

})();
