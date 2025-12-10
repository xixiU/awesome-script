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

    // 防止重复提交的锁
    let isSubmitting = false;

    // 辅助函数：尝试激活浏览器的自动填充值
    function tryActivateAutofill(input) {
        if (input && !input.value) {
            try {
                input.focus();
                input.click();
            } catch (e) { }
        }
    }

    // 辅助函数：判断输入框是否已填充
    function isFilled(input) {
        if (!input) return false;
        if (input.value && input.value.length > 0) return true;
        // 即使检测到伪类，如果 value 是空，也不能算 filled，因为提交会失败
        // 我们需要等待浏览器真的把值填进去
        return false;
    }

    // 记录每种场景是否已经尝试过自动点击，避免死循环
    const attempts = {
        scene1: false,
        scene3: false
    };

    function autoLogin() {
        if (isSubmitting) return;

        try {
            // --- 场景 1: Coremail 风格登录窗口 ---
            const form1 = document.querySelector('form.j-login-form');
            if (form1) {
                const uidInput = form1.querySelector('input[name="uid"]');
                const pwdInput = form1.querySelector('input[name="password"]');
                const loginBtn = form1.querySelector('.j-submit');

                // 尝试唤醒: 反复 Focus 可能有助于触发浏览器填充
                if (uidInput && !uidInput.value) tryActivateAutofill(uidInput);
                if (pwdInput && !pwdInput.value) tryActivateAutofill(pwdInput);

                // 只有当 JS 真正读到值时才点击，避免提交空值导致报错
                if (loginBtn && !attempts.scene1) {
                    // 只要用户名有值，通常密码也已经就绪（浏览器机制）
                    if (uidInput && uidInput.value) {
                        console.log('检测到场景1 (Coremail): 账号数据已就绪，执行登录');
                        isSubmitting = true;
                        attempts.scene1 = true;

                        setTimeout(() => {
                            loginBtn.click();
                            setTimeout(() => { isSubmitting = false; }, 3000);
                        }, 300);
                        return;
                    }
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

                // 尝试唤醒
                if (userInput && !userInput.value) tryActivateAutofill(userInput);
                if (pwdInput && !pwdInput.value) tryActivateAutofill(pwdInput);

                const isVercodeVisible = vercodeInput && getComputedStyle(vercodeInput).display !== 'none';

                if (submitBtn && !attempts.scene3) {
                    // 同样，只有当 JS 读到用户名有值时才点击
                    if (userInput && userInput.value && !isVercodeVisible) {
                        console.log('检测到场景3 (集团认证): 账号数据已就绪，执行登录');
                        isSubmitting = true;
                        attempts.scene3 = true;

                        setTimeout(() => {
                            submitBtn.click();
                            setTimeout(() => { isSubmitting = false; }, 3000);
                        }, 300);
                        return;
                    }
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

