// 辅助函数：将PEM转换为Buffer (必须与content.js中的逻辑一致)
function pemToArrayBuffer(pem) {
    const b64 = pem.replace(/(-----(BEGIN|END) PUBLIC KEY-----|\n)/g, '');
    const binary = atob(b64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
        view[i] = binary.charCodeAt(i);
    }
    return buffer;
}

// 验证逻辑
async function verifyLicense(inputKey) {
    if (!inputKey) return false;
    try {
        const [dataB64, signatureB64] = inputKey.split('.');
        if (!dataB64 || !signatureB64) return false;

        const dataStr = atob(dataB64);
        const dataObj = JSON.parse(dataStr);
        
        // 导入公钥 (PUBLIC_KEY_PEM 来自 public_key.js)
        if (typeof PUBLIC_KEY_PEM === 'undefined') {
            console.error("公钥未定义，请检查 public_key.js");
            return false;
        }

        const keyData = pemToArrayBuffer(PUBLIC_KEY_PEM);
        const key = await window.crypto.subtle.importKey(
            "spki", keyData, 
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, 
            false, ["verify"]
        );

        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const data = new TextEncoder().encode(dataStr);

        const isValidSignature = await window.crypto.subtle.verify(
            "RSASSA-PKCS1-v1_5", key, signature, data
        );

        if (!isValidSignature) return false;

        // 验证日期
        // 简单使用本地时间，content.js 会有更严格的网络时间检查
        const deadline = new Date(dataObj.deadline).getTime();
        if (Date.now() > deadline) return false;

        return { valid: true, deadline: dataObj.deadline, user: dataObj.user };
    } catch (e) {
        console.error("验证出错", e);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('license-status');
    const inputArea = document.getElementById('input-area');
    const licenseInput = document.getElementById('license-input');
    const btnActivate = document.getElementById('btn-activate');
    const btnStart = document.getElementById('btn-start');
    const btnFindNext = document.getElementById('btn-find-next');
    const btnMulti = document.getElementById('btn-multi-open');
    const btnCredit = document.getElementById('btn-credit');
    const btnHelp = document.getElementById('btn-help');
    
    // 速度控制元素
    const speedRange = document.getElementById('speed-range');
    const speedValue = document.getElementById('speed-value');

    // 0. 初始化系统检测 (Windows限制)
    chrome.runtime.getPlatformInfo((info) => {
        if (info.os === 'win') {
            btnMulti.disabled = true;
            btnMulti.innerHTML = '<span>🚫 Windows系统暂不支持多开</span>';
            btnMulti.title = "由于Windows系统限制，后台标签页资源受限，暂不支持一键多开功能。";
            // 也可以选择完全隐藏
            // btnMulti.style.display = 'none';
        }
    });

    // 0.5 初始化速度设置
    const storedSpeed = await chrome.storage.local.get(['playbackSpeed']);
    if (storedSpeed.playbackSpeed) {
        speedRange.value = storedSpeed.playbackSpeed;
        speedValue.textContent = storedSpeed.playbackSpeed + 'x';
    }

    speedRange.addEventListener('input', async () => {
        const val = speedRange.value;
        speedValue.textContent = val + 'x';
        await chrome.storage.local.set({ playbackSpeed: parseFloat(val) });
        
        // 实时通知 content script 更新速度
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {
                action: "update_speed", 
                speed: parseFloat(val)
            });
        });
    });

    // 1. 初始化检查授权
    const result = await chrome.storage.local.get(['licenseKey']);
    let isAuthorized = false;

    if (result.licenseKey) {
        const verifyResult = await verifyLicense(result.licenseKey);
        if (verifyResult && verifyResult.valid) {
            isAuthorized = true;
            const userName = verifyResult.user ? ` (${verifyResult.user})` : '';
            statusEl.textContent = `已授权${userName} - 有效期至 ${verifyResult.deadline}`;
            statusEl.className = 'status-active';
            inputArea.classList.add('hidden');
            enableButtons();
        } else {
            statusEl.textContent = '授权无效或已过期';
            statusEl.className = 'status-expired';
            inputArea.classList.remove('hidden');
        }
    } else {
        statusEl.textContent = '未激活';
        inputArea.classList.remove('hidden');
    }

    function enableButtons() {
        btnStart.disabled = false;
        btnFindNext.disabled = false;
        btnCredit.disabled = false;
        
        // 只有非Windows系统才启用多开按钮
        chrome.runtime.getPlatformInfo((info) => {
            if (info.os !== 'win') {
                btnMulti.disabled = false;
            }
        });
    }

    // 2. 激活按钮逻辑
    btnActivate.addEventListener('click', async () => {
        const key = licenseInput.value.trim();
        if (!key) return;

        const verifyResult = await verifyLicense(key);
        if (verifyResult && verifyResult.valid) {
            await chrome.storage.local.set({ licenseKey: key });
            const userName = verifyResult.user ? ` (${verifyResult.user})` : '';
            statusEl.textContent = `激活成功${userName} - 有效期至 ${verifyResult.deadline}`;
            statusEl.className = 'status-active';
            inputArea.classList.add('hidden');
            enableButtons();
            // 通知当前页面刷新状态
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if(tabs[0]) chrome.tabs.sendMessage(tabs[0].id, {action: "auth_updated"});
            });
        } else {
            alert('授权码无效或已过期！');
        }
    });

    // 3. 开始学习 (发消息给 content script)
    btnStart.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, {action: "start_learning"}, (response) => {
                if (chrome.runtime.lastError) {
                    // 如果脚本还没注入或出错
                    alert("请在网课页面点击此按钮。如果已在网课页面，请刷新后重试。");
                } else {
                    window.close(); // 成功触发后关闭popup
                }
            });
        });
    });

    // 3.5 查找未学课程并进入
    btnFindNext.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            if (!tab || !tab.url.includes('/MyTrainCourse/Index')) {
                alert("请先进入【我的课程 -> 课程列表】页面再使用此功能！");
                return;
            }

            chrome.tabs.sendMessage(tab.id, {action: "find_and_enter_next_course"}, (response) => {
                if (response && response.found) {
                    // 找到了，content script 会负责跳转，我们只需关闭 popup
                    window.close();
                } else {
                    alert("当前页面未检测到未学习的课程，恭喜你已全部学完！");
                }
            });
        });
    });

    // 4. 多开按钮 (发消息获取链接 -> 打开Tab)
    btnMulti.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tab = tabs[0];
            if (!tab || !tab.url.includes('/MyTrainCourse/Index')) {
                alert("请先进入【我的课程 -> 课程列表】页面再使用此功能！");
                return;
            }

            chrome.tabs.sendMessage(tab.id, {action: "get_unlearned_courses"}, (response) => {
                if (response && response.courses && response.courses.length > 0) {
                    const count = response.courses.length;
                    if(confirm(`检测到 ${count} 个未学习课程，是否全部后台打开？\n\n注意：请确保电脑性能足够。`)) {
                        response.courses.forEach(url => {
                            chrome.tabs.create({ url: url, active: false });
                        });
                        window.close();
                    }
                } else {
                    alert("当前页面未检测到未学习的课程，或脚本未就绪。");
                }
            });
        });
    });

    // 5. 学分页面
    btnCredit.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentUrl = tabs[0].url;
            // 尝试从当前URL提取学校代码
            // 假设URL结构是 https://onlinenew.enetedu.com/schoolcode/...
            const match = currentUrl.match(/enetedu\.com\/([^\/]+)\//);
            let targetUrl = "https://onlinenew.enetedu.com/"; // 默认
            
            if (match && match[1]) {
                targetUrl = `https://onlinenew.enetedu.com/${match[1]}/MyCredit/Index`;
            } else {
                // 如果提取不到，可能需要用户自己输入或者跳转到通用页
                // 这里简单处理：让用户确认或跳转默认
                targetUrl = prompt("未能自动检测到学校代码，请输入学分页面地址，或确认跳转默认页:", targetUrl);
                if (!targetUrl) return;
            }

            chrome.tabs.create({ url: targetUrl, active: false });
        });
    });

    // 6. 帮助页面
    btnHelp.addEventListener('click', () => {
        // 这里替换为你实际维护的外部网页地址
        chrome.tabs.create({ url: "https://your-help-page-url.com" }); 
    });
});
