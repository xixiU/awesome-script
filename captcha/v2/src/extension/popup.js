/**
 * Extension Popup Script
 * 管理配置的读写
 */

const CONFIG_KEY = 'captchaHelperV2Config';
const DEFAULTS = {
  backendUrl: 'http://localhost:9876',
  autoFill: true,
  debug: false,
  provider: 'ddddocr',
  apiKey: ''
};

const backendUrlEl = document.getElementById('backendUrl');
const autoFillEl = document.getElementById('autoFill');
const debugEl = document.getElementById('debug');
const providerEl = document.getElementById('provider');
const apiKeyEl = document.getElementById('apiKey');
const apiKeyFieldEl = document.getElementById('apiKeyField');
const saveBtnEl = document.getElementById('saveBtn');
const testBtnEl = document.getElementById('testBtn');
const statusEl = document.getElementById('status');

// 加载配置
chrome.storage.local.get(CONFIG_KEY, (result) => {
  const config = Object.assign({}, DEFAULTS, result[CONFIG_KEY]);
  backendUrlEl.value = config.backendUrl || '';
  autoFillEl.checked = config.autoFill !== false;
  debugEl.checked = !!config.debug;
  providerEl.value = config.provider || 'ddddocr';
  apiKeyEl.value = config.apiKey || '';
  toggleApiKeyField(providerEl.value);
});

// Provider 切换时显示/隐藏 API Key 字段
providerEl.addEventListener('change', () => {
  toggleApiKeyField(providerEl.value);
});

function toggleApiKeyField(provider) {
  apiKeyFieldEl.style.display = provider === 'openai' ? 'block' : 'none';
}

// 保存配置
saveBtnEl.addEventListener('click', () => {
  const config = {
    backendUrl: backendUrlEl.value.trim() || DEFAULTS.backendUrl,
    autoFill: autoFillEl.checked,
    debug: debugEl.checked,
    provider: providerEl.value,
    apiKey: apiKeyEl.value.trim()
  };

  chrome.storage.local.set({ [CONFIG_KEY]: config }, () => {
    showStatus('保存成功', 'success');
  });
});

// 测试后端连接
testBtnEl.addEventListener('click', async () => {
  const url = backendUrlEl.value.trim() || DEFAULTS.backendUrl;
  testBtnEl.disabled = true;
  testBtnEl.textContent = '连接中...';

  try {
    const response = await fetch(url + '/health');
    if (response.ok) {
      const data = await response.json();
      showStatus(`连接成功：${data.status || data.service || 'running'}`, 'success');
    } else {
      showStatus(`连接失败：HTTP ${response.status}`, 'error');
    }
  } catch (err) {
    showStatus(`连接失败：${err.message}`, 'error');
  } finally {
    testBtnEl.disabled = false;
    testBtnEl.textContent = '测试连接';
  }
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}
