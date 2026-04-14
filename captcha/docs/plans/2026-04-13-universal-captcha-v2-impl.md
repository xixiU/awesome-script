# Universal Captcha v2 — Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the captcha recognition system with shared core logic, Chrome extension + Tampermonkey dual distribution, and a FastAPI backend supporting OCR / calculation / slider captchas.

**Architecture:** Browser-side `core/` module (detector → handler → solver pipeline) wrapped by thin platform adapters for Chrome Extension (MV3) and Tampermonkey. Backend migrates from Flask to FastAPI with a provider abstraction layer. esbuild produces both `.user.js` and extension bundle from a single source tree.

**Tech Stack:** JavaScript (ES2020), esbuild, Chrome Extension MV3, Tampermonkey, Python 3.10+, FastAPI, ddddocr, Pillow

---

## Task 1: Project Scaffolding & Build System ✅

**Files:**
- Create: `captcha/v2/package.json`
- Create: `captcha/v2/build/build.js`
- Create: `captcha/v2/build/userscript-banner.js`

**Step 1: Initialize npm project**

Create `captcha/v2/package.json`:

```json
{
  "name": "captcha-helper-v2",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "build": "node build/build.js",
    "build:watch": "node build/build.js --watch",
    "build:ext": "node build/build.js --target=extension",
    "build:tm": "node build/build.js --target=tampermonkey"
  },
  "devDependencies": {
    "esbuild": "^0.20.0"
  }
}
```

**Step 2: Create the esbuild build script**

Create `captcha/v2/build/build.js`:

```javascript
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { generateBanner } = require('./userscript-banner');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const targetFilter = args.find(a => a.startsWith('--target='))?.split('=')[1];

const DIST = path.resolve(__dirname, '../dist');

async function buildExtension() {
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/extension/content.js')],
    bundle: true,
    outfile: path.join(DIST, 'extension/content.js'),
    format: 'iife',
    target: 'chrome110',
    minify: false,
  });
  // Copy static extension files
  const extSrc = path.resolve(__dirname, '../src/extension');
  for (const file of ['manifest.json', 'background.js', 'popup.html', 'popup.js']) {
    const src = path.join(extSrc, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST, 'extension', file));
    }
  }
  console.log('[build] Extension → dist/extension/');
}

async function buildTampermonkey() {
  const result = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src/tampermonkey/entry.js')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
  });
  const code = result.outputFiles[0].text;
  const banner = generateBanner();
  fs.writeFileSync(path.join(DIST, 'captcha-helper.user.js'), banner + '\n' + code);
  console.log('[build] Tampermonkey → dist/captcha-helper.user.js');
}

async function main() {
  fs.mkdirSync(path.join(DIST, 'extension'), { recursive: true });

  if (!targetFilter || targetFilter === 'extension') await buildExtension();
  if (!targetFilter || targetFilter === 'tampermonkey') await buildTampermonkey();

  if (isWatch) {
    const chokidar = require('chokidar');
    console.log('[build] Watching src/ for changes...');
    chokidar.watch(path.resolve(__dirname, '../src'), { ignoreInitial: true })
      .on('change', async () => {
        console.log('[build] Rebuilding...');
        if (!targetFilter || targetFilter === 'extension') await buildExtension();
        if (!targetFilter || targetFilter === 'tampermonkey') await buildTampermonkey();
      });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

Create `captcha/v2/build/userscript-banner.js`:

```javascript
function generateBanner() {
  return `// ==UserScript==
// @name        通用验证码识别助手 v2
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  自动识别并填入文字、计算、滑块验证码
// @author       xixiu
// @match        *://*/*
// @exclude      https://www.youtube.com/*
// @license      MIT
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @grant        GM_info
// @grant        GM_listValues
// @connect      *
// @run-at       document-end
// ==/UserScript==`;
}

module.exports = { generateBanner };
```

**Step 3: Install dependencies and verify build runs**

Run: `cd captcha/v2 && npm install`
Expected: `node_modules/` created with esbuild

**Step 4: Commit**

```bash
git add captcha/v2/package.json captcha/v2/build/
git commit -m "feat(v2): project scaffolding and esbuild build system"
```

---

## Task 2: Core — Platform Abstraction Layer ✅

**Files:**
- Create: `captcha/v2/src/core/platform.js`

**Step 1: Write platform interface and implementations**

Create `captcha/v2/src/core/platform.js`:

```javascript
/**
 * Platform abstraction layer.
 * Provides a unified API over Tampermonkey GM_* and Chrome Extension APIs.
 * The active adapter is set once at startup via `setPlatform()`.
 */

let _platform = null;

export function setPlatform(adapter) {
  _platform = adapter;
}

export function getPlatform() {
  if (!_platform) throw new Error('[CaptchaHelper] Platform not initialized. Call setPlatform() first.');
  return _platform;
}

/**
 * Tampermonkey adapter — uses GM_* APIs.
 * Must be called from a context where GM_* globals are available.
 */
export function createTampermonkeyAdapter(gmApis) {
  const { GM_xmlhttpRequest, GM_setValue, GM_getValue, GM_deleteValue,
          GM_notification, GM_registerMenuCommand, GM_addStyle } = gmApis;

  return {
    name: 'tampermonkey',

    request(url, options = {}) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: options.method || 'POST',
          url,
          data: options.body,
          headers: options.headers,
          responseType: options.responseType || '',
          onload: (res) => resolve({ status: res.status, data: res.response, responseText: res.responseText }),
          onerror: (err) => reject(new Error(`Request failed: ${err.statusText || 'network error'}`)),
          ontimeout: () => reject(new Error('Request timeout')),
        });
      });
    },

    storage: {
      get(key, defaultValue = null) {
        const raw = GM_getValue(key, null);
        if (raw === null) return defaultValue;
        try { return JSON.parse(raw); } catch { return raw; }
      },
      set(key, value) {
        GM_setValue(key, JSON.stringify(value));
      },
      remove(key) {
        GM_deleteValue(key);
      },
    },

    notify(message, title = '验证码助手') {
      GM_notification({ text: message, title, timeout: 3000 });
    },

    // Tampermonkey cannot inject into cross-origin iframes
    canAccessIframes: false,
    sendToFrame(_frameId, _message) {
      console.warn('[CaptchaHelper] Tampermonkey cannot send messages to cross-origin iframes');
      return Promise.resolve(null);
    },
  };
}

