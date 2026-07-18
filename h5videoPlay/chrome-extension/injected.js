/**
 * HTML5 视频播放工具 - Chrome 扩展注入脚本
 */
(function () {
    'use strict';
    if (window.__h5videoInjected) return;
    window.__h5videoInjected = true;

    // ===== 反失焦暂停 =====
    // 部分网站监听 visibilitychange / blur / pagehide 等事件，在页面失焦
    // （鼠标移出窗口、切到其他标签/应用）时强制暂停视频。此保护层伪装页面
    // 始终可见，并拦截失焦类事件的监听注册。可通过 localStorage 针对站点关闭：
    // localStorage.h5video_antiPause_off = '1'
    (function () {
        try {
            if (localStorage.getItem('h5video_antiPause_off') === '1') return;
        } catch (e) { /* ignore */ }

        const forceVisible = (obj, prop, value) => {
            try {
                Object.defineProperty(obj, prop, { configurable: true, get: () => value });
            } catch (e) { /* ignore */ }
        };
        forceVisible(Document.prototype, 'hidden', false);
        forceVisible(Document.prototype, 'webkitHidden', false);
        forceVisible(Document.prototype, 'visibilityState', 'visible');
        forceVisible(Document.prototype, 'webkitVisibilityState', 'visible');
        forceVisible(document, 'hidden', false);
        forceVisible(document, 'visibilityState', 'visible');

        const BLOCKED = new Set(['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange', 'blur', 'pagehide', 'freeze']);
        const shouldBlock = (target, type) => {
            const t = typeof type === 'string' ? type.toLowerCase() : '';
            if (!BLOCKED.has(t)) return false;
            return target === document || target === window;
        };
        try {
            const rawAdd = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, opts) {
                if (shouldBlock(this, type)) return;
                return rawAdd.call(this, type, listener, opts);
            };
        } catch (e) { /* ignore */ }

        ['onvisibilitychange', 'onwebkitvisibilitychange', 'onblur', 'onpagehide', 'onfreeze'].forEach(prop => {
            try {
                Object.defineProperty(document, prop, { configurable: true, get: () => null, set: () => {} });
            } catch (e) { /* ignore */ }
            try {
                Object.defineProperty(window, prop, { configurable: true, get: () => null, set: () => {} });
            } catch (e) { /* ignore */ }
        });
    })();

    const d = document;
    const host = location.host;
    const path = location.pathname;
    const q = (css, p = d) => p.querySelector(css);
    const noopFn = () => { };
    const getMainDomain = h => {
        const a = h.split('.');
        let i = a.length - 2;
        if (/^(com?|cc|tv|net|org|gov|edu)$/.test(a[i])) i--;
        return a[i];
    };
    const u = getMainDomain(host);
    let v = null;

    // 配置对象
    const cfg = {
        isLive: false,
        disableDBLClick: false,
        isClickOnVideo: false,
        multipleV: false,
        isNumURL: false,
        mvShell: null,
        btnPlay: null,
        btnNext: null,
        btnFS: null,
        btnFP: null,
        shellCSS: null,
        playCSS: null,
        nextCSS: null,
        fullCSS: null,
        webfullCSS: null
    };

    // ===== 智能检测：判断页面是否需要启用脚本 =====
    function shouldEnableScript() {
        // 排除列表
        const excludePatterns = [
            /^(www\.)?(google|bing|baidu|so|sogou)\./,
            /^(mail|outlook|gmail)\./,
            /^(github|gitlab|bitbucket)\./,
            /^(docs|drive|dropbox|onedrive)\./,
            /^(amazon|ebay|taobao|jd|tmall)\./,
            /^localhost$/
        ];

        if (excludePatterns.some(pattern => pattern.test(host))) {
            console.log('[H5Video] 排除网站，不启用');
            return false;
        }

        // 已知视频网站
        const knownVideoSites = [
            'youtube', 'bilibili', 'youku', 'iqiyi', 'qq.com', 'douyin',
            'tencent', 'acfun', 'mgtv', 'ixigua', 'toutiao',
            'douyu', 'huya', 'twitch', 'ted.com',
            'weibo', 'sina', 'sohu', 'ifeng',
            'miguvideo', 'pptv', 'longzhu', 'zhanqi', 'netflix', 'vimeo'
        ];

        if (knownVideoSites.some(site => host.includes(site))) {
            return true;
        }

        // URL路径判断
        const videoKeywords = ['/video', '/play', '/watch', '/live', '/mv', '/player', '/v/', '/movie', '/film', '/show'];
        if (videoKeywords.some(keyword => path.includes(keyword))) {
            return true;
        }

        // 默认启用（后续会检测video标签）
        return true;
    }

    // ===== 提示条 =====
    let tipTimer = null;
    function showTip(msg) {
        if (!d.body) return;
        let el = d.getElementById('h5video-tip');
        if (!el) {
            el = d.createElement('div');
            el.id = 'h5video-tip';
            el.style.cssText = 'position:fixed;z-index:2147483647;top:-40px;left:50%;transform:translateX(-50%);' +
                'background:#eee;color:#111;padding:4px 16px;border-radius:8px;border:1px solid orange;' +
                'font-size:15px;transition:top .25s;pointer-events:none;white-space:nowrap';
            d.body.appendChild(el);
        }
        // 全屏时把提示挂到全屏元素下，否则会被全屏元素（top layer）盖住看不见。
        const fsEl = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement;
        const target = (fsEl && fsEl.appendChild) ? fsEl : d.body;
        if (el.parentNode !== target) target.appendChild(el);
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
            // 对包裹视频的容器全屏，而非裸 <video>。<video> 是替换元素无法渲染子节点，
            // 若对它全屏，倍速提示等挂进去也不会显示；对容器全屏则提示可正常展示。
            const target = (el && el.tagName === 'VIDEO' && getPlayerContainer(el)) || el;
            const enter = target.requestFullscreen || target.webkitRequestFullScreen || target.mozRequestFullScreen || noopFn;
            this.enter = enter.bind(target);
        }
        static isFull() {
            return !!(d.fullscreen || d.webkitIsFullScreen || d.mozFullScreen ||
                d.fullscreenElement || d.webkitFullscreenElement);
        }
        toggle() { FullScreen.isFull() ? this.exit() : this.enter(); }
    }

    // ===== 网页全屏 =====
    class FullPage {
        constructor(container) {
            this._isFull = false;
            this.container = container || getPlayerContainer(v);
        }

        static isFull(el) {
            if (!el) return false;
            return window.innerWidth - el.clientWidth < 5 &&
                window.innerHeight - el.clientHeight < 5;
        }

        toggle() {
            if (!this.container || !this.container.contains(v)) {
                this.container = getPlayerContainer(v);
            }

            d.body.classList.toggle('gm-fp-body');
            let e = v;
            while (e !== this.container) {
                e.classList.toggle('gm-fp-innerBox');
                e = e.parentNode;
            }
            e.classList.toggle('gm-fp-wrapper');
            e = e.parentNode;
            while (e !== d.body) {
                e.classList.toggle('gm-fp-zTop');
                e = e.parentNode;
            }
            this._isFull = !this._isFull;
            showTip(this._isFull ? '网页全屏' : '退出网页全屏');
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

    // ===== 按钮点击辅助 =====
    function doClick(el) {
        if (typeof el === 'string') el = q(el);
        if (el) { el.click ? el.click() : el.dispatchEvent(new MouseEvent('click')); }
    }

    function clickDualButton(btn) {
        if (!btn) return;
        if (!btn.nextElementSibling || getComputedStyle(btn).display !== 'none') {
            doClick(btn);
        } else {
            doClick(btn.nextElementSibling);
        }
    }

    // ===== 视频缓存 =====
    const cacheMV = {
        cached: false,
        mode: false,
        playPos: 0,
        iEnd: 0,
        rawPlay: null,
        check() {
            if (!v) return false;
            const buf = v.buffered;
            if (buf.length === 0) return false;
            const i = buf.length - 1;
            this.iEnd = buf.end(i);
            return this.mode ? this.iEnd > v.duration - 55 : buf.start(0) >= this.playPos || this.iEnd > v.duration - 55;
        },
        finish() {
            if (!v) return;
            v.removeEventListener('canplaythrough', this.onCache);
            v.currentTime = this.playPos;
            this.cached = false;
            setTimeout(() => v.pause(), 33);
            if (this.rawPlay) {
                HTMLMediaElement.prototype.play = this.rawPlay;
            }
            showTip('缓存已完成');
        },
        onCache() {
            if (!cacheMV.cached || !v) return;
            if (cacheMV.check()) {
                cacheMV.finish();
            } else {
                v.currentTime = cacheMV.iEnd;
                v.pause();
            }
        },
        exec() {
            if (cfg.isLive || !v) {
                showTip('直播无法缓存');
                return;
            }
            this.mode = confirm('缓冲模式二选一，确认则全部缓冲，取消则按默认缓冲区大小进行缓冲。');
            this.cached = true;
            v.pause();
            this.rawPlay = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.play = () => new Promise(noopFn);
            this.playPos = v.currentTime;
            v.addEventListener('canplaythrough', this.onCache);
            this.check();
            v.currentTime = this.iEnd;
            showTip('开始缓存视频...');
        }
    };

    // ===== 播放下一集 =====
    function playNext() {
        if (cfg.btnNext) {
            doClick(cfg.btnNext);
            return;
        }

        // 数字URL自动跳转
        if (cfg.isNumURL) {
            const m = path.match(/(\d+)(\D*)$/);
            if (m) {
                const nextNum = +m[1] + 1;
                location.assign(path.slice(0, m.index) + nextNum + m[2]);
            }
        }
    }

    // ===== 字幕切换（发送消息到content script）=====
    function toggleSubtitle() {
        window.postMessage({
            source: 'h5video-page',
            type: 'toggleSubtitle'
        }, '*');
        showTip('切换字幕服务...');
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
        [32, () => {
            if (cfg.btnPlay) clickDualButton(cfg.btnPlay);
            else if (v) v.paused ? v.play() : v.pause();
        }],
        [13, () => {
            if (_fs) _fs.toggle();
            else if (cfg.btnFS) clickDualButton(cfg.btnFS);
        }],
        [13 + 1024, () => {
            if (_fp) _fp.toggle();
            else if (cfg.btnFP) clickDualButton(cfg.btnFP);
        }],
        [27, () => {
            if (FullScreen.isFull()) {
                _fs ? _fs.exit() : cfg.btnFS && clickDualButton(cfg.btnFS);
            } else if (_fp && FullPage.isFull(v)) {
                _fp.toggle();
            }
        }],
        [73, togglePIP],
        [80, takeScreenshot],
        [77, () => { cacheMV.cached ? cacheMV.finish() : cacheMV.exec(); }],
        [78, playNext],
        [83, toggleSubtitle],
    ]);

    // ===== 站点适配路由 =====
    const siteRouter = {
        youtube() {
            cfg.shellCSS = '#player';
            cfg.playCSS = 'button.ytp-play-button';
            cfg.nextCSS = 'a.ytp-next-button';
            cfg.fullCSS = 'button.ytp-fullscreen-button';
            cfg.isClickOnVideo = true;
            actList.delete(32);
            actList.set(69, actList.get(70)); actList.delete(70);
            actList.set(86, actList.get(67)); actList.delete(67);
            console.log('[H5Video] YouTube配置已应用');
        },

        bilibili() {
            cfg.isLive = host.startsWith('live.');
            if (!cfg.isLive) {
                cfg.shellCSS = '#bilibili-player';
                cfg.nextCSS = '.bpx-player-ctrl-next';
                cfg.webfullCSS = '.bpx-player-ctrl-web';
                cfg.fullCSS = '.bpx-player-ctrl-full';
                actList.delete(32);
            }
        },

        douyin() {
            cfg.isLive = host.startsWith('live.');
            cfg.fullCSS = '.xgplayer-fullscreen';
            if (!cfg.isLive) {
                actList.set(65, actList.get(90)); actList.delete(90);
                actList.set(83, actList.get(88)); actList.delete(88);
                actList.set(86, actList.get(67)); actList.delete(67);
                console.log('[H5Video] 抖音快捷键：A=切换速度, S=减速, V=加速');
            }
        },

        qq() {
            actList.delete(32);
            cfg.shellCSS = '#player';
            cfg.nextCSS = '.txp_btn_next_u';
            cfg.webfullCSS = '.txp_btn_fake';
            cfg.fullCSS = '.txp_btn_fullscreen';
            for (let i = 37; i <= 40; i++) actList.delete(i);
        },

        youku() {
            actList.delete(37);
            actList.delete(39);
            if (host.startsWith('vku.')) {
                cfg.fullCSS = '.live_icon_full';
            } else {
                cfg.shellCSS = '#ykPlayer';
                cfg.webfullCSS = '.kui-webfullscreen-icon-0';
                cfg.fullCSS = '.kui-fullscreen-icon-0';
                cfg.nextCSS = '.kui-next-icon-0';
            }
        },

        iqiyi() {
            cfg.fullCSS = '.iqp-btn-fullscreen:not(.fake__click)';
            cfg.nextCSS = '.iqp-btn-next';
        },

        mgtv() {
            cfg.fullCSS = 'mango-screen';
            cfg.webfullCSS = 'mango-webscreen > a';
            cfg.nextCSS = 'mango-control-playnext-btn';
        },

        ixigua() {
            cfg.fullCSS = 'div[aria-label="全屏"]';
            cfg.nextCSS = '.xgplayer-control-item.control_playnext';
        },

        pptv() {
            cfg.fullCSS = '.w-zoom-container > div';
            cfg.webfullCSS = '.w-expand-container > div';
            cfg.nextCSS = '.w-next';
        },

        miguvideo() {
            cfg.nextCSS = '.next-btn';
            cfg.fullCSS = '.zoom-btn';
            cfg.shellCSS = '.mod-player';
        },

        acfun() {
            cfg.nextCSS = '.btn-next-part .control-btn';
            cfg.webfullCSS = '.fullscreen-web';
            cfg.fullCSS = '.fullscreen-screen';
        },

        sohu() {
            cfg.nextCSS = 'li.on[data-vid]+li a';
            cfg.fullCSS = '.x-fullscreen-btn';
            cfg.webfullCSS = '.x-pagefs-btn';
        },

        douyu() {
            cfg.isLive = !host.startsWith('v.');
            if (cfg.isLive) {
                cfg.shellCSS = '#js-player-video';
                cfg.webfullCSS = '.wfs-2a8e83';
                cfg.fullCSS = '.fs-781153';
                cfg.playCSS = 'div[class|=play]';
            }
        },

        huya() {
            cfg.disableDBLClick = true;
            cfg.webfullCSS = '.player-fullpage-btn';
            cfg.fullCSS = '.player-fullscreen-btn';
            cfg.playCSS = '#player-btn';
        },

        twitch() {
            cfg.isLive = !path.startsWith('/videos/');
            cfg.fullCSS = 'button[data-a-target=player-fullscreen-button]';
            cfg.webfullCSS = '.player-controls__right-control-group > div:nth-child(4) > button';
            cfg.playCSS = 'button[data-a-target=player-play-pause-button]';
        },

        ted() {
            cfg.fullCSS = 'button[title=Fullscreen]';
        }
    };

    // 应用站点配置
    function applySiteConfig() {
        if (siteRouter[u]) {
            siteRouter[u]();
            console.log('[H5Video] 已应用站点配置:', u);
        }

        // 检测是否为数字URL分集
        if (!cfg.isNumURL) {
            cfg.isNumURL = /[_\W]\d+(\/|\.[a-z]{3,8})?$/.test(path);
        }
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

    // ===== 查找视频或音频 =====
    function findVideo() {
        // 优先查找视频
        const videos = d.getElementsByTagName('video');
        for (const el of videos) {
            if (el.offsetWidth > 9) return el;
        }
        if (videos[0]) return videos[0];

        // 如果没找到视频,查找音频
        const audios = d.getElementsByTagName('audio');
        for (const el of audios) {
            if (el.offsetWidth > 1 || el.offsetHeight > 1) return el;
        }
        return audios[0] || null;
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

    // ===== 播放器检测 =====
    function getDPlayer() {
        if (!v || !v.matches('.dplayer-video')) return null;
        const el = v.closest('.dplayer');
        if (el) {
            cfg.btnFP = q('.dplayer-full-in-icon > span', el);
            cfg.btnFS = q('.dplayer-full-icon', el);
            const container = el.closest('body > *');
            if (container) container.classList.add('gm-dp-zTop');
        }
        return el;
    }

    function getArtplayer() {
        const el = v.parentNode;
        if (!v.matches('.art-video') || !el.matches('.art-video-player')) return null;
        cfg.btnFP = q('.art-control-fullscreenWeb', el);
        cfg.btnFS = q('.art-control-fullscreen', el);
        const container = el.closest('body > *');
        if (container) container.classList.add('gm-dp-zTop');
        return el;
    }

    function getVjsPlayer() {
        const el = v.closest('.video-js');
        if (el) {
            cfg.btnFS = q('.vjs-control-bar > button.vjs-button:nth-last-of-type(1)', el);
            cfg.webfullCSS = '.vjs-control-bar > button.vjs-button[title$="全屏"]:nth-last-of-type(2)';
        }
        return el;
    }

    // ===== UI检测（按钮查找）=====
    function checkUI() {
        if (cfg.webfullCSS && !cfg.btnFP) cfg.btnFP = q(cfg.webfullCSS);
        if (cfg.fullCSS && !cfg.btnFS) cfg.btnFS = q(cfg.fullCSS);
        if (cfg.nextCSS && !cfg.btnNext) cfg.btnNext = q(cfg.nextCSS);
        if (cfg.playCSS && !cfg.btnPlay) cfg.btnPlay = q(cfg.playCSS);
    }

    // ===== 设置播放器容器 =====
    function setPlayerShell() {
        const shell = getDPlayer() ||
            getArtplayer() ||
            getVjsPlayer() ||
            (cfg.shellCSS && q(cfg.shellCSS)) ||
            getPlayerContainer(v);

        if (shell && cfg.mvShell !== shell) {
            cfg.mvShell = shell;
            console.log('[H5Video] 播放器容器已设置');
        }
    }

    // ===== 获取播放器容器 =====
    function getPlayerContainer(video) {
        if (!video) return null;
        let e = video, p = e.parentNode;
        const { clientWidth: w, clientHeight: h } = e;
        while (p && p !== d.body && p.clientWidth - w < 5 && p.clientHeight - h < 5) {
            e = p;
            p = e.parentNode;
        }
        return e;
    }

    // ===== 初始化视频 =====
    function initVideo(el) {
        v = el;
        _fs = new FullScreen(v);

        // 设置播放器容器
        setPlayerShell();
        const shell = cfg.mvShell;

        _fp = new FullPage(shell);

        // 记忆播放速度
        const savedRate = +localStorage.mvPlayRate;
        if (savedRate && savedRate !== 1) v.playbackRate = savedRate;
        v.addEventListener('ratechange', () => {
            if (v.playbackRate && v.playbackRate !== 1) localStorage.mvPlayRate = v.playbackRate;
        });

        // 直播检测：禁用时间相关快捷键
        v.addEventListener('canplay', () => {
            if (v.duration === Infinity || cfg.isLive) {
                for (const k of [37, 37 + 1024, 39, 39 + 1024, 67, 77, 78, 86, 88, 90]) actList.delete(k);
                cfg.isLive = true;
                console.log('[H5Video] 检测到直播，禁用时间相关快捷键');
            }
            checkUI();
        }, { once: true });

        // 双击全屏（如果启用）
        if (!cfg.disableDBLClick && shell) {
            const target = cfg.isClickOnVideo ? v : shell;
            target.addEventListener('dblclick', (e) => {
                if (e.target.closest('svg,img,button')) return;
                e.stopPropagation();
                checkUI();
                if (_fp) _fp.toggle();
            });
        }

        // 鼠标中键快进
        if (shell) {
            const target = cfg.isClickOnVideo ? v : shell;
            target.addEventListener('mousedown', (e) => {
                if (e.button === 1 && !cfg.isLive) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (v) v.currentTime += 5;
                    showTip('快进 5秒');
                }
            });
        }

        checkUI();
        // showTip('HTML5视频工具已就绪');
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
        // 智能检测是否需要启用
        if (!shouldEnableScript()) {
            console.log('[H5Video] 当前网站不需要启用');
            return;
        }

        console.log('[H5Video] 初始化中，网站:', host);

        // 应用站点配置
        applySiteConfig();

        // 注册键盘事件
        window.addEventListener('keydown', handleKeydown, true);

        // 轮询等待视频出现
        let checkCount = 0;
        const maxChecks = 30;
        const tryFind = () => {
            const el = findVideo();
            if (el) {
                initVideo(el);
                return;
            }
            checkCount++;
            if (checkCount < maxChecks) {
                setTimeout(tryFind, 300);
            } else {
                console.log('[H5Video] 未检测到视频元素');
            }
        };
        tryFind();

        // ShadowRoot 中的视频（如 YouTube、B站新播放器）
        hookAttachShadow(async sr => {
            await new Promise(r => setTimeout(r, 600));
            if (v) return;
            const el = q('video', sr);
            if (el) {
                console.log('[H5Video] 在ShadowRoot中找到视频');
                initVideo(el);
            }
        });

        // MutationObserver 监听新视频（多视频或动态加载）
        new MutationObserver(() => {
            const el = findVideo();
            if (el && el !== v) {
                console.log('[H5Video] 检测到新视频，重新初始化');
                initVideo(el);
                checkUI();
            }
        }).observe(d.documentElement, { childList: true, subtree: true });

        // SPA URL 变化后重新检测视频
        listenURLChange(async () => {
            await new Promise(r => setTimeout(r, 1000));
            console.log('[H5Video] URL变化，重新检测视频');
            const el = findVideo();
            if (el && el !== v) {
                initVideo(el);
                checkUI();
            }
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

    // ==================== 倍速控制 UI ====================
    setTimeout(() => {
        if (!d.body) return;

        let speedPanel, speedSlider, speedValue;
        let isVisible = false, hideTimer = null;

        // 注入样式
        const style = d.createElement('style');
        style.textContent = `
            #h5-speed-ui{position:fixed;bottom:80px;right:20px;background:rgba(28,28,30,.96);backdrop-filter:blur(12px);border-radius:12px;padding:16px 20px;box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:2147483645;font-family:-apple-system,sans-serif;user-select:none;opacity:0;transform:translateY(20px);transition:all .3s ease;pointer-events:none;min-width:240px;color:#fff}
            #h5-speed-ui.show{opacity:1;transform:translateY(0);pointer-events:all}
            .h5-sp-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
            .h5-sp-tit{font-size:13px;opacity:.7}
            .h5-sp-val{font-size:16px;font-weight:600}
            .h5-sp-sl{width:100%;height:6px;background:rgba(255,255,255,.2);border-radius:3px;position:relative;cursor:pointer;margin:12px 0}
            .h5-sp-pg{height:100%;background:linear-gradient(90deg,#0a84ff,#5ac8fa);border-radius:3px;position:relative}
            .h5-sp-th{position:absolute;right:-8px;top:50%;transform:translateY(-50%);width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:grab}
            .h5-sp-th:active{cursor:grabbing}
            .h5-sp-ps{display:flex;gap:6px;flex-wrap:wrap}
            .h5-sp-pb{flex:1;min-width:48px;padding:6px 10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:6px;text-align:center;font-size:12px;cursor:pointer;transition:all .2s}
            .h5-sp-pb:hover{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.4)}
            .h5-sp-pb.active{background:#0a84ff;border-color:#0a84ff}
            .h5-sp-tip{font-size:11px;opacity:.6;margin-top:10px;text-align:center}
        `;
        d.head.appendChild(style);

        // 创建UI
        speedPanel = d.createElement('div');
        speedPanel.id = 'h5-speed-ui';
        speedPanel.innerHTML = `
            <div class="h5-sp-hd">
                <span class="h5-sp-tit">播放速度</span>
                <span class="h5-sp-val">1.0x</span>
            </div>
            <div class="h5-sp-sl">
                <div class="h5-sp-pg" style="width:20%">
                    <div class="h5-sp-th"></div>
                </div>
            </div>
            <div class="h5-sp-ps">
                <button class="h5-sp-pb" data-speed="0.5">0.5x</button>
                <button class="h5-sp-pb" data-speed="0.75">0.75x</button>
                <button class="h5-sp-pb active" data-speed="1">1.0x</button>
                <button class="h5-sp-pb" data-speed="1.25">1.25x</button>
                <button class="h5-sp-pb" data-speed="1.5">1.5x</button>
                <button class="h5-sp-pb" data-speed="2">2.0x</button>
            </div>
            <div class="h5-sp-tip">拖动滑块或点击预设 | Q显示/隐藏 | E键±0.1</div>
        `;
        d.body.appendChild(speedPanel);

        speedSlider = speedPanel.querySelector('.h5-sp-sl');
        speedValue = speedPanel.querySelector('.h5-sp-val');
        const progress = speedPanel.querySelector('.h5-sp-pg');
        const thumb = speedPanel.querySelector('.h5-sp-th');

        // 设置速度
        function setSpeed(s) {
            if (!v) return;
            s = Math.max(0.25, Math.min(4, s));
            v.playbackRate = s;
            const pct = (s - 0.25) / 3.75 * 100;
            progress.style.width = pct + '%';
            speedValue.textContent = s.toFixed(2) + 'x';
            speedPanel.querySelectorAll('.h5-sp-pb').forEach(b => {
                b.classList.toggle('active', Math.abs(parseFloat(b.dataset.speed) - s) < 0.05);
            });
        }

        // 显示/隐藏
        function show() {
            if (!v) return;
            // 全屏时把面板挂到全屏元素下，否则会被全屏元素（top layer）盖住看不见。
            const fsEl = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement;
            const target = (fsEl && fsEl.appendChild) ? fsEl : d.body;
            if (speedPanel.parentNode !== target) target.appendChild(speedPanel);
            speedPanel.classList.add('show');
            isVisible = true;
            setSpeed(v.playbackRate);
            autoHide();
        }
        function hide() {
            speedPanel.classList.remove('show');
            isVisible = false;
        }
        function autoHide() {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(hide, 3000);
        }

        // 事件
        speedPanel.querySelectorAll('.h5-sp-pb').forEach(btn => {
            btn.onclick = () => setSpeed(parseFloat(btn.dataset.speed));
        });

        speedSlider.onclick = e => {
            const rect = speedSlider.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setSpeed(0.25 + pct * 3.75);
        };

        let dragging = false;
        thumb.onmousedown = e => { dragging = true; e.stopPropagation(); };
        d.addEventListener('mousemove', e => {
            if (!dragging) return;
            const rect = speedSlider.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setSpeed(0.25 + pct * 3.75);
            e.preventDefault();
        });
        d.addEventListener('mouseup', () => dragging = false);

        speedPanel.onmouseenter = () => clearTimeout(hideTimer);
        speedPanel.onmouseleave = autoHide;

        // Q键显示/隐藏,E键加速
        actList.set(81, () => isVisible ? hide() : show());
        const oldE = actList.get(69);
        actList.set(69, ev => {
            if (ev && ev.shiftKey && oldE) return oldE(ev);
            if (!v) return;
            setSpeed(Math.min(4, v.playbackRate + 0.1));
            show();
        });

    }, 1000);

})();
