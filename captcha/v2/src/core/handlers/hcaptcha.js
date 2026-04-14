/**
 * hCaptcha 处理器
 * 检测 hCaptcha 图像分类挑战，调用后端 /api/classify 接口识别
 *
 * 限制：
 * - Chrome 扩展：可通过 all_frames: true 访问 iframe（需在 manifest.json 配置）
 * - 油猴脚本：无法访问跨域 iframe，此 handler 在油猴环境下无法工作
 */
import { CaptchaHandler } from './base.js';
import { imgToBase64 } from '../utils/image.js';
import { getConfig } from '../config.js';

export class HCaptchaHandler extends CaptchaHandler {
  get name() { return 'hcaptcha'; }
  get priority() { return 30; }

  /**
   * 检测页面中的 hCaptcha 容器
   * @param {Document} doc
   * @returns {Array<{container: Element, type: string}>}
   */
  detect(doc) {
    const results = [];

    // 检测 hCaptcha 容器（主页面）
    const containers = doc.querySelectorAll('.h-captcha, div[data-hcaptcha-widget-id]');
    for (const container of containers) {
      results.push({ container, type: 'hcaptcha' });
    }

    // 检测 hCaptcha iframe（挑战页面）
    const iframes = doc.querySelectorAll('iframe[src*="hcaptcha.com"]');
    for (const iframe of iframes) {
      try {
        // 尝试访问 iframe 内容（仅 Chrome 扩展可行）
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          // 检查是否为挑战页面（包含图片网格）
          const challenge = iframeDoc.querySelector('.challenge-container, .task-grid');
          if (challenge) {
            results.push({ container: iframe, type: 'hcaptcha', isChallenge: true });
          }
        }
      } catch (e) {
        // 跨域 iframe 无法访问（油猴脚本）
        console.warn('[HCaptchaHandler] 无法访问 iframe（跨域限制）:', e.message);
      }
    }

    return results;
  }

  /**
   * 识别 hCaptcha 挑战
   * @param {object} captchaInfo - { container, type, isChallenge }
   * @param {object} api - { requestBackend }
   * @returns {Promise<boolean>} 成功返回 true
   */
  async solve(captchaInfo, api) {
    const { container, isChallenge } = captchaInfo;

    if (!isChallenge) {
      console.log('[HCaptchaHandler] 检测到 hCaptcha 容器，等待挑战加载');
      return null;
    }

    try {
      // 获取 iframe 文档
      const iframeDoc = container.contentDocument || container.contentWindow?.document;
      if (!iframeDoc) {
        console.warn('[HCaptchaHandler] 无法访问 iframe 内容');
        return null;
      }

      // 提取题目文本
      const questionEl = iframeDoc.querySelector('.prompt-text, .challenge-prompt, [class*="prompt"]');
      const question = questionEl?.textContent?.trim() || '请选择匹配的图片';

      // 提取图片网格
      const imageEls = iframeDoc.querySelectorAll('.task-image, .challenge-image, [class*="task"] img');
      if (imageEls.length === 0) {
        console.warn('[HCaptchaHandler] 未找到挑战图片');
        return null;
      }

      console.log(`[HCaptchaHandler] 检测到 ${imageEls.length} 张图片，题目: "${question}"`);

      // 转换图片为 base64
      const images = [];
      for (const img of imageEls) {
        try {
          const base64 = await imgToBase64(img);
          images.push(base64);
        } catch (e) {
          console.warn('[HCaptchaHandler] 图片转换失败:', e);
          images.push(''); // 占位
        }
      }

      // 调用后端分类接口，带上用户配置的 api_key（可选）
      const { apiKey } = getConfig();
      const requestBody = { images, question };
      if (apiKey) requestBody.api_key = apiKey;

      const res = await api.requestBackend('/api/classify', requestBody);

      const selected = res?.selected || [];
      if (!Array.isArray(selected) || selected.length === 0) {
        console.warn('[HCaptchaHandler] 后端未返回有效结果');
        return null;
      }

      console.log(`[HCaptchaHandler] AI 选择了图片: ${selected.join(', ')}`);

      // 点击选中的图片
      for (const index of selected) {
        if (index >= 0 && index < imageEls.length) {
          const imgEl = imageEls[index];
          const clickTarget = imgEl.closest('.task-image, .challenge-image, [class*="task"]') || imgEl;
          clickTarget.click();
          await this._sleep(200); // 模拟人类点击间隔
        }
      }

      // 查找并点击提交按钮
      await this._sleep(500);
      const submitBtn = iframeDoc.querySelector('.button-submit, [class*="submit"], button[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
        console.log('[HCaptchaHandler] 已提交答案');
        return true;
      } else {
        console.warn('[HCaptchaHandler] 未找到提交按钮');
        return null;
      }

    } catch (err) {
      console.error('[HCaptchaHandler] 识别失败:', err);
      return null;
    }
  }

  /**
   * 延迟工具函数
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
