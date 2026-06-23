// ==UserScript==
// @name         Twitter X Toolkit
// @name:zh-CN   推特X工具箱
// @version      2.4.6
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

    // AI 过滤相关状态
    let blockedUsersSet = new Set(); // 已拉黑的用户名集合（用于自动隐藏新加载的评论）
    let commentObserver = null; // MutationObserver 实例
    let commentDebounceTimer = null; // watchForNewComments 内 debounce 计时器（模块级以便路由切换时清理）

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
            configAiMultimodalLabel: 'Multimodal Model',
            configAiMultimodalHelp: 'Enable if your model supports image recognition (e.g., GPT-4V, Claude 3.5, Qwen-VL). Avatar images will be sent to the model for text recognition.',
            alertSummarizing: 'AI summarization in progress, please wait...',
            alertNoApiKey: 'Please configure your LLM API Key first!\nClick the config panel to set it up.',
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
            configBioBlacklistPrefixesLabel: 'Bio Blacklist Prefixes',
            configBioBlacklistPrefixesHelp: 'Users whose profile bio starts with any of these prefixes are blacklisted directly. One prefix per line. Runs in the background via the user info API, no browser tabs opened.',
            consoleAiFilterStart: 'AI comment filtering started...',
            consoleAiFilterProgress: 'AI filtering: {current}/{total} comments processed',
            consoleAiFilterComplete: 'AI filtering completed: {blacklist} blacklisted, {spam} spam, {normal} normal',
            consoleAiFilterBlacklist: '🚫 Blacklisted {displayName} (@{username}): {text}',
            consoleAiFilterSpam: '⚠️ Spam detected {displayName} (@{username}): {text}',
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
            buttonShowAllSpam: '👁️ Show All Spam',
            configEnableNotificationsLabel: 'Enable Notifications',
            configEnableNotificationsHelp: 'Show popup notifications like [AI Filtering], [AI Filtering Complete], [AI Summarizing], etc. Disable to reduce interruptions'
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
            configAiMultimodalLabel: '多模态模型',
            configAiMultimodalHelp: '如果你的模型支持图像识别（如 GPT-4V、Claude 3.5、Qwen-VL），请开启。开启后会将头像图片发送给模型识别其中的文字。',
            alertSummarizing: 'AI总结进行中，请稍候...',
            alertNoApiKey: '请先配置你的LLM API Key！\n点击配置面板进行设置。',
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
            configBioBlacklistPrefixesLabel: '个人简介前缀黑名单',
            configBioBlacklistPrefixesHelp: '个人简介以这些前缀开头的用户直接拉黑，每行一个。后台通过用户信息接口异步检查，不会打开浏览器标签页。',
            consoleAiFilterStart: 'AI评论过滤已启动...',
            consoleAiFilterProgress: 'AI过滤中：已处理 {current}/{total} 条评论',
            consoleAiFilterComplete: 'AI过滤完成：黑名单 {blacklist} 条，垃圾 {spam} 条，正常 {normal} 条',
            consoleAiFilterBlacklist: '🚫 拉黑 {displayName} (@{username})：{text}',
            consoleAiFilterSpam: '⚠️ 垃圾评论 {displayName} (@{username})：{text}',
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
            buttonShowAllSpam: '👁️ 显示所有垃圾评论',
            configEnableNotificationsLabel: '启用通知',
            configEnableNotificationsHelp: '开启后会显示【AI过滤中】【AI过滤完成】【AI总结中】等弹窗通知，关闭可减少干扰'
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
        // LLM 配置（api格式 / 地址 / 密钥 / 模型）由 ConfigManager 统一提供
        ...ConfigManager.llmDefaults(),
        // AI 业务扩展：多模态头像识别
        aiMultimodal: false,
        // AI过滤功能配置
        aiFilterEnabled: false,
        aiFilterPrompt: '',
        // 个人简介前缀黑名单（每行一个前缀，命中前缀的用户直接拉黑）
        bioBlacklistPrefixes: '已入驻约p平台\n已入驻曰泡平台',
        // 通知配置
        enableNotifications: false
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
        // AI LLM 基础配置（由 ConfigManager 统一提供：API格式 / 地址 / 密钥 / 模型）
        ...ConfigManager.llmConfigItems({ i18n, lang: currentLang }),
        // 业务扩展：多模态头像识别
        {
            key: 'aiMultimodal',
            label: t('configAiMultimodalLabel'),
            type: 'checkbox',
            help: t('configAiMultimodalHelp')
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
        },
        {
            key: 'bioBlacklistPrefixes',
            label: t('configBioBlacklistPrefixesLabel'),
            type: 'textarea',
            placeholder: '已入驻约p平台',
            help: t('configBioBlacklistPrefixesHelp')
        },
        // 通知配置项
        {
            key: 'enableNotifications',
            label: t('configEnableNotificationsLabel'),
            type: 'checkbox',
            help: t('configEnableNotificationsHelp')
        }
    ]);

    // Restructure config panel: group checkbox items by feature, 2-column grid per group
    function restructureConfigPanel() {
        const content = document.querySelector('#TwitterXToolkit-config-panel .config-content');
        if (!content) return;

        // ---- 将 aiMultimodal 复选框移到 aiBaseUrl 同行右侧，描述用 ⓘ tooltip ----
        const multimodalInput = document.getElementById('TwitterXToolkit-aiMultimodal');
        const baseUrlInput = document.getElementById('TwitterXToolkit-aiBaseUrl');
        if (multimodalInput && baseUrlInput) {
            const multimodalGroup = multimodalInput.closest('.config-form-group');
            const baseUrlGroup = baseUrlInput.closest('.config-form-group');
            if (multimodalGroup && baseUrlGroup) {
                // 在 baseUrl group 的 label 行内追加多模态复选框 + ⓘ 提示
                const baseUrlLabel = baseUrlGroup.querySelector('.config-label');
                if (baseUrlLabel) {
                    // 创建一个 label 容器，使 label 与多模态控件横向并排
                    const labelRow = document.createElement('div');
                    labelRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;';

                    // 把原 label 包进去
                    baseUrlLabel.parentNode.insertBefore(labelRow, baseUrlLabel);
                    labelRow.appendChild(baseUrlLabel);

                    // 构造右侧的多模态控件
                    const mmWrap = document.createElement('label');
                    mmWrap.setAttribute('for', 'TwitterXToolkit-aiMultimodal');
                    mmWrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer;font-weight:500;white-space:nowrap;';

                    // 复用原 checkbox 节点
                    multimodalInput.style.cssText = 'width:auto;margin:0;cursor:pointer;';
                    mmWrap.appendChild(multimodalInput);

                    // 标签文字
                    const mmText = document.createElement('span');
                    mmText.textContent = t('configAiMultimodalLabel');
                    mmWrap.appendChild(mmText);

                    // ⓘ 提示图标，hover 显示描述
                    const infoIcon = document.createElement('span');
                    infoIcon.textContent = 'ⓘ';
                    infoIcon.title = t('configAiMultimodalHelp');
                    infoIcon.style.cssText = 'color:#9ca3af;cursor:help;font-size:13px;user-select:none;';
                    mmWrap.appendChild(infoIcon);

                    labelRow.appendChild(mmWrap);

                    // 隐藏原来的多模态 group（已把 checkbox 转移走）
                    multimodalGroup.style.display = 'none';
                }
            }
        }

        // 按功能分组，顺序就是最终展示顺序
        const groups = [
            {
                title: currentLang === 'zh' ? '屏蔽功能' : 'Blocking',
                keys: ['excludeOriginalPoster', 'autoBlock']
            },
            {
                title: currentLang === 'zh' ? 'AI 功能' : 'AI Features',
                keys: ['aiFilterEnabled']
            },
            {
                title: currentLang === 'zh' ? '通知' : 'Notifications',
                keys: ['enableNotifications']
            }
        ];

        // 找到所有 checkbox group（排除已被搬走的 aiMultimodal）
        const allGroups = Array.from(content.querySelectorAll('.config-form-group'));
        const checkboxGroupByKey = new Map();
        allGroups.forEach(g => {
            const input = g.querySelector('input[type="checkbox"]');
            if (!input) return;
            const key = input.id.replace(/^TwitterXToolkit-/, '');
            // aiMultimodal 已经被搬到 aiBaseUrl 同行了，跳过它
            if (key === 'aiMultimodal') return;
            checkboxGroupByKey.set(key, g);
        });

        if (checkboxGroupByKey.size === 0) return;

        // 规范每个 checkbox group 内部：[checkbox] [label] 一行，help 独立成行
        checkboxGroupByKey.forEach(group => {
            const label = group.querySelector('.config-label');
            const input = group.querySelector('input[type="checkbox"]');
            const help = group.querySelector('.config-help');

            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;';
            input.style.cssText = 'width:auto;margin:0;cursor:pointer;flex-shrink:0;';
            label.style.cssText = 'margin:0;cursor:pointer;font-weight:500;font-size:14px;color:#374151;';
            row.appendChild(input);
            row.appendChild(label);

            group.innerHTML = '';
            group.appendChild(row);
            if (help) {
                help.style.cssText = 'margin:4px 0 0 24px;font-size:12px;color:#6b7280;line-height:1.4;';
                group.appendChild(help);
            }
            group.style.cssText = 'margin:0;padding:8px 10px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;';
        });

        // 为每个分组构建 section，插到 content 最前面（倒序 insertBefore，保证正序）
        const firstChild = content.firstChild;
        for (let i = groups.length - 1; i >= 0; i--) {
            const grp = groups[i];
            const presentKeys = grp.keys.filter(k => checkboxGroupByKey.has(k));
            if (presentKeys.length === 0) continue;

            const section = document.createElement('div');
            section.style.cssText = 'margin-bottom:16px;';

            const title = document.createElement('div');
            title.textContent = grp.title;
            title.style.cssText = 'font-size:13px;font-weight:600;color:#667eea;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;letter-spacing:0.3px;';
            section.appendChild(title);

            const grid = document.createElement('div');
            // 2 列 grid，小屏自动回退成 1 列
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;';
            presentKeys.forEach(key => {
                const g = checkboxGroupByKey.get(key);
                grid.appendChild(g);
            });
            section.appendChild(grid);

            content.insertBefore(section, firstChild);
        }
    }

    restructureConfigPanel();

    // Utility function: delay
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Utility function: show alert with notification toggle
    function showAlert(message) {
        if (config.get('enableNotifications')) {
            alert(message);
        }
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

    // Extract text from an element, preserving emojis rendered as <img alt="😀">
    // Twitter uses Twemoji-style <img> tags for emojis, which innerText skips.
    function getElementTextWithEmoji(el) {
        if (!el) return '';
        let text = '';
        el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'IMG') {
                    // Only take alt for emoji/sticker images, not arbitrary inline images.
                    const alt = node.getAttribute('alt') || '';
                    if (alt) text += alt;
                } else if (node.tagName === 'BR') {
                    text += '\n';
                } else {
                    text += getElementTextWithEmoji(node);
                }
            }
        });
        return text;
    }

    // Extract main tweet content
    function extractTweetContent() {
        try {
            const urlAuthor = getOriginalPosterUsername();
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            let targetArticle = null;

            // 在回复链中，用 URL 里的 username 定位正确的原推 article
            if (urlAuthor) {
                for (const article of articles) {
                    if (article.querySelector(`a[href="/${urlAuthor}"][role="link"]`)) {
                        targetArticle = article;
                        break;
                    }
                }
            }
            if (!targetArticle) targetArticle = articles[0] || null;
            if (!targetArticle) return null;

            const tweetTextElement = targetArticle.querySelector('[data-testid="tweetText"]');
            const tweetText = getElementTextWithEmoji(tweetTextElement);

            return {
                author: urlAuthor || '',
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
                    const tweetText = getElementTextWithEmoji(tweetTextElement);

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

    // Call LLM for summarization
    function callAISummarize(content) {
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

        return config.callLLM({ prompt, temperature: 0.7, maxTokens: 16384 });
    }

    // ==================== AI评论过滤 ====================

    /**
     * 使用AI对评论进行分类
     * @param {Array} comments - 评论数组 [{username, text}, ...]
     * @param {Object} [mainTweet] - 原推内容 { author, text }，用于判断与原文的相关性
     * @returns {Promise<Object>} - 分类结果 { blacklist: string[], spam: string[] }
     */
    // 从 AI 输出中抢救出两个 username 数组
    // 策略：先清理常见损坏模式 → 整体解析 → 失败则用正则抽字符串数组
    function extractUsernameBuckets(raw) {
        const empty = { blacklist: [], spam: [] };
        if (!raw || typeof raw !== 'string') return empty;

        const text = raw
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .replace(/,\s*,+/g, ',')
            .replace(/,\s*([}\]])/g, '$1')
            .trim();

        // 尝试整体解析
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                return {
                    blacklist: sanitizeUsernameArray(parsed.blacklist),
                    spam: sanitizeUsernameArray(parsed.spam)
                };
            }
        } catch (_) { /* fall through */ }

        // 正则兜底：分别抓 "blacklist": [...] 与 "spam": [...] 块
        const pick = (key) => {
            const m = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`));
            if (!m) return [];
            const usernames = [];
            const re = /"([^"\\]+)"/g;
            let um;
            while ((um = re.exec(m[1])) !== null) usernames.push(um[1]);
            return sanitizeUsernameArray(usernames);
        };

        return {
            blacklist: pick('blacklist'),
            spam: pick('spam')
        };
    }

    function sanitizeUsernameArray(arr) {
        if (!Array.isArray(arr)) return [];
        const seen = new Set();
        const out = [];
        for (const v of arr) {
            if (typeof v !== 'string') continue;
            const name = v.trim().replace(/^@/, '');
            if (name && !seen.has(name)) {
                seen.add(name);
                out.push(name);
            }
        }
        return out;
    }

    // 检测"英文单词被符号/emoji 硬拆开"的模板化刷屏
    // 规则：一条评论中出现 >= THRESHOLD 次"字母 + 非字母非空格字符 + 字母"的夹断模式
    //       就判定为机器人刷屏，直接归入 blacklist
    // 例：t🔥hose、tac💼tful、insince🌂re🌺、word🎊s —— 四处夹断 → blacklist
    const WORD_SPLIT_THRESHOLD = 3;
    function countBrokenWordPatterns(text) {
        if (!text || typeof text !== 'string') return 0;
        // [A-Za-z] + 单个"非字母且非空白且非 ASCII 标点"的字符 + [A-Za-z]
        // 用 Unicode 属性类确保能覆盖 emoji、各类装饰符号（⦋ ✧ ⟡ 〥 ⋆ 🔥 💼 🎊 等）
        // \p{L} 是字母，\p{N} 是数字；我们要的是"既不是字母也不是空白也不是常规标点"的单字符
        const re = /[A-Za-z](?:[^\s\p{L}\p{N}.,!?'":;\-()\[\]{}<>+=*/\\|@#$%^&~`_]+)[A-Za-z]/gu;
        const matches = text.match(re);
        return matches ? matches.length : 0;
    }

    function isBrokenWordSpam(text) {
        return countBrokenWordPatterns(text) >= WORD_SPLIT_THRESHOLD;
    }

    // 机器人装饰字符名单：普通键盘/输入法/emoji 选择器里根本选不到，只有脚本生成的
    // 模板刷屏会用到。不含常用 emoji（😂 ❤️ 👍 🔥 等），避免误伤爱用 emoji 的用户。
    // 一条评论里出现名单内字符 >= WORD_SPLIT_THRESHOLD 次（不要求不同）就判黑。
    const BOT_DECOR_CHARS = new Set([
        // 藏语装饰/爪哇语辅助字符
        '༺', '༻', // ༺ ༻
        '༘', '༙', // ༘ ༙
        '༄', '༅', '༂', // ༄ ༅ ༂
        '࿇', // ࿇
        'ꦿ', // ꦿ
        // 古教会斯拉夫语附加符号
        '꙳', // ꙳
        '꙰', '꙱', '꙲', // ꙰ ꙱ ꙲
        // 装饰括号
        'Ɥ', // ꞎ
        '﹅', '﹆', // ﹅ ﹆
        '⺀', '⺁', '⺂', '⺃', // ⺀ ⺁ ⺂ ⺃
        '⟡', // ⟡
        '〥', // 〥
        '⦂', '⧋', '⧊', // ⦂ ⧋ ⧊
        '⦓', '⦔', // ⦓ ⦔
        // 罕见星形符号
        '✦', '✧', '✩', // ✦ ✧ ✩
        '⋆', // ⋆
        // 其它
        '⬮', '⬯', // ⬮ ⬯
        '⚬', '⚭', // ⚬ ⚭
        '⛭', '⛮', // ⛭ ⛮
        '⛬', // ⛬
        '꧁', '꧂', // ꧁ ꧂
        '٭', // ٭
        // 花哨装饰括号
        '⦘', '⦙', // ⦘ ⦙
        '⦊', '⦋', // ⦊ ⦋
        '⦌', '⦍', '⦎', '⦏', // ⦌ ⦍ ⦎ ⦏
    ]);

    function countBotDecorChars(text) {
        if (!text || typeof text !== 'string') return 0;
        let n = 0;
        // 用 for...of 正确处理代理对，避免误判
        for (const ch of text) {
            if (BOT_DECOR_CHARS.has(ch)) n++;
        }
        return n;
    }

    function isBotDecorSpam(text) {
        return countBotDecorChars(text) >= WORD_SPLIT_THRESHOLD;
    }

    // 用户信息缓存：username -> { bio, restId, following }（或 null 表示拉取失败）
    // 缓存粒度是整个会话，避免同一用户重复请求
    const userInfoCache = new Map();

    // 通过 Twitter 内部 GraphQL 接口后台拉取用户简介
    // 复用 blockUserByAPI 已有的鉴权（bearer + ct0 cookie）
    // 存储最新的 rate limit 信息
    let lastRateLimit = { remaining: 150, reset: 0 };

    async function fetchUserBio(username) {
        if (userInfoCache.has(username)) {
            const cached = userInfoCache.get(username);
            return { bio: cached?.bio ?? null, rateLimit: lastRateLimit };
        }

        try {
            const csrfToken = document.cookie.match(/ct0=([^;]+)/)?.[1];
            if (!csrfToken) {
                userInfoCache.set(username, null);
                return { bio: null, rateLimit: lastRateLimit };
            }

            const variables = encodeURIComponent(JSON.stringify({
                screen_name: username,
                withSafetyModeUserFields: true
            }));
            const features = encodeURIComponent(JSON.stringify({
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
            }));

            const response = await fetch(
                `https://x.com/i/api/graphql/G3KGOASz96M-Qu0nwmGXNg/UserByScreenName?variables=${variables}&features=${features}`,
                {
                    method: 'GET',
                    headers: {
                        'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                        'x-csrf-token': csrfToken,
                        'x-twitter-auth-type': 'OAuth2Session',
                        'x-twitter-active-user': 'yes',
                        'x-twitter-client-language': 'en'
                    },
                    credentials: 'include'
                }
            );

            // 更新 rate limit 信息
            const remaining = parseInt(response.headers.get('x-rate-limit-remaining') || '150');
            const reset = parseInt(response.headers.get('x-rate-limit-reset') || '0');
            lastRateLimit = { remaining, reset };

            // 处理 429
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('retry-after') || '0');
                const waitUntil = retryAfter > 0 ? Date.now() + retryAfter * 1000 : reset * 1000;
                console.warn(`⚠️ 触发限流 (429)，等待到 ${new Date(waitUntil).toLocaleTimeString()}`);
                userInfoCache.set(username, null);
                return { bio: null, rateLimit: lastRateLimit, waitUntil };
            }

            if (!response.ok) {
                userInfoCache.set(username, null);
                return { bio: null, rateLimit: lastRateLimit };
            }

            const data = await response.json();
            const userResult = data?.data?.user?.result;
            const bio = userResult?.legacy?.description || '';
            const restId = userResult?.rest_id || null;
            const following = !!userResult?.legacy?.following;
            userInfoCache.set(username, { bio, restId, following });
            return { bio, rateLimit: lastRateLimit };
        } catch (error) {
            console.warn(`拉取 @${username} 简介失败:`, error.message);
            userInfoCache.set(username, null);
            return { bio: null, rateLimit: lastRateLimit };
        }
    }

    // 简介前缀匹配检查：简介去掉前导空白后以任一前缀开头就算命中
    function matchBioPrefix(bio, prefixes) {
        if (!bio || !Array.isArray(prefixes) || prefixes.length === 0) return null;
        const trimmed = bio.replace(/^\s+/, '');
        for (const prefix of prefixes) {
            if (trimmed.startsWith(prefix)) return prefix;
        }
        return null;
    }

    // 批量检查一组 username 的简介，返回命中用户的 Set 和命中的前缀 Map
    // 控制并发（每批 2 个）和批次间延迟（800ms + jitter），避免触发 Twitter rate limit
    // 限流感知：剩余配额 < RATE_LIMIT_THRESHOLD 时主动暂停到窗口重置
    async function checkBiosInBackground(usernames, prefixes) {
        const hits = new Map(); // username -> matched prefix
        if (!prefixes || prefixes.length === 0 || usernames.length === 0) {
            return hits;
        }

        const BATCH_SIZE = 2;
        const BATCH_DELAY_MS = 800;
        const RATE_LIMIT_THRESHOLD = 10; // 剩余配额低于此值时暂停

        for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
            const batch = usernames.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(u => fetchUserBio(u)));

            batch.forEach((username, idx) => {
                const result = results[idx];
                const bio = result.bio;
                const matched = matchBioPrefix(bio, prefixes);
                if (matched) hits.set(username, matched);
            });

            // 检查 rate limit
            const lastResult = results[results.length - 1];
            if (lastResult.rateLimit) {
                const { remaining, reset } = lastResult.rateLimit;

                // 如果遇到 429，等待到重置时间
                if (lastResult.waitUntil) {
                    const waitMs = lastResult.waitUntil - Date.now();
                    if (waitMs > 0) {
                        console.log(`⏸️ 等待限流窗口重置（${Math.ceil(waitMs / 1000)}秒）...`);
                        await sleep(waitMs);
                    }
                }
                // 如果剩余配额不足，主动暂停
                else if (remaining < RATE_LIMIT_THRESHOLD && reset > 0) {
                    const now = Math.floor(Date.now() / 1000);
                    const waitSeconds = reset - now;
                    if (waitSeconds > 0 && waitSeconds < 900) { // 最多等 15 分钟
                        console.log(`⏸️ 配额不足（剩余 ${remaining}），等待窗口重置（${waitSeconds}秒）...`);
                        await sleep(waitSeconds * 1000);
                    }
                }
            }

            // 批次间延迟 + 随机 jitter
            if (i + BATCH_SIZE < usernames.length) {
                const jitter = Math.floor(Math.random() * 400) - 200; // ±200ms
                await sleep(BATCH_DELAY_MS + jitter);
            }
        }

        return hits;
    }

    // 前置 spam 检测：命中两条规则中的任一条就判黑名单
    // 返回命中的规则名（null 表示未命中）
    function detectSpamRule(text) {
        if (isBrokenWordSpam(text)) return 'broken-word';
        if (isBotDecorSpam(text)) return 'bot-decor';
        return null;
    }

    async function classifyCommentsByAI(comments, mainTweet) {
        const customPrompt = config.get('aiFilterPrompt') || '';
        const keywordsRaw = config.get('blockKeywords') || '';
        const keywords = keywordsRaw.split('\n').map(k => k.trim()).filter(k => k.length > 0);

        if (!config.isLLMReady()) {
            throw new Error(t('alertNoApiKey'));
        }

        const tweetSection = mainTweet && mainTweet.text
            ? `原推文（作者 @${mainTweet.author || 'unknown'}）：
${mainTweet.text.substring(0, 500)}`
            : '原推文：（未能获取）';

        const keywordsSection = keywords.length > 0
            ? `

用户黑名单关键词（最高优先级，必须严格执行）：
${keywords.map(k => `- ${k}`).join('\n')}
规则：任何评论内容中只要出现上述关键词中的任意一个（作为完整词或子串），该评论的 username 必须归入 blacklist，无视评论的其他特征或风格，也无视是否与原推文相关。`
            : '';

        // 默认提示词：只让模型返回需要隐藏/拉黑的 username 列表，降低对小模型的要求
        const defaultPrompt = `你是一个社交媒体内容审核助手。请结合原推文内容，从以下评论中筛选出需要处理的用户名，只输出 username，不需要解释。

${tweetSection}${keywordsSection}

分类标准：
- blacklist：（最高优先级）包含上方"用户黑名单关键词"的评论（若已配置）；色情、约炮、线下见面等性暗示；诈骗、钓鱼、恶意链接；严重人身攻击、辱骂、威胁；极端政治煽动、仇恨言论；明显的机器人刷屏;大量 emoji/符号夹杂无实质内容的英文抒情句等；。
- spam：评论内容本身包含推广链接、重复刷屏、或明确的商品/服务推销。仅根据评论内容判断，不要因为昵称像营销号就归入 spam。
- 其它（与原推文相关的正常讨论、提问、赞同、批评等）视为 normal，不需要返回。


注意：昵称（displayName）也是重要的判断依据。如果昵称包含"线下"、"约"、"全国安排"、"见面"等引流暗示词，即使评论内容看似正常，也应归入 blacklist。
${config.get('aiMultimodal') ? `
头像识别（你的模型支持图像识别）：每条评论都提供了头像图片 URL。如果头像中包含"线下"、"约"、"全国安排"、"见面"、"加V"、"联系方式"等引流暗示文字，该用户应归入 blacklist。` : ''}

评论列表：
${comments.map((c, i) => {
            const avatarPart = config.get('aiMultimodal') ? ` | 头像: ${c.avatarUrl}` : '';
            return `${i + 1}. 昵称: ${c.displayName} ,username: @${c.username}${avatarPart},评论: ${c.text.substring(0, 200)}`;
        }).join('\n\n')}

严格按以下 JSON 格式返回（不要任何解释文字，不要 markdown 代码块）：
{"blacklist":["user1","user2"],"spam":["user3"]}

如果没有匹配的用户，返回：{"blacklist":[],"spam":[]}`;

        const prompt = customPrompt || defaultPrompt;

        const responseText = await config.callLLM({
            prompt,
            temperature: 0.1,
            maxTokens: 2048
        });

        return extractUsernameBuckets(responseText);
    }

    /**
     * 标记评论为垃圾评论或黑名单评论
     * @param {string} username - 用户名
     * @param {string} category - 分类 ('blacklist' | 'spam')
     * @param {string} reason - 理由
     */
    function markCommentByCategory(username, category, reason) {
        // 兜底：仅在推文详情页执行隐藏/打标，避免 async 过程中路由切换后误伤时间线推文
        if (!isOnTweetDetailPage()) return;
        // 查找该用户的所有评论
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach(article => {
            // 只在 User-Name 区域匹配，避免评论正文中的 @mention 误命中
            const userNameArea = article.querySelector('[data-testid="User-Name"]');
            if (!userNameArea) return;
            const isTargetUser = !!userNameArea.querySelector(`a[href="/${username}"][role="link"]`);

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
                    backdrop-filter: blur(6px);
                    z-index: 10;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    cursor: pointer;
                    transition: all 0.25s ease;
                `;

                // 创建标签
                const label = document.createElement('div');
                label.style.cssText = `
                    color: #ff9800;
                    font-size: 13px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                `;
                label.textContent = t('spamCommentLabel');

                // 创建理由
                const reasonText = document.createElement('div');
                reasonText.style.cssText = `
                    color: #ccc;
                    font-size: 11px;
                `;
                reasonText.textContent = reason;

                // 创建显示按钮
                const showButton = document.createElement('button');
                showButton.style.cssText = `
                    padding: 4px 12px;
                    background: #1DA1F2;
                    color: white;
                    border: none;
                    border-radius: 14px;
                    cursor: pointer;
                    font-size: 12px;
                    margin-top: 4px;
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
     * @param {Object} buckets - { blacklist: string[], spam: string[] }
     * @param {Map<string,string>} [textMap] - username -> 原始评论文本，用于日志输出
     */
    async function processAIFilterResults(buckets, dataMap) {
        const blacklist = Array.isArray(buckets?.blacklist) ? buckets.blacklist : [];
        const spam = Array.isArray(buckets?.spam) ? buckets.spam : [];

        // 过滤掉不存在的用户名（AI 可能返回不存在的 username）
        const validUsernames = new Set(dataMap.keys());
        const validBlacklist = blacklist.filter(u => validUsernames.has(u));
        const validSpam = spam.filter(u => validUsernames.has(u));

        // 记录被过滤掉的无效用户名
        const invalidBlacklist = blacklist.filter(u => !validUsernames.has(u));
        const invalidSpam = spam.filter(u => !validUsernames.has(u));
        if (invalidBlacklist.length > 0) {
            console.warn(`⚠️ AI 返回了不存在的黑名单用户: ${invalidBlacklist.join(', ')}`);
        }
        if (invalidSpam.length > 0) {
            console.warn(`⚠️ AI 返回了不存在的垃圾评论用户: ${invalidSpam.join(', ')}`);
        }

        // 去重：同一用户若同时出现在两类中，以 blacklist 优先
        const blacklistSet = new Set(validBlacklist);
        const spamSet = new Set(validSpam.filter(u => !blacklistSet.has(u)));

        const previewText = (u) => {
            const data = (dataMap && dataMap.get && dataMap.get(u)) || {};
            const raw = data.text || '';
            // 单行化并截断，避免日志过长
            return raw.replace(/\s+/g, ' ').trim().substring(0, 120);
        };

        const getDisplayName = (u) => {
            const data = (dataMap && dataMap.get && dataMap.get(u)) || {};
            return data.displayName || u;
        };

        for (const username of blacklistSet) {
            console.log(t('consoleAiFilterBlacklist', {
                displayName: getDisplayName(username),
                username,
                text: previewText(username)
            }));
            markCommentByCategory(username, 'blacklist', '');
            blockedUsersSet.add(username);
        }

        for (const username of spamSet) {
            console.log(t('consoleAiFilterSpam', {
                displayName: getDisplayName(username),
                username,
                text: previewText(username)
            }));
            markCommentByCategory(username, 'spam', '');
        }

        // 拉黑操作放后台，不阻塞 UI 标记和后续批次
        if (blacklistSet.size > 0) {
            Promise.all([...blacklistSet].map(username => blockUserByAPI(username))).catch(() => {});
        }

        const blacklistCount = blacklistSet.size;
        const spamCount = spamSet.size;
        console.log(t('consoleAiFilterComplete', {
            blacklist: blacklistCount,
            spam: spamCount,
            normal: 0
        }));

        return { blacklistCount, spamCount, normalCount: 0 };
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
            top: 70px;
            right: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 6px 12px;
            border-radius: 16px;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.35);
            z-index: 99998;
            font-size: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.25s ease;
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
        // 如果通知开关关闭，不显示状态指示器
        if (!config.get('enableNotifications')) {
            return;
        }

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
    // 工具栏位置：按"距离最近边缘"锚定保存
    // 这样用户调整窗口大小、切换屏幕都不会让工具栏跑到中间
    const TOOLBAR_BTN_SIZE = 40;
    const TOOLBAR_DEFAULT_MARGIN = 20;

    // 一次性清理旧版（v2.4.3 及之前）的绝对像素位置 key，避免遗留坐标污染新逻辑
    if (GM_getValue('toolbar_position_x', null) !== null || GM_getValue('toolbar_position_y', null) !== null) {
        try { GM_setValue('toolbar_position_x', undefined); } catch (_) { }
        try { GM_setValue('toolbar_position_y', undefined); } catch (_) { }
    }

    function loadToolbarPosition() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const btn = TOOLBAR_BTN_SIZE;
        // 默认贴左侧、垂直居中
        const anchorX = GM_getValue('toolbar_anchor_x', 'left');
        const anchorY = GM_getValue('toolbar_anchor_y', 'center');
        const dx = GM_getValue('toolbar_dx', TOOLBAR_DEFAULT_MARGIN);
        // center 模式存的是"工具栏中心相对视口中心的偏移"
        const dy = GM_getValue('toolbar_dy', 0);
        let x;
        if (anchorX === 'right') x = w - btn - dx;
        else if (anchorX === 'center') x = (w - btn) / 2 + dx;
        else x = dx;
        let y;
        if (anchorY === 'bottom') y = h - btn - dy;
        else if (anchorY === 'center') y = (h - btn) / 2 + dy;
        else y = dy;
        // 视口边界保护
        x = Math.max(0, Math.min(x, Math.max(0, w - btn)));
        y = Math.max(0, Math.min(y, Math.max(0, h - btn)));
        return { x, y };
    }

    function saveToolbarPosition(x, y) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const btn = TOOLBAR_BTN_SIZE;
        // 用户拖动后，按到三条参考线（左/右/中）的距离选锚点：哪个最近选哪个
        const distLeft = x;
        const distRight = w - btn - x;
        const distCenterX = Math.abs(x - (w - btn) / 2);
        let anchorX, dx;
        if (distCenterX < distLeft && distCenterX < distRight) {
            anchorX = 'center';
            dx = x - (w - btn) / 2;
        } else if (distRight < distLeft) {
            anchorX = 'right';
            dx = Math.max(0, distRight);
        } else {
            anchorX = 'left';
            dx = Math.max(0, distLeft);
        }

        const distTop = y;
        const distBottom = h - btn - y;
        const distCenterY = Math.abs(y - (h - btn) / 2);
        let anchorY, dy;
        if (distCenterY < distTop && distCenterY < distBottom) {
            anchorY = 'center';
            dy = y - (h - btn) / 2;
        } else if (distBottom < distTop) {
            anchorY = 'bottom';
            dy = Math.max(0, distBottom);
        } else {
            anchorY = 'top';
            dy = Math.max(0, distTop);
        }

        GM_setValue('toolbar_anchor_x', anchorX);
        GM_setValue('toolbar_anchor_y', anchorY);
        GM_setValue('toolbar_dx', dx);
        GM_setValue('toolbar_dy', dy);
    }

    // 窗口缩放时按锚点重新计算位置，工具栏永远贴在用户选定的边
    window.addEventListener('resize', () => {
        const toolbar = document.getElementById('x-toolkit-toolbar');
        if (!toolbar) return;
        const pos = loadToolbarPosition();
        toolbar.style.left = pos.x + 'px';
        toolbar.style.top = pos.y + 'px';
    });

    function createFloatingToolbar() {
        const savedPosition = loadToolbarPosition();

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
            gap: 6px;
        `;

        // Create main button (always visible)
        const mainButton = document.createElement('button');
        mainButton.id = 'x-toolkit-main-btn';
        mainButton.innerHTML = '🛠️';
        mainButton.title = t('toolbarMainButton') || 'Twitter X Toolkit';
        mainButton.style.cssText = `
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #1DA1F2 0%, #0d8bd9 100%);
            color: white;
            border: none;
            border-radius: 50%;
            cursor: move;
            font-size: 18px;
            box-shadow: 0 2px 8px rgba(29, 161, 242, 0.35);
            transition: all 0.25s ease;
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
            gap: 6px;
            opacity: 0;
            transform: translateY(8px);
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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
                    this.style.transform = 'scale(1.12)';
                    this.style.boxShadow = '0 3px 10px rgba(102, 126, 234, 0.5)';
                }
            });
            blockButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 2px 6px rgba(102, 126, 234, 0.35)';
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
                    this.style.transform = 'scale(1.12)';
                    this.style.boxShadow = '0 3px 10px rgba(240, 147, 251, 0.5)';
                }
            });
            summarizeButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 2px 6px rgba(240, 147, 251, 0.35)';
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
                    this.style.transform = 'scale(1.12)';
                    this.style.boxShadow = '0 3px 10px rgba(17, 153, 142, 0.5)';
                }
            });
            aiFilterButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 2px 6px rgba(17, 153, 142, 0.35)';
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
                this.style.transform = 'scale(1.12)';
                this.style.boxShadow = '0 3px 10px rgba(250, 112, 154, 0.5)';
            });
            showSpamButton.addEventListener('mouseleave', function () {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 2px 6px rgba(250, 112, 154, 0.35)';
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
            this.style.transform = 'scale(1.12)';
            this.style.boxShadow = '0 3px 10px rgba(83, 100, 113, 0.5)';
        });
        settingsButton.addEventListener('mouseleave', function () {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 2px 6px rgba(83, 100, 113, 0.35)';
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
            const maxX = window.innerWidth - 40;
            const maxY = window.innerHeight - 40;
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

                // Save position with edge anchoring (resize-friendly)
                saveToolbarPosition(parseInt(container.style.left), parseInt(container.style.top));
            }
        });

        // Main button hover effect
        mainButton.addEventListener('mouseenter', function () {
            if (!isDragging) {
                this.style.transform = 'scale(1.1)';
                this.style.boxShadow = '0 3px 12px rgba(29, 161, 242, 0.55)';
            }
        });

        mainButton.addEventListener('mouseleave', function () {
            if (!isDragging) {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 2px 8px rgba(29, 161, 242, 0.35)';
            }
        });

        document.body.appendChild(container);
        return container;
    }

    // Helper function to get action button style
    function getActionButtonStyle(colorStart, colorEnd) {
        return `
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, ${colorStart} 0%, ${colorEnd} 100%);
            color: white;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
            transition: all 0.25s ease;
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
            width: 86%;
            max-width: 640px;
            max-height: 75vh;
            background: rgb(21, 32, 43);
            border-radius: 10px;
            box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
            z-index: 10000;
            display: none;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: rgb(231, 233, 234);
        `;

        panel.innerHTML = `
            <div id="panel-header" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 15px; font-weight: 600;">${t('panelTitle')}</h3>
                <div id="panel-actions" style="display: flex; gap: 6px; align-items: center;">
                    <button id="panel-fullscreen-btn" title="${t('panelFullscreen')}" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 13px; line-height: 1; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">⛶</button>
                    <button id="panel-copy-btn" title="${t('panelCopy')}" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 13px; line-height: 1; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">📋</button>
                    <button id="panel-close-btn" title="${t('panelClose')}" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 15px; line-height: 1; transition: all 0.2s; display: flex; align-items: center; justify-content: center;">×</button>
                </div>
            </div>
            <div id="panel-content" style="padding: 12px 16px; overflow-y: auto; overflow-x: hidden; max-height: calc(75vh - 50px); line-height: 1.5; font-size: 13px; color: rgb(231, 233, 234); user-select: text; -webkit-user-select: text; cursor: text; box-sizing: border-box;"></div>
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
                content.style.maxHeight = 'calc(100vh - 50px)';
                content.style.fontSize = '15px';
                content.style.padding = '16px 20px 24px 20px';
                content.style.lineHeight = '1.5';

                btn.innerHTML = '⛶';
                btn.title = t('panelExitFullscreen');
                btn.setAttribute('aria-label', t('panelExitFullscreen'));
            } else {
                // 恢复正常模式
                panel.style.top = '50%';
                panel.style.left = '50%';
                panel.style.transform = 'translate(-50%, -50%)';
                panel.style.width = '86%';
                panel.style.height = 'auto';
                panel.style.maxWidth = '640px';
                panel.style.maxHeight = '75vh';
                panel.style.borderRadius = '10px';

                // 内容区域正常样式
                content.style.maxHeight = 'calc(75vh - 50px)';
                content.style.fontSize = '13px';
                content.style.padding = '12px 16px';
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
            .replace(/^### (.*?)$/gm, '<h3 style="margin-top: 4px; margin-bottom: 2px; color: rgb(231, 233, 234); font-size: 14px; font-weight: 600;">$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2 style="margin-top: 6px; margin-bottom: 3px; color: rgb(231, 233, 234); font-size: 16px; font-weight: 700;">$1</h2>')
            .replace(/^# (.*?)$/gm, '<h1 style="margin-top: 8px; margin-bottom: 4px; color: rgb(231, 233, 234); font-size: 18px; font-weight: 700;">$1</h1>')
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
            showAlert(t('alertSummarizing'));
            return;
        }

        if (!config.isLLMReady()) {
            alert(t('alertNoApiKey'));
            return;
        }

        isSummarizing = true;
        updateSummarizeButtonStatus(t('summarizeButtonLoading'), true);

        try {
            console.log(t('consoleSummarizing'));

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
            const result = await callAISummarize(contentToSummarize);

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

    // Get original poster's username from the tweet detail URL
    // URL format: /{username}/status/{id}
    function getOriginalPosterUsername() {
        try {
            const match = location.pathname.match(/^\/([^\/]+)\/status\/\d+/);
            if (match) return match[1];
        } catch (error) {
            console.error('Failed to get original poster username:', error);
        }
        return null;
    }

    // Get all commenters with their comment text
    function getAllCommentersWithText() {
        const commentersMap = new Map(); // username -> { text, displayName, avatarUrl }
        const excludeOriginal = config.get('excludeOriginalPoster');
        const originalPoster = excludeOriginal ? getOriginalPosterUsername() : null;

        // Comments on X/Twitter are usually in article tags
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        articles.forEach(article => {
            // 只在用户名区域（User-Name）内查找，避免把评论正文里的 @mention 当成评论者
            const userNameArea = article.querySelector('[data-testid="User-Name"]');
            let username = null;

            if (userNameArea) {
                const userLinks = userNameArea.querySelectorAll('a[href^="/"][role="link"]');
                for (const link of userLinks) {
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
                            break;
                        }
                    }
                }
            }

            // Get comment text, display name and avatar URL
            if (username) {
                const tweetTextElement = article.querySelector('[data-testid="tweetText"]');
                const tweetText = getElementTextWithEmoji(tweetTextElement);

                // Get display name (nickname)
                const displayNameElement = article.querySelector('[data-testid="User-Name"] span');
                const displayName = displayNameElement ? displayNameElement.innerText : username;

                // Get avatar URL
                const avatarImg = article.querySelector('img[draggable="true"]');
                const avatarUrl = avatarImg ? avatarImg.src : '';

                // Store username, text, displayName and avatarUrl (append if user has multiple comments)
                if (commentersMap.has(username)) {
                    const existing = commentersMap.get(username);
                    commentersMap.set(username, {
                        text: existing.text + '\n' + tweetText,
                        displayName: existing.displayName,
                        avatarUrl: existing.avatarUrl
                    });
                } else {
                    commentersMap.set(username, { text: tweetText, displayName, avatarUrl });
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

            // 获取CSRF token
            const csrfToken = document.cookie.match(/ct0=([^;]+)/)?.[1];
            if (!csrfToken) {
                throw new Error('Failed to get CSRF token');
            }

            let userId = null;
            let isFollowing = false;

            // 优先从缓存中获取 userId（fetchUserBio 已缓存完整用户信息）
            const cached = userInfoCache.get(username);
            if (cached && cached.restId) {
                userId = cached.restId;
                isFollowing = cached.following;
            } else {
                // 缓存未命中，调用 UserByScreenName
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
                    throw new Error(`Failed to get user info: ${userInfoResponse.status}`);
                }

                const userInfoData = await userInfoResponse.json();
                const userResult = userInfoData.data?.user?.result;
                userId = userResult?.rest_id;
                isFollowing = !!userResult?.legacy?.following;

                // 写入缓存供后续复用
                if (userId) {
                    userInfoCache.set(username, {
                        bio: userResult?.legacy?.description || '',
                        restId: userId,
                        following: isFollowing
                    });
                }
            }

            if (!userId) {
                throw new Error('Failed to get user ID');
            }

            // 保护已关注的用户不被误拉黑
            if (isFollowing) {
                return false;
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
            showAlert(t('alertProcessing'));
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
            for (const [username, data] of commentersMap) {
                const matchedKeyword = keywords.find(kw => data.text.includes(kw));
                if (matchedKeyword) {
                    console.log(t('consoleKeywordMatched', { keyword: matchedKeyword, username, text: data.text.substring(0, 50) }));
                    commenters.push(username);
                } else {
                    console.log(t('consoleKeywordSkipped', { username }));
                }
            }
        } else {
            commenters = Array.from(commentersMap.keys());
        }

        if (commenters.length === 0) {
            showAlert(t('alertNoCommenters'));
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

        showAlert(t('alertComplete', {
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

        for (const [username, data] of commentersMap) {
            if (autoBlockProcessed.has(username)) continue; // Skip already processed

            const matchedKeyword = keywords.find(kw => data.text.includes(kw));
            if (matchedKeyword) {
                console.log(t('consoleKeywordMatched', { keyword: matchedKeyword, username, text: data.text.substring(0, 50) }));
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

        if (!config.isLLMReady()) {
            console.log('AI过滤已启用但 LLM 未配置，跳过');
            return;
        }

        // 记录函数启动时的 URL，async 过程中如果路由变化（用户切回时间线/个人页等）立即终止
        // 否则会用时间线推文当作评论送进 AI，并把结果写回 DOM 误隐藏正常推文
        const startUrl = location.href;
        const stillOnDetail = () => isOnTweetDetailPage() && location.href === startUrl;

        aiFilterInProgress = true;
        console.log(t('consoleAiFilterStart'));

        try {
            if (!stillOnDetail()) return;

            // 获取当前可见的评论
            const commentersMap = getAllCommentersWithText();
            const allComments = Array.from(commentersMap.entries())
                .filter(([username]) => !aiFilterProcessed.has(username))
                .map(([username, data]) => ({
                    username,
                    text: data.text,
                    displayName: data.displayName,
                    avatarUrl: data.avatarUrl
                }));

            if (allComments.length === 0) {
                aiFilterInProgress = false;
                return;
            }

            // 前置规则检测：
            //   规则 1 broken-word：英文单词被符号/emoji 硬拆开 >= WORD_SPLIT_THRESHOLD 次
            //   规则 2 bot-decor：评论中包含机器人装饰字符 >= WORD_SPLIT_THRESHOLD 次（冷僻 Unicode，普通输入法打不出）
            // 任一命中直接判黑名单，不送 AI，节省 token 也更稳定
            const preFilterBlacklist = [];
            const preFilterReason = new Map(); // username -> label
            const comments = [];
            for (const c of allComments) {
                const rule = detectSpamRule(c.text);
                if (rule) {
                    preFilterBlacklist.push(c.username);
                    const ruleLabel = rule === 'broken-word'
                        ? `单词夹断 ≥${WORD_SPLIT_THRESHOLD}`
                        : `机器人装饰字符 ≥${WORD_SPLIT_THRESHOLD}`;
                    preFilterReason.set(c.username, ruleLabel);
                    console.log(`🎯 前置命中（${ruleLabel}）@${c.username}: ${c.text.substring(0, 80)}`);
                } else {
                    comments.push(c);
                }
            }

            // 规则 3 bio-prefix：后台查询用户简介，命中配置前缀的直接判黑名单
            // 与 AI 调用并行执行，不阻塞主流程
            const bioPrefixesRaw = config.get('bioBlacklistPrefixes') || '';
            const bioPrefixes = bioPrefixesRaw.split('\n').map(p => p.trim()).filter(p => p.length > 0);
            let bioPromise = Promise.resolve(new Map());
            if (bioPrefixes.length > 0 && comments.length > 0) {
                const COMMENT_LENGTH_THRESHOLD = 50;
                const candidateNames = comments
                    .filter(c => c.text.length <= COMMENT_LENGTH_THRESHOLD)
                    .map(c => c.username);
                if (candidateNames.length > 0) {
                    bioPromise = checkBiosInBackground(candidateNames, bioPrefixes);
                }
            }

            // 先处理前置命中的黑名单（直接拉黑，不走 AI）
            if (preFilterBlacklist.length > 0) {
                const preMap = new Map(allComments
                    .filter(c => preFilterBlacklist.includes(c.username))
                    .map(c => [c.username, { text: c.text, displayName: c.displayName, avatarUrl: c.avatarUrl }]));
                await processAIFilterResults({ blacklist: preFilterBlacklist, spam: [] }, preMap);
                if (!stillOnDetail()) return;
                preFilterBlacklist.forEach(u => aiFilterProcessed.add(u));
            }

            if (comments.length === 0) {
                updateAIFilterStatus(t('aiFilterStatusComplete'), true);
                aiFilterInProgress = false;
                return;
            }

            // 提取原推文内容，用于让 AI 判断评论与原文的相关性
            const mainTweet = extractTweetContent();

            // 显示状态指示器
            updateAIFilterStatus(t('aiFilterStatusProcessing', { current: 0, total: comments.length }));

            // 批量调用AI分类（每次最多处理30条评论，最多2个批次并行）
            const batchSize = 30;
            const concurrency = 2;
            let processedCount = 0;

            for (let i = 0; i < comments.length; i += batchSize * concurrency) {
                if (!stillOnDetail()) return;

                // 构建本轮要并行发送的批次
                const batches = [];
                for (let j = 0; j < concurrency && i + j * batchSize < comments.length; j++) {
                    const start = i + j * batchSize;
                    batches.push(comments.slice(start, start + batchSize));
                }

                const batchPromises = batches.map(batch => {
                    const batchDataMap = new Map(batch.map(c => [c.username, {
                        text: c.text,
                        displayName: c.displayName,
                        avatarUrl: c.avatarUrl
                    }]));
                    return classifyCommentsByAI(batch, mainTweet)
                        .then(results => ({ results, batchDataMap, batch }))
                        .catch(error => {
                            console.error(t('consoleAiFilterError', { error: error.message }));
                            return null;
                        });
                });

                const settled = await Promise.all(batchPromises);
                if (!stillOnDetail()) return;

                for (const item of settled) {
                    if (!item) continue;
                    await processAIFilterResults(item.results, item.batchDataMap);
                    if (!stillOnDetail()) return;
                    item.batch.forEach(c => aiFilterProcessed.add(c.username));
                    processedCount += item.batch.length;
                }

                updateAIFilterStatus(t('aiFilterStatusProcessing', {
                    current: processedCount,
                    total: comments.length
                }));
            }

            // 等待并行的简介检查完成，处理 AI 未覆盖到的 bio 命中
            const bioHits = await bioPromise;
            if (!stillOnDetail()) return;
            if (bioHits.size > 0) {
                const bioBL = [...bioHits.keys()].filter(u => !aiFilterProcessed.has(u) && !blockedUsersSet.has(u));
                if (bioBL.length > 0) {
                    const bioMap = new Map(allComments
                        .filter(c => bioBL.includes(c.username))
                        .map(c => [c.username, { text: c.text, displayName: c.displayName, avatarUrl: c.avatarUrl }]));
                    await processAIFilterResults({ blacklist: bioBL, spam: [] }, bioMap);
                    bioBL.forEach(u => aiFilterProcessed.add(u));
                }
            }

            // 完成
            updateAIFilterStatus(t('aiFilterStatusComplete'), true);

            // 启动监听器，持续监听新评论
            watchForNewComments();

        } catch (error) {
            console.error(t('consoleAiFilterError', { error: error.message }));
        } finally {
            aiFilterInProgress = false;
        }
    }

    /**
     * 监听新评论并自动过滤
     * 解决两个问题：
     * 1. 新加载的评论如果是已拉黑用户，立即隐藏
     * 2. 对新评论进行增量 AI 过滤，不遗漏任何评论
     */
    function watchForNewComments() {
        if (!config.get('aiFilterEnabled')) return;
        if (!isOnTweetDetailPage()) return;

        // 停止旧的监听器
        if (commentObserver) {
            commentObserver.disconnect();
        }
        // 清理可能挂在前一次监听器上的 debounce 计时器
        if (commentDebounceTimer) {
            clearTimeout(commentDebounceTimer);
            commentDebounceTimer = null;
        }

        commentObserver = new MutationObserver(() => {
            // 只在推文详情页运行，避免在时间线误触发
            if (!isOnTweetDetailPage()) return;

            // 立即检查新评论是否是已拉黑用户，如果是则立即隐藏
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            articles.forEach(article => {
                // 跳过已处理的评论
                if (article.hasAttribute('data-ai-filtered')) return;

                // 提取用户名（只从 User-Name 区域，避免把评论正文中的 @mention 误认为评论者）
                const userNameArea = article.querySelector('[data-testid="User-Name"]');
                let username = null;
                if (userNameArea) {
                    const userLinks = userNameArea.querySelectorAll('a[href^="/"][role="link"]');
                    for (const link of userLinks) {
                        const href = link.getAttribute('href');
                        if (href && href.match(/^\/[^\/]+$/)) {
                            const user = href.substring(1);
                            if (user &&
                                user !== 'home' &&
                                user !== 'explore' &&
                                user !== 'notifications' &&
                                user !== 'messages') {
                                username = user;
                                break;
                            }
                        }
                    }
                }

                // 如果是已拉黑用户，立即隐藏
                if (username && blockedUsersSet.has(username)) {
                    article.style.display = 'none';
                    article.setAttribute('data-ai-filtered', 'blacklist');
                    console.log(`🚫 自动隐藏已拉黑用户的新评论: @${username}`);
                }
            });

            // 延迟执行 AI 过滤，避免频繁触发
            if (commentDebounceTimer) clearTimeout(commentDebounceTimer);
            commentDebounceTimer = setTimeout(() => {
                commentDebounceTimer = null;
                if (!aiFilterInProgress && isOnTweetDetailPage()) {
                    autoAIFilterComments();
                }
            }, 300);
        });

        commentObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('👁️ 已启动评论监听器，新评论将自动过滤');
    }

    /**
     * 手动触发AI过滤
     */
    async function handleManualAIFilter() {
        if (aiFilterInProgress) {
            showAlert(t('alertAiFilterInProgress'));
            return;
        }

        if (!isOnTweetDetailPage()) {
            alert(t('alertNotDetailPage'));
            return;
        }

        if (!config.isLLMReady()) {
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

        // 非详情页一律回滚残留的 data-ai-filtered DOM 副作用，防止从详情页切回时间线后污染
        if (!isOnTweetDetailPage()) {
            document.querySelectorAll('article[data-ai-filtered]').forEach(article => {
                article.removeAttribute('data-ai-filtered');
                article.removeAttribute('data-blacklist-reason');
                if (article.style.display === 'none') article.style.display = '';
                if (article.style.position === 'relative') article.style.position = '';
                article.querySelectorAll('.ai-spam-overlay').forEach(o => o.remove());
            });
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
            }, 800);
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
            // Preserve toolbar position before removing (to avoid jumping between pages with different viewport sizes)
            const oldToolbar = document.getElementById('x-toolkit-toolbar');
            if (oldToolbar) {
                const currentLeft = parseInt(oldToolbar.style.left) || 0;
                const currentTop = parseInt(oldToolbar.style.top) || 0;
                // Save with edge anchoring so it stays put across viewport changes
                saveToolbarPosition(currentLeft, currentTop);
                oldToolbar.remove();
            }
            // Remove old AI filter status indicator
            const oldStatus = document.getElementById('ai-filter-status');
            if (oldStatus) oldStatus.remove();
            // Reset auto-block state for new page
            autoBlockProcessed = new Set();
            // Reset AI filter state for new page
            aiFilterProcessed = new Set();
            aiFilterInProgress = false;
            // 停止评论监听器，避免在非详情页误触发过滤
            if (commentObserver) {
                commentObserver.disconnect();
                commentObserver = null;
            }
            // 清理 watchForNewComments 内的 debounce 计时器，避免跨页 fire 误触发
            if (commentDebounceTimer) {
                clearTimeout(commentDebounceTimer);
                commentDebounceTimer = null;
            }
            // 清空已拉黑用户集合，避免时间线推文被误隐藏
            blockedUsersSet = new Set();
            // 清理上一页留下的 data-ai-filtered 副作用：Twitter SPA 会复用部分 article DOM，
            // 上一次详情页打的隐藏/遮罩会跟着节点进入新页面，必须主动回滚
            document.querySelectorAll('article[data-ai-filtered]').forEach(article => {
                article.removeAttribute('data-ai-filtered');
                article.removeAttribute('data-blacklist-reason');
                if (article.style.display === 'none') article.style.display = '';
                if (article.style.position === 'relative') article.style.position = '';
                article.querySelectorAll('.ai-spam-overlay').forEach(o => o.remove());
            });
            // Reinitialize
            setTimeout(init, 500);
        }
    }).observe(document.body, { subtree: true, childList: true });

})();

