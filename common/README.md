# 通用配置管理模块

提供配置管理、国际化（i18n）支持、可视化配置面板等功能。

## 功能特点

- 📦 **配置管理**: 自动保存和加载配置，支持默认值
- 🌐 **国际化支持**: 自动检测语言，支持参数替换
- 🎨 **可视化配置面板**: 美观的配置界面，支持多种输入类型（text / password / number / textarea / checkbox / **select**）
- 📖 **帮助文档**: 支持在脚本中显示帮助文档对话框
- 🤖 **LLM 开箱即用**: 内置 OpenAI / Anthropic / Ollama 三种 API 格式，一行代码完成 LLM 配置项与调用
- 🔧 **灵活易用**: 可作为独立工具使用，也可完整实例化

## 快速开始

### 1. 简单的国际化翻译器

```javascript
// 在你的脚本中引入
// @require https://github.com/xixiU/awesome-script/raw/refs/heads/master/common/config_manager.js

// 定义 i18n 字典
const i18n = {
    en: {
        greeting: 'Hello {name}!',
        count: 'Found {count} items',
        message: 'Welcome to our app'
    },
    zh: {
        greeting: '你好 {name}！',
        count: '找到 {count} 个项目',
        message: '欢迎使用我们的应用'
    }
};

// 创建翻译函数（自动检测语言）
const t = ConfigManager.createTranslator(i18n);

// 使用翻译
console.log(t('greeting', { name: '世界' }));  // 自动根据系统语言显示
console.log(t('count', { count: 10 }));
console.log(t('message'));
```

### 2. 语言检测

```javascript
// 检测用户语言（返回完整语言代码）
const lang = ConfigManager.detectLanguage();
console.log(lang);  // 'zh', 'en', 'ja', 'ko' 等

// 简化检测（只区分中文和英文）
const simpleLang = ConfigManager.detectLanguageSimple();
console.log(simpleLang);  // 'zh' 或 'en'
```

### 3. 完整的配置管理器（带可视化面板）

```javascript
// 创建配置管理器实例
const config = new ConfigManager('MyScriptConfig', {
    apiKey: '',
    apiUrl: 'https://api.example.com',
    enabled: true,
    timeout: 5000
}, {
    i18n: {
        en: {
            title: 'Settings',
            apiKeyLabel: 'API Key',
            apiUrlLabel: 'API URL',
            enabledLabel: 'Enable Feature',
            timeoutLabel: 'Timeout (ms)'
        },
        zh: {
            title: '设置',
            apiKeyLabel: 'API 密钥',
            apiUrlLabel: 'API 地址',
            enabledLabel: '启用功能',
            timeoutLabel: '超时时间 (毫秒)'
        }
    }
});

// 初始化配置面板
config.init([
    {
        key: 'apiKey',
        label: config.t('apiKeyLabel'),
        type: 'text',
        placeholder: 'Enter your API key',
        help: 'Get your API key from the dashboard'
    },
    {
        key: 'apiUrl',
        label: config.t('apiUrlLabel'),
        type: 'text',
        placeholder: 'https://api.example.com'
    },
    {
        key: 'enabled',
        label: config.t('enabledLabel'),
        type: 'checkbox'
    },
    {
        key: 'timeout',
        label: config.t('timeoutLabel'),
        type: 'number',
        validate: (value) => value > 0 && value < 60000
    }
]);

// 使用配置
const apiKey = config.get('apiKey');
const isEnabled = config.get('enabled');

// 更新配置
config.set('enabled', true);
config.set('timeout', 10000);

// 获取所有配置
const allConfig = config.getAll();

// 重置配置
config.reset();
```

### 4. 注册帮助文档

```javascript
config.registerHelpDocument({
    titleKey: 'helpTitle',           // i18n 键
    contentKey: 'helpContent',       // i18n 键（内容支持换行）
    displayMode: 'dialog',           // 'dialog' 或 'console'
    icon: '📖',
    onShow: () => {
        console.log('Help document opened');
    }
});
```

### 5. LLM 集成（OpenAI / Anthropic / Ollama）

一行代码引入 LLM 所需的全部配置项（API 格式 / 地址 / 密钥 / 模型），并使用统一的 `callLLM()` 发起请求，无需手写 `GM_xmlhttpRequest` 样板。

```javascript
// 1. 在默认配置中注入 LLM 字段
const config = new ConfigManager('MyScript', {
    ...ConfigManager.llmDefaults(),      // aiApiFormat/aiBaseUrl/aiApiKey/aiModel
    // ...其他字段
});

// 2. 在配置面板中追加 LLM 配置项
config.init([
    ...ConfigManager.llmConfigItems({ lang: 'zh' }),
    // ...其他字段
]);

// 3. 调用 LLM（自动根据 apiFormat 切换端点和鉴权方式）
const answer = await config.callLLM({
    prompt: '用一句话解释相对论',
    system: 'You are a physics teacher.',  // 可选
    temperature: 0.7,
    maxTokens: 4096
});
```

**支持的 API 格式**：

