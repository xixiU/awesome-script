# ifly-21tb 增强脚本

21tb 学习平台全功能增强工具，支持视频控制、自动答题、解除网页限制。

## 📦 版本说明

### 🔧 油猴脚本版（推荐）
- **版本**: v1.5.0
- **文件**: `21tbHepler.js`
- **安装方式**: 安装 Tampermonkey 扩展后，安装此脚本
- **下载地址**: [GitHub Raw](https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/21tb/21tbHepler.js)

### 🧩 Chrome 扩展版
- **版本**: v2.1.0
- **目录**: `chrome-extension/`
- **安装方式**: Chrome 开发者模式加载未打包的扩展
- **适用场景**: 不想安装油猴的用户

## ✨ 核心功能

### 1. 视频控制增强 🎬
- **键盘快捷键**
  - `←` / `→` - 后退/前进 10 秒
  - `1` - 1.0 倍速
  - `2` - 1.5 倍速
  - `3` - 2.0 倍速
  - `4` - 3.0 倍速（Chrome 扩展版）
  - `5` - 5.0 倍速（Chrome 扩展版）
  
- **浮动速度控制**
  - 油猴版：点击切换 1.0 / 1.25 / 1.5 / 2.0 倍速
  - Chrome 版：滑块控制 1.0-5.0 倍速（更精细）

### 2. 考试自动答题 🤖
- **直接调用 Dify API**（无需本地服务）
- **智能答题**：单选题、多选题、判断题
- **暂停/继续控制**：随时中断答题流程
- **失败题目重试**：自动记录失败题目，支持多次重试
- **配置管理**
  - 油猴版：通过油猴菜单配置
  - Chrome 版：点击扩展图标配置

**首次使用前必须配置 Dify API Key！**

### 3. 解除网页限制 🔓 (v1.5 / v2.1 新增)
- ✅ **解除复制限制**（包括多层嵌套 iframe）
- ✅ **解除粘贴限制**
- ✅ **解除右键菜单禁用**
- ✅ **解除文本选择限制**
- ✅ **实时拦截动态绑定的限制监听器**

**自动生效，无需任何配置！**

## 🚀 快速开始

### 方式一：油猴脚本（推荐）

1. **安装 Tampermonkey**
   - [Chrome 商店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. **安装脚本**
   - 点击 [安装链接](https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/21tb/21tbHepler.js)
   - 或复制 `21tbHepler.js` 内容，在 Tampermonkey 中创建新脚本

3. **配置 API Key**
   - 访问 21tb.com 任意页面
   - 点击油猴图标 → `⚙️ 21tb脚本设置`
   - 填写 Dify API Key（格式：`app-xxxxxxxx`）
   - 保存配置

### 方式二：Chrome 扩展

1. **下载扩展**
   ```bash
   git clone https://github.com/xixiU/awesome-script.git
   cd awesome-script/iflytek/21tb/chrome-extension
   ```

2. **加载扩展**
   - 打开 Chrome，进入 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `chrome-extension` 目录

3. **配置 API Key**
   - 点击扩展图标
   - 填写配置信息
   - 保存

## 🔧 技术实现

### 解除复制限制原理

#### 问题根因
考试页面禁止复制是通过在最内层 iframe 的 `body` 标签上绑定内联事件实现：
```html
<body oncopy="showExamToast('warning','对不起，禁止复制！');return false;">
```

#### 解决方案（三重保障）

1. **内联属性清除**
   ```javascript
   document.body.removeAttribute('oncopy');
   document.body.oncopy = null;
   ```

2. **捕获阶段拦截**（核心技巧）
   ```javascript
   window.addEventListener('copy', (e) => {
       e.stopImmediatePropagation();  // 阻止页面监听器执行
       // 不调用 preventDefault()，保留浏览器默认复制行为
   }, true);  // true = 捕获阶段
   ```

3. **CSS 强制允许**
   ```css
   * {
       user-select: auto !important;
   }
   ```

4. **递归处理 iframe**
   - 自动处理所有同域子框架
   - MutationObserver 监听动态加载的 iframe

#### 为什么有效？
- **捕获阶段优先级高**：事件传播顺序是 `捕获 → 目标 → 冒泡`，在捕获阶段拦截能先于页面监听器执行
- **stopImmediatePropagation**：阻止同级和后续监听器执行（包括页面自己绑定的）
- **不调用 preventDefault**：浏览器默认复制行为（Ctrl+C、右键复制）正常工作

## 📝 更新日志

### v1.5.0 / v2.1.0 (2026-06-16)
- ✅ 新增完整的网页限制解除功能
- ✅ 自动递归处理所有 iframe
- ✅ 捕获阶段拦截 + 内联属性清除 + CSS 强制样式
- ✅ 实时监听动态加载的 iframe

### v1.4.x / v2.0.x
- ✅ 失败题目重试功能
- ✅ 直接调用 Dify API（无需本地服务）
- ✅ Chrome 扩展版滑块速度控制
- ✅ 优化配置管理

## ⚠️ 注意事项

1. **API Key 必须配置**
   - 自动答题功能需要有效的 Dify API Key
   - 格式：`app-` 开头的字符串
   - 在 Dify 平台的工作流 API 访问页面获取

2. **解除复制限制自动生效**
   - 脚本/扩展安装后，复制限制自动解除
   - 适用于考试页面、学习资料等所有 21tb 页面
   - 支持嵌套 iframe（如考试页面的多层框架）

3. **跨域 iframe 限制**
   - 脚本无法访问跨域 iframe（浏览器安全策略）
   - 21tb 考试页面是同域 iframe，不受此限制

4. **浏览器兼容性**
   - 油猴版：支持 Chrome / Edge / Firefox / Safari
   - Chrome 扩展版：仅支持 Chrome / Edge（Manifest V3）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可

MIT License

## 👤 作者

yuan (@xixiU)

---

**提示**：本工具仅供学习交流使用，请遵守平台规则，合理使用自动答题功能。
