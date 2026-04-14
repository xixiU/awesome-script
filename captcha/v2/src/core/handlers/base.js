/**
 * 验证码处理器基类
 * 每个处理器实现 detect() 和 solve()
 */
export class CaptchaHandler {
  /** 处理器名称，用于日志 */
  get name() { return 'base'; }

  /** 优先级，数值越小越先被检查 */
  get priority() { return 100; }

  /**
   * 扫描文档，查找该处理器能识别的验证码
   * @param {Document} doc
   * @returns {Array<{img: Element, input: Element|null, type: string, meta?: object}>}
   */
  detect(doc) { return []; }

  /**
   * 识别验证码并返回答案
   * @param {object} captchaInfo - detect() 返回的单条记录
   * @param {object} api - { requestBackend(endpoint, body) }
   * @returns {Promise<string|number|null>} 答案，失败返回 null
   */
  async solve(captchaInfo, api) { return null; }
}
