// ==UserScript==
// @name         Twitter Block All Commenters
// @name:zh-CN   推特一键屏蔽评论者
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Block all commenters under a specific tweet on Twitter/X with one click
// @description:zh-CN  一键屏蔽推特/X某条推文下的所有评论者
// @author       xixiU
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @run-at       document-end
// @license      MIT
// @require      https://github.com/xixiU/awesome-script/raw/refs/heads/master/common/config_manager.js
// @downloadURL  https://github.com/xixiU/awesome-script/raw/refs/heads/master/twitter/twitter_block_commenters.user.js
// @updateURL    https://github.com/xixiU/awesome-script/raw/refs/heads/master/twitter/twitter_block_commenters.user.js
// ==/UserScript==

(function () {
    'use strict';

    let isBlocking = false;
    let blockedCount = 0;
    let failedCount = 0;

    // Internationalization (i18n) text dictionary
    const i18n = {
        en: {
            buttonText: '🚫 Block All Commenters',
            buttonProcessing: '🔄 Processing...',
            buttonLoading: '🔄 Loading comments...',
            alertProcessing: 'Blocking operation is in progress, please wait...',
            alertNotDetailPage: 'Please use this feature on a tweet detail page!',
            confirmBlock: 'Are you sure you want to block all commenters under this tweet?\n\nWarning: This action is irreversible, please use with caution!',
            alertNoCommenters: 'No commenters found!',
            alertComplete: 'Blocking operation completed!\n\nSuccessful: {success}\nFailed: {failed}\nTotal: {total}',
            consoleLoading: 'Starting to load all comments...',
            consoleLoadComplete: 'Comments loading completed, extracting commenters list...',
            consoleFoundCommenters: 'Found {count} commenters, starting to block...',
            consoleComplete: '=== Blocking operation completed ===',
            consoleSuccess: 'Successful: {count}',
            consoleFailed: 'Failed: {count}',
            consoleTotal: 'Total: {count}',
            consoleTryBlock: 'Attempting to block user: @{username}',
            consoleTryBlockAPI: 'Attempting to block user via API: @{username}',
            consoleTryBlockUI: 'Attempting to block user via UI: @{username}',
            consoleBlockSuccess: '✅ Successfully blocked user: @{username}',
            consoleBlockFailed: '❌ Failed to block user @{username}:',
            consoleNotFoundElement: 'Comment element not found for user @{username}',
            consoleNotFoundButton: 'More options button not found for user @{username}',
            consoleNotFoundMenuItem: 'Block option not found',
            consoleNotFoundConfirm: 'Confirmation button not found',
            consoleScriptLoaded: 'Twitter Block All Commenters script loaded',
            consoleExcludedOriginal: 'Excluded original poster: @{username}',
            configExcludeOriginalLabel: 'Exclude Original Poster',
            configExcludeOriginalHelp: 'Do not block the person who posted the tweet'
        },
        zh: {
            buttonText: '🚫 屏蔽所有评论者',
            buttonProcessing: '🔄 正在处理...',
            buttonLoading: '🔄 加载评论中...',
            alertProcessing: '正在执行屏蔽操作，请稍候...',
            alertNotDetailPage: '请在推文详情页使用此功能！',
            confirmBlock: '确定要屏蔽这条推文下的所有评论者吗？\n\n注意：此操作不可撤销，请谨慎使用！',
            alertNoCommenters: '未找到任何评论者！',
            alertComplete: '屏蔽操作完成！\n\n成功: {success}\n失败: {failed}\n总计: {total}',
            consoleLoading: '开始加载所有评论...',
            consoleLoadComplete: '评论加载完成，开始获取评论者列表...',
            consoleFoundCommenters: '找到 {count} 个评论者，开始屏蔽...',
            consoleComplete: '=== 屏蔽操作完成 ===',
            consoleSuccess: '成功: {count}',
            consoleFailed: '失败: {count}',
            consoleTotal: '总计: {count}',
            consoleTryBlock: '尝试屏蔽用户: @{username}',
            consoleTryBlockAPI: '尝试通过API屏蔽用户: @{username}',
            consoleTryBlockUI: '尝试通过UI屏蔽用户: @{username}',
            consoleBlockSuccess: '✅ 成功屏蔽用户: @{username}',
            consoleBlockFailed: '❌ 屏蔽用户 @{username} 失败:',
            consoleNotFoundElement: '未找到用户 @{username} 的评论元素',
            consoleNotFoundButton: '未找到用户 @{username} 的更多选项按钮',
            consoleNotFoundMenuItem: '未找到屏蔽选项',
            consoleNotFoundConfirm: '未找到确认按钮',
            consoleScriptLoaded: '推特屏蔽评论者脚本已加载',
            consoleExcludedOriginal: '已排除原推作者: @{username}',
            configExcludeOriginalLabel: '排除原推作者',
            configExcludeOriginalHelp: '不屏蔽发推文的人'
        }
    };

    // Use ConfigManager's i18n translator
    // Detect language using ConfigManager's static method
    const currentLang = (typeof ConfigManager !== 'undefined')
        ? ConfigManager.detectLanguageSimple()
        : (navigator.language || navigator.userLanguage || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';

    // Create translator function using ConfigManager if available
    const t = (typeof ConfigManager !== 'undefined')
        ? ConfigManager.createTranslator(i18n, currentLang)
        : function (key, params = {}) {
            // Fallback translator if ConfigManager is not loaded
            let text = (i18n[currentLang] && i18n[currentLang][key]) || (i18n.en && i18n.en[key]) || key;
            if (typeof params === 'object' && Object.keys(params).length > 0) {
                Object.keys(params).forEach(param => {
                    text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
                });
            }
            return text;
        };

    // Initialize config manager
    const config = new ConfigManager('TwitterBlockCommenters', {
        excludeOriginalPoster: true  // Default: do not block the original poster
    }, {
        i18n: i18n,
        lang: currentLang
    });

    // Initialize config panel
    config.init([
        {
            key: 'excludeOriginalPoster',
            label: t('configExcludeOriginalLabel'),
            type: 'checkbox',
            help: t('configExcludeOriginalHelp')
        }
    ]);

    // Utility function: delay
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Create control button
    function createBlockButton() {
        const button = document.createElement('button');
        button.id = 'block-all-commenters-btn';
        button.innerHTML = t('buttonText');
        button.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 9999;
            padding: 12px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            transition: all 0.3s ease;
        `;

        button.addEventListener('mouseenter', function () {
            if (!isBlocking) {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
            }
        });

        button.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
        });

        button.addEventListener('click', handleBlockAllCommenters);

        document.body.appendChild(button);
        return button;
    }

    // Update button status
    function updateButtonStatus(text, isProcessing = false) {
        const button = document.getElementById('block-all-commenters-btn');
        if (button) {
            button.innerHTML = text;
            if (isProcessing) {
                button.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
                button.style.cursor = 'not-allowed';
            } else {
                button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                button.style.cursor = 'pointer';
            }
        }
    }

    // Check if on tweet detail page
    function isOnTweetDetailPage() {
        const url = window.location.href;
        return url.includes('/status/');
    }

    // Get original poster's username from the first tweet
    function getOriginalPosterUsername() {
        try {
            // The first article is usually the original tweet
            const firstArticle = document.querySelector('article[data-testid="tweet"]');
            if (!firstArticle) return null;

            // Find the username link in the first article
            const userLink = firstArticle.querySelector('a[href^="/"][role="link"]');
            if (!userLink) return null;

            const href = userLink.getAttribute('href');
            if (href && href.match(/^\/[^\/]+$/)) {
                const username = href.substring(1);
                return username;
            }
        } catch (error) {
            console.error('Failed to get original poster username:', error);
        }
        return null;
    }

    // Get all commenters
    function getAllCommenters() {
        const commenters = new Set();
        const excludeOriginal = config.get('excludeOriginalPoster');
        const originalPoster = excludeOriginal ? getOriginalPosterUsername() : null;

        if (originalPoster && excludeOriginal) {
            console.log(t('consoleExcludedOriginal', { username: originalPoster }));
        }

        // Comments on X/Twitter are usually in article tags
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach(article => {
            // Find username links
            const userLinks = article.querySelectorAll('a[href^="/"][role="link"]');
            userLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.match(/^\/[^\/]+$/)) {
                    const username = href.substring(1);
                    if (username &&
                        username !== 'home' &&
                        username !== 'explore' &&
                        username !== 'notifications' &&
                        username !== 'messages' &&
                        (!excludeOriginal || username !== originalPoster)) {
                        commenters.add(username);
                    }
                }
            });
        });

        return Array.from(commenters);
    }

    // Block a single user
    async function blockUser(username) {
        try {
            console.log(t('consoleTryBlock', { username }));

            // Open user page
            const userUrl = `https://x.com/${username}`;
            const userTab = window.open(userUrl, '_blank');

            await sleep(3000);

            // Execute block operation in new tab
            if (userTab && !userTab.closed) {
                userTab.close();
            }

            return true;
        } catch (error) {
            console.error(t('consoleBlockFailed', { username }), error);
            return false;
        }
    }

    // Block user via API
    async function blockUserByAPI(username) {
        try {
            console.log(t('consoleTryBlockAPI', { username }));

            // Get user ID
            const userResponse = await fetch(`https://api.twitter.com/2/users/by/username/${username}`, {
                method: 'GET',
                credentials: 'include'
            });

            if (!userResponse.ok) {
                throw new Error('Failed to get user info');
            }

            const userData = await userResponse.json();
            const userId = userData.data?.id;

            if (!userId) {
                throw new Error('Failed to get user ID');
            }

            // Execute block
            const blockResponse = await fetch(`https://api.twitter.com/1.1/blocks/create.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `user_id=${userId}`,
                credentials: 'include'
            });

            if (blockResponse.ok) {
                console.log(t('consoleBlockSuccess', { username }));
                return true;
            } else {
                throw new Error('Block request failed');
            }
        } catch (error) {
            console.error(t('consoleBlockFailed', { username }), error);
            return false;
        }
    }

    // Block user by clicking UI elements
    async function blockUserByUI(username) {
        try {
            console.log(t('consoleTryBlockUI', { username }));

            // Find the user's comment element
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            let targetArticle = null;

            for (const article of articles) {
                const userLink = article.querySelector(`a[href="/${username}"]`);
                if (userLink) {
                    targetArticle = article;
                    break;
                }
            }

            if (!targetArticle) {
                console.log(t('consoleNotFoundElement', { username }));
                return false;
            }

            // Find and click the more options button (three dots)
            const moreButton = targetArticle.querySelector('[data-testid="caret"]');
            if (!moreButton) {
                console.log(t('consoleNotFoundButton', { username }));
                return false;
            }

            moreButton.click();
            await sleep(500);

            // Find and click the block button
            const blockMenuItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
                item => item.textContent.includes('Block') || item.textContent.includes('屏蔽') || item.textContent.includes('封鎖')
            );

            if (!blockMenuItem) {
                console.log(t('consoleNotFoundMenuItem'));
                // Close menu
                document.body.click();
                return false;
            }

            blockMenuItem.click();
            await sleep(500);

            // Confirm block
            const confirmButton = Array.from(document.querySelectorAll('[data-testid="confirmationSheetConfirm"]')).find(
                btn => btn.textContent.includes('Block') || btn.textContent.includes('屏蔽') || btn.textContent.includes('封鎖')
            );

            if (confirmButton) {
                confirmButton.click();
                await sleep(1000);
                console.log(t('consoleBlockSuccess', { username }));
                return true;
            } else {
                console.log(t('consoleNotFoundConfirm'));
                return false;
            }
        } catch (error) {
            console.error(t('consoleBlockFailed', { username }), error);
            return false;
        }
    }

    // Main handler: block all commenters
    async function handleBlockAllCommenters() {
        if (isBlocking) {
            alert(t('alertProcessing'));
            return;
        }

        if (!isOnTweetDetailPage()) {
            alert(t('alertNotDetailPage'));
            return;
        }

        const confirmed = confirm(t('confirmBlock'));
        if (!confirmed) {
            return;
        }

        isBlocking = true;
        blockedCount = 0;
        failedCount = 0;
        updateButtonStatus(t('buttonProcessing'), true);

        // Scroll to load more comments
        console.log(t('consoleLoading'));
        updateButtonStatus(t('buttonLoading'), true);

        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 10;

        while (scrollAttempts < maxScrollAttempts) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(2000);

            const currentHeight = document.body.scrollHeight;
            if (currentHeight === previousHeight) {
                scrollAttempts++;
            } else {
                scrollAttempts = 0;
            }
            previousHeight = currentHeight;
        }

        console.log(t('consoleLoadComplete'));

        const commenters = getAllCommenters();

        if (commenters.length === 0) {
            alert(t('alertNoCommenters'));
            isBlocking = false;
            updateButtonStatus(t('buttonText'), false);
            return;
        }

        console.log(t('consoleFoundCommenters', { count: commenters.length }));
        console.log(JSON.stringify(commenters));
        updateButtonStatus(`🔄 0/${commenters.length}`, true);

        // Block commenters one by one
        for (let i = 0; i < commenters.length; i++) {
            const username = commenters[i];
            updateButtonStatus(`🔄 ${i + 1}/${commenters.length}`, true);

            const success = await blockUserByUI(username);

            if (success) {
                blockedCount++;
            } else {
                failedCount++;
            }

            // Wait a while after each block to avoid rate limiting
            await sleep(2000);
        }

        isBlocking = false;
        updateButtonStatus(t('buttonText'), false);

        alert(t('alertComplete', {
            success: blockedCount,
            failed: failedCount,
            total: commenters.length
        }));

        console.log(t('consoleComplete'));
        console.log(t('consoleSuccess', { count: blockedCount }));
        console.log(t('consoleFailed', { count: failedCount }));
        console.log(t('consoleTotal', { count: commenters.length }));
    }

    // Initialize
    function init() {
        if (document.getElementById('block-all-commenters-btn')) {
            return;
        }

        const button = createBlockButton();
        console.log(t('consoleScriptLoaded'));
    }

    // Initialize after page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Listen for route changes (SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(init, 1000);
        }
    }).observe(document.body, { subtree: true, childList: true });

})();

