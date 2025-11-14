// ==UserScript==
// @name         ifly-21tb 增强脚本 (视频控制+自动答题)
// @namespace    http://tampermonkey.net/
// @version      1.4.1
// @description  视频页：左右键快进/回退，数字键调速。考试页：直接调用Dify API自动答题，无需本地代理服务，支持暂停/继续、失败题目重试。
// @author       yuan
// @match        *://*.21tb.com/*
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/21tb/21tbHepler.js
// @updateURL    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/21tb/21tbHepler.js
// ==/UserScript==

/**
 * ============================================================
 * 脚本功能概述：
 * 
 * 1. 视频控制增强
 *    - 键盘快捷键控制：左右箭头快进/回退，数字键调速
 *    - 浮动速度控制按钮
 * 
 * 2. 考试自动答题
 *    - 直接调用 Dify API 进行智能答题（v1.4 新特性）
 *    - 无需本地代理服务，所有配置存储在浏览器中
 *    - 支持暂停/继续控制
 *    - 配置通过油猴菜单管理，方便快捷
 *    - 失败题目重试功能（v1.5 新特性）
 * 
 * 更新日志 (v1.5)：
 * - 新增失败题目重试功能
 * - 自动记录答题失败的题目
 * - 答题完成后显示失败题目数量和重试按钮
 * - 支持多次重试，直到所有题目成功
 * 
 * 更新日志 (v1.4)：
 * - 移除对本地 proxy_iflyek.py 服务的依赖
 * - 直接调用 Dify API，使用 Bearer Token 认证
 * - 新增 difyApiKey 配置项
 * - 优化配置管理，所有设置存储在浏览器本地
 * - 增强错误提示和状态显示
 * ============================================================
 */

