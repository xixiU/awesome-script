/**
 * 验证码检测引擎
 * 按优先级顺序调用已注册的处理器
 */
export class CaptchaDetector {
  constructor() {
    this.handlers = [];
  }

  /**
   * 注册处理器（自动按 priority 排序）
   * @param {CaptchaHandler} handler
   */
  register(handler) {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 扫描文档，查找验证码
   * 优先级低（数值小）的处理器先检查
   * @param {Document} doc
   * @returns {Array<{handler, captchaInfo}>}
   */
  scan(doc = document) {
    const allResults = [];
    for (const handler of this.handlers) {
      try {
        const results = handler.detect(doc);
        if (results && results.length > 0) {
          for (const captchaInfo of results) {
            allResults.push({ handler, captchaInfo });
          }
        }
      } catch (err) {
        console.warn(`[CaptchaHelper] Handler "${handler.name}" detect() 出错:`, err);
      }
    }
    return allResults;
  }
}
