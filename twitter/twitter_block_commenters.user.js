// ==UserScript==
// @name         推特一键屏蔽评论者
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  一键屏蔽推特/X某条推文下的所有评论者
// @author       xixiU
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    let isBlocking = false;
    let blockedCount = 0;
    let failedCount = 0;

    // 工具函数：延迟
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 工具函数：创建控制按钮
    function createBlockButton() {
        const button = document.createElement('button');
        button.id = 'block-all-commenters-btn';
        button.innerHTML = '🚫 屏蔽所有评论者';
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

        button.addEventListener('mouseenter', function() {
            if (!isBlocking) {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
            }
        });

        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
        });

        button.addEventListener('click', handleBlockAllCommenters);

        document.body.appendChild(button);
        return button;
    }

    // 工具函数：更新按钮状态
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

    // 检测是否在推文详情页
    function isOnTweetDetailPage() {
        const url = window.location.href;
        return url.includes('/status/');
    }

    // 获取所有评论区的用户
    function getAllCommenters() {
        const commenters = new Set();
        
        // X/Twitter 的评论通常在 article 标签中
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        
        articles.forEach(article => {
            // 查找用户名链接
            const userLinks = article.querySelectorAll('a[href^="/"][role="link"]');
            userLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.match(/^\/[^\/]+$/)) {
                    const username = href.substring(1);
                    if (username && username !== 'home' && username !== 'explore' && username !== 'notifications' && username !== 'messages') {
                        commenters.add(username);
                    }
                }
            });
        });

        return Array.from(commenters);
    }

    // 屏蔽单个用户
    async function blockUser(username) {
        try {
            console.log(`尝试屏蔽用户: @${username}`);
            
            // 打开用户页面
            const userUrl = `https://x.com/${username}`;
            const userTab = window.open(userUrl, '_blank');
            
            await sleep(3000);
            
            // 在新标签页中执行屏蔽操作
            if (userTab && !userTab.closed) {
                userTab.close();
            }
            
            return true;
        } catch (error) {
            console.error(`屏蔽用户 @${username} 失败:`, error);
            return false;
        }
    }

    // 通过 API 屏蔽用户
    async function blockUserByAPI(username) {
        try {
            console.log(`尝试通过API屏蔽用户: @${username}`);
            
            // 获取用户ID
            const userResponse = await fetch(`https://api.twitter.com/2/users/by/username/${username}`, {
                method: 'GET',
                credentials: 'include'
            });
            
            if (!userResponse.ok) {
                throw new Error('无法获取用户信息');
            }
            
            const userData = await userResponse.json();
            const userId = userData.data?.id;
            
            if (!userId) {
                throw new Error('无法获取用户ID');
            }
            
            // 执行屏蔽
            const blockResponse = await fetch(`https://api.twitter.com/1.1/blocks/create.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `user_id=${userId}`,
                credentials: 'include'
            });
            
            if (blockResponse.ok) {
                console.log(`✅ 成功屏蔽用户: @${username}`);
                return true;
            } else {
                throw new Error('屏蔽请求失败');
            }
        } catch (error) {
            console.error(`❌ 屏蔽用户 @${username} 失败:`, error);
            return false;
        }
    }

    // 通过点击界面元素屏蔽用户
    async function blockUserByUI(username) {
        try {
            console.log(`尝试通过UI屏蔽用户: @${username}`);
            
            // 查找该用户的评论元素
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
                console.log(`未找到用户 @${username} 的评论元素`);
                return false;
            }
            
            // 查找并点击更多选项按钮（三个点）
            const moreButton = targetArticle.querySelector('[data-testid="caret"]');
            if (!moreButton) {
                console.log(`未找到用户 @${username} 的更多选项按钮`);
                return false;
            }
            
            moreButton.click();
            await sleep(500);
            
            // 查找并点击屏蔽按钮
            const blockMenuItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
                item => item.textContent.includes('Block') || item.textContent.includes('屏蔽') || item.textContent.includes('封鎖')
            );
            
            if (!blockMenuItem) {
                console.log(`未找到屏蔽选项`);
                // 关闭菜单
                document.body.click();
                return false;
            }
            
            blockMenuItem.click();
            await sleep(500);
            
            // 确认屏蔽
            const confirmButton = Array.from(document.querySelectorAll('[data-testid="confirmationSheetConfirm"]')).find(
                btn => btn.textContent.includes('Block') || btn.textContent.includes('屏蔽') || btn.textContent.includes('封鎖')
            );
            
            if (confirmButton) {
                confirmButton.click();
                await sleep(1000);
                console.log(`✅ 成功屏蔽用户: @${username}`);
                return true;
            } else {
                console.log(`未找到确认按钮`);
                return false;
            }
        } catch (error) {
            console.error(`❌ 通过UI屏蔽用户 @${username} 失败:`, error);
            return false;
        }
    }

    // 主处理函数：屏蔽所有评论者
    async function handleBlockAllCommenters() {
        if (isBlocking) {
            alert('正在执行屏蔽操作，请稍候...');
            return;
        }

        if (!isOnTweetDetailPage()) {
            alert('请在推文详情页使用此功能！');
            return;
        }

        const confirmed = confirm('确定要屏蔽这条推文下的所有评论者吗？\n\n注意：此操作不可撤销，请谨慎使用！');
        if (!confirmed) {
            return;
        }

        isBlocking = true;
        blockedCount = 0;
        failedCount = 0;
        updateButtonStatus('🔄 正在处理...', true);

        // 滚动加载更多评论
        console.log('开始加载所有评论...');
        updateButtonStatus('🔄 加载评论中...', true);
        
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

        console.log('评论加载完成，开始获取评论者列表...');
        
        const commenters = getAllCommenters();
        
        if (commenters.length === 0) {
            alert('未找到任何评论者！');
            isBlocking = false;
            updateButtonStatus('🚫 屏蔽所有评论者', false);
            return;
        }

        console.log(`找到 ${commenters.length} 个评论者，开始屏蔽...`);
        updateButtonStatus(`🔄 0/${commenters.length}`, true);

        // 逐个屏蔽评论者
        for (let i = 0; i < commenters.length; i++) {
            const username = commenters[i];
            updateButtonStatus(`🔄 ${i + 1}/${commenters.length}`, true);
            
            const success = await blockUserByUI(username);
            
            if (success) {
                blockedCount++;
            } else {
                failedCount++;
            }
            
            // 每屏蔽一个用户后等待一段时间，避免被限制
            await sleep(2000);
        }

        isBlocking = false;
        updateButtonStatus('🚫 屏蔽所有评论者', false);
        
        alert(`屏蔽操作完成！\n\n成功: ${blockedCount}\n失败: ${failedCount}\n总计: ${commenters.length}`);
        
        console.log('=== 屏蔽操作完成 ===');
        console.log(`成功: ${blockedCount}`);
        console.log(`失败: ${failedCount}`);
        console.log(`总计: ${commenters.length}`);
    }

    // 初始化
    function init() {
        if (document.getElementById('block-all-commenters-btn')) {
            return;
        }

        const button = createBlockButton();
        console.log('推特屏蔽评论者脚本已加载');
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 监听路由变化（SPA应用）
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(init, 1000);
        }
    }).observe(document.body, { subtree: true, childList: true });

})();