/**
 * Chrome Extension adapter — uses chrome.* APIs.
 * Used inside content scripts.
 */
export function createExtensionAdapter() {
  return {
    name: 'extension',

    request(url, options = {}) {
      const fetchOptions = {
        method: options.method || 'POST',
        headers: options.headers,
        body: options.body,
      };
      return fetch(url, fetchOptions).then(async (res) => ({
        status: res.status,
        data: await res.text(),
        responseText: await res.text(),
      }));
    },

    storage: {
      async get(key, defaultValue = null) {
        return new Promise((resolve) => {
          chrome.storage.local.get(key, (result) => {
            resolve(result[key] !== undefined ? result[key] : defaultValue);
          });
        });
      },
      async set(key, value) {
        return chrome.storage.local.set({ [key]: value });
      },
      async remove(key) {
        return chrome.storage.local.remove(key);
      },
    },

    notify(message, title = '验证码助手') {
      chrome.notifications.create({ type: 'basic', iconUrl: 'icon48.png', title, message });
    },

    canAccessIframes: true,
    sendToFrame(tabId, message) {
      return chrome.tabs.sendMessage(tabId, message);
    },
  };
}
```

**Step 2: Commit**

```bash
git add captcha/v2/src/core/platform.js
git commit -m "feat(v2): platform abstraction layer (TM + extension adapters)"
```

---

## Task 3: Core — Utility Modules ✅

**Files:**
- Create: `captcha/v2/src/core/utils/image.js`
- Create: `captcha/v2/src/core/utils/dom.js`
- Create: `captcha/v2/src/core/utils/math-parser.js`

**Step 1: Create image utility**

Create `captcha/v2/src/core/utils/image.js`:

```javascript
import { getPlatform } from '../platform.js';

/**
 * Convert an <img> element to a base64 data URL.
 * Tries canvas first; falls back to platform.request() for cross-origin images.
 */
export async function imgToBase64(imgEl) {
  // If already base64, return as-is
  if (imgEl.src && imgEl.src.includes(';base64,')) {
    return imgEl.src;
  }

  // Try canvas approach
  try {
    await waitForImageLoad(imgEl);
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth;
    canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (_canvasErr) {
    // Canvas tainted — fetch via platform (bypasses CORS in TM)
    return fetchImageAsBase64(imgEl.src);
  }
}

/**
 * Fetch an image URL and return as base64 data URL.
 */
export async function fetchImageAsBase64(url) {
  const platform = getPlatform();
  const res = await platform.request(url, { method: 'GET', responseType: 'blob' });
  // In TM adapter, res.data is already a blob; in extension adapter it's text.
  // Normalize to base64:
  if (res.data instanceof Blob) {
    return blobToBase64(res.data);
  }
  // If the platform returned arraybuffer or raw text, wrap it
  return url; // fallback — caller should handle
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function base64ToFile(dataURL, filename = 'captcha.png') {
  const arr = dataURL.split(',');
  const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
  const bstr = atob(arr[1]);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new File([u8], filename, { type: mime });
}

function waitForImageLoad(img) {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
}
```

**Step 2: Create DOM utility**

Create `captcha/v2/src/core/utils/dom.js`:

```javascript
/**
 * Fill an input element's value, compatible with Vue 2/3, React, Angular.
 * Uses native setter to bypass framework interception.
 */
export function fillInput(el, value) {
  try {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(el, value);
  } catch (_e) {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));

  // Angular reactive forms need extra events
  if (el.hasAttribute('formcontrolname') || (el.className && el.className.includes('ng-'))) {
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
  }
}

/**
 * Get CSS selector path for an element (for caching/debugging).
 */
export function cssPath(el) {
  if (!(el instanceof Element)) return '';
  const parts = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      parts.unshift(selector + '#' + el.id);
      break;
    }
    let sib = el, nth = 1;
    while ((sib = sib.previousElementSibling)) {
      if (sib.nodeName.toLowerCase() === selector) nth++;
    }
    if (nth !== 1) selector += `:nth-of-type(${nth})`;
    parts.unshift(selector);
    el = el.parentNode;
  }
  return parts.join(' > ');
}

/**
 * Find the nearest text input to a captcha image element.
 * Searches upward through DOM ancestors, checking siblings and children.
 */
