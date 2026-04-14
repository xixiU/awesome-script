/**
 * 图片处理工具
 * 将 img 元素或 URL 转换为 base64
 */
import { platform } from '../platform.js';

/**
 * 将 img 元素转换为 base64 数据 URL
 * @param {HTMLImageElement} imgEl
 * @returns {Promise<string>} base64 data URL
 */
export async function imgToBase64(imgEl) {
  // 如果已经是 base64，直接返回
  if (imgEl.src && imgEl.src.startsWith('data:image/')) {
    return imgEl.src;
  }

  // 先等图片加载完毕
  await waitForImageLoad(imgEl);

  // 尝试 canvas 方法（同源图片）
  try {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth || imgEl.width;
    canvas.height = imgEl.naturalHeight || imgEl.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    // canvas 被污染（跨域图片）
    console.warn('[CaptchaHelper] Canvas tainted, trying GM_xmlhttpRequest');
  }

  // 通过平台接口绕过 CORS 获取图片
  return await fetchImageAsBase64(imgEl.src);
}

/**
 * 通过 URL 获取图片并转为 base64
 * @param {string} url
 * @returns {Promise<string>} base64 data URL
 */
export async function fetchImageAsBase64(url) {
  const blob = await platform.request({
    method: 'GET',
    url: url,
    responseType: 'blob'
  });
  return await blobToBase64(blob);
}

/**
 * Blob 转 base64 data URL
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 等待图片加载完毕
 * @param {HTMLImageElement} img
 * @returns {Promise<void>}
 */
function waitForImageLoad(img) {
  if (img.complete && img.naturalWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Image load timeout')), 5000);
    img.onload = () => { clearTimeout(timeout); resolve(); };
    img.onerror = () => { clearTimeout(timeout); reject(new Error('Image load error')); };
  });
}
