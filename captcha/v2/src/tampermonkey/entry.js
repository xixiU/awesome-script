/**
 * Tampermonkey 入口
 * 通过 GM_* API 初始化平台适配器，启动验证码助手
 */
import { platform } from '../core/platform.js';
import { createCaptchaHelper } from '../core/index.js';
import { saveConfig, getConfig } from '../core/config.js';

(async () => {
  try {
    const helper = await createCaptchaHelper();

    // 初始扫描
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => helper.run());
    } else {
      await helper.run();
    }

    // 启动 DOM 观察器
    helper.startObserver();

    // SPA 延迟重试
    const delays = [1000, 2000, 3000, 5000];
    for (const delay of delays) {
      setTimeout(() => {
        helper.run().catch(err => {
          console.warn('[CaptchaHelper] 延迟扫描出错:', err);
        });
      }, delay);
    }

    // 注册菜单命令
    if (typeof GM_registerMenuCommand !== 'undefined') {
      GM_registerMenuCommand('⚙️ 配置后端地址', () => {
        const current = getConfig();
        const url = prompt('后端服务地址:', current.backendUrl);
        if (url && url.trim()) {
          saveConfig({ backendUrl: url.trim() }).then(() => {
            alert('配置已保存，刷新页面生效');
          });
        }
      });

      GM_registerMenuCommand('🤖 配置 AI Provider', () => {
        const current = getConfig();
        const providers = ['ddddocr', 'openai', 'local'];
        const choice = prompt(
          `选择 AI Provider:\n1. ddddocr（本地 OCR）\n2. openai（GPT-4o）\n3. local（Ollama）\n\n当前: ${current.provider}`,
          providers.indexOf(current.provider) + 1
        );
        const index = parseInt(choice) - 1;
        if (index >= 0 && index < providers.length) {
          const provider = providers[index];
          const updates = { provider };

          if (provider === 'openai') {
            const apiKey = prompt('输入 OpenAI API Key:', current.apiKey || '');
            if (apiKey) {
              updates.apiKey = apiKey.trim();
            }
          }

          saveConfig(updates).then(() => {
            alert('配置已保存，刷新页面生效');
          });
        }
      });

      GM_registerMenuCommand('🔄 立即识别验证码', () => {
        helper.run().catch(err => {
          console.error('[CaptchaHelper] 手动识别出错:', err);
        });
      });
    }

    console.log('[CaptchaHelper] Tampermonkey 脚本已启动');
  } catch (err) {
    console.error('[CaptchaHelper] 初始化失败:', err);
  }
})();
