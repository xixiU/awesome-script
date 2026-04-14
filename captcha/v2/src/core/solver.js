/**
 * 验证码识别调度器
 * 调用后端 API 并填充答案
 */
import { platform } from './platform.js';
import { getConfig } from './config.js';
import { fillInput } from './utils/dom.js';

export class CaptchaSolver {
  constructor() {
    this.processing = new Set(); // 防止重复处理同一个验证码
  }

  /**
   * 识别并填充验证码
   * @param {object} detection - { handler, captchaInfo }
   * @returns {Promise<boolean>} 成功返回 true
   */
  async solve(detection) {
    const { handler, captchaInfo } = detection;
    const { img, input, type, container } = captchaInfo;

    // 防止重复处理（兼容 img 和 container 两种类型）
    const keyEl = img || container;
    const key = this._getKey(keyEl);
    if (this.processing.has(key)) {
      return false;
    }
    this.processing.add(key);

    try {
      console.log(`[CaptchaHelper] 检测到 ${type} 验证码，使用 ${handler.name} 处理器`);

      const answer = await handler.solve(captchaInfo, {
        requestBackend: this.requestBackend.bind(this)
      });

      if (answer === null || answer === undefined) {
        console.warn(`[CaptchaHelper] ${handler.name} 识别失败`);
        return false;
      }

      console.log(`[CaptchaHelper] 识别结果: ${answer}`);

      // 自动填充
      const config = getConfig();
      if (config.autoFill && input) {
        fillInput(input, String(answer));
        console.log(`[CaptchaHelper] 已自动填入答案`);
        platform.notify(`验证码已识别: ${answer}`, 'success');
      } else {
        platform.notify(`验证码识别结果: ${answer}`, 'info');
      }

      return true;
    } catch (err) {
      console.error(`[CaptchaHelper] 识别出错:`, err);
      platform.notify(`验证码识别失败: ${err.message}`, 'error');
      return false;
    } finally {
      // 5秒后允许重新识别（防止页面刷新验证码后无法再次识别）
      setTimeout(() => this.processing.delete(key), 5000);
    }
  }

  /**
   * 调用后端 API
   * @param {string} endpoint - '/recognize_captcha' 等
   * @param {object} body - 请求体
   * @returns {Promise<any>}
   */
  async requestBackend(endpoint, body) {
    const config = getConfig();
    const url = config.backendUrl + endpoint;

    return await platform.request({
      method: 'POST',
      url: url,
      data: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      responseType: 'json'
    });
  }

  /**
   * 生成验证码唯一标识（用于防重）
   * @param {Element} img
   * @returns {string}
   */
  _getKey(el) {
    if (!el) return 'unknown-' + Date.now();
    return el.src || el.getAttribute?.('src') || el.outerHTML?.slice(0, 100) || 'unknown';
  }
}
