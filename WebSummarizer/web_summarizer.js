// ==UserScript==
// @name         Dify网页智能总结
// @namespace    http://tampermonkey.net/
// @version      1.5.8
// @description  使用统一配置管理的多模型AI智能总结网页内容，支持OpenAI/Anthropic/Ollama/Chrome Gemini/Dify，支持全文总结和选中文本总结
// @author       xixiu
// @match        *://*/*
// @exclude      https://www.youtube.com/*
// @require      https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/common/config_manager.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      *
// @run-at       document-end
// @downloadURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/WebSummarizer/web_summarizer.js
// @updateURL https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/WebSummarizer/web_summarizer.js
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置管理器初始化 ====================
    const summarizerConfig = new ConfigManager('网页总结工具', {
        // AI提供商配置: 'unified' 使用统一LLM配置, 'dify' 使用Dify工作流
        aiProvider: GM_getValue('aiProvider', 'unified'),

        // Dify API配置（向后兼容）
        difyApiUrl: GM_getValue('difyApiUrl', 'https://api.dify.ai/v1/workflows/run'),
        difyApiKey: GM_getValue('difyApiKey', ''),

        // 统一LLM配置（通过 ConfigManager 提供）
        ...ConfigManager.llmDefaults({ enablePrompt: true, defaultPrompt: '' })
    }, {
        lang: ConfigManager.detectLanguage(),
        i18n: {
            'zh': {
                'configTitle': '⚙️ 网页总结配置',
                'aiProviderLabel': 'AI服务提供商',
                'aiProviderHelp': 'unified: 使用统一LLM配置（OpenAI/Anthropic/Ollama/Chrome Gemini）; dify: 使用Dify工作流',
                'difyApiUrlLabel': 'Dify API地址',
                'difyApiUrlHelp': 'Dify工作流的API地址（仅在选择dify时使用）',
                'difyApiKeyLabel': 'Dify API密钥',
                'difyApiKeyHelp': 'Dify API Key（仅在选择dify时使用）',
                'llmApiFormatLabel': 'LLM API格式',
                'llmApiFormatHelp': '选择API协议格式：OpenAI、Anthropic、Ollama 或 Chrome Gemini（浏览器内置）',
                'llmBaseUrlLabel': 'LLM API地址',
                'llmBaseUrlHelp': 'LLM API基础地址。OpenAI：https://api.openai.com/v1，Anthropic：https://api.anthropic.com，Ollama：http://localhost:11434，Chrome Gemini：无需配置',
                'llmApiKeyLabel': 'LLM API密钥',
                'llmApiKeyHelp': '你的LLM API Key（Ollama 和 Chrome Gemini 不需要）',
                'llmModelLabel': 'AI模型',
                'llmModelHelp': '模型名称（如：gpt-4, claude-sonnet-4-5, llama3, gemini-nano）',
                'llmSystemPromptLabel': '总结系统提示词',
                'llmSystemPromptHelp': '自定义总结的系统提示词（留空使用默认）'
            },
            'en': {
                'configTitle': '⚙️ Web Summary Config',
                'aiProviderLabel': 'AI Provider',
                'aiProviderHelp': 'unified: Use unified LLM config (OpenAI/Anthropic/Ollama/Chrome Gemini); dify: Use Dify workflow',
                'difyApiUrlLabel': 'Dify API URL',
                'difyApiUrlHelp': 'Dify workflow API URL (only used when dify is selected)',
                'difyApiKeyLabel': 'Dify API Key',
                'difyApiKeyHelp': 'Dify API Key (only used when dify is selected)',
                'llmApiFormatLabel': 'LLM API Format',
                'llmApiFormatHelp': 'Choose API protocol: OpenAI, Anthropic, Ollama, or Chrome Gemini (built-in)',
                'llmBaseUrlLabel': 'LLM API Base URL',
                'llmBaseUrlHelp': 'LLM API base URL. OpenAI: https://api.openai.com/v1, Anthropic: https://api.anthropic.com, Ollama: http://localhost:11434, Chrome Gemini: not required',
                'llmApiKeyLabel': 'LLM API Key',
                'llmApiKeyHelp': 'Your LLM API Key (not required for Ollama and Chrome Gemini)',
                'llmModelLabel': 'AI Model',
                'llmModelHelp': 'Model name (e.g., gpt-4, claude-sonnet-4-5, llama3, gemini-nano)',
                'llmSystemPromptLabel': 'Summary System Prompt',
                'llmSystemPromptHelp': 'Custom system prompt for summarization (leave empty for default)'
            }
        }
    });

    // ==================== 样式定义 ====================
    const styles = `
        #dify-summarizer-btn {
            position: fixed !important;
            bottom: 80px;
            right: 0px;
            z-index: 2147483647 !important;
            padding: 8px 10px !important;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
            color: white !important;
            border: none !important;
            border-top-left-radius: 20px !important;
            border-bottom-left-radius: 20px !important;
            border-top-right-radius: 0 !important;
            border-bottom-right-radius: 0 !important;
            cursor: move;
            font-size: 16px !important;
            font-weight: bold !important;
            box-shadow: -2px 2px 10px rgba(0, 0, 0, 0.2) !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            user-select: none;
            touch-action: none;
            width: 40px !important;
            height: auto !important;
            min-height: 40px !important;
            max-width: 200px !important;
            max-height: 60px !important;
            overflow: hidden !important;
            white-space: nowrap !important;
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
            transform: scale(1) !important;
            box-sizing: border-box !important;
        }

        #dify-summarizer-btn .btn-icon {
            flex-shrink: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 24px !important;
            height: 24px !important;
            font-size: 20px !important;
            line-height: 1 !important;
            text-align: center !important;
            transform: scale(1) !important;
            font-style: normal !important;
            font-weight: normal !important;
        }

        #dify-summarizer-btn .btn-text {
            flex-shrink: 0;
            font-size: 14px !important;
            opacity: 0 !important;
            transform: translateX(-10px) !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
        }

        /* 贴边模式：悬停时展开 */
        #dify-summarizer-btn.edge-mode:hover {
            width: 140px !important;
            padding: 12px 20px !important;
            right: 0px;
            box-shadow: -4px 4px 20px rgba(0, 0, 0, 0.3) !important;
        }

        #dify-summarizer-btn.edge-mode:hover .btn-text {
            opacity: 1 !important;
            transform: translateX(0) !important;
        }

        /* 自由模式：始终展开，圆角按钮 */
        #dify-summarizer-btn.free-mode {
            width: 140px !important;
            padding: 12px 20px !important;
            border-radius: 25px !important;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2) !important;
        }

        #dify-summarizer-btn.free-mode .btn-text {
            opacity: 1 !important;
            transform: translateX(0) !important;
        }

        #dify-summarizer-btn.free-mode:hover {
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3) !important;
        }

        #dify-summarizer-btn.dragging {
            cursor: grabbing;
            opacity: 0.8;
            transition: none;
            width: 140px !important;
            padding: 12px 20px !important;
        }

        #dify-summarizer-btn.dragging .btn-text {
            opacity: 1 !important;
            transform: translateX(0) !important;
        }

        #dify-summarizer-btn.loading {
            background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%) !important;
            cursor: wait;
            width: 140px !important;
            padding: 12px 20px !important;
        }

        #dify-summarizer-btn.loading .btn-text {
            opacity: 1 !important;
            transform: translateX(0) !important;
        }

        /* 隐藏状态（用于全屏等场景）*/
        #dify-summarizer-btn.hidden {
            display: none !important;
        }
        
        #dify-result-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 800px;
            max-height: 80vh;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 1000000;
            display: none;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        
        #dify-result-panel.show {
            display: block;
            animation: slideIn 0.3s ease;
        }
        
        /* 拖拽状态 - 只在标题栏显示拖拽光标 */
        #dify-result-panel.draggable {
            cursor: default;
        }
        
        #dify-result-panel.dragging {
            cursor: grabbing;
            transition: none;
        }
        
        /* 全屏模式 */
        #dify-result-panel.fullscreen {
            top: 0 !important;
            left: 0 !important;
            transform: none !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
            cursor: default !important;
        }
        
        #dify-result-panel.fullscreen #dify-panel-content {
            max-height: calc(100vh - 80px) !important;
            font-size: 18px !important;
            padding: 32px 32px 48px 32px !important;
        }
        
        #dify-result-panel.fullscreen #dify-panel-content h1 {
            font-size: 32px !important;
        }
        
        #dify-result-panel.fullscreen #dify-panel-content h2 {
            font-size: 28px !important;
        }
        
        #dify-result-panel.fullscreen #dify-panel-content h3 {
            font-size: 24px !important;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translate(-50%, -45%);
            }
            to {
                opacity: 1;
                transform: translate(-50%, -50%);
            }
        }
        
        #dify-panel-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        }
        
        #dify-panel-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }

        #dify-panel-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        #dify-copy-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        #dify-copy-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-1px);
        }

        #dify-copy-btn.copied {
            background: rgba(16, 185, 129, 0.9);
        }
        
        #dify-close-btn {
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
        
        #dify-close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        #dify-fullscreen-btn {
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        #dify-fullscreen-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        #dify-panel-header.draggable {
            cursor: move;
        }
        
        #dify-panel-header.dragging {
            cursor: grabbing;
        }
        
        /* 标题栏中的按钮保持指针光标 */
        #dify-panel-header button,
        #dify-panel-header #dify-panel-actions {
            cursor: pointer;
        }
        
        #dify-panel-content {
            padding: 24px;
            overflow-y: auto;
            overflow-x: hidden;
            max-height: calc(80vh - 80px);
            line-height: 1.8;
            color: #333;
            user-select: text !important;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
            cursor: text !important;
            box-sizing: border-box;
        }
        
        #dify-panel-content h1, 
        #dify-panel-content h2, 
        #dify-panel-content h3 {
            margin-top: 20px;
            margin-bottom: 12px;
            color: #1f2937;
        }
        
        #dify-panel-content p {
            margin-bottom: 12px;
        }
        
        #dify-panel-content ul, 
        #dify-panel-content ol {
            margin-left: 24px;
            margin-bottom: 12px;
        }
        
        #dify-panel-content li {
            margin-bottom: 8px;
        }
        
        #dify-panel-content code {
            background: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            color: #e83e8c;
        }
        
        #dify-panel-content pre {
            background: #1f2937;
            color: #f9fafb;
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            margin-bottom: 16px;
            border: 1px solid #374151;
        }
        
        #dify-panel-content pre code {
            background: transparent;
            padding: 0;
            color: inherit;
            font-size: 0.9em;
        }
        
        #dify-panel-content a {
            color: #667eea;
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: all 0.2s;
            cursor: pointer;
        }
        
        #dify-panel-content a:hover {
            color: #764ba2;
            border-bottom-color: #764ba2;
        }
        
        #dify-panel-content blockquote {
            border-left: 4px solid #667eea;
            padding-left: 16px;
            margin: 16px 0;
            color: #6b7280;
            font-style: italic;
            background: #f9fafb;
            padding: 12px 16px;
            border-radius: 4px;
        }
        
        #dify-panel-content hr {
            border: none;
            border-top: 2px solid #e5e7eb;
            margin: 24px 0;
        }
        
        #dify-panel-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 0.95em;
        }
        
        #dify-panel-content table th,
        #dify-panel-content table td {
            border: 1px solid #e5e7eb;
            padding: 8px 12px;
            text-align: left;
        }
        
        #dify-panel-content table th {
            background: #f9fafb;
            font-weight: 600;
            color: #1f2937;
        }
        
        #dify-panel-content table tr:nth-child(even) {
            background: #f9fafb;
        }
        
        #dify-panel-content img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 16px 0;
        }
        
        #dify-panel-content strong {
            font-weight: 600;
            color: #1f2937;
        }
        
        #dify-panel-content em {
            font-style: italic;
            color: #4b5563;
        }
        
        .dify-loading-spinner {
            border: 3px solid #f3f4f6;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 40px auto;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .dify-error-message {
            color: #dc2626;
            background: #fee2e2;
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid #dc2626;
        }
        
        #dify-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 999999;
            display: none;
        }
        
        #dify-overlay.show {
            display: block;
        }

        #dify-settings-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 500px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 1000001;
            display: none;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        #dify-settings-panel.show {
            display: block;
            animation: slideIn 0.3s ease;
        }

        #dify-settings-header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #dify-settings-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
        }

        #dify-settings-close-btn {
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

        #dify-settings-close-btn:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        #dify-settings-content {
            padding: 24px;
        }

        .dify-form-group {
            margin-bottom: 20px;
        }

        .dify-form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #374151;
            font-size: 14px;
        }

        .dify-form-group input,
        .dify-form-group select {
            width: 100%;
            padding: 10px 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.2s;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        .dify-form-group input:focus,
        .dify-form-group select:focus {
            outline: none;
            border-color: #10b981;
        }

        .dify-form-group input::placeholder {
            color: #9ca3af;
        }

        .dify-form-group select {
            cursor: pointer;
            background-color: white;
        }

        .dify-form-help {
            margin-top: 6px;
            font-size: 12px;
            color: #6b7280;
            line-height: 1.5;
        }

        .dify-form-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }

        .dify-btn {
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

        .dify-btn-primary {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
        }

        .dify-btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .dify-btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }

        .dify-btn-secondary:hover {
            background: #e5e7eb;
        }

        .dify-success-message {
            background: #d1fae5;
            color: #065f46;
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 14px;
            display: none;
            border-left: 4px solid #10b981;
        }

        .dify-success-message.show {
            display: block;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .dify-config-status {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            margin-left: 8px;
        }

        .dify-config-status.configured {
            background: #d1fae5;
            color: #065f46;
        }

        .dify-config-status.not-configured {
            background: #fee2e2;
            color: #991b1b;
        }

        .dify-ai-score-badge {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px 14px;
            margin-bottom: 16px;
            font-size: 13px;
            color: #475569;
            flex-wrap: wrap;
        }

        .dify-ai-score-bar {
            flex: 1;
            min-width: 80px;
            height: 8px;
            background: #e2e8f0;
            border-radius: 4px;
            overflow: hidden;
        }

        .dify-ai-score-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.6s ease;
        }

        .dify-ai-score-value {
            font-weight: 600;
            white-space: nowrap;
        }

        .dify-ai-score-loading {
            color: #94a3b8;
            font-style: italic;
        }

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
            z-index: 10000001;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            overflow: visible;
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
            border-radius: 12px 12px 0 0;
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
            color: #1f2937;
            background-color: #fff;
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

        .config-select {
            appearance: none;
            -webkit-appearance: none;
            -moz-appearance: none;
            color: #1f2937;
            background-color: #fff;
            background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%236b7280' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 12px center;
            background-size: 12px 8px;
            padding-right: 36px;
            cursor: pointer;
        }

        .config-help {
            font-size: 12px;
            color: #6b7280;
            margin-top: 4px;
            line-height: 1.4;
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
            z-index: 10000000;
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
    `;

    // ==================== 智能正文提取器 ====================
    class ContentExtractor {
        constructor() {
            // 常见的正文容器选择器
            this.contentSelectors = [
                'article',
                'main',
                '[role="main"]',
                '.article-content',
                '.articalContent',  // 常见拼写错误
                '.articleContent',
                '.post-content',
                '.entry-content',
                '.content',
                '.main-content',
                '.article-body',
                '.post-body',
                '.entry-body',
                '#article',
                '#content',
                '.markdown-body',
                '.news-content',
                '.newsContent',
                '.detail-content',
                '.detailContent',
                '.rich-text',
                '.story-body',
                '.article-text',
                '.text-content',
                '.textContent',
                '[class*="article-content"]',
                '[class*="post-content"]',
                '[class*="entry-content"]',
                '[class*="main-content"]'
            ];

            // 需要排除的元素选择器
            this.excludeSelectors = [
                'nav',
                'header',
                'footer',
                'aside',
                '.sidebar',
                '.navigation',
                '.nav',
                '.menu',
                '.ad',
                '.advertisement',
                '.promo',
                '.related',
                '.comments',
                '.comment',
                '.social-share',
                '.share',
                '.tags',
                '.breadcrumb',
                'script',
                'style',
                'iframe',
                'noscript'
            ];
        }

        // 主提取方法
        extract() {
            let content = '';

            // 策略1: 尝试使用常见选择器
            content = this.tryCommonSelectors();
            if (content && content.length > 100) {
                return this.cleanText(content);
            }

            // 策略2: 使用文本密度算法
            content = this.extractByTextDensity();
            if (content && content.length > 100) {
                return this.cleanText(content);
            }

            // 策略3: 回退到body内容
            content = this.extractFromBody();
            return this.cleanText(content);
        }

        // 尝试常见选择器
        tryCommonSelectors() {
            for (let selector of this.contentSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    let text = '';
                    elements.forEach(el => {
                        text += this.extractTextFromElement(el) + '\n\n';
                    });
                    if (text.trim().length > 100) {
                        console.log(`使用选择器提取: ${selector}`);
                        return text;
                    }
                }
            }
            return '';
        }

        // 基于文本密度的提取
        extractByTextDensity() {
            const body = document.body;
            const candidates = this.findContentCandidates(body);

            if (candidates.length === 0) return '';

            // 按分数排序
            candidates.sort((a, b) => b.score - a.score);

            console.log(`使用文本密度算法提取，候选元素: ${candidates.length}`);
            return this.extractTextFromElement(candidates[0].element);
        }

        // 查找内容候选元素
        findContentCandidates(root) {
            const candidates = [];
            const elements = root.querySelectorAll('div, section, article, main');

            elements.forEach(el => {
                // 跳过排除的元素
                if (this.shouldExclude(el)) return;

                const text = el.innerText || '';
                const textLength = text.length;

                if (textLength < 50) return; // 太短的忽略

                // 计算文本密度分数
                const linkLength = this.getLinkTextLength(el);
                const linkDensity = textLength > 0 ? linkLength / textLength : 1;

                // 计算标点符号密度（中文和英文）
                const punctuationCount = (text.match(/[。！？,.!?;；]/g) || []).length;
                const punctuationDensity = textLength > 0 ? punctuationCount / textLength : 0;

                // 计算段落数
                const paragraphs = el.querySelectorAll('p').length;

                // 综合评分
                let score = textLength;
                score *= (1 - linkDensity); // 链接密度低的加分
                score += punctuationDensity * 1000; // 标点密度适中的加分
                score += paragraphs * 100; // 段落多的加分

                candidates.push({ element: el, score: score, textLength: textLength });
            });

            return candidates;
        }

        // 检查是否应该排除
        shouldExclude(element) {
            for (let selector of this.excludeSelectors) {
                if (element.matches(selector)) return true;
                if (element.querySelector(selector) === element.parentElement) return true;
            }

            // 检查是否在排除元素内部
            let parent = element.parentElement;
            while (parent) {
                for (let selector of this.excludeSelectors) {
                    if (parent.matches(selector)) return true;
                }
                parent = parent.parentElement;
            }

            return false;
        }

        // 获取链接文本长度
        getLinkTextLength(element) {
            const links = element.querySelectorAll('a');
            let length = 0;
            links.forEach(link => {
                length += (link.innerText || '').length;
            });
            return length;
        }

        // 从元素提取文本
        extractTextFromElement(element) {
            const clone = element.cloneNode(true);

            // 移除排除的元素
            this.excludeSelectors.forEach(selector => {
                clone.querySelectorAll(selector).forEach(el => el.remove());
            });

            // 处理段落和换行
            clone.querySelectorAll('p, br, div, h1, h2, h3, h4, h5, h6, li').forEach(el => {
                if (el.tagName === 'BR') {
                    el.replaceWith('\n');
                } else {
                    const text = el.innerText || el.textContent || '';
                    if (text.trim()) {
                        el.insertAdjacentText('afterend', '\n');
                    }
                }
            });

            return clone.innerText || clone.textContent || '';
        }

        // 从body提取（最后的回退方案）
        extractFromBody() {
            console.log('使用body回退方案');
            return this.extractTextFromElement(document.body);
        }

        // 清理文本
        cleanText(text) {
            return text
                .replace(/\n{3,}/g, '\n\n')  // 多个换行替换为两个
                .replace(/[ \t]{2,}/g, ' ')   // 多个空格替换为一个
                .replace(/^\s+|\s+$/gm, '')   // 去除每行首尾空格
                .trim();
        }
    }

    // ==================== 统一的AI调用接口 ====================
    class UnifiedAPI {
        /**
         * 使用统一配置的LLM进行总结
         * @param {string} newsUrl - 网页URL
         * @param {string} newsContent - 网页内容
         * @returns {Promise<string>} - 总结结果
         */
        static async summarize(newsUrl, newsContent) {
            // 检查配置是否就绪
            if (!summarizerConfig.isLLMReady()) {
                const apiFormat = summarizerConfig.get('aiApiFormat');
                if (apiFormat === 'chrome-gemini') {
                    throw new Error('Chrome Gemini 不需要配置 API Key，但需要确保浏览器支持。\n请使用 Chrome Canary 127+ 并启用 Prompt API。');
                } else {
                    throw new Error(`请先配置 ${apiFormat.toUpperCase()} API Key！\n请在油猴菜单中打开"网页总结工具配置"进行设置。`);
                }
            }

            // 构建总结提示词（含AI生成概率检测）
            const systemPrompt = summarizerConfig.get('aiSystemPrompt') || `你是一个专业的内容总结助手，同时具备AI生成内容识别能力。
每次回复必须严格按以下格式输出，第一行为AI生成概率分数，第二行为分隔线，之后为总结正文：
AI_SCORE: [0-100的整数]
---
[总结正文]

AI_SCORE说明：100表示确定是AI生成，0表示确定是人工写作，判断依据包括结构工整度、用词正式程度、个人情感表达、AI惯用表达等。

总结正文要求：
1. 提取核心观点和关键信息
2. 使用清晰的结构组织内容
3. 保持客观准确
4. 无论原文使用何种语言，都使用中文总结
5. 输出markdown格式的内容
6. 基于文章观点，在单独章节给出相关的建议或者预测
7. 最后要有阅读原文跳转链接`;

            const userPrompt = `网页地址：${newsUrl}

网页内容：
${newsContent}`;

            try {
                // 使用 ConfigManager 的统一 LLM 调用方法
                const result = await summarizerConfig.callLLM({
                    prompt: userPrompt,
                    system: systemPrompt,
                    temperature: 0.7,
                    maxTokens: 4096
                });

                return result;
            } catch (error) {
                console.error('[UnifiedAPI] LLM调用失败:', error);
                throw new Error(`AI调用失败: ${error.message}`);
            }
        }
    }

    // ==================== Dify API调用（向后兼容）====================
    class DifyAPI {
        static async summarize(newsUrl, newsContent) {
            return new Promise((resolve, reject) => {
                const difyApiKey = summarizerConfig.get('difyApiKey');
                const difyApiUrl = summarizerConfig.get('difyApiUrl');

                if (!difyApiKey) {
                    reject(new Error('请先配置Dify API Key！点击设置按钮进行配置。'));
                    return;
                }

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: difyApiUrl,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${difyApiKey}`
                    },
                    data: JSON.stringify({
                        inputs: {
                            newsUrl: newsUrl,
                            newsContent: newsContent
                        },
                        response_mode: 'blocking',
                        user: 'tampermonkey-user'
                    }),
                    timeout: 60000,
                    onload: function (response) {
                        try {
                            if (response.status === 200) {
                                const data = JSON.parse(response.responseText);
                                const result = data.data?.outputs?.text || data.data?.outputs?.result || data.answer || JSON.stringify(data, null, 2);
                                resolve(result);
                            } else {
                                reject(new Error(`API请求失败: ${response.status} ${response.statusText}\n${response.responseText}`));
                            }
                        } catch (e) {
                            reject(new Error(`解析响应失败: ${e.message}\n${response.responseText}`));
                        }
                    },
                    onerror: function (error) {
                        reject(new Error(`网络请求失败: ${error.message || '未知错误'}`));
                    },
                    ontimeout: function () {
                        reject(new Error('请求超时，请稍后重试'));
                    }
                });
            });
        }
    }

    // ==================== AI回复解析工具 ====================
    // 从合并回复中解析AI生成概率分数与正文内容
    // 约定格式：回复第一行为 "AI_SCORE: [0-100]"，第二行为 "---"，之后为正文
    function parseAIScore(rawText) {
        const lines = rawText.split('\n');
        let aiScore = null;
        let contentStart = 0;

        // 在前5行内查找分数标记，容忍模型在前面输出多余空行
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const match = lines[i].match(/^AI_SCORE:\s*(\d+)/i);
            if (match) {
                aiScore = Math.max(0, Math.min(100, parseInt(match[1], 10)));
                contentStart = i + 1;
                // 跳过紧随其后的分隔线
                if (lines[contentStart]?.trim() === '---') {
                    contentStart++;
                }
                break;
            }
        }

        const content = lines.slice(contentStart).join('\n').trimStart();
        return { aiScore, content };
    }

    // ==================== UI管理 ====================
    class UIManager {
        constructor() {
            this.init();
        }

        init() {
            // 添加样式
            const styleEl = document.createElement('style');
            styleEl.textContent = styles;
            document.head.appendChild(styleEl);

            // 创建按钮
            this.createButton();

            // 创建结果面板
            this.createResultPanel();

            // 创建设置面板
            this.createSettingsPanel();

            // 创建遮罩层
            this.createOverlay();

            // 添加全屏状态监听
            this.initFullscreenDetection();
        }

        createButton() {
            const btn = document.createElement('button');
            btn.id = 'dify-summarizer-btn';
            btn.classList.add('edge-mode'); // 默认贴边模式
            btn.title = '点击总结全文，或选中文本后点击总结选中部分';

            // 使用 DOM API 创建元素，避免 TrustedHTML 问题
            const iconSpan = document.createElement('span');
            iconSpan.className = 'btn-icon';
            iconSpan.textContent = '📝';

            const textSpan = document.createElement('span');
            textSpan.className = 'btn-text';
            textSpan.textContent = 'AI总结';

            btn.appendChild(iconSpan);
            btn.appendChild(textSpan);

            document.body.appendChild(btn);
            this.button = btn;
            this.buttonTextSpan = textSpan;

            // 监听文本选择变化，动态更新按钮提示
            this.setupSelectionListener();

            // 加载保存的位置
            this.loadButtonPosition();

            // 添加拖拽功能
            this.makeDraggable(btn);

            // 添加点击事件（需要区分点击和拖拽）
            let isDragging = false;
            let dragStartTime = 0;

            btn.addEventListener('mousedown', () => {
                isDragging = false;
                dragStartTime = Date.now();
            });

            btn.addEventListener('mouseup', (e) => {
                const dragDuration = Date.now() - dragStartTime;
                // 如果移动时间很短且没有标记为拖拽，则视为点击
                if (!isDragging && dragDuration < 200) {
                    this.handleSummarize();
                }
            });
        }

        setupSelectionListener() {
            // 监听文本选择事件
            let selectionTimeout;
            const updateButtonText = () => {
                // 防抖处理
                clearTimeout(selectionTimeout);
                selectionTimeout = setTimeout(() => {
                    // 如果按钮正在加载或被隐藏（全屏等场景），不更新按钮文本
                    if (this.button.classList.contains('loading') || this.button.classList.contains('hidden')) {
                        return;
                    }

                    const selection = window.getSelection();
                    const selectedText = selection ? selection.toString().trim() : '';

                    const iconSpan = this.button.querySelector('.btn-icon');
                    const textSpan = this.button.querySelector('.btn-text');

                    if (selectedText && selectedText.length >= 50) {
                        // 有选中文本
                        if (iconSpan) iconSpan.textContent = '✂️';
                        if (textSpan) textSpan.textContent = '总结选中';
                        this.button.title = `总结选中的文本（${selectedText.length} 字符）`;
                    } else {
                        // 没有选中或文本太短
                        if (iconSpan) iconSpan.textContent = '📝';
                        if (textSpan) textSpan.textContent = 'AI总结';
                        this.button.title = '点击总结全文，或选中文本后点击总结选中部分';
                    }
                }, 100);
            };

            // 监听选择变化
            document.addEventListener('selectionchange', updateButtonText);

            // 监听鼠标抬起（处理拖动选择的情况）
            document.addEventListener('mouseup', updateButtonText);
        }

        loadButtonPosition() {
            const savedPos = GM_getValue('buttonPosition', null);
            if (savedPos) {
                const pos = JSON.parse(savedPos);
                // 根据保存的位置模式设置按钮位置
                this.button.classList.remove('free-mode');
                this.button.classList.add('edge-mode');

                if (pos.side === 'left') {
                    // 贴左边
                    this.button.style.left = '0px';
                    this.button.style.right = 'auto';
                    this.button.style.borderTopLeftRadius = '0';
                    this.button.style.borderBottomLeftRadius = '0';
                    this.button.style.borderTopRightRadius = '25px';
                    this.button.style.borderBottomRightRadius = '25px';
                } else {
                    // 贴右边（默认）
                    this.button.style.left = 'auto';
                    this.button.style.right = '0px';
                    this.button.style.borderTopLeftRadius = '25px';
                    this.button.style.borderBottomLeftRadius = '25px';
                    this.button.style.borderTopRightRadius = '0';
                    this.button.style.borderBottomRightRadius = '0';
                }

                this.button.style.top = pos.top || 'auto';
                this.button.style.bottom = pos.bottom || '80px';
            }
        }

        saveButtonPosition(side = 'right') {
            const pos = {
                side: side,
                top: this.button.style.top,
                bottom: this.button.style.bottom
            };
            GM_setValue('buttonPosition', JSON.stringify(pos));
        }

        makeDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            let isDragging = false;
            const self = this; // 保存 this 引用

            element.addEventListener('mousedown', dragMouseDown);

            function dragMouseDown(e) {
                // 如果正在加载，不允许拖拽
                if (element.classList.contains('loading')) return;

                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;

                document.addEventListener('mouseup', closeDragElement);
                document.addEventListener('mousemove', elementDrag);
            }

            const elementDrag = (e) => {
                e.preventDefault();

                // 计算移动距离
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                // 如果移动距离超过5px，标记为拖拽
                if (Math.abs(pos1) > 5 || Math.abs(pos2) > 5) {
                    isDragging = true;
                    element.classList.add('dragging');
                }

                // 设置新位置
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;

                // 边界检查
                const maxX = window.innerWidth - element.offsetWidth;
                const maxY = window.innerHeight - element.offsetHeight;

                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));

                element.style.top = newTop + 'px';
                element.style.left = newLeft + 'px';
                element.style.right = 'auto';
                element.style.bottom = 'auto';
            };

            const closeDragElement = () => {
                document.removeEventListener('mouseup', closeDragElement);
                document.removeEventListener('mousemove', elementDrag);

                if (isDragging) {
                    // 计算按钮中心点到窗口左右边缘的距离
                    const buttonCenterX = element.offsetLeft + element.offsetWidth / 2;
                    const windowCenterX = window.innerWidth / 2;

                    // 根据按钮中心点位置决定贴哪一边
                    if (buttonCenterX < windowCenterX) {
                        // 贴左边
                        element.classList.remove('free-mode');
                        element.classList.add('edge-mode');
                        element.style.left = '0px';
                        element.style.right = 'auto';
                        element.style.bottom = (window.innerHeight - element.offsetTop - element.offsetHeight) + 'px';

                        // 调整圆角样式
                        element.style.borderTopLeftRadius = '0';
                        element.style.borderBottomLeftRadius = '0';
                        element.style.borderTopRightRadius = '25px';
                        element.style.borderBottomRightRadius = '25px';

                        self.saveButtonPosition('left');
                    } else {
                        // 贴右边
                        element.classList.remove('free-mode');
                        element.classList.add('edge-mode');
                        element.style.left = 'auto';
                        element.style.right = '0px';
                        element.style.bottom = (window.innerHeight - element.offsetTop - element.offsetHeight) + 'px';

                        // 调整圆角样式
                        element.style.borderTopLeftRadius = '25px';
                        element.style.borderBottomLeftRadius = '25px';
                        element.style.borderTopRightRadius = '0';
                        element.style.borderBottomRightRadius = '0';

                        self.saveButtonPosition('right');
                    }

                    // 延迟移除拖拽状态，避免触发点击
                    setTimeout(() => {
                        element.classList.remove('dragging');
                        isDragging = false;
                    }, 100);
                }
            };
        }

        createResultPanel() {
            const panel = document.createElement('div');
            panel.id = 'dify-result-panel';

            // 使用 DOM API 创建元素，避免 TrustedHTML 问题
            const header = document.createElement('div');
            header.id = 'dify-panel-header';

            const title = document.createElement('h3');
            title.id = 'dify-panel-title';
            title.textContent = '📝 AI总结结果';

            const actionsDiv = document.createElement('div');
            actionsDiv.id = 'dify-panel-actions';

            // 创建复制按钮
            const copyBtn = document.createElement('button');
            copyBtn.id = 'dify-copy-btn';

            const copyIcon = document.createElement('span');
            copyIcon.className = 'copy-icon';
            copyIcon.textContent = '📋';

            const copyText = document.createElement('span');
            copyText.className = 'copy-text';
            copyText.textContent = '复制结果';

            copyBtn.appendChild(copyIcon);
            copyBtn.appendChild(copyText);

            // 创建全屏按钮
            const fullscreenBtn = document.createElement('button');
            fullscreenBtn.id = 'dify-fullscreen-btn';
            fullscreenBtn.textContent = '⤢';
            fullscreenBtn.title = '全屏显示';

            // 创建关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.id = 'dify-close-btn';
            closeBtn.textContent = '×';

            // 组装元素
            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(fullscreenBtn);
            actionsDiv.appendChild(closeBtn);

            header.appendChild(title);
            header.appendChild(actionsDiv);

            const content = document.createElement('div');
            content.id = 'dify-panel-content';

            panel.appendChild(header);
            panel.appendChild(content);

            document.body.appendChild(panel);
            this.panel = panel;
            this.panelHeader = header;
            this.fullscreenBtn = fullscreenBtn;
            this.isFullscreen = false;

            // 关闭按钮事件
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hidePanel();
            });

            // 复制按钮事件
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.copyResult();
            });

            // 全屏按钮事件
            fullscreenBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFullscreen();
            });

            // 添加拖拽功能（非全屏状态下）
            this.makePanelDraggable();
        }

        createSettingsPanel() {
            // 创建自定义配置面板，根据选择动态显示配置项
            const panel = document.createElement('div');
            panel.className = 'config-panel';
            panel.id = 'web-summarizer-config-panel';
            // 不设置 inline style，让 CSS 控制显示/隐藏

            // 头部
            const header = document.createElement('div');
            header.className = 'config-header';
            const title = document.createElement('h3');
            title.className = 'config-title';
            title.textContent = '⚙️ 网页总结工具配置';
            const closeBtn = document.createElement('button');
            closeBtn.className = 'config-close';
            closeBtn.textContent = '×';
            closeBtn.onclick = () => this.hideSettingsPanel();
            header.appendChild(title);
            header.appendChild(closeBtn);

            // 内容区
            const content = document.createElement('div');
            content.className = 'config-content';

            // 成功消息
            const successMsg = document.createElement('div');
            successMsg.className = 'config-success';
            successMsg.id = 'save-success-msg';
            successMsg.textContent = '✓ 配置已成功保存！';
            content.appendChild(successMsg);

            // AI 提供商选择
            const providerGroup = this.createFormGroup({
                key: 'aiProvider',
                label: 'AI 提供商',
                type: 'select',
                options: [
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'anthropic', label: 'Anthropic (Claude)' },
                    { value: 'ollama', label: 'Ollama (本地)' },
                    { value: 'chrome-gemini', label: 'Chrome Gemini (浏览器内置)' },
                    { value: 'dify', label: 'Dify Workflow' }
                ],
                help: '选择你要使用的 AI 服务提供商'
            });
            content.appendChild(providerGroup);

            // Dify 配置区
            const difySection = document.createElement('div');
            difySection.id = 'dify-config-section';
            difySection.style.display = 'none';

            const difyUrlGroup = this.createFormGroup({
                key: 'difyApiUrl',
                label: 'Dify API 地址',
                type: 'text',
                placeholder: 'https://api.dify.ai/v1/workflows/run',
                help: '你的 Dify 工作流 API 地址'
            });
            const difyKeyGroup = this.createFormGroup({
                key: 'difyApiKey',
                label: 'Dify API Key',
                type: 'password',
                placeholder: 'app-...',
                help: '你的 Dify API 密钥'
            });
            difySection.appendChild(difyUrlGroup);
            difySection.appendChild(difyKeyGroup);
            content.appendChild(difySection);

            // 统一 LLM 配置区
            const llmSection = document.createElement('div');
            llmSection.id = 'llm-config-section';
            llmSection.style.display = 'none';

            const llmUrlGroup = this.createFormGroup({
                key: 'aiBaseUrl',
                label: 'API 地址',
                type: 'text',
                placeholder: 'https://api.openai.com/v1',
                help: 'API 基础地址（Ollama: http://localhost:11434, Anthropic: https://api.anthropic.com）'
            });
            const llmKeyGroup = this.createFormGroup({
                key: 'aiApiKey',
                label: 'API Key',
                type: 'password',
                placeholder: 'sk-...',
                help: '你的 API 密钥'
            });
            const llmModelGroup = this.createFormGroup({
                key: 'aiModel',
                label: 'AI 模型',
                type: 'text',
                placeholder: 'gpt-4',
                help: '模型名称（如: gpt-4, claude-sonnet-4-5, llama3, gemini-nano）'
            });
            const llmPromptGroup = this.createFormGroup({
                key: 'aiSystemPrompt',
                label: '系统提示词（可选）',
                type: 'textarea',
                placeholder: '自定义总结提示词，留空使用默认',
                help: '自定义总结时的系统提示词，留空则使用默认提示词'
            });

            llmSection.appendChild(llmUrlGroup);
            llmSection.appendChild(llmKeyGroup);
            llmSection.appendChild(llmModelGroup);
            llmSection.appendChild(llmPromptGroup);
            content.appendChild(llmSection);

            // Chrome Gemini 提示区
            const geminiSection = document.createElement('div');
            geminiSection.id = 'gemini-hint-section';
            geminiSection.style.display = 'none';
            geminiSection.innerHTML = `
                <div style="background: #e0f2fe; border: 1px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <h4 style="margin: 0 0 12px 0; color: #0369a1;">Chrome Gemini 使用说明</h4>
                    <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.6;">Chrome Gemini 是浏览器内置的 AI，无需配置 API Key，完全本地运行。</p>
                    <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.6;"><strong>前置条件：</strong></p>
                    <ol style="margin: 0 0 8px 0; padding-left: 20px; font-size: 13px; line-height: 1.6;">
                        <li>使用 Chrome Canary 127+ 或 Chrome Dev 127+</li>
                        <li>访问 <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 3px;">chrome://flags/#prompt-api-for-gemini-nano</code> 启用 Prompt API</li>
                        <li>访问 <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 3px;">chrome://components/</code> 下载 Gemini Nano 模型（约 1.7GB）</li>
                    </ol>
                    <p style="margin: 0; font-size: 13px; color: #0369a1;"><strong>优势：</strong>完全本地、零成本、快速响应、隐私保护</p>
                </div>
            `;
            content.appendChild(geminiSection);

            // 按钮区
            const actions = document.createElement('div');
            actions.className = 'config-actions';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'config-btn config-btn-secondary';
            cancelBtn.textContent = '取消';
            cancelBtn.onclick = () => this.hideSettingsPanel();
            const saveBtn = document.createElement('button');
            saveBtn.className = 'config-btn config-btn-primary';
            saveBtn.textContent = '保存配置';
            saveBtn.onclick = () => this.saveSettingsFromPanel();
            actions.appendChild(cancelBtn);
            actions.appendChild(saveBtn);

            panel.appendChild(header);
            panel.appendChild(content);
            panel.appendChild(actions);

            // 阻止面板内的点击事件冒泡到遮罩层
            panel.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            document.body.appendChild(panel);
            this.settingsPanel = panel;

            // 监听 AI 提供商变化
            const providerSelect = providerGroup.querySelector('select');
            providerSelect.addEventListener('change', () => {
                this.updateConfigSections(providerSelect.value);
            });

            // 创建遮罩层
            this.createOverlay();
        }

        createFormGroup(config) {
            const group = document.createElement('div');
            group.className = 'config-form-group';

            const label = document.createElement('label');
            label.className = 'config-label';
            label.textContent = config.label;
            label.setAttribute('for', `config-${config.key}`);

            let input;
            if (config.type === 'select') {
                input = document.createElement('select');
                input.className = 'config-input config-select';
                config.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    input.appendChild(option);
                });
            } else if (config.type === 'textarea') {
                input = document.createElement('textarea');
                input.className = 'config-input config-textarea';
                input.placeholder = config.placeholder || '';
            } else {
                input = document.createElement('input');
                input.className = 'config-input';
                input.type = config.type || 'text';
                input.placeholder = config.placeholder || '';
            }
            input.id = `config-${config.key}`;
            input.dataset.key = config.key;

            const help = document.createElement('div');
            help.className = 'config-help';
            help.textContent = config.help || '';

            group.appendChild(label);
            group.appendChild(input);
            if (config.help) group.appendChild(help);

            return group;
        }

        updateConfigSections(provider) {
            const difySection = document.getElementById('dify-config-section');
            const llmSection = document.getElementById('llm-config-section');
            const geminiSection = document.getElementById('gemini-hint-section');
            const llmUrlGroup = llmSection.querySelector('[data-key="aiBaseUrl"]').closest('.config-form-group');
            const llmKeyGroup = llmSection.querySelector('[data-key="aiApiKey"]').closest('.config-form-group');

            // 隐藏所有区块
            difySection.style.display = 'none';
            llmSection.style.display = 'none';
            geminiSection.style.display = 'none';

            if (provider === 'dify') {
                // 显示 Dify 配置
                difySection.style.display = 'block';
            } else if (provider === 'chrome-gemini') {
                // 显示 Chrome Gemini 提示
                geminiSection.style.display = 'block';
                llmSection.style.display = 'block';
                // 隐藏不需要的字段
                llmUrlGroup.style.display = 'none';
                llmKeyGroup.style.display = 'none';
            } else if (provider === 'ollama') {
                // 显示 Ollama 配置（不需要 API Key）
                llmSection.style.display = 'block';
                llmUrlGroup.style.display = 'block';
                llmKeyGroup.style.display = 'none';
            } else {
                // 显示完整的 LLM 配置（OpenAI, Anthropic）
                llmSection.style.display = 'block';
                llmUrlGroup.style.display = 'block';
                llmKeyGroup.style.display = 'block';
            }
        }

        createOverlay() {
            // 检查是否已存在 overlay
            if (this.overlay) return;

            const overlay = document.createElement('div');
            overlay.className = 'config-overlay';
            overlay.id = 'dify-overlay';
            overlay.addEventListener('click', (e) => {
                // 只有点击遮罩层本身才关闭，不影响面板内的点击
                if (e.target === overlay) {
                    this.hidePanel();
                    this.hideSettingsPanel();
                }
            });
            document.body.appendChild(overlay);
            this.overlay = overlay;
        }

        async handleSummarize() {
            // 防止重复点击
            if (this.button.classList.contains('loading')) return;

            try {
                // 显示加载状态
                this.button.classList.add('loading');
                const iconSpan = this.button.querySelector('.btn-icon');
                const textSpan = this.button.querySelector('.btn-text');
                if (iconSpan) iconSpan.textContent = '⏳';
                if (textSpan) textSpan.textContent = '处理中...';

                // 显示面板并展示加载动画
                this.showLoadingPanel();

                // 优先检查是否有选中的文本
                const selection = window.getSelection();
                const selectedText = selection ? selection.toString().trim() : '';

                let newsContent = '';
                let isSelectionMode = false;

                if (selectedText && selectedText.length >= 50) {
                    // 使用选中的文本
                    newsContent = selectedText;
                    isSelectionMode = true;
                    console.log('使用选中文本，长度:', newsContent.length);
                } else {
                    // 提取全文内容
                    const extractor = new ContentExtractor();
                    newsContent = extractor.extract();
                    console.log('提取全文内容，长度:', newsContent.length);
                    console.log('内容预览:', newsContent.substring(0, 500));
                }

                const newsUrl = window.location.href;

                if (!newsContent || newsContent.length < 50) {
                    throw new Error('未能提取到有效的内容，请刷新页面后重试');
                }

                // 保存总结模式（用于显示标题）
                this.currentSummaryMode = isSelectionMode ? 'selection' : 'full';

                // 根据配置选择 AI 提供商
                let rawResult;
                const provider = summarizerConfig.get('aiProvider') || 'unified';

                if (provider === 'dify') {
                    rawResult = await DifyAPI.summarize(newsUrl, newsContent);
                } else {
                    // 使用统一LLM配置（OpenAI/Anthropic/Ollama/Chrome Gemini）
                    rawResult = await UnifiedAPI.summarize(newsUrl, newsContent);
                }

                // 解析合并回复中的AI生成概率与正文内容
                // Dify工作流输出格式不可控，aiScore可能为null
                const { aiScore, content } = parseAIScore(rawResult);

                // 保存原始结果文本（用于复制，去除分数行）
                this.currentResult = content;

                // 显示结果
                this.showResultPanel(content, aiScore);

            } catch (error) {
                console.error('错误:', error);
                this.showErrorPanel(error.message);
            } finally {
                // 恢复按钮状态
                this.button.classList.remove('loading');

                // 清除文本选择（如果是选中文本总结的话）
                if (this.currentSummaryMode === 'selection') {
                    window.getSelection().removeAllRanges();
                }

                const iconSpan = this.button.querySelector('.btn-icon');
                const textSpan = this.button.querySelector('.btn-text');
                if (iconSpan) iconSpan.textContent = '📝';
                if (textSpan) textSpan.textContent = 'AI总结';
                this.button.title = '点击总结全文，或选中文本后点击总结选中部分';
            }
        }

        showLoadingPanel() {
            // 显示加载动画
            const contentDiv = this.panel.querySelector('#dify-panel-content');
            contentDiv.textContent = ''; // 清空内容

            const spinner = document.createElement('div');
            spinner.className = 'dify-loading-spinner';
            contentDiv.appendChild(spinner);

            // 确保面板处于非全屏状态（新请求时）
            if (this.isFullscreen) {
                this.toggleFullscreen();
            }

            // 重置位置到居中
            this.panel.style.top = '50%';
            this.panel.style.left = '50%';
            this.panel.style.transform = 'translate(-50%, -50%)';

            this.panel.classList.add('show');
            this.overlay.classList.add('show');
        }

        showResultPanel(result, aiScore = null) {
            // 更新面板标题
            const titleElement = this.panel.querySelector('#dify-panel-title');
            if (this.currentSummaryMode === 'selection') {
                titleElement.textContent = '📝 AI总结结果（选中文本）';
            } else {
                titleElement.textContent = '📝 AI总结结果（全文）';
            }

            const contentDiv = this.panel.querySelector('#dify-panel-content');
            contentDiv.textContent = '';

            if (aiScore !== null) {
                // 渲染AI生成概率条
                const badge = document.createElement('div');
                badge.className = 'dify-ai-score-badge';
                let color, label, emoji;
                if (aiScore < 30) {
                    color = '#10b981';
                    label = '人工创作';
                    emoji = '✍️';
                } else if (aiScore < 60) {
                    color = '#f59e0b';
                    label = '疑似混合';
                    emoji = '⚠️';
                } else {
                    color = '#ef4444';
                    label = 'AI生成';
                    emoji = '🤖';
                }
                badge.innerHTML = `
                    <span>${emoji} AI生成概率</span>
                    <div class="dify-ai-score-bar">
                        <div class="dify-ai-score-fill" style="width:${aiScore}%;background:${color}"></div>
                    </div>
                    <span class="dify-ai-score-value" style="color:${color}">${aiScore}% · ${label}</span>
                `;
                contentDiv.appendChild(badge);
            }

            // 将 Markdown 格式的结果转换为 DOM 元素
            this.renderMarkdownContent(result, contentDiv);

            // 重置滚动位置到顶部，确保内容完整显示
            contentDiv.scrollTop = 0;

            this.panel.classList.add('show');
            this.overlay.classList.add('show');
        }

        showErrorPanel(errorMessage) {
            // 显示错误信息
            const contentDiv = this.panel.querySelector('#dify-panel-content');
            contentDiv.textContent = ''; // 清空内容

            const errorDiv = document.createElement('div');
            errorDiv.className = 'dify-error-message';

            const errorTitle = document.createElement('h4');
            errorTitle.style.marginTop = '0';
            errorTitle.textContent = '❌ 处理失败';

            const errorText = document.createElement('p');
            errorText.textContent = errorMessage;

            errorDiv.appendChild(errorTitle);
            errorDiv.appendChild(errorText);
            contentDiv.appendChild(errorDiv);

            this.panel.classList.add('show');
            this.overlay.classList.add('show');
        }

        hidePanel() {
            // 退出全屏模式
            if (this.isFullscreen) {
                this.toggleFullscreen();
            }
            this.panel.classList.remove('show');
            this.overlay.classList.remove('show');
        }

        toggleFullscreen() {
            this.isFullscreen = !this.isFullscreen;

            if (this.isFullscreen) {
                // 进入全屏
                this.panel.classList.add('fullscreen');
                this.panel.classList.remove('draggable');
                this.panelHeader.classList.remove('draggable');
                this.fullscreenBtn.textContent = '⤓';
                this.fullscreenBtn.title = '退出全屏';
            } else {
                // 退出全屏
                this.panel.classList.remove('fullscreen');
                this.panel.classList.add('draggable');
                this.panelHeader.classList.add('draggable');
                this.fullscreenBtn.textContent = '⤢';
                this.fullscreenBtn.title = '全屏显示';
                // 恢复居中位置
                this.panel.style.top = '50%';
                this.panel.style.left = '50%';
                this.panel.style.transform = 'translate(-50%, -50%)';
            }
        }

        makePanelDraggable() {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            let isDragging = false;
            const self = this;

            // 只有非全屏状态才能拖拽
            const handleMouseDown = (e) => {
                // 如果点击的是按钮或其子元素，不触发拖拽
                if (e.target.closest('button') || e.target.tagName === 'BUTTON') {
                    return;
                }

                // 如果点击的是内容区域或其子元素，不触发拖拽，允许文本选择
                if (e.target.closest('#dify-panel-content')) {
                    return;
                }

                // 全屏状态下不允许拖拽
                if (self.isFullscreen) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                isDragging = true;
                pos3 = e.clientX;
                pos4 = e.clientY;

                self.panel.classList.add('dragging');
                self.panelHeader.classList.add('dragging');

                // 移除居中定位
                const rect = self.panel.getBoundingClientRect();
                self.panel.style.top = rect.top + 'px';
                self.panel.style.left = rect.left + 'px';
                self.panel.style.transform = 'none';

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            };

            const handleMouseMove = (e) => {
                if (!isDragging || self.isFullscreen) return;

                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                // 计算新位置
                let newTop = self.panel.offsetTop - pos2;
                let newLeft = self.panel.offsetLeft - pos1;

                // 边界检查
                const maxX = window.innerWidth - self.panel.offsetWidth;
                const maxY = window.innerHeight - self.panel.offsetHeight;

                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));

                self.panel.style.top = newTop + 'px';
                self.panel.style.left = newLeft + 'px';
            };

            const handleMouseUp = () => {
                if (isDragging) {
                    isDragging = false;
                    self.panel.classList.remove('dragging');
                    self.panelHeader.classList.remove('dragging');
                }
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            // 在标题栏上添加拖拽功能
            this.panelHeader.addEventListener('mousedown', handleMouseDown);
            this.panelHeader.classList.add('draggable');
            this.panel.classList.add('draggable');
        }

        renderMarkdownContent(text, container) {
            // 将 Markdown 文本转换为 DOM 元素（增强版实现）
            const lines = text.split('\n');
            let i = 0;
            let currentParagraph = null;
            let inCodeBlock = false;
            let codeBlockLanguage = '';
            let codeBlockContent = [];
            let inTable = false;
            let tableHeaders = [];
            let tableRows = [];

            while (i < lines.length) {
                const line = lines[i];
                const trimmedLine = line.trim();

                // 处理代码块
                if (trimmedLine.startsWith('```')) {
                    if (inCodeBlock) {
                        // 结束代码块
                        const pre = document.createElement('pre');
                        const code = document.createElement('code');
                        code.textContent = codeBlockContent.join('\n');
                        pre.appendChild(code);
                        container.appendChild(pre);
                        inCodeBlock = false;
                        codeBlockContent = [];
                        codeBlockLanguage = '';
                        currentParagraph = null;
                    } else {
                        // 开始代码块
                        if (currentParagraph) {
                            container.appendChild(currentParagraph);
                            currentParagraph = null;
                        }
                        inCodeBlock = true;
                        codeBlockLanguage = trimmedLine.substring(3).trim();
                    }
                    i++;
                    continue;
                }

                if (inCodeBlock) {
                    codeBlockContent.push(line);
                    i++;
                    continue;
                }

                // 处理分隔线
                if (trimmedLine.match(/^[-*_]{3,}$/)) {
                    if (currentParagraph) {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    const hr = document.createElement('hr');
                    container.appendChild(hr);
                    i++;
                    continue;
                }

                // 处理表格
                if (trimmedLine.includes('|') && trimmedLine.split('|').length >= 3) {
                    // 检查是否是表头分隔行
                    if (trimmedLine.match(/^\|[\s\-:]+$/)) {
                        i++;
                        continue;
                    }

                    const cells = trimmedLine.split('|').map(c => c.trim()).filter(c => c);
                    if (cells.length > 0) {
                        if (!inTable) {
                            // 开始表格
                            inTable = true;
                            tableHeaders = cells;
                            tableRows = [];
                        } else {
                            tableRows.push(cells);
                        }
                    }
                    i++;
                    continue;
                } else if (inTable) {
                    // 结束表格
                    this.renderTable(tableHeaders, tableRows, container);
                    inTable = false;
                    tableHeaders = [];
                    tableRows = [];
                    currentParagraph = null;
                    continue;
                }

                // 处理空行
                if (!trimmedLine) {
                    if (currentParagraph) {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    i++;
                    continue;
                }

                // 处理标题
                const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
                if (headingMatch) {
                    if (currentParagraph) {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    const level = headingMatch[1].length;
                    const text = headingMatch[2];
                    const heading = document.createElement(`h${Math.min(level, 6)}`);
                    this.appendFormattedText(text, heading);
                    container.appendChild(heading);
                    i++;
                    continue;
                }

                // 处理引用
                if (trimmedLine.startsWith('> ')) {
                    // 如果当前不是引用块，先结束当前段落
                    if (currentParagraph && currentParagraph.tagName !== 'BLOCKQUOTE') {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    // 如果当前没有引用块，创建新的引用块
                    if (!currentParagraph) {
                        currentParagraph = document.createElement('blockquote');
                    }
                    const quoteText = trimmedLine.substring(2);
                    // 如果引用块中已有内容，添加换行
                    if (currentParagraph.textContent.trim()) {
                        const br = document.createElement('br');
                        currentParagraph.appendChild(br);
                    }
                    this.appendFormattedText(quoteText, currentParagraph);
                    i++;
                    continue;
                }

                // 处理列表项（无序列表）
                const unorderedListMatch = trimmedLine.match(/^[\*\-\+]\s+(.+)$/);
                if (unorderedListMatch) {
                    // 如果当前不是列表，先结束当前段落
                    if (currentParagraph && currentParagraph.tagName !== 'UL') {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    // 如果当前没有列表或不是无序列表，创建新的无序列表
                    if (!currentParagraph || currentParagraph.tagName !== 'UL') {
                        if (currentParagraph) {
                            container.appendChild(currentParagraph);
                        }
                        currentParagraph = document.createElement('ul');
                    }
                    const li = document.createElement('li');
                    this.appendFormattedText(unorderedListMatch[1], li);
                    currentParagraph.appendChild(li);
                    i++;
                    continue;
                }

                // 处理列表项（有序列表）
                const orderedListMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
                if (orderedListMatch) {
                    // 如果当前不是列表，先结束当前段落
                    if (currentParagraph && currentParagraph.tagName !== 'OL') {
                        container.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    // 如果当前没有列表或不是有序列表，创建新的有序列表
                    if (!currentParagraph || currentParagraph.tagName !== 'OL') {
                        if (currentParagraph) {
                            container.appendChild(currentParagraph);
                        }
                        currentParagraph = document.createElement('ol');
                    }
                    const li = document.createElement('li');
                    this.appendFormattedText(orderedListMatch[1], li);
                    currentParagraph.appendChild(li);
                    i++;
                    continue;
                }

                // 普通文本段落
                // 如果当前是列表或其他非段落元素，先结束它
                if (currentParagraph && currentParagraph.tagName !== 'P' && currentParagraph.tagName !== 'BLOCKQUOTE') {
                    container.appendChild(currentParagraph);
                    currentParagraph = null;
                }

                if (!currentParagraph) {
                    currentParagraph = document.createElement('p');
                }

                this.appendFormattedText(trimmedLine, currentParagraph);
                currentParagraph.appendChild(document.createElement('br'));
                i++;
            }

            // 处理剩余内容
            if (inCodeBlock && codeBlockContent.length > 0) {
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.textContent = codeBlockContent.join('\n');
                pre.appendChild(code);
                container.appendChild(pre);
            }

            if (inTable && tableRows.length > 0) {
                this.renderTable(tableHeaders, tableRows, container);
            }

            if (currentParagraph && currentParagraph.textContent.trim()) {
                container.appendChild(currentParagraph);
            }
        }

        renderTable(headers, rows, container) {
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            const tbody = document.createElement('tbody');
            const headerRow = document.createElement('tr');

            headers.forEach(header => {
                const th = document.createElement('th');
                this.appendFormattedText(header, th);
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);

            rows.forEach(row => {
                const tr = document.createElement('tr');
                row.forEach(cell => {
                    const td = document.createElement('td');
                    this.appendFormattedText(cell, td);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });

            table.appendChild(thead);
            table.appendChild(tbody);
            container.appendChild(table);
        }

        appendFormattedText(text, container) {
            // 增强的 Markdown 格式处理，支持链接、代码、粗体、斜体等
            const parts = [];
            let i = 0;

            while (i < text.length) {
                // 处理行内代码 `code`
                if (text[i] === '`') {
                    let codeText = '';
                    i++;
                    while (i < text.length && text[i] !== '`') {
                        codeText += text[i];
                        i++;
                    }
                    if (i < text.length) {
                        parts.push({ type: 'code', content: codeText });
                        i++;
                        continue;
                    }
                }

                // 处理链接 [text](url)
                if (text[i] === '[') {
                    let linkText = '';
                    i++;
                    while (i < text.length && text[i] !== ']') {
                        linkText += text[i];
                        i++;
                    }
                    if (i < text.length && text[i + 1] === '(') {
                        i += 2; // 跳过 ](
                        let linkUrl = '';
                        while (i < text.length && text[i] !== ')') {
                            linkUrl += text[i];
                            i++;
                        }
                        if (i < text.length) {
                            parts.push({ type: 'link', text: linkText, url: linkUrl });
                            i++;
                            continue;
                        }
                    }
                }

                // 处理图片 ![alt](url)
                if (text[i] === '!' && text[i + 1] === '[') {
                    let altText = '';
                    i += 2;
                    while (i < text.length && text[i] !== ']') {
                        altText += text[i];
                        i++;
                    }
                    if (i < text.length && text[i + 1] === '(') {
                        i += 2; // 跳过 ](
                        let imgUrl = '';
                        while (i < text.length && text[i] !== ')') {
                            imgUrl += text[i];
                            i++;
                        }
                        if (i < text.length) {
                            parts.push({ type: 'image', alt: altText, url: imgUrl });
                            i++;
                            continue;
                        }
                    }
                }

                // 处理粗体 **text** 或 __text__
                if ((text[i] === '*' && text[i + 1] === '*') || (text[i] === '_' && text[i + 1] === '_')) {
                    const marker = text[i];
                    i += 2;
                    let boldText = '';
                    while (i < text.length - 1) {
                        if (text[i] === marker && text[i + 1] === marker) {
                            i += 2;
                            break;
                        }
                        boldText += text[i];
                        i++;
                    }
                    parts.push({ type: 'bold', content: boldText });
                    continue;
                }

                // 处理斜体 *text* 或 _text_（但不能是 ** 或 __）
                if (text[i] === '*' || text[i] === '_') {
                    if (text[i + 1] !== text[i]) {
                        const marker = text[i];
                        i++;
                        let italicText = '';
                        while (i < text.length) {
                            if (text[i] === marker && (i === text.length - 1 || text[i + 1] !== marker)) {
                                i++;
                                break;
                            }
                            italicText += text[i];
                            i++;
                        }
                        parts.push({ type: 'italic', content: italicText });
                        continue;
                    }
                }

                // 普通文本
                let textStart = i;
                while (i < text.length) {
                    if (text[i] === '`' || text[i] === '[' || text[i] === '!' ||
                        text[i] === '*' || text[i] === '_') {
                        break;
                    }
                    i++;
                }
                if (i > textStart) {
                    parts.push({ type: 'text', content: text.substring(textStart, i) });
                }
            }

            // 创建 DOM 元素
            for (let part of parts) {
                if (part.type === 'text') {
                    container.appendChild(document.createTextNode(part.content));
                } else if (part.type === 'bold') {
                    const strong = document.createElement('strong');
                    this.appendFormattedText(part.content, strong);
                    container.appendChild(strong);
                } else if (part.type === 'italic') {
                    const em = document.createElement('em');
                    this.appendFormattedText(part.content, em);
                    container.appendChild(em);
                } else if (part.type === 'code') {
                    const code = document.createElement('code');
                    code.textContent = part.content;
                    container.appendChild(code);
                } else if (part.type === 'link') {
                    const a = document.createElement('a');
                    a.href = part.url;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    this.appendFormattedText(part.text, a);
                    container.appendChild(a);
                } else if (part.type === 'image') {
                    const img = document.createElement('img');
                    img.src = part.url;
                    img.alt = part.alt;
                    container.appendChild(img);
                }
            }
        }

        copyResult() {
            // 如果没有结果，直接返回
            if (!this.currentResult) {
                console.warn('没有可复制的内容');
                return;
            }

            const copyBtn = this.panel.querySelector('#dify-copy-btn');
            const copyText = copyBtn.querySelector('.copy-text');
            const copyIcon = copyBtn.querySelector('.copy-icon');

            try {
                // 创建临时文本区域
                const textarea = document.createElement('textarea');
                textarea.value = this.currentResult;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                textarea.style.top = '0';
                document.body.appendChild(textarea);

                // 选择并复制文本
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);
                const successful = document.execCommand('copy');

                // 移除临时元素
                document.body.removeChild(textarea);

                if (successful) {
                    // 显示复制成功状态
                    copyBtn.classList.add('copied');
                    copyIcon.textContent = '✓';
                    copyText.textContent = '已复制';

                    console.log('复制成功，内容长度:', this.currentResult.length);

                    // 2秒后恢复按钮状态
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyIcon.textContent = '📋';
                        copyText.textContent = '复制结果';
                    }, 2000);
                } else {
                    throw new Error('复制命令执行失败');
                }
            } catch (error) {
                console.error('复制失败:', error);

                // 尝试使用现代 Clipboard API
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(this.currentResult)
                        .then(() => {
                            copyBtn.classList.add('copied');
                            copyIcon.textContent = '✓';
                            copyText.textContent = '已复制';

                            setTimeout(() => {
                                copyBtn.classList.remove('copied');
                                copyIcon.textContent = '📋';
                                copyText.textContent = '复制结果';
                            }, 2000);
                        })
                        .catch(err => {
                            console.error('Clipboard API 失败:', err);
                            copyText.textContent = '复制失败';
                            setTimeout(() => {
                                copyText.textContent = '复制结果';
                            }, 2000);
                        });
                } else {
                    copyText.textContent = '复制失败';
                    setTimeout(() => {
                        copyText.textContent = '复制结果';
                    }, 2000);
                }
            }
        }

        showSettings() {
            // 确保配置面板已创建
            if (!this.settingsPanel) {
                console.error('[配置] 配置面板未创建');
                return;
            }

            // 加载当前配置值
            const provider = summarizerConfig.get('aiProvider') || 'openai';

            // 填充表单值
            const providerInput = this.settingsPanel.querySelector('[data-key="aiProvider"]');
            const difyUrlInput = this.settingsPanel.querySelector('[data-key="difyApiUrl"]');
            const difyKeyInput = this.settingsPanel.querySelector('[data-key="difyApiKey"]');
            const aiBaseUrlInput = this.settingsPanel.querySelector('[data-key="aiBaseUrl"]');
            const aiApiKeyInput = this.settingsPanel.querySelector('[data-key="aiApiKey"]');
            const aiModelInput = this.settingsPanel.querySelector('[data-key="aiModel"]');
            const aiSystemPromptInput = this.settingsPanel.querySelector('[data-key="aiSystemPrompt"]');

            if (providerInput) providerInput.value = provider;
            if (difyUrlInput) difyUrlInput.value = summarizerConfig.get('difyApiUrl') || '';
            if (difyKeyInput) difyKeyInput.value = summarizerConfig.get('difyApiKey') || '';
            if (aiBaseUrlInput) aiBaseUrlInput.value = summarizerConfig.get('aiBaseUrl') || '';
            if (aiApiKeyInput) aiApiKeyInput.value = summarizerConfig.get('aiApiKey') || '';
            if (aiModelInput) aiModelInput.value = summarizerConfig.get('aiModel') || '';
            if (aiSystemPromptInput) aiSystemPromptInput.value = summarizerConfig.get('aiSystemPrompt') || '';

            // 更新配置区块显示
            this.updateConfigSections(provider);

            // 显示面板和遮罩
            this.settingsPanel.classList.add('show');
            if (this.overlay) {
                this.overlay.classList.add('show');
            }

            console.log('[配置] 配置面板已打开');
        }

        hideSettingsPanel() {
            if (!this.settingsPanel) return;

            this.settingsPanel.classList.remove('show');
            if (this.overlay) {
                this.overlay.classList.remove('show');
            }
        }

        saveSettingsFromPanel() {
            const provider = this.settingsPanel.querySelector('[data-key="aiProvider"]').value;

            // 保存 AI 提供商
            summarizerConfig.set('aiProvider', provider);

            if (provider === 'dify') {
                // 保存 Dify 配置
                const difyUrl = this.settingsPanel.querySelector('[data-key="difyApiUrl"]').value.trim();
                const difyKey = this.settingsPanel.querySelector('[data-key="difyApiKey"]').value.trim();

                if (!difyUrl || !difyKey) {
                    alert('请填写完整的 Dify 配置信息');
                    return;
                }

                summarizerConfig.set('difyApiUrl', difyUrl);
                summarizerConfig.set('difyApiKey', difyKey);
            } else if (provider !== 'chrome-gemini') {
                // 保存统一 LLM 配置（OpenAI, Anthropic, Ollama）
                const baseUrl = this.settingsPanel.querySelector('[data-key="aiBaseUrl"]').value.trim();
                const apiKey = this.settingsPanel.querySelector('[data-key="aiApiKey"]').value.trim();
                const model = this.settingsPanel.querySelector('[data-key="aiModel"]').value.trim();
                const systemPrompt = this.settingsPanel.querySelector('[data-key="aiSystemPrompt"]').value.trim();

                if (!baseUrl || (provider !== 'ollama' && !apiKey) || !model) {
                    alert('请填写完整的配置信息');
                    return;
                }

                // 根据提供商设置 aiApiFormat
                summarizerConfig.set('aiApiFormat', provider);
                summarizerConfig.set('aiBaseUrl', baseUrl);
                summarizerConfig.set('aiApiKey', apiKey);
                summarizerConfig.set('aiModel', model);
                summarizerConfig.set('aiSystemPrompt', systemPrompt);
            } else {
                // Chrome Gemini
                summarizerConfig.set('aiApiFormat', 'chrome-gemini');
                const model = this.settingsPanel.querySelector('[data-key="aiModel"]').value.trim() || 'gemini-nano';
                const systemPrompt = this.settingsPanel.querySelector('[data-key="aiSystemPrompt"]').value.trim();
                summarizerConfig.set('aiModel', model);
                summarizerConfig.set('aiSystemPrompt', systemPrompt);
            }

            // 显示成功消息
            const successMsg = document.getElementById('save-success-msg');
            successMsg.classList.add('show');

            setTimeout(() => {
                successMsg.classList.remove('show');
                this.hideSettingsPanel();
            }, 1500);

            console.log('[配置] 保存成功，提供商:', provider);
        }

        saveSettings() {
            // 兼容旧方法调用
            this.saveSettingsFromPanel();
        }

        updateConfigStatus() {
            // ConfigManager 会自动更新状态
            // 这个方法保留以防其他地方调用
        }

        updateConfigStatus() {
            // ConfigManager 会自动更新状态
            // 这个方法保留以防其他地方调用
        }

        initFullscreenDetection() {
            // 检测全屏状态变化
            const handleFullscreenChange = () => {
                if (this.button) {
                    const isFullscreen = !!(document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement ||
                        document.msFullscreenElement);

                    if (isFullscreen) {
                        // 全屏时隐藏按钮
                        if (!this.button.classList.contains('hidden')) {
                            this.button.classList.add('hidden');
                        }
                    } else {
                        // 退出全屏时显示按钮
                        if (this.button.classList.contains('hidden')) {
                            this.button.classList.remove('hidden');
                        }
                    }
                }
            };

            // 监听各种全屏事件
            document.addEventListener('fullscreenchange', handleFullscreenChange);
            document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.addEventListener('mozfullscreenchange', handleFullscreenChange);
            document.addEventListener('MSFullscreenChange', handleFullscreenChange);


            // 监听窗口大小变化（用于检测伪全屏）
            window.addEventListener('resize', () => {
                console.log('[Dify Debug] 📢 窗口大小变化');
                handleFullscreenChange();
            });

            // 初始检查
            handleFullscreenChange();

            // 定期检查（备用方案，每500ms检查一次）
            // console.log('[Dify Debug] 启动定期检查（500ms）');
            // this.fullscreenCheckInterval = setInterval(() => {
            //     console.log('[Dify Debug] 🔄 定期检查全屏状态');
            //     handleFullscreenChange();
            // }, 500);
        }
    }

    // ==================== 初始化 ====================
    let uiManager = null;

    function init() {
        // 只在主窗口中运行，避免在iframe中重复创建
        if (window !== window.top) {
            //console.log('检测到iframe环境，跳过初始化');
            return;
        }

        // 检查是否有多个同类型的脚本元素（防止重复加载）
        const existingButtons = document.querySelectorAll('[id*="dify"]');
        if (existingButtons.length > 0) {
            console.log('[Dify] 检测到已存在的dify元素，跳过初始化');
            return;
        }

        // 直接初始化，不需要等待页面加载
        uiManager = new UIManager();
        registerMenuCommands();
    }

    // 注册油猴菜单命令
    function registerMenuCommands() {
        GM_registerMenuCommand('📝 AI总结当前页面', () => {
            if (uiManager) {
                uiManager.handleSummarize();
            }
        });

        GM_registerMenuCommand('⚙️ 打开设置', () => {
            if (uiManager) {
                uiManager.showSettings();
            }
        });

        GM_registerMenuCommand('📍 重置按钮位置', () => {
            if (uiManager && uiManager.button) {
                // 重置到默认位置（贴右边）
                uiManager.button.classList.remove('free-mode');
                uiManager.button.classList.add('edge-mode');
                uiManager.button.style.left = 'auto';
                uiManager.button.style.top = 'auto';
                uiManager.button.style.right = '0px';
                uiManager.button.style.bottom = '80px';

                // 重置圆角样式为右边模式
                uiManager.button.style.borderTopLeftRadius = '25px';
                uiManager.button.style.borderBottomLeftRadius = '25px';
                uiManager.button.style.borderTopRightRadius = '0';
                uiManager.button.style.borderBottomRightRadius = '0';

                GM_setValue('buttonPosition', null);
                console.log('按钮位置已重置为贴右边模式');
            }
        });
    }

    // 启动脚本
    init();

    console.log('[Dify Web Summarizer] 脚本已加载');
})();