/* globals unsafeWindow */
// ==UserScript==
// @name       HTML5视频播放工具
// @name:en	   HTML5 Video Playing Tools
// @name:it    Strumenti di riproduzione video HTML5
// @description 视频截图；切换画中画；缓存视频；万能网页全屏；添加快捷键：快进、快退、暂停/播放、音量、下一集、切换(网页)全屏、上下帧、播放速度。支持视频站点：油管、TED、优.土、QQ、B站、西瓜视频、爱奇艺、A站、PPTV、芒果TV、咪咕视频、新浪、微博、网易[娱乐、云课堂、新闻]、搜狐、风行、百度云视频等；直播：twitch、斗鱼、YY、虎牙、龙珠、战旗。可增加自定义站点
// @description:en Enable hotkeys for HTML5 playback: video screenshot; enable/disable picture-in-picture; copy cached video; send any video to full screen or browser window size; fast forward, rewind, pause/play, volume, skip to next video, skip to previous or next frame, set playback speed. Video sites supported: YouTube, TED, Youku, QQ.com, bilibili, ixigua, iQiyi, support mainstream video sites in mainland China; Live broadcasts: Twitch, Douyu.com, YY.com, Huya.com. Custom sites can be added
// @description:it Abilita tasti di scelta rapida per riproduzione HTML5: screenshot del video; abilita/disabilita picture-in-picture; copia il video nella cache; manda qualsiasi video a schermo intero o a dimensione finestra del browser; avanzamento veloce, riavvolgimento, pausa/riproduzione, imposta velocità di riproduzione. Siti video supportati: YouTube, TED, Supporto dei siti video mainstream nella Cina continentale. È possibile aggiungere siti personalizzati
// @version    2.1.5
// @match    *://*/*
// @exclude  https://user.qzone.qq.com/*
// @exclude  https://www.dj92cc.net/dance/play/id/*
// @run-at     document-start
// @inject-into content
// @require    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/common/config_manager.js
// @grant      GM_addStyle
// @grant      GM_xmlhttpRequest
// @grant      window.onurlchange
// @grant      unsafeWindow
// @grant      GM_registerMenuCommand
// @grant      GM_setValue
// @grant      GM_getValue
// @license    MIT
// @thanks     https://greasyfork.org/users/7036
// @downloadURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/h5videoPlay/html5videoPlay.js
// @updateURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/h5videoPlay/html5videoPlay.js
// ==/UserScript==

'use strict';

// ===== Trusted Types 保护层（早期拦截，必须在库加载前执行）=====
// 关键：在 Tampermonkey 中，@require 会在脚本主体之前执行，但 IIFE 会在脚本加载时立即执行
// 这个保护层会拦截所有 innerHTML 操作，包括来自其他库（如 jQuery、Vue）的操作
(function () {
    'use strict';

    // 检查是否启用了 Trusted Types
    if (typeof window === 'undefined' || !window.trustedTypes) {
        return; // 没有 Trusted Types，不需要保护
    }

    // 检查是否已经添加过保护层（避免重复添加）
    if (window.__html5VideoPlayerProtected) {
        return;
    }

    try {
        const originalDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        if (!originalDescriptor || !originalDescriptor.set) {
            return;
        }

        const originalSetter = originalDescriptor.set;

        // 尝试创建策略（某些网站如 YouTube 可能不允许创建自定义策略）
        let policy = null;
        try {
            if (window.trustedTypes.createPolicy) {
                policy = window.trustedTypes.createPolicy('html5VideoPlayerPolicy', {
                    createHTML: (input) => String(input)
                });
            }
        } catch (e) {
            // 无法创建策略，继续使用保护层降级方案
        }

        // 覆盖 innerHTML setter（拦截所有 innerHTML 操作）
        Object.defineProperty(Element.prototype, 'innerHTML', {
            set: function (value) {
                try {
                    // 如果有策略，使用策略创建 TrustedHTML
                    if (policy) {
                        const trustedHTML = policy.createHTML(String(value));
                        originalSetter.call(this, trustedHTML);
                        return;
                    }
                    // 尝试直接设置
                    originalSetter.call(this, value);
                } catch (e) {
                    // 如果失败（Trusted Types 错误），静默降级为 textContent
                    if (e.name === 'TypeError' && (e.message.includes('TrustedHTML') || e.message.includes('Trusted Types') || e.message.includes('requires \'TrustedHTML\''))) {
                        try {
                            const textOnly = String(value).replace(/<[^>]*>/g, '');
                            if (textOnly.length > 0) {
                                this.textContent = textOnly;
                            }
                        } catch (err) {
                            // 完全静默，不输出任何错误
                        }
                    } else {
                        // 其他错误，重新抛出
                        throw e;
                    }
                }
            },
            get: originalDescriptor.get,
            configurable: true,
            enumerable: originalDescriptor.enumerable
        });

        // 标记已保护
        window.__html5VideoPlayerProtected = true;
    } catch (e) {
        // 静默失败，避免影响脚本正常执行
    }
})();

// ===== 强制开启原生 controls + 允许拖动进度条（早期注入）=====
// 部分网站通过 controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
// 或反复设置 controls=false 来禁止用户操作原生进度条。此保护层统一放开：
// 1. 原生 controls 始终可显示，用户可单击/拖动进度条
// 2. controlsList 的所有限制项被移除
// 3. 站点脚本再次设置 controls=false 时恢复为 true
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.__html5VideoDraggableProtected) return;
    window.__html5VideoDraggableProtected = true;

    const FLAG = '__gmH5ForceControls';

    // 判断视频是否已被站点自定义播放器接管（已有自定义进度条/控制条）。
    // 若是，则不再强制开启原生 controls，避免出现两条进度条。
    const hasCustomControls = (video) => {
        try {
            const CTRL_RE = /(control|progress|scrubber|seek|playbar|play-bar|toolbar|timeline)/i;
            let el = video, depth = 0;
            while (el && el !== document.body && depth < 5) {
                const scope = el.parentElement || el;
                // 常见的自定义进度条/拖动条元素
                if (scope.querySelector(
                    'input[type="range"], [role="slider"], progress, ' +
                    '[class*="progress"], [class*="scrubber"], [class*="seek"], ' +
                    '[class*="control-bar"], [class*="controlbar"], [class*="ControlBar"]'
                )) {
                    return true;
                }
                if (el.className && typeof el.className === 'string' && CTRL_RE.test(el.className)) {
                    return true;
                }
                el = el.parentElement;
                depth++;
            }
        } catch (e) { /* ignore */ }
        return false;
    };

    const enforce = (video) => {
        if (!video || !(video instanceof HTMLMediaElement) || video[FLAG]) return;
        try {
            Object.defineProperty(video, FLAG, { value: true, configurable: false, enumerable: false, writable: false });
        } catch (e) { video[FLAG] = true; }

        // 记录站点主动关闭 controls 的次数。
        // 若超过阈值，说明站点在自主管理控制条显示/隐藏（如鼠标离开自动隐藏），
        // 此时停止强制恢复，避免进度条永远无法隐藏。
        let disableAttempts = 0;
        const MAX_DISABLE = 3;

        const apply = () => {
            try {
                // 始终解除限制类属性（不影响站点自身控制条），只放开单击/拖动能力
                if (video.hasAttribute('controlslist')) video.removeAttribute('controlslist');
                ['disableRemotePlayback', 'disablePictureInPicture'].forEach(attr => {
                    if (video.hasAttribute(attr)) video.removeAttribute(attr);
                });
                // 仅当站点没有自己的播放器 UI 且站点未反复关闭 controls 时，才强制开启。
                if (!video.controls && !hasCustomControls(video)) {
                    if (disableAttempts >= MAX_DISABLE) return; // 站点在自主管理，放手
                    disableAttempts++;
                    video.controls = true;
                }
            } catch (e) { /* ignore */ }
        };

        apply();
        // 站点的自定义控制条可能在视频出现后才异步构建，稍后复核一次，
        // 若发现已接管则撤销我们强加的原生 controls。
        [800, 2500].forEach(delay => setTimeout(() => {
            try {
                if (video.controls && hasCustomControls(video)) video.controls = false;
            } catch (e) { /* ignore */ }
        }, delay));
        try {
            new MutationObserver(apply).observe(video, {
                attributes: true,
                attributeFilter: ['controls', 'controlslist', 'disableremoteplayback', 'disablepictureinpicture']
            });
        } catch (e) { /* ignore */ }
    };

    const scan = (root) => {
        if (!root || !root.querySelectorAll) return;
        if (root.tagName === 'VIDEO') enforce(root);
        root.querySelectorAll && root.querySelectorAll('video').forEach(enforce);
    };

    // 拦截 setAttribute，过滤 controlslist 类属性
    try {
        const rawSetAttr = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name, value) {
            if (this instanceof HTMLMediaElement && typeof name === 'string') {
                const lower = name.toLowerCase();
                if (lower === 'controlslist' || lower === 'disableremoteplayback' || lower === 'disablepictureinpicture') return;
            }
            return rawSetAttr.call(this, name, value);
        };
    } catch (e) { /* ignore */ }

    // 立即扫描并持续监听 DOM
    const startObserve = () => {
        scan(document);
        try {
            new MutationObserver(muts => {
                for (const m of muts) {
                    for (const n of m.addedNodes) {
                        if (n.nodeType === 1) scan(n);
                    }
                    if (m.type === 'attributes' && m.target && m.target.tagName === 'VIDEO') scan(m.target);
                }
            }).observe(document.documentElement || document, { childList: true, subtree: true });
        } catch (e) { /* ignore */ }
    };
    if (document.documentElement) startObserve();
    else document.addEventListener('DOMContentLoaded', startObserve, { once: true });
})();