export function findNearestInput(imgEl) {
  let parent = imgEl.parentNode;
  let child = imgEl;

  for (let depth = 0; depth < 5; depth++) {
    if (!parent) return null;

    // Check UI framework containers first
    const frameworkInput = findFrameworkInput(imgEl, parent);
    if (frameworkInput) return frameworkInput;

    // Search previous siblings for inputs
    let node = child;
    while (node.previousElementSibling) {
      const prev = node.previousElementSibling;
      const input = findTextInput(prev);
      if (input) return input;
      node = prev;
    }

    // Search all inputs in parent, pick the one before the image
    const inputs = [...parent.querySelectorAll('input')];
    let best = null;
    for (const input of inputs) {
      if (isTextInput(input) && (input.compareDocumentPosition(imgEl) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        best = input;
      }
    }
    if (best) return best;

    child = parent;
    parent = parent.parentNode;
  }
  return null;
}

function findFrameworkInput(imgEl, parent) {
  // Element UI
  const elGroup = imgEl.closest('.el-input-group');
  if (elGroup) {
    const input = elGroup.querySelector('input[type="text"], input:not([type])');
    if (input) return input;
  }
  // Naive UI
  const nSuffix = imgEl.closest('.n-input__suffix');
  if (nSuffix) {
    const nInput = nSuffix.closest('.n-input');
    if (nInput) {
      return nInput.querySelector('input[placeholder*="验证码"]') ||
             nInput.querySelector('input.n-input__input-el[type="text"]');
    }
  }
  return null;
}

function findTextInput(el) {
  if (el.tagName === 'INPUT' && isTextInput(el)) return el;
  const inputs = el.querySelectorAll('input');
  for (let i = inputs.length - 1; i >= 0; i--) {
    if (isTextInput(inputs[i])) return inputs[i];
  }
  return null;
}

function isTextInput(el) {
  const type = el.getAttribute('type');
  return !type || type === 'text';
}
```

**Step 3: Create math expression parser**

Create `captcha/v2/src/core/utils/math-parser.js`:

```javascript
/**
 * Safe math expression parser for calculation captchas.
 * Supports: +, -, *, /, Chinese operators and numbers.
 * Does NOT use eval().
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
 * Attempt to parse a captcha text as a math expression and return the result.
 * Returns null if the text is not a math expression.
 *
 * Examples:
 *   "3+7=?"  → 10
 *   "12-5=?" → 7
 *   "3×7=?"  → 21
 *   "十二 减 五 等于 ?" → 7
 */
export function parseAndCalculate(text) {
  if (!text || typeof text !== 'string') return null;

  // Remove whitespace, "=", "?", "等于", "是多少", "得"
  let expr = text.replace(/\s+/g, '')
    .replace(/[=＝等于是多少得？?]/g, '')
    .trim();

  if (!expr) return null;

  // Normalize Chinese numbers to Arabic
  expr = chineseToArabic(expr);

  // Normalize operators
  for (const [from, to] of Object.entries(OPERATOR_MAP)) {
    if (from.length > 1) {
      expr = expr.replace(new RegExp(from, 'gi'), to);
    } else {
      expr = expr.split(from).join(to);
    }
  }

  // Validate: should only contain digits, operators, and decimal points
  if (!/^[\d+\-*/().]+$/.test(expr)) return null;

  // Parse and evaluate safely
  try {
    return evaluate(expr);
  } catch {
    return null;
  }
}

/**
 * Convert Chinese number string to Arabic number string.
 * Handles: 十二 → 12, 三百四十五 → 345, etc.
 */
function chineseToArabic(str) {
  // Replace simple single-character Chinese digits
  let result = str;
  // Handle compound numbers like 十二, 二十, 三百
  // Simple approach: replace known patterns
  result = result.replace(/([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?千([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?百([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?十([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])?/g,
    (_, q, h, t, u) => {
      return String(
        (q ? CHINESE_DIGITS[q] : 0) * 1000 +
        (h ? CHINESE_DIGITS[h] : 0) * 100 +
        (t ? CHINESE_DIGITS[t] : 0) * 10 +
        (u ? CHINESE_DIGITS[u] : 0)
      );
    });

  // Handle 十X (10+X)
  result = result.replace(/十([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])/g,
    (_, u) => String(10 + CHINESE_DIGITS[u]));
  result = result.replace(/([零一二三四五六七八九壹贰叁肆伍陆柒捌玖])十/g,
    (_, t) => String(CHINESE_DIGITS[t] * 10));
  result = result.replace(/十/g, '10');

  // Replace remaining single Chinese digits
  for (const [ch, num] of Object.entries(CHINESE_DIGITS)) {
    result = result.split(ch).join(String(num));
  }

  return result;
}

/**
 * Simple recursive-descent parser for arithmetic expressions.
 * Grammar: expr = term (('+' | '-') term)*
 *          term = factor (('*' | '/') factor)*
 *          factor = NUMBER | '(' expr ')'
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
      result = op === '*' ? result * right : result / right;
    }
    return result;
  }

  function parseFactor() {
    if (expr[pos] === '(') {
      pos++; // skip '('
      const result = parseExpr();
      pos++; // skip ')'
      return result;
    }
    // Parse number (including negative)
    const start = pos;
    if (expr[pos] === '-') pos++;
    while (pos < expr.length && (expr[pos] >= '0' && expr[pos] <= '9' || expr[pos] === '.')) pos++;
    return parseFloat(expr.slice(start, pos));
  }

  const result = parseExpr();
  if (!isFinite(result)) return null;
  return Math.round(result * 100) / 100; // Round to 2 decimal places
}
```

**Step 4: Commit**

```bash
git add captcha/v2/src/core/utils/
git commit -m "feat(v2): core utility modules (image, dom, math-parser)"
```

---

## Task 4: Core — Handler System (Base + Detector + Solver) ✅

**Files:**
- Create: `captcha/v2/src/core/handlers/base.js`
- Create: `captcha/v2/src/core/detector.js`
- Create: `captcha/v2/src/core/solver.js`
- Create: `captcha/v2/src/core/config.js`

**Step 1: Create handler base class**

Create `captcha/v2/src/core/handlers/base.js`:

```javascript
/**
 * Base class for all captcha handlers.
 * Each handler implements detect() and solve().
 */
export class CaptchaHandler {
  /** Human-readable name for logging */
  get name() { return 'base'; }

  /** Priority: lower = checked first. OCR=10, Calc=5, Slider=20 */
  get priority() { return 100; }

  /**
   * Scan the document for captchas this handler can solve.
   * @param {Document} doc
   * @returns {Array<{img: Element, input: Element|null, type: string, meta?: object}>}
   */
  detect(doc) { return []; }

  /**
   * Solve a detected captcha.
   * @param {object} captchaInfo — one item from detect()
   * @param {object} api — { requestBackend(endpoint, body) }
   * @returns {Promise<string|number|null>} — the answer, or null on failure
   */
  async solve(captchaInfo, api) { return null; }
}
```

**Step 2: Create config module**

Create `captcha/v2/src/core/config.js`:

```javascript
import { getPlatform } from './platform.js';

const CONFIG_KEY = 'captchaHelperV2Config';

const DEFAULTS = {
  backendUrl: 'http://localhost:9876',
  enabledHandlers: ['ocr', 'calc', 'slider'],
  autoFill: true,
  debug: false,
};

let _config = null;

export function getConfig() {
  if (!_config) {
    const platform = getPlatform();
    const stored = platform.storage.get(CONFIG_KEY, {});
    // storage.get may return a Promise (extension) or value (TM)
    if (stored && typeof stored.then === 'function') {
      // Async path — caller must await initConfig() first
      _config = { ...DEFAULTS };
    } else {
      _config = { ...DEFAULTS, ...stored };
    }
  }
  return _config;
}

export async function initConfig() {
  const platform = getPlatform();
  const stored = await Promise.resolve(platform.storage.get(CONFIG_KEY, {}));
  _config = { ...DEFAULTS, ...stored };
  return _config;
}

export async function saveConfig(updates) {
  _config = { ..._config, ...updates };
  const platform = getPlatform();
  await Promise.resolve(platform.storage.set(CONFIG_KEY, _config));
}
```

**Step 3: Create detector engine**

Create `captcha/v2/src/core/detector.js`:

```javascript
/**
 * CaptchaDetector: scans the page using registered handlers.
 * Handlers are tried in priority order; first match wins.
 */
export class CaptchaDetector {
  constructor() {
    this.handlers = [];
  }

  register(handler) {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Scan the document for captchas.
   * @returns {{ handler: CaptchaHandler, results: Array } | null}
   */
  scan(doc = document) {
    for (const handler of this.handlers) {
      try {
        const results = handler.detect(doc);
        if (results && results.length > 0) {
          return { handler, results };
        }
      } catch (err) {
        console.warn(`[CaptchaHelper] Handler "${handler.name}" detect() error:`, err);
      }
    }
    return null;
  }
}
```

**Step 4: Create solver (orchestrator)**

Create `captcha/v2/src/core/solver.js`:

```javascript
import { getConfig } from './config.js';
import { getPlatform } from './platform.js';
import { fillInput } from './utils/dom.js';

/**
 * Solver: orchestrates detection → backend call → result fill.
 */
export class CaptchaSolver {
  constructor(detector) {
    this.detector = detector;
    this.processedCache = new Set(); // avoid re-processing same captcha
  }

  /**
   * Call the backend API.
   */
  async requestBackend(endpoint, body) {
    const config = getConfig();
    const platform = getPlatform();
    const url = `${config.backendUrl}${endpoint}`;

    const res = await platform.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (res.status !== 200) {
      throw new Error(data.error || `Backend error: ${res.status}`);
    }
    return data;
  }

  /**
   * Run one detection + solve cycle.
   */
  async run() {
    const scanResult = this.detector.scan();
    if (!scanResult) return;

    const { handler, results } = scanResult;
    const config = getConfig();
    const api = { requestBackend: this.requestBackend.bind(this) };

    for (const captchaInfo of results) {
      // Cache key: use image src or element reference
      const cacheKey = captchaInfo.img?.src || captchaInfo.img?.outerHTML?.slice(-80);
      if (this.processedCache.has(cacheKey)) continue;
      this.processedCache.add(cacheKey);

      try {
        const answer = await handler.solve(captchaInfo, api);
        if (answer != null && captchaInfo.input && config.autoFill) {
          fillInput(captchaInfo.input, String(answer));
          console.log(`[CaptchaHelper] ${handler.name}: filled "${answer}"`);
        }
      } catch (err) {
        console.error(`[CaptchaHelper] ${handler.name} solve error:`, err);
      }
    }
  }

  /** Clear cache (e.g., when captcha image refreshes) */
  clearCache() {
    this.processedCache.clear();
  }
}
```

**Step 5: Commit**

```bash
git add captcha/v2/src/core/handlers/base.js captcha/v2/src/core/config.js \
      captcha/v2/src/core/detector.js captcha/v2/src/core/solver.js
git commit -m "feat(v2): core handler system (base, detector, solver, config)"
```

---

## Task 5: Core — OCR Handler ✅

**Files:**
- Create: `captcha/v2/src/core/handlers/ocr.js`

**Step 1: Implement OCR handler**

Create `captcha/v2/src/core/handlers/ocr.js`:

```javascript
import { CaptchaHandler } from './base.js';
import { imgToBase64, base64ToFile } from '../utils/image.js';
import { findNearestInput } from '../utils/dom.js';

/**
 * CAPTCHA_SRC_PATTERNS: URL patterns that indicate a captcha image.
 * Migrated from browser_capture.js line 732.
 */
const CAPTCHA_SRC_RE = /createimage|captcha|verify|checkcode|validatecode|rand|vcode|authcode|kaptcha|imagecode|seccode|piccode|yzm|verifycode|picvalidcode/i;

const CAPTCHA_ATTR_RE = /code|captcha|验证码|login|点击|verify|yzm|yanzhengma|换一张|security|challenge|kaptcha|seccode|piccode/i;

const EXCLUDE_SRC_RE = /personalcenter|personal|gzh|qrcode|二维码|app\.png|logo|icon|avatar|header|banner/i;

export class OcrHandler extends CaptchaHandler {
  get name() { return 'ocr'; }
  get priority() { return 10; }

  detect(doc) {
    const results = [];
    const imgs = [...doc.querySelectorAll('img')];

    for (const img of imgs) {
      const src = img.getAttribute('src') || '';
      if (!src || src === '#' || src === 'about:blank') continue;
      if (EXCLUDE_SRC_RE.test(src)) continue;

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      let isCaptcha = false;

      // Check src pattern
      if (CAPTCHA_SRC_RE.test(src)) {
        isCaptcha = true;
      }

      // Check element UI / Naive UI containers
      if (!isCaptcha && src.startsWith('data:image/')) {
        if (img.closest('.el-input-group__append') || img.closest('.n-input__suffix')) {
          isCaptcha = true;
        }
      }

      // Check attributes
      if (!isCaptcha) {
        const attrs = [img.id, img.className, img.alt, src, img.name, img.title].filter(Boolean);
        if (attrs.some(a => CAPTCHA_ATTR_RE.test(String(a)))) {
          if (w > 10 && w < 600 && h > 10 && h < 300 && w / h >= 0.8) {
            isCaptcha = true;
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

  async solve(captchaInfo, api) {
    const base64 = await imgToBase64(captchaInfo.img);
    // Strip data URI prefix for backend
    const imageData = base64.includes(',') ? base64.split(',')[1] : base64;
    const res = await api.requestBackend('/api/ocr', { image: base64 });
    return res.text || res.result || null;
  }
}
```

**Step 2: Commit**

```bash
git add captcha/v2/src/core/handlers/ocr.js
git commit -m "feat(v2): OCR captcha handler (migrated detection logic)"
```

---

## Task 6: Core — Calculation Handler ✅

**Files:**
- Create: `captcha/v2/src/core/handlers/calc.js`

**Step 1: Implement calc handler**

Create `captcha/v2/src/core/handlers/calc.js`:

```javascript
import { CaptchaHandler } from './base.js';
import { imgToBase64 } from '../utils/image.js';
import { findNearestInput } from '../utils/dom.js';
import { parseAndCalculate } from '../utils/math-parser.js';

const CALC_PATTERNS = /[+\-×÷加减乘除＋－].*[=＝等于？?]/;

export class CalcHandler extends CaptchaHandler {
  get name() { return 'calc'; }
  get priority() { return 5; } // Higher priority than OCR — check first

  detect(doc) {
    // Calc captchas look like OCR captchas visually.
    // We detect them the same way, but solve differently.
    // Detection is deferred to solve phase: OCR first, then check if result is math.
    // So detect() returns nothing — CalcHandler is used as a post-processor.
    return [];
  }

  /**
   * Called by OcrHandler as a post-processing step.
   * If OCR result looks like a math expression, calculate and return the answer.
   */
  tryCalculate(ocrText) {
    if (!ocrText) return null;
    if (!CALC_PATTERNS.test(ocrText)) return null;
    return parseAndCalculate(ocrText);
  }
}
```

Update `captcha/v2/src/core/handlers/ocr.js` solve method to integrate calc:

```javascript
// In OcrHandler.solve(), after getting OCR result:
async solve(captchaInfo, api) {
  const base64 = await imgToBase64(captchaInfo.img);
  const res = await api.requestBackend('/api/ocr', { image: base64 });
  const ocrText = res.text || res.result || '';

  // Check if it's a calculation captcha
  const calcResult = this._calcHandler.tryCalculate(ocrText);
  if (calcResult !== null) {
    console.log(`[CaptchaHelper] Calc detected: "${ocrText}" → ${calcResult}`);
    return calcResult;
  }

  return ocrText || null;
}
```

Note: The OcrHandler constructor should accept a CalcHandler instance:

```javascript
constructor(calcHandler = null) {
  super();
  this._calcHandler = calcHandler || new CalcHandler();
}
```

**Step 2: Commit**

```bash
git add captcha/v2/src/core/handlers/calc.js captcha/v2/src/core/handlers/ocr.js
git commit -m "feat(v2): calculation captcha handler (OCR + math parser)"
```

---

## Task 7: Core — Slider Handler ✅

**Files:**
- Create: `captcha/v2/src/core/handlers/slider.js`

**Step 1: Implement slider handler with human-like drag**

Create `captcha/v2/src/core/handlers/slider.js`:

```javascript
import { CaptchaHandler } from './base.js';
import { imgToBase64 } from '../utils/image.js';

export class SliderHandler extends CaptchaHandler {
  get name() { return 'slider'; }
  get priority() { return 20; }

  detect(doc) {
    // Slider captchas are manually configured by the user.
    // Auto-detection is complex and site-specific.
    // For now, rely on user configuration (stored path).
    return [];
  }

  /**
   * Solve a slider captcha given target/bg images and the drag handle element.
   */
  async solve(captchaInfo, api) {
    const { targetImg, bgImg, moveItem, bgWidth } = captchaInfo;

    const targetBase64 = await imgToBase64(targetImg);
    const bgBase64 = await imgToBase64(bgImg);

    const res = await api.requestBackend('/api/slide', {
      target: targetBase64,
      background: bgBase64,
      bg_width: bgWidth || 0,
    });

    const distance = res.x || 0;
    if (distance > 0 && moveItem) {
      await this.simulateDrag(moveItem, targetImg, distance);
    }
    return distance;
  }

  /**
   * Simulate human-like drag with Bezier curve trajectory.
   */
  async simulateDrag(handle, target, distance) {
    const rect = handle.getBoundingClientRect();
    const startX = rect.x + rect.width / 2;
    const startY = rect.y + rect.height / 2;

    // Generate trajectory points using cubic Bezier
    const points = this.generateTrajectory(distance);

    // Mouse down
    handle.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true, clientX: startX, clientY: startY,
    }));

    // Animate through points
    for (const point of points) {
      await sleep(point.dt);
      const x = startX + point.x;
      const y = startY + point.y;
      handle.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, clientX: x, clientY: y,
      }));
    }

    // Small overshoot and correction
    const overshoot = 2 + Math.random() * 4;
    handle.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: startX + distance + overshoot,
      clientY: startY + (Math.random() - 0.5) * 2,
    }));
    await sleep(50 + Math.random() * 100);
    handle.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: startX + distance,
      clientY: startY,
    }));

    // Mouse up with random delay
    await sleep(100 + Math.random() * 300);
    handle.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      clientX: startX + distance,
      clientY: startY,
    }));
  }

  /**
   * Generate trajectory points using easing (fast start, slow end).
   */
  generateTrajectory(distance) {
    const points = [];
    const steps = 20 + Math.floor(Math.random() * 15);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Ease-out cubic: fast start, slow end
      const eased = 1 - Math.pow(1 - t, 3);
      const x = distance * eased;
      const y = (Math.random() - 0.5) * 3; // slight Y jitter
      const dt = 8 + Math.random() * 12; // 8-20ms per step
      points.push({ x, y, dt });
    }
    return points;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Step 2: Commit**

