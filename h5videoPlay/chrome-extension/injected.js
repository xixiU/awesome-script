/**
 * HTML5 视频播放工具 - Chrome 扩展版本
 * 注入到页面的主脚本
 * 包含所有视频控制功能 + 字幕显示UI
 */

(function () {
    'use strict';

    console.log('[H5Video] 主脚本开始执行');

    // 基础变量
    let video = null;
    let subtitleContainer = null;
    let subtitleText = null;
    let currentSubtitles = [];
    let subtitleUpdateInterval = null;

    // 快捷键映射
    const keyActions = {
        86: () => adjustRate(0.1),   // V 键 - 加速
        88: () => adjustRate(-0.1),  // X 键 - 减速
        90: () => toggleRate(),      // Z 键 - 切换速度
        37: () => { video.currentTime -= 5 },   // ← 快退
        39: () => { video.currentTime += 5 },   // → 快进
        38: () => adjustVolume(0.1),  // ↑ 音量+
        40: () => adjustVolume(-0.1), // ↓ 音量-
        80: () => takeScreenshot(),   // P 键 - 截图
        73: () => togglePIP(),        // I 键 - 画中画
        83: () => toggleSubtitle(),   // S 键 - 字幕
        68: () => { video.currentTime -= 0.03; video.pause(); }, // D - 上一帧
        70: () => { video.currentTime += 0.03; video.pause(); }  // F - 下一帧
    };

    // 调整播放速度
    function adjustRate(delta) {
        if (!video) return;
        let newRate = video.playbackRate + delta;
        if (newRate < 0.1) newRate = 0.1;
        if (newRate > 16) newRate = 16;
        video.playbackRate = parseFloat(newRate.toFixed(2));
        showTip(`播放速度: ${video.playbackRate}x`);
    }

    // 切换播放速度
    function toggleRate() {
        if (!video) return;
        if (video.playbackRate === 1 || video.playbackRate === 0) {
            video.playbackRate = parseFloat(localStorage.mvPlayRate || 1.3);
        } else {
            localStorage.mvPlayRate = video.playbackRate;
            video.playbackRate = 1;
        }
        showTip(`播放速度: ${video.playbackRate}x`);
    }

    // 调整音量
    function adjustVolume(delta) {
        if (!video) return;
        let newVolume = video.volume + delta;
        if (newVolume < 0) newVolume = 0;
        if (newVolume > 1) newVolume = 1;
        video.volume = parseFloat(newVolume.toFixed(2));
        showTip(`音量: ${Math.round(video.volume * 100)}%`);
    }

    // 截图
    function takeScreenshot() {
        if (!video) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `screenshot_${Date.now()}.png`;
            link.click();
            await new Promise(resolve => setTimeout(resolve, 500));
            URL.revokeObjectURL(url);
            showTip('✅ 截图已保存');
        });
    }

    // 画中画
    function togglePIP() {
        if (!video) return;

        if (!document.pictureInPictureElement) {
            video.requestPictureInPicture().catch(err => {
                showTip('❌ 无法进入画中画: ' + err.message);
            });
        } else {
            document.exitPictureInPicture().catch(err => {
                showTip('❌ 无法退出画中画: ' + err.message);
            });
        }
    }

    // 切换字幕
    function toggleSubtitle() {
        console.log('[H5Video] 切换字幕');

        // 发送消息给 content script
        window.postMessage({
            source: 'h5video-page',
            type: 'toggleSubtitle'
        }, '*');
    }

    // 显示提示
    function showTip(message) {
        let tipEl = document.getElementById('h5video-tip');
        if (!tipEl) {
            tipEl = document.createElement('div');
            tipEl.id = 'h5video-tip';
            tipEl.className = 'h5video-tip';
            document.body.appendChild(tipEl);
        }

        tipEl.textContent = message;
        tipEl.style.top = '-50px';

        // 动画显示
        setTimeout(() => {
            tipEl.style.top = '20px';
        }, 10);

        setTimeout(() => {
            tipEl.style.top = '-50px';
        }, 2500);
    }

    // 键盘事件处理
    function handleKeyPress(e) {
        // 排除输入框
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.target.contentEditable === 'true') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const action = keyActions[e.keyCode];
        if (action) {
            e.preventDefault();
            e.stopPropagation();
            action();
        }
    }

    // 查找视频元素
    function findVideo() {
        const videos = document.getElementsByTagName('video');
        for (const v of videos) {
            if (v.offsetWidth > 100) {
                return v;
            }
        }
        return videos[0];
    }

    // 创建字幕UI
    function createSubtitleUI() {
        if (subtitleContainer) return;

        const videoParent = video.parentElement;
        if (!videoParent) return;

        // 确保父容器是相对定位
        if (!videoParent.style.position || videoParent.style.position === 'static') {
            videoParent.style.position = 'relative';
        }

        // 创建容器
        subtitleContainer = document.createElement('div');
        subtitleContainer.className = 'h5video-subtitle-container';

        // 创建字幕文本元素
        subtitleText = document.createElement('div');
        subtitleText.className = 'h5video-subtitle-text';

        subtitleContainer.appendChild(subtitleText);
        videoParent.appendChild(subtitleContainer);

        console.log('[H5Video] 字幕UI已创建');
    }

    // 更新字幕显示
    function updateSubtitleDisplay() {
        if (!video || !subtitleText) return;

        const currentTime = video.currentTime;
        let foundSubtitle = '';

        for (const sub of currentSubtitles) {
            if (currentTime >= sub.start && currentTime <= sub.end) {
                foundSubtitle = sub.text;
                break;
            }
        }

        if (foundSubtitle) {
            subtitleText.textContent = foundSubtitle;
            subtitleText.classList.add('show');
        } else {
            subtitleText.classList.remove('show');
        }
    }

    // 添加字幕数据
    function addSubtitles(newSubtitles) {
        if (!video) return;

        const currentTime = video.currentTime;

        // 调整时间戳
        const adjustedSubtitles = newSubtitles.map(sub => ({
            ...sub,
            start: currentTime + sub.start - 5, // 5 秒是录制间隔
            end: currentTime + sub.end - 5
        }));

        currentSubtitles.push(...adjustedSubtitles);
        currentSubtitles.sort((a, b) => a.start - b.start);

        // 清理过期字幕
        const minTime = currentTime - 120;
        currentSubtitles = currentSubtitles.filter(sub => sub.end > minTime);

        console.log('[H5Video] 字幕已更新，当前共', currentSubtitles.length, '条');
    }

    // 监听来自扩展的消息
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.source !== 'h5video-extension') return;

        const { type, message, subtitles } = event.data;

        switch (type) {
            case 'subtitleStarted':
                showTip(message || '字幕识别已开启');
                if (!subtitleUpdateInterval) {
                    subtitleUpdateInterval = setInterval(updateSubtitleDisplay, 100);
                }
                break;

            case 'subtitleStopped':
                showTip(message || '字幕识别已关闭');
                if (subtitleUpdateInterval) {
                    clearInterval(subtitleUpdateInterval);
                    subtitleUpdateInterval = null;
                }
                if (subtitleText) {
                    subtitleText.classList.remove('show');
                }
                currentSubtitles = [];
                break;

            case 'newSubtitles':
                addSubtitles(subtitles);
                showTip(`获取 ${subtitles.length} 条字幕`);
                break;

            case 'subtitleError':
                showTip(message);
                break;
        }
    });

    // 初始化
    function init() {
        console.log('[H5Video] 初始化...');

        // 查找视频元素
        video = findVideo();
        if (!video) {
            console.log('[H5Video] 未找到视频，延迟初始化');
            setTimeout(init, 1000);
            return;
        }

        console.log('[H5Video] ✅ 找到视频元素');

        // 绑定键盘事件
        document.addEventListener('keydown', handleKeyPress, true);

        // 创建字幕UI
        createSubtitleUI();

        // 监听视频变化（单页应用）
        const observer = new MutationObserver(() => {
            const newVideo = findVideo();
            if (newVideo && newVideo !== video) {
                console.log('[H5Video] 检测到新视频');
                video = newVideo;
                createSubtitleUI();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('[H5Video] ✅ 初始化完成');
        showTip('HTML5视频工具已就绪');
    }

    // 等待 DOM 加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

