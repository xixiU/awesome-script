// ==UserScript==
// @name         ifly-21tb 增强脚本 (视频控制+自动答题)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  视频页：左右键快进/回退，数字键调速。考试页：自动请求Dify API并填写答案，支持暂停/继续。
// @author       yuan
// @match        *://*.21tb.com/*
// @connect      localhost
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/control21tbVideoSpeed.js
// @updateURL    https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/control21tbVideoSpeed.js
// ==/UserScript==

(function () {
    'use strict';

    /******************************************************************
     *
     * PART 0: 配置管理模块
     *
     ******************************************************************/

    // 默认配置
    const DEFAULT_CONFIG = {
        role: "科大讯飞公司的规章制度专家",
        ability: "保密",
        apiUrl: "http://localhost:5005/proxy/dify"
    };

    // 获取配置值，如果用户未设置则使用默认值
    function getConfig(key) {
        return GM_getValue(key, DEFAULT_CONFIG[key]);
    }

    // 设置配置值
    function setConfig(key, value) {
        GM_setValue(key, value);
    }

    // 注册设置菜单
    GM_registerMenuCommand("⚙️ 21tb脚本设置", function () {
        const role = prompt("请输入角色设定 (role):", getConfig('role'));
        if (role !== null) {
            setConfig('role', role);
        }

        const ability = prompt("请输入能力设定 (ability):", getConfig('ability'));
        if (ability !== null) {
            setConfig('ability', ability);
        }

        const apiUrl = prompt("请输入API地址:", getConfig('apiUrl'));
        if (apiUrl !== null) {
            setConfig('apiUrl', apiUrl);
        }

        alert("设置已保存！");
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
            const API_URL = getConfig('apiUrl');

            // --- UI界面 ---
            GM_addStyle(`
                #auto-exam-panel { position: fixed; bottom: 20px; left: 20px; background-color: #f7f7f7; border: 1px solid #ccc; padding: 15px; z-index: 99999; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); font-family: Arial, sans-serif; width: 280px; }
                #auto-exam-panel h3 { margin-top: 0; margin-bottom: 10px; color: #333; font-size: 16px; text-align: center; }
                .exam-btn-group { display: flex; gap: 10px; }
                .exam-btn { flex-grow: 1; padding: 10px; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background-color 0.3s; }
                #start-exam-btn { background-color: #4CAF50; }
                #start-exam-btn:hover { background-color: #45a049; }
                #start-exam-btn:disabled { background-color: #aaa; cursor: not-allowed; }
                #pause-exam-btn { background-color: #f44336; display: none; }
                #pause-exam-btn:hover { background-color: #da190b; }
                #exam-status { margin-top: 10px; padding: 8px; background-color: #e9e9e9; border-radius: 4px; font-size: 13px; color: #555; text-align: center; min-height: 20px; }
                #config-info { margin-top: 8px; padding: 6px; background-color: #e3f2fd; border-radius: 4px; font-size: 11px; color: #1976d2; text-align: center; }
            `);

            const panel = document.createElement('div');
            panel.id = 'auto-exam-panel';
            panel.innerHTML = `
                <h3>自动答题控制台</h3>
                <div class="exam-btn-group">
                    <button id="start-exam-btn" class="exam-btn">开始自动答题</button>
                    <button id="pause-exam-btn" class="exam-btn">暂停</button>
                </div>
                <div id="exam-status">准备就绪</div>
                <div id="config-info">角色: ${getConfig('role')} | 能力: ${getConfig('ability')}</div>
            `;
            document.body.appendChild(panel);

            const startBtn = document.getElementById('start-exam-btn');
            const pauseBtn = document.getElementById('pause-exam-btn');
            const statusDiv = document.getElementById('exam-status');

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

            function updateStatus(text) {
                console.log(text);
                statusDiv.textContent = text;
            }

            function delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            function fetchAnswer(questionData) {
                return new Promise((resolve, reject) => {
                    const payload = {
                        "inputs": {
                            "role": getConfig('role'),
                            "ability": getConfig('ability')
                        },
                        "query": JSON.stringify(questionData),
                        "response_mode": "blocking",
                        "conversation_id": "",
                        "user": "abc-123"
                    };

                    GM_xmlhttpRequest({
                        method: "POST",
                        url: API_URL,
                        headers: {
                            "Content-Type": "application/json"
                        },
                        data: JSON.stringify(payload),
                        onload: (response) => {
                            if (response.status >= 200 && response.status < 300) {
                                try {
                                    const data = JSON.parse(response.responseText);

                                    // 提取原始 answer 字符串
                                    let answerStr = data.answer || "";

                                    // 去除 Markdown 包裹 ```json ... ```
                                    answerStr = answerStr.replace(/^```json/, "")
                                        .replace(/^```/, "")
                                        .replace(/```$/, "")
                                        .trim();

                                    // 解析 JSON 格式答案
                                    const parsed = JSON.parse(answerStr);

                                    // 返回标准结构：{ type: "...", ans: [...] }
                                    resolve(parsed);
                                } catch (e) {
                                    reject("解析失败: " + e.message + "，原始返回: " + response.responseText);
                                }
                            } else {
                                reject("代理返回失败状态码: " + response.status);
                            }
                        },
                        onerror: (err) => reject("代理请求失败: " + (err?.statusText || '未知错误'))
                    });
                });
            }


            async function startAnsweringProcess() {
                if (isRunning) return;
                isRunning = true; isPaused = false;
                startBtn.disabled = true; startBtn.textContent = '答题中...';
                pauseBtn.style.display = 'block'; pauseBtn.textContent = '暂停'; pauseBtn.style.backgroundColor = '#f44336';
                const questionElements = document.querySelectorAll('.question-panel-middle');
                const total = questionElements.length;
                updateStatus(`发现 ${total} 道题目，开始处理...`);
                await delay(1000);
                let count = 0;
                for (const el of questionElements) {
                    count++;
                    while (isPaused) { await delay(500); }
                    updateStatus(`正在处理第 ${count} / ${total} 题...`);
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await delay(1000);
                    try {
                        const questionData = extractQuestionData(el);
                        if (!questionData) { updateStatus(`第 ${count} 题: 无法识别题型，已跳过`); await delay(1000); continue; }
                        updateStatus(`第 ${count} 题: 已提取，请求答案...`);
                        updateStatus(JSON.stringify(questionData));
                        // console.log(`${JSON.stringify(questionData)}`)
                        const answerData = await fetchAnswer(questionData);
                        updateStatus(`第 ${count} 题: 收到答案 "${answerData.ans}"`);
                        selectAnswer(el, questionData.typeClass, answerData);
                        await delay(1500);
                    } catch (error) { updateStatus(`第 ${count} 题出错: ${error}`); await delay(2000); }
                }
                updateStatus('所有题目处理完毕！');
                startBtn.disabled = false; startBtn.textContent = '开始自动答题';
                pauseBtn.style.display = 'none'; isRunning = false;
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
            const video = document.querySelector('div#J_prismPlayer video');
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