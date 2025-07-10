// ==UserScript==
// @name         91华医-专题考核学习
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  当访问ztpx.91huayi.com时，拦截对GetQRCodeScanResult接口的请求，并将响应中的state修改为1。
// @author       Your Name
// @match        *://ztpx.91huayi.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const targetUrlPath = '/Exercise/FaceAuth/GetQRCodeScanResult';

    // 拦截 Fetch API
    const originalFetch = unsafeWindow.fetch;
    unsafeWindow.fetch = function (url, options) {
        const requestUrl = (url instanceof Request) ? url.url : url;

        if (requestUrl.includes(targetUrlPath) && (options === undefined || options.method === undefined || options.method.toUpperCase() === 'GET')) {
            console.log('拦截到Fetch请求:', requestUrl);
            return originalFetch.apply(this, arguments).then(response => {
                const clonedResponse = response.clone();
                return clonedResponse.json().then(data => {
                    console.log('原始Fetch响应:', data);
                    data.state = 1; // 修改state字段
                    console.log('修改后Fetch响应:', data);
                    const modifiedResponse = new Response(JSON.stringify(data), {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                    return modifiedResponse;
                }).catch(err => {
                    console.error('Fetch响应JSON解析失败:', err);
                    return response; // 如果不是JSON格式，则返回原始响应
                });
            });
        }
        return originalFetch.apply(this, arguments);
    };

    // 拦截 XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
        if (this._url && this._url.includes(targetUrlPath) && this._method.toUpperCase() === 'GET') {
            const originalOnReadyStateChange = this.onreadystatechange;
            this.onreadystatechange = function () {
                if (this.readyState === 4) {
                    try {
                        let responseData = JSON.parse(this.responseText);
                        console.log('原始XHR响应:', responseData);
                        responseData.state = 1; // 修改state字段
                        console.log('修改后XHR响应:', responseData);

                        Object.defineProperty(this, 'responseText', {
                            value: JSON.stringify(responseData),
                            writable: false
                        });
                        Object.defineProperty(this, 'response', {
                            value: JSON.stringify(responseData),
                            writable: false
                        });

                    } catch (e) {
                        console.error('XHR响应JSON解析或修改失败:', e);
                    }
                }
                if (originalOnReadyStateChange) {
                    originalOnReadyStateChange.apply(this, arguments);
                }
            };
        }
        return originalSend.apply(this, arguments);
    };
})();