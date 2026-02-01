// ==UserScript==
// @name        Common Configuration Manager
// @name:zh-CN  通用配置管理模块
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Provides common configuration management with i18n support, dynamic config items and visual config panel
// @description:zh-CN  提供通用的配置管理功能，支持国际化、动态配置项和可视化配置界面
// @author       xixiu
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 通用配置管理模块 ====================
    class ConfigManager {
        constructor(configName, defaultConfig = {}, options = {}) {
            this.configName = configName;
            this.defaultConfig = defaultConfig;
            this.config = this.loadConfig();
            this.panel = null;
            this.overlay = null;
            this.isInitialized = false;

            // 国际化支持
            this.i18n = options.i18n || {};
            this.currentLang = options.lang || ConfigManager.detectLanguage();

            // 菜单命令
            this.menuCommands = [];
        }

        // ==================== 静态工具方法 ====================

        /**
         * 检测用户的系统语言
         * @returns {string} 语言代码 ('zh', 'en', 'ja', 'ko' 等)
         */
        static detectLanguage() {
            const lang = navigator.language || navigator.userLanguage || 'en';
            // 返回前两位语言代码
            return lang.toLowerCase().slice(0, 2);
        }

        /**
         * 简化检测是否为中文系统（兼容方法）
         * @returns {string} 'zh' 或 'en'
         */
        static detectLanguageSimple() {
            const lang = navigator.language || navigator.userLanguage || 'en';
            return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        }

        /**
         * 创建简单的 i18n 翻译器（无需实例化 ConfigManager）
         * @param {Object} i18nDict - i18n 字典对象
         * @param {string} lang - 语言代码（可选，默认自动检测）
         * @returns {Function} 翻译函数 t(key, params)
         * 
         * @example
         * const t = ConfigManager.createTranslator({
         *   en: { greeting: 'Hello {name}!' },
         *   zh: { greeting: '你好 {name}！' }
         * });
         * console.log(t('greeting', { name: 'World' }));
         */
        static createTranslator(i18nDict, lang = null) {
            const currentLang = lang || ConfigManager.detectLanguage();

            return function (key, paramsOrDefault = {}) {
                let text = '';
                let params = {};

                // 兼容：paramsOrDefault 可以是字符串或对象
                if (typeof paramsOrDefault === 'string') {
                    const defaultText = paramsOrDefault;
                    if (i18nDict[currentLang] && i18nDict[currentLang][key]) {
                        text = i18nDict[currentLang][key];
                    } else if (i18nDict['en'] && i18nDict['en'][key]) {
                        text = i18nDict['en'][key];
                    } else {
                        text = defaultText || key;
                    }
                } else {
                    params = paramsOrDefault || {};
                    if (i18nDict[currentLang] && i18nDict[currentLang][key]) {
                        text = i18nDict[currentLang][key];
                    } else if (i18nDict['en'] && i18nDict['en'][key]) {
                        text = i18nDict['en'][key];
                    } else {
                        text = key;
                    }
                }

                // 参数替换
                if (Object.keys(params).length > 0) {
                    Object.keys(params).forEach(param => {
                        text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
                    });
                }

                return text;
            };
        }

        // 加载配置
        loadConfig() {
            const savedConfig = GM_getValue(this.configName, '{}');
            try {
                const parsedConfig = JSON.parse(savedConfig);
                return { ...this.defaultConfig, ...parsedConfig };
            } catch (e) {
                console.warn(`[ConfigManager] 配置解析失败，使用默认配置: ${e.message}`);
                return { ...this.defaultConfig };
            }
        }

        // 保存配置
        saveConfig() {
            GM_setValue(this.configName, JSON.stringify(this.config));
        }

        // 获取配置值
        get(key) {
            return this.config[key];
        }

        // 设置配置值
        set(key, value) {
            this.config[key] = value;
            this.saveConfig();
        }

        // 获取所有配置
        getAll() {
            return { ...this.config };
        }

        // 重置配置
        reset() {
            this.config = { ...this.defaultConfig };
            this.saveConfig();
        }

        // 初始化配置界面
        init(configItems = []) {
            if (this.isInitialized) return;

            this.configItems = configItems;
            this.addStyles();
            this.createPanel();
            this.createOverlay();
            this.registerMenuCommand();
            this.isInitialized = true;
        }

        // 添加样式
        addStyles() {
            const styles = `
                /* 配置面板样式 */
                .config-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 500px;
                    max-width: 90vw;
                    max-height: 80vh;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    overflow: hidden;
                    display: none;
                }

                .config-panel.show {
                    display: block;
                    animation: configSlideIn 0.3s ease-out;
                }

                @keyframes configSlideIn {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                }

                .config-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .config-title {
                    font-size: 18px;
                    font-weight: 600;
                    margin: 0;
                }

                .config-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background-color 0.2s;
                }

                .config-close:hover {
                    background-color: rgba(255, 255, 255, 0.2);
                }

                .config-content {
                    padding: 20px;
                    max-height: 60vh;
                    overflow-y: auto;
                }

                .config-success {
                    background: #f0f9ff;
                    border: 1px solid #0ea5e9;
                    color: #0369a1;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    display: none;
                }

                .config-success.show {
                    display: block;
                    animation: configFadeIn 0.3s ease-out;
                }

                @keyframes configFadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .config-form-group {
                    margin-bottom: 20px;
                }

                .config-label {
                    display: block;
                    font-weight: 500;
                    color: #374151;
                    margin-bottom: 8px;
                    font-size: 14px;
                }

                .config-input {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e5e7eb;
                    border-radius: 8px;
                    font-size: 14px;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    box-sizing: border-box;
                }

                .config-input:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                }

                .config-textarea {
                    min-height: 80px;
                    resize: vertical;
                }

                .config-help {
                    font-size: 12px;
                    color: #6b7280;
                    margin-top: 4px;
                    line-height: 1.4;
                }

                .config-status {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    margin-left: 8px;
                    vertical-align: middle;
                }

                .config-status.valid {
                    background-color: #10b981;
                }

                .config-status.invalid {
                    background-color: #ef4444;
                }

                .config-actions {
                    padding: 20px;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }

                .config-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .config-btn-secondary {
                    background: #f3f4f6;
                    color: #374151;
                }

                .config-btn-secondary:hover {
                    background: #e5e7eb;
                }

                .config-btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .config-btn-primary:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }

                .config-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 9999;
                    display: none;
                }

                .config-overlay.show {
                    display: block;
                    animation: configOverlayFadeIn 0.3s ease-out;
                }

                @keyframes configOverlayFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                /* 帮助文档对话框样式 */
                .config-help-dialog {
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    z-index: 20000 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.3s ease-out;
                }

                .config-help-dialog.show {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }

                .config-help-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                }

                .config-help-content {
                    position: relative;
                    width: 700px;
                    max-width: 90vw;
                    max-height: 85vh;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
                    display: flex;
                    flex-direction: column;
                    transform: scale(0.9);
                    transition: transform 0.3s ease-out;
                    overflow: hidden;
                    z-index: 1;
                }

                .config-help-dialog.show .config-help-content {
                    transform: scale(1);
                }

                .config-help-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                }

                .config-help-title {
                    font-size: 20px;
                    font-weight: 600;
                    margin: 0;
                }

                .config-help-close {
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: white;
                    font-size: 28px;
                    line-height: 1;
                    cursor: pointer;
                    padding: 0;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background-color 0.2s;
                }

                .config-help-close:hover {
                    background: rgba(255, 255, 255, 0.3);
                }

                .config-help-body {
                    padding: 24px;
                    overflow-y: auto;
                    flex: 1;
                    font-size: 14px;
                    line-height: 1.8;
                    color: #374151;
                }

                .config-help-body::-webkit-scrollbar {
                    width: 8px;
                }

                .config-help-body::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }

                .config-help-body::-webkit-scrollbar-thumb {
                    background: #c1c1c1;
                    border-radius: 4px;
                }

                .config-help-body::-webkit-scrollbar-thumb:hover {
                    background: #a1a1a1;
                }

                .config-help-line {
                    margin: 8px 0;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }

                .config-help-section {
                    font-size: 16px;
                    font-weight: 600;
                    color: #667eea;
                    margin: 20px 0 12px 0;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #e5e7eb;
                }

                .config-help-h1, .config-help-h2, .config-help-h3, 
                .config-help-h4, .config-help-h5, .config-help-h6 {
                    margin: 16px 0 12px 0;
                    font-weight: 600;
                    color: #1f2937;
                }

                .config-help-h1 { font-size: 24px; }
                .config-help-h2 { font-size: 20px; }
                .config-help-h3 { font-size: 18px; }
                .config-help-h4 { font-size: 16px; }
                .config-help-h5 { font-size: 14px; }
                .config-help-h6 { font-size: 13px; }

                /* 响应式设计 */
                @media (max-width: 600px) {
                    .config-panel {
                        width: 95vw;
                        margin: 20px;
                    }
                    
                    .config-header {
                        padding: 15px;
                    }
                    
                    .config-content {
                        padding: 15px;
                    }
                    
                    .config-actions {
                        padding: 15px;
                        flex-direction: column;
                    }
                    
                    .config-btn {
                        width: 100%;
                    }

                    .config-help-content {
                        width: 95vw;
                        max-height: 90vh;
                    }

                    .config-help-header {
                        padding: 16px;
                    }

                    .config-help-body {
                        padding: 16px;
                        font-size: 13px;
                    }
                }
            `;

            GM_addStyle(styles);
        }

        // 创建配置面板
        createPanel() {
            this.panel = document.createElement('div');
            this.panel.className = 'config-panel';
            this.panel.id = `${this.configName}-config-panel`;

            const header = document.createElement('div');
            header.className = 'config-header';

            const title = document.createElement('h3');
            title.className = 'config-title';
            title.textContent = `⚙️ ${this.configName} 配置`;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'config-close';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', () => this.hide());

            header.appendChild(title);
            header.appendChild(closeBtn);

            const content = document.createElement('div');
            content.className = 'config-content';

            // 成功消息
            const successMsg = document.createElement('div');
            successMsg.className = 'config-success';
            successMsg.id = `${this.configName}-save-success`;
            // 使用 textContent 而不是 innerHTML 来避免 Trusted Types 错误（如 YouTube）
            successMsg.textContent = '✓ 配置已成功保存！';
            content.appendChild(successMsg);

            // 动态创建表单
            this.configItems.forEach(item => {
                const group = this.createFormGroup(item);
                content.appendChild(group);
            });

            // 操作按钮
            const actions = document.createElement('div');
            actions.className = 'config-actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'config-btn config-btn-secondary';
            cancelBtn.id = `${this.configName}-cancel-btn`;
            cancelBtn.textContent = '取消';
            cancelBtn.addEventListener('click', () => this.hide());

            const saveBtn = document.createElement('button');
            saveBtn.className = 'config-btn config-btn-primary';
            saveBtn.id = `${this.configName}-save-btn`;
            saveBtn.textContent = '保存配置';
            saveBtn.addEventListener('click', () => this.saveConfigFromForm());

            actions.appendChild(cancelBtn);
            actions.appendChild(saveBtn);

            this.panel.appendChild(header);
            this.panel.appendChild(content);
            this.panel.appendChild(actions);

            document.body.appendChild(this.panel);
        }

        // 创建表单组
        createFormGroup(item) {
            const group = document.createElement('div');
            group.className = 'config-form-group';

            const label = document.createElement('label');
            label.className = 'config-label';
            label.setAttribute('for', `${this.configName}-${item.key}`);
            label.textContent = item.label;

            // 状态指示器
            if (item.showStatus) {
                const status = document.createElement('span');
                status.className = 'config-status';
                status.id = `${this.configName}-${item.key}-status`;
                label.appendChild(status);
            }

            let input;
            if (item.type === 'textarea') {
                input = document.createElement('textarea');
                input.className = 'config-input config-textarea';
            } else {
                input = document.createElement('input');
                input.className = 'config-input';
                input.type = item.type || 'text';
            }

            input.id = `${this.configName}-${item.key}`;
            input.placeholder = item.placeholder || '';
            input.autocomplete = 'off';

            // 设置当前值
            const currentValue = this.get(item.key);
            if (item.type === 'checkbox') {
                input.checked = currentValue;
            } else {
                input.value = currentValue || '';
            }

            // 添加验证
            if (item.validate) {
                input.addEventListener('blur', () => this.validateField(item.key, input.value));
                input.addEventListener('input', () => this.validateField(item.key, input.value));
            }

            const help = document.createElement('div');
            help.className = 'config-help';
            help.textContent = item.help || '';

            group.appendChild(label);
            group.appendChild(input);
            group.appendChild(help);

            return group;
        }

        // 验证字段
        validateField(key, value) {
            const item = this.configItems.find(item => item.key === key);
            if (!item || !item.validate) return true;

            const isValid = item.validate(value);
            const statusEl = document.getElementById(`${this.configName}-${key}-status`);

            if (statusEl) {
                statusEl.className = `config-status ${isValid ? 'valid' : 'invalid'}`;
            }

            return isValid;
        }

        // 从表单保存配置
        saveConfigFromForm() {
            let hasError = false;

            this.configItems.forEach(item => {
                const input = document.getElementById(`${this.configName}-${item.key}`);
                if (!input) return;

                let value;
                if (item.type === 'checkbox') {
                    value = input.checked;
                } else {
                    value = input.value;
                }

                // 验证
                if (item.validate && !this.validateField(item.key, value)) {
                    hasError = true;
                    return;
                }

                // 转换值
                if (item.transform) {
                    value = item.transform(value);
                }

                this.set(item.key, value);
            });

            if (hasError) {
                return;
            }

            // 显示成功消息
            const successMsg = document.getElementById(`${this.configName}-save-success`);
            if (successMsg) {
                successMsg.classList.add('show');
                setTimeout(() => {
                    successMsg.classList.remove('show');
                }, 3000);
            }

            // 触发配置更新事件
            this.onConfigUpdated();
        }

        // 配置更新回调
        onConfigUpdated() {
            // 子类可以重写此方法
        }

        // 创建遮罩层
        createOverlay() {
            this.overlay = document.createElement('div');
            this.overlay.className = 'config-overlay';
            this.overlay.id = `${this.configName}-config-overlay`;
            this.overlay.addEventListener('click', () => this.hide());
            document.body.appendChild(this.overlay);
        }

        // 注册菜单命令
        registerMenuCommand() {
            GM_registerMenuCommand(`⚙️ 打开${this.configName}配置`, () => {
                this.show();
            });
        }

        // 显示配置面板
        show() {
            if (!this.panel || !this.overlay) return;

            // 更新表单值
            this.updateFormValues();

            this.overlay.classList.add('show');
            this.panel.classList.add('show');

            // 聚焦到第一个输入框
            const firstInput = this.panel.querySelector('.config-input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }

        // 隐藏配置面板
        hide() {
            if (!this.panel || !this.overlay) return;

            this.panel.classList.remove('show');
            this.overlay.classList.remove('show');
        }

        // 更新表单值
        updateFormValues() {
            this.configItems.forEach(item => {
                const input = document.getElementById(`${this.configName}-${item.key}`);
                if (!input) return;

                const currentValue = this.get(item.key);
                if (item.type === 'checkbox') {
                    input.checked = currentValue;
                } else {
                    input.value = currentValue || '';
                }
            });
        }

        // 销毁配置面板
        destroy() {
            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
            this.isInitialized = false;
        }

        // ==================== 国际化菜单注册功能 ====================

        /**
         * 获取国际化文本（支持参数替换）
         * @param {string} key - 文本键
         * @param {Object|string} paramsOrDefault - 参数对象或默认文本
         * @returns {string} 国际化后的文本
         * 
         * @example
         * // 简单使用
         * t('buttonText', 'Default Button')
         * 
         * @example
         * // 带参数替换
         * t('consoleFoundCommenters', { count: 10 })
         * // i18n: "Found {count} commenters" -> "Found 10 commenters"
         */
        t(key, paramsOrDefault = {}) {
            let text = '';
            let params = {};

            // 兼容旧版本：paramsOrDefault 可以是字符串（defaultText）或对象（params）
            if (typeof paramsOrDefault === 'string') {
                // 旧版本用法：t(key, defaultText)
                const defaultText = paramsOrDefault;
                if (this.i18n[this.currentLang] && this.i18n[this.currentLang][key]) {
                    text = this.i18n[this.currentLang][key];
                } else if (this.i18n['zh'] && this.i18n['zh'][key]) {
                    text = this.i18n['zh'][key];
                } else {
                    text = defaultText || key;
                }
            } else {
                // 新版本用法：t(key, { param1: value1, param2: value2 })
                params = paramsOrDefault || {};
                if (this.i18n[this.currentLang] && this.i18n[this.currentLang][key]) {
                    text = this.i18n[this.currentLang][key];
                } else if (this.i18n['zh'] && this.i18n['zh'][key]) {
                    text = this.i18n['zh'][key];
                } else if (this.i18n['en'] && this.i18n['en'][key]) {
                    text = this.i18n['en'][key];
                } else {
                    text = key;
                }
            }

            // 参数替换：将 {param} 替换为实际值
            if (Object.keys(params).length > 0) {
                Object.keys(params).forEach(param => {
                    text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
                });
            }

            return text;
        }

        /**
         * 注册菜单命令（支持国际化）
         * @param {string} textKey - 文本键或直接文本
         * @param {Function} callback - 回调函数
         * @param {string} icon - 图标（可选）
         */
        registerMenuCommand(textKey, callback, icon = '') {
            const text = icon ? `${icon} ${this.t(textKey, textKey)}` : this.t(textKey, textKey);

            if (typeof GM_registerMenuCommand !== 'undefined') {
                try {
                    GM_registerMenuCommand(text, callback);
                    this.menuCommands.push({ textKey, callback, icon, text });
                } catch (e) {
                    console.warn(`[ConfigManager] 注册菜单命令失败: ${text}`, e);
                }
            }
        }

        /**
         * 批量注册菜单命令
         * @param {Array} commands - 菜单命令数组
         * 格式: [{ textKey: '', callback: fn, icon: '' }]
         */
        registerMenuCommands(commands) {
            commands.forEach(cmd => {
                this.registerMenuCommand(cmd.textKey, cmd.callback, cmd.icon);
            });
        }

        /**
         * 创建简单的配置对话框
         * @param {Array} fields - 配置字段数组
         * 格式: [{ key: '', labelKey: '', type: 'text|checkbox|select', options: [] }]
         * @param {Function} onSave - 保存回调
         */
        createSimpleDialog(fields, onSave) {
            const dialogContent = fields.map(field => {
                const label = this.t(field.labelKey, field.labelKey);
                const currentValue = this.get(field.key);

                if (field.type === 'checkbox') {
                    return {
                        label,
                        currentValue,
                        prompt: (current) => confirm(`${label}\n${this.t('clickOkToEnable', '点击"确定"开启，"取消"关闭')}`),
                        parse: (value) => value
                    };
                } else if (field.type === 'select' && field.options) {
                    const optionsText = field.options.map(opt =>
                        typeof opt === 'object' ? `${opt.value}: ${opt.label}` : opt
                    ).join(', ');
                    return {
                        label,
                        currentValue,
                        prompt: (current) => prompt(`${label}\n${this.t('supportedOptions', '支持')}: ${optionsText}`, current),
                        parse: (value) => value
                    };
                } else {
                    return {
                        label,
                        currentValue,
                        prompt: (current) => prompt(`${label}\n${field.help || ''}`, current),
                        parse: (value) => value
                    };
                }
            }).filter(f => f);

            return () => {
                const updates = {};
                let hasChanges = false;

                dialogContent.forEach((dialog, index) => {
                    const field = fields[index];
                    const newValue = dialog.prompt(dialog.currentValue);

                    if (field.type === 'checkbox') {
                        if (newValue !== dialog.currentValue) {
                            updates[field.key] = newValue;
                            hasChanges = true;
                        }
                    } else if (newValue && newValue !== dialog.currentValue) {
                        updates[field.key] = dialog.parse(newValue);
                        hasChanges = true;
                    }
                });

                if (hasChanges) {
                    Object.keys(updates).forEach(key => {
                        this.set(key, updates[key]);
                    });

                    if (onSave) {
                        onSave(updates);
                    }

                    return updates;
                }
                return null;
            };
        }

        /**
         * 创建记忆选择菜单
         * @param {string} titleKey - 标题键
         * @param {string} saveKey - 保存键
         * @param {boolean} defaultValue - 默认值
         * @returns {boolean} 当前值
         */
        createToggleMenu(titleKey, saveKey, defaultValue = true) {
            const currentValue = GM_getValue(saveKey, defaultValue);
            const title = currentValue ? '√  ' + this.t(titleKey, titleKey) : this.t(titleKey, titleKey);

            this.registerMenuCommand(titleKey, () => {
                GM_setValue(saveKey, !currentValue);
                location.reload();
            }, currentValue ? '✓' : '');

            return currentValue;
        }

        // ==================== 静态说明文档功能 ====================

        /**
         * 注册帮助文档菜单项
         * @param {Object} options - 配置选项
         * @param {string} options.titleKey - 菜单标题的 i18n 键
         * @param {string} options.contentKey - 文档内容的 i18n 键
         * @param {string} options.displayMode - 显示模式: 'dialog' (对话框) 或 'console' (控制台), 默认 'dialog'
         * @param {string} options.icon - 菜单图标，默认 '📖'
         * @param {Function} options.onShow - 显示前的回调函数（可选）
         * @param {Function} options.formatContent - 内容格式化函数（可选）
         */
        registerHelpDocument(options = {}) {
            const {
                titleKey = 'helpDocument',
                contentKey = 'helpContent',
                displayMode = 'dialog',
                icon = '📖',
                onShow = null,
                formatContent = null
            } = options;

            const menuTitle = this.t(titleKey, titleKey);
            const menuText = icon ? `${icon} ${menuTitle}` : menuTitle;

            if (typeof GM_registerMenuCommand !== 'undefined') {
                try {
                    GM_registerMenuCommand(menuText, () => {
                        if (onShow && typeof onShow === 'function') {
                            onShow();
                        }

                        const content = this.t(contentKey, contentKey);
                        const formattedContent = formatContent && typeof formatContent === 'function'
                            ? formatContent(content)
                            : content;

                        if (displayMode === 'console') {
                            // 控制台模式：输出到控制台并提示
                            console.log(`\n${'='.repeat(50)}\n${this.t(titleKey, titleKey)}\n${'='.repeat(50)}\n`);
                            console.log(formattedContent);
                            console.log(`${'='.repeat(50)}\n`);

                            // 显示提示（如果 tip 函数存在）
                            if (typeof window.tip === 'function') {
                                window.tip('帮助文档已输出到控制台，请按 F12 查看');
                            } else {
                                alert('帮助文档已输出到控制台，请按 F12 查看开发者工具');
                            }
                        } else {
                            // 对话框模式：显示美观的对话框
                            this.showHelpDialog(this.t(titleKey, titleKey), formattedContent);
                        }
                    });
                    console.log(`[ConfigManager] 已注册帮助文档菜单: ${menuText}`);
                } catch (e) {
                    console.warn(`[ConfigManager] 注册帮助文档菜单失败: ${menuText}`, e);
                }
            }
        }

        /**
         * 显示帮助文档对话框
         * @param {string} title - 对话框标题
         * @param {string} content - 文档内容（支持换行）
         */
        showHelpDialog(title, content) {
            // 检查是否已有帮助对话框
            let helpDialog = document.getElementById(`${this.configName}-help-dialog`);
            if (helpDialog) {
                helpDialog.remove();
            }

            // 创建对话框容器
            helpDialog = document.createElement('div');
            helpDialog.id = `${this.configName}-help-dialog`;
            helpDialog.className = 'config-help-dialog';
            // 添加内联样式确保显示（作为备用方案）
            helpDialog.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                z-index: 20000 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease-out;
            `;

            // 创建遮罩层（增强透明度，让背景更暗）
            const overlay = document.createElement('div');
            overlay.className = 'config-help-overlay';
            overlay.style.cssText = `
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.75) !important;
                backdrop-filter: blur(8px) !important;
                -webkit-backdrop-filter: blur(8px) !important;
            `;
            overlay.addEventListener('click', () => this.closeHelpDialog(helpDialog, overlay));

            // 创建对话框主体（增强阴影和边框，提高可见性）
            const dialogContent = document.createElement('div');
            dialogContent.className = 'config-help-content';
            // 确保对话框内容区域有正确的样式（内联样式作为备用）
            dialogContent.style.cssText = `
                position: relative !important;
                width: 700px !important;
                max-width: 90vw !important;
                max-height: 85vh !important;
                background: #ffffff !important;
                border-radius: 16px !important;
                border: 2px solid rgba(102, 126, 234, 0.2) !important;
                box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.1) !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                z-index: 1 !important;
            `;

            // 创建标题栏
            const header = document.createElement('div');
            header.className = 'config-help-header';
            header.style.cssText = `
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                color: white !important;
                padding: 20px 24px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                flex-shrink: 0 !important;
            `;

            const titleEl = document.createElement('h3');
            titleEl.className = 'config-help-title';
            titleEl.textContent = title;
            titleEl.style.cssText = `
                font-size: 20px !important;
                font-weight: 600 !important;
                margin: 0 !important;
                color: white !important;
            `;

            const closeBtn = document.createElement('button');
            closeBtn.className = 'config-help-close';
            closeBtn.textContent = '×';
            closeBtn.style.cssText = `
                background: rgba(255, 255, 255, 0.2) !important;
                border: none !important;
                color: white !important;
                font-size: 28px !important;
                line-height: 1 !important;
                cursor: pointer !important;
                padding: 0 !important;
                width: 36px !important;
                height: 36px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: 50% !important;
                transition: background-color 0.2s !important;
            `;
            closeBtn.addEventListener('click', () => this.closeHelpDialog(helpDialog, overlay));
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255, 255, 255, 0.3) !important';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'rgba(255, 255, 255, 0.2) !important';
            });

            header.appendChild(titleEl);
            header.appendChild(closeBtn);

            // 创建内容区域（增强背景和文字对比度）
            const body = document.createElement('div');
            body.className = 'config-help-body';
            // 确保内容区域有正确的样式（内联样式作为备用）
            body.style.cssText = `
                padding: 24px !important;
                overflow-y: auto !important;
                flex: 1 !important;
                font-size: 14px !important;
                line-height: 1.8 !important;
                color: #1f2937 !important;
                background: #ffffff !important;
                min-height: 200px !important;
            `;

            // 将内容按行分割并构建 DOM（避免 innerHTML，兼容 Trusted Types）
            const contentLines = content.split('\n');
            let hasContent = false;

            contentLines.forEach(line => {
                if (line.trim()) {
                    hasContent = true;
                    // 检测标题行
                    const titleMatch = line.trim().match(/^(#{1,6})\s(.+)$/);
                    const sectionMatch = /^【|^\[/.test(line.trim());

                    if (titleMatch) {
                        // Markdown 风格的标题
                        const level = titleMatch[1].length;
                        const text = titleMatch[2];
                        const heading = document.createElement(`h${level}`);
                        heading.className = `config-help-h${level}`;
                        heading.textContent = text;
                        heading.style.cssText = `
                            margin: 16px 0 12px 0 !important;
                            font-weight: 600 !important;
                            color: #1f2937 !important;
                            font-size: ${24 - (level - 1) * 2}px !important;
                        `;
                        body.appendChild(heading);
                    } else if (sectionMatch) {
                        // 中括号标题
                        const heading = document.createElement('h4');
                        heading.className = 'config-help-section';
                        heading.textContent = line.trim();
                        heading.style.cssText = `
                            font-size: 16px !important;
                            font-weight: 600 !important;
                            color: #667eea !important;
                            margin: 20px 0 12px 0 !important;
                            padding-bottom: 8px !important;
                            border-bottom: 2px solid #e5e7eb !important;
                        `;
                        body.appendChild(heading);
                    } else {
                        // 普通文本行（增强文字颜色对比度）
                        const p = document.createElement('p');
                        p.className = 'config-help-line';
                        p.textContent = line;
                        p.style.cssText = `
                            margin: 8px 0 !important;
                            white-space: pre-wrap !important;
                            word-wrap: break-word !important;
                            color: #1f2937 !important;
                            font-weight: 400 !important;
                            text-shadow: 0 1px 1px rgba(255, 255, 255, 0.8) !important;
                        `;
                        body.appendChild(p);
                    }
                } else {
                    // 空行
                    body.appendChild(document.createElement('br'));
                }
            });

            // 如果没有内容，显示提示
            if (!hasContent) {
                const emptyMsg = document.createElement('p');
                emptyMsg.textContent = '暂无帮助内容';
                emptyMsg.style.cssText = 'color: #9ca3af !important; font-style: italic !important;';
                body.appendChild(emptyMsg);
            }

            console.log('[ConfigManager] 内容区域已创建', {
                contentLines: contentLines.length,
                hasContent: hasContent,
                bodyChildren: body.children.length,
                bodyText: body.textContent.substring(0, 100)
            });

            // 组装对话框
            dialogContent.appendChild(header);
            dialogContent.appendChild(body);
            helpDialog.appendChild(overlay);
            helpDialog.appendChild(dialogContent);

            // 添加到页面
            if (!document.body) {
                console.error('[ConfigManager] document.body 不存在，无法显示帮助对话框');
                return;
            }

            document.body.appendChild(helpDialog);

            // 强制触发重排，确保样式应用
            helpDialog.offsetHeight;

            // 显示动画 - 使用 setTimeout 确保 DOM 已完全渲染
            setTimeout(() => {
                helpDialog.classList.add('show');
                // 同时设置内联样式确保显示
                helpDialog.style.opacity = '1';
                helpDialog.style.pointerEvents = 'auto';

                const computedStyle = window.getComputedStyle(helpDialog);
                console.log('[ConfigManager] 对话框 show 类已添加', {
                    element: helpDialog,
                    hasShowClass: helpDialog.classList.contains('show'),
                    inlineOpacity: helpDialog.style.opacity,
                    computedOpacity: computedStyle.opacity,
                    computedDisplay: computedStyle.display,
                    computedZIndex: computedStyle.zIndex,
                    computedPosition: computedStyle.position
                });

                // 如果仍然不可见，尝试强制显示
                if (computedStyle.opacity === '0' || computedStyle.display === 'none') {
                    console.warn('[ConfigManager] 对话框仍然不可见，尝试强制显示');
                    helpDialog.style.setProperty('opacity', '1', 'important');
                    helpDialog.style.setProperty('display', 'flex', 'important');
                    helpDialog.style.setProperty('pointer-events', 'auto', 'important');
                }
            }, 10);

            // ESC 键关闭
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    this.closeHelpDialog(helpDialog, overlay);
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);

            console.log(`[ConfigManager] 帮助文档对话框已显示: ${title}`, {
                dialog: helpDialog,
                body: document.body,
                hasShowClass: helpDialog.classList.contains('show'),
                computedOpacity: window.getComputedStyle(helpDialog).opacity,
                computedDisplay: window.getComputedStyle(helpDialog).display
            });
        }

        /**
         * 关闭帮助文档对话框
         * @param {HTMLElement} dialog - 对话框元素
         * @param {HTMLElement} overlay - 遮罩层元素
         */
        closeHelpDialog(dialog, overlay) {
            if (dialog) {
                dialog.classList.remove('show');
                setTimeout(() => {
                    if (dialog && dialog.parentNode) {
                        dialog.parentNode.removeChild(dialog);
                    }
                }, 300);
            }
        }

        /**
         * HTML 转义（防止 XSS）
         * @param {string} text - 要转义的文本
         * @returns {string} 转义后的文本
         */
        escapeHtml(text) {
            // 使用手动转义，避免 innerHTML（Trusted Types 兼容）
            if (typeof text !== 'string') {
                text = String(text);
            }
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, (m) => map[m]);
        }
    }

    // 导出到全局
    window.ConfigManager = ConfigManager;

    console.log('[ConfigManager] Common Configuration Manager loaded (v1.1.0)');
})();
