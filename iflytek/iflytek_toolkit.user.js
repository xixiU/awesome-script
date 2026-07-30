// ==UserScript==
// @name         iFlytek Toolkit (登录助手 + 解除复制限制)
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  讯飞全域工具箱：自动登录、解除云盘/知识库/邮件等所有讯飞域名的复制限制，提升办公效率
// @author       yuan
// @match        *://*.iflytek.*/*
// @match        *://*.iflytek.com/*
// @match        *://*.iflytek.cn/*
// @icon         https://in.iflytek.com/resources/fornt/img/icons/iflyui-shortcut.png
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/iflytek_toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/iflytek_toolkit.user.js
// ==/UserScript==

/**
 * ============================================================
 * 脚本功能概述：
 *
 * 1. 自动登录助手
 *    - 场景1: Coremail 邮件系统自动登录
 *    - 场景2: 中间页自动点击"使用集团账号登录"
 *    - 场景3: 集团统一认证自动登录
 *
 * 2. 解除网页复制限制
 *    - 解除云盘、知识库、邮件等所有讯飞域名的复制限制
 *    - 解除粘贴、右键菜单、文本选择限制
 *    - 支持动态内容和 iframe 嵌套
 *    - 三重保障：事件拦截 + 属性清除 + CSS 强制
 *
 * 更新日志：
 * v1.0.0 (2026-07-30)
 * - 整合自动登录和解除复制限制功能
 * - 统一适配所有讯飞域名
 * - 优化事件拦截逻辑
 * ============================================================
 */

(function () {
    'use strict';

    console.log('[iFlytek Toolkit] 脚本已加载');

    /******************************************************************
     *
     * PART 1: 解除网页复制限制模块
     *
     * 工作原理（第一性原理）：
     * 1. 清除内联事件属性（oncopy/onpaste/oncontextmenu/onselectstart 等）
     * 2. 在捕获阶段拦截事件（stopImmediatePropagation 阻止页面处理）
     * 3. 注入 CSS 强制 user-select: text（覆盖 none）
     * 4. 监听 DOM 变化，处理动态内容
     * 5. 递归处理所有 iframe
     *
     ******************************************************************/

    function enableCopyFeature() {
        console.log('[iFlytek Toolkit] 解除复制限制模块已加载');

        // 需要解除的事件类型
        const eventsToUnblock = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'];

        /**
         * 对单个窗口解除限制
         */
        function unlockWindow(win) {
            try {
                const doc = win.document;
                const body = doc.body;
                const docElem = doc.documentElement;

                // 1. 清除内联事件属性
                const targets = [doc, docElem, body].filter(Boolean);
                targets.forEach(target => {
                    eventsToUnblock.forEach(eventType => {
                        const attrName = 'on' + eventType;
                        try {
                            if (target.removeAttribute) {
                                target.removeAttribute(attrName);
                            }
                        } catch (e) { }
                        try {
                            target[attrName] = null;
                        } catch (e) { }
                    });
                });

                // 2. 在捕获阶段拦截事件（保留默认行为，但阻止页面处理）
                eventsToUnblock.forEach(eventType => {
                    win.addEventListener(eventType, (e) => {
                        e.stopImmediatePropagation();
                    }, true);
                });

                // 3. 注入 CSS 强制允许文本选择
                if (!doc.getElementById('iflytek-toolkit-unlock-style')) {
                    const style = doc.createElement('style');
                    style.id = 'iflytek-toolkit-unlock-style';
                    style.textContent = `
                        * {
                            user-select: text !important;
                            -webkit-user-select: text !important;
                            -moz-user-select: text !important;
                            -ms-user-select: text !important;
                        }
                    `;
                    (doc.head || doc.documentElement).appendChild(style);
                }

                console.log(`[iFlytek Toolkit] ✅ 已解除复制限制: ${win.location.hostname}`);
            } catch (e) {
                // 跨域 iframe 跳过
                console.log('[iFlytek Toolkit] 跨域 iframe 跳过:', e.message);
            }
        }

        /**
         * 递归处理所有 iframe
         */
        function unlockAllFrames(win) {
            unlockWindow(win);

            try {
                for (let i = 0; i < win.frames.length; i++) {
                    try {
                        unlockAllFrames(win.frames[i]);
                    } catch (e) { }
                }
            } catch (e) { }
        }

        // 立即执行
        unlockAllFrames(window);

        // 监听动态加载的 iframe
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'IFRAME') {
                        node.addEventListener('load', () => {
                            try {
                                unlockAllFrames(node.contentWindow);
                            } catch (e) { }
                        });
                    }
                });
            });
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    /******************************************************************
     *
     * PART 2: 自动登录模块
     *
     ******************************************************************/

    const CHECK_INTERVAL = 1000;

    function autoLogin() {
        try {
            // --- 场景 1: Coremail 风格登录窗口 ---
            const form1 = document.querySelector('form.j-login-form');
            if (form1) {
                const uidInput = form1.querySelector('input[name="uid"]');
                const pwdInput = form1.querySelector('input[name="password"]');
                const loginBtn = form1.querySelector('.j-submit');

                if (uidInput && uidInput.value && pwdInput && pwdInput.value && loginBtn) {
                    console.log('[iFlytek Toolkit] 检测到场景1 (Coremail): 账号密码已填充，执行登录');
                    loginBtn.click();
                    return;
                }
            }

            // --- 场景 2: 中间页 "使用集团账号登录" ---
            const buttons = document.querySelectorAll('button.el-button');
            for (let btn of buttons) {
                if (btn.textContent.includes('使用集团账号登录')) {
                    console.log('[iFlytek Toolkit] 检测到场景2 (中间页): 点击[使用集团账号登录]');
                    btn.click();
                    return;
                }
            }

            // --- 场景 3: 集团统一认证登录窗口 ---
            const loginBox3 = document.querySelector('#userInput');
            if (loginBox3 && (loginBox3.style.display !== 'none' && getComputedStyle(loginBox3).display !== 'none')) {
                const userInput = document.getElementById('username');
                const pwdInput = document.getElementById('password');
                const submitBtn = document.querySelector('input.user-btn[type="submit"]');
                const vercodeInput = document.querySelector('li.vercode');

                const isVercodeVisible = vercodeInput && getComputedStyle(vercodeInput).display !== 'none';

                if (userInput && userInput.value && pwdInput && pwdInput.value && submitBtn) {
                    if (!isVercodeVisible) {
                        console.log('[iFlytek Toolkit] 检测到场景3 (集团认证): 账号密码已填充且无验证码，执行登录');
                        submitBtn.click();
                    }
                    return;
                }
            }

        } catch (e) {
            console.error('[iFlytek Toolkit] 自动登录错误:', e);
        }
    }

    /******************************************************************
     *
     * 脚本入口
     *
     ******************************************************************/

    // 立即启动解除复制限制
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enableCopyFeature);
    } else {
        enableCopyFeature();
    }

    // 启动自动登录定时检测
    setInterval(autoLogin, CHECK_INTERVAL);

})();
