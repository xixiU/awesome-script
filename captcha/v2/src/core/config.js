/**
 * 配置管理模块
 */
import { platform } from './platform.js';

const CONFIG_KEY = 'captchaHelperV2Config';

const DEFAULTS = {
  backendUrl: 'http://localhost:9876',
  enabledHandlers: ['ocr', 'calc', 'slider'],
  autoFill: true,
  debug: false,
  provider: 'ddddocr',  // 'ddddocr' | 'openai' | 'local'
  apiKey: '',           // OpenAI API Key（仅 openai provider 时使用）
};

let _config = null;

/**
 * 获取当前配置（同步，需先调用 initConfig()）
 */
export function getConfig() {
  if (!_config) {
    _config = { ...DEFAULTS };
  }
  return _config;
}

/**
 * 异步初始化配置（从存储中加载）
 * @returns {Promise<object>}
 */
export async function initConfig() {
  try {
    const stored = await platform.getStorage(CONFIG_KEY, {});
    _config = { ...DEFAULTS, ...(stored || {}) };
  } catch (e) {
    console.warn('[CaptchaHelper] Failed to load config, using defaults:', e);
    _config = { ...DEFAULTS };
  }
  return _config;
}

/**
 * 保存配置
 * @param {object} updates
 */
export async function saveConfig(updates) {
  _config = { ...getConfig(), ...updates };
  try {
    await platform.setStorage(CONFIG_KEY, _config);
  } catch (e) {
    console.error('[CaptchaHelper] Failed to save config:', e);
  }
  return _config;
}