// ===== 反失焦暂停（早期注入）=====
// 部分网站监听 visibilitychange / blur / pagehide 等事件，在页面失焦
// （鼠标移出窗口、切到其他标签/应用）时强制暂停视频。此保护层：
// 1. 伪装 document.hidden=false、visibilityState='visible'，让站点以为页面始终可见
// 2. 拦截 visibilitychange / webkitvisibilitychange / blur / pagehide / freeze 事件监听，
//    不把这些事件派发给站点脚本（避免其失焦暂停回调被触发）
// 默认开启，可通过油猴菜单针对个别网站关闭。
(function () {
    'use strict';
    if (typeof window === 'undefined' || window.__html5VideoAntiPauseProtected) return;
    window.__html5VideoAntiPauseProtected = true;

    const STORE_KEY = 'gm_h5_antiPauseDisabled';
    let disabled = false;
    try {
        disabled = (typeof GM_getValue === 'function') && GM_getValue(STORE_KEY, {})[location.hostname] === true;
    } catch (e) { /* ignore */ }
    if (disabled) return;

    // 1) 伪装页面可见性状态
    const forceVisible = (obj, prop, value) => {
        try {
            Object.defineProperty(obj, prop, { configurable: true, get: () => value });
        } catch (e) { /* ignore */ }
    };
    forceVisible(Document.prototype, 'hidden', false);
    forceVisible(Document.prototype, 'webkitHidden', false);
    forceVisible(Document.prototype, 'visibilityState', 'visible');
    forceVisible(Document.prototype, 'webkitVisibilityState', 'visible');
    // 有些实现属性挂在实例上，覆盖到 document 自身
    forceVisible(document, 'hidden', false);
    forceVisible(document, 'visibilityState', 'visible');

    // 2) 拦截失焦类事件的监听注册，阻断站点的失焦暂停回调
    const BLOCKED = new Set(['visibilitychange', 'webkitvisibilitychange', 'mozvisibilitychange', 'msvisibilitychange', 'blur', 'pagehide', 'freeze']);
    // window 上的 blur 需拦截；但 video/元素自身的 blur 是无害的 UI 焦点事件，故仅拦 document/window。
    const shouldBlock = (target, type) => {
        const t = typeof type === 'string' ? type.toLowerCase() : '';
        if (!BLOCKED.has(t)) return false;
        // 仅拦截挂在 document / window 上的（站点通常在此监听失焦）
        return target === document || target === window;
    };
    try {
        const rawAdd = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, opts) {
            if (shouldBlock(this, type)) return; // 吞掉注册
            return rawAdd.call(this, type, listener, opts);
        };
    } catch (e) { /* ignore */ }

    // 3) 拦截 onvisibilitychange / onblur / onpagehide 属性赋值
    ['onvisibilitychange', 'onwebkitvisibilitychange', 'onblur', 'onpagehide', 'onfreeze'].forEach(prop => {
        try {
            Object.defineProperty(document, prop, { configurable: true, get: () => null, set: () => {} });
        } catch (e) { /* ignore */ }
        try {
            Object.defineProperty(window, prop, { configurable: true, get: () => null, set: () => {} });
        } catch (e) { /* ignore */ }
    });

    // 4) 提供菜单开关：针对当前站点关闭本保护（刷新后生效）
    try {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('❌ 本站关闭"反失焦暂停"（刷新生效）', () => {
                try {
                    const map = GM_getValue(STORE_KEY, {});
                    map[location.hostname] = true;
                    GM_setValue(STORE_KEY, map);
                    location.reload();
                } catch (e) { /* ignore */ }
            });
        }
    } catch (e) { /* ignore */ }
})();

// ===== Trusted Types 辅助函数 =====
// 注意：保护层已在早期 IIFE 中添加，这里只提供辅助函数
let trustedTypesPolicy = null;
let trustedTypesEnabled = false;

// 检测是否启用了 Trusted Types（用于辅助函数判断）
if (typeof window !== 'undefined' && window.trustedTypes) {
    trustedTypesEnabled = true;
    // 尝试获取已创建的策略（如果早期 IIFE 成功创建了策略）
    try {
        if (window.trustedTypes.createPolicy) {
            trustedTypesPolicy = window.trustedTypes.createPolicy('html5VideoPlayerPolicy', {
                createHTML: (input) => String(input)
            });
        }
    } catch (e) {
        // 策略可能已在早期创建，或网站不允许创建，忽略错误
    }
}

// 安全的设置 HTML 内容的辅助函数
// 注意：优先使用 createElement 和 textContent，避免使用 innerHTML
const safeSetHTML = (element, htmlString) => {
    // 如果只是纯文本，直接使用 textContent（更安全）
    if (!htmlString || htmlString.indexOf('<') === -1) {
        element.textContent = htmlString || '';
        return;
    }

    try {
        if (trustedTypesPolicy) {
            element.innerHTML = trustedTypesPolicy.createHTML(htmlString);
        } else if (trustedTypesEnabled) {
            // Trusted Types 已启用但无法创建策略，使用降级方案
            element.textContent = htmlString.replace(/<[^>]*>/g, '');
        } else {
            // 没有 Trusted Types，可以直接使用 innerHTML
            element.innerHTML = htmlString;
        }
    } catch (e) {
        // 如果还是失败，使用 textContent 作为降级方案
        element.textContent = htmlString.replace(/<[^>]*>/g, '');
    }
};

// ===== 智能检测：判断页面是否需要启用脚本 =====
const shouldEnableScript = () => {
    const { host, pathname } = location;

    // 排除列表：明确不需要脚本的网站
    const excludePatterns = [
        /^(www\.)?(google|bing|baidu|so|sogou)\./,  // 搜索引擎
        /^(mail|outlook|gmail)\./,                   // 邮箱
        /^(github|gitlab|bitbucket)\./,              // 代码托管
        /^(docs|drive|dropbox|onedrive)\./,          // 文档/云盘（排除视频云盘）
        /^(amazon|ebay|taobao|jd|tmall)\./,          // 电商
        /^localhost$/,                                // 本地开发
    ];

    // 如果在排除列表中，不启用
    if (excludePatterns.some(pattern => pattern.test(host))) {
        return false;
    }

    // 检测已知视频网站（快速路径）
    const knownVideoSites = [
        'youtube', 'bilibili', 'youku', 'iqiyi', 'qq.com', 'douyin',
        'tencent', 'acfun', 'mgtv', 'ixigua', 'toutiao',
        'douyu', 'huya', 'twitch', 'ted.com',
        'weibo', 'sina', 'sohu', 'ifeng',
        'miguvideo', 'pptv', 'longzhu', 'zhanqi'
    ];

    if (knownVideoSites.some(site => host.includes(site))) {
        return true;
    }

    // 通过 URL 路径判断（包含常见的视频相关关键词）
    const videoKeywords = [
        '/video', '/play', '/watch', '/live', '/mv',
        '/player', '/v/', '/movie', '/film', '/show'
    ];

    if (videoKeywords.some(keyword => pathname.includes(keyword))) {
        return true;
    }

    // 检查页面中是否有 video 标签（延迟检测）
    return new Promise((resolve) => {
        const checkVideo = () => {
            const videos = document.getElementsByTagName('video');
            if (videos.length > 0) {
                console.log(`[HTML5视频工具] 检测到 ${videos.length} 个视频元素，启用脚本`);
                resolve(true);
                return true;
            }
            return false;
        };

        // 立即检查一次
        if (checkVideo()) return;

        // 如果立即没找到，观察 DOM 变化
        let checkCount = 0;
        const maxChecks = 20; // 最多检查 20 次（约 10 秒）

        const observer = new MutationObserver(() => {
            checkCount++;
            if (checkVideo() || checkCount >= maxChecks) {
                observer.disconnect();
                if (checkCount >= maxChecks) {
                    console.log('[HTML5视频工具] 未检测到视频元素，不启用脚本');
                    resolve(false);
                }
            }
        });

        // 开始观察
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            // 如果 body 还没准备好，等待 DOMContentLoaded
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }

        // 10 秒后超时
        setTimeout(() => {
            observer.disconnect();
            resolve(false);
        }, 10000);
    });
};