| 格式        | 端点                          | 鉴权             | 默认模型                 |
| ----------- | ----------------------------- | ---------------- | ------------------------ |
| `openai`    | `{baseUrl}/chat/completions`  | `Bearer` token   | `gpt-3.5-turbo`          |
| `anthropic` | `{baseUrl}/v1/messages`       | `x-api-key` 头   | `claude-sonnet-4-5`      |
| `ollama`    | `{baseUrl}/api/chat`          | 无               | `llama3`                 |

**启用系统提示词（预设 prompt）**：

```javascript
const config = new ConfigManager('MyScript', {
    ...ConfigManager.llmDefaults({
        enablePrompt: true,                    // 启用 aiSystemPrompt 字段
        defaultPrompt: '你是一个内容审核助手'  // 初始默认值
    })
});

config.init([
    ...ConfigManager.llmConfigItems({
        lang: 'zh',
        enablePrompt: true,
        promptPlaceholder: '输入默认的系统提示词...'
    })
]);

// system prompt 优先级：调用时传入 > aiSystemPrompt 配置 > 无
await config.callLLM({ prompt: 'hi' });                // 用配置中的 aiSystemPrompt
await config.callLLM({ prompt: 'hi', system: '诗人' }); // 强制覆盖
await config.callLLM({ prompt: 'hi', system: '' });    // 显式不用
```

## API 文档

### 静态方法

#### `ConfigManager.detectLanguage()`

检测用户的系统语言，返回完整的语言代码。

```javascript
const lang = ConfigManager.detectLanguage();  // 'zh', 'en', 'ja', 'ko' 等
```

#### `ConfigManager.detectLanguageSimple()`

简化的语言检测，只区分中文和英文。

```javascript
const lang = ConfigManager.detectLanguageSimple();  // 'zh' 或 'en'
```

#### `ConfigManager.createTranslator(i18nDict, lang)`

创建一个独立的翻译函数，无需实例化 ConfigManager。

**参数:**

- `i18nDict` (Object): i18n 字典对象
- `lang` (String, 可选): 语言代码，默认自动检测

**返回:** Function - 翻译函数 `t(key, params)`

```javascript
const i18n = {
    en: { greeting: 'Hello {name}!' },
    zh: { greeting: '你好 {name}！' }
};

const t = ConfigManager.createTranslator(i18n);
console.log(t('greeting', { name: 'World' }));
```

#### `ConfigManager.llmDefaults(options)`

返回 LLM 配置的默认值对象，用于 `new ConfigManager()` 的 `defaultConfig` 展开。

**参数:**

- `options` (Object, 可选):
  - `enablePrompt` (Boolean): 是否包含 `aiSystemPrompt` 字段（默认 `false`）
  - `defaultPrompt` (String): 系统提示词初始值（仅在 `enablePrompt=true` 时生效）

**返回:** Object — `{ aiApiFormat, aiBaseUrl, aiApiKey, aiModel }`（启用 prompt 时额外包含 `aiSystemPrompt`）

#### `ConfigManager.llmConfigItems(options)`

返回 LLM 配置项数组，用于 `config.init()` 的展开。

**参数:**

- `options` (Object, 可选):
  - `i18n` (Object): 脚本的 i18n 字典（可选，覆盖内置文案）
  - `lang` (String): 语言代码（默认自动检测）
  - `labels` (Object): 单独覆盖某些 key 的文本，如 `{ llmBaseUrlLabel: '自定义标签' }`
  - `enablePrompt` (Boolean): 是否追加 `aiSystemPrompt` textarea（默认 `false`）
  - `promptPlaceholder` (String): 系统提示词输入框的占位提示

**返回:** Array — 配置项数组，包含 API 格式（select：OpenAI / Anthropic / Ollama）、地址、密钥、模型

### 实例方法

#### `constructor(configName, defaultConfig, options)`

创建 ConfigManager 实例。

**参数:**

- `configName` (String): 配置名称
- `defaultConfig` (Object): 默认配置对象
- `options` (Object): 选项
  - `i18n` (Object): i18n 字典
  - `lang` (String): 语言代码（可选）

#### `get(key)`

获取配置值。

```javascript
const value = config.get('apiKey');
```

#### `set(key, value)`

设置配置值并自动保存。

```javascript
config.set('enabled', true);
```

#### `getAll()`

获取所有配置。

```javascript
const allConfig = config.getAll();
```

#### `reset()`

重置为默认配置。

```javascript
config.reset();
```

#### `t(key, paramsOrDefault)`

翻译文本，支持参数替换。

**参数:**

- `key` (String): 文本键
- `paramsOrDefault` (Object|String): 参数对象或默认文本

```javascript
// 简单使用
config.t('title', 'Default Title');

// 带参数替换
config.t('greeting', { name: 'User' });
```

#### `init(configItems)`

初始化配置面板。

```javascript
config.init([
    { key: 'apiKey', label: 'API Key', type: 'text' },
    { key: 'enabled', label: 'Enabled', type: 'checkbox' }
]);
```

#### `show()`

显示配置面板。

```javascript
config.show();
```

#### `hide()`

隐藏配置面板。

```javascript
config.hide();
```

