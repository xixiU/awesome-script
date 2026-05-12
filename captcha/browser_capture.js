// ==UserScript==
// @name        网页通用验证码识别
// @namespace    http://tampermonkey.net/
// @version      4.3.1
// @description  解放眼睛和双手，自动识别并填入数字，字母（支持大小写）,文字验证码。增强版：支持更多验证码类型，智能识别验证码输入框。支持通配符批量排除网站。支持滑块验证码。
// @author       xixiu
// @thanks       哈士奇
// @match        *://*/*
// @exclude      https://www.youtube.com/*
// @license        MIT
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_log
// @grant        GM_getResourceText
// @grant        GM_getResourceURL
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_info
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://unpkg.com/vue@2.6.12/dist/vue.js
// @require      https://unpkg.com/element-ui/lib/index.js
// @resource elementUIcss https://unpkg.com/element-ui/lib/theme-chalk/index.css
// @require      https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/common/config_manager.js

// @run-at document-end
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/captcha/browser_capture.js
// @updateURL    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/captcha/browser_capture.js
// ==/UserScript==

(function () {
    // GM_setValue('tipsConfig',"")

    // 加载Element UI样式
    var elementUIcss = GM_getResourceText("elementUIcss");
    GM_addStyle(elementUIcss);

    // ==================== 配置管理 ====================
    const configManager = new ConfigManager('captchaConfig', {
        routePrefix: 'http://localhost:9876',
        silentMode: false
    });

    // 配置项定义
    const configItems = [
        {
            key: 'routePrefix',
            label: '验证码识别服务地址',
            type: 'text',
            placeholder: 'http://localhost:9876',
            help: '验证码识别服务的API地址，确保服务正在运行',
            validate: (value) => {
                if (!value || value.trim() === '') {
                    return false;
                }
                try {
                    new URL(value);
                    return true;
                } catch {
                    return false;
                }
            },
            transform: (value) => value.trim(),
            showStatus: true
        },
        {
            key: 'silentMode',
            label: '静默模式（识别成功后不显示提示）',
            type: 'checkbox',
            help: '开启后验证码识别成功将静默填充，不弹出提示'
        }
    ];

    // 初始化配置管理
    configManager.init(configItems);

    // 获取当前配置
    const routePrefix = configManager.get('routePrefix');

    function showSuccess(msg) {
        if (configManager.get('silentMode')) return;
        if (typeof Vue !== 'undefined') {
            new Vue().$message({ message: msg, type: 'success', duration: 1500 });
        }
    }

    function getStyle(el) {
        // 获取元素样式
        if (window.getComputedStyle) {
            return window.getComputedStyle(el, null);
        } else {
            return el.currentStyle;
        }
    }

    /**
     * 通用输入框填值函数，兼容 Angular / Vue 3 (Naive UI / Arco Design) / React / Ant Design / 原生表单
     * 通过 nativeInputValueSetter 绕过框架对 value 属性的拦截，并触发完整事件链
     */
    function fillInput(el, value) {
        try {
            // 使用原生 setter，确保 Vue3/React 的响应式系统能感知到值的变化
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(el, value);
        } catch (e) {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Angular 响应式表单需要额外的事件才能触发 ControlValueAccessor
        if (el.hasAttribute('formcontrolname') || (el.className && el.className.includes('ng-'))) {
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            el.dispatchEvent(new Event('focus', { bubbles: true }));
            el.dispatchEvent(new Event('keyup', { bubbles: true }));
            console.log('[验证码助手] 检测到 Angular 表单，已触发完整事件链');
        } else {
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
    }

    function init() {
        //简化各种api和初始化全局变量
        /* eslint-disable no-var */
        var CUR_URL = window.location.href;
        var DOMAIN = CUR_URL.split("//")[1].split("/")[0];
        var SLIDE_STORE_KEY = "husky_" + "slidePath" + location.host;
        var NORMAL_STORE_KEY = "husky_" + "normalPath" + location.host;
        var selector = document.querySelector.bind(document);
        var selectorAll = document.querySelectorAll.bind(document);
        var getItem = localStorage.getItem.bind(localStorage);
        var setItem = localStorage.setItem.bind(localStorage);
        /* eslint-enable no-var */
        // 将变量挂到 window 上供 IIFE 内其他函数访问（保持向后兼容）
        window._captchaHelper = { CUR_URL, DOMAIN, SLIDE_STORE_KEY, NORMAL_STORE_KEY, selector, selectorAll, getItem, setItem };
        // 同时保留全局引用（IIFE 内部使用）
        window.CUR_URL = CUR_URL;
        window.DOMAIN = DOMAIN;
        window.SLIDE_STORE_KEY = SLIDE_STORE_KEY;
        window.NORMAL_STORE_KEY = NORMAL_STORE_KEY;
        window.selector = selector;
        window.selectorAll = selectorAll;
        window.getItem = getItem;
        window.setItem = setItem;
    }

    function getNumber(str) {
        return Number(str.split(".")[0].replace(/[^0-9]/gi, ""));
    }

    function isNumber(value) {
        if (!value && value !== 0) {
            return false;
        }
        value = Number(value);
        return typeof value === "number" && !isNaN(value);
    }

    function getEleTransform(el) {
        const style = window.getComputedStyle(el, null);
        var transform =
            style.getPropertyValue("-webkit-transform") ||
            style.getPropertyValue("-moz-transform") ||
            style.getPropertyValue("-ms-transform") ||
            style.getPropertyValue("-o-transform") ||
            style.getPropertyValue("transform") ||
            "none";

        // 处理 none 或 null 的情况
        if (!transform || transform === "none" || transform === "null") {
            return 0;
        }

        try {
            // 处理 matrix(a, b, c, d, tx, ty) 格式
            // tx 是第 5 个参数（索引 4）
            if (transform.startsWith("matrix(")) {
                const values = transform.match(/matrix\(([^)]+)\)/);
                if (values && values[1]) {
                    const parts = values[1].split(",").map(v => parseFloat(v.trim()));
                    return parts[4] || 0; // translateX
                }
            }

            // 处理 matrix3d(a1, b1, c1, d1, a2, b2, c2, d2, a3, b3, c3, d3, tx, ty, tz, d4) 格式
            // tx 是第 13 个参数（索引 12）
            if (transform.startsWith("matrix3d(")) {
                const values = transform.match(/matrix3d\(([^)]+)\)/);
                if (values && values[1]) {
                    const parts = values[1].split(",").map(v => parseFloat(v.trim()));
                    return parts[12] || 0; // translateX
                }
            }

            // 处理 translate(x, y) 或 translateX(x) 格式
            if (transform.includes("translate")) {
                const translateX = transform.match(/translateX\(([^)]+)\)/);
                if (translateX && translateX[1]) {
                    return parseFloat(translateX[1]);
                }

                const translate = transform.match(/translate\(([^,)]+)/);
                if (translate && translate[1]) {
                    return parseFloat(translate[1]);
                }
            }
        } catch (e) {
            console.warn("[验证码助手] transform 解析失败:", e, transform);
        }

        return 0;
    }

    class Captcha {
        // 识别网页中的验证码
        constructor() {
            this.imgCache = [];
            this.inputTags = [];
            this.recommendPath = {};
            this.checkTimer = null;
            this.listenLoadSuccess = false;

            window.addEventListener("load", async () => {
                this.listenLoadSuccess = true;
                this.init();
                // Vue SPA 异步渲染验证码，load 后多次重试
                [1000, 2000, 3000, 5000].forEach(delay => {
                    setTimeout(() => this.doCheckTask(), delay);
                });
            });
            setTimeout(() => {
                if (!this.listenLoadSuccess) {
                    this.listenLoadSuccess = true;
                    this.init();
                    [1000, 2000, 3000, 5000].forEach(delay => {
                        setTimeout(() => this.doCheckTask(), delay);
                    });
                }
            }, 5000);
        }

        doCheckTask() {
            this.findCaptcha();
            this.checkSlideCaptcha();
        }
        init() {
            if (blackListCheck()) {
                return;
            }
            this.manualLocateCaptcha();
            this.doCheckTask();

            const MutationObserver =
                window.MutationObserver ||
                window.WebKitMutationObserver ||
                window.MozMutationObserver;
            const body = document.body;

            const Observer = new MutationObserver((mutations, instance) => {
                if (blackListCheck()) {
                    return;
                }
                for (let i = 0; i < mutations.length; i++) {
                    const el = mutations[i].target;
                    const tagName = mutations[i].target.tagName.toLowerCase();

                    // 特殊处理：检查是否是图片src属性变化
                    if (tagName === "img" && mutations[i].type === "attributes" && mutations[i].attributeName === "src") {
                        console.log('[验证码助手] 检测到图片src变化，重新识别验证码');
                        this.imgCache = []; // 清空缓存，确保新验证码不被误判为重复
                        window.clearTimeout(this.checkTimer);
                        this.checkTimer = setTimeout(() => {
                            this.checkTimer = null;
                            this.doCheckTask();
                        }, 500); // 延迟500ms，等待图片加载完成
                        continue;
                    }

                    // 特殊处理：el-image 等组件刷新时直接替换 img 元素（childList），而非修改 src 属性
                    if (mutations[i].type === "childList" && mutations[i].addedNodes.length > 0) {
                        let hasNewImg = false;
                        for (const node of mutations[i].addedNodes) {
                            if (node.nodeType === 1 && node.tagName && node.tagName.toLowerCase() === "img") {
                                hasNewImg = true;
                                break;
                            }
                        }
                        if (hasNewImg) {
                            console.log('[验证码助手] 检测到新img元素插入，清空缓存重新识别');
                            this.imgCache = [];
                            window.clearTimeout(this.checkTimer);
                            this.checkTimer = setTimeout(() => {
                                this.checkTimer = null;
                                this.doCheckTask();
                            }, 500);
                            continue;
                        }
                    }

                    let checkList = [];
                    checkList.push(el.getAttribute("id"));
                    checkList.push(el.className);
                    checkList.push(el.getAttribute("alt"));
                    checkList.push(el.getAttribute("src"));
                    checkList.push(el.getAttribute("name"));
                    checkList = checkList.filter((item) => item);

                    for (let x = 0; x < checkList.length; x++) {
                        if (
                            /.*(captcha|验证码|verify|yzm|yanzhengma|滑块|拖动|拼图|yidun|slide|checkcode|authcode|vcode|seccode|captchacode|verifycode|\bcode\b).*/im.test(
                                checkList[x].toString().toLowerCase()
                            ) ||
                            tagName === "img" ||
                            tagName === "iframe"
                        ) {
                            if (!this.checkTimer) {
                                // 首次触发立即执行
                                this.doCheckTask();
                                this.checkTimer = setTimeout(() => {
                                    this.checkTimer = null;
                                }, 600);
                            } else {
                                // SPA 持续变更期间，重置静默计时器，静默结束后再执行一次
                                window.clearTimeout(this.checkTimer);
                                this.checkTimer = setTimeout(() => {
                                    this.checkTimer = null;
                                    this.doCheckTask();
                                }, 600);
                            }
                            return;
                        }
                    }
                }
            });
            Observer.observe(body, {
                childList: true,
                subtree: true,
                attributes: true,
            });
        }
        dataURLtoFile(dataURL, filename = "captcha.jpg") {
            //  base64转图片文件
            var arr = dataURL.split(","),
                mime =
                    (arr[0].match(/:(.*?);/) && arr[0].match(/:(.*?);/)[1]) ||
                    "image/png",
                bstr = atob(arr[1]),
                n = bstr.length,
                u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, { type: mime });
        }
        async getRecommendPath() {
            let requestUrl =
                routePrefix + "/cssPath?href=" +
                location.href.split("?")[0];
            try {
                GM_xmlhttpRequest({
                    method: "get",
                    url: requestUrl,
                    onload: async (res) => {
                        if (res.status === 200 && res.response) {
                            let data = (res.response && JSON.parse(res.response)) || {};
                            const { path, recommendTimes = 0 } = data;
                            if (path && recommendTimes) {
                                let inputSelector = path.split("$$")[0];
                                let imgSelector = path.split("$$")[1];
                                if (
                                    selector(inputSelector) &&
                                    selector(imgSelector) &&
                                    selector(imgSelector).getAttribute("src") &&
                                    selector(inputSelector).getAttribute("type") === "text"
                                ) {
                                    let dataURL = await this.handleImg(selector(imgSelector));
                                    try {
                                        if (!this.hasRequest(dataURL, { record: true })) {
                                            let code = await this.request(
                                                this.dataURLtoFile(dataURL),
                                                this.cssPath(selector(inputSelector)) +
                                                "$$" +
                                                this.cssPath(selector(imgSelector)),
                                                selector(imgSelector).getAttribute("src")
                                            );
                                            if (code) {
                                                let inputElement = selector(inputSelector);
                                                fillInput(inputElement, code);

                                                showSuccess("获取验证码成功");
                                                console.log("正在使用共享验证码功能获取验证码");
                                            } else {
                                                console.error("验证码为空，请检查图片是否正确");
                                            }
                                        }
                                    } catch (error) {
                                        console.log(error);
                                        // if (typeof Vue !== "undefined") {
                                        //     new Vue().$message.error("获取验证码失败");
                                        // }
                                    }
                                }
                            }
                        }
                    },
                    onerror: function (err) {
                        console.log("推荐路径请求失败:" + err);
                    },
                });
            } catch (error) {
                console.log(error);
            }
        }
        getCaptchaFeature(el) {
            // 获取验证码特征
            // 增强版：检查更多属性以提高识别准确率
            let checkList = [];
            checkList.push(el.getAttribute("id"));
            checkList.push(el.className);
            checkList.push(el.getAttribute("alt"));
            checkList.push(el.getAttribute("src"));
            checkList.push(el.getAttribute("name"));
            checkList.push(el.getAttribute("title"));  // 新增：检查 title 属性
            checkList.push(el.getAttribute("placeholder"));  // 新增：检查 placeholder
            checkList.push(el.getAttribute("onclick"));  // 新增：检查 onclick 事件

            return checkList;
        }
        cssPath = (el) => {
            // 获取元素css path
            if (!(el instanceof Element)) return;
            var path = [];
            while (el.nodeType === Node.ELEMENT_NODE) {
                var selector = el.nodeName.toLowerCase();
                if (el.id) {
                    selector += "#" + el.id;
                    path.unshift(selector);
                    break;
                } else {
                    var sib = el,
                        nth = 1;
                    while ((sib = sib.previousElementSibling)) {
                        if (sib.nodeName.toLowerCase() == selector) nth++;
                    }
                    if (nth != 1) selector += ":nth-of-type(" + nth + ")";
                }
                path.unshift(selector);
                el = el.parentNode;
            }
            return path.join(" > ");
        };

        manualLocateCaptcha() {
            let imgs = [];
            let inputTags = [];
            let cssPathStore = {};
            let finish = false;
            this.vue = new Vue();
            this.isIframe = top !== self;
            var onTagClick = (e) => {
                let el = e.target;
                let tagName = el.tagName;
                if (tagName.toLowerCase() === "input") {
                    let type = el.getAttribute("type");
                    if (type && type !== "text") {
                        this.vue.$message.error(
                            "提醒：当前点击输入框type=" + type + ",请选择文本输入框"
                        );
                    } else {
                        cssPathStore.input = this.cssPath(el);
                        this.vue.$message.success("您已成功选择输入框");
                    }
                } else {
                    cssPathStore.img = this.cssPath(el);
                    this.vue.$message.success("您已成功选择验证码图片");
                }
                if (cssPathStore.input && cssPathStore.img) {
                    GM_setValue(NORMAL_STORE_KEY, JSON.stringify(cssPathStore));
                    imgs.forEach((img) => {
                        img && img.removeEventListener("click", onTagClick);
                    }, false);
                    inputTags.forEach((input) => {
                        input.removeEventListener("click", onTagClick);
                    }, false);
                    setTimeout(() => {
                        this.vue.$message.success("选择完毕，赶快试试吧");
                        captchaInstance.doCheckTask();
                    }, 3000);
                    finish = true;
                }
            };
            var onMenuClick = (e) => {
                if (this.isIframe) {
                    alert("当前脚本处于iframe中，暂不支持该操作，快让作者优化吧");
                    return;
                }
                finish = false;
                cssPathStore = {};
                GM_deleteValue(NORMAL_STORE_KEY);
                this.vue.$alert("接下来请点击验证码图片和输入框", "操作提示", {
                    confirmButtonText: "确定",
                    callback: () => {
                        setTimeout(() => {
                            imgs.forEach((img) => {
                                img && img.removeEventListener("click", onTagClick);
                            }, false);
                            inputTags.forEach((input) => {
                                input.removeEventListener("click", onTagClick);
                            }, false);
                            if (!finish) {
                                this.vue.$notify.success({
                                    title: "提示",
                                    message: "已退出手动选择验证码模式。",
                                    offset: 100,
                                });
                            }
                        }, 20000);
                    },
                });

                // alert("请点击验证码和输入框各一次。");
                imgs = [...selectorAll("img")];
                inputTags = [...selectorAll("input")];
                imgs.forEach((img) => {
                    img.addEventListener("click", onTagClick);
                }, false);
                inputTags.forEach((input) => {
                    input.addEventListener("click", onTagClick);
                }, false);
            };
            GM_registerMenuCommand("手动选择验证码和输入框", onMenuClick);
        }
        handleImg(img) {
            return new Promise((resolve, reject) => {
                try {
                    // 图片没设置跨域，可采用图片转canvas转base64的方式
                    let dataURL = null;

                    const action = () => {
                        try {
                            let canvas = document.createElement("canvas");
                            canvas.width = img.naturalWidth;
                            canvas.height = img.naturalHeight;
                            let ctx = canvas.getContext("2d");
                            ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
                            dataURL = canvas.toDataURL("image/png");
                            resolve(dataURL);
                        } catch (error) {
                            // Canvas 被污染，使用 GM_xmlhttpRequest 重新获取图片
                            console.log("[验证码助手] Canvas 跨域错误，使用备用方案获取图片");
                            this.handleCrossOriginImg(img.src, resolve, reject);
                        }
                    };
                    if (!img.src.includes(";base64,")) {
                        if (img.complete && img.naturalWidth > 0) {
                            action();
                        } else {
                            img.onload = function () {
                                action();
                            };
                        }
                    } else {
                        dataURL = img.src;
                        resolve(dataURL);
                    }
                } catch (error) {
                    console.error("[验证码助手] 图片处理错误:" + error);
                    // 尝试使用备用方案
                    this.handleCrossOriginImg(img.src, resolve, reject);
                }
            });
        }

        // 处理跨域图片的备用方案
        handleCrossOriginImg(imgSrc, resolve, reject) {
            if (!imgSrc || imgSrc.includes(";base64,")) {
                reject(new Error("无效的图片源"));
                return;
            }

            console.log("[验证码助手] 使用 GM_xmlhttpRequest 获取跨域图片");

            // 使用 Tampermonkey 的特权 API 获取跨域图片
            GM_xmlhttpRequest({
                method: "GET",
                url: imgSrc,
                responseType: "blob",
                onload: (res) => {
                    if (res.status === 200) {
                        let blob = res.response;
                        let fileReader = new FileReader();
                        fileReader.onloadend = (e) => {
                            let base64 = e.target.result;
                            console.log("[验证码助手] 跨域图片获取成功");
                            resolve(base64);
                        };
                        fileReader.onerror = (e) => {
                            console.error("[验证码助手] FileReader 读取失败:", e);
                            reject(new Error("FileReader 读取失败"));
                        };
                        fileReader.readAsDataURL(blob);
                    } else {
                        console.error("[验证码助手] 图片请求失败，状态码:", res.status);
                        reject(new Error("图片请求失败: " + res.status));
                    }
                },
                onerror: function (err) {
                    console.error("[验证码助手] GM_xmlhttpRequest 请求失败:", err);
                    reject(new Error("网络请求失败"));
                },
                ontimeout: function () {
                    console.error("[验证码助手] 图片请求超时");
                    reject(new Error("请求超时"));
                }
            });
        }
        hasRequest(dataURL, config = {}) {
            let startIndex = config.type === "url" ? 0 : dataURL.length - 100;
            let imgClips = dataURL.slice(startIndex, dataURL.length);
            if (this.imgCache.includes(imgClips)) {
                return true;
            }
            if (config.record) {
                this.imgCache.push(imgClips);
            }
            return false;
        }
        request(file, path, src) {
            try {
                if (!file) {
                    console.error("缺少file参数");
                    return Promise.reject();
                }

                return new Promise((resolve, reject) => {
                    let host = location.href;
                    let href = location.href.split("?")[0].split("#")[0];
                    if (self === top) {
                        host = location.host;
                    }
                    let formData = new FormData();
                    let detail = {
                        // path,
                        // src,
                        // host,
                        href,
                    };
                    formData.append("img", file);
                    formData.append("detail", JSON.stringify(detail));
                    let requestUrl = routePrefix + '/captcha';
                    GM_xmlhttpRequest({
                        method: "post",
                        url: requestUrl,
                        data: formData,
                        onload: function (response) {
                            console.log(response.response);
                            let res = JSON.parse(response.response) || {};

                            // 统一的接口格式：{code: 0, data: {...}, msg: ""}
                            if (res.code === 0 && res.data && res.data.code) {
                                resolve(res.data.code);
                            } else {
                                // 处理错误情况
                                let msg = res.msg || '获取验证码失败';
                                if (response.status === 429) {
                                    let date = new Date().getDate();
                                    let tipsConfig = {
                                        date,
                                        times: 1,
                                    };
                                    let cache =
                                        GM_getValue("tipsConfig") &&
                                        JSON.parse(GM_getValue("tipsConfig"));
                                    if (cache && cache.times > 5) {
                                    } else {
                                        if (!cache) {
                                            GM_setValue("tipsConfig", JSON.stringify(tipsConfig));
                                        } else {
                                            cache.times = cache.times + 1;
                                            GM_setValue("tipsConfig", JSON.stringify(cache));
                                        }
                                        if (typeof Vue !== "undefined") {
                                            new Vue().$message.error(msg);
                                        }
                                    }
                                }
                                console.error("获取验证码失败:", res);
                                reject();
                            }
                        },
                        onerror: function (err) {
                            console.error(err);
                            reject();
                        },
                    });
                });
            } catch (error) {
                console.log(error);
            }
        }
        async findCaptcha() {
            // 先读取用户手动设置的验证码配置
            let cache = GM_getValue(NORMAL_STORE_KEY);
            let captchaPath = cache && JSON.parse(cache);
            if (
                captchaPath &&
                captchaPath.input &&
                captchaPath.img &&
                selector(captchaPath.input) &&
                selector(captchaPath.img)
            ) {
                let dataURL = await this.handleImg(selector(captchaPath.img));
                try {
                    if (!this.hasRequest(dataURL, { record: true })) {
                        let code = await this.request(
                            this.dataURLtoFile(dataURL),
                            this.cssPath(selector(captchaPath.input)) +
                            "$$" +
                            this.cssPath(selector(captchaPath.img)),
                            selector(captchaPath.img).getAttribute("src")
                        );
                        if (code) {
                            let inputElement = selector(captchaPath.input);
                            fillInput(inputElement, code.trim());
                            console.log("正在使用用户自定义验证码位置数据获取验证码");
                            return;
                        } else {
                            console.error("验证码为空，请检查图片是否正确");
                        }
                    }
                } catch (error) {
                    console.log(error);
                }
                return;
            }
            // 自动寻找验证码和输入框
            let captchaMap = [];
            let imgs = [...selectorAll("img")];
            imgs.forEach((img) => {
                let checkList = [
                    ...this.getCaptchaFeature(img),
                    ...this.getCaptchaFeature(img.parentNode),
                ];
                checkList = checkList.filter((item) => item);
                let imgSrc = img.getAttribute("src") || "";
                let isInvalid =
                    ["#", "about:blank"].includes(imgSrc) ||
                    !imgSrc;

                // 排除明显不是验证码的图片
                let excludePatterns = /personalcenter|personal|gzh|qrcode|二维码|app\.png|logo|icon|avatar|header|banner/i;
                if (excludePatterns.test(imgSrc)) {
                    //console.log(`[验证码助手] 排除非验证码图片: ${imgSrc}`);
                    return;
                }

                // 排除按钮图片，但需要更精确的匹配
                if (/button_\d+\.jpg/i.test(imgSrc) && img.getAttribute("id") && /send|status/i.test(img.getAttribute("id"))) {
                    //console.log(`[验证码助手] 排除按钮图片: ${imgSrc}, id: ${img.getAttribute("id")}`);
                    return;  // 排除发送按钮
                }

                // 获取图片实际尺寸（使用 naturalWidth/Height 或 width/height）
                let imgWidth = img.naturalWidth || img.width;
                let imgHeight = img.naturalHeight || img.height;

                // 验证码图片通常宽度大于高度（横向长条形）
                let isValidSize = imgWidth > 10 &&
                    imgWidth < 600 &&
                    imgHeight > 10 &&
                    imgHeight < 300;

                // 优先匹配 src 中包含明确验证码路径的图片
                // 注意：不对 data:image/ 开头的 base64 src 做路径匹配（base64 编码内容会产生误匹配）
                let isCaptchaSrc = !imgSrc.startsWith('data:') &&
                    /createimage|captcha|verify|checkcode|validatecode|randcode|rand_code|vcode|authcode|kaptcha|imagecode|seccode|piccode|yzm|verifycode|picvalidcode/i.test(imgSrc);
                //console.log(`[验证码助手] 图片src: ${imgSrc}, 验证码路径检查: ${isCaptchaSrc}`);

                // Element UI 特殊处理：检查是否在 el-input-group__append 内
                let isElementUICaptcha = img.closest('.el-input-group__append') &&
                    img.closest('.el-input-group') &&
                    imgSrc.startsWith('data:image/');
                //console.log(`[验证码助手] Element UI检查: ${isElementUICaptcha}`);

                // Naive UI 特殊处理：检查是否在 n-input__suffix 内
                let isNaiveUICaptcha = img.closest('.n-input__suffix') &&
                    imgSrc.startsWith('data:image/');
                //console.log(`[验证码助手] Naive UI检查: ${isNaiveUICaptcha}`);

                // 对于明确是验证码路径的图片，放宽尺寸限制（图片可能还在加载中）
                if ((isCaptchaSrc || isElementUICaptcha || isNaiveUICaptcha) && !isInvalid) {
                    // 检查是否已经添加过
                    let alreadyAdded = captchaMap.some(item => item.img === img);
                    if (!alreadyAdded) {
                        // 对于明确是验证码路径的图片，放宽尺寸限制（图片可能还在加载中）
                        // 但排除明显太小的图片（图标、emoji 等通常 < 30px）
                        if (imgWidth === 0 || imgHeight === 0 || (imgWidth >= 30 && imgHeight >= 15)) {
                            console.log(`[验证码助手] 通过 src 检测到验证码图片: ${img.getAttribute("id") || imgSrc.slice(0, 80)}, 尺寸: ${imgWidth}x${imgHeight}`);
                            captchaMap.push({ img: img, input: null });
                            return;  // 已添加，跳过后续检查
                        }
                    }
                }

                //         } else {
                //             console.log(`[验证码助手] 验证码图片尺寸不符合要求: ${imgWidth}x${imgHeight}`);
                //         }
                //     } else {
                //         console.log(`[验证码助手] 验证码图片已经添加过了`);
                //     }
                // } else {
                //     console.log(`[验证码助手] 不是验证码路径: isCaptchaSrc=${isCaptchaSrc}, isElementUICaptcha=${isElementUICaptcha}, isInvalid=${isInvalid}`);
                // }

                // 对于非明确路径的图片，需要更严格的检查
                for (let i = 0; i < checkList.length; i++) {
                    let attrValue = checkList[i].toString().toLowerCase();
                    // 跳过 data: 开头的属性值（base64 编码内容会产生误匹配）
                    if (attrValue.startsWith('data:')) continue;
                    if (
                        /.*(captcha|验证码|verify|yzm|yanzhengma|换一张|security|challenge|kaptcha|seccode|piccode|checkcode|authcode|vcode|captchacode|verifycode|\bcode\b).*/im.test(
                            attrValue
                        ) &&
                        isValidSize &&
                        !isInvalid
                    ) {
                        // 需要宽高比合理，且尺寸足够大（排除图标、emoji）
                        if (imgWidth / imgHeight >= 0.8 && imgWidth >= 40 && imgHeight >= 15) {
                            console.log(`[验证码助手] 通过属性检测到验证码图片: ${img.getAttribute("id") || imgSrc}, 尺寸: ${imgWidth}x${imgHeight}`);
                            captchaMap.push({ img: img, input: null });
                            break;
                        }
                    }
                }
            });
            captchaMap.forEach((item) => {
                let imgEle = item.img;
                let parentNode = imgEle.parentNode;
                let childNode = imgEle; // 跟踪当前层级的子节点（用于 Method 1 的兄弟节点遍历）

                for (let i = 0; i < 5; i++) {
                    // 以当前可能是验证码的图片为基点，向上遍历五层查找可能的Input输入框
                    if (!parentNode) {
                        return;
                    }
                    let inputTags = [...parentNode.querySelectorAll("input")];

                    if (inputTags.length) {
                        // 优先查找在图片之前且最接近的输入框
                        let nearbyInput = null;

                        // 方法0: Element UI 特殊处理
                        let elInputGroup = imgEle.closest('.el-input-group');
                        if (elInputGroup) {
                            let inputInGroup = elInputGroup.querySelector('input[type="text"], input:not([type])');
                            if (inputInGroup) {
                                nearbyInput = inputInGroup;
                                console.log(`[验证码助手] 找到Element UI输入框: ${inputInGroup.getAttribute("id") || inputInGroup.getAttribute("name")}`);
                            }
                        }

                        // 方法0b: Naive UI 特殊处理
                        if (!nearbyInput) {
                            let nInputSuffix = imgEle.closest('.n-input__suffix');
                            if (nInputSuffix) {
                                // 找到最近的 n-input 容器，在其中查找 placeholder 含"验证码"的输入框
                                let nInput = nInputSuffix.closest('.n-input');
                                if (nInput) {
                                    let captchaInput = nInput.querySelector('input[placeholder*="验证码"]');
                                    if (!captchaInput) {
                                        captchaInput = nInput.querySelector('input.n-input__input-el[type="text"]');
                                    }
                                    if (captchaInput) {
                                        nearbyInput = captchaInput;
                                        console.log(`[验证码助手] 找到Naive UI输入框: ${captchaInput.getAttribute("placeholder") || captchaInput.getAttribute("id")}`);
                                    }
                                }
                                // 如果 n-input 内没找到，向上查找 form 中 placeholder 含"验证码"的输入框
                                if (!nearbyInput) {
                                    let form = imgEle.closest('form');
                                    if (form) {
                                        let captchaInput = form.querySelector('input[placeholder*="验证码"]');
                                        if (captchaInput) {
                                            nearbyInput = captchaInput;
                                            console.log(`[验证码助手] 找到Naive UI表单验证码输入框: ${captchaInput.getAttribute("placeholder")}`);
                                        }
                                    }
                                }
                            }
                        }

                        // 方法1: 查找图片的前一个兄弟节点中的输入框
                        if (!nearbyInput && (i === 0 || i === 1)) {
                            // 在前两层（直接父节点和父父节点）查找，从当前层级的子节点开始遍历兄弟
                            let currentNode = childNode;
                            // 向前查找兄弟节点
                            while (currentNode.previousElementSibling) {
                                let prevSibling = currentNode.previousElementSibling;
                                // 如果兄弟节点是 input
                                if (prevSibling.tagName === "INPUT") {
                                    let type = prevSibling.getAttribute("type");
                                    if (!type || type === "text") {
                                        nearbyInput = prevSibling;
                                        break;
                                    }
                                }
                                // 如果兄弟节点内有 input
                                let inputs = prevSibling.querySelectorAll("input");
                                for (let j = inputs.length - 1; j >= 0; j--) {
                                    let type = inputs[j].getAttribute("type");
                                    if (!type || type === "text") {
                                        nearbyInput = inputs[j];
                                        break;
                                    }
                                }
                                if (nearbyInput) break;
                                currentNode = prevSibling;
                            }
                        }

                        // 如果找到了前置输入框，直接使用
                        if (nearbyInput) {
                            item.input = nearbyInput;
                            console.log(`[验证码助手] 找到前置输入框: ${nearbyInput.getAttribute("id") || nearbyInput.getAttribute("name")}`);
                            break;
                        }

                        // 方法2: 查找在图片之前出现的所有输入框，取最后一个（最接近的）
                        let inputBeforeImg = null;
                        for (let input of inputTags) {
                            // 比较 DOM 位置：如果 input 在 img 之前
                            if (input.compareDocumentPosition(imgEle) & Node.DOCUMENT_POSITION_FOLLOWING) {
                                let type = input.getAttribute("type");
                                if ((!type || type === "text") && type !== "password") {
                                    inputBeforeImg = input;  // 取最后一个（最接近的）
                                }
                            }
                        }

                        if (inputBeforeImg) {
                            item.input = inputBeforeImg;
                            console.log(`[验证码助手] 找到图片前的输入框: ${inputBeforeImg.getAttribute("id") || inputBeforeImg.getAttribute("name")}`);
                            break;
                        }

                        // 方法3: 使用原来的逻辑：倒序查找 text 类型的输入框（兜底方案）
                        let input = inputTags.pop();
                        if (input) {
                            let type = input.getAttribute("type");
                            while (type !== "text" && inputTags.length) {
                                if (type === "password") {
                                    break;
                                }
                                input = inputTags.pop();
                                type = input ? input.getAttribute("type") : null;
                            }
                            if (input) {
                                let inputWidth = getStyle(input).width.replace(/[^0-9]/gi, "");
                                if (!type || (type === "text" && inputWidth > 50)) {
                                    item.input = input;
                                    console.log(`[验证码助手] 使用兜底逻辑找到输入框: ${input.getAttribute("id") || input.getAttribute("name")}`);
                                    break;
                                }
                            }
                            if (type === "password") {
                                // 验证码一般在密码框后面，遍历到密码框了就大概率说明没有验证码
                                break;
                            }
                        }
                    }
                    childNode = parentNode;
                    parentNode = parentNode.parentNode;
                }
            });
            // console.log(captchaMap);
            if (!captchaMap.length) {
                const { path, recommendTimes } = this.recommendPath;
                if (path) {
                    let inputSelector = path.split("$$")[0];
                    let imgSelector = path.split("$$")[1];
                    if (selector(inputSelector) && selector(imgSelector)) {
                        let dataURL = await this.handleImg(selector(imgSelector));
                        try {
                            if (!this.hasRequest(dataURL, { record: true })) {
                                selector(inputSelector).value = await this.request(
                                    this.dataURLtoFile(dataURL),
                                    path,
                                    item.img.getAttribute("src")
                                );
                                showSuccess("获取验证码成功");
                            }
                        } catch (error) {
                            console.log(error);
                            // if (typeof Vue !== "undefined") {
                            //     new Vue().$message.error("获取验证码失败");
                            // }
                        }
                    }
                }
            }
            captchaMap = captchaMap.filter((item) => item.input);
            captchaMap.forEach(async (item, index) => {
                let dataURL = await this.handleImg(item.img);
                try {
                    if (!this.hasRequest(dataURL, { record: true })) {
                        let code = await this.request(
                            this.dataURLtoFile(dataURL),
                            this.cssPath(item.input) + "$$" + this.cssPath(item.img),
                            item.img.getAttribute("src")
                        );
                        if (code) {
                            fillInput(item.input, code);

                            showSuccess("获取验证码成功");
                            console.log("正在使用自动寻找验证码功能获取验证码");
                        } else {
                            if (index === captchaMap.length - 1) {
                                // this.getRecommendPath();
                            }
                            console.error("验证码为空，请检查图片是否正确");
                        }
                    }
                } catch (error) {
                    if (index === captchaMap.length - 1) {
                        // this.getRecommendPath();
                    }
                    console.log(error);
                    // if (typeof Vue !== "undefined") {
                    //     new Vue().$message.error("获取验证码失败");
                    // }
                }
            });
        }
        getImgViaBlob(url) {
            return new Promise((resolve, reject) => {
                try {
                    GM_xmlhttpRequest({
                        method: "get",
                        url,
                        responseType: "blob",
                        onload: (res) => {
                            if (res.status === 200) {
                                let blob = res.response;
                                let fileReader = new FileReader();
                                fileReader.onloadend = (e) => {
                                    let base64 = e.target.result;
                                    if (base64.length > 20) {
                                        resolve(base64);
                                    } else {
                                        alert(
                                            "验证码助手：当前网站验证码图片禁止跨域访问，待作者优化。"
                                        );
                                        handleClearMenuClick();
                                        reject("base64图片长度不够");
                                        throw "getImgViaBlob: base64图片长度不够";
                                    }
                                };
                                fileReader.readAsDataURL(blob);
                            } else {
                                console.log("图片转换blob失败");
                                console.log(res);
                                reject();
                            }
                        },
                        onerror: function (err) {
                            console.log("图片请求失败:" + err);
                            reject();
                        },
                    });
                } catch (error) {
                    console.log(error);
                    reject();
                }
            });
        }
        elDisplay(el) {
            if (!el) {
                return false;
            }

            while (el) {
                if (!(el instanceof Element)) {
                    return true;
                }
                if (getStyle(el).display === "none") {
                    return false;
                }
                el = el.parentNode;
            }
            return true;
        }
        checkSlideCaptcha() {
            const check = async () => {
                // 主流滑块验证码自动识别配置
                const autoDetectConfigs = [
                    // 网易易盾
                    {
                        name: '网易易盾',
                        bgImg: '.yidun_bg-img',
                        targetImg: '.yidun_jigsaw',
                        moveItem: '.yidun_slider'
                    },
                    // 京东 JDJRV
                    {
                        name: '京东JDJRV',
                        bgImg: '.JDJRV-bigimg img',
                        targetImg: '.JDJRV-smallimg img',
                        moveItem: '.JDJRV-slide-btn'
                    },
                    // 极验 geetest
                    {
                        name: '极验geetest',
                        bgImg: '.geetest_canvas_bg',
                        targetImg: '.geetest_canvas_slice',
                        moveItem: '.geetest_slider_button'
                    },
                    // 阿里云盾 nc
                    {
                        name: '阿里云盾',
                        bgImg: '#nc_img',
                        targetImg: '#nc_slice',
                        moveItem: '.nc_iconfont.btn_slide'
                    }
                ];

                // 尝试自动识别主流滑块验证码
                let detectedConfig = null;
                for (const config of autoDetectConfigs) {
                    const bgEl = selector(config.bgImg);
                    const targetEl = selector(config.targetImg);
                    const moveEl = selector(config.moveItem);

                    if (bgEl && targetEl && moveEl &&
                        this.elDisplay(bgEl) &&
                        this.elDisplay(targetEl) &&
                        this.elDisplay(moveEl)) {
                        detectedConfig = {
                            bgImg: config.bgImg,
                            targetImg: config.targetImg,
                            moveItem: config.moveItem,
                            name: config.name
                        };
                        console.log(`[验证码助手] 自动检测到${config.name}滑块验证码`);
                        break;
                    }
                }

                // 如果自动识别成功，使用自动识别的配置
                let slideConfig = detectedConfig;

                // 如果自动识别失败，尝试使用用户手动配置
                if (!slideConfig) {
                    const slideCache =
                        (GM_getValue(SLIDE_STORE_KEY) &&
                            JSON.parse(GM_getValue(SLIDE_STORE_KEY))) ||
                        {};
                    const { bgImg, targetImg, moveItem } = slideCache;
                    if (bgImg && targetImg && moveItem) {
                        slideConfig = { bgImg, targetImg, moveItem, name: '用户配置' };
                    }
                }

                // 如果有配置（自动或手动），执行识别
                if (slideConfig) {
                    const { bgImg, targetImg, moveItem } = slideConfig;
                    const bgEl = selector(bgImg);
                    const targetEl = selector(targetImg);
                    const moveEl = selector(moveItem);

                    if (
                        bgEl &&
                        targetEl &&
                        moveEl &&
                        this.elDisplay(bgEl) &&
                        this.elDisplay(targetEl) &&
                        this.elDisplay(moveEl)
                    ) {
                        // 优化图片 URL 获取逻辑，支持多种情况
                        const getImageUrl = (el) => {
                            // 1. 尝试从 src 属性获取
                            let url = el.getAttribute("src");
                            if (url) return url;

                            // 2. 尝试从 background-image 样式获取
                            const bgImage = getStyle(el)["background-image"];
                            if (bgImage && bgImage !== "none") {
                                // 处理 url("...") 或 url('...') 格式
                                const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                                if (match && match[1]) return match[1];
                            }

                            // 3. 尝试从 data-src 属性获取（懒加载）
                            url = el.getAttribute("data-src");
                            if (url) return url;

                            // 4. 尝试从 srcset 属性获取第一个 URL
                            const srcset = el.getAttribute("srcset");
                            if (srcset) {
                                const firstUrl = srcset.split(",")[0].trim().split(" ")[0];
                                if (firstUrl) return firstUrl;
                            }

                            return null;
                        };

                        const target_url = getImageUrl(targetEl);
                        const bg_url = getImageUrl(bgEl);

                        if (!target_url || !bg_url) {
                            console.log('[验证码助手] 无法获取滑块图片URL', {
                                target: target_url,
                                bg: bg_url
                            });
                            return;
                        }

                        if (!this.hasRequest(target_url, { record: true, type: "url" })) {
                            console.log(`[验证码助手] 开始识别滑块验证码 (${slideConfig.name})`);
                            const target_base64 = await this.getImgViaBlob(target_url);
                            const bg_base64 = await this.getImgViaBlob(bg_url);

                            // 重试机制：最多尝试 3 次
                            const maxRetries = 3;
                            let retryCount = 0;

                            const attemptRecognition = () => {
                                return new Promise(async (resolve, reject) => {
                                    let host = location.href;
                                    let href = location.href.split("?")[0].split("#")[0];
                                    if (self === top) {
                                        host = location.host;
                                    }
                                    let detail = {
                                        path: slideConfig,
                                        host,
                                        href,
                                        type: slideConfig.name,
                                        retry: retryCount
                                    };
                                    let formData = new FormData();
                                    let requestUrl = routePrefix + "/slideCaptcha";
                                    let targetWidth = getNumber(getStyle(targetEl).width);
                                    let bgWidth = getNumber(getStyle(bgEl).width);
                                    formData.append("target_img", this.dataURLtoFile(target_base64));
                                    formData.append("bg_img", this.dataURLtoFile(bg_base64));
                                    formData.append("targetWidth", targetWidth);
                                    formData.append("bgWidth", bgWidth);
                                    formData.append("detail", JSON.stringify(detail));

                                    GM_xmlhttpRequest({
                                        method: "post",
                                        url: requestUrl,
                                        data: formData,
                                        onload: (response) => {
                                            try {
                                                const data = JSON.parse(response.response);
                                                // 统一的接口格式：{code: 0, data: {...}, msg: ""}
                                                if (data.code === 0 && data.data && data.data.target) {
                                                    console.log(`[验证码助手] 滑块识别成功，缺口位置: ${data.data.target[0]}`);
                                                    this.moveSideCaptcha(
                                                        targetEl,
                                                        moveEl,
                                                        data.data.target[0]
                                                    );
                                                    resolve();
                                                } else {
                                                    console.error('[验证码助手] 滑块识别失败：', data.msg || '未知错误', data);
                                                    reject(new Error(data.msg || '识别失败'));
                                                }
                                            } catch (e) {
                                                console.error('[验证码助手] 滑块识别失败：', e);
                                                reject(e);
                                            }
                                        },
                                        onerror: function (err) {
                                            console.error('[验证码助手] 滑块识别请求失败：', err);
                                            reject(err);
                                        },
                                    });
                                });
                            };

                            // 执行重试逻辑
                            const executeWithRetry = async () => {
                                while (retryCount < maxRetries) {
                                    try {
                                        await attemptRecognition();
                                        return; // 成功则退出
                                    } catch (error) {
                                        retryCount++;
                                        if (retryCount < maxRetries) {
                                            console.log(`[验证码助手] 第 ${retryCount} 次尝试失败，${2}秒后重试...`);
                                            await new Promise(resolve => setTimeout(resolve, 2000));
                                        } else {
                                            console.error(`[验证码助手] 已达到最大重试次数 (${maxRetries})，放弃识别`);
                                            throw error;
                                        }
                                    }
                                }
                            };

                            return executeWithRetry();
                        }
                    }
                }
            };
            check();
            // const interval = 3000;
            // simulateInterval(check, interval);
        }
        moveSideCaptcha(targetImg, moveItem, gapPosition) {
            // gapPosition 是缺口在背景图中的绝对位置（已经按显示尺寸缩放）
            // 需要计算滑块需要移动的相对距离

            if (gapPosition === 0) {
                console.log("[验证码助手] 缺口位置为0，跳过拖动");
                return;
            }

            var btn = moveItem;
            let target = targetImg;

            // 获取滑块图片的初始位置
            let targetRect = target.getBoundingClientRect();
            let targetInitialX = targetRect.left;

            // 获取背景图的位置
            let bgImg = target.parentElement?.querySelector('img') || target.parentElement;
            let bgRect = bgImg?.getBoundingClientRect();
            let bgInitialX = bgRect ? bgRect.left : 0;

            // 计算滑块需要移动的相对距离
            // 相对距离 = 缺口绝对位置 - 滑块初始相对位置
            let sliderInitialOffset = targetInitialX - bgInitialX;
            let distance = gapPosition - sliderInitialOffset;

            console.log(`[验证码助手] 缺口位置: ${gapPosition}px, 滑块初始偏移: ${sliderInitialOffset}px, 需要移动: ${distance}px`);

            if (distance <= 0) {
                console.log("[验证码助手] 计算的移动距离 <= 0，跳过拖动");
                return;
            }

            let varible = null;
            let targetLeft = Number(getStyle(target).left.replace("px", "")) || 0;
            let targetParentLeft =
                Number(getStyle(target.parentNode).left.replace("px", "")) || 0;
            let targetTransform = Number(getEleTransform(target)) || 0;
            let targetParentTransform =
                Number(getEleTransform(target.parentNode)) || 0;

            var rect = btn.getBoundingClientRect();
            var x = rect.x;
            var y = rect.y;

            // 使用现代的 MouseEvent API 替代已弃用的 createEvent
            var mousedown = new MouseEvent("mousedown", {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                screenX: x,
                screenY: y,
                button: 0
            });
            btn.dispatchEvent(mousedown);

            // 生成更自然的拖动轨迹（模拟人类行为）
            // 使用三段式轨迹：加速 -> 匀速 -> 减速
            const generateTrack = (distance) => {
                const track = [];
                let current = 0;
                let mid = distance * 0.8; // 80% 位置开始减速

                // 加速阶段
                while (current < mid) {
                    let step = Math.random() * 8 + 5; // 5-13px 随机步长
                    if (current + step > mid) {
                        step = mid - current;
                    }
                    current += step;
                    track.push(Math.round(current));
                }

                // 减速阶段
                while (current < distance) {
                    let step = Math.random() * 3 + 1; // 1-4px 随机步长
                    if (current + step > distance) {
                        step = distance - current;
                    }
                    current += step;
                    track.push(Math.round(current));
                }

                return track;
            };

            const track = generateTrack(distance);
            let trackIndex = 0;
            let dx = 0;
            let dy = 0;

            var interval = setInterval(function () {
                if (trackIndex >= track.length) {
                    clearInterval(interval);

                    // 使用现代的 MouseEvent API 替代已弃用的 createEvent
                    var mouseup = new MouseEvent("mouseup", {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: x + dx,
                        clientY: y + dy,
                        screenX: x + dx,
                        screenY: y + dy,
                        button: 0
                    });

                    // 随机延迟释放鼠标（100-300ms）
                    setTimeout(() => {
                        btn.dispatchEvent(mouseup);
                    }, Math.ceil(Math.random() * 200 + 100));
                    return;
                }

                dx = track[trackIndex];
                trackIndex++;

                // 添加随机的垂直抖动（模拟人手不稳）
                let sign = Math.random() > 0.5 ? -1 : 1;
                dy += Math.ceil(Math.random() * 2 * sign);
                dy = Math.max(-5, Math.min(5, dy)); // 限制垂直偏移在 ±5px 内

                var _x = x + dx;
                var _y = y + dy;

                // 使用现代的 MouseEvent API 替代已弃用的 createEvent
                var mousemove = new MouseEvent("mousemove", {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: _x,
                    clientY: _y,
                    screenX: _x,
                    screenY: _y,
                    button: 0
                });
                btn.dispatchEvent(mousemove);

                // 更新位置变量用于检测
                let newTargetLeft =
                    Number(getStyle(target).left.replace("px", "")) || 0;
                let newTargetParentLeft =
                    Number(getStyle(target.parentNode).left.replace("px", "")) || 0;
                let newTargetTransform = Number(getEleTransform(target)) || 0;
                let newTargetParentTransform =
                    Number(getEleTransform(target.parentNode)) || 0;

                if (newTargetLeft !== targetLeft) {
                    varible = newTargetLeft;
                } else if (newTargetParentLeft !== targetParentLeft) {
                    varible = newTargetParentLeft;
                } else if (newTargetTransform !== targetTransform) {
                    varible = newTargetTransform;
                } else if (newTargetParentTransform != targetParentTransform) {
                    varible = newTargetParentTransform;
                }
            }, 10);

            // 超时保护
            setTimeout(() => {
                clearInterval(interval);
            }, 10000);
        }
    }

    function getEleCssPath(el) {
        // 获取元素css path
        if (!(el instanceof Element)) return;
        var path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            var selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += "#" + el.id;
                path.unshift(selector);
                break;
            } else {
                var sib = el,
                    nth = 1;
                while ((sib = sib.previousElementSibling)) {
                    if (sib.nodeName.toLowerCase() == selector) nth++;
                }
                if (nth != 1) selector += ":nth-of-type(" + nth + ")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
    }

    function handleSlideMenuClick({ isPostmessage } = {}) {
        if (top === self) {
            alert("请点击滑动验证码的大图片，小图片，滑块。");
        }
        this.vue = new Vue();
        this.isIframe = top !== self;
        GM_deleteValue(SLIDE_STORE_KEY);

        let imgs = [...selectorAll("img")];
        let divTags = [...selectorAll("div")];
        imgs.forEach((img) => {
            img.addEventListener("click", onSlideTagClick);
        }, false);
        divTags.forEach((input) => {
            input.addEventListener("click", onSlideTagClick);
        }, false);

        setTimeout(() => {
            imgs.forEach((img) => {
                img && img.removeEventListener("click", onSlideTagClick);
            }, false);
            divTags.forEach((input) => {
                input.removeEventListener("click", onSlideTagClick);
            }, false);
        }, 30000);

        if (!isPostmessage) {
            if (self === top) {
                const iframes = [...selectorAll("iframe")];
                iframes.forEach((iframe) => {
                    iframe.contentWindow.postMessage(
                        {
                            sign: "husky",
                            action: "handleSlideMenuClick",
                        },
                        "*"
                    );
                });
            } else {
                window.postMessage(
                    {
                        sign: "husky",
                        action: "handleSlideMenuClick",
                    },
                    "*"
                );
            }
        }
    }

    let noticeTimer = 0;

    function notice(msg) {
        if (noticeTimer) {
            clearTimeout(noticeTimer);
        }
        noticeTimer = setTimeout(() => new Vue().$message.success(msg), 1000);
    }

    var onSlideTagClick = (e) => {
        let el = e.target;
        let tagName = el.tagName.toLowerCase();
        let width = Number(getNumber(getStyle(el).width)) || 0;
        const vue = new Vue();
        let height = Number(getNumber(getStyle(el).height)) || 0;
        let position = getStyle(el).position;
        let pathCache =
            (GM_getValue(SLIDE_STORE_KEY) &&
                JSON.parse(GM_getValue(SLIDE_STORE_KEY))) ||
            {};
        if (tagName === "img") {
            if (width >= height && width > 150) {
                let newValue = { ...pathCache, bgImg: getEleCssPath(el) };
                GM_setValue(SLIDE_STORE_KEY, JSON.stringify(newValue));
                pathCache = newValue;
                notice("您已成功选择大图片");
            } else if (width < 100 && height >= width - 5) {
                let newValue = { ...pathCache, targetImg: getEleCssPath(el) };
                GM_setValue(SLIDE_STORE_KEY, JSON.stringify(newValue));
                pathCache = newValue;
                notice("您已成功选择小图片");
            }
        } else {
            let curEl = el;
            for (let i = 0; i < 3; i++) {
                if (!curEl || curEl === Window) {
                    break;
                }
                position = getStyle(curEl).position;
                let bgUrl = getStyle(curEl)["backgroundImage"];
                width = Number(getNumber(getStyle(curEl).width)) || 0;
                height = Number(getNumber(getStyle(curEl).height)) || 0;

                if (position === "absolute" && width < 100 && height < 100) {
                    let newValue = { ...pathCache, moveItem: getEleCssPath(curEl) };
                    GM_setValue(SLIDE_STORE_KEY, JSON.stringify(newValue));
                    pathCache = newValue;
                    notice("您已成功选择滑块");
                    break;
                }
                let reg = /url\("(.+)"\)/im;

                if (bgUrl && bgUrl.match(reg)) {
                    if (width >= height && width > 150) {
                        let newValue = { ...pathCache, bgImg: getEleCssPath(curEl) };
                        GM_setValue(SLIDE_STORE_KEY, JSON.stringify(newValue));
                        pathCache = newValue;
                        notice("您已成功选择大图片");
                        break;
                    } else if (width < 100 && height >= width - 5) {
                        let newValue = { ...pathCache, targetImg: getEleCssPath(curEl) };
                        GM_setValue(SLIDE_STORE_KEY, JSON.stringify(newValue));
                        pathCache = newValue;
                        notice("您已成功选择小图片");
                        break;
                    }
                }
                curEl = curEl.parentNode;
            }

            curEl = el;
            const firstImg = curEl.querySelector("img");
            firstImg && onSlideTagClick({ target: firstImg });
        }

        const finish = Object.keys(pathCache).filter((item) => item).length == 3;
        if (finish) {
            let imgs = [...selectorAll("img")];
            let divTags = [...selectorAll("div")];
            imgs.forEach((img) => {
                img && img.removeEventListener("click", onSlideTagClick);
            }, false);
            divTags.forEach((div) => {
                div.removeEventListener("click", onSlideTagClick);
            }, false);
            setTimeout(() => {
                vue.$message.success("选择完毕，赶快试试吧");
                captchaInstance.doCheckTask();
            }, 3000);
        }
    };

    GM_registerMenuCommand("手动定位滑动验证码", handleSlideMenuClick);

    function handleClearMenuClick() {
        GM_listValues().forEach((name) => {
            if (name.includes("husky")) {
                GM_deleteValue(name);
            }
        });
    }

    GM_registerMenuCommand("清空所有验证码配置", handleClearMenuClick);

    function cleanCurrentPage() {
        GM_deleteValue(SLIDE_STORE_KEY);
        GM_deleteValue(NORMAL_STORE_KEY);
    }
    GM_registerMenuCommand("清空当前页面验证码配置", cleanCurrentPage);

    let blackListMenuId = null;

    // 通配符匹配函数
    function matchPattern(url, pattern) {
        // 将通配符模式转换为正则表达式
        // * 匹配任意字符（除了 /）
        // ** 匹配任意字符（包括 /）
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
            .replace(/\*\*/g, '___DOUBLE_STAR___') // 临时替换 **
            .replace(/\*/g, '[^/]*') // * 匹配除 / 外的任意字符
            .replace(/___DOUBLE_STAR___/g, '.*'); // ** 匹配任意字符

        const regex = new RegExp('^' + regexPattern + '$');
        return regex.test(url);
    }

    // 检查当前页面是否在黑名单中
    function blackListCheck() {
        let currentUrl = location.host + location.pathname;
        let key = currentUrl + "_black";

        // 检查精确匹配
        let exactMatch = GM_getValue(key) && JSON.parse(GM_getValue(key));

        // 检查通配符匹配
        let patterns = GM_getValue('captcha_blacklist_patterns');
        let patternList = patterns ? JSON.parse(patterns) : [];
        let patternMatch = patternList.some(item =>
            item.isBlacklisted && matchPattern(currentUrl, item.pattern)
        );

        let isBlacklisted = exactMatch || patternMatch;

        if (blackListMenuId) {
            GM_unregisterMenuCommand(blackListMenuId);
        }

        if (isBlacklisted) {
            blackListMenuId = GM_registerMenuCommand(
                "标记当前网站有验证码",
                labelWebsite
            );
        } else {
            blackListMenuId = GM_registerMenuCommand(
                "标记当前网站没有验证码",
                labelWebsite
            );
        }

        return isBlacklisted;
    }

    function labelWebsite() {
        let currentUrl = location.host + location.pathname;
        let key = currentUrl + "_black";
        let data = GM_getValue(key) && JSON.parse(GM_getValue(key));

        // 检查是否已经在通配符黑名单中
        let patterns = GM_getValue('captcha_blacklist_patterns');
        let patternList = patterns ? JSON.parse(patterns) : [];
        let existingPattern = patternList.find(item => matchPattern(currentUrl, item.pattern));

        let isCurrentlyBlacklisted = data || (existingPattern && existingPattern.isBlacklisted);

        if (isCurrentlyBlacklisted) {
            // 当前是黑名单状态，点击后标记为"有验证码"（移除黑名单）
            // 弹出确认框，让用户选择要移除的规则
            let message = "当前网站已标记为没有验证码。\n\n";
            if (existingPattern) {
                message += "匹配的规则：" + existingPattern.pattern + "\n\n";
            }
            message += "点击确定将标记为有验证码（启用验证码识别）";

            if (confirm(message)) {
                // 移除精确匹配
                GM_setValue(key, "false");

                // 移除通配符匹配
                if (existingPattern) {
                    patternList = patternList.filter(item => item.pattern !== existingPattern.pattern);
                    GM_setValue('captcha_blacklist_patterns', JSON.stringify(patternList));
                }

                notice("操作成功，已标记网站有验证码");
                captchaInstance = captchaInstance || new Captcha();
                captchaInstance.init();
            }
        } else {
            // 当前不在黑名单，点击后标记为"没有验证码"（添加到黑名单）
            // 弹出输入框，让用户编辑网站地址（支持通配符）
            let defaultPattern = currentUrl;
            let message = "请输入要排除验证码识别的网站地址模式：\n\n";
            message += "支持通配符：\n";
            message += "  * 匹配单层路径（不包含 /）\n";
            message += "  ** 匹配多层路径（包含 /）\n\n";
            message += "示例：\n";
            message += "  x.com/xx/status/* （排除该路径下所有页面）\n";
            message += "  x.com/** （排除整个域名）\n\n";
            message += "当前页面：" + currentUrl;

            let userPattern = prompt(message, defaultPattern);

            if (userPattern !== null && userPattern.trim() !== "") {
                userPattern = userPattern.trim();

                // 检查是否包含通配符
                if (userPattern.includes('*')) {
                    // 保存到通配符列表
                    let existingIndex = patternList.findIndex(item => item.pattern === userPattern);
                    if (existingIndex >= 0) {
                        patternList[existingIndex].isBlacklisted = true;
                    } else {
                        patternList.push({ pattern: userPattern, isBlacklisted: true });
                    }
                    GM_setValue('captcha_blacklist_patterns', JSON.stringify(patternList));
                    notice("操作成功，已添加规则：" + userPattern);
                } else {
                    // 精确匹配，使用原来的方式保存
                    let patternKey = userPattern + "_black";
                    GM_setValue(patternKey, "true");
                    notice("操作成功，已标记网站没有验证码");
                }
            }
        }

        blackListCheck();
    }
    blackListCheck();

    var captchaInstance = null;

    function main() {
        // @run-at document-end 时 DOMContentLoaded 已触发，直接初始化
        init();
        captchaInstance = new Captcha();
    }

    const actions = {
        handleSlideMenuClick: handleSlideMenuClick,
    };

    window.addEventListener(
        "message",
        (event) => {
            const { data = {} } = event || {};
            const { sign, action } = data;
            if (sign === "husky") {
                if (action && actions[action]) {
                    actions[action]({ isPostmessage: true });
                }
            }
        },
        false
    );
    main();
})();