const curLang = navigator.language.slice(0, 2);
//感谢 Dario Costa 提供的英语和意大利语翻译
const i18n = {
    'zh': {
        'console': '%c脚本[%s] 反馈：%s\n%s',
        'cacheStoringError': '直接媒体类型（如MP4格式）缓存无效果！',
        'cacheStoringConfirm': '缓冲模式二选一，确认则全部缓冲，取消则按默认缓冲区大小进行缓冲。视频缓存的有效性检测，再看已观看视频片段不产生网络流量则可缓存。缓冲时再按M键则取消缓冲！',
        'cantOpenPIP': '无法进入画中画模式!错误:\n',
        'cantExitPIP': '无法退出画中画模式!错误：\n',
        'rememberRateMenuOption': '记忆播放速度',
        'speedRate': '播放速度 ',
        'ready': '准备就绪！ 待命中.',
        'mainPageOnly': '只处理主页面',
        'download': '下载: ',
        'videoLag': '视频卡顿',
        'fullScreen': '全屏',
        'helpMenuOption': '脚本功能快捷键表',
        'helpBody': `双击(控制栏)：切换（网页）全屏         鼠标中键：快进5秒
P：视频截图    i：切换画中画   M：(停止)缓存视频
chrome类浏览器加启动参数设置媒体缓存为840MB： --media-cache-size=880008000

← →方向键：快退、快进5秒;   方向键 + shift: 20秒
↑ ↓方向键：音量调节   ESC：退出（网页）全屏
空格键：暂停/播放      N：播放下一集
回车键 / F键：切换全屏    回车键 + shift：切换网页全屏
C(抖音、youtube用V键)：加速0.1倍  X(抖音S)：减速0.1倍  Z(抖音A)：切换加速状态
D：上一帧     G：下一帧(youtube.com用E键)

原生进度条已强制开启，所有 H5 视频均支持单击/拖动进度条跳转。`
    },
    'en': {
        'console': '%cScript[%s] Feedback：%s\n%s',
        'cacheStoringError': 'Trying to cache direct media types (such as MP4 format) has no effect!',
        'cacheStoringConfirm': 'Do you want all segments of the video to be cached? The detection method used is as follows: when the page is refreshed, the watched video clips will be cached so that no additional network traffic is generated. If you want all segments of the videos to be cached, select OK; or select Cancel to buffer a portion of the video based on the default buffer size (which is the default browser behavior). When buffering, press M key again to cancel buffering.',
        'cantOpenPIP': 'Unable to access picture-in-picture mode! Error：\n',
        'cantExitPIP': 'Unable to exit picture-in-picture mode! Error：\n',
        'rememberRateMenuOption': 'Remember video playback speed',
        'speedRate': 'Speed rate ',
        'ready': ' ready！ Waiting for you commands.',
        'mainPageOnly': 'Process the main page only',
        'download': 'Download: ',
        'videoLag': 'Video lag',
        'fullScreen': 'Full screen',
        'helpMenuOption': 'Hotkeys list:',
        'helpBody': `Double-click: activate full screen.
Middle mouse button: fast forward 5 seconds

P key： Take a screenshot
I key： Enter/Exit picture-in-picture mode
M key： Enable/disable caching of video
Chrome browsers add startup parameters to set the media cache to 840MB： --media-cache-size=880008000

Arrow keys ← and →： Fast forward or rewind by 5 seconds
Shift + Arrow keys ← and →： Fast forward or rewind 20 seconds
Arrow keys ↑ and ↓： Raise or lower the volume

ESC： Exit full screen (or exit video enlarged to window size)
Spacebar： Stop/Play
Enter / F key： Toggle full screen
Shift + Enter: Set/unset video enlarged to window size

N key： Play the next video (if any)
C key(YouTube:V key)： Speed up video playback by 0.1
X key: Slow down video playback by 0.1
Z key, Set video playback speed: 1.0 ←→ X
D key: Previous frame
G key: Next frame (except on YouTube)
E key: Next frame (YouTube only)

Native controls are forced on for all H5 videos so the timeline can be clicked or dragged to seek.`
    }
};
const MSG = i18n[curLang] || i18n.en;

