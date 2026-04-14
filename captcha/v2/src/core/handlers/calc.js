/**
 * 计算型验证码处理器
 * 检测 OCR 结果是否为数学表达式，若是则计算答案
 */
import { CaptchaHandler } from './base.js';
import { parseAndCalculate } from '../utils/math-parser.js';

/** 匹配计算型验证码的正则：包含运算符和等号/问号 */
const CALC_PATTERN = /[+\-×÷加减乘除＋－*\/].*[=＝等于？?]|[=＝等于？?].*[+\-×÷加减乘除＋－*\/]/;

export class CalcHandler extends CaptchaHandler {
  get name() { return 'calc'; }
  get priority() { return 5; } // 比 OCR 高优先级（先处理计算型）

  /**
   * CalcHandler 不直接检测，由 OcrHandler 识别后调用 tryCalculate()
   */
  detect(doc) {
    return [];
  }

  /**
   * 检查 OCR 识别文本是否为数学表达式，若是则返回计算结果
   * @param {string} ocrText - OCR 识别结果
   * @returns {number|null} 计算结果，或 null（不是数学表达式）
   */
  tryCalculate(ocrText) {
    if (!ocrText || typeof ocrText !== 'string') return null;
    if (!CALC_PATTERN.test(ocrText)) return null;
    return parseAndCalculate(ocrText);
  }
}
