/* globals jQuery, $, Vue */
// ==UserScript==
// @name       HTML5视频播放工具
// @name:en	   HTML5 Video Playing Tools
// @name:it    Strumenti di riproduzione video HTML5
// @description 视频截图；切换画中画；缓存视频；万能网页全屏；实时字幕翻译；添加快捷键：快进、快退、暂停/播放、音量、下一集、切换(网页)全屏、上下帧、播放速度。支持视频站点：油管、TED、优.土、QQ、B站、西瓜视频、爱奇艺、A站、PPTV、芒果TV、咪咕视频、新浪、微博、网易[娱乐、云课堂、新闻]、搜狐、风行、百度云视频等；直播：twitch、斗鱼、YY、虎牙、龙珠、战旗。可增加自定义站点
// @description:en Enable hotkeys for HTML5 playback: video screenshot; enable/disable picture-in-picture; copy cached video; send any video to full screen or browser window size; real-time subtitle translation; fast forward, rewind, pause/play, volume, skip to next video, skip to previous or next frame, set playback speed. Video sites supported: YouTube, TED, Youku, QQ.com, bilibili, ixigua, iQiyi, support mainstream video sites in mainland China; Live broadcasts: Twitch, Douyu.com, YY.com, Huya.com. Custom sites can be added
// @description:it Abilita tasti di scelta rapida per riproduzione HTML5: screenshot del video; abilita/disabilita picture-in-picture; copia il video nella cache; manda qualsiasi video a schermo intero o a dimensione finestra del browser; traduzione dei sottotitoli in tempo reale; avanzamento veloce, riavvolgimento, pausa/riproduzione, imposta velocità di riproduzione. Siti video supportati: YouTube, TED, Supporto dei siti video mainstream nella Cina continentale. È possibile aggiungere siti personalizzati
// @version    2.2.0
// @match    *://*/*
// @exclude  https://user.qzone.qq.com/*
// @exclude  https://www.dj92cc.net/dance/play/id/*
// @run-at     document-start
// @inject-into content
// @require    https://cdn.jsdelivr.net/npm/vue@2.7.16/dist/vue.min.js
// @require    https://cdn.jsdelivr.net/npm/jquery@3.6.4/dist/jquery.min.js
// @grant      GM_addStyle
// @grant      GM_xmlhttpRequest
// @grant      window.onurlchange
// @grant      unsafeWindow
// @grant      GM_registerMenuCommand
// @grant      GM_setValue
// @grant      GM_getValue
// @namespace  https://greasyfork.org/users/7036
// @license    MIT
// @thanks     https://greasyfork.org/users/7036
// @downloadURL https://update.greasyfork.org/scripts/30545/HTML5%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E5%B7%A5%E5%85%B7.user.js
// @updateURL https://update.greasyfork.org/scripts/30545/HTML5%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E5%B7%A5%E5%85%B7.meta.js
// ==/UserScript==

'use strict';

// 为 YouTube 等使用 Trusted Types 的网站创建策略
let trustedTypesPolicy = null;
if (window.trustedTypes && window.trustedTypes.createPolicy) {
    try {
        trustedTypesPolicy = window.trustedTypes.createPolicy('html5VideoPlayerPolicy', {
            createHTML: (input) => input
        });
    } catch (e) {
        console.warn('无法创建 Trusted Types 策略:', e);
    }
}

