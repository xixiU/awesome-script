/**
 * ============================================================
 * iFlytek Toolkit - 禁用切屏检测（主世界注入版）
 *
 * 运行环境：MAIN world（页面真实上下文），document_start 时机
 * 作用范围：manifest 配置 all_frames:true，每个同源 frame 独立注入
 *          （考试内容在 iframe 中，需覆盖所有 frame）
 *
 * 为什么必须运行在主世界：
 *   content.js 运行在扩展隔离世界，其 window / EventTarget.prototype /
 *   document 与页面真实对象不是同一个，改了也拦不到页面自身的代码。
 *   只有注入到主世界，覆盖 fetch / addEventListener / document.hidden
 *   才能真正拦截页面的切屏检测逻辑。
 *
 * 拦截策略（只做一次，document_start 早于页面业务代码执行）：
 *   1. 拦截 visibilitychange / blur 事件绑定
 *   2. 伪造 document.hidden = false / visibilityState = 'visible'
 *   3. 拦截 saveEventLog 上报请求（fetch + XMLHttpRequest）
 *
 * ⚠️ 仅用于开发者本地测试反复答题逻辑，不用于实际考试。
 * ============================================================
 */

(function () {
    'use strict';

    // 仅在 21tb 域名生效
    if (!location.hostname.includes('21tb.com')) return;

    var TAG = '[切屏检测:MAIN]';
    console.log(TAG, '注入生效:', location.href);

    // ---------- 1. 拦截 visibilitychange / blur 事件绑定 ----------
    var BLOCKED_EVENTS = ['visibilitychange', 'blur', 'webkitvisibilitychange', 'mozvisibilitychange'];
    var originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (BLOCKED_EVENTS.indexOf(type) !== -1) {
            console.log(TAG, '拦截事件监听器:', type);
            return;
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    // 拦截 onblur / onvisibilitychange 内联赋值（部分实现走这条路径）
    try {
        Object.defineProperty(window, 'onblur', { get: function () { return null; }, set: function () {}, configurable: true });
        Object.defineProperty(document, 'onvisibilitychange', { get: function () { return null; }, set: function () {}, configurable: true });
    } catch (e) {
        console.warn(TAG, '拦截内联事件属性失败:', e);
    }

    // ---------- 2. 伪造页面可见状态 ----------
    try {
        Object.defineProperty(document, 'hidden', { get: function () { return false; }, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
        // 兼容旧浏览器前缀
        Object.defineProperty(document, 'webkitHidden', { get: function () { return false; }, configurable: true });
        Object.defineProperty(document, 'webkitVisibilityState', { get: function () { return 'visible'; }, configurable: true });
        // 让 window.blur() 无效
        window.blur = function () { console.log(TAG, '拦截 window.blur() 调用'); };
        console.log(TAG, '已伪造 document.hidden / visibilityState');
    } catch (e) {
        console.warn(TAG, '伪造可见状态失败:', e);
    }

    // ---------- 3. 拦截切屏事件上报 ----------
    function isBlockedUrl(url) {
        return typeof url === 'string' && url.indexOf('saveEventLog') !== -1;
    }

    // 3.1 fetch
    if (typeof window.fetch === 'function') {
        var originalFetch = window.fetch;
        window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url);
            if (isBlockedUrl(url)) {
                console.log(TAG, '拦截 saveEventLog(fetch):', url);
                return Promise.resolve(new Response(
                    JSON.stringify({ code: 1001, msg: '操作处理成功（已被拦截）' }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                ));
            }
            return originalFetch.apply(this, arguments);
        };
    }

    // 3.2 XMLHttpRequest
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this.__ifly_url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        if (isBlockedUrl(this.__ifly_url)) {
            console.log(TAG, '拦截 saveEventLog(XHR):', this.__ifly_url);
            var self = this;
            var fake = JSON.stringify({ code: 1001, msg: '操作处理成功（已被拦截）' });
            // 伪造只读响应属性
            try {
                Object.defineProperty(self, 'readyState', { get: function () { return 4; }, configurable: true });
                Object.defineProperty(self, 'status', { get: function () { return 200; }, configurable: true });
                Object.defineProperty(self, 'responseText', { get: function () { return fake; }, configurable: true });
                Object.defineProperty(self, 'response', { get: function () { return fake; }, configurable: true });
            } catch (e) {
                console.warn(TAG, '伪造 XHR 响应失败:', e);
            }
            setTimeout(function () {
                if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
                if (typeof self.onload === 'function') self.onload();
                self.dispatchEvent(new Event('readystatechange'));
                self.dispatchEvent(new Event('load'));
                self.dispatchEvent(new Event('loadend'));
            }, 0);
            return;
        }
        return originalSend.apply(this, arguments);
    };

    console.log(TAG, '切屏检测已禁用');
})();
