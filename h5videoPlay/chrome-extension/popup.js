/**
 * Chrome 扩展弹出窗口脚本
 */

// 加载配置
async function loadConfig() {
    const config = await chrome.storage.sync.get({
        defaultPlaybackRate: 1.5,
        subtitle_serverUrl: 'http://localhost:8765',
        subtitle_targetLang: 'zh-CN',
        subtitle_autoTranslate: true
    });

    const rateSlider = document.getElementById('defaultRate');
    const rateDisplay = document.getElementById('rateDisplay');

    rateSlider.value = config.defaultPlaybackRate;
    rateDisplay.textContent = config.defaultPlaybackRate.toFixed(2) + 'x';
    updateSliderBackground(rateSlider);

    document.getElementById('serverUrl').value = config.subtitle_serverUrl;
    document.getElementById('targetLang').value = config.subtitle_targetLang;
    document.getElementById('autoTranslate').checked = config.subtitle_autoTranslate;
}

// 更新滑块背景渐变（左侧已选择部分为蓝色到青色渐变）
function updateSliderBackground(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const value = parseFloat(slider.value);
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, #00a1d6 0%, #5ac8fa ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
}

// 保存配置
async function saveConfig() {
    const defaultRate = parseFloat(document.getElementById('defaultRate').value);

    // 验证默认倍速范围
    if (isNaN(defaultRate) || defaultRate < 0.25 || defaultRate > 4) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = '❌ 默认倍速需在 0.25 ~ 4 之间';
        statusEl.className = 'status error';
        statusEl.style.display = 'block';
        setTimeout(() => statusEl.style.display = 'none', 3000);
        return;
    }

    const config = {
        defaultPlaybackRate: defaultRate,
        subtitle_serverUrl: document.getElementById('serverUrl').value,
        subtitle_targetLang: document.getElementById('targetLang').value,
        subtitle_autoTranslate: document.getElementById('autoTranslate').checked
    };

    try {
        await chrome.storage.sync.set(config);

        // 同步到 localStorage（供 injected.js 使用）
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (rate) => { localStorage.h5video_defaultRate = rate; },
                args: [defaultRate]
            }).catch(() => {});
        });

        // 显示成功消息
        const statusEl = document.getElementById('status');
        statusEl.textContent = '✅ 配置已保存';
        statusEl.className = 'status success';
        statusEl.style.display = 'block';

        // 通知所有标签页更新配置
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'configUpdated',
                config: config
            }).catch(() => {
                // 忽略无法发送消息的标签页
            });
        });

        // 3秒后隐藏提示
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    } catch (error) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = '❌ 保存失败: ' + error.message;
        statusEl.className = 'status error';
        statusEl.style.display = 'block';
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();

    // 滑块实时更新显示值和背景
    const rateSlider = document.getElementById('defaultRate');
    const rateDisplay = document.getElementById('rateDisplay');

    rateSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        rateDisplay.textContent = value.toFixed(2) + 'x';
        updateSliderBackground(e.target);
    });

    document.getElementById('saveBtn').addEventListener('click', saveConfig);
});