```bash
git add captcha/v2/src/core/handlers/slider.js
git commit -m "feat(v2): slider captcha handler with human-like drag simulation"
```

---

## Task 8: Core — Main Entry (Bootstrap) ✅

**Files:**
- Create: `captcha/v2/src/core/index.js`

**Step 1: Create core bootstrap**

Create `captcha/v2/src/core/index.js`:

```javascript
import { CaptchaDetector } from './detector.js';
import { CaptchaSolver } from './solver.js';
import { initConfig } from './config.js';
import { OcrHandler } from './handlers/ocr.js';
import { CalcHandler } from './handlers/calc.js';
import { SliderHandler } from './handlers/slider.js';

/**
 * Initialize the captcha helper core.
 * Call this after setPlatform() has been called.
 */
export async function createCaptchaHelper() {
  const config = await initConfig();

  const detector = new CaptchaDetector();
  const calcHandler = new CalcHandler();
  const ocrHandler = new OcrHandler(calcHandler);
  const sliderHandler = new SliderHandler();

  detector.register(ocrHandler);
  detector.register(sliderHandler);
  // CalcHandler is used as a post-processor inside OcrHandler, not registered directly

  const solver = new CaptchaSolver(detector);

  return {
    detector,
    solver,
    config,
    /** Run one scan+solve cycle */
    run: () => solver.run(),
    /** Clear processed cache (call when captcha refreshes) */
    clearCache: () => solver.clearCache(),
  };
}

/**
 * Set up MutationObserver to auto-detect captchas on DOM changes.
 */
export function observeDOM(helper) {
  const CAPTCHA_RE = /code|captcha|验证码|verify|yzm|slide/i;
  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;

    for (const mutation of mutations) {
      // New img elements inserted
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.tagName === 'IMG') {
            shouldCheck = true;
            helper.clearCache();
            break;
          }
        }
      }
      // img src changed
      if (mutation.type === 'attributes' && mutation.attributeName === 'src' &&
          mutation.target.tagName === 'IMG') {
        shouldCheck = true;
        helper.clearCache();
      }
      // Check attributes for captcha-related changes
      if (!shouldCheck) {
        const el = mutation.target;
        const attrs = [el.id, el.className, el.getAttribute?.('alt'), el.getAttribute?.('src')].filter(Boolean);
        if (attrs.some(a => CAPTCHA_RE.test(String(a)))) {
          shouldCheck = true;
        }
      }
      if (shouldCheck) break;
    }

    if (shouldCheck) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => helper.run(), 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  return observer;
}
```

