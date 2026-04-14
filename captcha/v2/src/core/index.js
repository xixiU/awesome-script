/**
 * Core 入口模块
 * 初始化检测器、识别器，设置 DOM 监听
 */
import { CaptchaDetector } from './detector.js';
import { CaptchaSolver } from './solver.js';
import { initConfig } from './config.js';
import { OcrHandler } from './handlers/ocr.js';
import { CalcHandler } from './handlers/calc.js';
import { SliderHandler } from './handlers/slider.js';
import { HCaptchaHandler } from './handlers/hcaptcha.js';

/**
 * 创建验证码助手实例
 * @returns {Promise<object>} { detector, solver, run, startObserver }
 */
export async function createCaptchaHelper() {
  // 初始化配置
  await initConfig();

  // 创建检测器
  const detector = new CaptchaDetector();

  // 创建处理器
  const calcHandler = new CalcHandler();
  const ocrHandler = new OcrHandler(calcHandler);
  const sliderHandler = new SliderHandler();

  // 注册处理器（按优先级自动排序）
  detector.register(calcHandler); // priority=5
  detector.register(ocrHandler);  // priority=10
  detector.register(sliderHandler); // priority=20
  detector.register(new HCaptchaHandler()); // priority=30

  // 创建识别器
  const solver = new CaptchaSolver();

  return {
    detector,
    solver,
    /**
     * 执行一次扫描和识别
     */
    async run() {
      const detections = detector.scan();
      if (detections.length === 0) {
        return;
      }

      console.log(`[CaptchaHelper] 检测到 ${detections.length} 个验证码`);

      // 并发识别所有验证码
      const promises = detections.map(detection => solver.solve(detection));
      await Promise.allSettled(promises);
    },
    /**
     * 启动 DOM 监听器
     */
    startObserver() {
      return observeDOM(this);
    }
  };
}

/**
 * 设置 MutationObserver 监听 DOM 变化，自动检测验证码
 * @param {object} helper - createCaptchaHelper() 返回的实例
 * @returns {MutationObserver}
 */
function observeDOM(helper) {
  const CAPTCHA_RE = /code|captcha|验证码|verify|yzm|slide|slider/i;
  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;

    for (const mutation of mutations) {
      // 新增 img 元素
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (node.tagName === 'IMG') {
              shouldCheck = true;
              break;
            }
            // 检查子孙节点是否包含 img
            if (node.querySelector && node.querySelector('img')) {
              shouldCheck = true;
              break;
            }
          }
        }
      }

      // img src 属性变化
      if (mutation.type === 'attributes' &&
          mutation.attributeName === 'src' &&
          mutation.target.tagName === 'IMG') {
        shouldCheck = true;
      }

      // 检查属性是否包含验证码关键词
      if (!shouldCheck && mutation.type === 'attributes') {
        const el = mutation.target;
        const attrs = [
          el.id,
          el.className,
          el.getAttribute?.('alt'),
          el.getAttribute?.('src')
        ].filter(Boolean);

        if (attrs.some(a => CAPTCHA_RE.test(String(a)))) {
          shouldCheck = true;
        }
      }

      if (shouldCheck) break;
    }

    if (shouldCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        helper.run().catch(err => {
          console.error('[CaptchaHelper] 自动识别出错:', err);
        });
      }, 500); // 防抖 500ms
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'class', 'id']
  });

  console.log('[CaptchaHelper] DOM 监听器已启动');
  return observer;
}
