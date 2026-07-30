// ==UserScript==
// @name         iFlytek Unified Login Assistant & Copy Enabler
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  自动处理 iFlytek 各种登录场景：自动点击登录、跳转集团账号、解除复制限制
// @author       You
// @match        *://*.iflytek.*/*
// @match        *://*.iflytek.com/*
// @match        *://*.iflytek.cn/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=iflytek.com
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/autoLogin/auto_login.user.js
// @updateURL    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/autoLogin/auto_login.user.js
// ==/UserScript==

(function () {
    'use strict';

    console.log('iFlytek Auto Login: 脚本已加载');

    // 定义检测间隔 (毫秒)
    const CHECK_INTERVAL = 1000;

    // ==================== 功能 1: 解除复制限制 ====================
    function enableCopy() {
        try {
            // 恢复页面的文本选择功能
            document.body.style.userSelect = 'text';
            document.documentElement.style.userSelect = 'text';
            document.body.style.webkitUserSelect = 'text';
            document.documentElement.style.webkitUserSelect = 'text';

            // 注入全局 CSS 强制覆盖所有禁用选择的样式
            if (!document.getElementById('iflytek-enable-copy-style')) {
                const style = document.createElement('style');
                style.id = 'iflytek-enable-copy-style';
                style.textContent = `
                    * {
                        user-select: text !important;
                        -webkit-user-select: text !important;
                        -moz-user-select: text !important;
                        -ms-user-select: text !important;
                    }
                `;
                document.head.appendChild(style);
                console.log('✅ 已解除复制限制');
            }

            // 移除可能阻止复制的事件监听器
            const events = ['copy', 'cut', 'selectstart', 'contextmenu'];
            events.forEach(eventType => {
                // 清除直接绑定的事件处理器
                document[`on${eventType}`] = null;
                if (document.body) {
                    document.body[`on${eventType}`] = null;
                }

                // 在捕获阶段拦截并停止传播,防止页面脚本阻止复制
                document.addEventListener(eventType, (e) => {
                    e.stopPropagation();
                }, true);
            });
        } catch (e) {
            console.error('解除复制限制失败:', e);
        }
    }

    // 立即执行一次解除复制限制
    enableCopy();

    // 监听 DOM 变化,应对动态加载的内容
    const observer = new MutationObserver(() => {
        enableCopy();
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // ==================== 功能 2: 自动登录 ====================

    function autoLogin() {
        try {
            // --- 场景 1: Coremail 风格登录窗口 ---
            // 特征: form action包含 coremail, 包含 uid 和 password 输入框
            const form1 = document.querySelector('form.j-login-form');
            if (form1) {
                const uidInput = form1.querySelector('input[name="uid"]');
                const pwdInput = form1.querySelector('input[name="password"]');
                const loginBtn = form1.querySelector('.j-submit');

                // 检查元素是否存在且输入框有值 (浏览器自动填充)
                if (uidInput && uidInput.value && pwdInput && pwdInput.value && loginBtn) {
                    console.log('检测到场景1 (Coremail): 账号密码已填充，执行登录');
                    loginBtn.click();
                    return; // 防止单次循环执行多个操作
                }
            }

            // --- 场景 2: 中间页 "使用集团账号登录" ---
            // 特征: ElementUI 按钮，文本包含特定内容
            const buttons = document.querySelectorAll('button.el-button');
            for (let btn of buttons) {
                if (btn.textContent.includes('使用集团账号登录')) {
                    console.log('检测到场景2 (中间页): 点击[使用集团账号登录]');
                    btn.click();
                    return;
                }
            }

            // --- 场景 3: 集团统一认证登录窗口 ---
            // 特征: id="userInput", 输入框 id="username", id="password"
            const loginBox3 = document.querySelector('#userInput');
            // 确保登录框是显示状态 (display: block)
            if (loginBox3 && (loginBox3.style.display !== 'none' && getComputedStyle(loginBox3).display !== 'none')) {
                const userInput = document.getElementById('username');
                const pwdInput = document.getElementById('password');
                const submitBtn = document.querySelector('input.user-btn[type="submit"]');
                const vercodeInput = document.querySelector('li.vercode');

                // 检查是否需要验证码 (如果验证码区域显示，则不自动点击，以免打断用户输入)
                const isVercodeVisible = vercodeInput && getComputedStyle(vercodeInput).display !== 'none';

                if (userInput && userInput.value && pwdInput && pwdInput.value && submitBtn) {
                    if (!isVercodeVisible) {
                        console.log('检测到场景3 (集团认证): 账号密码已填充且无验证码，执行登录');
                        submitBtn.click();
                    } else {
                        // 如果有验证码，可以打印日志，但不自动点击
                        // console.log('检测到场景3: 需要验证码，等待用户操作');
                    }
                    return;
                }
            }

        } catch (e) {
            console.error('iFlytek Auto Login Error:', e);
        }
    }

    // 启动定时轮询，处理 DOM 延迟加载和浏览器自动填充的延迟
    setInterval(autoLogin, CHECK_INTERVAL);

})();