const w = unsafeWindow || window;
const { host, pathname: path } = location;
const d = document, find = [].find;
let $msg, v, _fp, _fs, by; // document.body
const observeOpt = { childList: true, subtree: true };
const noopFn = function () { };
const validEl = e => e && e.offsetWidth > 1;
const q = (css, p = d) => p.querySelector(css);
const r1 = (regp, s) => regp.test(s) && RegExp.$1;
const log = console.log.bind(
    console,
    MSG.console,
    'color:#c3c;font-size:1.2em',
    GM_info.script.name,
    GM_info.script.homepage
);
const gmFuncOfCheckMenu = (title, saveName, defaultVal = true) => {
    const r = GM_getValue(saveName, defaultVal);
    if (r) title = '√  ' + title;
    GM_registerMenuCommand(title, () => {
        GM_setValue(saveName, !r);
        location.reload();
    });
    return r;
};
const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms) });
/* 画中画
<svg viewBox="0 0 22 22"><g fill="#E6E6E6" fill-rule="evenodd"><path d="M17 4a2 2 0 012 2v6h-2V6.8a.8.8 0 00-.8-.8H4.8a.8.8 0 00-.794.7L4 6.8v8.4a.8.8 0 00.7.794l.1.006H11v2H4a2 2 0 01-2-2V6a2 2 0 012-2h13z"></path><rect x="13" y="14" width="8" height="6" rx="1"></rect></g></svg>
设置
<svg viewBox="0 0 22 22">
<circle cx="11" cy="11" r="2"></circle>
<path d="M19.164 8.861L17.6 8.6a6.978 6.978 0 00-1.186-2.099l.574-1.533a1 1 0 00-.436-1.217l-1.997-1.153a1.001 1.001 0 00-1.272.23l-1.008 1.225a7.04 7.04 0 00-2.55.001L8.716 2.829a1 1 0 00-1.272-.23L5.447 3.751a1 1 0 00-.436 1.217l.574 1.533A6.997 6.997 0 004.4 8.6l-1.564.261A.999.999 0 002 9.847v2.306c0 .489.353.906.836.986l1.613.269a7 7 0 001.228 2.075l-.558 1.487a1 1 0 00.436 1.217l1.997 1.153c.423.244.961.147 1.272-.23l1.04-1.263a7.089 7.089 0 002.272 0l1.04 1.263a1 1 0 001.272.23l1.997-1.153a1 1 0 00.436-1.217l-.557-1.487c.521-.61.94-1.31 1.228-2.075l1.613-.269a.999.999 0 00.835-.986V9.847a.999.999 0 00-.836-.986zM11 15a4 4 0 110-8 4 4 0 010 8z"></path>
</svg>
next
<svg viewBox="0 0 22 22"><path d="M16 5a1 1 0 00-1 1v4.615a1.431 1.431 0 00-.615-.829L7.21 5.23A1.439 1.439 0 005 6.445v9.11a1.44 1.44 0 002.21 1.215l7.175-4.555a1.436 1.436 0 00.616-.828V16a1 1 0 002 0V6C17 5.448 16.552 5 16 5z"></path></svg>
截图
<svg version="1.1" viewBox="0 0 32 32"><path d="M16 23c-3.309 0-6-2.691-6-6s2.691-6 6-6 6 2.691 6 6-2.691 6-6 6zM16 13c-2.206 0-4 1.794-4 4s1.794 4 4 4c2.206 0 4-1.794 4-4s-1.794-4-4-4zM27 28h-22c-1.654 0-3-1.346-3-3v-16c0-1.654 1.346-3 3-3h3c0.552 0 1 0.448 1 1s-0.448 1-1 1h-3c-0.551 0-1 0.449-1 1v16c0 0.552 0.449 1 1 1h22c0.552 0 1-0.448 1-1v-16c0-0.551-0.448-1-1-1h-11c-0.552 0-1-0.448-1-1s0.448-1 1-1h11c1.654 0 3 1.346 3 3v16c0 1.654-1.346 3-3 3zM24 10.5c0 0.828 0.672 1.5 1.5 1.5s1.5-0.672 1.5-1.5c0-0.828-0.672-1.5-1.5-1.5s-1.5 0.672-1.5 1.5zM15 4c0 0.552-0.448 1-1 1h-4c-0.552 0-1-0.448-1-1v0c0-0.552 0.448-1 1-1h4c0.552 0 1 0.448 1 1v0z"></path></svg>
const cookie = new Proxy(noopFn, {
    apply(target, ctx, args) { //清理cookie
        const keys = document.cookie.match(/[^ =;]+(?=\=)/g);
        if (keys) {
            const val = '=; expires=' + new Date(0).toUTCString() +'; domain=.; path=/';
            for (const k of keys) document.cookie = k + val;
        }
        // return Reflect.apply(target, ctx, args);
    },
    get(target, name) { // 读取cookie
        const r = r1(new RegExp(name +'=([^;]*)'), document.cookie);
        if (r) return decodeURIComponent(r);
    },
    set(target, name, value, receiver) { // 写入cookie
        let s, v, expires,
        oneParam = typeof value == 'string';
        if (oneParam) {
            expires = 6;
            v = value;
        } else {
            v = value.val;
            expires = value.expires || 6;
            delete value.expires;
        }
        s = name + '=' + encodeURIComponent(v);

        if (expires && (typeof expires == 'number' || expires.toUTCString)) {
            let date;
            if (typeof expires == 'number') {
                date = new Date();
                date.setTime(expires * 24 * 3600000 + date.getTime());
            } else {
                date = expires;
            }
            s += '; expires=' + date.toUTCString();
        }
        if (!oneParam) for (const k in value) s += '; ' + k + '=' + value[k];
        document.cookie = s;
        return true;
    },
    deleteProperty(target, name, descriptor) {// 删除cookie
        document.cookie = name + '=; path=/; expires='+ new Date(0).toUTCString();
        return true;
    }
});
const onceEvent = (ctx, eName) => new Promise(resolve => ctx.addEventListener(eName, resolve, {once: true}));
const promisify = (fn) => (...args) => new Promise((resolve, reject) => {
    args.push(resolve);
    fn.apply(this, args);
}); */
const hookAttachShadow = (cb) => {
    try {
        const _attachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function (opt) {
            opt.mode = 'open';
            const shadowRoot = _attachShadow.call(this, opt);
            cb(shadowRoot);
            return shadowRoot;
        };
    } catch (e) {
        console.error('Hack attachShadow error', e);
    }
};
const getStyle = (o, s) => {
    if (o.style[s]) return o.style[s];
    if (getComputedStyle) {
        const x = getComputedStyle(o, '');
        s = s.replace(/([A-Z])/g, '-$1').toLowerCase();
        return x && x.getPropertyValue(s);
    }
};
const doClick = e => {
    if (typeof e === 'string') e = q(e);
    if (e) { e.click ? e.click() : e.dispatchEvent(new MouseEvent('click')) };
};
const clickDualButton = btn => { // 2合1 按钮 Element.previousElementSibling
    !btn.nextElementSibling || getStyle(btn, 'display') !== 'none' ? doClick(btn) : doClick(btn.nextElementSibling);
};
const polling = (cb, condition, stop = true) => {
    const fn = typeof condition === 'string' ? q.bind(null, condition) : condition;
    const t = setInterval(() => {
        if (fn()) {
            stop && clearInterval(t);
            cb();
        }
    }, 300);
    return t;
};
const goNextMV = () => {
    const s = location.pathname;
    const m = s.match(/(\d+)(\D*)$/);
    const d = +m[1] + 1;
    location.assign(s.slice(0, m.index) + d + m[2]);
};
const firefoxVer = r1(/Firefox\/(\d+)/, navigator.userAgent);
const isEdge = / Edge?\//.test(navigator.userAgent);
const fakeUA = ua => Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    writable: false,
    configurable: false,
    enumerable: true
});
const getMainDomain = host => {
    const a = host.split('.');
    let i = a.length - 2;
    if (/^(com?|cc|tv|net|org|gov|edu)$/.test(a[i])) i--;
    return a[i];
};
const inRange = (n, min, max) => Math.max(min, n) == Math.min(n, max);
const adjustRate = n => {
    n += v.playbackRate;
    if (n < 0.1) v.playbackRate = .1;
    else if (n > 16) v.playbackRate = 16;
    else v.playbackRate = +n.toFixed(2);
};
const adjustVolume = n => {
    n += v.volume;
    if (inRange(n, 0, 1)) {
        v.volume = +n.toFixed(2);
        // 1. 通用方案：触发标准事件，通知大多数播放器更新 UI
        v.dispatchEvent(new Event('volumechange'));

        // 2. 特殊适配：针对 DPlayer 等不完全遵循事件驱动更新 UI 的播放器进行补充
        // 这种“渐进增强”的方式既保留了通用性，又解决了特定站点的兼容问题
        const dp = v.closest('.dplayer');
        if (dp) {
            const bar = q('.dplayer-volume-bar-inner', dp);
            if (bar) bar.style.width = (v.volume * 100) + '%';
            const wrap = q('.dplayer-volume-bar-wrap', dp);
            if (wrap) wrap.setAttribute('data-balloon', Math.round(v.volume * 100) + '%');
        }
    }
};
// 获取当前处于原生全屏状态的元素（top layer 只渲染全屏元素子树，
// 挂在 body 上的提示会被全屏元素盖住，因此需要把提示挂到全屏元素内）。
const getFsElement = () => d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || null;
let _tipTimer = null;
const tip = (msg) => {
    if (!msg?.length) return;
    if (!$msg) {
        const tipEl = d.createElement('div');
        tipEl.style.cssText = 'max-width:455px;min-width:333px;background:#EEE;color:#111;padding:2px 8px;top:-40px;left:50%;transform:translate(-50%,0);border-radius:8px;border:1px solid orange;text-align:center;font-size:15px;position:fixed;z-index:2147483647;transition:top .25s ease';
        by.appendChild(tipEl);
        $msg = tipEl;
    }
    // 全屏时把提示挂到全屏元素下，退出全屏则挂回 body，保证任何状态都可见。
    const fsEl = getFsElement();
    const target = (fsEl && fsEl.appendChild) ? fsEl : by;
    if ($msg.parentNode !== target) target.appendChild($msg);
    clearTimeout(_tipTimer);
    $msg.textContent = msg;
    $msg.style.top = '190px';
    _tipTimer = setTimeout(() => { $msg.style.top = '-40px'; }, 2200);
};
const u = getMainDomain(host);
const cfg = {
    isLive: !1,
    disableDBLClick: !1,
    isClickOnVideo: !1,
    multipleV: !1, //多视频页面
    isNumURL: !1 //网址数字分集
};
const bus = new class {
    constructor() { this._et = new EventTarget(); }
    $on(ev, fn) { this._et.addEventListener(ev, e => fn(e.detail)); }
    $once(ev, fn) { this._et.addEventListener(ev, e => fn(e.detail), { once: true }); }
    $off(ev, fn) { this._et.removeEventListener(ev, fn); }
    $emit(ev, data) { this._et.dispatchEvent(new CustomEvent(ev, { detail: data })); }
}();
if (window.onurlchange === void 0) {
    history.pushState = (f => function pushState() {
        const ret = f.apply(this, arguments);
        window.dispatchEvent(new Event('pushstate'));
        window.dispatchEvent(new Event('urlchange'));
        return ret;
    })(history.pushState);

    history.replaceState = (f => function replaceState() {
        const ret = f.apply(this, arguments);
        window.dispatchEvent(new Event('replacestate'));
        window.dispatchEvent(new Event('urlchange'));
        return ret;
    })(history.replaceState);

    window.addEventListener('popstate', () => {
        window.dispatchEvent(new Event('urlchange'))
    });
};

let _fsFillCSSAdded = !1;
class FullScreen {
    constructor(e) {
        // 优先对包裹视频的容器全屏，而非裸 <video>。
        // 因为 <video> 是替换元素、无法渲染子节点，全屏后倍速提示/面板无法叠加显示。
        // 对容器全屏则可让提示进入 top layer 正常展示。
        let target = e;
        if (e instanceof HTMLVideoElement) {
            const p = e.parentElement;
            if (p && p !== d.body && p !== d.documentElement && p.requestFullscreen) {
                target = p;
                if (!_fsFillCSSAdded) {
                    _fsFillCSSAdded = !0;
                    // 容器全屏时让视频填满，避免视频保持原始尺寸
                    GM_addStyle(':fullscreen video,:-webkit-full-screen video{width:100%!important;height:100%!important;max-height:100%!important;object-fit:contain!important;margin:auto!important}');
                }
            }
        }
        let fn = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen || noopFn;
        this.exit = fn.bind(d);
        fn = target.requestFullscreen || target.webkitRequestFullScreen || target.mozRequestFullScreen || target.msRequestFullScreen || noopFn;
        this.enter = fn.bind(target);
    }
    static isFull() {
        return !!(d.fullscreen || d.webkitIsFullScreen || d.mozFullScreen ||
            d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement);
    }
    toggle() {
        FullScreen.isFull() ? this.exit() : this.enter();
    }
}

