/**
 * Chrome Extension Content Script
 * 在页面中初始化验证码助手
 */
import { platform } from '../core/platform.js';
import { createCaptchaHelper } from '../core/index.js';

(async () => {
  try {
    const helper = await createCaptchaHelper();

    // 初始扫描
    await helper.run();

    // 启动 DOM 观察器（自动检测动态渲染的验证码）
    helper.startObserver();

    // SPA 延迟重试（某些框架异步渲染）
    const delays = [1000, 2000, 3000, 5000];
    for (const delay of delays) {
      setTimeout(() => {
        helper.run().catch(err => {
          console.warn('[CaptchaHelper] 延迟扫描出错:', err);
        });
      }, delay);
    }

    console.log('[CaptchaHelper] Chrome Extension 已启动');
  } catch (err) {
    console.error('[CaptchaHelper] 初始化失败:', err);
  }
})();
