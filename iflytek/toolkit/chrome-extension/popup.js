/**
 * 21tb增强助手 - 设置弹窗脚本
 */

// 默认配置
const DEFAULT_CONFIG = {
    role: "科大讯飞公司的规章制度专家",
    ability: "保密",
    difyApiUrl: "https://api.dify.ai/v1/workflows/run",
    difyApiKey: "",
    defaultSpeed: 2.0
};

// DOM 元素
const roleInput = document.getElementById('role');
const abilityInput = document.getElementById('ability');
const apiUrlInput = document.getElementById('api-url');
const apiKeyInput = document.getElementById('api-key');
const defaultSpeedInput = document.getElementById('default-speed');
const speedDisplay = document.getElementById('speed-display');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const successMessage = document.getElementById('success-message');

// 速度滑块实时更新
defaultSpeedInput.addEventListener('input', (e) => {
    const speed = parseFloat(e.target.value);
    updateSpeedDisplay(speed);
});

// 更新速度显示
function updateSpeedDisplay(speed) {
    speedDisplay.textContent = `${speed.toFixed(1)}x`;
    
    // 根据速度值改变显示颜色
    if (speed <= 1.5) {
        speedDisplay.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    } else if (speed <= 2.5) {
        speedDisplay.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
    } else if (speed <= 3.5) {
        speedDisplay.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    } else if (speed <= 4.5) {
        speedDisplay.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    } else {
        speedDisplay.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    }
}

// 加载配置
function loadConfig() {
    chrome.storage.sync.get(Object.keys(DEFAULT_CONFIG), (result) => {
        roleInput.value = result.role || DEFAULT_CONFIG.role;
        abilityInput.value = result.ability || DEFAULT_CONFIG.ability;
        apiUrlInput.value = result.difyApiUrl || DEFAULT_CONFIG.difyApiUrl;
        apiKeyInput.value = result.difyApiKey || DEFAULT_CONFIG.difyApiKey;
        
        const speed = result.defaultSpeed || DEFAULT_CONFIG.defaultSpeed;
        defaultSpeedInput.value = speed;
        updateSpeedDisplay(speed);

        updateConfigStatus();
    });
}

// 保存配置
function saveConfig() {
    const role = roleInput.value.trim();
    const ability = abilityInput.value.trim();
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const defaultSpeed = parseFloat(defaultSpeedInput.value);

    // 基本验证
    if (!role) {
        alert('请输入 AI 角色设定');
        roleInput.focus();
        return;
    }

    if (!ability) {
        alert('请输入 AI 能力范围');
        abilityInput.focus();
        return;
    }

    if (!apiUrl) {
        alert('请输入 Dify API 地址');
        apiUrlInput.focus();
        return;
    }

    if (!apiKey) {
        alert('请输入 Dify API Key（必填项）');
        apiKeyInput.focus();
        return;
    }

    // 验证 URL 格式
    try {
        new URL(apiUrl);
    } catch (e) {
        alert('请输入有效的 API 地址（必须以 http:// 或 https:// 开头）');
        apiUrlInput.focus();
        return;
    }

    // 验证 API Key 格式
    if (!apiKey.startsWith('app-')) {
        alert('API Key 格式不正确，应该以 "app-" 开头');
        apiKeyInput.focus();
        return;
    }

    // 速度范围已由滑块控件限制，无需额外验证

    // 保存配置
    const config = {
        role: role,
        ability: ability,
        difyApiUrl: apiUrl,
        difyApiKey: apiKey,
        defaultSpeed: defaultSpeed
    };

    chrome.storage.sync.set(config, () => {
        console.log('[21tb扩展] 配置已保存', config);
        
        // 更新状态标识
        updateConfigStatus();
        
        // 显示成功消息
        successMessage.classList.add('show');
        
        // 2秒后自动隐藏
        setTimeout(() => {
            successMessage.classList.remove('show');
        }, 2000);
    });
}

// 重置为默认配置
function resetConfig() {
    if (confirm('确定要重置所有配置为默认值吗？\n\n注意：这将清除您的 API Key 等所有自定义配置！')) {
        chrome.storage.sync.set(DEFAULT_CONFIG, () => {
            console.log('[21tb扩展] 配置已重置为默认值');
            loadConfig();
            updateSpeedDisplay(DEFAULT_CONFIG.defaultSpeed);
            alert('配置已重置为默认值！\n请重新配置 Dify API Key 后使用。');
        });
    }
}

// 更新配置状态显示
function updateConfigStatus() {
    chrome.storage.sync.get(['difyApiUrl', 'difyApiKey'], (result) => {
        const urlStatus = document.getElementById('url-status');
        const keyStatus = document.getElementById('key-status');

        // 更新 URL 状态
        const apiUrl = result.difyApiUrl || DEFAULT_CONFIG.difyApiUrl;
        if (apiUrl && apiUrl !== DEFAULT_CONFIG.difyApiUrl) {
            urlStatus.textContent = '已配置';
            urlStatus.className = 'config-status configured';
        } else {
            urlStatus.textContent = '使用默认';
            urlStatus.className = 'config-status configured';
        }

        // 更新 Key 状态
        const apiKey = result.difyApiKey || '';
        if (apiKey && apiKey.length > 0) {
            keyStatus.textContent = '已配置';
            keyStatus.className = 'config-status configured';
        } else {
            keyStatus.textContent = '未配置';
            keyStatus.className = 'config-status not-configured';
        }
    });
}

// 事件监听
saveBtn.addEventListener('click', saveConfig);
resetBtn.addEventListener('click', resetConfig);

// 按 Enter 键保存
[roleInput, abilityInput, apiUrlInput, apiKeyInput, defaultSpeedInput].forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveConfig();
        }
    });
});

// 页面加载时读取配置
document.addEventListener('DOMContentLoaded', loadConfig);