//万能网页全屏, 参考了：https://github.com/gooyie/ykh5p
class FullPage {
    constructor(container) {
        this._isFull = !1;
        this.container = container || FullPage.getPlayerContainer(v);
        GM_addStyle(
            `.gm-fp-body .gm-fp-zTop {
                position: relative !important;
                z-index: 2147483646 !important;
            }
            .gm-fp-wrapper, .gm-fp-body{ overflow:hidden !important; }
            .gm-fp-wrapper .gm-fp-innerBox {
                width: 100% !important;
                height: 100% !important;
            }
            .gm-fp-wrapper {
                display: block !important;
                position: fixed !important;
                width: 100% !important;
                height: 100% !important;
                padding: 0 !important;
                margin: 0 !important;
                top: 0 !important;
                left: 0 !important;
                background: #000 !important;
                z-index: 2147483646 !important;
            }`
        );
    }
    static getPlayerContainer(video) {
        let e = video, p = e.parentNode;
        const { clientWidth: wid, clientHeight: h } = e;
        do {
            e = p;
            p = e.parentNode;
        } while (p && p !== by && p.clientWidth - wid < 5 && p.clientHeight - h < 5);
        //e 为返回值，在此之后不能变了
        // while (p !== by) p = p.parentNode || p.host;
        return e;
    }
    static isFull(e) {
        return w.innerWidth - e.clientWidth < 5 && w.innerHeight - e.clientHeight < 5;
    }
    toggle() {
        // assert(this.container);
        if (!this.container.contains(v)) this.container = FullPage.getPlayerContainer(v);
        bus.$emit('switchFP', !this._isFull);
        by.classList.toggle('gm-fp-body');
        let e = v;
        while (e != this.container) {
            e.classList.toggle('gm-fp-innerBox');
            e = e.parentNode;
        }
        e.classList.toggle('gm-fp-wrapper');
        e = e.parentNode;
        while (e != by) {
            e.classList.toggle('gm-fp-zTop');
            e = e.parentNode;
        }
        this._isFull = !this._isFull;
    }
}

const cacheMV = {
    check() {
        const buf = v.buffered;
        const i = buf.length - 1;
        this.iEnd = buf.end(i);
        return this.mode ? this.iEnd > v.duration - 55 : buf.start(0) >= this.playPos || this.iEnd > v.duration - 55;
    },
    finish() {
        v.removeEventListener('canplaythrough', this.onChache);
        v.currentTime = this.playPos;
        this.cached = !1;
        setTimeout(_ => v.pause(), 33);
        HTMLMediaElement.prototype.play = this.rawPlay;
    },
    onChache() {
        if (!this.cached) return;
        if (this.check()) this.finish();
        else {
            v.currentTime = this.iEnd;
            v.pause();
        }
    },
    exec() {
        if (cfg.isLive || !v) return;
        this.mode = confirm(MSG.cacheStoringConfirm);
        //开始缓存
        this.cached = true;
        v.pause();
        this.rawPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = () => new Promise(noopFn);
        this.playPos = v.currentTime;
        v.addEventListener('canplaythrough', this.onChache);
        this.check();
        v.currentTime = this.iEnd;
    }
};
cacheMV.onChache = cacheMV.onChache.bind(cacheMV);

// ==================== 系统音频字幕服务控制 ====================
// 新的实现方式：后端服务独立运行，前端只负责启动/停止
const SUBTITLE_CONTROLLER_URL = 'http://localhost:8766';

async function toggleSystemAudioSubtitle() {
    try {
        // 先检查服务状态
        const statusResponse = await fetch(`${SUBTITLE_CONTROLLER_URL}/status`);
        const status = await statusResponse.json();

        if (status.running) {
            // 停止服务
            const stopResponse = await fetch(`${SUBTITLE_CONTROLLER_URL}/stop`, {
                method: 'POST'
            });
            const result = await stopResponse.json();
            if (result.success) {
                tip('字幕服务已停止');
            } else {
                tip('停止服务失败: ' + result.message);
            }
        } else {
            // 启动服务
            const targetLang = videoConfigManager.get('subtitle_targetLang') || 'zh-CN';
            const startResponse = await fetch(`${SUBTITLE_CONTROLLER_URL}/start?target_lang=${targetLang}`, {
                method: 'POST'
            });
            const result = await startResponse.json();
            if (result.success) {
                tip('字幕服务已启动（请查看悬浮窗口）');
            } else {
                tip('启动服务失败: ' + result.message);
            }
        }
    } catch (error) {
        console.error('[字幕] 控制服务连接失败:', error);
        tip('无法连接到字幕控制服务，请确保已启动控制器服务（端口 8766）');
    }
}

const actList = new Map();
actList.set(90, _ => { //按键Z: 切换加速状态
    if (v.playbackRate == 1 || v.playbackRate == 0) {
        v.playbackRate = +localStorage.mvPlayRate || 1.3;
    } else {
        // localStorage.mvPlayRate = v.playbackRate;
        v.playbackRate = 1;
    }
})
    .set(88, adjustRate.bind(null, -0.1)) //按键X
    .set(67, adjustRate.bind(null, 0.1)) //按键C
    .set(40, adjustVolume.bind(null, -0.1)) //↓　降音量
    .set(38, adjustVolume.bind(null, 0.1)) //↑　加音量
    .set(37, _ => { v.currentTime -= 5 }) //按键←
    .set(37 + 1024, _ => { v.currentTime -= 20 }) //按键shift+←
    .set(39, _ => { v.currentTime += 5 }) //按键→
    .set(39 + 1024, _ => { v.currentTime += 20 }) //按键shift+→
    .set(68, _ => { v.currentTime -= 0.03; v.pause() }) //按键D：上一帧
    .set(71, _ => { v.currentTime += 0.03; v.pause() }) //按键G：下一帧
    .set(70, _ => { //按键F：切换全屏
        _fs ? _fs.toggle() : clickDualButton(cfg.btnFS);
    })
    .set(32, _ => { //按键space
        if (cfg.btnPlay) clickDualButton(cfg.btnPlay);
        else v.paused ? v.play() : v.pause();
    })
    .set(13, _ => { //回车键。 全屏
        _fs ? _fs.toggle() : clickDualButton(cfg.btnFS);
    })
    .set(13 + 1024, _ => {//web全屏
        self != top ? top.postMessage({ id: 'gm-h5-toggle-iframeWebFull' }, '*')
            : _fp ? _fp.toggle() : clickDualButton(cfg.btnFP);
    })
    .set(27 + 1024, noopFn) //忽略按键shift + esc
    .set(27, ev => {    //按键esc
        if (FullScreen.isFull()) {
            _fs ? _fs.exit() : clickDualButton(cfg.btnFS);
        } else if (self != top) {
            top.postMessage({ id: 'gm-h5-is-iframeWebFull' }, '*');
        } else if (FullPage.isFull(v)) {
            _fp ? _fp.toggle() : clickDualButton(cfg.btnFP);
        }
    })
    .set(73, _ => { //按键I：画中画模式
        if (!d.pictureInPictureElement) {
            v.requestPictureInPicture().catch(err => {
                alert(MSG.cantOpenPIP + err)
            });
        } else {
            d.exitPictureInPicture().catch(err => {
                alert(MSG.cantExitPIP + err)
            });
        }
    })
    .set(80, _ => { //按键P：截图
        const canvas = d.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
            const dataURL = URL.createObjectURL(blob);
            const link = d.createElement('a');
            link.onclick = ev => { ev.stopPropagation() };
            link.href = dataURL;
            link.download = Date.now().toString(36) + '.png';
            link.style.display = 'none';
            d.body.appendChild(link);
            link.click();
            link.remove();
            await sleep(500);
            URL.revokeObjectURL(dataURL);
        });
    })
    .set(77, _ => {// M 缓存视频
        cacheMV.cached ? cacheMV.finish() : cacheMV.exec();
    })
    .set(78, _ => {// N 下一集
        if (self != top) top.postMessage({ id: 'gm-h5-play-next' }, '*');
        else if (cfg.btnNext) doClick(cfg.btnNext);
        else if (cfg.isNumURL) goNextMV();
    })
    .set(83, _ => {// S 切换字幕服务
        toggleSystemAudioSubtitle();
    });

