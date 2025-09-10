// ==UserScript==
// @name         X Ad Blocker
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Hide ads on x.com (Twitter) 移除推特广告
// @match        https://x.com/*
// @match        https://twitter.com/*
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/removeXAd.js
// @updateURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/removeXAd.js
// @author       xixiU
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @homepage     https://github.com/xixiU/awesome-script
// @supportURL   https://github.com/xixiU/awesome-script/issues
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const observer = new MutationObserver(() => {
        document.querySelectorAll('article').forEach(article => {
            // 检查是否包含 "Ad" 或 "Promoted"
            const adMarker = Array.from(article.querySelectorAll('span, div'))
                .some(el => el.textContent.trim() === 'Ad' || el.textContent.trim() === 'Promoted');

            if (adMarker) {
                article.style.display = 'none';
                article.setAttribute('data-hidden-by-script', 'true');
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
})();