(function () {
    'use strict';

    /******************************************************************
     *
     * PART 0: 配置管理模块
     * 
     * 功能说明：
     * - 管理用户配置，包括角色、能力、Dify API 地址和密钥
     * - 配置数据通过 GM_setValue/GM_getValue 存储在浏览器本地
     * - 用户可通过油猴菜单修改配置（无需修改代码）
     *
     ******************************************************************/

    // 默认配置
    // 注意：首次使用前请通过油猴菜单"⚙️ 21tb脚本设置"配置 difyApiKey
    const DEFAULT_CONFIG = {
        role: "科大讯飞公司的规章制度专家",        // AI 角色设定
        ability: "保密",                            // AI 能力范围
        difyApiUrl: "https://api.dify.ai/v1/workflows/run",  // Dify API 端点地址
        difyApiKey: ""                              // Dify API Key (必须配置，格式: app-xxxxxxxx)
    };

    // 获取配置值，如果用户未设置则使用默认值
    function getConfig(key) {
        return GM_getValue(key, DEFAULT_CONFIG[key]);
    }

    // 设置配置值
    function setConfig(key, value) {
        GM_setValue(key, value);
    }

    // 创建全局设置面板（只创建一次）
    let settingsPanelCreated = false;
    let settingsPanel = null;
    let settingsOverlay = null;

    /**
     * 创建设置面板 UI
     */
    function createSettingsPanel() {
        if (settingsPanelCreated) return;

        // 添加设置面板样式
        GM_addStyle(`
            /* 设置面板遮罩层 */
            #tb21-settings-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999998;
                display: none;
            }
            
            #tb21-settings-overlay.show {
                display: block;
            }

            /* 设置面板容器 */
            #tb21-settings-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 90%;
                max-width: 600px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                z-index: 999999;
                display: none;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            #tb21-settings-panel.show {
                display: block;
                animation: tb21-slideIn 0.3s ease;
            }

            @keyframes tb21-slideIn {
                from {
                    opacity: 0;
                    transform: translate(-50%, -45%);
                }
                to {
                    opacity: 1;
                    transform: translate(-50%, -50%);
                }
            }

            /* 设置面板头部 */
            #tb21-settings-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            #tb21-settings-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
            }

            #tb21-settings-close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
                transition: background 0.2s;
            }

            #tb21-settings-close-btn:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            /* 设置面板内容 */
            #tb21-settings-content {
                padding: 24px;
                max-height: 70vh;
                overflow-y: auto;
            }

            .tb21-form-group {
                margin-bottom: 20px;
            }

            .tb21-form-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 500;
                color: #374151;
                font-size: 14px;
            }

            .tb21-form-group input,
            .tb21-form-group textarea {
                width: 100%;
                padding: 10px 12px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                font-size: 14px;
                transition: border-color 0.2s;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            .tb21-form-group input:focus,
            .tb21-form-group textarea:focus {
                outline: none;
                border-color: #667eea;
            }

            .tb21-form-group input::placeholder,
            .tb21-form-group textarea::placeholder {
                color: #9ca3af;
            }

            .tb21-form-help {
                margin-top: 6px;
                font-size: 12px;
                color: #6b7280;
                line-height: 1.5;
            }

            .tb21-form-actions {
                display: flex;
                gap: 12px;
                margin-top: 24px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
            }

            .tb21-btn {
                flex: 1;
                padding: 10px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }

            .tb21-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }

            .tb21-btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
            }

            .tb21-btn-secondary {
                background: #f3f4f6;
                color: #374151;
            }

            .tb21-btn-secondary:hover {
                background: #e5e7eb;
            }

            .tb21-success-message {
                background: #d1fae5;
                color: #065f46;
                padding: 12px 16px;
                border-radius: 8px;
                margin-bottom: 16px;
                font-size: 14px;
                display: none;
                border-left: 4px solid #10b981;
            }

            .tb21-success-message.show {
                display: block;
                animation: tb21-fadeIn 0.3s ease;
            }

            @keyframes tb21-fadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .tb21-config-status {
                display: inline-block;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 500;
                margin-left: 8px;
            }

            .tb21-config-status.configured {
                background: #d1fae5;
                color: #065f46;
            }

            .tb21-config-status.not-configured {
                background: #fee2e2;
                color: #991b1b;
            }
        `);

        // 创建遮罩层
        settingsOverlay = document.createElement('div');
        settingsOverlay.id = 'tb21-settings-overlay';
        settingsOverlay.addEventListener('click', hideSettingsPanel);
        document.body.appendChild(settingsOverlay);

        // 创建设置面板
        settingsPanel = document.createElement('div');
        settingsPanel.id = 'tb21-settings-panel';
        settingsPanel.innerHTML = `
            <div id="tb21-settings-header">
                <h3>⚙️ 21tb 脚本配置</h3>
                <button id="tb21-settings-close-btn">×</button>
            </div>
            <div id="tb21-settings-content">
                <div class="tb21-success-message" id="tb21-save-success">
                    ✓ 配置已成功保存！
                </div>
                
                <div class="tb21-form-group">
                    <label for="tb21-role">
                        AI 角色设定
                        <span class="tb21-config-status configured" id="tb21-role-status">已配置</span>
                    </label>
                    <input 
                        type="text" 
                        id="tb21-role" 
                        placeholder="例如：科大讯飞公司的规章制度专家"
                        autocomplete="off"
                    />
                    <div class="tb21-form-help">
                        定义 AI 助手的角色，帮助其更好地理解问题背景
                    </div>
                </div>
                
                <div class="tb21-form-group">
                    <label for="tb21-ability">
                        AI 能力范围
                        <span class="tb21-config-status configured" id="tb21-ability-status">已配置</span>
                    </label>
                    <input 
                        type="text" 
                        id="tb21-ability" 
                        placeholder="例如：保密"
                        autocomplete="off"
                    />
                    <div class="tb21-form-help">
                        定义 AI 助手可以处理的问题范围和能力边界
                    </div>
                </div>
                
                <div class="tb21-form-group">
                    <label for="tb21-api-url">
                        Dify 工作流 API 地址
                        <span class="tb21-config-status" id="tb21-url-status"></span>
                    </label>
                    <input 
                        type="text" 
                        id="tb21-api-url" 
                        placeholder="https://api.dify.ai/v1/workflows/run"
                        autocomplete="off"
                    />
                    <div class="tb21-form-help">
                        在 Dify 平台的工作流设置中获取 API 端点地址
                    </div>
                </div>
                
                <div class="tb21-form-group">
                    <label for="tb21-api-key">
                        Dify API Key <span style="color: #ef4444;">*</span>
                        <span class="tb21-config-status" id="tb21-key-status"></span>
                    </label>
                    <input 
                        type="password" 
                        id="tb21-api-key" 
                        placeholder="app-xxxxxxxxxxxxxxxx"
                        autocomplete="off"
                    />
                    <div class="tb21-form-help">
                        在 Dify 平台的工作流 API 访问页面获取密钥（以 app- 开头）<br/>
                        <strong>注意：此为必填项，未配置将无法使用自动答题功能</strong>
                    </div>
                </div>
                
                <div class="tb21-form-actions">
                    <button class="tb21-btn tb21-btn-secondary" id="tb21-cancel-btn">取消</button>
                    <button class="tb21-btn tb21-btn-primary" id="tb21-save-btn">保存配置</button>
                </div>
            </div>
        `;
        document.body.appendChild(settingsPanel);

        // 绑定事件
        settingsPanel.querySelector('#tb21-settings-close-btn').addEventListener('click', hideSettingsPanel);
        settingsPanel.querySelector('#tb21-cancel-btn').addEventListener('click', hideSettingsPanel);
        settingsPanel.querySelector('#tb21-save-btn').addEventListener('click', saveSettings);

        // 按 Enter 键保存
        const inputs = settingsPanel.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') saveSettings();
            });
        });

        settingsPanelCreated = true;
    }

    /**
     * 显示设置面板
     */
    function showSettingsPanel() {
        if (!settingsPanelCreated) {
            createSettingsPanel();
        }

        // 填充当前配置值
        document.getElementById('tb21-role').value = getConfig('role');
        document.getElementById('tb21-ability').value = getConfig('ability');
        document.getElementById('tb21-api-url').value = getConfig('difyApiUrl');
        document.getElementById('tb21-api-key').value = getConfig('difyApiKey');

        // 隐藏成功消息
        document.getElementById('tb21-save-success').classList.remove('show');

        // 更新配置状态标识
        updateConfigStatus();

        // 显示面板
        settingsPanel.classList.add('show');
        settingsOverlay.classList.add('show');

        // 聚焦到第一个输入框
        setTimeout(() => document.getElementById('tb21-role').focus(), 100);
    }

    /**
     * 隐藏设置面板
     */
    function hideSettingsPanel() {
        if (settingsPanel) {
            settingsPanel.classList.remove('show');
            settingsOverlay.classList.remove('show');
        }
    }

    /**
     * 保存设置
     */
    function saveSettings() {
        const role = document.getElementById('tb21-role').value.trim();
        const ability = document.getElementById('tb21-ability').value.trim();
        const apiUrl = document.getElementById('tb21-api-url').value.trim();
        const apiKey = document.getElementById('tb21-api-key').value.trim();

        // 基本验证
        if (!role) {
            alert('请输入 AI 角色设定');
            document.getElementById('tb21-role').focus();
            return;
        }

        if (!ability) {
            alert('请输入 AI 能力范围');
            document.getElementById('tb21-ability').focus();
            return;
        }

        if (!apiUrl) {
            alert('请输入 Dify API 地址');
            document.getElementById('tb21-api-url').focus();
            return;
        }

        if (!apiKey) {
            alert('请输入 Dify API Key（必填项）');
            document.getElementById('tb21-api-key').focus();
            return;
        }

        // 验证 URL 格式
        try {
            new URL(apiUrl);
        } catch (e) {
            alert('请输入有效的 API 地址（必须以 http:// 或 https:// 开头）');
            document.getElementById('tb21-api-url').focus();
            return;
        }

        // 验证 API Key 格式
        if (!apiKey.startsWith('app-')) {
            alert('API Key 格式不正确，应该以 "app-" 开头');
            document.getElementById('tb21-api-key').focus();
            return;
        }

        // 保存配置
        setConfig('role', role);
        setConfig('ability', ability);
        setConfig('difyApiUrl', apiUrl);
        setConfig('difyApiKey', apiKey);

        // 更新状态标识
        updateConfigStatus();

        // 显示成功消息
        const successMsg = document.getElementById('tb21-save-success');
        successMsg.classList.add('show');

        console.log('[21tb脚本] 配置已保存');

        // 2秒后自动关闭面板
        setTimeout(() => {
            hideSettingsPanel();
            successMsg.classList.remove('show');
        }, 2000);
    }

    /**
     * 更新配置状态显示
     */
    function updateConfigStatus() {
        const urlStatus = document.getElementById('tb21-url-status');
        const keyStatus = document.getElementById('tb21-key-status');

        // 更新 URL 状态
        const apiUrl = getConfig('difyApiUrl');
        if (apiUrl && apiUrl !== 'https://api.dify.ai/v1/workflows/run') {
            urlStatus.textContent = '已配置';
            urlStatus.className = 'tb21-config-status configured';
        } else {
            urlStatus.textContent = '使用默认';
            urlStatus.className = 'tb21-config-status configured';
        }

        // 更新 Key 状态
        const apiKey = getConfig('difyApiKey');
        if (apiKey && apiKey.length > 0) {
            keyStatus.textContent = '已配置';
            keyStatus.className = 'tb21-config-status configured';
        } else {
            keyStatus.textContent = '未配置';
            keyStatus.className = 'tb21-config-status not-configured';
        }
    }

    // 注册油猴菜单命令
    GM_registerMenuCommand("⚙️ 21tb脚本设置", showSettingsPanel);

    GM_registerMenuCommand("🔄 重置为默认配置", function () {
        if (confirm('确定要重置所有配置为默认值吗？\n\n注意：这将清除您的 API Key 等所有自定义配置！')) {
            setConfig('role', DEFAULT_CONFIG.role);
            setConfig('ability', DEFAULT_CONFIG.ability);
            setConfig('difyApiUrl', DEFAULT_CONFIG.difyApiUrl);
            setConfig('difyApiKey', DEFAULT_CONFIG.difyApiKey);
            alert('配置已重置为默认值！\n请重新配置 Dify API Key 后使用。');
            console.log('[21tb脚本] 配置已重置为默认值');
        }
    });

    /******************************************************************
     *
     * PART 1: 考试自动答题模块
     *
     ******************************************************************/

    function initializeExamModule() {
        if (document.querySelector('.exam-main') && document.querySelector('.paper-content')) {
            console.log('[脚本] 检测到考试页面，加载自动答题模块。');

            let isPaused = false;
            let isRunning = false;

            // --- 配置信息 (使用用户设置或默认值) ---
            const DIFY_API_URL = getConfig('difyApiUrl');
            const DIFY_API_KEY = getConfig('difyApiKey');

            // --- UI界面 ---
            GM_addStyle(`
                #auto-exam-panel { position: fixed; bottom: 20px; left: 20px; background-color: #f7f7f7; border: 1px solid #ccc; padding: 15px; z-index: 99999; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); font-family: Arial, sans-serif; width: 280px; }
                #auto-exam-panel h3 { margin-top: 0; margin-bottom: 10px; color: #333; font-size: 16px; text-align: center; }
                .exam-btn-group { display: flex; gap: 10px; flex-wrap: wrap; }
                .exam-btn { flex-grow: 1; padding: 10px; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background-color 0.3s; }
                #start-exam-btn { background-color: #4CAF50; }
                #start-exam-btn:hover { background-color: #45a049; }
                #start-exam-btn:disabled { background-color: #aaa; cursor: not-allowed; }
                #pause-exam-btn { background-color: #f44336; display: none; }
                #pause-exam-btn:hover { background-color: #da190b; }
                #retry-exam-btn { background-color: #ff9800; display: none; }
                #retry-exam-btn:hover { background-color: #f57c00; }
                #exam-status { margin-top: 10px; padding: 8px; background-color: #e9e9e9; border-radius: 4px; font-size: 13px; color: #555; text-align: center; min-height: 20px; }
                #config-info { margin-top: 8px; padding: 6px; background-color: #e3f2fd; border-radius: 4px; font-size: 11px; color: #1976d2; text-align: center; }
                #failed-questions-info { margin-top: 8px; padding: 6px; background-color: #fff3cd; border-radius: 4px; font-size: 11px; color: #856404; text-align: center; display: none; }
            `);

            const panel = document.createElement('div');
            panel.id = 'auto-exam-panel';

            // 检查 API Key 是否已配置
            const apiKeyConfigured = DIFY_API_KEY && DIFY_API_KEY.length > 0;
            const configStatus = apiKeyConfigured
                ? `✅ API已配置`
                : `⚠️ 请先配置API Key`;

            panel.innerHTML = `
                <h3>自动答题控制台</h3>
                <div class="exam-btn-group">
                    <button id="start-exam-btn" class="exam-btn">开始自动答题</button>
                    <button id="pause-exam-btn" class="exam-btn">暂停</button>
                    <button id="retry-exam-btn" class="exam-btn">重试失败题目</button>
                </div>
                <div id="exam-status">准备就绪</div>
                <div id="config-info">
                    角色: ${getConfig('role')} | 能力: ${getConfig('ability')}<br/>
                    ${configStatus}
                </div>
                <div id="failed-questions-info"></div>
            `;
            document.body.appendChild(panel);

            const startBtn = document.getElementById('start-exam-btn');
            const pauseBtn = document.getElementById('pause-exam-btn');
            const retryBtn = document.getElementById('retry-exam-btn');
            const statusDiv = document.getElementById('exam-status');
            const failedInfoDiv = document.getElementById('failed-questions-info');

            // 存储失败的题目信息
            let failedQuestions = [];

            startBtn.addEventListener('click', startAnsweringProcess);
            pauseBtn.addEventListener('click', () => {
                isPaused = !isPaused;
                if (isPaused) {
                    pauseBtn.textContent = '继续';
                    pauseBtn.style.backgroundColor = '#ff9800'; // 黄色
                    updateStatus('已暂停，点击"继续"以恢复');
                } else {
                    pauseBtn.textContent = '暂停';
                    pauseBtn.style.backgroundColor = '#f44336'; // 红色
                    updateStatus('已恢复，继续答题...');
                }
            });
            retryBtn.addEventListener('click', retryFailedQuestions);

            function updateStatus(text) {
                console.log(text);
                statusDiv.textContent = text;
            }

            function delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            /**
             * 直接调用 Dify API 获取答案
             * 
             * 工作原理（第一性原理）：
             * 1. 验证 API Key 是否已配置（安全性检查）
             * 2. 将题目数据和配置参数组装成 Dify 标准格式
             * 3. 通过 HTTPS 向 Dify 工作流发送请求（使用 Bearer Token 认证）
             * 4. 解析返回的 JSON 数据，提取答案
             * 5. 处理各种异常情况（网络错误、超时、解析失败等）
             * 
             * @param {Object} questionData - 题目数据对象，包含题型、题目、选项等信息
             * @returns {Promise} - 返回 Promise，resolve 时包含答案对象 {type, ans}
             */
            function fetchAnswer(questionData) {
                return new Promise((resolve, reject) => {
                    // 检查 API Key 是否配置
                    if (!DIFY_API_KEY) {
                        reject("请先配置 Dify API Key！点击油猴菜单中的 '⚙️ 21tb脚本设置' 进行配置。");
                        return;
                    }

                    // 构建 Dify API 请求负载（遵循 Dify 工作流标准格式）
                    const payload = {
                        "inputs": {
                            "role": getConfig('role'),              // AI 角色设定
                            "ability": getConfig('ability')         // AI 能力设定

                        },
                        "query": JSON.stringify(questionData),// 题目数据（JSON 字符串）
                        "response_mode": "blocking",  // 阻塞模式：等待完整响应
                        "conversation_id": "",
                        "user": "21tb-helper-user"    // 用户标识
                    };

                    GM_xmlhttpRequest({
                        method: "POST",
                        url: DIFY_API_URL,
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${DIFY_API_KEY}`  // 使用 Bearer Token 认证
                        },
                        data: JSON.stringify(payload),
                        timeout: 30000,  // 30秒超时
                        onload: (response) => {
                            if (response.status >= 200 && response.status < 300) {
                                try {
                                    const data = JSON.parse(response.responseText);

                                    // 尝试多种可能的返回结构提取答案
                                    // Dify 工作流可能返回: data.data.outputs.text 或 data.answer
                                    let answerStr = data.data?.outputs?.text
                                        || data.data?.outputs?.result
                                        || data.data?.outputs?.answer
                                        || data.answer
                                        || "";

                                    if (!answerStr) {
                                        reject("API 返回数据中未找到答案字段。原始返回: " + response.responseText);
                                        return;
                                    }

                                    // 去除可能的 Markdown 代码块包裹 ```json ... ```
                                    answerStr = answerStr.replace(/^```json\s*/, "")
                                        .replace(/^```\s*/, "")
                                        .replace(/```\s*$/, "")
                                        .trim();

                                    // 解析 JSON 格式答案
                                    const parsed = JSON.parse(answerStr);

                                    // 返回标准结构：{ type: "...", ans: [...] }
                                    resolve(parsed);
                                } catch (e) {
                                    reject("解析答案失败: " + e.message + "。原始返回: " + response.responseText);
                                }
                            } else {
                                reject("Dify API 返回错误状态码: " + response.status + " " + response.statusText);
                                console.log(response.responseText);
                            }
                        },
                        onerror: (err) => reject("网络请求失败: " + (err?.statusText || '未知错误')),
                        ontimeout: () => reject("请求超时，请检查网络连接或稍后重试")
                    });
                });
            }


            async function startAnsweringProcess() {
                if (isRunning) return;
                isRunning = true; isPaused = false;
                failedQuestions = []; // 重置失败题目列表
                startBtn.disabled = true; startBtn.textContent = '答题中...';
                pauseBtn.style.display = 'block'; pauseBtn.textContent = '暂停'; pauseBtn.style.backgroundColor = '#f44336';
                retryBtn.style.display = 'none'; // 隐藏重试按钮
                failedInfoDiv.style.display = 'none'; // 隐藏失败信息
                const questionElements = document.querySelectorAll('.question-panel-middle');
                const total = questionElements.length;
                updateStatus(`发现 ${total} 道题目，开始处理...`);
                await delay(1000);
                let count = 0;
                let successCount = 0;
                for (const el of questionElements) {
                    count++;
                    while (isPaused) { await delay(500); }
                    updateStatus(`正在处理第 ${count} / ${total} 题...`);
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await delay(1000);
                    try {
                        const questionData = extractQuestionData(el);
                        if (!questionData) {
                            updateStatus(`第 ${count} 题: 无法识别题型，已跳过`);
                            // 记录为失败题目
                            failedQuestions.push({
                                element: el,
                                index: count,
                                questionData: null,
                                error: '无法识别题型'
                            });
                            await delay(1000);
                            continue;
                        }
                        updateStatus(`第 ${count} 题: 已提取，请求答案...`);
                        updateStatus(JSON.stringify(questionData));
                        // console.log(`${JSON.stringify(questionData)}`)
                        const answerData = await fetchAnswer(questionData);
                        updateStatus(`第 ${count} 题: 收到答案 "${answerData.ans}"`);
                        selectAnswer(el, questionData.typeClass, answerData);
                        successCount++;
                        await delay(1500);
                    } catch (error) {
                        updateStatus(`第 ${count} 题出错: ${error}`);
                        // 记录失败的题目
                        const questionData = extractQuestionData(el);
                        failedQuestions.push({
                            element: el,
                            index: count,
                            questionData: questionData,
                            error: error.toString()
                        });
                        await delay(2000);
                    }
                }

                // 显示完成状态
                if (failedQuestions.length === 0) {
                    updateStatus(`所有题目处理完毕！成功: ${successCount}/${total}`);
                } else {
                    updateStatus(`答题完成！成功: ${successCount}/${total}，失败: ${failedQuestions.length}/${total}`);
                    // 显示重试按钮和失败信息
                    retryBtn.style.display = 'block';
                    failedInfoDiv.style.display = 'block';
                    failedInfoDiv.innerHTML = `⚠️ 有 ${failedQuestions.length} 道题目未成功回答，请点击"重试失败题目"按钮重试`;
                }

                startBtn.disabled = false; startBtn.textContent = '开始自动答题';
                pauseBtn.style.display = 'none';
                isRunning = false;
            }

            /**
             * 重试失败的题目
             */
            async function retryFailedQuestions() {
                if (isRunning) return;
                if (failedQuestions.length === 0) {
                    updateStatus('没有需要重试的题目');
                    return;
                }

                isRunning = true;
                isPaused = false;
                startBtn.disabled = true;
                retryBtn.disabled = true;
                retryBtn.textContent = '重试中...';
                pauseBtn.style.display = 'block';
                pauseBtn.textContent = '暂停';
                pauseBtn.style.backgroundColor = '#f44336';

                const totalFailed = failedQuestions.length;
                updateStatus(`开始重试 ${totalFailed} 道失败题目...`);
                await delay(1000);

                // 存储重试后仍然失败的题目
                const stillFailed = [];
                let retrySuccessCount = 0;

                for (let i = 0; i < failedQuestions.length; i++) {
                    const failed = failedQuestions[i];
                    while (isPaused) { await delay(500); }

                    updateStatus(`重试第 ${i + 1} / ${totalFailed} 题 (原第 ${failed.index} 题)...`);
                    failed.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await delay(1000);

                    try {
                        // 如果之前无法识别题型，再次尝试提取
                        let questionData = failed.questionData;
                        if (!questionData) {
                            questionData = extractQuestionData(failed.element);
                            if (!questionData) {
                                updateStatus(`第 ${failed.index} 题: 仍然无法识别题型`);
                                stillFailed.push({
                                    ...failed,
                                    questionData: null,
                                    error: '仍然无法识别题型'
                                });
                                await delay(1000);
                                continue;
                            }
                        }

                        updateStatus(`第 ${failed.index} 题: 已提取，请求答案...`);
                        const answerData = await fetchAnswer(questionData);
                        updateStatus(`第 ${failed.index} 题: 收到答案 "${answerData.ans}"`);
                        selectAnswer(failed.element, questionData.typeClass, answerData);
                        retrySuccessCount++;
                        await delay(1500);
                    } catch (error) {
                        updateStatus(`第 ${failed.index} 题重试失败: ${error}`);
                        stillFailed.push({
                            ...failed,
                            error: `重试失败: ${error.toString()}`
                        });
                        await delay(2000);
                    }
                }

                // 更新失败题目列表
                failedQuestions = stillFailed;

                // 显示重试结果
                if (stillFailed.length === 0) {
                    updateStatus(`重试完成！所有题目都已成功回答！`);
                    retryBtn.style.display = 'none';
                    failedInfoDiv.style.display = 'none';
                } else {
                    updateStatus(`重试完成！成功: ${retrySuccessCount}/${totalFailed}，仍有 ${stillFailed.length} 道题目失败`);
                    failedInfoDiv.innerHTML = `⚠️ 仍有 ${stillFailed.length} 道题目未成功回答，可继续点击"重试失败题目"按钮重试`;
                }

                startBtn.disabled = false;
                retryBtn.disabled = false;
                retryBtn.textContent = '重试失败题目';
                pauseBtn.style.display = 'none';
                isRunning = false;
            }

            function extractQuestionData(el) {
                const stemEl = el.querySelector('.question-stem');
                if (!stemEl) return null;
                const stem = stemEl.innerText.replace(/\s+/g, ' ').trim();
                let type = '', typeClass = '', options = [];
                if (el.classList.contains('SINGLE')) { type = '单选题'; typeClass = 'SINGLE'; }
                else if (el.classList.contains('MULTIPLE')) { type = '多选题'; typeClass = 'MULTIPLE'; }
                else if (el.classList.contains('JUDGMENT')) { type = '判断题'; typeClass = 'JUDGMENT'; }
                else { return null; }
                if (typeClass === 'SINGLE' || typeClass === 'MULTIPLE') {
                    el.querySelectorAll('.question-options li .item-detail').forEach(opt => options.push(opt.innerText.trim()));
                } else { options = ['正确', '错误']; }
                return { 题型: type, 题目: stem, 选项: options, typeClass: typeClass };
            }

            function selectAnswer(el, typeClass, answerData) {
                const answers = Array.isArray(answerData.ans)
                    ? answerData.ans.map(a => a.trim().toUpperCase())
                    : String(answerData.ans).split(',').map(a => a.trim().toUpperCase());

                if (typeClass === 'SINGLE' || typeClass === 'MULTIPLE') {
                    const optionInputs = el.querySelectorAll('.question-options li input');
                    for (const ans of answers) {
                        const index = ans.charCodeAt(0) - 'A'.charCodeAt(0);
                        if (optionInputs[index]) {
                            optionInputs[index].click();
                        } else {
                            throw new Error(`找不到选项 ${ans}`);
                        }
                    }
                } else if (typeClass === 'JUDGMENT') {
                    const ans = answers[0].toLowerCase(); // true / false
                    const inputEl = el.querySelector(`input[value="${ans}"]`);
                    if (inputEl) {
                        inputEl.click();
                    } else {
                        throw new Error(`找不到判断题选项 ${ans}`);
                    }
                }
            }

        }
    }


    /******************************************************************
     *
     * PART 2: 视频播放控制模块
     *
     ******************************************************************/

    function initializeVideoModule() {
        const interval = setInterval(() => {
            // const video = document.querySelector('div#J_prismPlayer video');
            const video = document.querySelector('video');
            if (video) {
                clearInterval(interval);
                console.log('[脚本] 检测到视频播放器，加载视频控制模块。');
                setupVideoControl(video);
            }
        }, 1000);
        function setupVideoControl(video) {
            document.addEventListener('keydown', (e) => {
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
                switch (e.key) {
                    case 'ArrowLeft': video.currentTime = Math.max(0, video.currentTime - 10); break;
                    case 'ArrowRight': video.currentTime = Math.min(video.duration, video.currentTime + 10); break;
                    case '1': video.playbackRate = 1.0; updateSpeedDisplay(video.playbackRate); break;
                    case '2': video.playbackRate = 1.5; updateSpeedDisplay(video.playbackRate); break;
                    case '3': video.playbackRate = 2.0; updateSpeedDisplay(video.playbackRate); break;
                }
            });
            if (!document.querySelector('#custom-speed-control')) {
                const speedBox = document.createElement('div');
                speedBox.id = 'custom-speed-control';
                Object.assign(speedBox.style, {
                    position: 'fixed', bottom: '20px', right: '20px', background: 'rgba(0,0,0,0.6)',
                    color: 'white', padding: '8px 12px', borderRadius: '10px', fontSize: '14px',
                    zIndex: 9999, cursor: 'pointer'
                });
                document.body.appendChild(speedBox);
                updateSpeedDisplay(video.playbackRate);
                speedBox.addEventListener('click', () => {
                    const nextRates = [1.0, 1.25, 1.5, 2.0];
                    const currentIdx = nextRates.indexOf(video.playbackRate);
                    const nextIdx = (currentIdx + 1) % nextRates.length;
                    video.playbackRate = nextRates[nextIdx];
                    updateSpeedDisplay(video.playbackRate);
                });
            }
        }
        function updateSpeedDisplay(rate) {
            const box = document.querySelector('#custom-speed-control');
            if (box) box.innerText = `当前速度：${rate}x`;
        }
    }

    // --- 脚本入口 ---
    window.addEventListener('load', () => {
        initializeExamModule();
        initializeVideoModule();
    });

})();