const app = {
    rawProps: new Map(),
    shellEvent() {
        const fn = ev => {
            if (ev.target.closest('svg,img,button')) return;
            ev.stopPropagation(); // preventDefault
            ev.stopImmediatePropagation();
            this.checkUI();
            actList.get(1037)(); //web全屏
        };
        const e = cfg.isClickOnVideo ? v : cfg.mvShell;
        e.addEventListener('mousedown', ev => {
            if (1 == ev.button) {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation();
                if (!cfg.isLive) {
                    actList.has(39) ? actList.get(39)() : v.currentTime += 5;
                }
            }
        });
        !cfg.disableDBLClick && e.addEventListener('dblclick', fn);
    },
    setShell() {
        const e = this.getDPlayer() || this.getArtplayer() || this.getVjsPlayer() ||
            (cfg.shellCSS && q(cfg.shellCSS)) ||
            (top != self ? by : FullPage.getPlayerContainer(v));
        if (e && cfg.mvShell !== e) {
            cfg.mvShell = e;
            this.shellEvent();
        }
    },
    checkMV() {
        if (this.vList) {
            const e = this.findMV();
            if (e && e != v) {
                v = e;
                cfg.btnPlay = cfg.btnNext = cfg.btnFP = cfg.btnFS = _fs = _fp = null;
                if (!cfg.isLive && videoConfigManager.get('remberRate')) {
                    v.playbackRate = +localStorage.mvPlayRate || 1;
                    v.addEventListener('ratechange', ev => {
                        if (v.playbackRate && v.playbackRate != 1) localStorage.mvPlayRate = v.playbackRate;
                    });
                }
                this.setShell();
            }
        }
        if (!validEl(cfg.mvShell)) {
            cfg.mvShell = null;
            this.setShell();
        }
        this.checkUI();
        return v;
    },
    getArtplayer() {
        const e = v.parentNode;
        if (!v.matches('.art-video') || !e.matches('.art-video-player')) return !1;
        cfg.btnFP = q('.art-control-fullscreenWeb', e);
        cfg.btnFS = q('.art-control-fullscreen', e);
        e.closest('body > *')?.classList.add('gm-dp-zTop');
        return e;
    },
    getDPlayer() {
        if (!v.matches('.dplayer-video')) return !1;
        const e = v.closest('.dplayer');
        if (e) {
            cfg.btnFP = q('.dplayer-full-in-icon > span', e);
            cfg.btnFS = q('.dplayer-full-icon', e);
            e.closest('body > *').classList.add('gm-dp-zTop');
        }
        return e;
    },
    getVjsPlayer() {
        const e = v.closest('.video-js');
        if (e) {
            cfg.btnFS = q('.vjs-control-bar > button.vjs-button:nth-last-of-type(1)');
            cfg.webfullCSS = '.vjs-control-bar > button.vjs-button[title$="全屏"]:nth-last-of-type(2)';
        }
        return e;
    },
    hotKey(e) {
        const t = e.target;
        if (e.ctrlKey || e.metaKey || e.altKey || t.contentEditable == 'true' || // e.isComposing
            /INPUT|TEXTAREA|SELECT/.test(t.nodeName)) return;
        if (e.shiftKey && ![13, 37, 39].includes(e.keyCode)) return;
        if (e.shiftKey && e.keyCode == 27) return;
        if (!this.checkMV()) return;
        if (!e.shiftKey && cfg.mvShell && cfg.mvShell.contains(t) && [32, 37, 39].includes(e.keyCode)) return;
        const key = e.shiftKey ? e.keyCode + 1024 : e.keyCode;
        if (actList.has(key)) {
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            actList.get(key)(e);
            if ([67, 88, 90].includes(e.keyCode)) tip(MSG.speedRate + v.playbackRate);
        }
    },
    checkUI() {
        if (cfg.webfullCSS && !validEl(cfg.btnFP)) cfg.btnFP = q(cfg.webfullCSS);
        if (cfg.btnFP) _fp = null;
        else if (!_fp && self == top) _fp = new FullPage(cfg.mvShell);

        if (cfg.fullCSS && !validEl(cfg.btnFS)) cfg.btnFS = q(cfg.fullCSS);
        if (cfg.btnFS) _fs = null;
        else if (!_fs) _fs = new FullScreen(v);

        if (cfg.nextCSS && (!validEl(cfg.btnNext) || !cfg.btnNext.matches(cfg.nextCSS))) cfg.btnNext = q(cfg.nextCSS);
        if (cfg.playCSS && !validEl(cfg.btnPlay)) cfg.btnPlay = q(cfg.playCSS);
    },
    onGrowVList() {
        if (this.vList.length == this.vCount) return;
        if (this.viewObserver) {
            for (let e of this.vList) {
                if (!this.vSet.has(e)) this.viewObserver.observe(e);
            }
        } else {
            const config = {
                rootMargin: '0px',
                threshold: 0.9
            };
            this.viewObserver = new IntersectionObserver(this.onIntersection.bind(this), config);
            for (let e of this.vList) this.viewObserver.observe(e);
        }
        this.vSet = new Set(this.vList);
        this.vCount = this.vList.length;
    },
    onIntersection(entries) {
        if (this.vList.length < 2) return;
        const entry = find.call(entries, k => k.isIntersecting);
        if (!entry || v == entry.target) return;
        v = entry.target;
        _fs = new FullScreen(v);
        _fp = new FullPage(v);
        bus.$on('switchFP', async (toFull) => {
            // const c = toFull ? this.vSet : this.vList;
            // for (const e of c) this.viewObserver.unobserve(e);
            sleep(200);
            if (!toFull) v.scrollIntoView();
        });
        bus.$emit('switchMV');
    },
    bindEvent() {
        clearInterval(this.timer);
        for (const [i, k] of this.rawProps) Reflect.defineProperty(HTMLVideoElement.prototype, i, k);
        this.rawProps.clear();
        this.rawProps = void 0;
        by = d.body;
        v = v || this.findMV();
        bus.$emit('foundMV');
        const bRate = videoConfigManager.get('remberRate');
        window.addEventListener('urlchange', async (info) => { //TM event: info.url
            await sleep(990);
            this.checkMV();
            if (videoConfigManager.get('remberRate')) v.playbackRate = +localStorage.mvPlayRate || 1;
            bus.$emit('urlchange');
        });
        if (top != self) {
            top.postMessage({ id: 'gm-h5-init-MVframe' }, '*');
            window.addEventListener("message", ev => {
                if (!ev.source || !ev.data || !ev.data.id) return;
                switch (ev.data.id) {
                    case 'gm-h5-toggle-fullScreen':
                        _fs ? _fs.toggle() : clickDualButton(cfg.btnFS);
                        break;
                }
            }, false);
        }
        v.addEventListener('canplay', ev => {
            if (cfg.isLive) for (const k of [37, 1061, 39, 1063, 67, 77, 78, 88, 90]) actList.delete(k);
            else {
                if (videoConfigManager.get('remberRate')) v.playbackRate = +localStorage.mvPlayRate || 1;
                v.addEventListener('ratechange', ev => {
                    if (videoConfigManager.get('remberRate') && v.playbackRate && v.playbackRate != 1) localStorage.mvPlayRate = v.playbackRate;
                });
            }

            this.checkMV();
            bus.$emit('canplay');
        }, { once: true });
        // $(by).keydown(this.hotKey.bind(this));
        window.addEventListener('keydown', this.hotKey.bind(this), true);

        cfg.mvShell ? this.shellEvent() : this.setShell();
        this.checkUI();
        if (cfg.multipleV) {
            new MutationObserver(this.onGrowVList.bind(this)).observe(by, observeOpt);
            this.vCount = 0;
            this.onGrowVList();
        }
        // tip((GM_info.script.name_i18n?.[curLang] || GM_info.script.name) + MSG.ready);
    },
    init() {
        const rawAel = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (...args) {
            const inMV = this instanceof HTMLMediaElement;
            const block = inMV && (args[0] == 'dblclick' && !args[1].toString().includes('actList.get(1037)'))
                || (args[0] == 'ratechange' && 'baidu' == u && !args[1].toString().includes('localStorage.mvPlayRate'));
            if (!block) return rawAel.apply(this, args);
        };
        for (const i of this.rawProps.keys()) this.rawProps.set(i,
            Reflect.getOwnPropertyDescriptor(HTMLMediaElement.prototype, i));
        // 支持视频和音频元素
        this.vList = d.getElementsByTagName('video');
        this.aList = d.getElementsByTagName('audio');
        const fn = e => cfg.cssMV ? e.matches(cfg.cssMV) : e.offsetWidth > 9;
        const fnAudio = e => e.offsetWidth > 1; // 音频元素检测
        this.findMV = find.bind(this.vList, fn);
        this.findAudio = find.bind(this.aList, fnAudio);
        this.timer = polling(e => {
            v = e;
            this.bindEvent();
        }, () => this.findMV() || this.findAudio());

        hookAttachShadow(async shadowRoot => {
            bus.$emit('addShadowRoot', shadowRoot);
            await sleep(600);
            if (v) return;
            if (v = q('video', shadowRoot)) { // v.getRootNode() == shadowRoot
                log('Found MV in ShadowRoot\n', v, shadowRoot);
                if (!cfg.shellCSS) cfg.mvShell = shadowRoot.host;
                this.bindEvent();

                this.vList = shadowRoot.getElementsByTagName('video');
                this.findMV = find.bind(this.vList, fn);
            }
        });
    }
};