#### `registerHelpDocument(options)`

注册帮助文档菜单。

```javascript
config.registerHelpDocument({
    titleKey: 'helpTitle',
    contentKey: 'helpContent',
    displayMode: 'dialog',
    icon: '📖'
});
```

#### `isLLMReady()`

检查 LLM 配置是否就绪（API Key 是否已填）。Ollama 格式无需 Key，永远返回 `true`。

```javascript
if (!config.isLLMReady()) {
    alert('请先配置 LLM API Key');
    return;
}
```

#### `callLLM(opts)`

统一的 LLM 请求方法，根据 `aiApiFormat` 自动选择端点、鉴权方式和响应解析逻辑。

**参数:**

- `opts` (Object):
  - `prompt` (String): 用户消息内容
  - `system` (String, 可选): 系统提示词。优先级 `opts.system > config.aiSystemPrompt > 无`；显式传空串 `''` 表示强制不使用
  - `temperature` (Number, 默认 `0.7`): 采样温度
  - `maxTokens` (Number, 默认 `4096`): 最大 token 数

**返回:** `Promise<string>` — 模型生成的文本内容

**依赖:** 调用脚本需在 header 声明 `@grant GM_xmlhttpRequest`

```javascript
const text = await config.callLLM({
    prompt: '总结一下这段话：...',
    temperature: 0.3
});
```

## 代码示例

### 示例 1: 创建简单的国际化翻译器

```javascript
const i18n = {
    en: { greeting: 'Hello {name}!', count: 'Found {count} items' },
    zh: { greeting: '你好 {name}！', count: '找到 {count} 个项目' }
};

const t = ConfigManager.createTranslator(i18n);
console.log(t('greeting', { name: 'World' }));  // 自动检测语言
console.log(t('count', { count: 10 }));
```

### 示例 2: 检测用户语言

```javascript
const lang = ConfigManager.detectLanguage();        // 返回 'zh', 'en', 'ja' 等
const simpleLang = ConfigManager.detectLanguageSimple();  // 返回 'zh' 或 'en'
```

### 示例 3: 使用完整的 ConfigManager (带配置面板)

```javascript
const config = new ConfigManager('MyScript', {
    apiKey: '',
    enabled: true
}, {
    i18n: {
        en: { title: 'Settings' },
        zh: { title: '设置' }
    },
    lang: 'zh'  // 可选，不指定则自动检测
});

config.init([
    { key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Enter API key' },
    { key: 'enabled', label: 'Enabled', type: 'checkbox' }
]);

// 使用配置
const apiKey = config.get('apiKey');
config.set('enabled', true);

// 使用 i18n
console.log(config.t('title'));  // 'Settings' 或 '设置'
```

### 示例 4: 注册帮助文档

```javascript
config.registerHelpDocument({
    titleKey: 'helpTitle',
    contentKey: 'helpContent',
    displayMode: 'dialog',  // 或 'console'
    icon: '📖'
});
```

## 完整示例项目

完整示例请参考：

- [example_i18n_usage.js](./example_i18n_usage.js) - 国际化功能完整示例
- [Twitter Block All Commenters](../twitter/twitter_block_commenters.user.js) - 实际项目中使用 i18n 翻译器

## 版本历史

### v1.2.0 (2026-05-12)

- ✨ **LLM 集成**: 内置 OpenAI / Anthropic / Ollama 三种 API 格式支持
- ✨ 新增静态方法 `ConfigManager.llmDefaults(options)` 返回标准 LLM 默认值对象
- ✨ 新增静态方法 `ConfigManager.llmConfigItems(options)` 返回标准 LLM 配置项数组（含下拉选择的 API 格式）
- ✨ 新增实例方法 `config.callLLM({ prompt, system, temperature, maxTokens })` 统一发起 LLM 请求
- ✨ 新增实例方法 `config.isLLMReady()` 检查 LLM 配置是否可用
- ✨ 可选 `enablePrompt` 参数支持用户可见的系统提示词（预设 prompt）配置项
- ✨ 内置 LLM 配置的中英文文案（`DEFAULT_LLM_I18N`），脚本可通过 `labels` / `i18n` 参数覆盖
- ✨ 配置面板新增 `select` 下拉选择类型支持，含自定义箭头样式
- 🔧 LLM 字段沿用 `aiApiFormat` / `aiBaseUrl` / `aiApiKey` / `aiModel` / `aiSystemPrompt` 命名

### v1.1.1 (2026-02-01)

- 🐛 修复方法名冲突：将内部配置菜单注册方法重命名为 `_registerConfigMenu()`
- 🔧 增强 `registerMenuCommand()` 方法的参数验证

### v1.1.0 (2026-02-01)

- ✨ 新增静态方法 `detectLanguage()` 和 `detectLanguageSimple()`
- ✨ 新增静态方法 `createTranslator()` 用于创建独立的翻译函数
- 🔧 增强 `t()` 方法，支持参数替换
- 📝 向后兼容旧版本 API
- 📖 添加使用示例和文档

### v1.0.1

- 初始版本，提供基础配置管理功能

## 许可证

MIT License

## 作者

xixiU