// 安全的设置 HTML 内容的辅助函数
const safeSetHTML = (element, htmlString) => {
    try {
        if (trustedTypesPolicy) {
            element.innerHTML = trustedTypesPolicy.createHTML(htmlString);
        } else {
            element.innerHTML = htmlString;
        }
    } catch (e) {
        // 如果还是失败，使用 textContent 作为降级方案
        console.warn('设置 HTML 内容失败，使用 textContent:', e);
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
S：开启/关闭实时字幕翻译 🆕
chrome类浏览器加启动参数设置媒体缓存为840MB： --media-cache-size=880008000

← →方向键：快退、快进5秒;   方向键 + shift: 20秒
↑ ↓方向键：音量调节   ESC：退出（网页）全屏
空格键：暂停/播放      N：播放下一集
回车键：切换全屏;      回车键 + shift: 切换网页全屏
C(抖音、youtube用V键)：加速0.1倍  X(抖音S)：减速0.1倍  Z(抖音A)：切换加速状态
D：上一帧     F：下一帧(youtube.com用E键)

【字幕功能使用说明】
1. 启动后端服务: cd subtitle_backend && ./start.sh
2. 按 S 键或点击控制栏字幕按钮开启字幕
3. 在油猴菜单中可配置服务地址和目标语言`
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
S key： Toggle real-time subtitle translation 🆕
Chrome browsers add startup parameters to set the media cache to 840MB： --media-cache-size=880008000

Arrow keys ← and →： Fast forward or rewind by 5 seconds
Shift + Arrow keys ← and →： Fast forward or rewind 20 seconds
Arrow keys ↑ and ↓： Raise or lower the volume

ESC： Exit full screen (or exit video enlarged to window size)
Spacebar： Stop/Play
Enter： Enable/disable full screen video
Shift + Enter: Set/unset video enlarged to window size

N key： Play the next video (if any)
C key(YouTube:V key)： Speed up video playback by 0.1
X key: Slow down video playback by 0.1
Z key, Set video playback speed: 1.0 ←→ X
D key: Previous frame
F key: Next frame (except on YouTube)
E key: Next frame (YouTube only)

【Subtitle Feature】
1. Start backend: cd subtitle_backend && ./start.sh
2. Press S key or click subtitle button to enable
3. Configure in Tampermonkey menu`
    },
    'it': {
        'console': '%cScript[%s] Feedback：%s\n%s',
        'cacheStoringError': 'Cercare di memorizzazione nella cache tipi di media diretti (come ad esempio il formato MP4) non ha alcuna efficacia!',
        'cacheStoringConfirm': 'Vuoi che tutti i segmenti del video siano memorizzati nella cache? Il metodo di rilevamento utilizzato è il seguente: all\'aggiornamento della pagina, i video clip guardati saranno memorizzati nella cache in modo da non generare ulteriore traffico di rete. Se vuoi che tutti i segmenti dei video siano memorizzati nella cache, seleziona OK; seleziona invece Annulla per bufferizzare una parte del video in base alla dimensione predefinita del buffer (come da comportamento predefinito del browser).Durante il buffering, premere nuovamente il tasto M per annullare il buffering.',
        'cantOpenPIP': 'Impossibile accedere alla modalità picture-in-picture! Errore：\n',
        'cantExitPIP': 'Impossibile uscire dalla modalità picture-in-picture! Errore：\n',
        'rememberRateMenuOption': 'Memorizza la velocità di riproduzione dei video',
        'speedRate': 'Velocità di riproduzione ',
        'ready': "Pronto！ In attesa dei comandi dell'utente.",
        'mainPageOnly': 'Elaborazione della sola pagina principale',
        'download': 'Scarica: ',
        'videoLag': 'Ritardo del video',
        'fullScreen': 'Schermo intero',
        'helpMenuOption': 'Elenco dei tasti di scelta rapida',
        'helpBody': `Doppio clic: attiva lo schermo intero
Pulsante centrale del mouse: avanzamento rapido di 5 secondi

Tasto P: Esegui uno screenshot
Tasto I： Attiva modalità picture-in-picture
Tasto M： Attiva/disattiva memorizzazione del video nella cache
Tasto S： Attiva/disattiva traduzione sottotitoli in tempo reale 🆕
I browser Chrome aggiungono parametri di avvio per impostare la cache multimediale a 840MB： --media-cache-size=880008000

Tasti freccia ← e →： Avanza o riavvolgi di 5 secondi
Shift + Tasti freccia ← e →: Avanza o riavvolgi di 20 secondi
Tasti freccia ↑ e ↓： Alza o abbassa il volume
ESC： Esci da schermo intero
Barra spaziatrice: Ferma/Riproduci
Invio： Attiva/disattiva ingrandimento del video a schermo intero
Shift + Invio: Attiva/disattiva ingrandimento del video a dimensione della finestra

Tasto N： Riproduzione del video successivo (se presente)
Tasto C(YouTube: Tasto V): Velocizza riproduzione video di 0,1
Tasto X: Rallenta riproduzione video di 0,1
Tasto Z, Impostare la velocità di riproduzione video: 1,0 ←→ X
Tasto D: Vai al frame precedente
Tasto F: Vai al frame successivo (escluso YouTube)
Tasto E: Vai al frame successivo (solo su YouTube)

【Funzione Sottotitoli】
1. Avvia backend: cd subtitle_backend && ./start.sh
2. Premi S o clicca il pulsante sottotitoli
3. Configura nel menu Tampermonkey`
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
    if (inRange(n, 0, 1)) v.volume = +n.toFixed(2);
};
const tip = (msg) => {
    if (!$msg?.get(0)?.offsetHeight) {
        // 使用 createElement 而不是 innerHTML 来避免 Trusted Types 问题
        const tipEl = d.createElement('div');
        tipEl.style.cssText = 'max-width:455px;min-width:333px;background:#EEE;color:#111;height:22px;top:-30px;left:50%;transform:translate(-50%, 0); border-radius:8px;border:1px solid orange;text-align:center;font-size:15px;position:fixed;z-index:2147483647';
        by.appendChild(tipEl);
        $msg = $(tipEl);
    }
    if (!msg?.length) return;
    const len = msg.length * 15;
    $msg.stop(true, true).text(msg)
        .css({ width: `${len}px` })
        .animate({ top: '190px' })
        .animate({ top: '+=9px' }, 1900)
        .animate({ top: '-30px' });
};

// ==================== 实时字幕翻译功能 ====================
class SubtitleService {
    constructor(video) {
        this.video = video;
        this.isRunning = false;
        this.config = {
            serverUrl: GM_getValue('subtitle_serverUrl', 'http://localhost:8765'),
            targetLanguage: GM_getValue('subtitle_targetLang', 'zh-CN'),
            autoTranslate: GM_getValue('subtitle_autoTranslate', true),
            captureInterval: GM_getValue('subtitle_captureInterval', 5)
        };
        this.audioContext = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.subtitles = [];
        this.currentSubtitle = '';
        this.subtitleElement = null;
        this.subtitleButton = null;
    }

    createSubtitleUI() {
        // 创建字幕显示元素
        const container = d.createElement('div');
        container.style.cssText = `
            position: absolute;
            left: 0;
            right: 0;
            bottom: 80px;
            text-align: center;
            pointer-events: none;
            z-index: 9998;
            font-family: Arial, sans-serif;
        `;

        this.subtitleElement = d.createElement('div');
        this.subtitleElement.style.cssText = `
            display: none;
            margin: 0 auto;
            padding: 8px 16px;
            font-size: 20px;
            color: #FFFFFF;
            background: rgba(0, 0, 0, 0.75);
            border-radius: 4px;
            max-width: 80%;
            word-wrap: break-word;
            line-height: 1.4;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
        `;

        container.appendChild(this.subtitleElement);

        const videoParent = this.video.parentElement;
        if (videoParent) {
            if (!videoParent.style.position || videoParent.style.position === 'static') {
                videoParent.style.position = 'relative';
            }
            videoParent.appendChild(container);
        }

        // 开始更新字幕显示
        this.updateInterval = setInterval(() => {
            const currentTime = this.video.currentTime;
            let foundSubtitle = '';

            for (const sub of this.subtitles) {
                if (currentTime >= sub.start && currentTime <= sub.end) {
                    foundSubtitle = sub.text;
                    break;
                }
            }

            if (foundSubtitle) {
                this.subtitleElement.textContent = foundSubtitle;
                this.subtitleElement.style.display = 'inline-block';
            } else {
                this.subtitleElement.style.display = 'none';
            }
        }, 100);
    }

    async initAudioCapture() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();

            const stream = this.video.captureStream ? this.video.captureStream() : this.video.mozCaptureStream();
            if (!stream) {
                throw new Error('浏览器不支持音频捕获');
            }

            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                await this.processRecordedAudio();
            };

            console.log('[字幕] 音频捕获初始化成功');
            return true;
        } catch (error) {
            console.error('[字幕] 音频捕获失败:', error);
            tip('字幕功能需要浏览器支持音频捕获');
            return false;
        }
    }

    startRecording() {
        if (!this.mediaRecorder) return;

        this.recordedChunks = [];
        this.mediaRecorder.start();

        setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
        }, this.config.captureInterval * 1000);
    }

    async processRecordedAudio() {
        if (this.recordedChunks.length === 0) {
            if (this.isRunning) this.startRecording();
            return;
        }

        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' });
        await this.sendAudioToBackend(audioBlob);

        if (this.isRunning) this.startRecording();
    }

    async sendAudioToBackend(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        if (this.config.autoTranslate) {
            formData.append('translate_to', this.config.targetLanguage);
        }

        try {
            const response = await fetch(`${this.config.serverUrl}/transcribe`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            if (data.success && data.subtitles && data.subtitles.length > 0) {
                this.addSubtitles(data.subtitles);
                console.log(`[字幕] 获取 ${data.subtitles.length} 条字幕`);
            }
        } catch (error) {
            console.error('[字幕] 服务连接失败:', error);
            if (this.isRunning) {
                tip('字幕服务连接失败，请检查后端是否运行');
                this.stop();
            }
        }
    }

    addSubtitles(newSubtitles) {
        const currentTime = this.video.currentTime;
        const adjustedSubtitles = newSubtitles.map(sub => ({
            ...sub,
            start: currentTime + sub.start - this.config.captureInterval,
            end: currentTime + sub.end - this.config.captureInterval
        }));

        this.subtitles.push(...adjustedSubtitles);
        this.subtitles.sort((a, b) => a.start - b.start);

        // 清理过期字幕（保留最近2分钟）
        const minTime = currentTime - 120;
        this.subtitles = this.subtitles.filter(sub => sub.end > minTime);
    }

    async start() {
        if (this.isRunning) return;

        console.log('[字幕] 启动服务...');
        const success = await this.initAudioCapture();
        if (!success) return;

        this.isRunning = true;
        this.createSubtitleUI();
        this.startRecording();

        if (this.subtitleButton) {
            this.subtitleButton.classList.add('subtitle-active');
            this.subtitleButton.title = '关闭字幕 (快捷键 S)';
        }

        tip('字幕识别已开启');
        console.log('[字幕] 服务已启动');
    }

    stop() {
        if (!this.isRunning) return;

        console.log('[字幕] 停止服务...');
        this.isRunning = false;

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.subtitleElement) {
            this.subtitleElement.style.display = 'none';
        }

        if (this.subtitleButton) {
            this.subtitleButton.classList.remove('subtitle-active');
            this.subtitleButton.title = '开启字幕 (快捷键 S)';
        }

        this.subtitles = [];
        tip('字幕识别已关闭');
        console.log('[字幕] 服务已停止');
    }

    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }
}

