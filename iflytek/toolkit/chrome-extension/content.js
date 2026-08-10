/**
 * ============================================================
 * iFlytek Toolkit Chrome扩展版
 *
 * 功能概述：
 * 1. 自动登录 (讯飞域名专属)
 *    - 场景1: Coremail 邮件系统自动登录
 *    - 场景2: 中间页自动点击"使用集团账号登录"
 *    - 场景3: 集团统一认证自动登录(无验证码时)
 *
 * 2. 视频控制增强 (21tb 专属)
 *    - 键盘快捷键控制：左右箭头快进/回退，数字键调速
 *    - 滑块速度控制（1-5倍速，默认2倍）
 *
 * 3. 考试自动答题 (21tb 专属)
 *    - 直接调用 Dify API 进行智能答题
 *    - 无需本地代理服务，所有配置存储在浏览器中
 *    - 支持暂停/继续控制
 *    - 配置通过扩展弹窗管理
 *    - 失败题目重试功能
 *
 * 4. 解除网页限制 (全站通用)
 *    - 解除网页禁止复制限制（包括多层 iframe）
 *    - 解除网页禁止粘贴限制
 *    - 解除右键菜单禁用
 *    - 解除文本选择限制
 *    - 实时拦截页面动态绑定的限制监听器
 *
 * 5. 禁用切屏检测 (21tb 开发测试, v3.1 新增)
 *    - 拦截 visibilitychange 和 blur 事件监听器
 *    - 阻止切屏事件上报到服务器
 *    - 伪造页面始终可见状态
 *    - 递归处理所有 iframe（包括考试页面）
 *    - 默认启用，方便开发测试
 * ============================================================
 */

