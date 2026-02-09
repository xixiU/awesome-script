// ==UserScript==
// @name         Twitter X Toolkit
// @name:zh-CN   推特X工具箱
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  A powerful toolkit for Twitter/X: Block commenters, AI summarization, and more features to come
// @description:zh-CN  推特X多功能工具箱：一键屏蔽评论者、AI智能总结等，未来将持续扩展更多功能
// @author       xixiU
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @run-at       document-end
// @license      MIT
// @require      https://github.com/xixiU/awesome-script/raw/refs/heads/master/common/config_manager.js
// @downloadURL  https://github.com/xixiU/awesome-script/raw/refs/heads/master/twitter/twitter_x_toolkit.user.js
// @updateURL    https://github.com/xixiU/awesome-script/raw/refs/heads/master/twitter/twitter_x_toolkit.user.js
// ==/UserScript==

(function () {
    'use strict';

    let isBlocking = false;
    let blockedCount = 0;
    let failedCount = 0;
    let isSummarizing = false;

    // Internationalization (i18n) text dictionary
    const i18n = {
        en: {
            // Block功能相关
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
            consoleScriptLoaded: 'Twitter X Toolkit loaded successfully',
            consoleExcludedOriginal: 'Excluded original poster: @{username}',
            configExcludeOriginalLabel: 'Exclude Original Poster',
            configExcludeOriginalHelp: 'Do not block the person who posted the tweet',
            configScrollAttemptsLabel: 'Max Scroll Attempts',
            configScrollAttemptsHelp: 'Maximum scroll attempts for loading content (blocking/AI summarization, default: 10)',

            // AI总结功能相关
            summarizeButtonText: '🤖 AI Summary',
            summarizeButtonLoading: '🔄 Generating...',
            configAiBaseUrlLabel: 'OpenAI API Base URL',
            configAiBaseUrlHelp: 'OpenAI-compatible API base URL (e.g., https://api.openai.com/v1)',
            configAiApiKeyLabel: 'API Key',
            configAiApiKeyHelp: 'Your OpenAI API Key',
            configAiModelLabel: 'AI Model',
            configAiModelHelp: 'Model name (e.g., gpt-4, gpt-3.5-turbo)',
            alertSummarizing: 'AI summarization in progress, please wait...',
            alertNoApiKey: 'Please configure your OpenAI API Key first!\nClick the config panel to set it up.',
            alertNoContent: 'No content found to summarize!',
            panelTitle: 'AI Summary',
            panelClose: 'Close',
            panelCopy: 'Copy',
            panelCopied: 'Copied!',
            panelFullscreen: 'Fullscreen',
            panelExitFullscreen: 'Exit Fullscreen',
            consoleSummarizing: 'Starting AI summarization...',
            consoleSummarizeSuccess: 'AI summarization completed',
            consoleSummarizeFailed: 'AI summarization failed:'
        },
        zh: {
            // Block功能相关
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
            consoleScriptLoaded: '推特X工具箱加载成功',
            consoleExcludedOriginal: '已排除原推作者: @{username}',
            configExcludeOriginalLabel: '排除原推作者',
            configExcludeOriginalHelp: '不屏蔽发推文的人',
            configScrollAttemptsLabel: '最大滚动次数',
            configScrollAttemptsHelp: '加载内容的最大滚动尝试次数（用于屏蔽和AI总结，默认：10）',

            // AI总结功能相关
            summarizeButtonText: '🤖 AI总结',
            summarizeButtonLoading: '🔄 生成中...',
            configAiBaseUrlLabel: 'OpenAI API地址',
            configAiBaseUrlHelp: 'OpenAI兼容的API基础地址（如：https://api.openai.com/v1）',
            configAiApiKeyLabel: 'API密钥',
            configAiApiKeyHelp: '你的OpenAI API Key',
            configAiModelLabel: 'AI模型',
            configAiModelHelp: '模型名称（如：gpt-4, gpt-3.5-turbo）',
            alertSummarizing: 'AI总结进行中，请稍候...',
            alertNoApiKey: '请先配置你的OpenAI API Key！\n点击配置面板进行设置。',
            alertNoContent: '未找到可总结的内容！',
            panelTitle: 'AI总结',
            panelClose: '关闭',
            panelCopy: '复制',
            panelCopied: '已复制！',
            panelFullscreen: '全屏',
            panelExitFullscreen: '退出全屏',
            consoleSummarizing: '开始AI总结...',
            consoleSummarizeSuccess: 'AI总结完成',
            consoleSummarizeFailed: 'AI总结失败:'
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
    const config = new ConfigManager('TwitterXToolkit', {
        // Block功能配置
        excludeOriginalPoster: true,
        scrollAttempts: 10,
        // AI总结功能配置
        aiBaseUrl: 'https://api.openai.com/v1',
        aiApiKey: '',
        aiModel: 'gpt-3.5-turbo'
    }, {
        i18n: i18n,
        lang: currentLang
    });

    // Initialize config panel
    config.init([
        // Block功能配置项
        {
            key: 'excludeOriginalPoster',
            label: t('configExcludeOriginalLabel'),
            type: 'checkbox',
            help: t('configExcludeOriginalHelp')
        },
        {
            key: 'scrollAttempts',
            label: t('configScrollAttemptsLabel'),
            type: 'number',
            placeholder: '10',
            help: t('configScrollAttemptsHelp'),
            validate: (value) => {
                const num = parseInt(value);
                return num >= 1 && num <= 50;
            }
        },
        // AI总结功能配置项
        {
            key: 'aiBaseUrl',
            label: t('configAiBaseUrlLabel'),
            type: 'text',
            placeholder: 'https://api.openai.com/v1',
            help: t('configAiBaseUrlHelp')
        },
        {
            key: 'aiApiKey',
            label: t('configAiApiKeyLabel'),
            type: 'password',
            placeholder: 'sk-...',
            help: t('configAiApiKeyHelp')
        },
        {
            key: 'aiModel',
            label: t('configAiModelLabel'),
            type: 'text',
            placeholder: 'gpt-3.5-turbo',
            help: t('configAiModelHelp')
        }
    ]);

    // Utility function: delay
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== 页面类型检测 ====================

    // Check if on tweet detail page
    function isOnTweetDetailPage() {
        const url = window.location.href;
        return url.includes('/status/');
    }

    // Check if on user profile page
    function isOnUserProfilePage() {
        const url = window.location.href;
        const pathname = window.location.pathname;
        // User profile URL format: /username (not including /status/, /search, etc.)
        return !url.includes('/status/') &&
            !url.includes('/search') &&
            !url.includes('/notifications') &&
            !url.includes('/messages') &&
            !url.includes('/home') &&
            !url.includes('/explore') &&
            pathname.match(/^\/[^\/]+$/);
    }

    // ==================== 内容提取功能 ====================

    // Extract main tweet content
    function extractTweetContent() {
        try {
            const firstArticle = document.querySelector('article[data-testid="tweet"]');
            if (!firstArticle) return null;

            // Extract tweet text
            const tweetTextElement = firstArticle.querySelector('[data-testid="tweetText"]');
            const tweetText = tweetTextElement ? tweetTextElement.innerText : '';

            // Extract author info
            const userLink = firstArticle.querySelector('a[href^="/"][role="link"]');
            let author = '';
            if (userLink) {
                const href = userLink.getAttribute('href');
                if (href && href.match(/^\/[^\/]+$/)) {
                    author = href.substring(1);
                }
            }

            return {
                author: author,
                text: tweetText,
                url: window.location.href
            };
        } catch (error) {
            console.error('Failed to extract tweet content:', error);
            return null;
        }
    }

    // Generic function to extract tweets/comments with scrolling
    async function extractTweetsWithScroll(options = {}) {
        const {
            waitTime = 1500,
            maxPages = 10,
            skipFirst = false,
            idLength = 30,
            logPrefix = 'tweets'
        } = options;

        const items = [];
        let previousHeight = 0;
        let scrollAttempts = 0;
        let pagesLoaded = 0;

        console.log(`Loading ${logPrefix} (max ${maxPages} pages)...`);

        while (pagesLoaded < maxPages && scrollAttempts < 2) {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(waitTime);

            // Extract current visible tweets
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            articles.forEach((article, index) => {
                // Skip the first article if specified (e.g., original tweet in comments)
                if (skipFirst && index === 0) return;

                try {
                    const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
                    const tweetText = tweetTextElement ? tweetTextElement.innerText : '';

                    const userLink = article.querySelector('a[href^="/"][role="link"]');
                    let author = '';
                    if (userLink) {
                        const href = userLink.getAttribute('href');
                        if (href && href.match(/^\/[^\/]+$/)) {
                            author = href.substring(1);
                        }
                    }

                    // For comments, require both author and text
                    // For user tweets, text is enough
                    const shouldAdd = skipFirst ? (author && tweetText) : tweetText;

                    if (shouldAdd) {
                        const itemId = `${author}_${tweetText.substring(0, idLength)}`;
                        if (!items.find(item => item.id === itemId)) {
                            items.push({
                                id: itemId,
                                author: author,
                                text: tweetText
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Failed to extract ${logPrefix}:`, error);
                }
            });

            const currentHeight = document.body.scrollHeight;
            if (currentHeight === previousHeight) {
                scrollAttempts++;
            } else {
                scrollAttempts = 0;
                pagesLoaded++;
            }
            previousHeight = currentHeight;
        }

        console.log(`Loaded ${items.length} ${logPrefix} from ${pagesLoaded} pages`);
        return items;
    }

    // Extract all comments with scrolling
    async function extractCommentsWithScroll(maxPages = 10) {
        return extractTweetsWithScroll({
            waitTime: 500,
            maxPages,
            skipFirst: true,
            idLength: 20,
            logPrefix: 'comments'
        });
    }

    // Extract user tweets with scrolling
    async function extractUserTweetsWithScroll(maxPages = 10) {
        return extractTweetsWithScroll({
            waitTime: 1500,
            maxPages,
            skipFirst: false,
            idLength: 30,
            logPrefix: 'user tweets'
        });
    }

    // ==================== AI总结功能 ====================

    // Call OpenAI-compatible API for summarization
    function callAISummarize(content, apiKey, baseUrl, model) {
        return new Promise((resolve, reject) => {
            if (!apiKey) {
                reject(new Error(t('alertNoApiKey')));
                return;
            }

            // Build prompt based on content type
            let prompt = '';
            if (content.type === 'tweet_with_comments') {
                prompt = `请对以下推文及其评论进行智能总结：

原推文：
作者: @${content.tweet.author}
内容: ${content.tweet.text}
链接: ${content.tweet.url}

评论列表（共${content.comments.length}条）：
${content.comments.slice(0, 100).map((c, i) => `${i + 1}. @${c.author}: ${c.text}`).join('\n')}

请总结：
1. 原推文的核心观点
2. 评论的主要反馈和观点分布
3. 讨论的热点话题
4. 整体舆论倾向

请使用markdown格式输出，包含清晰的结构。`;
            } else if (content.type === 'user_tweets') {
                prompt = `请对以下用户的推文进行智能总结：

用户: @${content.username}
推文列表（共${content.tweets.length}条）：
${content.tweets.slice(0, 50).map((t, i) => `${i + 1}. ${t.text}`).join('\n\n')}

请总结：
1. 该用户的主要关注话题
2. 发言风格和态度特点
3. 核心观点和立场
4. 最近的活跃主题

请使用markdown格式输出，包含清晰的结构。`;
            }

            const requestData = {
                model: model || 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${baseUrl}/chat/completions`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: JSON.stringify(requestData),
                timeout: 60000,
                onload: function (response) {
                    try {
                        console.log(`req: ${JSON.stringify(requestData)},resp:${response.responseText}`);
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const result = data.choices?.[0]?.message?.content || 'No response';
                            resolve(result);
                        } else {
                            reject(new Error(`API request failed: ${response.status} ${response.statusText}\n${response.responseText}`));
                        }
                    } catch (e) {
                        reject(new Error(`Parse response failed: ${e.message}\n${response.responseText}`));
                    }
                },
                onerror: function (error) {
                    reject(new Error(`Network request failed: ${error.message || 'Unknown error'}`));
                },
                ontimeout: function () {
                    reject(new Error('Request timeout, please try again later'));
                }
            });
        });
    }

    // ==================== UI控制 ====================

    // Create block button
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

    // Create AI summarize button
    function createSummarizeButton() {
        const button = document.createElement('button');
        button.id = 'ai-summarize-btn';
        button.innerHTML = t('summarizeButtonText');
        button.style.cssText = `
            position: fixed;
            top: 140px;
            right: 20px;
            z-index: 9999;
            padding: 12px 20px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
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
            if (!isSummarizing) {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
            }
        });

        button.addEventListener('mouseleave', function () {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
        });

        button.addEventListener('click', handleAISummarize);

        document.body.appendChild(button);
        return button;
    }

    // Create result panel
    function createResultPanel() {
        const panel = document.createElement('div');
        panel.id = 'ai-result-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 800px;
            max-height: 80vh;
            background: rgb(21, 32, 43);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: none;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: rgb(231, 233, 234);
        `;

        panel.innerHTML = `
            <div id="panel-header" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${t('panelTitle')}</h3>
                <div id="panel-actions" style="display: flex; gap: 10px; align-items: center;">
                    <button id="panel-fullscreen-btn" title="${t('panelFullscreen')}" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">⛶</button>
                    <button id="panel-copy-btn" title="${t('panelCopy')}" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">📋</button>
                    <button id="panel-close-btn" title="${t('panelClose')}" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px; line-height: 1; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">×</button>
                </div>
            </div>
            <div id="panel-content" style="padding: 24px; overflow-y: auto; overflow-x: hidden; max-height: calc(80vh - 60px); line-height: 1.8; color: rgb(231, 233, 234); user-select: text; -webkit-user-select: text; cursor: text; box-sizing: border-box;"></div>
        `;

        document.body.appendChild(panel);

        // Event listeners
        document.getElementById('panel-close-btn').addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // Add hover effects for buttons
        ['panel-fullscreen-btn', 'panel-copy-btn', 'panel-close-btn'].forEach(btnId => {
            const btn = document.getElementById(btnId);
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(255,255,255,0.35)';
                btn.style.transform = 'scale(1.1)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(255,255,255,0.2)';
                btn.style.transform = 'scale(1)';
            });
        });

        document.getElementById('panel-copy-btn').addEventListener('click', () => {
            const content = document.getElementById('panel-content').innerText;
            navigator.clipboard.writeText(content).then(() => {
                const btn = document.getElementById('panel-copy-btn');
                const originalIcon = btn.innerHTML;
                btn.innerHTML = '✓';
                btn.style.background = 'rgba(16, 185, 129, 0.8)';
                setTimeout(() => {
                    btn.innerHTML = originalIcon;
                    btn.style.background = 'rgba(255,255,255,0.2)';
                }, 2000);
            });
        });

        let isFullscreen = false;
        document.getElementById('panel-fullscreen-btn').addEventListener('click', () => {
            isFullscreen = !isFullscreen;
            const btn = document.getElementById('panel-fullscreen-btn');
            const content = document.getElementById('panel-content');

            if (isFullscreen) {
                // 全屏模式
                panel.style.top = '0';
                panel.style.left = '0';
                panel.style.transform = 'none';
                panel.style.width = '100vw';
                panel.style.height = '100vh';
                panel.style.maxWidth = '100vw';
                panel.style.maxHeight = '100vh';
                panel.style.borderRadius = '0';

                // 内容区域全屏样式
                content.style.maxHeight = 'calc(100vh - 60px)';
                content.style.fontSize = '18px';
                content.style.padding = '32px 32px 48px 32px';

                btn.innerHTML = '⛶';
                btn.title = t('panelExitFullscreen');
                btn.setAttribute('aria-label', t('panelExitFullscreen'));
            } else {
                // 恢复正常模式
                panel.style.top = '50%';
                panel.style.left = '50%';
                panel.style.transform = 'translate(-50%, -50%)';
                panel.style.width = '90%';
                panel.style.height = 'auto';
                panel.style.maxWidth = '800px';
                panel.style.maxHeight = '80vh';
                panel.style.borderRadius = '12px';

                // 内容区域正常样式
                content.style.maxHeight = 'calc(80vh - 60px)';
                content.style.fontSize = '16px';
                content.style.padding = '24px';

                btn.innerHTML = '⛶';
                btn.title = t('panelFullscreen');
                btn.setAttribute('aria-label', t('panelFullscreen'));
            }
        });

        return panel;
    }

    // Show result in panel
    function showResult(content) {
        const panel = document.getElementById('ai-result-panel');
        const panelContent = document.getElementById('panel-content');

        // Clean up markdown code block markers
        let cleanedContent = content
            .replace(/^```markdown\s*/i, '')
            .replace(/^```\s*/m, '')
            .replace(/\s*```$/m, '')
            .trim();

        // Convert markdown to HTML
        const htmlContent = cleanedContent
            // Headers (must be processed before list items)
            .replace(/^### (.*?)$/gm, '<h3 style="margin-top: 20px; margin-bottom: 10px; color: rgb(231, 233, 234); font-size: 18px; font-weight: 600;">$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2 style="margin-top: 24px; margin-bottom: 12px; color: rgb(231, 233, 234); font-size: 20px; font-weight: 700;">$1</h2>')
            .replace(/^# (.*?)$/gm, '<h1 style="margin-top: 28px; margin-bottom: 14px; color: rgb(231, 233, 234); font-size: 24px; font-weight: 700;">$1</h1>')
            // Bold and italic
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color: rgb(139, 213, 255); font-weight: 600;">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em style="color: rgb(255, 212, 121);">$1</em>')
            // Unordered list
            .replace(/^[\-\*]\s+(.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 6px; list-style-type: disc;">$1</li>')
            // Ordered list
            .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 6px; list-style-type: decimal;">$1</li>')
            // Line breaks
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');

        panelContent.innerHTML = htmlContent;
        panel.style.display = 'block';
    }

    // Update summarize button status
    function updateSummarizeButtonStatus(text, isProcessing = false) {
        const button = document.getElementById('ai-summarize-btn');
        if (button) {
            button.innerHTML = text;
            if (isProcessing) {
                button.style.background = 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)';
                button.style.cursor = 'not-allowed';
            } else {
                button.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
                button.style.cursor = 'pointer';
            }
        }
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

    // ==================== AI总结主处理函数 ====================

    // Handle AI summarize
    async function handleAISummarize() {
        if (isSummarizing) {
            alert(t('alertSummarizing'));
            return;
        }

        const apiKey = config.get('aiApiKey');
        if (!apiKey) {
            alert(t('alertNoApiKey'));
            return;
        }

        isSummarizing = true;
        updateSummarizeButtonStatus(t('summarizeButtonLoading'), true);

        try {
            console.log(t('consoleSummarizing'));

            const baseUrl = config.get('aiBaseUrl') || 'https://api.openai.com/v1';
            const model = config.get('aiModel') || 'gpt-3.5-turbo';
            const maxScrollAttempts = parseInt(config.get('scrollAttempts')) || 3;

            let contentToSummarize = null;

            if (isOnTweetDetailPage()) {
                // On tweet detail page: summarize tweet + comments
                const tweet = extractTweetContent();
                if (!tweet) {
                    alert(t('alertNoContent'));
                    return;
                }

                const comments = await extractCommentsWithScroll(maxScrollAttempts);

                contentToSummarize = {
                    type: 'tweet_with_comments',
                    tweet: tweet,
                    comments: comments
                };

            } else if (isOnUserProfilePage()) {
                // On user profile page: summarize user's tweets
                const tweets = await extractUserTweetsWithScroll(maxScrollAttempts);
                if (tweets.length === 0) {
                    alert(t('alertNoContent'));
                    return;
                }

                const username = window.location.pathname.substring(1);
                contentToSummarize = {
                    type: 'user_tweets',
                    username: username,
                    tweets: tweets
                };

            } else {
                alert(t('alertNoContent'));
                return;
            }

            // Call AI API
            const result = await callAISummarize(contentToSummarize, apiKey, baseUrl, model);

            console.log(t('consoleSummarizeSuccess'));
            showResult(result);

        } catch (error) {
            console.error(t('consoleSummarizeFailed'), error);
            alert(`${t('consoleSummarizeFailed')}\n${error.message}`);
        } finally {
            isSummarizing = false;
            updateSummarizeButtonStatus(t('summarizeButtonText'), false);
        }
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

    // Block a single user 暂时没用到
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

    // Block user via API 暂时没用到 有bug 鉴权方式有问题 https://github.com/daymade/Twitter-Block-Porn
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
        const maxScrollAttempts = parseInt(config.get('scrollAttempts')) || 3;

        while (scrollAttempts < maxScrollAttempts) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(1000);

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

            // const success = await blockUserByAPI(username);
            const success = await blockUserByUI(username);

            if (success) {
                blockedCount++;
            } else {
                failedCount++;
            }

            // Wait a while after each block to avoid rate limiting
            await sleep(1000);
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

    // ==================== 初始化 ====================

    // Initialize
    function init() {
        // Create Block button (only on tweet detail page)
        if (!document.getElementById('block-all-commenters-btn') && isOnTweetDetailPage()) {
            createBlockButton();
        }

        // Create AI Summarize button (on tweet detail page or user profile page)
        if (!document.getElementById('ai-summarize-btn') &&
            (isOnTweetDetailPage() || isOnUserProfilePage())) {
            createSummarizeButton();
        }

        // Create result panel (only once)
        if (!document.getElementById('ai-result-panel')) {
            createResultPanel();
        }

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
            // Remove old buttons
            const oldBlockBtn = document.getElementById('block-all-commenters-btn');
            const oldSummarizeBtn = document.getElementById('ai-summarize-btn');
            if (oldBlockBtn) oldBlockBtn.remove();
            if (oldSummarizeBtn) oldSummarizeBtn.remove();
            // Reinitialize
            setTimeout(init, 1000);
        }
    }).observe(document.body, { subtree: true, childList: true });

})();

