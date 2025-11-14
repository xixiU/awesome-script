// ==UserScript==
// @name        通用配置管理模块
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  提供通用的配置管理功能，支持动态配置项和可视化配置界面
// @author       xixiu
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-end
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
            this.currentLang = options.lang || navigator.language.slice(0, 2) || 'zh';

            // 菜单命令
            this.menuCommands = [];
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
            successMsg.innerHTML = '✓ 配置已成功保存！';
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
         * 获取国际化文本
         * @param {string} key - 文本键
         * @param {string} defaultText - 默认文本
         * @returns {string} 国际化后的文本
         */
        t(key, defaultText = '') {
            if (this.i18n[this.currentLang] && this.i18n[this.currentLang][key]) {
                return this.i18n[this.currentLang][key];
            }
            // 降级到默认语言
            if (this.i18n['zh'] && this.i18n['zh'][key]) {
                return this.i18n['zh'][key];
            }
            return defaultText || key;
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
    }

    // 导出到全局
    window.ConfigManager = ConfigManager;

    console.log('[ConfigManager] 通用配置管理模块已加载');
})();
