/**
 * 数学表达式解析器（不使用 eval）
 * 支持：+、-、*、/、中文运算符和中文数字
 */

const CHINESE_DIGITS = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '百': 100, '千': 1000,
  '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5,
  '陆': 6, '柒': 7, '捌': 8, '玖': 9, '拾': 10,
};

const OPERATOR_MAP = {
  '+': '+', '＋': '+', '加': '+', 'plus': '+',
  '-': '-', '－': '-', '减': '-', 'minus': '-',
  '*': '*', '×': '*', '✖': '*', '乘': '*', 'x': '*', 'X': '*', 'times': '*',
  '/': '/', '÷': '/', '除': '/', 'divided': '/',
};

/**
 * 尝试将验证码文本解析为数学表达式并计算结果
 * 如果文本不是数学表达式，返回 null
 *
 * @param {string} text - 验证码文本，如 "3+7=?" 或 "十二减五等于？"
 * @returns {number|null}
 */
export function parseAndCalculate(text) {
  if (!text || typeof text !== 'string') return null;

  // 清理：去除空白、等号、问号、"等于"、"是多少"、"得"
  let expr = text
    .replace(/\s+/g, '')
    .replace(/[=＝等于是多少得？?]/g, '')
    .trim();

  if (!expr) return null;

  // 中文数字转阿拉伯数字
  expr = chineseToArabic(expr);

  // 规范化运算符
  for (const [from, to] of Object.entries(OPERATOR_MAP)) {
    if (from.length > 1) {
      expr = expr.replace(new RegExp(from, 'gi'), to);
    } else {
      expr = expr.split(from).join(to);
    }
  }

  // 验证：只允许数字、运算符和小数点
  if (!/^[\d+\-*/().]+$/.test(expr)) return null;

  try {
    const result = evaluate(expr);
    if (result === null || !isFinite(result)) return null;
    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * 中文数字字符串转阿拉伯数字字符串
 * 支持：十二 → 12，三百四十五 → 345
 * @param {string} str
 * @returns {string}
 */
function chineseToArabic(str) {
  let result = str;

  // 处理四位数以内的中文数字（千百十个位）
  result = result.replace(
    /([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?千([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?百([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?十([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?/g,
    (_, q, h, t, u) => {
      const val =
        (q ? CHINESE_DIGITS[q] : 0) * 1000 +
        (h ? CHINESE_DIGITS[h] : 0) * 100 +
        (t ? CHINESE_DIGITS[t] : 0) * 10 +
        (u ? CHINESE_DIGITS[u] : 0);
      return val > 0 ? String(val) : '';
    }
  );

  // 处理 十X（10+X）
  result = result.replace(/十([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])/g,
    (_, u) => String(10 + CHINESE_DIGITS[u]));
  // 处理 X十（X*10）
  result = result.replace(/([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])十/g,
    (_, t) => String(CHINESE_DIGITS[t] * 10));
  // 单独的"十"
  result = result.replace(/十/g, '10');

  // 替换剩余单个中文数字
  for (const [ch, num] of Object.entries(CHINESE_DIGITS)) {
    result = result.split(ch).join(String(num));
  }

  return result;
}

/**
 * 递归下降解析器，计算四则运算表达式
 * Grammar:
 *   expr   = term (('+' | '-') term)*
 *   term   = factor (('*' | '/') factor)*
 *   factor = NUMBER | '(' expr ')'
 *
 * @param {string} expr
 * @returns {number}
 */
function evaluate(expr) {
  let pos = 0;

  function parseExpr() {
    let result = parseTerm();
    while (pos < expr.length && (expr[pos] === '+' || expr[pos] === '-')) {
      const op = expr[pos++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm() {
    let result = parseFactor();
    while (pos < expr.length && (expr[pos] === '*' || expr[pos] === '/')) {
      const op = expr[pos++];
      const right = parseFactor();
      if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        result = result / right;
      } else {
        result = result * right;
      }
    }
    return result;
  }

  function parseFactor() {
    if (expr[pos] === '(') {
      pos++; // 跳过 '('
      const result = parseExpr();
      pos++; // 跳过 ')'
      return result;
    }

    // 解析数字（包括负数）
    const start = pos;
    if (expr[pos] === '-') pos++;
    while (pos < expr.length && (expr[pos] >= '0' && expr[pos] <= '9' || expr[pos] === '.')) {
      pos++;
    }

    if (pos === start) throw new Error(`Unexpected char: ${expr[pos]}`);
    return parseFloat(expr.slice(start, pos));
  }

  return parseExpr();
}