**Step 2: Commit**

```bash
git add captcha/v2/src/core/index.js
git commit -m "feat(v2): core bootstrap and DOM observer"
```

---

## Task 9: Chrome Extension ✅

**Files:**
- Create: `captcha/v2/src/extension/manifest.json`
- Create: `captcha/v2/src/extension/content.js`
- Create: `captcha/v2/src/extension/background.js`
- Create: `captcha/v2/src/extension/popup.html`
- Create: `captcha/v2/src/extension/popup.js`

**Step 1: Create manifest.json (MV3)**

Create `captcha/v2/src/extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "验证码识别助手 v2",
  "version": "2.0.0",
  "description": "自动识别并填入文字、计算、滑块验证码",
  "permissions": ["storage", "activeTab", "notifications"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "all_frames": true,
      "run_at": "document_end"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "验证码识别助手"
  }
}
```

**Step 2: Create content.js (extension entry)**

Create `captcha/v2/src/extension/content.js`:

```javascript
import { setPlatform, createExtensionAdapter } from '../core/platform.js';
import { createCaptchaHelper, observeDOM } from '../core/index.js';

(async () => {
  setPlatform(createExtensionAdapter());
  const helper = await createCaptchaHelper();

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => helper.run());
  } else {
    helper.run();
  }

  // Observe DOM changes
  observeDOM(helper);

  // Retry scans for SPA async rendering
  [1000, 2000, 3000, 5000].forEach(delay => {
    setTimeout(() => helper.run(), delay);
  });
})();
```