const router = {
    ted() {
        cfg.fullCSS = 'button[title=Fullscreen]';
    },
    youtube() {
        GM_addStyle(
            `.gm-fp-body #player-container-inner{padding-top:0!important}
            .gm-fp-body #player-container-outer{
                max-width:100%!important;
                margin:0!important;
            }`
        );
        cfg.shellCSS = '#player';
        cfg.playCSS = 'button.ytp-play-button';
        cfg.nextCSS = 'a.ytp-next-button';
        cfg.fullCSS = 'button.ytp-fullscreen-button';
        cfg.isClickOnVideo = true;

        // YouTube 特定快捷键映射
        actList.delete(32); // 删除空格键（YouTube 自己处理）
        actList.delete(70); // 删除 F 键全屏（YouTube 自身已有 F 键全屏）

        // 将下一帧（G 键）迁移到 E 键，避免与 YouTube 内置冲突
        const nextFrameAction = actList.get(71);
        if (nextFrameAction) {
            actList.set(69, nextFrameAction).delete(71); // G键(71) >> E键(69)
        }

        // 将 C 键功能移到 V 键（加速）
        const speedUpAction = actList.get(67);
        if (speedUpAction) {
            actList.set(86, speedUpAction).delete(67); // C键(67) >> V键(86)
        }

        console.log('YouTube 快捷键已配置: V=加速, X=减速, Z=切换速度, E=下一帧');
    },
    douyin() {
        cfg.isLive = host.startsWith('live.');
        cfg.fullCSS = '.xgplayer-fullscreen';
        // cfg.webfullCSS = cfg.isLive ? '.xgplayer-fullscreen + xg-icon' : '.xgplayer-page-full-screen';
        if (!cfg.isLive) {
            GM_addStyle('.xgplayer-progress-cache{background-color:green!important}');
            actList.set(65, actList.get(90)).delete(90); //Z键 >> A键
            actList.set(83, actList.get(88)).delete(88); //X键 >> S键
            actList.set(86, actList.get(67)).delete(67); //C键 >> V键
        }
    },
    qq() {
        if (self != top && (host == 'v.qq.com' || host == 'video.qq.com')) throw MSG.mainPageOnly;
        actList.delete(32);
        cfg.shellCSS = '#player';
        cfg.nextCSS = '.txp_btn_next_u';
        cfg.webfullCSS = '.txp_btn_fake';
        cfg.fullCSS = '.txp_btn_fullscreen';
        // w.__PLAYER__ || w.PLAYER
        app.rawProps.set('playbackRate', 1);
        for (let i = 37; i <= 40; i++) actList.delete(i); //已有方向键
    },
    youku() {
        actList.delete(37);
        actList.delete(39);
        if (host.startsWith('vku.')) {
            bus.$on('canplay', () => {
                cfg.isLive = !q('.spv_progress');
            });
            cfg.fullCSS = '.live_icon_full';
        } else {
            bus.$on('foundMV', () => { document.removeEventListener('keyup', null) });
            cfg.shellCSS = '#ykPlayer';
            cfg.webfullCSS = '.kui-webfullscreen-icon-0';
            cfg.fullCSS = '.kui-fullscreen-icon-0';
            cfg.nextCSS = '.kui-next-icon-0';
        }
    },
    bilibili() {
        cfg.isLive = host.startsWith('live.');
        if (cfg.isLive) return;
        actList.delete(32);

        bus.$on('addShadowRoot', r => {
            if (r.host.nodeName === 'BWP-VIDEO') {
                app.vList = d.getElementsByTagName('bwp-video');
                app.findMV = find.bind(app.vList, e => e.offsetWidth > 9);
                v = r.host;
                app.bindEvent();
            }
        });
        cfg.shellCSS = '#bilibili-player';
        cfg.nextCSS = '.bpx-player-ctrl-next';
        cfg.webfullCSS = '.bpx-player-ctrl-web';
        cfg.fullCSS = '.bpx-player-ctrl-full';
        /*
        const seek = function(step) {
            const p = this.player;
            p.seek(p.getCurrentTime()+ step, p.getState() === "PAUSED");
        };
        actList.set(38, _ => w.player.volume(w.player.volume()+0.1)) //加音量
        .set(40, _ => w.player.volume(w.player.volume()-0.1))
        .set(37, seek.bind(w, -5))
        .set(37+1024, seek.bind(w, -20)) //shift+left  快退20秒
        .set(39, seek.bind(w, 5))
        .set(39+1024, seek.bind(w, 20)) //shift+→  快进20秒
        .set(70, seek.bind(w, 0.03)) //按键F：下一帧
        .set(68, seek.bind(w, -0.03)); //按键D：上一帧
        */
    },
    iqiyi() {
        cfg.fullCSS = '.iqp-btn-fullscreen:not(.fake__click)';
        cfg.nextCSS = '.iqp-btn-next';
    },
    pptv() {
        cfg.fullCSS = '.w-zoom-container > div';
        cfg.webfullCSS = '.w-expand-container > div';
        cfg.nextCSS = '.w-next';
    },
    mgtv() {
        cfg.fullCSS = 'mango-screen';
        cfg.webfullCSS = 'mango-webscreen > a';
        cfg.nextCSS = 'mango-control-playnext-btn';
    },
    ixigua() {
        cfg.fullCSS = 'div[aria-label="全屏"]';
        cfg.nextCSS = '.xgplayer-control-item.control_playnext';
        GM_addStyle('.gm-fp-body .xgplayer{padding-top:0!important} .gm-fp-wrapper #player_default{max-height: 100%!important} h1.title~a, .videoTitle h1~a{ padding-left:12px; color:blue; }');
    },
    miguvideo() {
        cfg.nextCSS = '.next-btn';
        cfg.fullCSS = '.zoom-btn';
        cfg.shellCSS = '.mod-player';
    },
    baidu() {
        app.rawProps.set('playbackRate', 1);
    },
    weibo() {
        cfg.multipleV = path.startsWith('/u/');
    },
    acfun() {
        cfg.nextCSS = '.btn-next-part .control-btn';
        cfg.webfullCSS = '.fullscreen-web';
        cfg.fullCSS = '.fullscreen-screen';
    },
    ['163']() {
        cfg.multipleV = host.startsWith('news.');
        GM_addStyle('div.video,video{max-height: 100% !important;}');
        return host.split('.').length > 3;
    },
    sohu() {
        cfg.nextCSS = 'li.on[data-vid]+li a';
        cfg.fullCSS = '.x-fullscreen-btn';
        cfg.webfullCSS = '.x-pagefs-btn';
    },
    fun() {
        cfg.nextCSS = '.btn-item.btn-next';
    },
    le() {
        GM_addStyle('.gm-fp-body .le_head{display:none!important}');
        cfg.cssMV = '#video video';
        cfg.shellCSS = '#video';
        cfg.nextCSS = '.hv_ico_next';
        const delHiddenProp = _ => {
            if (!v.offsetWidth) Object.values(v.attributes).reverse().some(k => {
                if (v.getAttribute(k.name) == '') {
                    v.removeAttribute(k.name);
                    return true;
                }
            });
        };
        bus.$on('urlchange', delHiddenProp);
        bus.$once('canplay', delHiddenProp);
    },
    nnyy() {
        GM_registerMenuCommand(MSG.videoLag, () => {
            'use strict';
            v.pause();
            const pos = v.currentTime;
            const buf = v.buffered;
            v.currentTime = buf.end(buf.length - 1) + 1;
            v.addEventListener('progress', ev => {
                v.currentTime = pos;
                v.play();
            }, { once: true });
        });
        cfg.nextCSS = '.playlist .on + li a';
    },
    douban() {
        cfg.nextCSS = 'a.next-series';
    },
    douyu() {
        cfg.isLive = !host.startsWith('v.');
        if (cfg.isLive) {
            cfg.cssMV = '.layout-Player video';
            cfg.shellCSS = '#js-player-video';
            cfg.webfullCSS = '.wfs-2a8e83';
            cfg.fullCSS = '.fs-781153';
            cfg.playCSS = 'div[class|=play]';
            path != '/' && document.addEventListener('DOMContentLoaded', () => {
                q('.u-specialStateInput').checked = true;
            }, { once: true });
        } else bus.$on('addShadowRoot', async function (r) {
            if (r.host.matches('#demandcontroller-bar')) {
                await sleep(600);
                cfg.shellCSS = 'div[fullscreen].video';
                cfg.btnFP = q('.ControllerBar-PageFull', r);
                cfg.btnFS = q('.ControllerBar-WindowFull', r);
            }
        });
    },
    yy() {
        cfg.isLive = !path.startsWith('/x/');
        if (cfg.isLive) {
            cfg.fullCSS = '.yc__fullscreen-btn';
            cfg.webfullCSS = '.yc__cinema-mode-btn';
            cfg.playCSS = '.yc__play-btn';
        }
    },
    huya() {
        if (firefoxVer && firefoxVer < 57) return true;
        cfg.disableDBLClick = !0;
        cfg.webfullCSS = '.player-fullpage-btn';
        cfg.fullCSS = '.player-fullscreen-btn';
        cfg.playCSS = '#player-btn';
        polling(doClick, '.login-tips-close');
        localStorage['sidebar/ads'] = '{}';
        localStorage['sidebar/state'] = 0;
        // localStorage.TT_ROOM_SHIELD_CFG_0_ = '{"10000":1,"20001":1,"20002":1,"20003":1,"30000":1}';
    },
    twitch() {
        cfg.isLive = !path.startsWith('/videos/');
        cfg.fullCSS = 'button[data-a-target=player-fullscreen-button]';
        cfg.webfullCSS = '.player-controls__right-control-group > div:nth-child(4) > button';
        cfg.playCSS = 'button[data-a-target=player-play-pause-button]';
    },
    longzhu() {
        cfg.fullCSS = 'a.ya-screen-btn';
    },
    deno() {
        cfg.webfullCSS = '.i-mdi-fit-to-screen';
        cfg.fullCSS = '.i-ri-fullscreen-fill';
    },
    zhanqi() {
        localStorage.lastPlayer = 'h5';
        cfg.fullCSS = '.video-fullscreen';
    }
};
if (host.startsWith('lemonlive') && !router[u]) router[u] = router.deno;

