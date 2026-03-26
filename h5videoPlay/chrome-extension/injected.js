/**
 * HTML5 视频播放工具 - Chrome 扩展注入脚本
 */
(function () {
    'use strict';
    if (window.__h5videoInjected) return;
    window.__h5videoInjected = true;

    const d = document;
    const host = location.host;
    const q = (css, p = d) => p.querySelector(css);
    const noopFn = () => {};
    const getMainDomain = h => {
        const a = h.split('.');
        let i = a.length - 2;
        if (/^(com?|cc|tv|net|org|gov|edu)$/.test(a[i])) i--;
        return a[i];
    };
    const u = getMainDomain(host);
    let v = null;

    // ===== 提示条 =====
    let tipTimer = null;
    function showTip(msg) {
        let el = d.getElementById('h5video-tip');
        if (!el) {
            el = d.createElement('div');
            el.id = 'h5video-tip';
            el.style.cssText = 'position:fixed;z-index:2147483647;top:-40px;left:50%;transform:translateX(-50%);' +
                'background:#eee;color:#111;padding:4px 16px;border-radius:8px;border:1px solid orange;' +
                'font-size:15px;transition:top .25s;pointer-events:none;white-space:nowrap';
            d.body.appendChild(el);
        }
        el.textContent = msg;
        clearTimeout(tipTimer);
        el.style.top = '20px';
        tipTimer = setTimeout(() => { el.style.top = '-40px'; }, 2200);
    }

    // ===== 全屏 =====
    class FullScreen {
        constructor(el) {
            const exit = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || noopFn;
            this.exit = exit.bind(d);
            const enter = el.requestFullscreen || el.webkitRequestFullScreen || el.mozRequestFullScreen || noopFn;
            this.enter = enter.bind(el);
        }
        static isFull() {
            return !!(d.fullscreen || d.webkitIsFullScreen || d.mozFullScreen ||
                d.fullscreenElement || d.webkitFullscreenElement);
        }
        toggle() { FullScreen.isFull() ? this.exit() : this.enter(); }
    }

    // ===== 网页全屏 =====
    class FullPage {
        constructor(el) { this.el = el; }
        static isFull(el) { return el && el.classList.contains('gm-fp-full'); }
        toggle() {
            if (!this.el) return;
            const isFull = FullPage.isFull(this.el);
            this.el.classList.toggle('gm-fp-full', !isFull);
            d.body.classList.toggle('gm-fp-body', !isFull);
        }
    }

    let _fs = null, _fp = null;

    // ===== 速度 / 音量 =====
    function adjustRate(n) {
        if (!v) return;
        v.playbackRate = Math.min(16, Math.max(0.1, +(v.playbackRate + n).toFixed(2)));
        showTip('速度 ' + v.playbackRate + 'x');
    }

    function adjustVolume(n) {
        if (!v) return;
        v.volume = Math.min(1, Math.max(0, +(v.volume + n).toFixed(2)));
        showTip('音量 ' + Math.round(v.volume * 100) + '%');
    }

    // ===== 截图 =====
    function takeScreenshot() {
        if (!v) return;
        const canvas = d.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext('2d').drawImage(v, 0, 0);
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = d.createElement('a');
            a.href = url;
            a.download = 'screenshot_' + Date.now() + '.png';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 500);
            showTip('截图已保存');
        });
    }

    // ===== 画中画 =====
    function togglePIP() {
        if (!v) return;
        if (!d.pictureInPictureElement) {
            v.requestPictureInPicture().catch(e => showTip('画中画失败: ' + e.message));
        } else {
            d.exitPictureInPicture().catch(e => showTip('退出画中画失败: ' + e.message));
        }
    }

    // ===== 快捷键表（shift 组合 = keyCode + 1024）=====
    const actList = new Map([
        [90, () => {
            if (!v) return;
            v.playbackRate = (v.playbackRate === 1 || v.playbackRate === 0)
                ? (+localStorage.mvPlayRate || 1.3) : 1;
            showTip('速度 ' + v.playbackRate + 'x');
        }],
        [88, () => adjustRate(-0.1)],
        [67, () => adjustRate(0.1)],
        [40, () => adjustVolume(-0.1)],
        [38, () => adjustVolume(0.1)],
        [37, () => { if (v) v.currentTime -= 5; }],
        [37 + 1024, () => { if (v) v.currentTime -= 20; }],
        [39, () => { if (v) v.currentTime += 5; }],
        [39 + 1024, () => { if (v) v.currentTime += 20; }],
        [68, () => { if (v) { v.currentTime -= 0.03; v.pause(); } }],
        [70, () => { if (v) { v.currentTime += 0.03; v.pause(); } }],
        [32, () => { if (v) v.paused ? v.play() : v.pause(); }],
        [13, () => { if (_fs) _fs.toggle(); }],
        [13 + 1024, () => { if (_fp) _fp.toggle(); }],
        [27, () => {
            if (FullScreen.isFull()) { _fs && _fs.exit(); }
            else if (_fp && FullPage.isFull(v)) { _fp.toggle(); }
        }],
        [73, togglePIP],
        [80, takeScreenshot],
    ]);

    // ===== 站点适配 =====
    function applyYouTubeConfig() {
        actList.delete(32);                                    // YouTube 自己处理空格
        actList.set(69, actList.get(70)); actList.delete(70); // F→E 下一帧
        actList.set(86, actList.get(67)); actList.delete(67); // C→V 加速
    }

    function applyDouyinConfig() {
        actList.set(65, actList.get(90)); actList.delete(90); // Z→A
        actList.set(83, actList.get(88)); actList.delete(88); // X→S
        actList.set(86, actList.get(67)); actList.delete(67); // C→V
    }

    // ===== 键盘处理 =====
    function handleKeydown(e) {
        const t = e.target;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (t.contentEditable === 'true' || /INPUT|TEXTAREA|SELECT/.test(t.nodeName)) return;
        if (e.shiftKey && ![13, 37, 39].includes(e.keyCode)) return;
        if (!v) return;

        const key = e.shiftKey ? e.keyCode + 1024 : e.keyCode;
        if (actList.has(key)) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            actList.get(key)(e);
        }
    }

    // ===== 查找视频 =====
    function findVideo() {
        const videos = d.getElementsByTagName('video');
        for (const el of videos) {
            if (el.offsetWidth > 9) return el;
        }
        return videos[0] || null;
    }

    // ===== ShadowRoot hook =====
    function hookAttachShadow(cb) {
        const orig = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (...args) {
            const sr = orig.apply(this, args);
            cb(sr);
            return sr;
        };
    }

    // ===== 初始化视频 =====
    function initVideo(el) {
        v = el;
        _fs = new FullScreen(v);

        // 找播放器容器作为网页全屏目标
        const shell = q('#player') || q('.video-js') || v.closest('[class*="player"]') || v.parentElement;
        _fp = new FullPage(shell);

        // 记忆播放速度
        const savedRate = +localStorage.mvPlayRate;
        if (savedRate && savedRate !== 1) v.playbackRate = savedRate;
        v.addEventListener('ratechange', () => {
            if (v.playbackRate && v.playbackRate !== 1) localStorage.mvPlayRate = v.playbackRate;
        });

        // 直播检测：禁用时间相关快捷键
        v.addEventListener('canplay', () => {
            if (v.duration === Infinity) {
                for (const k of [37, 37+1024, 39, 39+1024, 67, 86, 88, 90]) actList.delete(k);
            }
        }, { once: true });

        showTip('HTML5视频工具已就绪');
    }

    // ===== URL 变化监听（SPA）=====
    function listenURLChange(cb) {
        const orig = history.pushState;
        history.pushState = function (...args) { orig.apply(this, args); cb(); };
        const origR = history.replaceState;
        history.replaceState = function (...args) { origR.apply(this, args); cb(); };
        window.addEventListener('popstate', cb);
    }

    // ===== 主初始化 =====
    async function main() {
        if (u === 'youtube') applyYouTubeConfig();
        else if (u === 'douyin') applyDouyinConfig();

        window.addEventListener('keydown', handleKeydown, true);

        // 轮询等待视频出现
        const tryFind = () => {
            const el = findVideo();
            if (el) { initVideo(el); return; }
            setTimeout(tryFind, 300);
        };
        tryFind();

        // ShadowRoot 中的视频（如 YouTube）
        hookAttachShadow(async sr => {
            await new Promise(r => setTimeout(r, 600));
            if (v) return;
            const el = q('video', sr);
            if (el) initVideo(el);
        });

        // MutationObserver 监听新视频
        new MutationObserver(() => {
            const el = findVideo();
            if (el && el !== v) initVideo(el);
        }).observe(d.documentElement, { childList: true, subtree: true });

        // SPA URL 变化后重新检测视频
        listenURLChange(async () => {
            await new Promise(r => setTimeout(r, 1000));
            const el = findVideo();
            if (el && el !== v) initVideo(el);
        });
    }

    if (d.readyState === 'loading') {
        d.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

    // ===== 监听来自 content script 的消息（字幕等）=====
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.source !== 'h5video-extension') return;
        const { type, message } = event.data;
        if (type === 'subtitleStarted') showTip(message || '字幕识别已开启');
        else if (type === 'subtitleStopped') showTip(message || '字幕识别已关闭');
        else if (type === 'subtitleError') showTip(message);
    });

})();
