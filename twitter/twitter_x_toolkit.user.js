// ==UserScript==
// @name         Twitter X Toolkit
// @name:zh-CN   推特X工具箱
// @namespace    http://tampermonkey.net/
// @version      2.4.0
// @description  A powerful toolkit for Twitter/X: Block commenters, AI summarization, AI comment filtering, and more features to come
// @description:zh-CN  推特X多功能工具箱：一键屏蔽评论者、AI智能总结、AI评论过滤等，未来将持续扩展更多功能
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
    let blockedUsers = [];
    let failedUsers = [];
    let isSummarizing = false;

    // Internationalization (i18n) text dictionary
    const i18n = {
        en: {
            // Toolbar相关
            toolbarMainButton: 'Twitter X Toolkit',

            // Block功能相关
            buttonText: '🚫 Block All Commenters',
            buttonProcessing: '🔄 Processing...',
            buttonLoading: '🔄 Loading comments...',
            alertProcessing: 'Blocking operation is in progress, please wait...',
            alertNotDetailPage: 'Please use this feature on a tweet detail page!',
            confirmBlock: 'Are you sure you want to block commenters under this tweet?\n\nIf keywords are configured, only commenters whose comments contain those keywords will be blocked.\n\nWarning: This action is irreversible, please use with caution!',
            alertNoCommenters: 'No commenters found matching the criteria!',
            alertComplete: 'Blocking operation completed!\n\nSuccessful ({success}): {successList}\n\nFailed ({failed}): {failedList}\n\nTotal: {total}',
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
            configScrollAttemptsHelp: 'Maximum scroll attempts for loading content (blocking/AI summarization, default: 5)',
            configBlockKeywordsLabel: 'Block Keywords',
            configBlockKeywordsHelp: 'Only block commenters whose comments contain these keywords (one per line). Leave empty to block all.',
            configAutoBlockLabel: 'Auto Block',
            configAutoBlockHelp: 'Automatically block commenters with keywords when opening tweet detail page (runs in background)',
            consoleKeywordMatched: 'Keyword matched [{keyword}] for @{username}: {text}',
            consoleKeywordSkipped: 'Skipped @{username}: no keywords matched',
            consoleAutoBlockStart: 'Auto-block started in background...',
            consoleAutoBlockComplete: 'Auto-block completed: {success} blocked, {failed} failed',

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
            consoleSummarizeFailed: 'AI summarization failed:',

            // AI过滤功能相关
            configAiFilterEnabledLabel: 'AI Comment Filter',
            configAiFilterEnabledHelp: 'Use AI to automatically filter spam and blacklist comments',
            configAiFilterPromptLabel: 'AI Filter Prompt',
            configAiFilterPromptHelp: 'Custom prompt for AI comment classification (leave empty for default)',
            consoleAiFilterStart: 'AI comment filtering started...',
            consoleAiFilterProgress: 'AI filtering: {current}/{total} comments processed',
            consoleAiFilterComplete: 'AI filtering completed: {blacklist} blacklisted, {spam} spam, {normal} normal',
            consoleAiFilterBlacklist: '🚫 Blacklisted @{username}: {reason}',
            consoleAiFilterSpam: '⚠️ Spam detected @{username}: {reason}',
            consoleAiFilterNormal: '✅ Normal comment @{username}',
            consoleAiFilterError: '❌ AI filtering error: {error}',
            spamCommentLabel: '⚠️ Spam Comment',
            spamCommentShow: 'Show',
            spamCommentHide: 'Hide',
            aiFilterStatusProcessing: '🤖 AI Filtering: {current}/{total}',
            aiFilterStatusComplete: '✅ AI Filter Complete',
            aiFilterButtonText: '🔍 AI Filter Comments',
            aiFilterButtonLoading: '🔄 AI Filtering...',
            alertAiFilterInProgress: 'AI filtering is in progress, please wait...',
            alertShowAllSpam: 'Show all hidden spam comments?',
            buttonShowAllSpam: '👁️ Show All Spam'
        },
        zh: {
            // Toolbar相关
            toolbarMainButton: '推特X工具箱',

            // Block功能相关
            buttonText: '🚫 屏蔽所有评论者',
            buttonProcessing: '🔄 正在处理...',
            buttonLoading: '🔄 加载评论中...',
            alertProcessing: '正在执行屏蔽操作，请稍候...',
            alertNotDetailPage: '请在推文详情页使用此功能！',
            confirmBlock: '确定要屏蔽这条推文下的评论者吗？\n\n如果配置了关键词，则只屏蔽评论中包含这些关键词的用户。\n\n注意：此操作不可撤销，请谨慎使用！',
            alertNoCommenters: '未找到符合条件的评论者！',
            alertComplete: '屏蔽操作完成！\n\n成功 ({success})：{successList}\n\n失败 ({failed})：{failedList}\n\n总计：{total}',
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
            configScrollAttemptsHelp: '加载内容的最大滚动尝试次数（用于屏蔽和AI总结，默认：5）',
            configBlockKeywordsLabel: '拉黑关键词',
            configBlockKeywordsHelp: '只拉黑评论中包含这些关键词的用户（每行一个）。留空则拉黑所有评论者。',
            configAutoBlockLabel: '自动拉黑',
            configAutoBlockHelp: '打开推文详情页时，自动在后台根据关键词拉黑评论者（需配置关键词）',
            consoleKeywordMatched: '关键词匹配 [{keyword}] @{username}: {text}',
            consoleKeywordSkipped: '跳过 @{username}: 未匹配关键词',
            consoleAutoBlockStart: '后台自动拉黑已启动...',
            consoleAutoBlockComplete: '自动拉黑完成：成功 {success} 个，失败 {failed} 个',

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
            consoleSummarizeFailed: 'AI总结失败:',

            // AI过滤功能相关
            configAiFilterEnabledLabel: 'AI评论过滤',
            configAiFilterEnabledHelp: '使用AI自动过滤垃圾评论和黑名单评论',
            configAiFilterPromptLabel: 'AI过滤提示词',
            configAiFilterPromptHelp: '自定义AI评论分类的提示词（留空使用默认）',
            consoleAiFilterStart: 'AI评论过滤已启动...',
            consoleAiFilterProgress: 'AI过滤中：已处理 {current}/{total} 条评论',
            consoleAiFilterComplete: 'AI过滤完成：黑名单 {blacklist} 条，垃圾 {spam} 条，正常 {normal} 条',
            consoleAiFilterBlacklist: '🚫 拉黑 @{username}：{reason}',
            consoleAiFilterSpam: '⚠️ 垃圾评论 @{username}：{reason}',
            consoleAiFilterNormal: '✅ 正常评论 @{username}',
            consoleAiFilterError: '❌ AI过滤错误：{error}',
            spamCommentLabel: '⚠️ 垃圾评论',
            spamCommentShow: '显示',
            spamCommentHide: '隐藏',
            aiFilterStatusProcessing: '🤖 AI过滤中：{current}/{total}',
            aiFilterStatusComplete: '✅ AI过滤完成',
            aiFilterButtonText: '🔍 AI过滤评论',
            aiFilterButtonLoading: '🔄 AI过滤中...',
            alertAiFilterInProgress: 'AI过滤正在进行中，请稍候...',
            alertShowAllSpam: '显示所有被隐藏的垃圾评论？',
            buttonShowAllSpam: '👁️ 显示所有垃圾评论'
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
        scrollAttempts: 5,
        blockKeywords: '有弟弟线下吗\n有万达广场附近的吗\n蹲一个男搭子\n线下蹲个弟弟\n主人快来领我\n有哥哥线下吗',
        autoBlock: false,
        // AI总结功能配置
        aiBaseUrl: 'https://api.openai.com/v1',
        aiApiKey: '',
        aiModel: 'gpt-3.5-turbo',
        // AI过滤功能配置
        aiFilterEnabled: false,
        aiFilterPrompt: ''
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
        {
            key: 'blockKeywords',
            label: t('configBlockKeywordsLabel'),
            type: 'textarea',
            placeholder: '主人\n线下蹲个弟弟\n有线下吗',
            help: t('configBlockKeywordsHelp')
        },
        {
            key: 'autoBlock',
            label: t('configAutoBlockLabel'),
            type: 'checkbox',
            help: t('configAutoBlockHelp')
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
        },
        // AI过滤功能配置项
        {
            key: 'aiFilterEnabled',
            label: t('configAiFilterEnabledLabel'),
            type: 'checkbox',
            help: t('configAiFilterEnabledHelp')
        },
        {
            key: 'aiFilterPrompt',
            label: t('configAiFilterPromptLabel'),
            type: 'textarea',
            placeholder: '',
            help: t('configAiFilterPromptHelp')
        }
    ]);

    // Restructure config panel: put checkbox items side by side
    function restructureConfigPanel() {
        const content = document.querySelector('#TwitterXToolkit-config-panel .config-content');
        if (!content) return;

        const checkboxGroups = Array.from(content.querySelectorAll('.config-form-group'))
            .filter(g => g.querySelector('input[type="checkbox"]'));
        if (checkboxGroups.length < 2) return;

        // Fix internal layout of each checkbox group: [checkbox] [label] on one row
        checkboxGroups.forEach(group => {
            const label = group.querySelector('.config-label');
            const input = group.querySelector('input[type="checkbox"]');
            const help = group.querySelector('.config-help');

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';
            input.style.cssText = 'width:auto;margin:0;cursor:pointer;flex-shrink:0;';
            label.style.cssText = 'margin:0;cursor:pointer;font-weight:500;';
            row.appendChild(input);
            row.appendChild(label);

            // Rebuild group: row + help
            group.innerHTML = '';
            group.appendChild(row);
            if (help) {
                help.style.marginLeft = '24px';
                group.appendChild(help);
            }
            group.style.cssText = 'flex:1;margin-bottom:0;';
        });

        // Wrap all checkbox groups in a single flex row
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;gap:16px;margin-bottom:20px;';
        content.insertBefore(wrapper, checkboxGroups[0]);
        checkboxGroups.forEach(g => wrapper.appendChild(g));
    }

    restructureConfigPanel();

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

    // ==================== AI评论过滤 ====================

    /**
     * 使用AI对评论进行分类
     * @param {Array} comments - 评论数组 [{username, text}, ...]
     * @returns {Promise<Array>} - 分类结果 [{username, category, reason}, ...]
     *   category: 'blacklist' | 'spam' | 'normal'
     */
    async function classifyCommentsByAI(comments) {
        return new Promise((resolve, reject) => {
            const baseUrl = config.get('aiBaseUrl') || 'https://api.openai.com/v1';
            const apiKey = config.get('aiApiKey');
            const model = config.get('aiModel') || 'gpt-3.5-turbo';
            const customPrompt = config.get('aiFilterPrompt') || '';

            if (!apiKey) {
                reject(new Error(t('alertNoApiKey')));
                return;
            }

            // 默认提示词
            const defaultPrompt = `你是一个专业的社交媒体内容审核助手。请对以下推特评论进行分类，判断每条评论是否为垃圾评论或黑名单评论。

分类标准：
1. **blacklist（黑名单）**：包含以下特征的评论
   - 色情、约炮、线下见面等性暗示内容
   - 诈骗、钓鱼、恶意链接
   - 严重人身攻击、辱骂、威胁
   - 极端政治煽动、仇恨言论
   - 明显的机器人刷屏

2. **spam（垃圾评论）**：包含以下特征的评论
   - 无意义的重复内容
   - 过度营销、广告推广
   - 与主题完全无关的内容
   - 低质量的灌水评论
   - 可疑的引流行为

3. **normal（正常评论）**：不符合以上两类的评论
   - 正常的讨论、观点表达
   - 合理的批评或赞同
   - 相关的提问或回复

请以JSON数组格式返回结果，每个元素包含：username（用户名）、category（分类）、reason（简短理由，10字以内）

评论列表：
${comments.map((c, i) => `${i + 1}. @${c.username}: ${c.text.substring(0, 200)}`).join('\n')}

返回格式示例：
[
  {"username": "user1", "category": "blacklist", "reason": "色情内容"},
  {"username": "user2", "category": "spam", "reason": "无关广告"},
  {"username": "user3", "category": "normal", "reason": "正常讨论"}
]

请只返回JSON数组，不要包含其他文字说明。`;

            const prompt = customPrompt || defaultPrompt;

            const requestData = {
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3, // 降低温度以获得更一致的分类结果
                max_tokens: 4000
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
                        console.log(`AI Filter Request: ${JSON.stringify(requestData)}`);
                        console.log(`AI Filter Response: ${response.responseText}`);

                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const content = data.choices?.[0]?.message?.content || '[]';

                            // 尝试解析JSON结果
                            let result;
                            try {
                                // 移除可能的markdown代码块标记
                                const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                                result = JSON.parse(cleanContent);
                            } catch (e) {
                                console.error('Failed to parse AI response as JSON:', e);
                                // 如果解析失败，返回空数组
                                result = [];
                            }

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

    /**
     * 标记评论为垃圾评论或黑名单评论
     * @param {string} username - 用户名
     * @param {string} category - 分类 ('blacklist' | 'spam')
     * @param {string} reason - 理由
     */
    function markCommentByCategory(username, category, reason) {
        // 查找该用户的所有评论
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach(article => {
            // 查找用户名链接
            const userLinks = article.querySelectorAll('a[href^="/"][role="link"]');
            let isTargetUser = false;

            userLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href === `/${username}`) {
                    isTargetUser = true;
                }
            });

            if (!isTargetUser) return;

            // 避免重复标记
            if (article.hasAttribute('data-ai-filtered')) return;
            article.setAttribute('data-ai-filtered', category);

            if (category === 'blacklist') {
                // 黑名单评论：直接隐藏
                article.style.display = 'none';
                article.setAttribute('data-blacklist-reason', reason);
            } else if (category === 'spam') {
                // 垃圾评论：添加遮罩和显示按钮
                article.style.position = 'relative';

                // 创建遮罩层
                const overlay = document.createElement('div');
                overlay.className = 'ai-spam-overlay';
                overlay.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                `;

                // 创建标签
                const label = document.createElement('div');
                label.style.cssText = `
                    color: #ff9800;
                    font-size: 16px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                `;
                label.textContent = t('spamCommentLabel');

                // 创建理由
                const reasonText = document.createElement('div');
                reasonText.style.cssText = `
                    color: #ccc;
                    font-size: 12px;
                `;
                reasonText.textContent = reason;

                // 创建显示按钮
                const showButton = document.createElement('button');
                showButton.style.cssText = `
                    padding: 6px 16px;
                    background: #1DA1F2;
                    color: white;
                    border: none;
                    border-radius: 20px;
                    cursor: pointer;
                    font-size: 14px;
                    margin-top: 8px;
                    transition: all 0.2s ease;
                `;
                showButton.textContent = t('spamCommentShow');

                // 鼠标悬停效果
                showButton.addEventListener('mouseenter', () => {
                    showButton.style.background = '#0d8bd9';
                    showButton.style.transform = 'scale(1.05)';
                });
                showButton.addEventListener('mouseleave', () => {
                    showButton.style.background = '#1DA1F2';
                    showButton.style.transform = 'scale(1)';
                });

                // 点击显示评论
                overlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    overlay.style.display = 'none';
                    article.removeAttribute('data-ai-filtered');
                });

                overlay.appendChild(label);
                overlay.appendChild(reasonText);
                overlay.appendChild(showButton);
                article.appendChild(overlay);
            }
        });
    }

    /**
     * 处理AI过滤结果
     * @param {Array} results - AI分类结果
     */
    async function processAIFilterResults(results) {
        let blacklistCount = 0;
        let spamCount = 0;
        let normalCount = 0;

        for (const result of results) {
            const { username, category, reason } = result;

            if (category === 'blacklist') {
                blacklistCount++;
                console.log(t('consoleAiFilterBlacklist', { username, reason }));

                // 标记为黑名单并隐藏
                markCommentByCategory(username, 'blacklist', reason);

                // 自动拉黑用户
                await blockUserByAPI(username);
                await sleep(500); // 避免频率限制

            } else if (category === 'spam') {
                spamCount++;
                console.log(t('consoleAiFilterSpam', { username, reason }));

                // 标记为垃圾评论
                markCommentByCategory(username, 'spam', reason);

            } else {
                normalCount++;
                console.log(t('consoleAiFilterNormal', { username }));
            }
        }

        console.log(t('consoleAiFilterComplete', {
            blacklist: blacklistCount,
            spam: spamCount,
            normal: normalCount
        }));

        return { blacklistCount, spamCount, normalCount };
    }

    /**
     * 创建AI过滤状态指示器
     */
    function createAIFilterStatusIndicator() {
        // 移除旧的指示器
        const oldIndicator = document.getElementById('ai-filter-status');
        if (oldIndicator) oldIndicator.remove();

        const indicator = document.createElement('div');
        indicator.id = 'ai-filter-status';
        indicator.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            z-index: 99998;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.3s ease;
            opacity: 0;
            transform: translateX(100px);
        `;

        document.body.appendChild(indicator);

        // 动画显示
        setTimeout(() => {
            indicator.style.opacity = '1';
            indicator.style.transform = 'translateX(0)';
        }, 100);

        return indicator;
    }

    /**
     * 更新AI过滤状态
     * @param {string} status - 状态文本
     * @param {boolean} isComplete - 是否完成
     */
    function updateAIFilterStatus(status, isComplete = false) {
        let indicator = document.getElementById('ai-filter-status');

        if (!indicator) {
            indicator = createAIFilterStatusIndicator();
        }

        indicator.textContent = status;

        // 如果完成，3秒后自动隐藏
        if (isComplete) {
            indicator.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
            setTimeout(() => {
                indicator.style.opacity = '0';
                indicator.style.transform = 'translateX(100px)';
                setTimeout(() => indicator.remove(), 300);
            }, 3000);
        }
    }

    // ==================== UI控制 ====================

    // Create block button
    // Create floating toolbar with draggable functionality
    function createFloatingToolbar() {
        // Load saved position
        const savedPosition = {
            x: GM_getValue('toolbar_position_x', window.innerWidth - 80),
            y: GM_getValue('toolbar_position_y', window.innerHeight - 80)
        };

        // Create container
        const container = document.createElement('div');
        container.id = 'x-toolkit-toolbar';
        container.style.cssText = `
            position: fixed;
            left: ${savedPosition.x}px;
            top: ${savedPosition.y}px;
            z-index: 99999;
            display: flex;
            flex-direction: column-reverse;
            align-items: center;
            gap: 8px;
        `;

        // Create main button (always visible)
        const mainButton = document.createElement('button');
        mainButton.id = 'x-toolkit-main-btn';
        mainButton.innerHTML = '🛠️';
        mainButton.title = t('toolbarMainButton') || 'Twitter X Toolkit';
        mainButton.style.cssText = `
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, #1DA1F2 0%, #0d8bd9 100%);
            color: white;
            border: none;
            border-radius: 50%;
            cursor: move;
            font-size: 24px;
            box-shadow: 0 4px 12px rgba(29, 161, 242, 0.4);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // Create action buttons container (hidden by default)
        const actionsContainer = document.createElement('div');
        actionsContainer.id = 'x-toolkit-actions';
        actionsContainer.style.cssText = `
            display: flex;
            flex-direction: column-reverse;
            align-items: center;
            gap: 8px;
            opacity: 0;
            transform: translateY(10px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
        `;

        // Create action buttons based on page type
        const isOnTweetPage = isOnTweetDetailPage();
        const isOnUserPage = isOnUserProfilePage();

        if (isOnTweetPage) {
            // Block commenters button (only on tweet page)
            const blockButton = document.createElement('button');
            blockButton.id = 'block-all-commenters-btn';
            blockButton.innerHTML = '🚫';
            blockButton.title = t('buttonText');
            blockButton.style.cssText = getActionButtonStyle('#667eea', '#764ba2');
            blockButton.addEventListener('click', handleBlockAllCommenters);
            blockButton.addEventListener('mouseenter', function () {
                if (!isBlocking) {
                    this.style.transform = 'scale(1.1)';
                    this.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
                }
            });
            blockButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
            });
            actionsContainer.appendChild(blockButton);
        }

        if (isOnTweetPage || isOnUserPage) {
            // AI summarize button
            const summarizeButton = document.createElement('button');
            summarizeButton.id = 'ai-summarize-btn';
            summarizeButton.innerHTML = '🤖';
            summarizeButton.title = t('summarizeButtonText');
            summarizeButton.style.cssText = getActionButtonStyle('#f093fb', '#f5576c');
            summarizeButton.addEventListener('click', handleAISummarize);
            summarizeButton.addEventListener('mouseenter', function () {
                if (!isSummarizing) {
                    this.style.transform = 'scale(1.1)';
                    this.style.boxShadow = '0 6px 16px rgba(240, 147, 251, 0.5)';
                }
            });
            summarizeButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 4px 12px rgba(240, 147, 251, 0.4)';
            });
            actionsContainer.appendChild(summarizeButton);
        }

        if (isOnTweetPage) {
            // AI filter button (only on tweet page)
            const aiFilterButton = document.createElement('button');
            aiFilterButton.id = 'ai-filter-btn';
            aiFilterButton.innerHTML = '🔍';
            aiFilterButton.title = t('aiFilterButtonText');
            aiFilterButton.style.cssText = getActionButtonStyle('#11998e', '#38ef7d');
            aiFilterButton.addEventListener('click', handleManualAIFilter);
            aiFilterButton.addEventListener('mouseenter', function () {
                if (!aiFilterInProgress) {
                    this.style.transform = 'scale(1.1)';
                    this.style.boxShadow = '0 6px 16px rgba(17, 153, 142, 0.5)';
                }
            });
            aiFilterButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 4px 12px rgba(17, 153, 142, 0.4)';
            });
            actionsContainer.appendChild(aiFilterButton);

            // Show all spam button
            const showSpamButton = document.createElement('button');
            showSpamButton.id = 'show-all-spam-btn';
            showSpamButton.innerHTML = '👁️';
            showSpamButton.title = t('buttonShowAllSpam');
            showSpamButton.style.cssText = getActionButtonStyle('#fa709a', '#fee140');
            showSpamButton.addEventListener('click', handleShowAllSpam);
            showSpamButton.addEventListener('mouseenter', function () {
                this.style.transform = 'scale(1.1)';
                this.style.boxShadow = '0 6px 16px rgba(250, 112, 154, 0.5)';
            });
            showSpamButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 4px 12px rgba(250, 112, 154, 0.4)';
            });
            actionsContainer.appendChild(showSpamButton);
        }

        // Settings button
        const settingsButton = document.createElement('button');
        settingsButton.id = 'x-toolkit-settings-btn';
        settingsButton.innerHTML = '⚙️';
        settingsButton.title = t('configPanelTitle') || 'Settings';
        settingsButton.style.cssText = getActionButtonStyle('#536471', '#657786');
        settingsButton.addEventListener('click', () => config.show());
        settingsButton.addEventListener('mouseenter', function () {
            this.style.transform = 'scale(1.1)';
            this.style.boxShadow = '0 6px 16px rgba(83, 100, 113, 0.5)';
        });
        settingsButton.addEventListener('mouseleave', function () {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 4px 12px rgba(83, 100, 113, 0.4)';
        });
        actionsContainer.appendChild(settingsButton);

        // Assemble
        container.appendChild(mainButton);
        container.appendChild(actionsContainer);

        // Hover to expand
        let hoverTimeout;
        container.addEventListener('mouseenter', () => {
            clearTimeout(hoverTimeout);
            actionsContainer.style.opacity = '1';
            actionsContainer.style.transform = 'translateY(0)';
            actionsContainer.style.pointerEvents = 'auto';
        });

        container.addEventListener('mouseleave', () => {
            hoverTimeout = setTimeout(() => {
                actionsContainer.style.opacity = '0';
                actionsContainer.style.transform = 'translateY(10px)';
                actionsContainer.style.pointerEvents = 'none';
            }, 300);
        });

        // Dragging functionality
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        mainButton.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragOffset.x = e.clientX - container.offsetLeft;
            dragOffset.y = e.clientY - container.offsetTop;
            mainButton.style.cursor = 'grabbing';
            container.style.transition = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            let newX = e.clientX - dragOffset.x;
            let newY = e.clientY - dragOffset.y;

            // Constrain within viewport
            const maxX = window.innerWidth - 56;
            const maxY = window.innerHeight - 56;
            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            container.style.left = newX + 'px';
            container.style.top = newY + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                mainButton.style.cursor = 'move';
                container.style.transition = '';

                // Save position
                GM_setValue('toolbar_position_x', parseInt(container.style.left));
                GM_setValue('toolbar_position_y', parseInt(container.style.top));
            }
        });

        // Main button hover effect
        mainButton.addEventListener('mouseenter', function () {
            if (!isDragging) {
                this.style.transform = 'scale(1.1)';
                this.style.boxShadow = '0 6px 16px rgba(29, 161, 242, 0.6)';
            }
        });

        mainButton.addEventListener('mouseleave', function () {
            if (!isDragging) {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 4px 12px rgba(29, 161, 242, 0.4)';
            }
        });

        document.body.appendChild(container);
        return container;
    }

    // Helper function to get action button style
    function getActionButtonStyle(colorStart, colorEnd) {
        return `
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, ${colorStart} 0%, ${colorEnd} 100%);
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
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
            <div id="panel-content" style="padding: 16px 20px; overflow-y: auto; overflow-x: hidden; max-height: calc(80vh - 60px); line-height: 1.5; color: rgb(231, 233, 234); user-select: text; -webkit-user-select: text; cursor: text; box-sizing: border-box;"></div>
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
                content.style.padding = '20px 24px 32px 24px';
                content.style.lineHeight = '1.5';

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
                content.style.padding = '16px 20px';
                content.style.lineHeight = '1.5';

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
            .replace(/^### (.*?)$/gm, '<h3 style="margin-top: 4px; margin-bottom: 2px; color: rgb(231, 233, 234); font-size: 18px; font-weight: 600;">$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2 style="margin-top: 6px; margin-bottom: 3px; color: rgb(231, 233, 234); font-size: 20px; font-weight: 700;">$1</h2>')
            .replace(/^# (.*?)$/gm, '<h1 style="margin-top: 8px; margin-bottom: 4px; color: rgb(231, 233, 234); font-size: 24px; font-weight: 700;">$1</h1>')
            // Bold and italic
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color: rgb(139, 213, 255); font-weight: 600;">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em style="color: rgb(255, 212, 121);">$1</em>')
            // Unordered list
            .replace(/^[\-\*]\s+(.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 2px; list-style-type: disc;">$1</li>')
            // Ordered list
            .replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-left: 20px; margin-bottom: 2px; list-style-type: decimal;">$1</li>')
            // Line breaks (减少段落间距)
            .replace(/\n\n/g, '<br>')
            .replace(/\n/g, '<br>');

        panelContent.innerHTML = htmlContent;

        // 移除第一个标题的上边距，使内容更紧凑
        const firstHeading = panelContent.querySelector('h1, h2, h3');
        if (firstHeading) {
            firstHeading.style.marginTop = '0';
        }

        panel.style.display = 'block';
    }

    // Update summarize button status
    function updateSummarizeButtonStatus(text, isProcessing = false) {
        const button = document.getElementById('ai-summarize-btn');
        if (button) {
            if (isProcessing) {
                button.innerHTML = '🔄';
                button.title = text;
                button.style.background = 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)';
                button.style.cursor = 'not-allowed';
                button.disabled = true;
            } else {
                button.innerHTML = '🤖';
                button.title = t('summarizeButtonText');
                button.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
                button.style.cursor = 'pointer';
                button.disabled = false;
            }
        }
    }

    // Update button status
    function updateButtonStatus(text, isProcessing = false) {
        const button = document.getElementById('block-all-commenters-btn');
        if (button) {
            if (isProcessing) {
                button.innerHTML = '🔄';
                button.title = text;
                button.style.background = 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)';
                button.style.cursor = 'not-allowed';
                button.disabled = true;
            } else {
                button.innerHTML = '🚫';
                button.title = t('buttonText');
                button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                button.style.cursor = 'pointer';
                button.disabled = false;
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

    // Get all commenters with their comment text
    function getAllCommentersWithText() {
        const commentersMap = new Map(); // username -> comment text
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
            let username = null;

            userLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.match(/^\/[^\/]+$/)) {
                    const user = href.substring(1);
                    if (user &&
                        user !== 'home' &&
                        user !== 'explore' &&
                        user !== 'notifications' &&
                        user !== 'messages' &&
                        (!excludeOriginal || user !== originalPoster)) {
                        username = user;
                    }
                }
            });

            // Get comment text
            if (username) {
                const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
                const tweetText = tweetTextElement ? tweetTextElement.innerText : '';

                // Store username and text (append if user has multiple comments)
                if (commentersMap.has(username)) {
                    commentersMap.set(username, commentersMap.get(username) + '\n' + tweetText);
                } else {
                    commentersMap.set(username, tweetText);
                }
            }
        });

        return commentersMap;
    }

    // Get all commenters (legacy function for backward compatibility)
    function getAllCommenters() {
        const commentersMap = getAllCommentersWithText();
        return Array.from(commentersMap.keys());
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

    // Block user via API (后台拉黑，无UI干扰)
    async function blockUserByAPI(username) {
        try {
            console.log(t('consoleTryBlockAPI', { username }));

            // 从页面中获取用户ID（避免额外的API请求）
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            let userId = null;

            for (const article of articles) {
                const userLink = article.querySelector(`a[href="/${username}"]`);
                if (userLink) {
                    // 尝试从article的data属性或其他地方获取userId
                    // 如果无法直接获取，则从用户链接的父元素中查找
                    const timeLink = article.querySelector('a[href*="/status/"]');
                    if (timeLink) {
                        const href = timeLink.getAttribute('href');
                        const match = href.match(/\/status\/(\d+)/);
                        if (match) {
                            // 通过推文ID反查用户ID（需要额外请求）
                            // 更简单的方法：直接使用用户名查询
                            break;
                        }
                    }
                }
            }

            // 获取CSRF token
            const csrfToken = document.cookie.match(/ct0=([^;]+)/)?.[1];
            if (!csrfToken) {
                throw new Error('Failed to get CSRF token');
            }

            // 先通过用户名获取用户ID
            const userInfoResponse = await fetch(`https://x.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${encodeURIComponent(JSON.stringify({
                screen_name: username,
                withSafetyModeUserFields: true
            }))}&features=${encodeURIComponent(JSON.stringify({
                hidden_profile_subscriptions_enabled: true,
                rweb_tipjar_consumption_enabled: true,
                responsive_web_graphql_exclude_directive_enabled: true,
                verified_phone_label_enabled: false,
                subscriptions_verification_info_is_identity_verified_enabled: true,
                subscriptions_verification_info_verified_since_enabled: true,
                highlights_tweets_tab_ui_enabled: true,
                responsive_web_twitter_article_notes_tab_enabled: true,
                subscriptions_feature_can_gift_premium: true,
                creator_subscriptions_tweet_preview_api_enabled: true,
                responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                responsive_web_graphql_timeline_navigation_enabled: true
            }))}`, {
                method: 'GET',
                headers: {
                    'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                    'x-csrf-token': csrfToken,
                    'x-twitter-auth-type': 'OAuth2Session',
                    'x-twitter-active-user': 'yes',
                    'x-twitter-client-language': 'en'
                },
                credentials: 'include'
            });

            if (!userInfoResponse.ok) {
                throw new Error('Failed to get user info');
            }

            const userInfoData = await userInfoResponse.json();
            userId = userInfoData.data?.user?.result?.rest_id;

            if (!userId) {
                throw new Error('Failed to get user ID');
            }

            // 执行拉黑
            const blockResponse = await fetch(`https://x.com/i/api/1.1/blocks/create.json`, {
                method: 'POST',
                headers: {
                    'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                    'x-csrf-token': csrfToken,
                    'x-twitter-auth-type': 'OAuth2Session',
                    'x-twitter-active-user': 'yes',
                    'x-twitter-client-language': 'en',
                    'content-type': 'application/x-www-form-urlencoded'
                },
                body: `user_id=${userId}`,
                credentials: 'include'
            });

            if (blockResponse.ok) {
                console.log(t('consoleBlockSuccess', { username }));
                return true;
            } else {
                const errorText = await blockResponse.text();
                throw new Error(`Block request failed: ${blockResponse.status} ${errorText}`);
            }
        } catch (error) {
            console.error(t('consoleBlockFailed', { username }), error);
            return false;
        }
    }

    // Block user by clicking UI elements
    // silent=true: skip scrolling (for auto-block, avoids disrupting user's scroll position)
    async function blockUserByUI(username, silent = false) {
        try {
            console.log(t('consoleTryBlockUI', { username }));

            const originalScrollY = window.scrollY;

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

            // Only scroll to bottom in manual mode (keeps UI operations out of view)
            if (!silent) {
                window.scrollTo(0, document.body.scrollHeight);
                await sleep(100);
            }

            const restoreScroll = () => {
                if (!silent) window.scrollTo(0, originalScrollY);
            };

            // Find and click the more options button (three dots)
            const moreButton = targetArticle.querySelector('[data-testid="caret"]');
            if (!moreButton) {
                console.log(t('consoleNotFoundButton', { username }));
                restoreScroll();
                return false;
            }

            moreButton.click();
            await sleep(300);

            // Find and click the block button
            const blockMenuItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
                item => item.textContent.includes('Block') || item.textContent.includes('屏蔽') || item.textContent.includes('封鎖')
            );

            if (!blockMenuItem) {
                console.log(t('consoleNotFoundMenuItem'));
                document.body.click();
                restoreScroll();
                return false;
            }

            blockMenuItem.click();
            await sleep(300);

            // Confirm block
            const confirmButton = Array.from(document.querySelectorAll('[data-testid="confirmationSheetConfirm"]')).find(
                btn => btn.textContent.includes('Block') || btn.textContent.includes('屏蔽') || btn.textContent.includes('封鎖')
            );

            if (confirmButton) {
                confirmButton.click();
                await sleep(500);
                console.log(t('consoleBlockSuccess', { username }));
                restoreScroll();
                return true;
            } else {
                console.log(t('consoleNotFoundConfirm'));
                restoreScroll();
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

        const keywordsRaw = config.get('blockKeywords') || '';
        const keywords = keywordsRaw.split('\n').map(k => k.trim()).filter(k => k.length > 0);
        const keywordsDisplay = keywords.length > 0 ? keywords.join(', ') : (currentLang === 'zh' ? '（未设置，将拉黑所有评论者）' : '(none set, will block all commenters)');
        const confirmMsg = t('confirmBlock') + '\n\n' + (currentLang === 'zh' ? `关键词：${keywordsDisplay}` : `Keywords: ${keywordsDisplay}`);
        const confirmed = confirm(confirmMsg);
        if (!confirmed) {
            return;
        }

        isBlocking = true;
        blockedCount = 0;
        failedCount = 0;
        blockedUsers = [];
        failedUsers = [];
        updateButtonStatus(t('buttonProcessing'), true);

        // Scroll to load more comments
        console.log(t('consoleLoading'));
        updateButtonStatus(t('buttonLoading'), true);

        let previousHeight = 0;
        let stableCount = 0;
        let totalScrolls = 0;
        const maxScrollAttempts = parseInt(config.get('scrollAttempts')) || 5;

        // Stop when height stable for 2 consecutive scrolls OR max scrolls reached
        while (stableCount < 2 && totalScrolls < maxScrollAttempts) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(800);
            totalScrolls++;

            const currentHeight = document.body.scrollHeight;
            if (currentHeight === previousHeight) {
                stableCount++;
            } else {
                stableCount = 0;
            }
            previousHeight = currentHeight;
        }

        console.log(t('consoleLoadComplete'));

        const commentersMap = getAllCommentersWithText();

        // Filter commenters by keywords (if keywords are set, reuse parsed keywords from confirm step)
        let commenters;
        if (keywords.length > 0) {
            commenters = [];
            for (const [username, text] of commentersMap) {
                const matchedKeyword = keywords.find(kw => text.includes(kw));
                if (matchedKeyword) {
                    console.log(t('consoleKeywordMatched', { keyword: matchedKeyword, username, text: text.substring(0, 50) }));
                    commenters.push(username);
                } else {
                    console.log(t('consoleKeywordSkipped', { username }));
                }
            }
        } else {
            commenters = Array.from(commentersMap.keys());
        }

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

            // 先尝试API后台拉黑，失败则降级到UI操作
            const success = await blockUserByAPI(username) || await blockUserByUI(username);

            if (success) {
                blockedCount++;
                blockedUsers.push(username);
            } else {
                failedCount++;
                failedUsers.push(username);
            }

            // Wait a while after each block to avoid rate limiting
            await sleep(1000);
        }

        isBlocking = false;
        updateButtonStatus(t('buttonText'), false);

        const successList = blockedUsers.length > 0 ? blockedUsers.map(u => '@' + u).join(', ') : 'None';
        const failedList = failedUsers.length > 0 ? failedUsers.map(u => '@' + u).join(', ') : 'None';

        alert(t('alertComplete', {
            success: blockedCount,
            failed: failedCount,
            total: commenters.length,
            successList: successList,
            failedList: failedList
        }));

        console.log(t('consoleComplete'));
        console.log(t('consoleSuccess', { count: blockedCount }));
        console.log(t('consoleFailed', { count: failedCount }));
        console.log(t('consoleTotal', { count: commenters.length }));
    }

    // ==================== 自动拉黑 ====================

    let autoBlockProcessed = new Set(); // Track processed users to avoid duplicates

    // Auto block in background (no scrolling, no confirm dialog, no alert)
    async function autoBlockCommenters() {
        if (isBlocking) return;
        if (!isOnTweetDetailPage()) return;

        const keywordsRaw = config.get('blockKeywords') || '';
        const keywords = keywordsRaw.split('\n').map(k => k.trim()).filter(k => k.length > 0);
        if (keywords.length === 0) return; // auto block requires keywords

        console.log(t('consoleAutoBlockStart'));

        // Process currently visible comments without scrolling
        await processCurrentComments(keywords);

        // Watch for new comments using MutationObserver
        const observer = new MutationObserver(() => {
            if (!isBlocking && isOnTweetDetailPage()) {
                processCurrentComments(keywords);
            }
        });

        // Observe new tweets/comments being added
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Stop observing after 60 seconds to avoid memory leak
        setTimeout(() => observer.disconnect(), 60000);
    }

    // Process currently visible comments
    async function processCurrentComments(keywords) {
        if (isBlocking) return;
        if (!isOnTweetDetailPage()) return; // Only run on tweet detail pages

        isBlocking = true;

        const commentersMap = getAllCommentersWithText();
        const toBlock = [];

        for (const [username, text] of commentersMap) {
            if (autoBlockProcessed.has(username)) continue; // Skip already processed

            const matchedKeyword = keywords.find(kw => text.includes(kw));
            if (matchedKeyword) {
                console.log(t('consoleKeywordMatched', { keyword: matchedKeyword, username, text: text.substring(0, 50) }));
                toBlock.push(username);
                autoBlockProcessed.add(username);
            }
        }

        let autoBlocked = 0, autoFailed = 0;
        for (const username of toBlock) {
            const success = await blockUserByUI(username, true); // silent: no scroll
            if (success) autoBlocked++; else autoFailed++;
            await sleep(500); // Shorter delay for auto-block
        }

        if (toBlock.length > 0) {
            console.log(t('consoleAutoBlockComplete', { success: autoBlocked, failed: autoFailed }));
        }

        isBlocking = false;
    }

    // ==================== AI自动过滤 ====================

    let aiFilterProcessed = new Set(); // Track processed users to avoid duplicates
    let aiFilterInProgress = false;

    /**
     * AI自动过滤评论
     * 在推文详情页自动运行，先展示评论，异步调用AI判断
     */
    async function autoAIFilterComments() {
        if (aiFilterInProgress) return;
        if (!isOnTweetDetailPage()) return;
        if (!config.get('aiFilterEnabled')) return;

        const apiKey = config.get('aiApiKey');
        if (!apiKey) {
            console.log('AI过滤已启用但未配置API Key，跳过');
            return;
        }

        aiFilterInProgress = true;
        console.log(t('consoleAiFilterStart'));

        try {
            // 等待评论加载（给用户一些时间看到评论）
            await sleep(2000);

            // 获取当前可见的评论
            const commentersMap = getAllCommentersWithText();
            const comments = Array.from(commentersMap.entries())
                .filter(([username]) => !aiFilterProcessed.has(username))
                .map(([username, text]) => ({ username, text }));

            if (comments.length === 0) {
                aiFilterInProgress = false;
                return;
            }

            // 显示状态指示器
            updateAIFilterStatus(t('aiFilterStatusProcessing', { current: 0, total: comments.length }));

            // 批量调用AI分类（每次最多处理20条评论）
            const batchSize = 20;
            let processedCount = 0;

            for (let i = 0; i < comments.length; i += batchSize) {
                const batch = comments.slice(i, i + batchSize);

                try {
                    const results = await classifyCommentsByAI(batch);

                    // 处理结果
                    await processAIFilterResults(results);

                    // 标记已处理
                    batch.forEach(c => aiFilterProcessed.add(c.username));

                    processedCount += batch.length;
                    updateAIFilterStatus(t('aiFilterStatusProcessing', {
                        current: processedCount,
                        total: comments.length
                    }));

                } catch (error) {
                    console.error(t('consoleAiFilterError', { error: error.message }));
                    // 继续处理下一批
                }

                // 批次之间延迟，避免API限流
                if (i + batchSize < comments.length) {
                    await sleep(1000);
                }
            }

            // 完成
            updateAIFilterStatus(t('aiFilterStatusComplete'), true);

        } catch (error) {
            console.error(t('consoleAiFilterError', { error: error.message }));
        } finally {
            aiFilterInProgress = false;
        }
    }

    /**
     * 监听新评论并自动过滤
     */
    function watchForNewComments() {
        if (!config.get('aiFilterEnabled')) return;
        if (!isOnTweetDetailPage()) return;

        const observer = new MutationObserver(() => {
            if (!aiFilterInProgress && isOnTweetDetailPage()) {
                // 延迟执行，避免频繁触发
                setTimeout(autoAIFilterComments, 1000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 60秒后停止监听，避免内存泄漏
        setTimeout(() => observer.disconnect(), 60000);
    }

    /**
     * 手动触发AI过滤
     */
    async function handleManualAIFilter() {
        if (aiFilterInProgress) {
            alert(t('alertAiFilterInProgress'));
            return;
        }

        if (!isOnTweetDetailPage()) {
            alert(t('alertNotDetailPage'));
            return;
        }

        const apiKey = config.get('aiApiKey');
        if (!apiKey) {
            alert(t('alertNoApiKey'));
            return;
        }

        // 更新按钮状态
        const button = document.getElementById('ai-filter-btn');
        if (button) {
            button.innerHTML = '🔄';
            button.style.background = 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)';
            button.style.cursor = 'not-allowed';
        }

        try {
            // 先滚动加载更多评论
            console.log(t('consoleLoading'));
            let previousHeight = 0;
            let stableCount = 0;
            let totalScrolls = 0;
            const maxScrollAttempts = parseInt(config.get('scrollAttempts')) || 5;

            while (stableCount < 2 && totalScrolls < maxScrollAttempts) {
                window.scrollTo(0, document.body.scrollHeight);
                await sleep(800);
                totalScrolls++;

                const currentHeight = document.body.scrollHeight;
                if (currentHeight === previousHeight) {
                    stableCount++;
                } else {
                    stableCount = 0;
                }
                previousHeight = currentHeight;
            }

            // 回到顶部
            window.scrollTo(0, 0);
            await sleep(500);

            // 执行AI过滤
            await autoAIFilterComments();

        } finally {
            if (button) {
                button.innerHTML = '🔍';
                button.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
                button.style.cursor = 'pointer';
            }
        }
    }

    /**
     * 显示所有被隐藏的垃圾评论
     */
    function handleShowAllSpam() {
        const spamArticles = document.querySelectorAll('article[data-ai-filtered="spam"]');
        const blacklistArticles = document.querySelectorAll('article[data-ai-filtered="blacklist"]');

        if (spamArticles.length === 0 && blacklistArticles.length === 0) {
            alert(currentLang === 'zh' ? '没有被隐藏的评论' : 'No hidden comments');
            return;
        }

        if (!confirm(t('alertShowAllSpam'))) return;

        // 显示所有垃圾评论
        spamArticles.forEach(article => {
            const overlay = article.querySelector('.ai-spam-overlay');
            if (overlay) overlay.style.display = 'none';
            article.removeAttribute('data-ai-filtered');
        });

        // 显示所有黑名单评论（仅UI显示，用户仍被拉黑）
        blacklistArticles.forEach(article => {
            article.style.display = '';
            article.removeAttribute('data-ai-filtered');
        });
    }

    // ==================== 初始化 ====================

    // Initialize
    function init() {
        // Create floating toolbar (only once, contains all action buttons)
        if (!document.getElementById('x-toolkit-toolbar')) {
            createFloatingToolbar();
        }

        // Create result panel (only once)
        if (!document.getElementById('ai-result-panel')) {
            createResultPanel();
        }

        // Auto block if enabled and on tweet detail page
        if (config.get('autoBlock') && isOnTweetDetailPage()) {
            setTimeout(autoBlockCommenters, 2000);
        }

        // AI auto filter if enabled and on tweet detail page
        if (config.get('aiFilterEnabled') && isOnTweetDetailPage()) {
            setTimeout(() => {
                autoAIFilterComments();
                watchForNewComments();
            }, 3000);
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
            // Remove old toolbar
            const oldToolbar = document.getElementById('x-toolkit-toolbar');
            if (oldToolbar) oldToolbar.remove();
            // Remove old AI filter status indicator
            const oldStatus = document.getElementById('ai-filter-status');
            if (oldStatus) oldStatus.remove();
            // Reset auto-block state for new page
            autoBlockProcessed = new Set();
            // Reset AI filter state for new page
            aiFilterProcessed = new Set();
            aiFilterInProgress = false;
            // Reinitialize
            setTimeout(init, 1000);
        }
    }).observe(document.body, { subtree: true, childList: true });

})();

