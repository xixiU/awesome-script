/**
 * OCR 验证码处理器
 * 检测图片型验证码，调用后端 OCR 接口识别
 * 集成 CalcHandler：若识别文本为数学表达式则直接计算
 *
 * 检测逻辑迁移自 browser_capture.js（v4.2.8）
 */
import { CaptchaHandler } from './base.js';
import { CalcHandler } from './calc.js';
import { imgToBase64 } from '../utils/image.js';
import { findNearestInput } from '../utils/dom.js';

/**
 * 明确的验证码 URL 路径关键词（不匹配 base64）
 * 迁移自 browser_capture.js line 732-733
 */
const CAPTCHA_SRC_RE = /createimage|captcha|verify|checkcode|validatecode|randcode|rand_code|vcode|authcode|kaptcha|imagecode|seccode|piccode|yzm|verifycode|picvalidcode/i;

/**
 * 属性关键词匹配（宽松，但需配合尺寸检查）
 * 迁移自 browser_capture.js line 778
 */
const CAPTCHA_ATTR_RE = /captcha|验证码|verify|yzm|yanzhengma|换一张|security|challenge|kaptcha|seccode|piccode|checkcode|authcode|vcode|captchacode|verifycode|\bcode\b/i;

/**
 * 排除的 src 关键词（logo、头像、图标等）
 * 迁移自 browser_capture.js 的 isInvalid 逻辑
 */
const EXCLUDE_SRC_RE = /personalcenter|personal|gzh|qrcode|二维码|app\.png|logo|icon|avatar|header|banner|button_\d+\.jpg/i;

export class OcrHandler extends CaptchaHandler {
  constructor(calcHandler = null) {
    super();
    this._calcHandler = calcHandler || new CalcHandler();
  }

  get name() { return 'ocr'; }
  get priority() { return 10; }

  /**
   * 扫描文档，查找验证码图片
   * 检测逻辑参照 browser_capture.js v4.2.8
   */
  detect(doc) {
    const results = [];
    const imgs = [...doc.querySelectorAll('img')];

    for (const img of imgs) {
      const src = img.getAttribute('src') || '';

      // 跳过空 src
      if (!src || src === '#' || src === 'about:blank') continue;

      // 排除明显不是验证码的图片
      if (EXCLUDE_SRC_RE.test(src)) continue;

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      let isCaptcha = false;

      // 1. 明确的验证码 URL 路径（不对 base64 做路径匹配）
      if (!src.startsWith('data:') && CAPTCHA_SRC_RE.test(src)) {
        // 放宽尺寸限制（图片可能还在加载中），但排除明显太小的图标
        if (w === 0 || h === 0 || (w >= 30 && h >= 15)) {
          isCaptcha = true;
        }
      }

      // 2. Element UI 特殊处理：el-input-group__append 内的 base64 图片
      if (!isCaptcha && src.startsWith('data:image/')) {
        if (img.closest('.el-input-group__append') && img.closest('.el-input-group')) {
          isCaptcha = true;
        }
        // 3. Naive UI 特殊处理：n-input__suffix 内的 base64 图片
        if (!isCaptcha && img.closest('.n-input__suffix')) {
          isCaptcha = true;
        }
      }

      // 4. 属性关键词匹配（需满足尺寸条件）
      if (!isCaptcha) {
        const isValidSize = w > 10 && w < 600 && h > 10 && h < 300;
        if (isValidSize) {
          const checkList = [img.id, img.className, img.alt, src, img.name, img.title]
            .filter(Boolean)
            .map(v => String(v));

          for (const attrValue of checkList) {
            if (attrValue.startsWith('data:')) continue; // 跳过 base64 内容
            if (CAPTCHA_ATTR_RE.test(attrValue)) {
              // 宽高比合理，且尺寸足够大
              if (w / h >= 0.8 && w >= 40 && h >= 15) {
                isCaptcha = true;
                break;
              }
            }
          }
        }
      }

      if (isCaptcha) {
        const input = findNearestInput(img);
        results.push({ img, input, type: 'ocr' });
      }
    }

    return results;
  }

  /**
   * 调用后端 OCR 接口识别验证码
   * 若识别结果是数学表达式，则由 CalcHandler 计算答案
   */
  async solve(captchaInfo, api) {
    const base64 = await imgToBase64(captchaInfo.img);
    const res = await api.requestBackend('/api/ocr', { image: base64 });

    const ocrText = (res && (res.text || res.result || res.code)) || '';
    if (!ocrText) {
      console.warn('[CaptchaHelper] OCR 返回空结果');
      return null;
    }

    // 检查是否为计算型验证码
    const calcResult = this._calcHandler.tryCalculate(ocrText);
    if (calcResult !== null) {
      console.log(`[CaptchaHelper] 计算型验证码: "${ocrText}" → ${calcResult}`);
      return calcResult;
    }

    return ocrText;
  }
}
