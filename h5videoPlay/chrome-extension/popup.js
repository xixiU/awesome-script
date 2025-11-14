/**
 * Chrome 扩展弹出窗口脚本
 */

// 加载配置
async function loadConfig() {
    const config = await chrome.storage.sync.get({
        subtitle_serverUrl: 'http://localhost:8765',
        subtitle_targetLang: 'zh-CN',
        subtitle_autoTranslate: true
    });

    document.getElementById('serverUrl').value = config.subtitle_serverUrl;
    document.getElementById('targetLang').value = config.subtitle_targetLang;
    document.getElementById('autoTranslate').checked = config.subtitle_autoTranslate;
}

// 保存配置
async function saveConfig() {
    const config = {
        subtitle_serverUrl: document.getElementById('serverUrl').value,
        subtitle_targetLang: document.getElementById('targetLang').value,
        subtitle_autoTranslate: document.getElementById('autoTranslate').checked
    };

    try {
        await chrome.storage.sync.set(config);

        // 显示成功消息
        const statusEl = document.getElementById('status');
        statusEl.textContent = '✅ 配置已保存';
        statusEl.className = 'status success';
        statusEl.style.display = 'block';

        // 通知所有标签页更新配置
        const tabs = await chrome.tabs.query({});
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

    document.getElementById('saveBtn').addEventListener('click', saveConfig);
});

