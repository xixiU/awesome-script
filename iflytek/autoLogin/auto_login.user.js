// ==UserScript==
// @name         iFlytek Unified Login Assistant统一认证登录助手
// @namespace    http://tampermonkey.net/
// @version      0.1.1
// @description  自动处理 iFlytek 各种登录场景：自动点击登录、跳转集团账号
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
    const CHECK_INTERVAL = 800;

    // 辅助函数：尝试激活浏览器的自动填充值
    // 很多现代浏览器在用户产生交互前，不会将密码填入 value 属性
    function tryActivateAutofill(input) {
        if (input && !input.value) {
            try {
                // 仅当检测到浏览器标记为 autofill 时尝试，或在特定的安全策略下尝试 focus
                // 注意: matches(':-webkit-autofill') 在某些浏览器可能不准确或需要特定时机
                input.focus();
                // 某些情况下模拟点击也有帮助
                // input.click();
            } catch (e) { }
        }
    }

    function autoLogin() {
        try {
            // --- 场景 1: Coremail 风格登录窗口 ---
            // 特征: form action包含 coremail, 包含 uid 和 password 输入框
            const form1 = document.querySelector('form.j-login-form');
            if (form1) {
                const uidInput = form1.querySelector('input[name="uid"]');
                const pwdInput = form1.querySelector('input[name="password"]');
                const loginBtn = form1.querySelector('.j-submit');

                // 尝试“唤醒”自动填充
                // 如果值为空，尝试 focus 一下，诱导浏览器写入 value
                if (uidInput && !uidInput.value) tryActivateAutofill(uidInput);
                if (pwdInput && !pwdInput.value) tryActivateAutofill(pwdInput);

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

                // 尝试“唤醒”自动填充
                if (userInput && !userInput.value) tryActivateAutofill(userInput);
                if (pwdInput && !pwdInput.value) tryActivateAutofill(pwdInput);

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

    // 监听用户交互事件，一旦用户点击页面或移动鼠标，立即触发检查
    // 这解决了部分浏览器必须在用户交互后才填充 value 的问题
    ['click', 'mousemove', 'keydown', 'touchstart'].forEach(eventType => {
        window.addEventListener(eventType, () => {
            // 使用 requestAnimationFrame 避免高频事件卡顿，或者简单的节流
            // 这里简单处理，直接调用，因为 autoLogin 逻辑开销很小
            setTimeout(autoLogin, 50);
        }, { once: false, passive: true });
    });

})();

