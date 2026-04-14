/**
 * DOM 工具函数
 * 兼容各主流前端框架（Vue 2/3, React, Angular, Naive UI, Element UI）的输入框填值
 */

/**
 * 向输入框填入值，兼容 Angular / Vue 3 / React / 原生表单
 * 通过 nativeInputValueSetter 绕过框架对 value 属性的拦截，并触发完整事件链
 * @param {HTMLInputElement} el
 * @param {string} value
 */
export function fillInput(el, value) {
  try {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(el, value);
  } catch (e) {
    el.value = value;
  }

  // 触发完整事件链
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));

  // Angular reactive forms 需要额外事件
  if (el.hasAttribute('formcontrolname') || (el.className && el.className.includes('ng-'))) {
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
  }
}

/**
 * 查找距离验证码图片最近的文本输入框
 * 向上遍历 DOM 树，检查兄弟节点和子节点
 * @param {HTMLImageElement} imgEl
 * @returns {HTMLInputElement|null}
 */
export function findNearestInput(imgEl) {
  // 先检查 UI 框架专用容器
  const frameworkInput = findFrameworkInput(imgEl);
  if (frameworkInput) return frameworkInput;

  let parent = imgEl.parentNode;
  let child = imgEl;

  for (let depth = 0; depth < 5; depth++) {
    if (!parent || parent === document.body) return null;

    // 遍历前驱兄弟节点查找输入框
    let node = child;
    while (node.previousElementSibling) {
      const prev = node.previousElementSibling;
      const input = findTextInput(prev);
      if (input) return input;
      node = prev;
    }

    // 在父节点的所有子孙中找位于图片前面的输入框
    const inputs = [...parent.querySelectorAll('input')];
    let best = null;
    for (const input of inputs) {
      if (isTextInput(input) &&
          (input.compareDocumentPosition(imgEl) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        best = input;
      }
    }
    if (best) return best;

    child = parent;
    parent = parent.parentNode;
  }

  return null;
}

/**
 * 在 UI 框架专属容器中查找输入框
 * @param {HTMLElement} imgEl
 * @returns {HTMLInputElement|null}
 */
function findFrameworkInput(imgEl) {
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

  // Arco Design
  const arcoSuffix = imgEl.closest('.arco-input-suffix');
  if (arcoSuffix) {
    const arcoWrapper = arcoSuffix.closest('.arco-input-wrapper');
    if (arcoWrapper) {
      return arcoWrapper.querySelector('input.arco-input');
    }
  }

  return null;
}

/**
 * 在元素自身或其子孙中查找文本输入框
 * @param {HTMLElement} el
 * @returns {HTMLInputElement|null}
 */
function findTextInput(el) {
  if (el.tagName === 'INPUT' && isTextInput(el)) return el;
  const inputs = el.querySelectorAll('input');
  for (let i = inputs.length - 1; i >= 0; i--) {
    if (isTextInput(inputs[i])) return inputs[i];
  }
  return null;
}

/**
 * 判断是否为文本类输入框
 * @param {HTMLInputElement} el
 * @returns {boolean}
 */
function isTextInput(el) {
  const type = (el.getAttribute('type') || '').toLowerCase();
  return !type || type === 'text' || type === 'search';
}