Reflect.defineProperty(navigator, 'plugins', {
    get() { return { length: 0 } }
});

// ==================== 配置管理器初始化 ====================
const videoConfigManager = new ConfigManager('HTML5视频工具', {
    remberRate: true,
    subtitle_targetLang: 'zh-CN'
}, {
    lang: curLang,
    i18n: {
        'zh': {
            'helpMenuOption': '脚本功能快捷键表',
            'helpBody': `双击(控制栏)：切换（网页）全屏         鼠标中键：快进5秒
P：视频截图    i：切换画中画   M：(停止)缓存视频
S：开启/关闭系统音频实时字幕翻译 🆕
chrome类浏览器加启动参数设置媒体缓存为840MB： --media-cache-size=880008000

← →方向键：快退、快进5秒;   方向键 + shift: 20秒
↑ ↓方向键：音量调节   ESC：退出（网页）全屏
空格键：暂停/播放      N：播放下一集
回车键 / F键：切换全屏    回车键 + shift：切换网页全屏
C(抖音、youtube用V键)：加速0.1倍  X(抖音S)：减速0.1倍  Z(抖音A)：切换加速状态
D：上一帧     G：下一帧(youtube.com用E键)

原生进度条已强制开启，所有 H5 视频均支持单击/拖动进度条跳转。

【系统音频字幕功能使用说明】
1. 启动控制器服务: cd subtitle_backend && python subtitle_controller.py
2. 按 S 键启动/停止字幕服务（会显示悬浮窗口）
3. 在悬浮窗口中可选择目标翻译语言
4. 支持所有视频网站，直接监听系统音频`,
            'rememberRate': '记忆播放速度',
            'subtitleConfig': '字幕翻译配置',
            'restartSubtitle': '重启字幕服务',
            'serverUrl': '后端服务地址',
            'targetLang': '目标翻译语言',
            'autoTranslate': '自动翻译',
            'serverUrlHelp': '(请确保服务已启动)',
            'targetLangHelp': '支持: zh-CN, en, ja, ko, fr, de, es, ru 等',
            'autoTranslateConfirm': '是否自动翻译字幕?',
            'serverUpdated': '服务地址已更新',
            'langUpdated': '目标语言已更新为',
            'autoTranslateEnabled': '已开启自动翻译',
            'autoTranslateDisabled': '已关闭自动翻译',
            'subtitleNotStarted': '字幕服务未启动',
            'clickOkToEnable': '点击"确定"开启，"取消"关闭'
        },
        'en': {
            'helpMenuOption': 'Hotkeys list',
            'helpBody': `Double-click: activate full screen.
Middle mouse button: fast forward 5 seconds

P key： Take a screenshot
I key： Enter/Exit picture-in-picture mode
M key： Enable/disable caching of video
S key： Toggle system audio real-time subtitle translation 🆕
Chrome browsers add startup parameters to set the media cache to 840MB： --media-cache-size=880008000

Arrow keys ← and →： Fast forward or rewind by 5 seconds
Shift + Arrow keys ← and →： Fast forward or rewind 20 seconds
Arrow keys ↑ and ↓： Raise or lower the volume

ESC： Exit full screen (or exit video enlarged to window size)
Spacebar： Stop/Play
Enter / F key： Toggle full screen
Shift + Enter: Set/unset video enlarged to window size

N key： Play the next video (if any)
C key(YouTube:V key)： Speed up video playback by 0.1
X key: Slow down video playback by 0.1
Z key, Set video playback speed: 1.0 ←→ X
D key: Previous frame
G key: Next frame (except on YouTube)
E key: Next frame (YouTube only)

Native controls are forced on for all H5 videos so the timeline can be clicked or dragged to seek.

【System Audio Subtitle Feature】
1. Start controller: cd subtitle_backend && python subtitle_controller.py
2. Press S key to start/stop subtitle service (floating window will appear)
3. Select target language in the floating window
4. Works with all video sites by listening to system audio`,
            'rememberRate': 'Remember playback speed',
            'subtitleConfig': 'Subtitle Translation Config',
            'restartSubtitle': 'Restart Subtitle Service',
            'serverUrl': 'Backend Server URL',
            'targetLang': 'Target Translation Language',
            'autoTranslate': 'Auto Translate',
            'serverUrlHelp': '(Make sure the service is running)',
            'targetLangHelp': 'Supported: zh-CN, en, ja, ko, fr, de, es, ru, etc',
            'autoTranslateConfirm': 'Auto translate subtitles?',
            'serverUpdated': 'Server URL updated',
            'langUpdated': 'Target language updated to',
            'autoTranslateEnabled': 'Auto translate enabled',
            'autoTranslateDisabled': 'Auto translate disabled',
            'subtitleNotStarted': 'Subtitle service not started',
            'clickOkToEnable': 'Click OK to enable, Cancel to disable'
        }
    }
});

// ===== 主入口：智能启动脚本 =====
(async function main() {
    // 先进行快速检测
    const shouldEnable = shouldEnableScript();

    // 如果是 Promise（需要延迟检测），等待结果
    const enabled = shouldEnable instanceof Promise ? await shouldEnable : shouldEnable;

    if (!enabled) {
        console.log('[HTML5视频工具] 当前页面不需要启用脚本');
        return;
    }

    // 使用 ConfigManager 注册菜单命令
    try {
        // 1. 快捷键帮助菜单（使用帮助文档功能）
        videoConfigManager.registerHelpDocument({
            titleKey: 'helpMenuOption',
            contentKey: 'helpBody',
            displayMode: 'dialog',
            icon: '📖'
        });

        // 2. 记忆播放速度菜单（切换型）
        videoConfigManager.createToggleMenu('rememberRate', 'remberRate', true);

        // 3. 字幕翻译配置菜单（仅配置目标语言）
        const subtitleConfigDialog = videoConfigManager.createSimpleDialog([
            {
                key: 'subtitle_targetLang',
                labelKey: 'targetLang',
                type: 'text',
                help: videoConfigManager.t('targetLangHelp')
            }
        ], (updates) => {
            if (updates.subtitle_targetLang) {
                tip(videoConfigManager.t('langUpdated') + ': ' + updates.subtitle_targetLang);
            }
        });

        videoConfigManager.registerMenuCommand('subtitleConfig', subtitleConfigDialog, '⚙️');

    } catch (e) {
        console.warn('[菜单注册] 无法注册菜单命令:', e);
    }

    // 初始化脚本
    console.log('[HTML5视频工具] 脚本已启用，站点:', location.host);
    if (!router[u] || !router[u]()) app.init();
    if (!router[u] && !cfg.isNumURL) cfg.isNumURL = /[_\W]\d+(\/|\.[a-z]{3,8})?$/.test(path);

    // ==================== 倍速控制 UI ====================
    setTimeout(() => {
        if (!by) return;

        let speedPanel, speedSlider, speedValue;
        let isVisible = false, hideTimer = null;

        // 注入样式
        GM_addStyle(`
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
        `);

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
        by.appendChild(speedPanel);

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
            const target = (fsEl && fsEl.appendChild) ? fsEl : by;
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

        // Q键显示/隐藏
        actList.set(81, () => isVisible ? hide() : show());

        // E键加速(仅非Shift)
        const oldE = actList.get(69);
        actList.set(69, ev => {
            if (ev && ev.shiftKey && oldE) return oldE(ev);
            if (!v) return;
            setSpeed(Math.min(4, v.playbackRate + 0.1));
            show();
        });

    }, 1000);

})();