let subtitleService = null;

const u = getMainDomain(host);
const cfg = {
    isLive: !1,
    disableDBLClick: !1,
    isClickOnVideo: !1,
    multipleV: !1, //多视频页面
    isNumURL: !1 //网址数字分集
};
const bus = new Vue();
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

class FullScreen {
    constructor(e) {
        let fn = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen || noopFn;
        this.exit = fn.bind(d);
        fn = e.requestFullscreen || e.webkitRequestFullScreen || e.mozRequestFullScreen || e.msRequestFullScreen || noopFn;
        this.enter = fn.bind(e);
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
    .set(70, _ => { v.currentTime += 0.03; v.pause() }) //按键F：下一帧
    .set(32, _ => {	//按键space
        if (cfg.btnPlay) clickDualButton(cfg.btnPlay);
        else v.paused ? v.play() : v.pause();
    })
    .set(13, _ => {	//回车键。 全屏
        _fs ? _fs.toggle() : clickDualButton(cfg.btnFS);
    })
    .set(13 + 1024, _ => {//web全屏
        self != top ? top.postMessage({ id: 'gm-h5-toggle-iframeWebFull' }, '*')
            : _fp ? _fp.toggle() : clickDualButton(cfg.btnFP);
    })
    .set(27 + 1024, noopFn)	//忽略按键shift + esc
    .set(27, ev => {	//按键esc
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
    .set(83, _ => {// S 切换字幕
        if (!subtitleService) {
            subtitleService = new SubtitleService(v);
        }
        subtitleService.toggle();
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
                if (!cfg.isLive && GM_getValue('remberRate', true)) {
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

        // 添加字幕按钮
        this.addSubtitleButton();
    },
    addSubtitleButton() {
        // 如果已经添加过按钮，不重复添加
        if (d.querySelector('.gm-subtitle-btn')) return;

        // 尝试找到控制栏
        let controlBar = null;
        const selectors = [
            '.bpx-player-control-bottom-right',  // B站
            '.ytp-right-controls',               // YouTube
            '.xgplayer-controls',                // 西瓜视频/抖音
            '.prism-controlbar',                 // 阿里播放器
            '.dplayer-icons-right',              // DPlayer
            '.vjs-control-bar',                  // Video.js
            '.control-bar-right'                 // 通用
        ];

        for (const selector of selectors) {
            controlBar = q(selector);
            if (controlBar) break;
        }

        if (!controlBar && cfg.mvShell) {
            // 尝试在播放器容器中查找控制栏
            controlBar = cfg.mvShell.querySelector('[class*="control"]');
        }

        if (!controlBar) {
            console.log('[字幕] 未找到控制栏，使用浮动按钮');
            this.addFloatingSubtitleButton();
            return;
        }

        // 创建字幕按钮
        const btn = d.createElement('div');
        btn.className = 'gm-subtitle-btn';
        btn.title = '开启字幕 (快捷键 S)';
        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            cursor: pointer;
            opacity: 0.8;
            transition: opacity 0.2s;
        `;

        // SVG 字幕图标
        btn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
            </svg>
        `;

        btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
        btn.addEventListener('mouseleave', () => btn.style.opacity = '0.8');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!subtitleService) {
                subtitleService = new SubtitleService(v);
            }
            if (subtitleService) {
                subtitleService.subtitleButton = btn;
            }
            subtitleService.toggle();
        });

        // 添加激活状态样式
        GM_addStyle(`
            .gm-subtitle-btn.subtitle-active {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }
            .gm-subtitle-btn.subtitle-active svg {
                fill: #00a1d6 !important;
            }
        `);

        controlBar.insertBefore(btn, controlBar.firstChild);
        console.log('[字幕] 按钮已添加到控制栏');

        // 如果有字幕服务实例，关联按钮
        if (subtitleService) {
            subtitleService.subtitleButton = btn;
        }
    },
    addFloatingSubtitleButton() {
        // 创建浮动字幕按钮
        const btn = d.createElement('div');
        btn.className = 'gm-subtitle-btn gm-floating-btn';
        btn.title = '开启字幕 (快捷键 S)';
        btn.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            width: 48px;
            height: 48px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 9999;
            transition: all 0.3s;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        `;

        btn.innerHTML = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/>
            </svg>
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.background = 'rgba(0, 0, 0, 0.9)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.background = 'rgba(0, 0, 0, 0.7)';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!subtitleService) {
                subtitleService = new SubtitleService(v);
            }
            if (subtitleService) {
                subtitleService.subtitleButton = btn;
            }
            subtitleService.toggle();
        });

        GM_addStyle(`
            .gm-floating-btn.subtitle-active {
                background: rgba(0, 161, 214, 0.9) !important;
            }
        `);

        by.appendChild(btn);
        console.log('[字幕] 浮动按钮已创建');

        if (subtitleService) {
            subtitleService.subtitleButton = btn;
        }
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
        log('bind event\n', v);
        bus.$emit('foundMV');
        const bRate = gmFuncOfCheckMenu(MSG.rememberRateMenuOption, 'remberRate');
        window.addEventListener('urlchange', async (info) => { //TM event: info.url
            await sleep(990);
            this.checkMV();
            if (bRate) v.playbackRate = +localStorage.mvPlayRate || 1;
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
        $(v).one('canplay', ev => {
            cfg.isLive = cfg.isLive || v.duration == Infinity;
            if (cfg.isLive) for (const k of [37, 1061, 39, 1063, 67, 77, 78, 88, 90]) actList.delete(k);
            else {
                if (bRate) v.playbackRate = +localStorage.mvPlayRate || 1;
                v.addEventListener('ratechange', ev => {
                    if (bRate && v.playbackRate && v.playbackRate != 1) localStorage.mvPlayRate = v.playbackRate;
                });
            }

            this.checkMV();
            bus.$emit('canplay');
        });
        $(by).keydown(this.hotKey.bind(this));

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
        this.vList = d.getElementsByTagName('video');
        const fn = e => cfg.cssMV ? e.matches(cfg.cssMV) : e.offsetWidth > 9;
        this.findMV = find.bind(this.vList, fn);
        this.timer = polling(e => {
            v = e;
            this.bindEvent();
        }, this.findMV);

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

        // 将 F 键功能移到 E 键（下一帧）
        const nextFrameAction = actList.get(70);
        if (nextFrameAction) {
            actList.set(69, nextFrameAction).delete(70); // F键(70) >> E键(69)
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
            bus.$on('foundMV', () => { $(document).unbind('keyup') });
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
            $(v).one('progress', ev => {
                v.currentTime = pos;
                v.play();
            });
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
            path != '/' && $(ev => {
                q('.u-specialStateInput').checked = true;
            });
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

    // 注册菜单命令
    try {
        GM_registerMenuCommand(MSG.helpMenuOption, () => {
            console.log(MSG.helpBody);
            tip('快捷键帮助已输出到控制台，请按 F12 查看');
        });

        // 注册字幕配置菜单
        GM_registerMenuCommand('⚙️ 字幕翻译配置', () => {
            const currentServer = GM_getValue('subtitle_serverUrl', 'http://localhost:8765');
            const currentLang = GM_getValue('subtitle_targetLang', 'zh-CN');
            const currentAutoTranslate = GM_getValue('subtitle_autoTranslate', true);

            const newServer = prompt('后端服务地址:\n(请确保服务已启动)', currentServer);
            if (newServer && newServer !== currentServer) {
                GM_setValue('subtitle_serverUrl', newServer);
                tip('服务地址已更新');
            }

            const newLang = prompt('目标翻译语言:\n支持: zh-CN, en, ja, ko, fr, de, es, ru 等', currentLang);
            if (newLang && newLang !== currentLang) {
                GM_setValue('subtitle_targetLang', newLang);
                tip('目标语言已更新为: ' + newLang);
            }

            const autoTranslate = confirm('是否自动翻译字幕?\n(点击"确定"开启，"取消"关闭)');
            if (autoTranslate !== currentAutoTranslate) {
                GM_setValue('subtitle_autoTranslate', autoTranslate);
                tip(autoTranslate ? '已开启自动翻译' : '已关闭自动翻译');
            }

            // 如果字幕服务正在运行，更新配置
            if (subtitleService) {
                subtitleService.config.serverUrl = GM_getValue('subtitle_serverUrl', 'http://localhost:8765');
                subtitleService.config.targetLanguage = GM_getValue('subtitle_targetLang', 'zh-CN');
                subtitleService.config.autoTranslate = GM_getValue('subtitle_autoTranslate', true);
            }
        });

        // 注册字幕服务状态菜单
        GM_registerMenuCommand('🔄 重启字幕服务', () => {
            if (subtitleService) {
                subtitleService.stop();
                setTimeout(() => {
                    subtitleService.start();
                }, 500);
            } else {
                tip('字幕服务未启动');
            }
        });
    } catch (e) {
        console.warn('无法注册菜单命令:', e);
    }

    // 初始化脚本
    console.log('[HTML5视频工具] 脚本已启用，站点:', location.host);
    if (!router[u] || !router[u]()) app.init();
    if (!router[u] && !cfg.isNumURL) cfg.isNumURL = /[_\W]\d+(\/|\.[a-z]{3,8})?$/.test(path);
})();