**Step 3: Create background.js**

Create `captcha/v2/src/extension/background.js`:

```javascript
// Service worker — handles extension lifecycle events.
// Phase 1: minimal. Phase 2: will handle iframe message routing.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CaptchaHelper] Extension installed');
});
```

**Step 4: Create popup.html and popup.js**

Create `captcha/v2/src/extension/popup.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { width: 320px; padding: 16px; font-family: system-ui, sans-serif; font-size: 14px; }
    h3 { margin: 0 0 12px; }
    label { display: block; margin: 8px 0 4px; font-weight: 500; }
    input[type="text"] { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
    button { margin-top: 12px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #5a6fd6; }
    .status { margin-top: 8px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h3>验证码识别助手 v2</h3>
  <label>后端服务地址</label>
  <input type="text" id="backendUrl" placeholder="http://localhost:9876">
  <button id="save">保存</button>
  <div class="status" id="status"></div>
  <script src="popup.js"></script>
</body>
</html>
```

Create `captcha/v2/src/extension/popup.js`:

```javascript
const urlInput = document.getElementById('backendUrl');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

chrome.storage.local.get('captchaHelperV2Config', (result) => {
  const config = result.captchaHelperV2Config || {};
  urlInput.value = config.backendUrl || 'http://localhost:9876';
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.get('captchaHelperV2Config', (result) => {
    const config = result.captchaHelperV2Config || {};
    config.backendUrl = urlInput.value.trim();
    chrome.storage.local.set({ captchaHelperV2Config: config }, () => {
      statusEl.textContent = '已保存';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    });
  });
});
```

