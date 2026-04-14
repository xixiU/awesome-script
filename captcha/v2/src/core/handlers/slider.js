/**
 * 滑块验证码处理器
 * 检测滑块元素，调用后端获取滑动距离，使用贝塞尔曲线模拟拖拽
 */
import { CaptchaHandler } from './base.js';
import { imgToBase64 } from '../utils/image.js';

/**
 * 滑块容器类名关键词
 */
const SLIDER_CONTAINER_RE = /slider|slide|drag|captcha.*block|verify.*slide/i;

/**
 * 滑块按钮类名关键词
 */
const SLIDER_BUTTON_RE = /slider.*btn|slide.*button|drag.*handler|slider.*handler/i;

export class SliderHandler extends CaptchaHandler {
  get name() { return 'slider'; }
  get priority() { return 20; }

  /**
   * 检测滑块验证码
   * 查找包含滑块按钮的容器
   */
  detect(doc) {
    const results = [];
    const containers = [...doc.querySelectorAll('div, section')];

    for (const container of containers) {
      const className = container.className || '';
      if (!SLIDER_CONTAINER_RE.test(className)) continue;

      // 查找滑块按钮
      const button = this._findSliderButton(container);
      if (!button) continue;

      // 查找背景图和缺口图
      const bgImg = container.querySelector('img[class*="bg"], img[class*="background"]');
      const blockImg = container.querySelector('img[class*="block"], img[class*="piece"]');

      if (bgImg) {
        results.push({
          img: bgImg,
          input: null,
          type: 'slider',
          meta: { container, button, bgImg, blockImg }
        });
      }
    }

    return results;
  }

  /**
   * 识别滑块验证码并执行拖拽
   */
  async solve(captchaInfo, api) {
    const { button, bgImg, blockImg } = captchaInfo.meta;

    // 获取图片 base64
    const bgBase64 = await imgToBase64(bgImg);
    const blockBase64 = blockImg ? await imgToBase64(blockImg) : null;

    // 调用后端计算滑动距离
    const res = await api.requestBackend('/api/slide', {
      target: blockBase64,
      background: bgBase64,
      bg_width: captchaInfo.meta.bgWidth || 0
    });

    const distance = res && res.x;
    if (!distance || distance <= 0) {
      console.warn('[CaptchaHelper] 后端未返回有效滑动距离');
      return null;
    }

    console.log(`[CaptchaHelper] 滑块距离: ${distance}px`);

    // 执行拖拽
    await this._dragSlider(button, distance);

    return distance;
  }

  /**
   * 查找滑块按钮
   */
  _findSliderButton(container) {
    const candidates = [...container.querySelectorAll('div, span, button')];
    for (const el of candidates) {
      const className = el.className || '';
      if (SLIDER_BUTTON_RE.test(className)) {
        return el;
      }
    }
    return null;
  }

  /**
   * 使用贝塞尔曲线模拟人工拖拽
   * @param {HTMLElement} button - 滑块按钮
   * @param {number} distance - 滑动距离（px）
   */
  async _dragSlider(button, distance) {
    const rect = button.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    // 生成贝塞尔曲线轨迹
    const track = this._generateBezierTrack(distance);

    // 触发 mousedown
    this._dispatchMouseEvent(button, 'mousedown', startX, startY);

    // 沿轨迹移动
    for (let i = 0; i < track.length; i++) {
      await this._sleep(Math.random() * 10 + 5); // 5-15ms 间隔
      const x = startX + track[i];
      this._dispatchMouseEvent(button, 'mousemove', x, startY);
    }

    // 触发 mouseup
    this._dispatchMouseEvent(button, 'mouseup', startX + distance, startY);
  }

  /**
   * 生成贝塞尔曲线轨迹（三次贝塞尔）
   * @param {number} distance - 总距离
   * @returns {number[]} 每个时间点的 x 偏移量
   */
  _generateBezierTrack(distance) {
    const steps = 30 + Math.floor(Math.random() * 20); // 30-50 步
    const track = [];

    // 控制点（模拟先加速后减速）
    const p0 = 0;
    const p1 = distance * 0.3;
    const p2 = distance * 0.7;
    const p3 = distance;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.pow(1 - t, 3) * p0 +
                3 * Math.pow(1 - t, 2) * t * p1 +
                3 * (1 - t) * Math.pow(t, 2) * p2 +
                Math.pow(t, 3) * p3;
      track.push(x);
    }

    return track;
  }

  /**
   * 触发鼠标事件
   */
  _dispatchMouseEvent(el, type, clientX, clientY) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY
    });
    el.dispatchEvent(event);
  }

  /**
   * 延迟
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
