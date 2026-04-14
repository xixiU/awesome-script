/**
 * Platform Abstraction Layer
 * 为 Tampermonkey 和 Chrome Extension 提供统一的 API 接口
 */

class PlatformAdapter {
  constructor() {
    this.type = this.detectPlatform();
  }

  detectPlatform() {
    if (typeof GM_xmlhttpRequest !== 'undefined') {
      return 'tampermonkey';
    } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      return 'extension';
    }
    return 'unknown';
  }

  /**
   * 发送 HTTP 请求
   * @param {Object} options - { method, url, data, headers, responseType }
   * @returns {Promise<any>}
   */
  async request(options) {
    if (this.type === 'tampermonkey') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: options.method || 'GET',
          url: options.url,
          data: options.data,
          headers: options.headers || {},
          responseType: options.responseType || 'json',
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.response);
            } else {
              reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
            }
          },
          onerror: (error) => reject(error),
          ontimeout: () => reject(new Error('Request timeout'))
        });
      });
    } else if (this.type === 'extension') {
      const fetchOptions = {
        method: options.method || 'GET',
        headers: options.headers || {}
      };
      if (options.data) {
        fetchOptions.body = options.data;
      }
      const response = await fetch(options.url, fetchOptions);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      if (options.responseType === 'blob') {
        return await response.blob();
      } else if (options.responseType === 'text') {
        return await response.text();
      }
      return await response.json();
    }
    throw new Error('Unsupported platform');
  }

  /**
   * 存储数据
   * @param {string} key
   * @param {any} value
   */
  async setStorage(key, value) {
    if (this.type === 'tampermonkey') {
      GM_setValue(key, JSON.stringify(value));
    } else if (this.type === 'extension') {
      await chrome.storage.local.set({ [key]: value });
    }
  }

  /**
   * 读取数据
   * @param {string} key
   * @param {any} defaultValue
   * @returns {Promise<any>}
   */
  async getStorage(key, defaultValue = null) {
    if (this.type === 'tampermonkey') {
      const value = GM_getValue(key);
      return value ? JSON.parse(value) : defaultValue;
    } else if (this.type === 'extension') {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    }
    return defaultValue;
  }

  /**
   * 显示通知
   * @param {string} message
   * @param {string} type - 'success' | 'error' | 'info'
   */
  notify(message, type = 'info') {
    if (this.type === 'tampermonkey') {
      if (typeof GM_notification !== 'undefined') {
        GM_notification({
          text: message,
          title: '验证码助手',
          timeout: 3000
        });
      } else {
        console.log(`[CaptchaHelper] ${message}`);
      }
    } else if (this.type === 'extension') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: '验证码助手',
        message: message
      });
    }
  }

  /**
   * 注册菜单命令（仅 Tampermonkey）
   * @param {string} caption
   * @param {Function} callback
   */
  registerMenuCommand(caption, callback) {
    if (this.type === 'tampermonkey' && typeof GM_registerMenuCommand !== 'undefined') {
      GM_registerMenuCommand(caption, callback);
    }
  }
}

// 导出单例
export const platform = new PlatformAdapter();