**Step 5: Commit**

```bash
git add captcha/v2/src/extension/
git commit -m "feat(v2): Chrome extension (MV3 manifest, content script, popup)"
```

---

## Task 10: Tampermonkey Entry ✅

**Files:**
- Create: `captcha/v2/src/tampermonkey/entry.js`

**Step 1: Create Tampermonkey entry**

Create `captcha/v2/src/tampermonkey/entry.js`:

```javascript
import { setPlatform, createTampermonkeyAdapter } from '../core/platform.js';
import { createCaptchaHelper, observeDOM } from '../core/index.js';

(async () => {
  // Bridge GM_* APIs into the platform adapter
  setPlatform(createTampermonkeyAdapter({
    GM_xmlhttpRequest,
    GM_setValue,
    GM_getValue,
    GM_deleteValue,
    GM_notification,
    GM_registerMenuCommand,
    GM_addStyle,
  }));

  const helper = await createCaptchaHelper();

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => helper.run());
  } else {
    helper.run();
  }

  observeDOM(helper);

  // SPA retry
  [1000, 2000, 3000, 5000].forEach(delay => {
    setTimeout(() => helper.run(), delay);
  });

  // Register menu commands
  GM_registerMenuCommand('⚙️ 配置验证码助手', () => {
    const url = prompt('后端服务地址:', helper.config.backendUrl);
    if (url) {
      const { saveConfig } = require('../core/config.js');
      saveConfig({ backendUrl: url });
    }
  });
})();
```

**Step 2: Commit**

```bash
git add captcha/v2/src/tampermonkey/
git commit -m "feat(v2): Tampermonkey entry with GM_* adapter"
```

---

## Task 11: Backend — FastAPI Rewrite ✅

**Files:**
- Create: `captcha/v2/backend/main.py`
- Create: `captcha/v2/backend/config.py`
- Create: `captcha/v2/backend/routers/ocr.py`
- Create: `captcha/v2/backend/routers/slide.py`
- Create: `captcha/v2/backend/routers/classify.py`
- Create: `captcha/v2/backend/providers/base.py`
- Create: `captcha/v2/backend/providers/ddddocr_provider.py`
- Create: `captcha/v2/backend/preprocessing/image.py`
- Create: `captcha/v2/backend/requirements.txt`

**Step 1: Create requirements.txt**

Create `captcha/v2/backend/requirements.txt`:

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
ddddocr>=1.4.0
Pillow>=10.0.0
pydantic>=2.0.0
python-multipart>=0.0.6
pyyaml>=6.0
```

**Step 2: Create config**

Create `captcha/v2/backend/config.py`:

```python
from pydantic import BaseModel
import yaml
import os

class ProviderConfig(BaseModel):
    ocr: str = "ddddocr"
    slide: str = "ddddocr"
    classify: str = "openai"  # Phase 2

class Settings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 9876
    debug: bool = False
    providers: ProviderConfig = ProviderConfig()

def load_settings() -> Settings:
    config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
    if os.path.exists(config_path):
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}
        return Settings(**data)
    return Settings()

settings = load_settings()
```

**Step 3: Create provider base and ddddocr provider**

Create `captcha/v2/backend/providers/base.py`:

```python
from abc import ABC, abstractmethod

class BaseProvider(ABC):
    @abstractmethod
    async def recognize_text(self, image_bytes: bytes) -> dict:
        """Return {"text": "...", "confidence": 0.0}"""
        ...

    @abstractmethod
    async def detect_slide_gap(self, target: bytes, background: bytes, bg_width: int = 0) -> dict:
        """Return {"x": int, "y": int}"""
        ...

    async def classify_images(self, images: list[bytes], question: str) -> dict:
        """Phase 2: Return {"selected": [int]}"""
        raise NotImplementedError("Image classification not available in this provider")
```

Create `captcha/v2/backend/providers/ddddocr_provider.py`:

```python
import ddddocr
from PIL import Image
import io
from .base import BaseProvider
from ..preprocessing.image import get_candidates

class DdddocrProvider(BaseProvider):
    def __init__(self):
        try:
            self.ocr = ddddocr.DdddOcr(beta=True, show_ad=False)
        except Exception:
            self.ocr = ddddocr.DdddOcr(show_ad=False)

        self.det = ddddocr.DdddOcr(det=False, ocr=False, show_ad=False)

    async def recognize_text(self, image_bytes: bytes) -> dict:
        from collections import Counter

        candidates = get_candidates(image_bytes)
        results = []
        for candidate in candidates:
            try:
                text = self.ocr.classification(candidate)
                if text:
                    results.append(text)
            except Exception:
                pass

        if not results:
            text = self.ocr.classification(image_bytes)
            return {"text": text, "confidence": 0.5}

        vote = Counter(results)
        best = vote.most_common(1)[0]
        confidence = best[1] / len(results)
        return {"text": best[0], "confidence": round(confidence, 2)}

    async def detect_slide_gap(self, target: bytes, background: bytes, bg_width: int = 0) -> dict:
        result = self.det.slide_match(target, background, simple_target=True)

        if not result or "target" not in result:
            return {"x": 0, "y": 0}

        x = result["target"][0]
        y = result["target"][1]

        # Scale coordinates if display width differs from image width
        if bg_width > 0:
            bg_img = Image.open(io.BytesIO(background))
            original_width = bg_img.width
            if original_width > 0:
                scale = bg_width / original_width
                x = int(x * scale)
                y = int(y * scale)

        return {"x": x, "y": y}
