// ==UserScript==
// @name         Twitter X Toolkit
// @name:zh-CN   推特X工具箱
// @version      2.6.0
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

    // ==================== LRU 缓存实现 ====================

    /**
     * LRU (Least Recently Used) 缓存，防止内存无限增长
     * Map 的迭代顺序是插入顺序，删除+重新插入 = 移到末尾
     */
    class LRUCache {
        constructor(capacity) {
            this.capacity = capacity;
            this.cache = new Map();
        }

        get(key) {
            if (!this.cache.has(key)) return null;
            // 移到末尾（最近使用）
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }

        set(key, value) {
            if (this.cache.has(key)) {
                this.cache.delete(key);
            } else if (this.cache.size >= this.capacity) {
                // 删除最旧的（第一个）
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            this.cache.set(key, value);
        }

        has(key) {
            return this.cache.has(key);
        }

        clear() {
            this.cache.clear();
        }

        get size() {
            return this.cache.size;
        }
    }

    // ==================== 全局状态与缓存 ====================

    let isBlocking = false;
    let blockedCount = 0;
    let failedCount = 0;
    let blockedUsers = [];
    let failedUsers = [];
    let isSummarizing = false;

    // 统计数据（持久化存储）
    const STATS_KEY = 'blockStatistics';
    function getStats() {
        const defaults = { totalBlocked: 0, totalScanned: 0, lastUpdated: Date.now() };
        try {
            const raw = GM_getValue(STATS_KEY, null);
            return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
        } catch (_) {
            return defaults;
        }
    }
    function updateStats(blockedDelta = 0, scannedDelta = 0) {
        const stats = getStats();
        stats.totalBlocked += blockedDelta;
        stats.totalScanned += scannedDelta;
        stats.lastUpdated = Date.now();
        try {
            GM_setValue(STATS_KEY, JSON.stringify(stats));
        } catch (e) {
            console.error('统计数据保存失败:', e);
        }
    }

    // AI 过滤相关状态
    let blockedUsersSet = new Set(); // 已拉黑的用户名集合（用于自动隐藏新加载的评论）
    // 拉黑去重（进程级，故意不随路由清空）：
    // blockedUsersSet 服务于"隐藏 DOM"，换页必须清空，否则时间线推文被误隐藏；
    // 而"这个人已经拉黑过了"是账号级事实，跨推文都成立，需要独立的长生命周期记录。
    // 关键词自动拉黑与 AI 过滤是两条并发流水线，各自维护 processed Set 互不知情，
    // 同一用户曾被两条线各拉黑一次（UserByScreenName + blocks/create 各发两遍）。
    const blockOutcome = new LRUCache(2000);  // username -> 'blocked' | 'skipped'，最多缓存 2000 个
    const blockInFlight = new LRUCache(500);  // username -> Promise，压制同名并发重复请求，最多 500 个
    let commentObserver = null; // MutationObserver 实例
    let commentDebounceTimer = null; // watchForNewComments 内 debounce 计时器（模块级以便路由切换时清理）
    let reapplyDebounceTimer = null; // reapplyBlockedHiding 的防抖计时器

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
            consoleTryBlockAPI: 'Attempting to block user via API: @{username}{text}',
            consoleTryBlockUI: 'Attempting to block user via UI: @{username}{text}',
            consoleBlockSuccess: '✅ Successfully blocked user: @{username}{text}',
            consoleBlockSkipFollowing: '⏭️ Skipped followed user: @{username}{text}',
            consoleBlockFailed: '❌ Failed to block user @{username}{text}:',
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
            configDisplayNameKeywordsLabel: 'Display Name Keywords Blacklist',
            configDisplayNameKeywordsHelp: 'Users whose display name contains any of these keywords are blacklisted directly. One keyword per line. No API calls, instant filtering.',
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
            consoleTryBlockAPI: '尝试通过API屏蔽用户: @{username}{text}',
            consoleTryBlockUI: '尝试通过UI屏蔽用户: @{username}{text}',
            consoleBlockSuccess: '✅ 成功屏蔽用户: @{username}{text}',
            consoleBlockSkipFollowing: '⏭️ 跳过已关注用户: @{username}{text}',
            consoleBlockFailed: '❌ 屏蔽用户 @{username}{text} 失败:',
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
            configDisplayNameKeywordsLabel: '昵称关键词黑名单',
            configDisplayNameKeywordsHelp: '昵称包含这些关键词的用户直接拉黑，每行一个。无需API调用，即时过滤。',
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
        // 昵称关键词黑名单（每行一个关键词，昵称包含这些关键词的用户直接拉黑）
        displayNameKeywords: '已入驻约p平台\n已入驻曰泡平台\n同城上门\n外围\n约炮',
        // 通知配置
        enableNotifications: false,
        // UI 美化
        hideSidebar: true
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
            help: t('configAiFilterPromptHelp'),
            collapsed: true
        },
        {
            key: 'displayNameKeywords',
            label: t('configDisplayNameKeywordsLabel'),
            type: 'textarea',
            placeholder: '同城上门\n外围\n约炮',
            help: t('configDisplayNameKeywordsHelp')
        },
        // 启发式黑名单配置（自定义渲染）
        {
            key: 'heuristicSection',
            type: 'custom',
            render: () => {
                const section = document.createElement('div');
                section.className = 'config-form-group';
                section.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-top: 16px;';

                const title = document.createElement('div');
                title.style.cssText = 'font-weight: 600; font-size: 14px; color: #111827; margin-bottom: 12px;';
                title.textContent = currentLang === 'zh' ? '🎯 启发式黑名单（自动学习）' : '🎯 Heuristic Blacklist';
                section.appendChild(title);

                const historyInfo = document.createElement('div');
                historyInfo.style.cssText = 'font-size: 12px; color: #6b7280; margin-bottom: 12px;';
                const history = config.get('blockHistory') || [];
                const stats = getStats();
                historyInfo.innerHTML = currentLang === 'zh'
                    ? `📊 统计：累计拉黑 <strong style="color:#ef4444">${stats.totalBlocked}</strong> 人，扫描 <strong style="color:#3b82f6">${stats.totalScanned}</strong> 条评论<br>📚 学习历史：${history.length} 条记录`
                    : `📊 Stats: <strong style="color:#ef4444">${stats.totalBlocked}</strong> blocked, <strong style="color:#3b82f6">${stats.totalScanned}</strong> scanned<br>📚 History: ${history.length} records`;
                section.appendChild(historyInfo);

                // 自动发现的规则
                const learnedTitle = document.createElement('div');
                learnedTitle.style.cssText = 'font-size: 13px; font-weight: 500; color: #374151; margin-top: 12px; margin-bottom: 8px;';
                learnedTitle.textContent = currentLang === 'zh' ? '自动发现的规则：' : 'Learned Rules:';
                section.appendChild(learnedTitle);

                const learnedList = document.createElement('div');
                learnedList.id = 'heuristic-learned-list';
                learnedList.style.cssText = 'max-height: 160px; overflow-y: auto; padding-right: 4px;';
                const learned = config.get('heuristicPatterns') || [];
                if (learned.length === 0) {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'font-size: 12px; color: #9ca3af; padding: 8px 0;';
                    empty.textContent = currentLang === 'zh' ? '暂无规则（至少10条历史后开始学习）' : 'No rules yet';
                    learnedList.appendChild(empty);
                } else {
                    learned.forEach(p => {
                        const item = createPatternItem(p, 'learned');
                        learnedList.appendChild(item);
                    });
                }
                section.appendChild(learnedList);

                // 手动添加的规则
                const customTitle = document.createElement('div');
                customTitle.style.cssText = 'font-size: 13px; font-weight: 500; color: #374151; margin-top: 16px; margin-bottom: 8px;';
                customTitle.textContent = currentLang === 'zh' ? '手动添加的规则：' : 'Custom Rules:';
                section.appendChild(customTitle);

                const customList = document.createElement('div');
                customList.id = 'heuristic-custom-list';
                customList.style.cssText = 'max-height: 160px; overflow-y: auto; padding-right: 4px;';
                const custom = config.get('userCustomPatterns') || [];
                if (custom.length === 0) {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'font-size: 12px; color: #9ca3af; padding: 8px 0;';
                    empty.textContent = currentLang === 'zh' ? '暂无规则' : 'No custom rules';
                    customList.appendChild(empty);
                } else {
                    custom.forEach(p => {
                        const item = createPatternItem(p, 'custom');
                        customList.appendChild(item);
                    });
                }
                section.appendChild(customList);

                // 操作按钮
                const btnRow = document.createElement('div');
                btnRow.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';

                const addBtn = document.createElement('button');
                addBtn.textContent = currentLang === 'zh' ? '➕ 添加新规则' : '➕ Add Rule';
                addBtn.style.cssText = 'padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;';
                addBtn.onclick = () => addCustomPattern();
                btnRow.appendChild(addBtn);

                const clearBtn = document.createElement('button');
                clearBtn.textContent = currentLang === 'zh' ? '🗑️ 清空学习历史' : '🗑️ Clear History';
                clearBtn.style.cssText = 'padding: 6px 12px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;';
                clearBtn.onclick = () => clearBlockHistory();
                btnRow.appendChild(clearBtn);

                const relearnBtn = document.createElement('button');
                relearnBtn.textContent = currentLang === 'zh' ? '🔄 重新学习' : '🔄 Relearn';
                relearnBtn.style.cssText = 'padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;';
                // 原实现带 location.reload()：刷新详情页会丢掉本页已建立的隐藏状态和
                // 拉黑记账，评论区重新加载后需要整轮重跑。改为原地重渲染列表。
                relearnBtn.onclick = () => { learnHeuristicPatterns(); refreshPatternLists(); };
                btnRow.appendChild(relearnBtn);

                // 存量规则里积压的滑窗碎片不必等下一次学习触发（要攒 20 条新记录），
                // 这里提供一个即时入口：只跑合并去重，不动 blockHistory。
                const tidyBtn = document.createElement('button');
                tidyBtn.textContent = currentLang === 'zh' ? '🧹 清理重复规则' : '🧹 Tidy Rules';
                tidyBtn.style.cssText = 'padding: 6px 12px; background: #8b5cf6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;';
                tidyBtn.onclick = () => tidyHeuristicPatterns();
                btnRow.appendChild(tidyBtn);

                const resetStatsBtn = document.createElement('button');
                resetStatsBtn.textContent = currentLang === 'zh' ? '📊 重置统计' : '📊 Reset Stats';
                resetStatsBtn.style.cssText = 'padding: 6px 12px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;';
                resetStatsBtn.onclick = () => {
                    if (confirm(currentLang === 'zh' ? '确定要重置所有统计数据吗？' : 'Reset all statistics?')) {
                        updateStats(-getStats().totalBlocked, -getStats().totalScanned);
                        alert(currentLang === 'zh' ? '统计数据已重置' : 'Statistics reset');
                        // 刷新配置面板以显示更新后的统计
                        config.show();
                    }
                };
                btnRow.appendChild(resetStatsBtn);

                section.appendChild(btnRow);

                return section;
            }
        },
        // 通知配置项
        {
            key: 'enableNotifications',
            label: t('configEnableNotificationsLabel'),
            type: 'checkbox',
            help: t('configEnableNotificationsHelp')
        },
        // UI 美化
        {
            key: 'hideSidebar',
            label: currentLang === 'zh' ? '隐藏右侧栏（宽屏模式）' : 'Hide Sidebar (Wide Mode)',
            type: 'checkbox',
            help: currentLang === 'zh' ? '隐藏右侧推荐/趋势栏，主内容区自动拉宽。修改后刷新页面生效。' : 'Hide the right sidebar and expand main content. Refresh to apply.'
        }
    ]);

    // ==================== UI 美化：隐藏右侧栏 ====================
    if (config.get('hideSidebar')) {
        GM_addStyle(`
            [data-testid="sidebarColumn"] {
                display: none !important;
            }
            header[role="banner"] {
                flex-grow: 0 !important;
            }
            main[role="main"] > div {
                max-width: 900px !important;
                margin: 0 auto !important;
                flex: 0 0 auto !important;
            }
            main[role="main"] > div > div,
            main[role="main"] > div > div > div {
                max-width: none !important;
                width: 100% !important;
            }
            [data-testid="primaryColumn"] {
                max-width: none !important;
                width: 100% !important;
            }
            [data-testid="primaryColumn"] .r-f8sm7e {
                max-width: none !important;
            }
        `);
    }

    // ==================== 隐藏 Twitter 原生 toast 通知 ====================
    // 走 UI 点击拉黑时 Twitter 会在底部弹原生 "Successfully blocked" toast。
    // 拉黑主路径已改为 API（不产生 toast），这里只兜底 API 失败降级点击的场景。
    // 只匹配 [data-testid="toast"]：不要用 #layers 下的 role=alert/status 泛匹配，
    // 那会连带吞掉限流警告、发推失败等用户真正需要看到的提示。
    if (!config.get('enableNotifications')) {
        GM_addStyle(`
            [data-testid="toast"] {
                display: none !important;
            }
        `);
    }

    // 启发式规则管理辅助函数
    function createPatternItem(pattern, type) {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #f9fafb; border-radius: 4px; margin-bottom: 4px;';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = pattern.enabled !== false;
        checkbox.style.cssText = 'cursor: pointer;';
        checkbox.onchange = (e) => {
            pattern.enabled = e.target.checked;
            if (type === 'learned') {
                const patterns = config.get('heuristicPatterns') || [];
                config.set('heuristicPatterns', patterns);
            } else {
                const patterns = config.get('userCustomPatterns') || [];
                config.set('userCustomPatterns', patterns);
            }
        };
        item.appendChild(checkbox);

        const text = document.createElement('span');
        text.style.cssText = 'flex: 1; font-size: 13px; color: #374151;';

        // 规则不再分昵称/评论维度（统一对两者各匹配一次），这里只标注归一化匹配：
        // 聚类学来的规则文本是剥掉空格/emoji/@mention 后的形态，看起来会和原评论
        // 不完全一样，不标出来容易被当成学错了
        const tags = [];
        if (pattern.normalized) tags.push(currentLang === 'zh' ? '归一' : 'norm');
        if (pattern.count) {
            tags.push(currentLang === 'zh'
                ? `${pattern.count}次, ${(pattern.ratio * 100).toFixed(0)}%`
                : `${pattern.count}x, ${(pattern.ratio * 100).toFixed(0)}%`);
        }

        text.textContent = `"${pattern.text}"`;
        if (tags.length > 0) {
            text.textContent += ` (${tags.join(', ')})`;
        }

        item.appendChild(text);

        if (type === 'custom') {
            const editBtn = document.createElement('button');
            editBtn.textContent = currentLang === 'zh' ? '编辑' : 'Edit';
            editBtn.style.cssText = 'padding: 2px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;';
            editBtn.onclick = () => editCustomPattern(pattern);
            item.appendChild(editBtn);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = currentLang === 'zh' ? '删除' : 'Delete';
        deleteBtn.style.cssText = 'padding: 2px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;';
        deleteBtn.onclick = () => deletePattern(pattern, type);
        item.appendChild(deleteBtn);

        return item;
    }

    /**
     * 原地重渲染两个规则列表，替代 location.reload()。
     *
     * 规则增删改原本一律 reload。在推文详情页上刷新代价不小：本页已建立的隐藏状态、
     * blockOutcome 记账、AI 判定进度全部丢失，评论区要整轮重跑一遍。
     * 列表本身只是 config 的投影，重新遍历一次就够了。
     */
    function refreshPatternLists() {
        const render = (listId, key, type, emptyText) => {
            const list = document.getElementById(listId);
            if (!list) return;
            list.textContent = '';
            const patterns = config.get(key) || [];
            if (patterns.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'font-size: 12px; color: #9ca3af; padding: 8px 0;';
                empty.textContent = emptyText;
                list.appendChild(empty);
                return;
            }
            patterns.forEach(p => list.appendChild(createPatternItem(p, type)));
        };

        render('heuristic-learned-list', 'heuristicPatterns', 'learned',
            currentLang === 'zh' ? '暂无规则（至少10条历史后开始学习）' : 'No rules yet');
        render('heuristic-custom-list', 'userCustomPatterns', 'custom',
            currentLang === 'zh' ? '暂无规则' : 'No custom rules');
    }

    /**
     * 只对存量规则跑一遍规范化 + 合并去重，不读 blockHistory、不重新学习。
     *
     * 存在的理由：学习要攒够 20 条新记录才触发，而库里的滑窗碎片（同一句话错位切出的
     * 一串等长规则）和早期学到的 @账号名脏数据现在就该清掉。给一个即时入口，
     * 顺带让用户看到清理前后的条数对比。
     */
    function tidyHeuristicPatterns() {
        const before = config.get('heuristicPatterns') || [];
        if (before.length === 0) {
            alert(currentLang === 'zh' ? '暂无自动学习的规则' : 'No learned rules');
            return;
        }

        // key 只用 text：规则不再分维度，存量库里同一句文案的昵称版与评论版会合成一条
        const mergedMap = new Map();
        before.forEach(op => {
            const text = normalizePatternText(op.text);
            if (!text) return;
            const prev = mergedMap.get(text);
            if (!prev || (op.count || 0) > (prev.count || 0)) {
                mergedMap.set(text, stripLegacySource({ ...op, text }));
            }
        });

        const merged = Array.from(mergedMap.values());
        merged.sort((a, b) => (b.count || 0) - (a.count || 0) || a.text.length - b.text.length);
        const kept = [];
        for (const p of merged) {
            if (!kept.some(k => isRedundantPattern(k, p))) kept.push(p);
        }

        config.set('heuristicPatterns', kept);
        refreshPatternLists();

        const removed = before.length - kept.length;
        console.log(`🧹 规则清理完成：${before.length} 条 → ${kept.length} 条，移除 ${removed} 条冗余`, kept);
        alert(currentLang === 'zh'
            ? `清理完成：${before.length} 条 → ${kept.length} 条，移除 ${removed} 条重复/无效规则`
            : `Tidied: ${before.length} → ${kept.length}, removed ${removed}`);
    }

    // 不再询问匹配维度：一条规则对昵称和评论各试一次，命中任一即算。
    // 原先要用户在添加时先猜这句文案会出现在昵称还是评论里，猜错了规则就白加。
    function addCustomPattern() {
        const text = prompt(currentLang === 'zh'
            ? '请输入要拉黑的关键词（至少3字，昵称和评论都会匹配）：'
            : 'Enter keyword (3+ chars, matched against both name and comment):');
        if (!text || text.trim().length < 3) {
            alert(currentLang === 'zh' ? '关键词至少3个字符' : 'At least 3 characters');
            return;
        }
        const patterns = config.get('userCustomPatterns') || [];
        patterns.push({ text: text.trim(), enabled: true });
        config.set('userCustomPatterns', patterns);
        refreshPatternLists();
    }

    function editCustomPattern(pattern) {
        const text = prompt(currentLang === 'zh' ? '修改关键词：' : 'Edit keyword:', pattern.text);
        if (!text || text.trim().length < 3) return;
        pattern.text = text.trim();
        const patterns = config.get('userCustomPatterns') || [];
        config.set('userCustomPatterns', patterns);
        refreshPatternLists();
    }

    function deletePattern(pattern, type) {
        if (!confirm(currentLang === 'zh' ? `确定删除规则「${pattern.text}」？` : `Delete rule "${pattern.text}"?`)) return;
        const key = type === 'learned' ? 'heuristicPatterns' : 'userCustomPatterns';
        const patterns = (config.get(key) || []).filter(p => p.text !== pattern.text);
        config.set(key, patterns);
        refreshPatternLists();
    }

    function clearBlockHistory() {
        if (!confirm(currentLang === 'zh' ? '确定清空所有学习历史和自动规则？手动添加的规则不会被清空。' : 'Clear all history and learned rules?')) return;
        config.set('blockHistory', []);
        config.set('heuristicPatterns', []);
        // 计数器一并归零，否则 totalRecorded - lastLearnedAt 的差值仍在，
        // 下次记录会立刻触发一次"空历史学习"，白跑一轮。
        config.set('totalRecorded', 0);
        config.set('lastLearnedAt', 0);
        refreshPatternLists();
        alert(currentLang === 'zh' ? '已清空' : 'Cleared');
    }

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
            if (!key) return;
            // aiMultimodal 已经被搬到 aiBaseUrl 同行了，跳过它
            if (key === 'aiMultimodal') return;
            // 只处理有标准 label 的 form group（跳过 custom render 的 section）
            if (!g.querySelector('.config-label')) return;
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

    // ==================== 工具函数集合 ====================

    /**
     * 统一的 DOM 查询器
     */
    const DOMQuery = {
        // 查询所有推文 article
        getAllTweets: () => DOMQuery.getAllTweets(),

        // 查询主内容区
        getPrimaryColumn: () => document.querySelector('[data-testid="primaryColumn"]'),

        // 查询侧边栏
        getSidebarColumn: () => document.querySelector('[data-testid="sidebarColumn"]'),

        // 从 article 中提取用户名
        getUsernameFromArticle: (article) => {
            const userNameArea = article.querySelector('[data-testid="User-Name"]');
            if (!userNameArea) return null;
            const link = userNameArea.querySelector('a[role="link"][href^="/"]');
            if (!link) return null;
            const username = link.getAttribute('href').slice(1);
            if (!username || username.includes('/')) return null;
            return username;
        }
    };

    /**
     * 统一的提示函数
     */
    const Notify = {
        // 成功提示
        success: (messageKey, params) => {
            showAlert(t(messageKey, params));
        },

        // 错误提示
        error: (messageKey, params) => {
            alert(t(messageKey, params));
        },

        // 警告提示
        warn: (messageKey, params) => {
            alert(t(messageKey, params));
        },

        // 确认对话框
        confirm: (messageKey, params) => {
            return window.confirm(t(messageKey, params));
        }
    };

    /**
     * 装饰器：要求在推文详情页执行
     */
    function requireDetailPage(fn, errorMessage = 'alertNotDetailPage') {
        return function(...args) {
            if (!isOnTweetDetailPage()) {
                Notify.error(errorMessage);
                return;
            }
            return fn.apply(this, args);
        };
    }

    /**
     * 装饰器：防止重复执行（带状态检查）
     */
    function preventDuplicate(fn, stateGetter, errorMessage = 'alertProcessing') {
        return function(...args) {
            if (stateGetter()) {
                Notify.warn(errorMessage);
                return;
            }
            return fn.apply(this, args);
        };
    }

    /**
     * 装饰器：统一错误处理
     */
    function withErrorHandler(fn, errorMessage = 'consoleSummarizeFailed') {
        return async function(...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                console.error(`❌ ${errorMessage}:`, error);
                Notify.error(errorMessage);
                throw error;
            }
        };
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

    /**
     * 取当前 URL 对应的推文身份（"作者/推文ID"），非详情页返回 null。
     *
     * 用来区分"真的换了推文"和"还在同一条推文里换子视图"。点开图片会把 URL 从
     * /Asahibozi/status/123 变成 /Asahibozi/status/123/photo/2，点开互动列表会变成
     * /status/123/likes、/retweets、/quotes——这些都只是叠一层模态框，背后的详情页
     * DOM 和评论区原封不动。若按普通换页处理，会清空 blockedUsersSet 并回滚
     * data-ai-filtered，把已经隐藏好的评论重新显示出来，而 blockOutcome 记着这些人
     * 已拉黑，两条流水线都会跳过，没人再去补隐藏。
     */
    function getTweetIdentity() {
        const m = window.location.pathname.match(/^\/([^\/]+)\/status\/(\d+)/);
        return m ? `${m[1]}/${m[2]}` : null;
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
            const articles = DOMQuery.getAllTweets();
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
            waitTime = 800,
            retryWait = 400,
            maxPages = 10,
            skipFirst = false,
            idLength = 30,
            logPrefix = 'tweets'
        } = options;

        const items = [];
        // Set 去重替代 items.find 的 O(n) 线性查找：滚动 10 页会累积几百条，
        // 逐条 find 会退化成 O(n²)，是长内容总结卡顿的主因。
        const seenIds = new Set();
        // 记住已解析过的 article 节点，避免每轮滚动都对同一批节点重复做
        // querySelector + emoji 文本提取（开销随页数线性叠加）。
        // 用 WeakSet 而非 DOM 属性：Twitter 是 SPA 会复用节点，写属性会残留到
        // 下一次提取导致误跳过，WeakSet 只作用于本次调用且不阻碍回收。
        const scannedArticles = new WeakSet();
        let previousHeight = 0;
        let scrollAttempts = 0;
        let pagesLoaded = 0;

        console.log(`Loading ${logPrefix} (max ${maxPages} pages)...`);

        // scrollAttempts 保留 2 次容错：Twitter 懒加载偶尔慢一拍，
        // 高度暂时不变不代表到底了。重试等待用较短的 retryWait，
        // 这样到底时的额外开销是 retryWait*2 而不是 waitTime*2。
        while (pagesLoaded < maxPages && scrollAttempts < 2) {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(scrollAttempts === 0 ? waitTime : retryWait);

            // Extract current visible tweets
            const articles = DOMQuery.getAllTweets();
            articles.forEach((article, index) => {
                // Skip the first article if specified (e.g., original tweet in comments)
                if (skipFirst && index === 0) return;
                // 本轮之前已解析过的节点直接跳过
                if (scannedArticles.has(article)) return;
                scannedArticles.add(article);

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
                        if (!seenIds.has(itemId)) {
                            seenIds.add(itemId);
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
            waitTime: 700,
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
1. **评论统计**：总评论数 ${content.comments.length} 条
2. 原推文的核心观点
3. 评论的主要反馈和观点分布
4. 讨论的热点话题
5. 整体舆论倾向

请使用markdown格式输出，包含清晰的结构，并在开头明确标注评论总数。`;
        } else if (content.type === 'user_tweets') {
            prompt = `请对以下用户的推文进行智能总结：

用户: @${content.username}
推文列表（共${content.tweets.length}条）：
${content.tweets.slice(0, 50).map((t, i) => `${i + 1}. ${t.text}`).join('\n\n')}

请总结：
1. **推文统计**：总推文数 ${content.tweets.length} 条
2. 该用户的主要关注话题
3. 发言风格和态度特点
4. 核心观点和立场
5. 最近的活跃主题

请使用markdown格式输出，包含清晰的结构，并在开头明确标注推文总数。`;
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
    // 缓存粒度是整个会话，避免同一用户重复请求，使用 LRU 防止内存泄漏
    const userInfoCache = new LRUCache(500);

    // 通过 Twitter 内部 GraphQL 接口后台拉取用户简介
    // 复用 blockUserByAPI 已有的鉴权（bearer + ct0 cookie）
    // 存储最新的 rate limit 信息
    let lastRateLimit = { remaining: 150, reset: 0 };

    // 昵称关键词匹配检查：昵称包含任一关键词就算命中
    function matchDisplayNameKeyword(displayName, keywords) {
        if (!displayName || !Array.isArray(keywords) || keywords.length === 0) return null;
        for (const keyword of keywords) {
            if (displayName.includes(keyword)) return keyword;
        }
        return null;
    }

    // ==================== 启发式学习 ====================

    // 学习触发门槛：攒够这么多条新拉黑记录就学一次。
    // 原为 20，实测偏高——一次刷推文常只拉 2~5 人，要连刷好几条推文才够一轮，
    // 期间新出现的垃圾模板一直进不了规则库。降到 5 让规则跟得上垃圾文案的变化，
    // 更快形成有效防护。
    const LEARN_TRIGGER_COUNT = 5;

    // 相似聚类成规则的门槛：历史里有这么多条高度相似的评论，就认为是同一模板。
    // 子串统计那条路要求同一子串出现 ≥5 次且占比达标，覆盖不到"整句雷同但用词
    // 位置飘忽"的低频模板；聚类从另一个角度补上，降至 2 条即可成规则（更敏感）。
    const CLUSTER_MIN_SIZE = 2;

    // 聚类专用的最小长度，比实时判黑用的 SIMILARITY_MIN_LENGTH(10) 更宽松。
    // 理由：规则 5/6 拿单条评论当场定黑，短文本撞车代价是误杀，必须保守；
    // 聚类要求 ≥3 条互相高度相似才成规则，本身就是强得多的证据。
    // 实测门槛卡在 10 会漏掉真实模板——"她太涩了ya 我真顶不住@putrrrien"
    // 归一化后只剩 9 字（去 @mention 和随机 ASCII 尾缀），恰好差一个字。
    const CLUSTER_MIN_LENGTH = 7;

    /**
     * 记录拉黑历史（用于启发式学习）
     * @param {string} username - 用户名
     * @param {string} displayName - 昵称
     * @param {string} commentText - 评论文本
     */
    // 批量拉黑时 recordBlockHistory 会被连续调用几十次。若每次都
    // config.set（全量 JSON.stringify + GM_setValue 落盘）并可能触发
    // O(n²) 的学习，主线程会被占满导致明显卡顿。
    // 改为：内存中累积，落盘与学习合并到一次微任务后统一执行。
    let historyFlushScheduled = false;
    let historyDirty = false;
    let pendingLearnCheck = false;

    function flushBlockHistory() {
        historyFlushScheduled = false;
        if (!historyDirty) return;
        historyDirty = false;

        const history = config.get('blockHistory') || [];
        config.set('blockHistory', history);
        historyGramsDirty = true; // 历史已变动，规则 6 的 bigram 缓存失效

        // 只在跨过 20 条整数倍边界时学习一次，避免一轮批量里重复全量学习。
        // 学习是纯 CPU 的子串统计，放到空闲时段执行，不与过滤/滚动抢主线程。
        if (pendingLearnCheck) {
            pendingLearnCheck = false;
            // 学习完成后更新"上次学习位置"
            const totalRecorded = config.get('totalRecorded') || 0;
            const runLearn = () => {
                learnHeuristicPatterns();
                config.set('lastLearnedAt', totalRecorded);
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(runLearn, { timeout: 3000 });
            } else {
                setTimeout(runLearn, 300);
            }
        }
    }

    function recordBlockHistory(username, displayName, commentText = '') {
        const history = config.get('blockHistory') || [];

        // 去重：同一 displayName + commentText 组合只记一次（垃圾团伙用同一模板刷屏，重复记录会稀释有效样本）
        const key = `${displayName}|${commentText}`;
        if (history.some(h => `${h.displayName}|${h.commentText}` === key)) {
            return; // 已存在，跳过
        }

        const before = history.length;
        history.push({
            displayName: displayName || username,
            commentText: commentText || '',
            timestamp: Date.now()
        });

        // FIFO，保留最近100条
        if (history.length > 100) history.shift();

        // 累积计数器（持久化）：不再依赖 history.length（FIFO 满后不变），改为记录总条数
        let totalRecorded = config.get('totalRecorded') || 0;
        let lastLearnedAt = config.get('lastLearnedAt') || 0;
        totalRecorded++;
        config.set('totalRecorded', totalRecorded);

        // 每累积 LEARN_TRIGGER_COUNT 条新记录触发一次学习（即使 history 满员也能继续学习）。
        // 顺带打印进度：不打的话，小批量拉黑（比如一次只拉 2 人）看不到任何学习相关
        // 日志，容易被误判成"学习坏了"，实际只是没到触发点。
        const pendingCount = totalRecorded - lastLearnedAt;
        if (pendingCount >= LEARN_TRIGGER_COUNT) {
            pendingLearnCheck = true;
        } else {
            console.log(`🎓 学习进度：已积累 ${pendingCount}/${LEARN_TRIGGER_COUNT} 条新记录（历史库 ${history.length} 条），满 ${LEARN_TRIGGER_COUNT} 条触发一次规则学习`);
        }

        historyDirty = true;
        if (!historyFlushScheduled) {
            historyFlushScheduled = true;
            setTimeout(flushBlockHistory, 0);
        }
    }

    /**
     * 判断 p 是否是已保留规则 kept 的冗余变体。
     *
     * 调用方必须已按「count 降序、同 count 时长度升序」排好：更泛化、命中更多的规则
     * 先落地，再由它去吃掉派生变体。子串的命中次数天然 ≥ 母串（含母串的文本必然含子串），
     * 所以这个排序保证短规则总是先到。
     *
     * 两种冗余：
     * 1. 包含关系（逻辑上绝对冗余）：规则匹配是 text.includes(pattern)，若 kept 是 p 的
     *    子串，则任何命中 p 的文本必然命中 kept，p 一条也多抓不到。
     *    这样 "体制内老师" 会吃掉 "体制内老师 sao的"、"体制内老师 玩的就是" 等一串后缀变体。
     *    注意方向：只丢更长的那个。反过来丢短的会损失泛化能力。
     * 2. 错位滑窗：同一句话按固定窗口滑动会产出一串等长碎片，互不包含——
     *    "比她好看的没她骚比她" / "她好看的没她骚比她骚" / "好看的没她骚比她骚的" …
     *    起始位置差一格，count 完全相同。用「首尾重叠过半 + count 几乎相等」识别：
     *    二者拼接后重叠部分占到窗口一半以上，说明出自同一模板，只留先到的。
     */
    function isRedundantPattern(kept, p) {
        // 不再按维度分组比较：规则统一对昵称和评论各试一次，
        // 同一句文案从两个维度学到时本就该合成一条
        if (kept.text === p.text) return true;

        // 情况 1：kept 是 p 的子串 → p 永远匹配不到 kept 抓不到的文本
        if (p.text.includes(kept.text)) return true;

        // 情况 2：等长（或近等长）错位滑窗碎片
        if (Math.abs(kept.text.length - p.text.length) <= 1 &&
            Math.min(kept.count, p.count) >= Math.max(kept.count, p.count) * 0.9) {
            const minLen = Math.min(kept.text.length, p.text.length);
            const need = Math.ceil(minLen * 0.5);
            // p 的前缀 == kept 的后缀，或反之，说明二者是同一长句的错位窗口
            for (let overlap = minLen - 1; overlap >= need; overlap--) {
                if (kept.text.slice(-overlap) === p.text.slice(0, overlap)) return true;
                if (p.text.slice(-overlap) === kept.text.slice(0, overlap)) return true;
            }
        }

        return false;
    }

    /**
     * 摘掉存量规则上遗留的 source 字段。
     *
     * 规则曾按 displayName / commentText 分维度存储，现已统一为"对昵称和评论各匹配一次"。
     * 老字段留着不会影响匹配（matchHeuristicPattern 不再读它），但会让存储里堆着一个
     * 永远不被使用的键，也容易误导后续维护者以为维度还生效。
     */
    function stripLegacySource(pattern) {
        const { source, ...rest } = pattern;
        return rest;
    }

    /**
     * 规范化一条规则的 text，与 extractCommonSubstrings 里的清理保持一致。
     *
     * 存量规则是在 @mention 清理逻辑完善之前学到的，库里躺着 "她骚的没她好看 @y"、
     * "骚的没她好看@XXk"、"yvonne12ap" 这类带 @ 尾巴或纯账号名的脏数据。
     * 合并时统一过一遍这个函数，脏规则才能被正常的包含判定吃掉；
     * 返回 null 表示该规则清理后已无价值，直接丢弃。
     */
    /**
     * 智能检测两个文本是否是同一模板的变体
     * 结合相似度计算和模式识别
     * @param {string} text1
     * @param {string} text2
     * @returns {boolean}
     */
    function isSameTemplate(text1, text2) {
        if (!text1 || !text2) return false;
        if (text1 === text2) return true;

        // 1. 长度差异过大，不可能是同一模板
        const lenDiff = Math.abs(text1.length - text2.length);
        if (lenDiff > 3) return false;

        // 2. 计算字符级编辑距离
        const editDist = levenshteinDistance(text1, text2);

        // 3. 如果只差1-2个字符，且长度相近，很可能是模板变体
        if (editDist <= 2 && text1.length >= 6) {
            // 找出不同的位置
            const diffs = findDifferences(text1, text2);

            // 只有1-2处不同，且都是单字符替换（人称代词或单字母变量）
            if (diffs.length <= 2) {
                return diffs.every(diff => {
                    // 检查是否是人称代词替换
                    const pronouns = ['我', '你', '他', '她', '它', '俺', '咱'];
                    if (pronouns.includes(diff.char1) && pronouns.includes(diff.char2)) {
                        return true;
                    }
                    // 检查是否是单字母变量替换（a-z, A-Z）
                    if (/^[a-zA-Z]$/.test(diff.char1) && /^[a-zA-Z]$/.test(diff.char2)) {
                        return true;
                    }
                    // 检查是否是单字母与人称代词的替换
                    if ((/^[a-zA-Z]$/.test(diff.char1) && pronouns.includes(diff.char2)) ||
                        (/^[a-zA-Z]$/.test(diff.char2) && pronouns.includes(diff.char1))) {
                        return true;
                    }
                    return false;
                });
            }
        }

        return false;
    }

    /**
     * 计算两个字符串的 Levenshtein 编辑距离（优化版）
     * 空间复杂度从 O(m*n) 优化到 O(n)
     * 提前终止：长度差异过大直接返回
     */
    function levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;

        // 提前终止：长度差异超过 3 不可能是模板变体
        if (Math.abs(len1 - len2) > 3) return Infinity;

        // 优化：只使用两行，交替使用
        let prevRow = Array(len2 + 1).fill(0).map((_, i) => i);
        let currRow = Array(len2 + 1).fill(0);

        for (let i = 1; i <= len1; i++) {
            currRow[0] = i;
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    currRow[j] = prevRow[j - 1];
                } else {
                    currRow[j] = Math.min(
                        prevRow[j] + 1,      // 删除
                        currRow[j - 1] + 1,  // 插入
                        prevRow[j - 1] + 1   // 替换
                    );
                }
            }
            // 交换行（避免复制）
            [prevRow, currRow] = [currRow, prevRow];
        }

        return prevRow[len2];
    }

    /**
     * 找出两个字符串不同的位置和字符
     */
    function findDifferences(str1, str2) {
        const diffs = [];
        const maxLen = Math.max(str1.length, str2.length);

        for (let i = 0; i < maxLen; i++) {
            const c1 = str1[i] || '';
            const c2 = str2[i] || '';
            if (c1 !== c2) {
                diffs.push({
                    pos: i,
                    char1: c1,
                    char2: c2
                });
            }
        }

        return diffs;
    }

    function normalizePatternText(text) {
        if (!text) return null;
        let cleaned = String(text).trim().replace(/^[@#\s]+/, '');
        // 截掉 @ 及其后所有内容：@mention 换一批小号就失效，学它没意义
        cleaned = cleaned.replace(/\s*@.*$/, '').trim();

        // 长度下限按语种区分。CJK 单字信息量大，截到 3 字（"她好看"、"太涩了"）就成了
        // 会误伤正常评论的泛化规则，要求至少 5 字；拉丁词组按词计信息量，3 字符可接受。
        const hasCJK = /[一-鿿぀-ゟ゠-ヿ가-힯]/.test(cleaned);
        if (cleaned.length < (hasCJK ? 5 : 3)) return null;

        // 纯 ASCII 字母数字串一律丢弃：这是从 @mention 里切出来的具体账号名
        // （"yvonne12ap"、"niuu52"），学它会误伤所有提到该账号的人，且对方换小号即失效。
        // 存量脏规则的 @ 可能已在早期清理中被截掉，所以不能只在原串含 @ 时才判。
        // 真正的拉丁垃圾词组含空格（"only fans"），不会被这条命中。
        if (/^[a-zA-Z0-9_]+$/.test(cleaned)) return null;

        // 过滤纯数字和数字组合（包括带空格的多个数字）
        if (/^[\d\s]+$/.test(cleaned)) return null;

        // 过滤过短的拉丁文本（少于3个字母）
        const latinOnly = cleaned.replace(/[^a-zA-Z]/g, '');
        if (!hasCJK && latinOnly.length > 0 && latinOnly.length < 3) return null;

        // 过滤过于通用的中文短语（常见于正常评论中）
        const genericPhrases = [
            '这个', '那个', '一个', '如果', '但是', '所以', '因为', '虽然',
            '不过', '只是', '还是', '或者', '可以', '应该', '可能', '就是',
            '非常', '真的', '确实', '感觉', '觉得', '看到', '发现', '知道'
        ];
        if (hasCJK && genericPhrases.includes(cleaned)) return null;

        return cleaned;
    }

    /**
     * 从拉黑历史中提取常见子串/单词模式
     * @param {string[]} texts - 文本列表
     * @param {Object} options - 配置选项
     * @returns {Array<{text: string, count: number, ratio: number}>}
     */
    function extractCommonSubstrings(texts, options = {}) {
        const {
            minLen = 5,
            maxLen = 8,
            minRatio = 0.08,  // 从 0.15 降至 0.08：100 条里出现 8 次即可，更敏感
            minCount = 3,      // 从 5 降至 3：降低绝对次数门槛
            stopWords = []
        } = options;

        const substringCount = new Map();
        const total = texts.length;
        const stopWordSet = new Set(stopWords);
        const PURE_DIGIT_SPACE = /^[\d\s]+$/;

        // 检测文本是否主要是 CJK 字符（中日韩统一表意文字）
        const isCJK = (text) => {
            if (!text) return false;
            const cjkChars = text.match(/[一-鿿぀-ゟ゠-ヿ가-힯]/g);
            return cjkChars && cjkChars.length / text.length > 0.3;
        };

        // 提取子串。同一条文本内重复出现的子串只计 1 次（我们要的是
        // "多少条记录包含它"，而不是总出现次数），否则刷屏式重复内容会虚高。
        const seenInText = new Set();
        for (const text of texts) {
            if (!text) continue;
            seenInText.clear();

            if (isCJK(text)) {
                // CJK 文本：按字符长度提取子串（5-10 字符）
                for (let len = minLen; len <= maxLen; len++) {
                    const last = text.length - len;
                    for (let i = 0; i <= last; i++) {
                        const sub = text.substring(i, i + len);
                        if (seenInText.has(sub)) continue;
                        if (PURE_DIGIT_SPACE.test(sub) || stopWordSet.has(sub)) continue;
                        seenInText.add(sub);
                        substringCount.set(sub, (substringCount.get(sub) || 0) + 1);
                    }
                }
            } else {
                // 拉丁文本：按单词边界分词，提取 1-3 个连续单词的 n-gram
                // 过滤掉纯符号、纯数字、停用词
                const words = text.toLowerCase()
                    .split(/[\s\p{P}\p{S}]+/u)
                    .filter(w => w.length > 0 && !/^\d+$/.test(w));

                // 提取 1-gram, 2-gram, 3-gram
                for (let n = 1; n <= 3 && n <= words.length; n++) {
                    for (let i = 0; i <= words.length - n; i++) {
                        const ngram = words.slice(i, i + n).join(' ');
                        if (seenInText.has(ngram)) continue;
                        if (stopWordSet.has(ngram)) continue;
                        // 过滤掉过短的单词（< 3 字符）和过长的组合（> 50 字符）
                        if (n === 1 && ngram.length < 3) continue;
                        if (ngram.length > 50) continue;
                        seenInText.add(ngram);
                        substringCount.set(ngram, (substringCount.get(ngram) || 0) + 1);
                    }
                }
            }
        }

        // 动态阈值
        const MIN_COUNT = Math.max(minCount, Math.floor(total * minRatio));
        const MIN_RATIO = minRatio;

        const patterns = [];
        for (const [sub, count] of substringCount) {
            const ratio = count / total;
            if (count >= MIN_COUNT && ratio >= MIN_RATIO) {
                // 清理首尾空白和常见标点，避免 "我真顶不住"、" 我真顶不住 @" 等
                // 本质相同的模式因为空格/标点差异被当作不同规则。
                // 同时清掉 @用户名 后缀（@mention 经常变，学它没意义）。
                // 清理与存量规则共用同一套门槛（截 @mention、CJK 最少 5 字、
                // 拒绝裸账号名），避免"新学的"和"库里旧的"两套标准对不上，
                // 导致脏规则在合并时躲过包含判定。
                const cleaned = normalizePatternText(sub);
                if (cleaned) {
                    patterns.push({ text: cleaned, count, ratio });
                }
            }
        }

        // 智能合并模板变体（优化版）：
        // 1. 按原文去重（完全相同的保留计数最高的）
        // 2. 检测模板变体（如"应该没人比我/她/他/t玩的开了吧"），合并为一条
        // 3. 性能优化：按长度分组，只比较长度相近的（±3），避免 O(n²) 全量比较
        const deduped = new Map();
        const processed = new Set();

        // 按长度分组，减少比较次数
        const groupedByLength = new Map();
        for (const p of patterns) {
            const len = p.text.length;
            if (!groupedByLength.has(len)) {
                groupedByLength.set(len, []);
            }
            groupedByLength.get(len).push(p);
        }

        // 先按计数降序排序，优先处理高频模式
        patterns.sort((a, b) => b.count - a.count);

        for (const p of patterns) {
            if (processed.has(p.text)) continue;

            // 只在长度相近的组内查找（±3）
            let merged = false;
            for (let lenOffset = -3; lenOffset <= 3; lenOffset++) {
                const targetLen = p.text.length + lenOffset;
                const candidates = groupedByLength.get(targetLen) || [];

                for (const candidate of candidates) {
                    if (candidate.text === p.text) continue;
                    if (!deduped.has(candidate.text)) continue;

                    if (isSameTemplate(p.text, candidate.text)) {
                        // 是同一模板的变体，累加计数
                        const existingPattern = deduped.get(candidate.text);
                        existingPattern.count += p.count;
                        existingPattern.ratio = existingPattern.count / total;
                        processed.add(p.text);
                        merged = true;
                        console.log(`🔗 合并模板变体: "${p.text}" -> "${candidate.text}" (累计: ${existingPattern.count})`);
                        break;
                    }
                }

                if (merged) break;
            }

            if (!merged) {
                // 新模板，检查后续是否有变体需要合并到它
                let totalCount = p.count;
                const variants = [p.text];

                // 只在长度相近的组内查找变体（±3）
                for (let lenOffset = -3; lenOffset <= 3; lenOffset++) {
                    const targetLen = p.text.length + lenOffset;
                    const candidates = groupedByLength.get(targetLen) || [];

                    for (const p2 of candidates) {
                        if (p2.text === p.text || processed.has(p2.text)) continue;

                        if (isSameTemplate(p.text, p2.text)) {
                            totalCount += p2.count;
                            variants.push(p2.text);
                            processed.add(p2.text);
                        }
                    }
                }

                deduped.set(p.text, {
                    text: p.text,
                    count: totalCount,
                    ratio: totalCount / total
                });
                processed.add(p.text);

                if (variants.length > 1) {
                    console.log(`🎯 发现模板族: "${p.text}" (${variants.length}个变体, 累计: ${totalCount})`);
                }
            }
        }

        const uniquePatterns = Array.from(deduped.values());

        // 去重：丢弃冗余变体，只保留最泛化的那条（判定见 isRedundantPattern）。
        // 原实现是 patterns.filter + patterns.some 的全量 O(n²) 对比，候选上千条时
        // 会卡住主线程。改为排好序后单向遍历，每条只与"已保留的"比较。
        uniquePatterns.sort((a, b) => b.count - a.count || a.text.length - b.text.length);
        const filtered = [];
        for (const p of uniquePatterns) {
            let covered = false;
            for (const kept of filtered) {
                if (isRedundantPattern(kept, p)) {
                    covered = true;
                    break;
                }
            }
            if (!covered) filtered.push(p);
        }

        return filtered.sort((a, b) => b.count - a.count).slice(0, 10);
    }

    /**
     * 判断一条启发式规则是否命中，命中返回 true。
     *
     * 规则不再区分昵称/评论维度：同一句垃圾文案既可能出现在昵称里也可能出现在评论里，
     * 分维度存储只是让同一份文本在库里存两遍，还得靠用户在添加时猜该选哪个维度。
     * 现在一条规则对昵称和评论各试一次，命中任一即算。
     *
     * normalized 规则的匹配对象是归一化文本：它由聚类在归一化文本上求得，直接比对原文
     * 永远匹配不上（原文夹着被归一化剥掉的随机 ASCII / emoji）。这也正是它的长处——
     * 能穿透垃圾团伙的插字变形。
     */
    function matchHeuristicPattern(pattern, displayName, commentText) {
        if (!pattern || !pattern.text) return false;

        for (const raw of [displayName, commentText]) {
            if (!raw) continue;
            const haystack = pattern.normalized ? normalizeForSimilarity(raw) : raw;
            if (haystack.includes(pattern.text)) return true;
        }
        return false;
    }

    /**
     * 求一组字符串的最长公共子串。
     *
     * 用第一条作基准枚举其所有子串（由长到短），首个被全组包含的即为答案。
     * 组内文本已通过相似度筛选（Dice ≥ 0.9），公共部分必然很长，通常第一轮就命中，
     * 不必上后缀自动机。基准串长度截到 60 字符，防超长评论把枚举量放大。
     */
    function longestCommonSubstring(texts) {
        if (!texts || texts.length === 0) return '';
        const base = texts[0].slice(0, 60);
        const others = texts.slice(1);

        for (let len = base.length; len >= 5; len--) {
            for (let i = 0; i + len <= base.length; i++) {
                const candidate = base.substr(i, len);
                if (others.every(t => t.includes(candidate))) return candidate;
            }
        }
        return '';
    }

    /**
     * 从拉黑历史里聚类出低频模板，补齐子串统计漏掉的规则。
     *
     * 为什么需要它：子串统计（extractCommonSubstrings）要求同一子串出现 ≥5 次且占比达标。
     * 垃圾团伙换文案的速度往前跑，一套新模板往往只刷了 3~4 条就被拉黑，永远达不到门槛，
     * 于是同样的文案下次还得靠 AI 花 token 判一遍。
     *
     * 做法：按 bigram Dice 相似度（复用规则 5/6 的同一套工具，阈值一致）把历史评论
     * 贪心聚类，成员数 ≥ CLUSTER_MIN_SIZE 的组取最长公共子串成规则。
     *
     * @param {Array<{commentText: string}>} history
     * @param {Array<{text: string}>} existingPatterns 已有规则，用于跳过重复
     * @returns {Array<{text: string, count: number, ratio: number, normalized: boolean}>}
     */
    function learnFromSimilarClusters(history, existingPatterns = []) {
        // 只取够长的评论：短文本（"来了""第一"）撞车概率高，聚出来的规则会误伤
        const items = [];
        for (const h of history) {
            const norm = normalizeForSimilarity(h.commentText);
            if (norm.length < CLUSTER_MIN_LENGTH) continue;
            if (new Set(norm).size < SIMILARITY_MIN_UNIQUE) continue; // 防"哈哈哈哈…"
            items.push({ raw: h.commentText, norm, grams: charBigrams(norm) });
        }
        if (items.length < CLUSTER_MIN_SIZE) return [];

        // 贪心聚类：每条归入第一个与其代表相似度达标的簇，否则自成新簇。
        // 贪心足够——组内相似度阈值高达 0.9，簇边界很清晰，不值得上层次聚类。
        const clusters = [];
        for (const item of items) {
            let placed = false;
            for (const cluster of clusters) {
                if (diceSimilarity(item.grams, cluster[0].grams) >= SIMILARITY_THRESHOLD) {
                    cluster.push(item);
                    placed = true;
                    break;
                }
            }
            if (!placed) clusters.push([item]);
        }

        // 已有规则的文本，用于判断某个簇是否已被覆盖
        const covered = existingPatterns.filter(p => p && p.text).map(p => p.text);

        const total = history.length;
        const found = [];
        for (const cluster of clusters) {
            if (cluster.length < CLUSTER_MIN_SIZE) continue;

            // 公共子串在归一化文本上求：原文里夹杂的 emoji/随机 ASCII 会把公共部分切碎
            const common = longestCommonSubstring(cluster.map(c => c.norm));
            const text = normalizePatternText(common);
            if (!text) continue;

            // 已有规则能命中这个模板就不重复造。注意方向：只要任一现成规则是
            // text 的子串，它就已经能抓到该模板的所有变体
            if (covered.some(c => text.includes(c))) continue;
            if (found.some(f => text.includes(f.text))) continue;

            found.push({
                text,
                count: cluster.length,
                ratio: cluster.length / total,
                // 标记该规则须对归一化文本匹配，见 matchHeuristicPattern
                normalized: true
            });
            console.log(`🎓 聚类发现新规则「${text}」（${cluster.length} 条相似历史评论，归一化匹配）`);
        }

        return found;
    }

    /**
     * 触发启发式学习，更新规则
     */
    function learnHeuristicPatterns() {
        const history = config.get('blockHistory') || [];
        if (history.length < LEARN_TRIGGER_COUNT) return; // 样本太少，统计不可靠

        // 中文停用词（评论文本常见无意义词）
        const commentStopWords = [
            '哈哈', '哈哈哈', '笑死', '确实', '真的', '这个', '什么', '怎么',
            '可以', '不是', '就是', '还是', '已经', '应该', '觉得', '感觉'
        ];

        // 英文停用词（常见虚词、代词、冠词等）
        const englishStopWords = [
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
            'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
            'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
            'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
            'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go',
            'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them',
            'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over',
            'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work',
            'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these',
            'give', 'day', 'most', 'us', 'is', 'was', 'are', 'been', 'has', 'had',
            'were', 'said', 'did', 'having', 'may', 'should', 'am', 'being'
        ];

        const allStopWords = [...commentStopWords, ...englishStopWords];

        // 昵称与评论仍分开提取——两者的文本特征不同，阈值也不同（昵称短、重复度高，
        // 占比门槛可以更严）。但产出的规则不带维度标记：匹配时对昵称和评论各试一次。
        const displayNames = history.map(h => h.displayName).filter(n => n);
        const displayNamePatterns = extractCommonSubstrings(displayNames, {
            minLen: 5,
            maxLen: 8,
            minRatio: 0.15,  // 提高到 15%，避免学到过于通用的词
            minCount: 4,     // 提高到 4 次
            stopWords: allStopWords
        });

        const commentTexts = history.map(h => h.commentText).filter(t => t);
        const commentPatterns = extractCommonSubstrings(commentTexts, {
            minLen: 6,       // 从 5 提高到 6，避免过短的子串
            maxLen: 10,
            minRatio: 0.10,  // 提高到 10%，避免低频噪音
            minCount: 4,     // 提高到 4 次
            stopWords: allStopWords
        });

        const oldPatterns = config.get('heuristicPatterns') || [];

        // 相似聚类补充：子串统计要求同一子串出现 ≥5 次，覆盖不到"整句雷同但用词位置
        // 飘忽"的低频模板。这里从另一个角度找——历史里 ≥3 条高度相似的评论视为同一
        // 模板，取其公共子串成规则。已被现成规则覆盖的组跳过，不重复造。
        const clusterPatterns = learnFromSimilarClusters(history, [
            ...oldPatterns,
            ...(config.get('userCustomPatterns') || []),
            ...commentPatterns
        ]);

        const newPatterns = [...displayNamePatterns, ...commentPatterns, ...clusterPatterns];

        // 合并规则：保留所有旧规则 + 添加新规则，更新重复规则的统计数据
        const mergedMap = new Map();

        // 先添加所有旧规则。存量规则要过一遍 normalizePatternText：库里躺着在 @mention
        // 清理完善前学到的脏数据（带 @ 尾巴、纯账号名），不规范化就没法被包含判定吃掉。
        // 规范化后可能与其他规则撞车，取 count 更大的那条。
        // key 只用 text：规则不再分维度，同一句文案从昵称和评论两条路学到时自然合成一条
        oldPatterns.forEach(op => {
            const text = normalizePatternText(op.text);
            if (!text) return; // 清理后无价值，直接淘汰
            const prev = mergedMap.get(text);
            if (!prev || (op.count || 0) > (prev.count || 0)) {
                mergedMap.set(text, stripLegacySource({ ...op, text }));
            }
        });

        // 再添加或更新新规则
        newPatterns.forEach(np => {
            const existing = mergedMap.get(np.text);
            if (existing) {
                // 更新已存在规则的统计数据，保留用户的启用/禁用状态。
                // normalized 必须一并透传：丢了它，聚类规则会退化成拿归一化子串比对原文，
                // 永远匹配不上（原文里夹着被归一化剥掉的随机 ASCII / emoji）。
                mergedMap.set(np.text, {
                    text: np.text,
                    count: Math.max(np.count || 0, existing.count || 0),
                    ratio: Math.max(np.ratio || 0, existing.ratio || 0),
                    normalized: np.normalized || existing.normalized,
                    enabled: existing.enabled,
                    createdAt: existing.createdAt
                });
            } else {
                // 添加新规则
                mergedMap.set(np.text, {
                    text: np.text,
                    count: np.count,
                    ratio: np.ratio,
                    normalized: np.normalized,
                    enabled: true, // 默认启用
                    createdAt: Date.now()
                });
            }
        });

        const merged = Array.from(mergedMap.values());

        // 全局去重：清理新旧规则合并后的重复碎片。
        // 排序键是关键：count 降序让命中最多、最泛化的规则先落地，再由它吃掉派生变体；
        // 同 count 时取更短的——短规则覆盖面更广（"体制内老师" 能抓到所有变体，
        // "体制内老师 sao的" 只能抓一种）。原实现按长度降序，恰好留下了最窄的那批。
        merged.sort((a, b) => b.count - a.count || a.text.length - b.text.length);
        const globalFiltered = [];
        for (const p of merged) {
            let covered = false;
            for (const kept of globalFiltered) {
                if (isRedundantPattern(kept, p)) {
                    covered = true;
                    break;
                }
            }
            if (!covered) globalFiltered.push(p);
        }

        config.set('heuristicPatterns', globalFiltered);
        console.log(`🎓 启发式学习完成：保留 ${oldPatterns.length} 条旧规则，发现 ${newPatterns.length} 条新规则，去重后总计 ${globalFiltered.length} 条`, globalFiltered);

        // 新规则学习后，扫描页面上已经过AI但被判为normal的评论，用新规则追杀
        if (globalFiltered.length > 0 && isOnTweetDetailPage()) {
            const commentersMap = getAllCommentersWithText();
            let retroCount = 0;
            for (const [username, data] of commentersMap) {
                if (blockedUsersSet.has(username)) continue;
                for (const p of globalFiltered) {
                    if (!p.enabled) continue;
                    if (matchHeuristicPattern(p, data.displayName, data.text)) {
                        console.log(`🎯 启发式追杀「${p.text}」@${username}（${data.displayName}）`);
                        blockedUsersSet.add(username);
                        markCommentByCategory(username, 'blacklist');
                        blockUser(username, data.text);
                        retroCount++;
                        break;
                    }
                }
            }
            if (retroCount > 0) console.log(`🎓 启发式追杀完成：${retroCount} 人`);
        }
    }

    /**
     * 获取所有启用的启发式规则（自动学习 + 手动添加）
     * @returns {Array<{text: string, enabled: boolean}>}
     */
    function getEnabledHeuristicPatterns() {
        const learned = (config.get('heuristicPatterns') || []).filter(p => p.enabled);
        const custom = (config.get('userCustomPatterns') || []).filter(p => p.enabled);
        return [...learned, ...custom];
    }

    // 前置 spam 检测：命中两条规则中的任一条就判黑名单
    // 返回命中的规则名（null 表示未命中）
    function detectSpamRule(text) {
        if (isBrokenWordSpam(text)) return 'broken-word';
        if (isBotDecorSpam(text)) return 'bot-decor';
        return null;
    }

    // ==================== 规则 5：批量相似评论检测 ====================
    // 垃圾/色情引流评论往往成批出现，文案高度雷同，仅在 emoji、空格、前后缀
    // 上做随机变化（如"没人比我玩的开了吧🐺💩我福不黑不信你看" vs
    // "应该没人比我玩的开了吧🧐😀 我福不黑不信你看"）。
    // 归一化后用字符 bigram Dice 系数比对：同一推文下两个不同用户的评论
    // 相似度 >= 阈值即整组判黑。选 Dice 而非编辑距离：模板评论的变化集中在
    // 前后缀增删，编辑距离相似度会被拉低到 80% 以下漏判，bigram 集合比对不受影响。
    const SIMILARITY_MIN_LENGTH = 10;   // 归一化后最小长度，短文本（"来了""第一"）撞车概率高
    const SIMILARITY_THRESHOLD = 0.9;   // bigram Dice 相似度阈值
    const SIMILARITY_MIN_UNIQUE = 5;    // 归一化后最少唯一字符数，防"哈哈哈哈…"类刷梗误伤
    const SIMILARITY_CORPUS_CAP = 500;  // 每条推文的语料上限，防长会话内存/CPU 膨胀

    // 归一化：小写化并去掉空白/emoji/符号，只保留字母数字（含 CJK）
    function normalizeForSimilarity(text) {
        if (!text || typeof text !== 'string') return '';
        // 先去掉 @mention（垃圾评论常夹杂 @xxx 稀释相似度）
        const noMention = text.replace(/@\w+/g, '');
        // 检测是否 CJK 为主：垃圾团伙在 CJK 文案中夹杂随机 ASCII 逃避检测，CJK-only 归一化可秒杀
        const cjkChars = noMention.match(/[一-鿿぀-ゟ゠-ヿ가-힯]/g);
        const totalChars = noMention.replace(/\s/g, '').length;
        if (cjkChars && totalChars > 0 && cjkChars.length / totalChars > 0.5) {
            // CJK 占比 > 50%：只保留 CJK 字符，去掉随机 ASCII 干扰
            return cjkChars.join('');
        }
        // 否则：保留所有字母数字（原逻辑）
        return noMention.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    }

    function charBigrams(str) {
        const grams = new Set();
        const chars = [...str]; // 展开为码点，正确处理代理对
        for (let i = 0; i < chars.length - 1; i++) grams.add(chars[i] + chars[i + 1]);
        return grams;
    }

    function diceSimilarity(setA, setB) {
        if (setA.size === 0 || setB.size === 0) return 0;
        const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
        let inter = 0;
        for (const g of small) if (big.has(g)) inter++;
        return (2 * inter) / (setA.size + setB.size);
    }

    // 当前推文的评论语料（跨滚动批次累积，路由变化时重置）
    let similarityCorpus = [];

    // ==================== 规则 6：与历史拉黑评论比对 ====================
    // 规则 5 是同推文内横向比对（需要两个不同用户同时在场才能发现）。
    // 但同一批文案会在不同推文、不同时间反复投放，历史拉黑记录本身就是
    // 已确认的垃圾样本库——新评论只要与其中任一条高度相似，单条即可判黑，
    // 不必等同伙一起出现，也比启发式学习（要攒够 5 次同一子串）反应更快。
    // 阈值取得比规则 5 高：历史里可能混有误杀记录，避免误判扩散。
    const HISTORY_SIMILARITY_THRESHOLD = 0.92;

    // 历史 bigram 缓存：避免每批评论都重算 100 条历史的 bigram 集合
    let historyGramsCache = null;
    let historyGramsDirty = true;

    function getHistoryGrams() {
        if (historyGramsCache && !historyGramsDirty) return historyGramsCache;
        const history = config.get('blockHistory') || [];
        historyGramsCache = [];
        for (const h of history) {
            if (!h.commentText) continue;
            const norm = normalizeForSimilarity(h.commentText);
            const chars = [...norm];
            // 与规则 5 同样的护栏：太短/字符太单一的历史样本不参与比对，避免误伤
            if (chars.length < SIMILARITY_MIN_LENGTH) continue;
            if (new Set(chars).size < SIMILARITY_MIN_UNIQUE) continue;
            historyGramsCache.push({
                displayName: h.displayName,
                text: h.commentText,
                grams: charBigrams(norm)
            });
        }
        historyGramsDirty = false;
        return historyGramsCache;
    }

    /**
     * 与历史拉黑评论比对相似度
     * @param {string} text - 待检评论
     * @returns {{sim: string, peerText: string, peerName: string}|null}
     */
    function detectHistorySimilarity(text) {
        const norm = normalizeForSimilarity(text);
        const chars = [...norm];
        if (chars.length < SIMILARITY_MIN_LENGTH) return null;
        if (new Set(chars).size < SIMILARITY_MIN_UNIQUE) return null;

        const grams = charBigrams(norm);
        const historyGrams = getHistoryGrams();
        let best = null;
        for (const h of historyGrams) {
            const sim = diceSimilarity(grams, h.grams);
            if (sim >= HISTORY_SIMILARITY_THRESHOLD && (!best || sim > best.raw)) {
                best = { raw: sim, sim: (sim * 100).toFixed(0), peerText: h.text, peerName: h.displayName };
            }
        }
        return best;
    }

    /**
     * 批量相似评论检测：新评论与本推文已见评论两两比对。
     * 同伙可能分散在不同滚动批次里，因此此前批次被判正常的老评论
     * 一旦与新评论构成相似集群，也会出现在返回值中（追溯拉黑）。
     * @param {Array<{username, displayName, text}>} newComments
     * @returns {Map<string, {displayName, text, peer, sim}>} username -> 命中信息
     */
    function detectSimilaritySpamBatch(newComments) {
        const hits = new Map();
        for (const c of newComments) {
            const norm = normalizeForSimilarity(c.text);
            const chars = [...norm];
            if (chars.length < SIMILARITY_MIN_LENGTH) continue;
            if (new Set(chars).size < SIMILARITY_MIN_UNIQUE) continue;
            const grams = charBigrams(norm);

            for (const prev of similarityCorpus) {
                if (prev.username === c.username) continue; // 同一用户重复发不算批量
                const sim = diceSimilarity(grams, prev.grams);
                if (sim >= SIMILARITY_THRESHOLD) {
                    const pct = (sim * 100).toFixed(0);
                    if (!hits.has(c.username)) {
                        hits.set(c.username, { displayName: c.displayName, text: c.text, peer: prev.username, sim: pct });
                    }
                    if (!hits.has(prev.username)) {
                        hits.set(prev.username, { displayName: prev.displayName, text: prev.text, peer: c.username, sim: pct });
                    }
                }
            }

            if (similarityCorpus.length < SIMILARITY_CORPUS_CAP) {
                similarityCorpus.push({ username: c.username, displayName: c.displayName, text: c.text, grams });
            }
        }
        return hits;
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
- blacklist：（最高优先级）包含上方"用户黑名单关键词"的评论（若已配置）；明确的色情引流（如发布约炮链接、招嫖广告、卖淫信息），而非玩笑性质的荤段子或擦边调侃；诈骗、钓鱼、恶意链接；针对具体个人的直接死亡威胁或暴力恐吓（注意：情绪化的泛指脏话、抱怨社会、骂街发泄不算）；煽动针对特定族群的暴力或种族灭绝言论（注意：普通政治吐槽、讽刺体制、批评政府、牢骚不算）；明显的机器人刷屏;大量 emoji/符号夹杂无实质内容的英文抒情句等。
- spam：评论内容本身包含推广链接、重复刷屏、或明确的商品/服务推销。仅根据评论内容判断，不要因为昵称像营销号就归入 spam。
- 其它（与原推文相关的正常讨论、提问、赞同、批评等）视为 normal，不需要返回。
- 重要：username（@后面的ID）不是判断依据，不要因为 username 看起来像某种含义就做出判断。只根据评论内容和昵称（displayName）判断。
- 宁可放过，不可误杀。如果一条评论虽然用词粗俗或擦边，但明显是在参与话题讨论（而非引流/诈骗/刷屏），应归为 normal。


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
        const articles = DOMQuery.getAllTweets();

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
                applySpamOverlay(article, reason);
            }
        });
    }

    /**
     * 给一条评论加上垃圾评论遮罩（单条与批量标记共用）
     * @param {HTMLElement} article
     * @param {string} reason
     */
    function applySpamOverlay(article, reason) {
        article.style.position = 'relative';

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

        const reasonText = document.createElement('div');
        reasonText.style.cssText = `
            color: #ccc;
            font-size: 11px;
        `;
        reasonText.textContent = reason;

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

        showButton.addEventListener('mouseenter', () => {
            showButton.style.background = '#0d8bd9';
            showButton.style.transform = 'scale(1.05)';
        });
        showButton.addEventListener('mouseleave', () => {
            showButton.style.background = '#1DA1F2';
            showButton.style.transform = 'scale(1)';
        });

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

    /**
     * 批量标记评论。
     * markCommentByCategory 每次调用都要 querySelectorAll 全量扫描，批量拉黑
     * 时会退化成 N 次全量遍历；这里只遍历一次 DOM，并把所有样式写入放进同一个
     * requestAnimationFrame，避免逐条同步写样式反复触发重排造成卡顿。
     * @param {Set<string>} blacklistSet
     * @param {Set<string>} spamSet
     */
    function markCommentsByCategoryBatch(blacklistSet, spamSet) {
        if (!isOnTweetDetailPage()) return;
        if (blacklistSet.size === 0 && spamSet.size === 0) return;

        const articles = DOMQuery.getAllTweets();
        const toHide = [];
        const toMask = [];

        articles.forEach(article => {
            if (article.hasAttribute('data-ai-filtered')) return;
            const userNameArea = article.querySelector('[data-testid="User-Name"]');
            if (!userNameArea) return;

            // 取出该 article 作者，再查集合，避免对每个用户名各做一次 querySelector
            const link = userNameArea.querySelector('a[role="link"][href^="/"]');
            if (!link) return;
            const username = link.getAttribute('href').slice(1);
            if (!username || username.includes('/')) return;

            if (blacklistSet.has(username)) toHide.push(article);
            else if (spamSet.has(username)) toMask.push(article);
        });

        if (toHide.length === 0 && toMask.length === 0) return;

        requestAnimationFrame(() => {
            toHide.forEach(article => {
                article.setAttribute('data-ai-filtered', 'blacklist');
                article.setAttribute('data-blacklist-reason', '');
                article.style.display = 'none';
            });
            toMask.forEach(article => {
                article.setAttribute('data-ai-filtered', 'spam');
                applySpamOverlay(article, '');
            });
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

        // ✅ 判定为 blacklist 后立即记录到学习历史
        for (const username of blacklistSet) {
            const displayName = getDisplayName(username);
            const commentText = previewText(username);
            recordBlockHistory(username, displayName, commentText);
        }

        // 标记 UI 和加入已拉黑集合。
        // markCommentByCategory 每次调用都要全量遍历所有 article，一批 30 人
        // 就是 30 次全量扫描，因此这里改为一次遍历批量处理。
        for (const username of blacklistSet) {
            console.log(t('consoleAiFilterBlacklist', {
                displayName: getDisplayName(username),
                username,
                text: previewText(username)
            }));
            blockedUsersSet.add(username);
        }
        for (const username of spamSet) {
            console.log(t('consoleAiFilterSpam', {
                displayName: getDisplayName(username),
                username,
                text: previewText(username)
            }));
        }
        markCommentsByCategoryBatch(blacklistSet, spamSet);

        // 拉黑操作放后台，不阻塞 UI 标记和后续批次
        if (blacklistSet.size > 0) {
            Promise.all([...blacklistSet].map(username => blockUser(username, previewText(username)))).catch(() => {});
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
            // 清理可能残留的指示器 DOM（用户动态关闭开关时）
            const oldIndicator = document.getElementById('ai-filter-status');
            if (oldIndicator) oldIndicator.remove();
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
    const TOOLBAR_ESTIMATED_HEIGHT = 200; // 工具栏展开后的预估总高度（含多个按钮+间隙）

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
        // 视口边界保护（工具栏展开后高度约 TOOLBAR_ESTIMATED_HEIGHT）
        x = Math.max(0, Math.min(x, Math.max(0, w - btn)));
        y = Math.max(0, Math.min(y, Math.max(0, h - TOOLBAR_ESTIMATED_HEIGHT)));
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

        // Click to toggle expand (点击主按钮展开/收起，不再随鼠标滑过自动弹出)
        let isExpanded = false;
        function setExpanded(expanded) {
            isExpanded = expanded;
            actionsContainer.style.opacity = expanded ? '1' : '0';
            actionsContainer.style.transform = expanded ? 'translateY(0)' : 'translateY(10px)';
            actionsContainer.style.pointerEvents = expanded ? 'auto' : 'none';
        }

        // 点击工具栏之外的区域时收起菜单
        document.addEventListener('click', (e) => {
            if (isExpanded && !container.contains(e.target)) {
                setExpanded(false);
            }
        });

        // Dragging functionality（区分「点击」与「拖拽」：移动超过阈值才算拖拽）
        const DRAG_THRESHOLD = 5; // px，小于此位移视为点击
        let isMouseDown = false;
        let hasDragged = false;
        let dragOffset = { x: 0, y: 0 };
        let dragStart = { x: 0, y: 0 };

        mainButton.addEventListener('mousedown', (e) => {
            isMouseDown = true;
            hasDragged = false;
            dragStart.x = e.clientX;
            dragStart.y = e.clientY;
            dragOffset.x = e.clientX - container.offsetLeft;
            dragOffset.y = e.clientY - container.offsetTop;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isMouseDown) return;

            // 仅当位移超过阈值时才进入拖拽状态
            if (!hasDragged) {
                const dx = Math.abs(e.clientX - dragStart.x);
                const dy = Math.abs(e.clientY - dragStart.y);
                if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
                hasDragged = true;
                mainButton.style.cursor = 'grabbing';
                container.style.transition = 'none';
            }

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
            if (!isMouseDown) return;
            isMouseDown = false;

            if (hasDragged) {
                // 拖拽结束：恢复样式并保存位置
                mainButton.style.cursor = 'move';
                container.style.transition = '';
                saveToolbarPosition(parseInt(container.style.left), parseInt(container.style.top));
            } else {
                // 未拖拽 = 点击：切换菜单展开状态
                setExpanded(!isExpanded);
            }
        });

        // Main button hover effect
        mainButton.addEventListener('mouseenter', function () {
            if (!hasDragged) {
                this.style.transform = 'scale(1.1)';
                this.style.boxShadow = '0 3px 12px rgba(29, 161, 242, 0.55)';
            }
        });

        mainButton.addEventListener('mouseleave', function () {
            if (!hasDragged) {
                this.style.transform = 'scale(1)';
                this.style.boxShadow = '0 2px 8px rgba(29, 161, 242, 0.35)';
            }
        });

        document.body.appendChild(container);

        // 监听图片浏览模态窗口的打开/关闭，避免工具栏遮挡导航按钮
        const hideToolbarWhenModalOpen = () => {
            const photoModal = document.querySelector('[role="dialog"][aria-modal="true"]');
            if (photoModal) {
                // 检查是否是图片浏览模态窗口（包含 carousel 或 Previous/Next slide 按钮）
                const isPhotoViewer = photoModal.querySelector('[role="group"][aria-roledescription="carousel"]') ||
                                     photoModal.querySelector('button[aria-label*="slide"]');
                if (isPhotoViewer) {
                    container.style.display = 'none';
                    return;
                }
            }
            container.style.display = 'flex';
        };

        // 初始检查
        hideToolbarWhenModalOpen();

        // 监听 DOM 变化（模态窗口的打开/关闭）
        const modalObserver = new MutationObserver(hideToolbarWhenModalOpen);
        modalObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-modal', 'role']
        });

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

    // 屏蔽进度反馈。手动屏蔽已从工具栏移到油猴菜单，没有按钮可更新，
    // 进度只输出到控制台。
    function updateButtonStatus(text, isProcessing = false) {
        if (isProcessing) console.log(`🚫 ${text}`);
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
        const articles = DOMQuery.getAllTweets();
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
                // 用 textContent 而非 innerText：innerText 会强制同步布局重排，
                // 本函数由 MutationObserver 每 300ms 全量重扫所有 article 调用，
                // 逐条重排是 AI 过滤卡顿的直接原因。昵称是单行 span，两者结果一致。
                const displayNameElement = userNameArea.querySelector('span');
                const displayName = displayNameElement ? displayNameElement.textContent : username;

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

    /**
     * 把评论内容格式化成日志后缀。
     * 无文本时返回空串，让 {text} 占位符原地消失，日志退化成原来的单行格式。
     */
    function blockLogSuffix(text) {
        if (!text) return '';
        const oneLine = String(text).replace(/\s+/g, ' ').trim();
        if (!oneLine) return '';
        return `：${oneLine.length > 120 ? oneLine.substring(0, 120) + '…' : oneLine}`;
    }

    // Block user via API (后台拉黑，无UI干扰)
    async function blockUserByAPI(username, commentText = '') {
        const text = blockLogSuffix(commentText);
        try {
            console.log(t('consoleTryBlockAPI', { username, text }));

            // 获取CSRF token
            const csrfToken = document.cookie.match(/ct0=([^;]+)/)?.[1];
            if (!csrfToken) {
                throw new Error('Failed to get CSRF token');
            }

            let userId = null;
            let isFollowing = false;

            // 优先从缓存中获取 userId
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

            // 保护已关注的用户不被误拉黑。
            // 必须返回 'skipped' 而非 false：调用方的 `API || UI` 短路会把 false
            // 当成"API 挂了"从而降级到 UI 点击，把这层保护直接绕过去。
            if (isFollowing) {
                console.log(t('consoleBlockSkipFollowing', { username, text }));
                return 'skipped';
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
                console.log(t('consoleBlockSuccess', { username, text }));
                return true;
            } else {
                const errorText = await blockResponse.text();
                throw new Error(`Block request failed: ${blockResponse.status} ${errorText}`);
            }
        } catch (error) {
            console.error(t('consoleBlockFailed', { username, text }), error);
            return false;
        }
    }

    // Block user by clicking UI elements
    // silent=true: skip scrolling (for auto-block, avoids disrupting user's scroll position)
    async function blockUserByUI(username, silent = false, commentText = '') {
        const text = blockLogSuffix(commentText);
        try {
            console.log(t('consoleTryBlockUI', { username, text }));

            const originalScrollY = window.scrollY;

            // Find the user's comment element
            const articles = DOMQuery.getAllTweets();
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
                console.log(t('consoleBlockSuccess', { username, text }));
                restoreScroll();
                return true;
            } else {
                console.log(t('consoleNotFoundConfirm'));
                restoreScroll();
                return false;
            }
        } catch (error) {
            console.error(t('consoleBlockFailed', { username, text }), error);
            return false;
        }
    }

    /**
     * 统一拉黑入口：所有拉黑请求都必须经过这里，去重逻辑只此一处。
     *
     * 收敛掉的三类重复：
     * 1. 跨流水线重复：关键词自动拉黑与 AI 过滤并发运行，各自维护 processed Set
     *    互不知情，同一用户会被两条线各拉黑一次（两遍 UserByScreenName + 两遍
     *    blocks/create）。blockOutcome 是进程级共享结账簿，第二次直接短路。
     * 2. 同名并发重复：同一轮里 Promise.all 可能对同名并行发起，await 之前谁都没
     *    来得及写 blockOutcome，光靠"查表"挡不住。blockInFlight 让后来者复用同一
     *    个 Promise。
     * 3. 路径重复：以前各调用点自行选 API 或 UI。统一为 API 优先——UI 点击会让
     *    Twitter 弹原生 toast，后台静默拉黑时那是纯干扰；仅 API 真失败才降级。
     *
     * blockOutcome 故意不随路由清空：它记录的是"这个账号已经拉黑过"这一账号级
     * 事实，跨推文恒成立。而 blockedUsersSet 服务于隐藏 DOM，换页必须清空，
     * 否则时间线推文会被误隐藏——两者生命周期不同，不能合并。
     *
     * @param {string} username
     * @param {string} [commentText] 触发拉黑的评论内容，仅用于日志追溯
     * @returns {Promise<'blocked'|'skipped'|'duplicate'|'failed'>}
     *   duplicate 表示此前已处理过，调用方不应重复计数
     */
    async function blockUser(username, commentText = '') {
        const prior = blockOutcome.get(username);
        if (prior) return 'duplicate';

        const inFlight = blockInFlight.get(username);
        if (inFlight) {
            await inFlight;
            return 'duplicate';
        }

        const task = (async () => {
            const apiResult = await blockUserByAPI(username, commentText);
            if (apiResult === 'skipped') return 'skipped';
            if (apiResult === true) {
                updateStats(1, 0); // 成功拉黑，统计+1
                return 'blocked';
            }
            // API 真失败（网络/限流/结构变更）才降级 UI 点击兜底
            const uiResult = await blockUserByUI(username, true, commentText);
            if (uiResult) {
                updateStats(1, 0); // 成功拉黑，统计+1
                return 'blocked';
            }
            return 'failed';
        })();

        blockInFlight.set(username, task);
        try {
            const outcome = await task;
            // 失败不记账，留待下一轮重试；成功和跳过都是终态
            if (outcome !== 'failed') blockOutcome.set(username, outcome);
            if (outcome === 'blocked') blockedUsersSet.add(username);
            return outcome;
        } finally {
            blockInFlight.delete(username);
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

            // 走统一入口：内部 API 优先、失败降级 UI，并负责跨流水线去重
            const outcome = await blockUser(username, commentersMap.get(username)?.text);

            if (outcome === 'blocked') {
                blockedCount++;
                blockedUsers.push(username);
            } else if (outcome === 'failed') {
                failedCount++;
                failedUsers.push(username);
            }
            // skipped（已关注）/ duplicate（本会话已处理）都不计数

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
            if (blockOutcome.has(username)) continue;       // 另一条流水线已经处理过

            const matchedKeyword = keywords.find(kw => data.text.includes(kw));
            if (matchedKeyword) {
                console.log(t('consoleKeywordMatched', { keyword: matchedKeyword, username, text: data.text.substring(0, 50) }));
                toBlock.push(username);
                autoBlockProcessed.add(username);
            }
        }

        let autoBlocked = 0, autoFailed = 0;
        for (const username of toBlock) {
            const outcome = await blockUser(username, commentersMap.get(username)?.text);
            if (outcome === 'blocked') autoBlocked++;
            else if (outcome === 'failed') autoFailed++;
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

    // ==================== AI 判定结果缓存 ====================
    // 同一条推文刷新/回访时，已判定过的用户不再重复送 AI，直接省 token。
    // key: "<tweetId>|<username>"，value: { v: 'n'|'b'|'s', t: 判定时间, l: 判定时聚合评论文本长度 }
    // 失效机制（三层）：
    // - TTL 7 天：推文讨论热度基本几天内结束，过期条目在加载时清理
    // - 上限 2000 条：超限按时间淘汰最旧，防止存储无限增长
    // - l 字段：该用户又发了新评论（聚合文本变长）则缓存失效重新判定
    // 注意：缓存必须在前置规则之后检查——规则会进化，新学的启发式规则
    // 要能命中此前判 normal 的用户，不能被缓存挡住。
    const VERDICT_CACHE_KEY = 'aiVerdictCache';
    const VERDICT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const VERDICT_CACHE_MAX = 2000;
    let verdictCache = null;
    let verdictCacheDirty = false;
    let verdictCacheFlushScheduled = false;

    function loadVerdictCache() {
        if (verdictCache) return verdictCache;
        let raw = {};
        try { raw = JSON.parse(GM_getValue(VERDICT_CACHE_KEY, '{}')) || {}; } catch (_) { raw = {}; }
        const now = Date.now();
        let entries = Object.entries(raw).filter(([, e]) => e && now - e.t < VERDICT_TTL_MS);
        if (entries.length > VERDICT_CACHE_MAX) {
            entries.sort((a, b) => b[1].t - a[1].t);
            entries = entries.slice(0, VERDICT_CACHE_MAX);
        }
        verdictCache = Object.fromEntries(entries);
        return verdictCache;
    }

    function getVerdictCache(tweetId, username) {
        return loadVerdictCache()[`${tweetId}|${username}`] || null;
    }

    function setVerdictCache(tweetId, username, verdict, textLen) {
        loadVerdictCache()[`${tweetId}|${username}`] = { v: verdict, t: Date.now(), l: textLen };
        verdictCacheDirty = true;
        // 合并落盘：一批判定写完后只序列化一次
        if (!verdictCacheFlushScheduled) {
            verdictCacheFlushScheduled = true;
            setTimeout(() => {
                verdictCacheFlushScheduled = false;
                if (!verdictCacheDirty) return;
                verdictCacheDirty = false;
                try { GM_setValue(VERDICT_CACHE_KEY, JSON.stringify(verdictCache)); } catch (_) { }
            }, 0);
        }
    }

    function getTweetIdFromUrl() {
        const m = location.pathname.match(/\/status\/(\d+)/);
        return m ? m[1] : null;
    }

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
            // 同时排除已拉黑用户：关键词自动拉黑是并发的另一条流水线，它处理过的人
            // 只记在 autoBlockProcessed 里，AI 线看不到，会再送一遍 AI 白花 token。
            // blockOutcome 是两条线共享的结账簿，查它即可跨流水线去重。
            const allComments = Array.from(commentersMap.entries())
                .filter(([username]) => !aiFilterProcessed.has(username) && !blockOutcome.has(username))
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

            // 统计扫描的评论数
            updateStats(0, allComments.length);

            // 前置规则检测：
            //   规则 1 broken-word：英文单词被符号/emoji 硬拆开 >= WORD_SPLIT_THRESHOLD 次
            //   规则 2 bot-decor：评论中包含机器人装饰字符 >= WORD_SPLIT_THRESHOLD 次（冷僻 Unicode，普通输入法打不出）
            //   规则 3 displayName-keyword：昵称包含关键词黑名单（直接可见，无需 API）
            //   规则 4 heuristic：昵称/评论匹配启发式学习的规则
            //   规则 5 batch-similarity：同推文下不同用户的评论文本高度雷同（批量模板刷屏）
            //   规则 6 history-similarity：与历史拉黑评论高度相似（跨推文、跨时间复用同一文案）
            // 任一命中直接判黑名单，不送 AI，节省 token 也更稳定
            const displayNameKeywordsRaw = config.get('displayNameKeywords') || '';
            const displayNameKeywords = displayNameKeywordsRaw.split('\n').map(k => k.trim()).filter(k => k.length > 0);
            const heuristicPatterns = getEnabledHeuristicPatterns();
            // 规则 5 是跨评论比对，须先对整批计算（内部会累积语料并追溯此前批次的同伙）
            const similarityHits = detectSimilaritySpamBatch(allComments);

            const preFilterBlacklist = [];
            const preFilterReason = new Map(); // username -> label
            const comments = [];
            for (const c of allComments) {
                let matched = false;

                // 检查评论文本规则
                const rule = detectSpamRule(c.text);
                if (rule) {
                    preFilterBlacklist.push(c.username);
                    const ruleLabel = rule === 'broken-word'
                        ? `单词夹断 ≥${WORD_SPLIT_THRESHOLD}`
                        : `机器人装饰字符 ≥${WORD_SPLIT_THRESHOLD}`;
                    preFilterReason.set(c.username, ruleLabel);
                    console.log(`🎯 前置命中（${ruleLabel}）@${c.username}: ${c.text.substring(0, 80)}`);
                    recordBlockHistory(c.username, c.displayName, c.text); // ✅ 记录学习
                    matched = true;
                }

                // 检查昵称是否包含关键词黑名单
                if (!matched && displayNameKeywords.length > 0 && c.displayName) {
                    const matchedKeyword = matchDisplayNameKeyword(c.displayName, displayNameKeywords);
                    if (matchedKeyword) {
                        preFilterBlacklist.push(c.username);
                        preFilterReason.set(c.username, `昵称关键词「${matchedKeyword}」`);
                        console.log(`🎯 前置命中（昵称关键词「${matchedKeyword}」）@${c.username}（${c.displayName}）`);
                        recordBlockHistory(c.username, c.displayName, c.text); // ✅ 记录学习
                        matched = true;
                    }
                }

                // 检查启发式规则（昵称 + 评论）
                if (!matched && heuristicPatterns.length > 0) {
                    for (const pattern of heuristicPatterns) {
                        if (matchHeuristicPattern(pattern, c.displayName, c.text)) {
                            preFilterBlacklist.push(c.username);
                            const source = pattern.count ? `启发式·${(pattern.ratio * 100).toFixed(0)}%` : '手动添加';
                            preFilterReason.set(c.username, `启发式规则「${pattern.text}」`);
                            console.log(`🎯 前置命中（启发式规则「${pattern.text}」，${source}）@${c.username}（${c.displayName}）`);
                            recordBlockHistory(c.username, c.displayName, c.text); // ✅ 记录学习（包含评论）
                            matched = true;
                            break;
                        }
                    }
                }

                // 检查批量相似评论（规则 5）
                if (!matched && similarityHits.has(c.username)) {
                    const hit = similarityHits.get(c.username);
                    preFilterBlacklist.push(c.username);
                    preFilterReason.set(c.username, `批量相似评论（${hit.sim}% ≈ @${hit.peer}）`);
                    console.log(`🎯 前置命中（批量相似评论，相似度 ${hit.sim}%，同伙 @${hit.peer}）@${c.username}: ${c.text.substring(0, 80)}`);
                    // 学习记录由 processAIFilterResults 统一完成
                    matched = true;
                }

                // 检查与历史拉黑评论的相似度（规则 6）：单条即可判黑，无需同伙在场
                if (!matched) {
                    const histHit = detectHistorySimilarity(c.text);
                    if (histHit) {
                        preFilterBlacklist.push(c.username);
                        preFilterReason.set(c.username, `历史相似评论（${histHit.sim}%）`);
                        console.log(`🎯 前置命中（历史相似评论，相似度 ${histHit.sim}%）@${c.username}: ${c.text.substring(0, 60)}\n    ↳ 历史样本（${histHit.peerName}）: ${histHit.peerText.substring(0, 60)}`);
                        matched = true;
                    }
                }

                if (!matched) {
                    comments.push(c);
                }
            }

            // 规则 5 追溯命中：此前批次被判正常、这次与新评论构成相似集群的老用户
            // （不在本批 allComments 中，需要单独补进黑名单）
            for (const [username, hit] of similarityHits) {
                if (preFilterReason.has(username)) continue;                  // 本批已处理
                if (allComments.some(c => c.username === username)) continue; // 本批用户已在循环中处理
                if (blockedUsersSet.has(username)) continue;                  // 已被拉黑
                preFilterBlacklist.push(username);
                preFilterReason.set(username, `批量相似评论（追溯，${hit.sim}%）`);
                console.log(`🎯 前置命中（批量相似评论·追溯，相似度 ${hit.sim}%，同伙 @${hit.peer}）@${username}: ${hit.text.substring(0, 80)}`);
            }

            // 先处理前置命中的黑名单（直接拉黑，不走 AI）
            if (preFilterBlacklist.length > 0) {
                const preMap = new Map(allComments
                    .filter(c => preFilterBlacklist.includes(c.username))
                    .map(c => [c.username, { text: c.text, displayName: c.displayName, avatarUrl: c.avatarUrl }]));
                // 补充追溯命中的老用户（不在本批 allComments 中，取语料里存的信息）
                for (const username of preFilterBlacklist) {
                    if (!preMap.has(username)) {
                        const hit = similarityHits.get(username);
                        if (hit) preMap.set(username, { text: hit.text, displayName: hit.displayName, avatarUrl: '' });
                    }
                }
                await processAIFilterResults({ blacklist: preFilterBlacklist, spam: [] }, preMap);
                if (!stillOnDetail()) return;
                preFilterBlacklist.forEach(u => aiFilterProcessed.add(u));
            }

            // AI 判定缓存分流：前置规则都没命中的用户，若本推文下已判定过
            // 且此后没发新评论，直接复用结果，不再送 AI
            const tweetId = getTweetIdFromUrl();
            let needAI = comments;
            if (tweetId && comments.length > 0) {
                needAI = [];
                const cachedBlacklist = new Set();
                const cachedSpam = new Set();
                let cachedNormal = 0;
                for (const c of comments) {
                    const entry = getVerdictCache(tweetId, c.username);
                    // 聚合文本比判定时更长 = 有新评论，缓存失效重判
                    if (!entry || c.text.length > entry.l) { needAI.push(c); continue; }
                    if (entry.v === 'b') cachedBlacklist.add(c.username);
                    else if (entry.v === 's') cachedSpam.add(c.username);
                    else cachedNormal++;
                    aiFilterProcessed.add(c.username);
                }
                if (cachedBlacklist.size > 0 || cachedSpam.size > 0 || cachedNormal > 0) {
                    console.log(`💾 AI判定缓存命中 ${cachedBlacklist.size + cachedSpam.size + cachedNormal} 条（黑名单 ${cachedBlacklist.size}，垃圾 ${cachedSpam.size}，正常 ${cachedNormal}），送AI ${needAI.length} 条`);
                }
                if (cachedBlacklist.size > 0 || cachedSpam.size > 0) {
                    cachedBlacklist.forEach(u => blockedUsersSet.add(u));
                    markCommentsByCategoryBatch(cachedBlacklist, cachedSpam);
                    // 还能看到该用户评论，多半上次拉黑失败或未生效，补一次（不重复记学习历史）。
                    // 走 blockUser：判定缓存是持久化的（跨会话），而 blockOutcome 是进程级的，
                    // 所以每次页面加载会补拉黑一次，但本次会话内 MutationObserver 反复触发
                    // autoAIFilterComments 时不会重复发请求。
                    if (cachedBlacklist.size > 0) {
                        const textOf = new Map(comments.map(c => [c.username, c.text]));
                        Promise.all([...cachedBlacklist].map(u => blockUser(u, textOf.get(u)))).catch(() => { });
                    }
                }
            }

            if (needAI.length === 0) {
                updateAIFilterStatus(t('aiFilterStatusComplete'), true);
                aiFilterInProgress = false;
                return;
            }

            // 提取原推文内容，用于让 AI 判断评论与原文的相关性
            const mainTweet = extractTweetContent();

            // 显示状态指示器
            updateAIFilterStatus(t('aiFilterStatusProcessing', { current: 0, total: needAI.length }));

            // 批量调用AI分类（每次最多处理30条评论，最多2个批次并行）
            const batchSize = 30;
            const concurrency = 2;
            let processedCount = 0;

            for (let i = 0; i < needAI.length; i += batchSize * concurrency) {
                if (!stillOnDetail()) return;

                // 构建本轮要并行发送的批次
                const batches = [];
                for (let j = 0; j < concurrency && i + j * batchSize < needAI.length; j++) {
                    const start = i + j * batchSize;
                    batches.push(needAI.slice(start, start + batchSize));
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
                    // 写入判定缓存：blacklist/spam 按 AI 返回，其余为 normal
                    if (tweetId) {
                        const blSet = new Set(item.results?.blacklist || []);
                        const spSet = new Set(item.results?.spam || []);
                        item.batch.forEach(c => {
                            const v = blSet.has(c.username) ? 'b' : (spSet.has(c.username) ? 's' : 'n');
                            setVerdictCache(tweetId, c.username, v, c.text.length);
                        });
                    }
                    processedCount += item.batch.length;
                }

                updateAIFilterStatus(t('aiFilterStatusProcessing', {
                    current: processedCount,
                    total: needAI.length
                }));
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
     * 重新对页面上所有已拉黑用户的评论施加隐藏。
     *
     * 用于同推文子视图切换（点开图片/互动列表）后补隐藏。这类切换会让 Twitter 挂上
     * 新的 article 节点，而 blockOutcome 已记账、两条流水线都会跳过这些用户，
     * 若不主动补一遍，已拉黑的人会重新出现在模态框的评论区里。
     *
     * 判定依据用 blockOutcome 而非 blockedUsersSet：后者服务于隐藏 DOM 且换页即清空，
     * 前者是账号级事实的长生命周期记录，跨子视图仍然成立。
     */
    function reapplyBlockedHiding() {
        if (!isOnTweetDetailPage()) return;

        // 收集所有已拉黑的用户
        const blocked = new Set();
        for (const [username, outcome] of blockOutcome) {
            if (outcome === 'blocked') blocked.add(username);
        }
        blockedUsersSet.forEach(u => blocked.add(u));
        if (blocked.size === 0) return;

        // 遍历所有推文，隐藏已拉黑用户的评论
        let hidden = 0;
        DOMQuery.getAllTweets().forEach(article => {
            if (article.hasAttribute('data-ai-filtered')) return;

            const username = DOMQuery.getUsernameFromArticle(article);
            if (!username) return;

            if (blocked.has(username)) {
                article.setAttribute('data-ai-filtered', 'blacklist');
                article.style.display = 'none';
                hidden++;
            }
        });

        if (hidden > 0) console.log(`🚫 子视图切换后补隐藏 ${hidden} 条已拉黑用户的评论`);
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
        if (reapplyDebounceTimer) {
            clearTimeout(reapplyDebounceTimer);
            reapplyDebounceTimer = null;
        }

        commentObserver = new MutationObserver(() => {
            // 只在推文详情页运行，避免在时间线误触发
            if (!isOnTweetDetailPage()) return;

            // 对 reapplyBlockedHiding 也添加防抖，避免在图文页面因频繁的 DOM 变化
            // （图片懒加载、媒体播放器渲染等）导致每秒执行几十次 querySelectorAll
            if (reapplyDebounceTimer) clearTimeout(reapplyDebounceTimer);
            reapplyDebounceTimer = setTimeout(() => {
                reapplyDebounceTimer = null;
                if (isOnTweetDetailPage()) {
                    reapplyBlockedHiding();
                }
            }, 100);

            // 延迟执行 AI 过滤，避免频繁触发
            if (commentDebounceTimer) clearTimeout(commentDebounceTimer);
            commentDebounceTimer = setTimeout(() => {
                commentDebounceTimer = null;
                if (!aiFilterInProgress && isOnTweetDetailPage()) {
                    autoAIFilterComments();
                }
            }, 300);
        });

        // 优化监听范围：只监听主内容区，而不是整个 body
        // 图文页面的图片加载、媒体播放器等变化主要在 article 内部
        // 缩小监听范围可以减少无关 DOM 变化的触发次数
        const primaryColumn = document.querySelector('[data-testid="primaryColumn"]');
        const targetNode = primaryColumn || document.body;

        commentObserver.observe(targetNode, {
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

        try {
            // 先滚动加载更多评论
            console.log(t('consoleLoading'));
            let previousHeight = 0;
            let stableCount = 0;
            let totalScrolls = 0;
            const maxScrollAttempts = parseInt(config.get('scrollAttempts')) || 5;

            while (stableCount < 2 && totalScrolls < maxScrollAttempts) {
                window.scrollTo(0, document.body.scrollHeight);
                // 高度已稳定时只做短暂确认，不再整轮干等
                await sleep(stableCount === 0 ? 700 : 400);
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
            console.log('🔍 手动 AI 过滤结束');
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

    // 手动屏蔽 / 手动 AI 过滤已从工具栏移除，改为油猴菜单入口（低频操作，
    // 不占用页面空间）。只注册一次，避免 SPA 路由切换时重复注册。
    let menuCommandsRegistered = false;
    function registerManualMenuCommands() {
        if (menuCommandsRegistered) return;
        menuCommandsRegistered = true;
        // i18n 文本自带 emoji，不再传 icon 以免重复
        config.registerMenuCommand('buttonText', handleBlockAllCommenters);
        config.registerMenuCommand('aiFilterButtonText', handleManualAIFilter);
        config.registerMenuCommand('summarizeButtonText', handleAISummarize);
    }

    // Initialize
    function init() {
        registerManualMenuCommands();

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

        // 启动补学：检查是否有积压未学习的记录（上次会话积累到 FIFO 满后学习失效）
        const totalRecorded = config.get('totalRecorded') || 0;
        const lastLearnedAt = config.get('lastLearnedAt') || 0;
        const history = config.get('blockHistory') || [];
        if (history.length >= LEARN_TRIGGER_COUNT && totalRecorded - lastLearnedAt >= LEARN_TRIGGER_COUNT) {
            console.log(`🎓 启动补学：积压 ${totalRecorded - lastLearnedAt} 条记录未学习，立即触发`);
            const runCatchup = () => {
                learnHeuristicPatterns();
                config.set('lastLearnedAt', totalRecorded);
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(runCatchup, { timeout: 3000 });
            } else {
                setTimeout(runCatchup, 500);
            }
        }
    }

    // Initialize after page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Listen for route changes (SPA)
    let lastUrl = location.href;
    let lastTweetIdentity = getTweetIdentity();
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;

            // 同一条推文内切子视图（/photo/N、/likes、/retweets、/quotes）不算换页：
            // 背后的详情页 DOM 没变，走全量重置会把已隐藏的评论重新显示出来，
            // 且因 blockOutcome 已记账，两条流水线都会跳过，不会再补隐藏。
            // 这里只重跑一次隐藏兜底，把模态框新挂上来的 article 也一并处理。
            const identity = getTweetIdentity();
            if (identity && identity === lastTweetIdentity) {
                reapplyBlockedHiding();
                return;
            }
            lastTweetIdentity = identity;
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
            // 清空相似评论语料，避免跨推文误比对
            similarityCorpus = [];
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
            if (reapplyDebounceTimer) {
                clearTimeout(reapplyDebounceTimer);
                reapplyDebounceTimer = null;
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