(function () {
    'use strict';

    // 域名判断：隔离 21tb 专属功能和讯飞专属功能
    const IS_21TB = location.hostname.includes('21tb.com');
    const IS_IFLYTEK = location.hostname.includes('iflytek.');

    console.log('[iFlytek Toolkit Extension] 脚本已加载, 域名类型:',
                IS_21TB ? '21tb' : (IS_IFLYTEK ? 'iflytek' : 'other'));

    /******************************************************************
     * PART 0: 禁用切屏检测模块（开发模式，21tb 专属）
     ******************************************************************/

    /**
     * 禁用切屏检测的核心函数
     */
    function disableScreenMonitor(win, doc) {
        if (!win || !doc) return;

        console.log('[切屏检测] 开始禁用切屏检测:', win.location.href);

        // 1. 拦截 addEventListener，阻止绑定 visibilitychange 和 blur 事件
        const originalAddEventListener = win.EventTarget.prototype.addEventListener;
        win.EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (type === 'visibilitychange' || type === 'blur') {
                console.log('[切屏检测] 拦截事件监听器:', type);
                return;
            }
            return originalAddEventListener.call(this, type, listener, options);
        };

        // 2. 伪造 document.hidden 和 document.visibilityState
        try {
            Object.defineProperty(doc, 'hidden', {
                get: function() { return false; },
                configurable: true
            });

            Object.defineProperty(doc, 'visibilityState', {
                get: function() { return 'visible'; },
                configurable: true
            });

            console.log('[切屏检测] 已伪造 document.hidden 和 visibilityState');
        } catch (e) {
            console.warn('[切屏检测] 伪造属性失败:', e);
        }

        // 3. 拦截 fetch，阻止切屏事件上报
        const originalFetch = win.fetch;
        win.fetch = function(...args) {
            const url = args[0];
            if (typeof url === 'string' && url.includes('saveEventLog')) {
                console.log('[切屏检测] 拦截 saveEventLog 请求:', url);
                return Promise.resolve(new Response(JSON.stringify({
                    code: 1001,
                    msg: '操作处理成功（已被拦截）'
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            return originalFetch.apply(this, args);
        };

        // 4. 拦截 XMLHttpRequest
        const originalOpen = win.XMLHttpRequest.prototype.open;
        const originalSend = win.XMLHttpRequest.prototype.send;

        win.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._url = url;
            return originalOpen.call(this, method, url, ...rest);
        };

        win.XMLHttpRequest.prototype.send = function(data) {
            if (this._url && this._url.includes('saveEventLog')) {
                console.log('[切屏检测] 拦截 XMLHttpRequest saveEventLog 请求:', this._url);
                Object.defineProperty(this, 'readyState', { get: () => 4 });
                Object.defineProperty(this, 'status', { get: () => 200 });
                Object.defineProperty(this, 'responseText', {
                    get: () => JSON.stringify({ code: 1001, msg: '操作处理成功（已被拦截）' })
                });

                setTimeout(() => {
                    if (this.onreadystatechange) this.onreadystatechange();
                    if (this.onload) this.onload();
                }, 0);

                return;
            }
            return originalSend.call(this, data);
        };

        console.log('[切屏检测] 切屏检测已完全禁用');
    }

    /**
     * 递归禁用所有 iframe 的切屏检测
     */
    function disableScreenMonitorRecursive(win) {
        try {
            const doc = win.document;
            disableScreenMonitor(win, doc);

            // 递归处理所有 iframe
            const iframes = doc.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    if (iframe.contentWindow && iframe.contentDocument) {
                        console.log('[切屏检测] 处理 iframe:', iframe.src);
                        disableScreenMonitorRecursive(iframe.contentWindow);
                    }
                } catch (e) {
                    console.warn('[切屏检测] 无法访问 iframe（跨域）:', iframe.src, e);
                }
            });

            // 监听新增的 iframe
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.tagName === 'IFRAME') {
                            setTimeout(() => {
                                try {
                                    if (node.contentWindow && node.contentDocument) {
                                        console.log('[切屏检测] 处理新增 iframe:', node.src);
                                        disableScreenMonitorRecursive(node.contentWindow);
                                    }
                                } catch (e) {
                                    console.warn('[切屏检测] 无法访问新增 iframe:', e);
                                }
                            }, 100);
                        }
                    });
                });
            });

            observer.observe(doc.body, { childList: true, subtree: true });
        } catch (e) {
            console.error('[切屏检测] 禁用失败:', e);
        }
    }

    // 初始化禁用切屏检测功能（默认启用，21tb 专属）
    if (IS_21TB) {
        console.log('[切屏检测] 开发模式已启用，正在禁用切屏检测...');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                disableScreenMonitorRecursive(window);
            });
        } else {
            disableScreenMonitorRecursive(window);
        }

        // 监听动态加载的内容
        setInterval(() => {
            disableScreenMonitorRecursive(window);
        }, 2000);
    }

    /******************************************************************
     * 配置管理模块 (21tb 专属)
     ******************************************************************/

    // 默认配置
    const DEFAULT_CONFIG = {
        role: "科大讯飞公司的规章制度专家",
        ability: "保密",
        difyApiUrl: "https://api.dify.ai/v1/workflows/run",
        difyApiKey: "",
        defaultSpeed: 2.0  // 默认2倍速
    };

    // 获取配置值
    async function getConfig(key) {
        return new Promise((resolve) => {
            chrome.storage.sync.get([key], (result) => {
                resolve(result[key] !== undefined ? result[key] : DEFAULT_CONFIG[key]);
            });
        });
    }

    // 设置配置值
    async function setConfig(key, value) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [key]: value }, resolve);
        });
    }

    /******************************************************************
     * PART 1: 考试自动答题模块
     ******************************************************************/

    function initializeExamModule() {
        if (document.querySelector('.exam-main') && document.querySelector('.paper-content')) {
            console.log('[脚本] 检测到考试页面，加载自动答题模块。');

            let isPaused = false;
            let isRunning = false;
            let failedQuestions = [];

            // 创建控制面板
            const panel = document.createElement('div');
            panel.id = 'auto-exam-panel';
            panel.innerHTML = `
                <h3>自动答题控制台</h3>
                <div class="exam-btn-group">
                    <button id="start-exam-btn" class="exam-btn">开始自动答题</button>
                    <button id="pause-exam-btn" class="exam-btn">暂停</button>
                    <button id="retry-exam-btn" class="exam-btn">重试失败题目</button>
                </div>
                <div id="exam-status">准备就绪</div>
                <div id="config-info">加载配置中...</div>
                <div id="failed-questions-info"></div>
            `;
            document.body.appendChild(panel);

            // 加载配置并更新显示
            Promise.all([getConfig('role'), getConfig('ability'), getConfig('difyApiKey')])
                .then(([role, ability, apiKey]) => {
                    const configStatus = apiKey && apiKey.length > 0 ? `✅ API已配置` : `⚠️ 请先配置API Key`;
                    document.getElementById('config-info').innerHTML = `
                        角色: ${role} | 能力: ${ability}<br/>
                        ${configStatus}
                    `;
                });

            const startBtn = document.getElementById('start-exam-btn');
            const pauseBtn = document.getElementById('pause-exam-btn');
            const retryBtn = document.getElementById('retry-exam-btn');
            const statusDiv = document.getElementById('exam-status');
            const failedInfoDiv = document.getElementById('failed-questions-info');

            startBtn.addEventListener('click', startAnsweringProcess);
            pauseBtn.addEventListener('click', () => {
                isPaused = !isPaused;
                if (isPaused) {
                    pauseBtn.textContent = '继续';
                    pauseBtn.style.backgroundColor = '#ff9800';
                    updateStatus('已暂停，点击"继续"以恢复');
                } else {
                    pauseBtn.textContent = '暂停';
                    pauseBtn.style.backgroundColor = '#f44336';
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
             * 调用 Dify API 获取答案
             */
            async function fetchAnswer(questionData) {
                const apiUrl = await getConfig('difyApiUrl');
                const apiKey = await getConfig('difyApiKey');
                const role = await getConfig('role');
                const ability = await getConfig('ability');

                if (!apiKey) {
                    throw new Error("请先配置 Dify API Key！点击扩展图标进行配置。");
                }

                const payload = {
                    "inputs": {
                        "role": role,
                        "ability": ability
                    },
                    "query": JSON.stringify(questionData),
                    "response_mode": "blocking",
                    "conversation_id": "",
                    "user": "21tb-helper-user"
                };

                try {
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`API返回错误: ${response.status} ${response.statusText}`);
                    }

                    const data = await response.json();
                    let answerStr = data.data?.outputs?.text
                        || data.data?.outputs?.result
                        || data.data?.outputs?.answer
                        || data.answer
                        || "";

                    if (!answerStr) {
                        throw new Error("API 返回数据中未找到答案字段");
                    }

                    // 去除可能的 Markdown 代码块包裹
                    answerStr = answerStr.replace(/^```json\s*/, "")
                        .replace(/^```\s*/, "")
                        .replace(/```\s*$/, "")
                        .trim();

                    return JSON.parse(answerStr);
                } catch (error) {
                    throw new Error(`请求失败: ${error.message}`);
                }
            }

            async function startAnsweringProcess() {
                if (isRunning) return;
                isRunning = true;
                isPaused = false;
                failedQuestions = [];
                startBtn.disabled = true;
                startBtn.textContent = '答题中...';
                pauseBtn.style.display = 'block';
                pauseBtn.textContent = '暂停';
                pauseBtn.style.backgroundColor = '#f44336';
                retryBtn.style.display = 'none';
                failedInfoDiv.style.display = 'none';

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
                        const answerData = await fetchAnswer(questionData);
                        updateStatus(`第 ${count} 题: 收到答案 "${answerData.ans}"`);
                        selectAnswer(el, questionData.typeClass, answerData);
                        successCount++;
                        await delay(1500);
                    } catch (error) {
                        updateStatus(`第 ${count} 题出错: ${error.message}`);
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
                    retryBtn.style.display = 'block';
                    failedInfoDiv.style.display = 'block';
                    failedInfoDiv.innerHTML = `⚠️ 有 ${failedQuestions.length} 道题目未成功回答，请点击"重试失败题目"按钮重试`;
                }

                startBtn.disabled = false;
                startBtn.textContent = '开始自动答题';
                pauseBtn.style.display = 'none';
                isRunning = false;
            }

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

                const stillFailed = [];
                let retrySuccessCount = 0;

                for (let i = 0; i < failedQuestions.length; i++) {
                    const failed = failedQuestions[i];
                    while (isPaused) { await delay(500); }

                    updateStatus(`重试第 ${i + 1} / ${totalFailed} 题 (原第 ${failed.index} 题)...`);
                    failed.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await delay(1000);

                    try {
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
                        updateStatus(`第 ${failed.index} 题重试失败: ${error.message}`);
                        stillFailed.push({
                            ...failed,
                            error: `重试失败: ${error.toString()}`
                        });
                        await delay(2000);
                    }
                }

                failedQuestions = stillFailed;

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
                } else {
                    options = ['正确', '错误'];
                }

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
                    const ans = answers[0].toLowerCase();
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
     * PART 2: 视频播放控制模块（滑块控制1-5倍速）
     ******************************************************************/

    function initializeVideoModule() {
        const interval = setInterval(() => {
            const video = document.querySelector('video');
            if (video) {
                clearInterval(interval);
                console.log('[脚本] 检测到视频播放器，加载视频控制模块。');
                setupVideoControl(video);
            }
        }, 1000);

        async function setupVideoControl(video) {
            // 获取默认速度
            const defaultSpeed = await getConfig('defaultSpeed');
            video.playbackRate = defaultSpeed;

            // 键盘快捷键
            document.addEventListener('keydown', (e) => {
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

                switch (e.key) {
                    case 'ArrowLeft':
                        video.currentTime = Math.max(0, video.currentTime - 10);
                        break;
                    case 'ArrowRight':
                        video.currentTime = Math.min(video.duration, video.currentTime + 10);
                        break;
                    case '1':
                        video.playbackRate = 1.0;
                        updateSpeedSlider(1.0);
                        break;
                    case '2':
                        video.playbackRate = 1.5;
                        updateSpeedSlider(1.5);
                        break;
                    case '3':
                        video.playbackRate = 2.0;
                        updateSpeedSlider(2.0);
                        break;
                    case '4':
                        video.playbackRate = 3.0;
                        updateSpeedSlider(3.0);
                        break;
                    case '5':
                        video.playbackRate = 5.0;
                        updateSpeedSlider(5.0);
                        break;
                }
            });

            // 创建速度控制滑块
            if (!document.querySelector('#custom-speed-control')) {
                const speedBox = document.createElement('div');
                speedBox.id = 'custom-speed-control';
                speedBox.innerHTML = `
                    <div class="speed-label">播放速度：<span id="speed-value">${defaultSpeed.toFixed(1)}x</span></div>
                    <input type="range" id="speed-slider" min="1" max="5" step="0.1" value="${defaultSpeed}">
                    <div class="speed-marks">
                        <span>1x</span>
                        <span>2x</span>
                        <span>3x</span>
                        <span>4x</span>
                        <span>5x</span>
                    </div>
                `;
                document.body.appendChild(speedBox);

                const slider = document.getElementById('speed-slider');
                const speedValue = document.getElementById('speed-value');

                // 滑块变化事件
                slider.addEventListener('input', (e) => {
                    const speed = parseFloat(e.target.value);
                    video.playbackRate = speed;
                    speedValue.textContent = `${speed.toFixed(1)}x`;
                });

                // 保存用户选择的速度
                slider.addEventListener('change', (e) => {
                    const speed = parseFloat(e.target.value);
                    setConfig('defaultSpeed', speed);
                });
            }

            function updateSpeedSlider(rate) {
                const slider = document.getElementById('speed-slider');
                const speedValue = document.getElementById('speed-value');
                if (slider && speedValue) {
                    slider.value = rate;
                    speedValue.textContent = `${rate.toFixed(1)}x`;
                }
            }
        }
    }

    /******************************************************************
     * PART 3: 解除网页复制限制模块
     ******************************************************************/

    /**
     * 解除网页复制/粘贴/右键/选择限制
     *
     * 工作原理：
     * 1. 清除内联事件属性（oncopy/onpaste/oncontextmenu/onselectstart 等）
     * 2. 在 window 捕获阶段拦截事件监听器
     * 3. CSS 已通过 styles.css 注入（user-select: auto !important）
     * 4. 递归处理所有 iframe
     */
    function removeWebRestrictions() {
        console.log('[脚本] 解除网页复制限制模块已加载');

        const eventsToUnblock = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'];

        function unlockWindow(win) {
            try {
                const doc = win.document;
                const body = doc.body;
                const docElem = doc.documentElement;

                // 清除内联事件属性
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

                // 捕获阶段拦截事件
                eventsToUnblock.forEach(eventType => {
                    win.addEventListener(eventType, (e) => {
                        e.stopImmediatePropagation();
                    }, true);
                });

                console.log(`[脚本] 已解除限制: ${win.location.href}`);
            } catch (e) {
                console.log('[脚本] 跨域 iframe 跳过:', e.message);
            }
        }

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

        // 监听新加载的 iframe
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
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    /******************************************************************
     * 自动登录模块 (讯飞域名专属)
     ******************************************************************/

    const LOGIN_CHECK_INTERVAL = 1000;

    function autoLogin() {
        try {
            // --- 场景 1: Coremail 风格登录窗口 ---
            const form1 = document.querySelector('form.j-login-form');
            if (form1) {
                const uidInput = form1.querySelector('input[name="uid"]');
                const pwdInput = form1.querySelector('input[name="password"]');
                const loginBtn = form1.querySelector('.j-submit');

                if (uidInput && uidInput.value && pwdInput && pwdInput.value && loginBtn) {
                    console.log('[iFlytek Toolkit] 场景1 (Coremail): 账号密码已填充，执行登录');
                    loginBtn.click();
                    return;
                }
            }

            // --- 场景 2: 中间页 "使用集团账号登录" ---
            const buttons = document.querySelectorAll('button.el-button');
            for (let btn of buttons) {
                if (btn.textContent.includes('使用集团账号登录')) {
                    console.log('[iFlytek Toolkit] 场景2 (中间页): 点击[使用集团账号登录]');
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
                        console.log('[iFlytek Toolkit] 场景3 (集团认证): 账号密码已填充且无验证码，执行登录');
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
     * 脚本入口
     ******************************************************************/

    window.addEventListener('load', () => {
        // 全站通用：解除复制限制
        removeWebRestrictions();

        // 21tb 专属：考试答题 + 视频控制
        if (IS_21TB) {
            initializeExamModule();
            initializeVideoModule();
        }

        // 讯飞域名专属：自动登录
        if (IS_IFLYTEK) {
            setInterval(autoLogin, LOGIN_CHECK_INTERVAL);
        }
    });

})();

