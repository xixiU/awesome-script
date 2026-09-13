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
    // 可见，并拦截失焦类事件的下发。可通过 localStorage 针对站点关闭：
    // localStorage.h5video_antiPause_off = '1'
    //
    // 关键：保护必须"延迟武装"(armed)——只有页面真实可见过之后才生效。
    // 若在后台标签页加载期间就伪装 visible（右键"在新标签页打开视频"的场景），
    // 播放器会以为能立即起播，但浏览器实际拦截后台标签页的媒体播放；播放器原本
    // 依赖 visibilitychange 在切到前台时重试起播，该事件又被我们吞掉，结果视频
    // 永远停在初始状态，必须刷新才能播放（pornhub 多开标签页即此症状）。
    (function () {
        try {
            if (localStorage.getItem('h5video_antiPause_off') === '1') return;
        } catch (e) { /* ignore */ }

        const rawAdd = EventTarget.prototype.addEventListener;
        const rawRemove = EventTarget.prototype.removeEventListener;

        // 先取原生可见性读取方式，武装前用它返回真实状态
        const protoDesc = p => {
            try { return Object.getOwnPropertyDescriptor(Document.prototype, p); } catch (e) { return null; }
        };
        const hiddenDesc = protoDesc('hidden');
        const realHidden = () => {
            try { return hiddenDesc && hiddenDesc.get ? !!hiddenDesc.get.call(document) : false; } catch (e) { return false; }
        };

        let armed = false; // 保护是否已生效

        // 武装时机：页面真实可见之后。
        // 后台加载的标签页要等真正切到前台再武装；且必须等站点自己处理完这次
        // "变可见"事件之后（延后一拍）才置 armed，否则站点赖以起播的那一次
        // visibilitychange 会被下面的拦截器吞掉。
        // 注意此监听必须先于拦截器注册（同为 window 捕获阶段，按注册顺序执行），
        // 否则武装后它自己也收不到事件。
        const arm = () => { armed = true; };
        if (!realHidden()) {
            arm();
        } else {
            const onVis = () => {
                if (realHidden()) return;
                rawRemove.call(window, 'visibilitychange', onVis, true);
                setTimeout(arm, 1000); // 给播放器的异步起播留出时间
            };
            rawAdd.call(window, 'visibilitychange', onVis, true);
        }

        // 伪装可见性：武装后恒为"可见"，武装前返回真实值
        const spoof = (obj, prop, whenArmed, whenNot) => {
            try {
                Object.defineProperty(obj, prop, {
                    configurable: true,
                    get: () => (armed ? whenArmed : whenNot()),
                });
            } catch (e) { /* ignore */ }
        };
        const realVisState = () => (realHidden() ? 'hidden' : 'visible');
        [Document.prototype, document].forEach(obj => {
            spoof(obj, 'hidden', false, realHidden);
            spoof(obj, 'webkitHidden', false, realHidden);
            spoof(obj, 'visibilityState', 'visible', realVisState);
            spoof(obj, 'webkitVisibilityState', 'visible', realVisState);
        });

        // 拦截失焦类事件：在 window 捕获阶段最先接住，武装后 stopImmediatePropagation
        // 掉，站点的失焦暂停回调就收不到（无论它注册在 document 还是 window，也无论
        // 用 addEventListener 还是 on* 属性）。
        //
        // 这里刻意不去覆盖 EventTarget.prototype.addEventListener：那样全页面每一次
        // 监听注册都要过我们的函数，栈顶变成本文件，站点注册 unload 之类被
        // Permissions-Policy 拦下的事件时，警告会被误报到我们身上
        // （"injected.js (EventTarget.addEventListener) Permissions policy violation:
        // unload is not allowed in this document"），且白白拖慢所有注册、还容易
        // 破坏 once / AbortSignal / handleEvent 对象等原生语义。
        const BLOCKED = ['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange', 'blur', 'pagehide', 'freeze'];
        BLOCKED.forEach(type => {
            try {
                rawAdd.call(window, type, e => {
                    if (!armed) return;
                    // 只拦以 document/window 为目标的（站点的失焦暂停挂在这里）。
                    // 元素自身的 blur 是无害的 UI 焦点事件，捕获阶段也会经过 window，
                    // 必须放行，否则输入框失焦等交互会被打断。
                    const t = e.target;
                    if (t !== document && t !== window) return;
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                }, true);
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

    // 设置播放速率并锁定，抵御部分站点（如 pornhub）的 ratechange 拉回逻辑。
    // 这些站点会在外部修改 playbackRate 后约 300ms 内把它强制改回内部记录值，
    // 导致"倍速只能按一次、按多次不变"。这里在 video 实例上安装守卫 getter/setter：
    // 脚本设定的期望值记录在 _gmDesiredRate，站点写入的其它值都会被改回期望值。
    const RATE_DESC = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
    // 站点自定义 UI 同步器：某些播放器（如 YouTube）的速度菜单显示的是内部状态，
    // 直接改 video.playbackRate 只能改实际速率但不能同步 UI。这里在设速后调用站点适配，
    // 让菜单文案与实际速率保持一致（受站点 API 支持的档位限制，超出档位会显示上限值）。
    function _callPlayerAPI(inst, rate) {
        if (!inst) return false;
        try {
            if (typeof inst.setPlaybackRate === 'function') { inst.setPlaybackRate(rate); return true; }
            if ('playbackRate' in inst) { inst.playbackRate = rate; return true; }
        } catch (e) { /* ignore */ }
        return false;
    }
    function siteRateUISync(video, rate) {
        try {
            // 1. 站点专属 API 优先
            if (u === 'youtube') {
                const yp = d.getElementById('movie_player') || q('#movie_player');
                if (_callPlayerAPI(yp, rate)) return;
            }
            // 2. 常见 window 全局播放器实例（腾讯 __PLAYER__、B 站 player 等）
            const w = window;
            if (_callPlayerAPI(w.__PLAYER__, rate)) return;
            if (_callPlayerAPI(w.PLAYER, rate)) return;
            if (_callPlayerAPI(w.player, rate)) return;
            // 3. 通用兜底：探测挂在 video 元素上的 player 实例（xgplayer/dplayer/artplayer）
            if (_callPlayerAPI(video._player, rate)) return;
            if (_callPlayerAPI(video.player, rate)) return;
            if (_callPlayerAPI(video.__player, rate)) return;
            // 4. 兜底派发 ratechange：应对通过事件驱动 UI 更新的播放器
            video.dispatchEvent(new Event('ratechange'));
        } catch (e) { /* 静默失败，不影响主流程 */ }
    }
    function setPlaybackRate(video, rate) {
        if (!video) return;
        rate = +rate.toFixed(2);
        if (!video._gmRateGuard && RATE_DESC && RATE_DESC.get && RATE_DESC.set) {
            try {
                Object.defineProperty(video, '_gmRateGuard', { value: true, writable: false, enumerable: false });
                Object.defineProperty(video, 'playbackRate', {
                    configurable: true,
                    enumerable: true,
                    get() { return RATE_DESC.get.call(this); },
                    set(val) {
                        const target = (this._gmDesiredRate != null && +val.toFixed(2) !== this._gmDesiredRate)
                            ? this._gmDesiredRate : val;
                        RATE_DESC.set.call(this, target);
                    }
                });
                installRateChangeBlocker(video);
            } catch (e) { /* ignore，退回普通赋值 */ }
        }
        video._gmDesiredRate = rate;
        if (RATE_DESC && RATE_DESC.set) RATE_DESC.set.call(video, rate);
        else video.playbackRate = rate;
        // 同步站点自身 UI（YouTube 等）
        siteRateUISync(video, rate);
    }

    // 拦截 ratechange 钳制：部分播放器只接受离散档位（如 {0.5,1,1.5,2}，上限 2.0），
    // 会在自己的 ratechange 处理里把"非法"速率（脚本 +0.1 步进产生的 1.1/1.6/2.1 等）
    // 打回最近的合法档位，表现为"按键有反应但速率被立刻拉回、无法真正倍速"。
    // 修复：捕获阶段监听 ratechange，当实际速率已等于期望值时 stopImmediatePropagation，
    // 阻止站点的钳制回调执行，从而支持任意倍速。
    function installRateChangeBlocker(video) {
        if (video._gmRateBlocker) return;
        Object.defineProperty(video, '_gmRateBlocker', { value: true, writable: false, enumerable: false });
        video.addEventListener('ratechange', function (e) {
            const desired = this._gmDesiredRate;
            if (desired == null || desired === 1) return; // 常速交还站点自主控制
            const cur = RATE_DESC && RATE_DESC.get ? RATE_DESC.get.call(this) : this.playbackRate;
            if (Math.abs(cur - desired) < 0.01) e.stopImmediatePropagation();
        }, true);
    }

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
        // 同时切换定位方式：全屏时用 absolute（相对容器），非全屏用 fixed（相对 viewport），
        // 避免全屏容器有 transform 时 fixed 元素继承缩放导致提示框变大。
        const fsEl = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement;
        const target = (fsEl && fsEl.appendChild) ? fsEl : d.body;
        if (el.parentNode !== target) {
            target.appendChild(el);
            // 全屏时改用 absolute，避免容器 transform 影响；非全屏恢复 fixed
            el.style.position = fsEl ? 'absolute' : 'fixed';
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
            // 对包裹视频的容器全屏，而非裸 <video>。<video> 是替换元素无法渲染子节点，
            // 若对它全屏，倍速提示等挂进去也不会显示；对容器全屏则提示可正常展示。
            // 仅当目标是"我们找的容器"（而非 video 本身）时才需要填充样式，
            // 且用 gm-fs-scope 类把填充样式限定在本容器内，避免污染站点自身的原生全屏（如 YouTube 用 JS 精确定位视频）。
            const container = (el && el.tagName === 'VIDEO' && getPlayerContainer(el)) || el;
            this._target = container;
            this._needFill = !!(el && el.tagName === 'VIDEO' && container && container !== el);
            const enter = container.requestFullscreen || container.webkitRequestFullScreen || container.mozRequestFullScreen || noopFn;
            this._enterRaw = enter.bind(container);
        }
        enter() {
            if (this._needFill && this._target) this._target.classList.add('gm-fs-scope');
            this._enterRaw();
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
                // 优先用站点指定的播放器容器（shellCSS，如 YouTube 的 #player），
                // 避免 getPlayerContainer 在 video 高度为 0 时误爬到 <body>/根节点，
                // 导致 gm-fp-innerBox 链式塌陷、画面变黑。
                const shell = (cfg.shellCSS && q(cfg.shellCSS));
                this.container = (shell && shell.contains(v)) ? shell : getPlayerContainer(v);
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

    // 退出原生全屏时清理填充作用域类，避免残留影响非全屏布局
    d.addEventListener('fullscreenchange', () => {
        if (!(d.fullscreenElement || d.webkitFullscreenElement)) {
            d.querySelectorAll('.gm-fs-scope').forEach(el => el.classList.remove('gm-fs-scope'));
        }
    });

    // ===== 速度 / 音量 =====
    function adjustRate(n) {
        if (!v) return;
        setPlaybackRate(v, Math.min(16, Math.max(0.1, +(v.playbackRate + n).toFixed(2))));
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
            setPlaybackRate(v, (v.playbackRate === 1 || v.playbackRate === 0)
                ? (+localStorage.mvPlayRate || +(localStorage.h5video_defaultRate || 1.5)) : 1);
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
    // 只接受“真正可用”的媒体元素，避免把页面里隐藏的埋点/广告/预加载
    // <video>/<audio>（0 尺寸、无 src）误当成播放目标——那会导致在没有实际
    // 播放元素的页面上按 C/X 也能改到一个不可见元素的 playbackRate 并弹提示。
    // 判定“正在被用户使用”的兜底：有有效 src 且已开始播放（未暂停或 currentTime>0）。
    const isUsableMedia = el => {
        if (!el) return false;
        if (el.offsetWidth > 9 || el.offsetHeight > 9) return true; // 可见即可用
        const hasSrc = !!(el.currentSrc || el.src || el.querySelector('source[src]'));
        return hasSrc && (!el.paused || el.currentTime > 0); // 不可见但确实在播放
    };

    // 判定 GIF 动图：很多平台（如 Twitter/X）把 GIF 用无声 <video> 实现，
    // 它不是用户认知里的“视频”，不应响应倍速/快进等快捷键。
    // 多重特征叠加，降低把真正短视频误判的风险：
    //   1) URL 走平台 GIF 专属路径（tweet_video 等）——最强信号，单独命中即算
    //   2) 通用启发式：无音轨 + 极短时长(<10s) + 无原生 controls + (loop 或 autoplay)
    const hasAudioTrack = el => {
        // 各浏览器暴露方式不同，任一为真即认为有音轨；都拿不到则保守当作“有”
        if (el.mozHasAudio) return true;
        if (el.webkitAudioDecodedByteCount > 0) return true;
        if (el.audioTracks) return el.audioTracks.length > 0;
        return true;
    };
    const isGifVideo = el => {
        if (!el || el.tagName !== 'VIDEO') return false;
        const src = el.currentSrc || el.src || '';
        if (/tweet_video(_thumb)?\//.test(src)) return true; // 平台 GIF 专属路径
        const dur = el.duration;
        const shortEnough = dur && isFinite(dur) && dur > 0 && dur < 10;
        return shortEnough && !hasAudioTrack(el) && !el.controls && (el.loop || el.autoplay);
    };

    function findVideo() {
        // 优先查找可见视频（排除 GIF 动图）
        const videos = d.getElementsByTagName('video');
        for (const el of videos) {
            if (el.offsetWidth > 9 && !isGifVideo(el)) return el;
        }
        // 其次：不可见但确实在播放的视频（如画中画、纯音频播放的 video）
        for (const el of videos) {
            if (isUsableMedia(el) && !isGifVideo(el)) return el;
        }

        // 没有可用视频再找音频
        const audios = d.getElementsByTagName('audio');
        for (const el of audios) {
            if (el.offsetWidth > 1 || el.offsetHeight > 1) return el;
        }
        for (const el of audios) {
            if (isUsableMedia(el)) return el;
        }
        // 找不到任何“可用”媒体时返回 null——绝不盲目返回第一个隐藏/GIF 元素
        return null;
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
        // 当 video 尺寸无效（宽或高为 0，常见于加载初期或布局塌陷）时，
        // 尺寸比较会失真而一路爬到根节点，这里直接返回其父容器兜底，避免误判。
        if (w <= 0 || h <= 0) {
            return (p && p !== d.body) ? p : e;
        }
        while (p && p !== d.body && p.clientWidth - w < 5 && p.clientHeight - h < 5) {
            e = p;
            p = e.parentNode;
        }
        return e;
    }

    // ===== 自动选择最高清晰度 =====
    // 设计约束（重要）：
    // 1. 只在视频初始化时触发一次，绝不定时轮询。清晰度是用户可改的设置，
    //    定时触发会把用户的手动选择反复覆盖掉。
    // 2. 必须跳过需要会员/付费才能观看的档位。这类档位点下去通常弹登录/开通引导，
    //    或直接卡住不播，比停留在低清晰度更糟。判定见 isLockedOption。
    // 3. 全程静默失败：站点 DOM 结构随时会变，任何一步不匹配就放弃，不影响其它功能。
    // 通过 localStorage.h5video_autoQuality_off = '1' 可关闭本功能。
    const AQ_DONE = new WeakSet(); // 已处理过的 video 元素，保证一次性

    // 从文案解析清晰度高度：'1080P'->1080、'4K'->2160、'超清'->按名次给分
    const NAMED_QUALITY = [
        [/8k|4320/i, 4320], [/4k|2160|ultra\s*hd/i, 2160], [/1440|2k|quad/i, 1440],
        [/1080|full\s*hd|fhd|蓝光|超清/i, 1080], [/720|hd\b|高清/i, 720],
        [/540|清晰/i, 540], [/480|标清|sd\b/i, 480], [/360/i, 360], [/240/i, 240], [/144/i, 144],
    ];
    function parseQuality(text) {
        if (!text) return 0;
        const s = String(text).trim();
        // 优先取显式数字（如 "1080p60"、"1920x1080"）
        const m = s.match(/(\d{3,4})\s*[pP]|[xX×]\s*(\d{3,4})/);
        if (m) return +(m[1] || m[2]);
        for (const [re, h] of NAMED_QUALITY) if (re.test(s)) return h;
        const bare = s.match(/\b(\d{3,4})\b/);
        return bare ? +bare[1] : 0;
    }

    // 判定档位是否被会员/付费锁定。宁可漏选高清，也不要点进付费墙。
    const LOCK_TEXT = /vip|svip|会员|付费|开通|登录|登陆|premium|paid|unlock|解锁|试用|购买|plus\b|尊享|大会员/i;
    const LOCK_CLASS = /vip|lock|premium|paid|disabled|need|upgrade|badge-pro/i;
    function isLockedOption(el) {
        if (!el) return true;
        try {
            if (el.getAttribute('aria-disabled') === 'true' || el.disabled) return true;
            // 元素自身或其内部标记（皇冠角标、VIP badge 等）
            if (LOCK_CLASS.test(el.className || '')) return true;
            if (LOCK_TEXT.test(el.textContent || '')) return true;
            // 常见做法：用子元素 <i class="vip-icon"> / <svg class="icon-crown"> 打标
            // 注意 i 标志必须写成 [class*="vip" i]，值不加引号会让整个选择器抛错，
            // 那样 catch 里 return true 会把所有档位都判成锁定，功能直接失效。
            if (el.querySelector('[class*="vip" i],[class*="lock" i],[class*="crown" i],[class*="premium" i],[class*="diamond" i]')) return true;
            // data-* 标记
            for (const a of el.attributes || []) {
                if (/vip|premium|lock|need-?(login|pay)/i.test(a.name) && a.value && a.value !== 'false' && a.value !== '0') return true;
            }
        } catch (e) { return true; }
        return false;
    }

    // 通过播放器 JS API 设置（最可靠，不依赖 DOM 结构）
    // 只处理"能明确拿到档位列表并选最高"的情形；拿不到就返回 false 交给 DOM 兜底。
    function setQualityViaAPI(video) {
        // YouTube：用播放器自己的 API 取可用档位并选最高。
        // getAvailableQualityLevels() 返回如 ['hd1080','hd720',...]（已按高到低排序），
        // 且只包含当前账号真正能播的档位，天然规避了付费档问题。
        if (u === 'youtube') {
            const yp = d.getElementById('movie_player');
            if (yp && typeof yp.getAvailableQualityLevels === 'function') {
                const levels = yp.getAvailableQualityLevels();
                if (levels && levels.length) {
                    const top = levels[0];
                    if (typeof yp.setPlaybackQualityRange === 'function') yp.setPlaybackQualityRange(top, top);
                    else if (typeof yp.setPlaybackQuality === 'function') yp.setPlaybackQuality(top);
                    console.log('[H5Video] YouTube 已选最高清晰度:', top);
                    return true;
                }
            }
            return false;
        }
        // hls.js：levels 按码率升序，-1 表示自动。挂载点因站点而异，逐个探测。
        const hls = video._hls || video.hls || window.hls || (window.player && window.player.hls);
        if (hls && Array.isArray(hls.levels) && hls.levels.length > 1) {
            let best = -1, bestH = -1;
            hls.levels.forEach((lv, i) => {
                const h = lv.height || parseQuality(lv.name || lv.attrs && lv.attrs.RESOLUTION);
                if (h > bestH) { bestH = h; best = i; }
            });
            if (best >= 0) {
                hls.currentLevel = best;
                console.log('[H5Video] hls.js 已选最高清晰度:', bestH);
                return true;
            }
        }
        // dash.js
        const dash = video._dash || window.dashPlayer;
        if (dash && typeof dash.setQualityFor === 'function' && typeof dash.getBitrateInfoListFor === 'function') {
            try {
                const list = dash.getBitrateInfoListFor('video');
                if (list && list.length > 1) {
                    dash.setQualityFor('video', list.length - 1);
                    console.log('[H5Video] dash.js 已选最高清晰度');
                    return true;
                }
            } catch (e) { /* ignore */ }
        }
        return false;
    }
    // 站点专属清晰度适配：menu 为需先点开的入口（可空），items 为档位选项
    const QUALITY_SITES = {
        // YouTube 不在此表：它在 setQualityViaAPI 里走播放器 API 提前返回
        pornhub: { items: '.mgp_qualityLi, .qualityLabel li, [data-quality]' },
        bilibili: { menu: '.bpx-player-ctrl-quality', items: '.bpx-player-ctrl-quality-menu-item' },
        iqiyi: { menu: '.iqp-btn-definition', items: '.iqp-list-definition li' },
        youku: { menu: '.kui-quality-trigger', items: '.kui-quality-list li' },
        mgtv: { menu: 'mango-quality', items: '.definition-list li' },
        ixigua: { menu: '.xgplayer-definition', items: '.xgplayer-definition-list li' },
        acfun: { menu: '.quality', items: '.quality-list li' },
    };

    // DOM 方式：点开清晰度菜单，在候选项里挑"未锁定的最高档"并点击。
    // 只做一轮，不轮询、不重试——避免和用户的手动选择打架。
    function setQualityViaDOM(video) {
        const site = QUALITY_SITES[u];
        const scope = cfg.mvShell || d;
        let items = [];

        if (site && site.items) {
            if (site.menu) {
                const trigger = q(site.menu, scope) || q(site.menu);
                if (trigger) doClick(trigger); // 展开菜单，选项才会渲染
            }
            items = [...(scope.querySelectorAll(site.items) || [])];
        }

        // 通用兜底：原生 <video> 多源，直接换 src 会打断播放，故只处理
        // "站点渲染出的清晰度列表"这一种情况，靠文案特征找候选项。
        if (!items.length) {
            const cands = scope.querySelectorAll('[data-quality],[data-definition],[data-resolution]');
            items = [...cands];
        }
        if (items.length < 2) return false;

        let best = null, bestH = 0;
        for (const it of items) {
            const h = parseQuality(it.dataset && (it.dataset.quality || it.dataset.definition || it.dataset.resolution) || it.textContent);
            if (!h || h <= bestH) continue;
            if (isLockedOption(it)) {
                console.log('[H5Video] 跳过需会员的清晰度:', h);
                continue;
            }
            best = it; bestH = h;
        }
        if (!best) return false;
        // 已经是最高档就不必点（避免无谓地重载视频流）
        if (best.getAttribute('aria-checked') === 'true' ||
            /active|selected|current|checked|on\b/i.test(best.className || '')) {
            console.log('[H5Video] 已处于最高可用清晰度:', bestH);
            return true;
        }
        doClick(best);
        console.log('[H5Video] 已切换到最高可用清晰度:', bestH);
        return true;
    }

    function autoSelectQuality(video) {
        if (!video || AQ_DONE.has(video)) return;
        if (cfg.isLive) return; // 直播的清晰度切换常触发重连，不动
        try {
            if (localStorage.getItem('h5video_autoQuality_off') === '1') return;
        } catch (e) { /* ignore */ }
        AQ_DONE.add(video); // 无论成功与否都只尝试一次
        try {
            if (setQualityViaAPI(video)) return;
            setQualityViaDOM(video);
        } catch (e) {
            console.log('[H5Video] 自动清晰度选择跳过:', e && e.message);
        }
    }

    // ===== 初始化视频 =====
    function initVideo(el) {
        v = el;
        _fs = new FullScreen(v);

        // 设置播放器容器
        setPlayerShell();
        const shell = cfg.mvShell;

        _fp = new FullPage(shell);

        // 记忆播放速度：优先使用记录的倍速，没有记录时使用默认倍速配置（默认 1.5）
        const savedRate = +localStorage.mvPlayRate;
        const defaultRate = +(localStorage.h5video_defaultRate || 1.5);
        if (savedRate && savedRate !== 1) setPlaybackRate(v, savedRate);
        else if (defaultRate !== 1) setPlaybackRate(v, defaultRate);
        v.addEventListener('ratechange', () => {
            if (v.playbackRate && v.playbackRate !== 1) localStorage.mvPlayRate = v.playbackRate;
        });

        // 直播检测：禁用时间相关快捷键
        // 注意不能只凭首次 canplay 的 duration 判定——MSE/流媒体播放器在这一刻
        // 常报 Infinity/NaN，之后才填上真实时长。若据此删键，点播视频的方向键
        // 快进会被永久禁用。所以：站点配置说是直播才立即处理；只靠 duration 时
        // 必须等它稳定（durationchange 后仍为 Infinity）再判定。
        const disableLiveKeys = () => {
            if (cfg.isLive) return;
            for (const k of [37, 37 + 1024, 39, 39 + 1024, 67, 77, 78, 86, 88, 90]) actList.delete(k);
            cfg.isLive = true;
            console.log('[H5Video] 检测到直播，禁用时间相关快捷键');
        };
        v.addEventListener('canplay', () => {
            if (cfg.isLive) {
                disableLiveKeys();
            } else if (v.duration === Infinity) {
                // 给播放器留出补齐时长的机会，仍为 Infinity 才当作直播
                const confirmLive = () => {
                    if (v.duration === Infinity) disableLiveKeys();
                };
                v.addEventListener('durationchange', confirmLive, { once: true });
                setTimeout(confirmLive, 3000);
            }
            checkUI();
        }, { once: true });

        // 自动选最高清晰度：只在视频就绪后跑一次（不轮询，见 autoSelectQuality 说明）。
        // 挂 loadedmetadata 而非 canplay：此时播放器的清晰度菜单/levels 通常已建好，
        // 又还没开始正式播放，切换代价最小。已 ready 的视频直接补一次调用。
        const kickQuality = () => setTimeout(() => autoSelectQuality(v), 600);
        if (v.readyState >= 1) kickQuality();
        else v.addEventListener('loadedmetadata', kickQuality, { once: true });

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

    // ===== 键盘监听：必须在 document_start 同步注册 =====
    // 同一节点同一阶段，监听器按注册顺序执行。若等到 DOMContentLoaded 才注册
    // （main 里注册），站点自己的 keydown 捕获监听已先挂上，它对自己处理的按键调
    // stopImmediatePropagation()，我们的 handler 根本不会被调用——表现为方向键
    // 快进失效（播放器接管了方向键），而 C/X/Z 因站点不处理仍然正常。
    // 所以这里前置到脚本主体同步执行，抢在站点脚本之前注册。
    // 捕获阶段监听（优先级高，能拦截大部分站点）
    window.addEventListener('keydown', handleKeydown, true);
    // 冒泡阶段监听（备用，应对某些站点在捕获阶段阻止事件传播的情况）
    window.addEventListener('keydown', handleKeydown, false);

    if (d.readyState === 'loading') {
        d.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

    // ===== 从扩展存储同步设置到 localStorage =====
    // 本脚本跑在页面世界，多数情况拿不到 chrome.storage，所以 popup 保存时会主动
    // 写 localStorage；这里是首次安装/新标签页的兜底同步。
    (async function initSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                const r = await chrome.storage.sync.get({ defaultPlaybackRate: 1.5, autoTopQuality: true });
                localStorage.h5video_defaultRate = r.defaultPlaybackRate;
                if (r.autoTopQuality) localStorage.removeItem('h5video_autoQuality_off');
                else localStorage.h5video_autoQuality_off = '1';
            }
        } catch (e) {
            // 拿不到 chrome.storage 时沿用已有的 localStorage 值或默认 1.5
            if (!localStorage.h5video_defaultRate) localStorage.h5video_defaultRate = 1.5;
        }
    })();

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

        // 创建UI（使用 DOM API 避免 TrustedHTML 限制）
        speedPanel = d.createElement('div');
        speedPanel.id = 'h5-speed-ui';

        // 头部
        const header = d.createElement('div');
        header.className = 'h5-sp-hd';
        const title = d.createElement('span');
        title.className = 'h5-sp-tit';
        title.textContent = '播放速度';
        speedValue = d.createElement('span');
        speedValue.className = 'h5-sp-val';
        speedValue.textContent = '1.0x';
        header.appendChild(title);
        header.appendChild(speedValue);

        // 滑块
        speedSlider = d.createElement('div');
        speedSlider.className = 'h5-sp-sl';
        const progress = d.createElement('div');
        progress.className = 'h5-sp-pg';
        progress.style.width = '20%';
        const thumb = d.createElement('div');
        thumb.className = 'h5-sp-th';
        progress.appendChild(thumb);
        speedSlider.appendChild(progress);

        // 预设按钮
        const presets = d.createElement('div');
        presets.className = 'h5-sp-ps';
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        speeds.forEach(speed => {
            const btn = d.createElement('button');
            btn.className = 'h5-sp-pb';
            if (speed === 1) btn.classList.add('active');
            btn.dataset.speed = speed;
            btn.textContent = speed + 'x';
            presets.appendChild(btn);
        });

        // 提示
        const tip = d.createElement('div');
        tip.className = 'h5-sp-tip';
        tip.textContent = '拖动滑块或点击预设 | Q显示/隐藏 | E键±0.1';

        speedPanel.appendChild(header);
        speedPanel.appendChild(speedSlider);
        speedPanel.appendChild(presets);
        speedPanel.appendChild(tip);
        d.body.appendChild(speedPanel);

        // 设置速度
        function setSpeed(s) {
            if (!v) return;
            s = Math.max(0.25, Math.min(4, s));
            setPlaybackRate(v, s);
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
