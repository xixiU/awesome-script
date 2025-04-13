// ==UserScript==
// @name         X Ad Blocker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Hide ads on x.com (Twitter) 移除推特广告
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
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