```

**Step 4: Migrate image preprocessing**

Create `captcha/v2/backend/preprocessing/image.py`:

Migrate the `_get_candidates()` function and helpers from `captcha/backend/recognize_captcha.py` lines 108-262. The logic is identical — copy `_composite_white_bg`, `_scale_up`, `_binarize`, `_morphological_open`, `_otsu_threshold`, and `_get_candidates` as-is, renaming `_get_candidates` to `get_candidates`.

```python
# Copy from captcha/backend/recognize_captcha.py lines 108-262
# Functions: _composite_white_bg, _scale_up, _binarize, _morphological_open,
#            _otsu_threshold, get_candidates (renamed from _get_candidates)
from PIL import Image, ImageEnhance, ImageOps, ImageFilter
import io

# ... (exact copy of the preprocessing functions from the existing codebase)
# See captcha/backend/recognize_captcha.py:108-262 for full implementation
```

**Step 5: Create API routers**

Create `captcha/v2/backend/routers/ocr.py`:

```python
from fastapi import APIRouter
import base64
from ..providers.ddddocr_provider import DdddocrProvider

router = APIRouter(prefix="/api")
provider = DdddocrProvider()

def parse_base64(image_str: str) -> bytes:
    if "," in image_str:
        image_str = image_str.split(",", 1)[1]
    return base64.b64decode(image_str)

@router.post("/ocr")
async def recognize_ocr(body: dict):
    image_b64 = body.get("image", "")
    if not image_b64:
        return {"error": "Missing 'image' field"}, 400
    image_bytes = parse_base64(image_b64)
    result = await provider.recognize_text(image_bytes)
    return result
```

Create `captcha/v2/backend/routers/slide.py`:

```python
from fastapi import APIRouter
import base64
from ..providers.ddddocr_provider import DdddocrProvider

router = APIRouter(prefix="/api")
provider = DdddocrProvider()

def parse_base64(image_str: str) -> bytes:
    if "," in image_str:
        image_str = image_str.split(",", 1)[1]
    return base64.b64decode(image_str)

@router.post("/slide")
async def detect_slide(body: dict):
    target_b64 = body.get("target", "")
    bg_b64 = body.get("background", "")
    bg_width = body.get("bg_width", 0)
    if not target_b64 or not bg_b64:
        return {"error": "Missing 'target' or 'background' field"}, 400
    target_bytes = parse_base64(target_b64)
    bg_bytes = parse_base64(bg_b64)
    result = await provider.detect_slide_gap(target_bytes, bg_bytes, bg_width)
    return result
```

Create `captcha/v2/backend/routers/classify.py`:

```python
from fastapi import APIRouter

router = APIRouter(prefix="/api")

@router.post("/classify")
async def classify_images(body: dict):
    """Phase 2: Image classification for hCaptcha/reCAPTCHA."""
    return {"error": "Not implemented yet. Coming in Phase 2.", "selected": []}
```

**Step 6: Create FastAPI main app**

Create `captcha/v2/backend/main.py`:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import ocr, slide, classify

app = FastAPI(title="Captcha Recognition Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr.router)
app.include_router(slide.router)
app.include_router(classify.router)

@app.get("/health")
async def health():
    return {
        "service": "running",
        "version": "2.0.0",
        "providers": {
            "ocr": settings.providers.ocr,
            "slide": settings.providers.slide,
            "classify": settings.providers.classify,
        },
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("captcha.v2.backend.main:app", host=settings.host, port=settings.port, reload=settings.debug)
```

**Step 7: Add `__init__.py` files**

Create empty `__init__.py` in:
- `captcha/v2/backend/__init__.py`
- `captcha/v2/backend/routers/__init__.py`
- `captcha/v2/backend/providers/__init__.py`
- `captcha/v2/backend/preprocessing/__init__.py`

**Step 8: Commit**

```bash
git add captcha/v2/backend/
git commit -m "feat(v2): FastAPI backend with provider abstraction and OCR/slide routers"
```

---

## Task 12: Verify Build & Smoke Test ✅

**Step 1: Build frontend**

```bash
cd captcha/v2
npm install
npm run build
```

Expected output:
```
[build] Extension → dist/extension/
[build] Tampermonkey → dist/captcha-helper.user.js
```

Verify files exist:
- `dist/extension/manifest.json`
- `dist/extension/content.js`
- `dist/captcha-helper.user.js`

**Step 2: Start backend**

```bash
cd captcha/v2/backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 9876 --reload
```

**Step 3: Test health endpoint**

```bash
curl http://localhost:9876/health
```

Expected: `{"service":"running","version":"2.0.0",...}`

**Step 4: Test OCR endpoint with a sample image**

```bash
# Use an existing test image or base64 string
curl -X POST http://localhost:9876/api/ocr \
  -H "Content-Type: application/json" \
  -d '{"image": "<base64-of-a-captcha-image>"}'
```

Expected: `{"text": "AB12", "confidence": 0.8}`

**Step 5: Load Chrome extension**

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked" → select `captcha/v2/dist/extension/`
4. Navigate to a site with a captcha
5. Verify console shows `[CaptchaHelper]` logs

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(v2): Phase 1 complete — universal captcha helper v2"
```

---

## Summary

| Task | Component | Files | Estimated Effort |
|------|-----------|-------|-----------------|
| 1 | Scaffolding + Build | 3 files | Small |
| 2 | Platform Abstraction | 1 file | Small |
| 3 | Utils (image, dom, math) | 3 files | Medium |
| 4 | Handler System | 4 files | Medium |
| 5 | OCR Handler | 1 file | Small |
| 6 | Calc Handler | 1 file | Small |
| 7 | Slider Handler | 1 file | Medium |
| 8 | Core Bootstrap | 1 file | Small |
| 9 | Chrome Extension | 5 files | Medium |
| 10 | Tampermonkey Entry | 1 file | Small |
| 11 | FastAPI Backend | 10+ files | Large |
| 12 | Build & Smoke Test | — | Small |

**Total: ~30 files, 12 tasks**

Dependencies: Task 1 → 2 → 3 → 4 → 5,6,7 (parallel) → 8 → 9,10 (parallel) → 11 → 12
