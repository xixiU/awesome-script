# 更新日志

## v3.2.0 - 域名黑名单 🚫

### 🆕 新增功能
- ✅ **域名黑名单机制**
  - `xfchat.iflytek.com` 及其所有子域（如 `yf2ljykclb.xfchat.iflytek.com`）下扩展完全不生效
  - manifest `exclude_matches` + 运行时 hostname 校验双重保障

### 🛠️ 技术实现
- `manifest.json` 的 content.js 条目新增 `exclude_matches`
- `content.js` / `inject.js` 各自增加运行时 `DISABLED_HOSTS` 兜底校验
- 采用精确后缀匹配（`hostname === host || hostname.endsWith('.' + host)`），
  避免 `notxfchat.iflytek.com`（前缀粘连）与 `xfchat.iflytek.com.evil.com`（后缀伪装）被误杀

---

## v3.1.0 - 修复插件版切屏拦截失效 🐛

### 🐛 问题修复
- ✅ **修复 `Failed to fetch` 报错**
  - 根因：content script 运行在隔离世界（Isolated World），其 `window` /
    `EventTarget.prototype` / `document` 与页面真实对象不是同一个，覆盖后拦不到
    页面自身的切屏检测代码
  - 且 `setInterval` 每 2 秒重复包裹隔离世界的 `window.fetch`，层层嵌套叠加 MV3 下
    content script fetch 的 CORS 语义，导致插件自身请求（Dify 答题）报 `Failed to fetch`

### 🛠️ 技术实现
- 新增 `inject.js`，通过 manifest `world: MAIN` + `document_start` + `all_frames: true`
  注入页面主世界，在业务代码执行前一次性覆盖 `fetch` / `addEventListener` / `document.hidden`
- 每个同源 frame（含考试 iframe）独立注入，移除递归遍历 iframe 与 `setInterval` 反复包裹
- `content.js` 删除无效且有害的切屏检测模块，恢复插件自身干净的 fetch

### ⚠️ 回归要点（避免二次引入）
- 切屏拦截逻辑只放 `inject.js`（主世界）
- **禁止**在 `content.js` 内改 `window.fetch` / `XMLHttpRequest.prototype`

---

## v2.1.0 - 解除网页限制版本 🔓

### 🆕 新增功能
- ✅ **解除网页复制限制**
  - 自动解除考试页面的复制禁用（包括多层嵌套 iframe）
  - 实时拦截页面动态绑定的限制监听器
  - 三重保障机制：捕获阶段拦截 + 内联属性清除 + CSS 强制样式

- ✅ **解除多种网页限制**
  - 解除复制（copy）限制
  - 解除粘贴（paste）限制
  - 解除右键菜单（contextmenu）禁用
  - 解除文本选择（selectstart）限制
  - 解除拖拽（dragstart）限制

### 🛠️ 技术实现
- 使用捕获阶段事件监听器（优先级高于页面自身监听器）
- `stopImmediatePropagation()` 阻止页面处理器执行
- 不调用 `preventDefault()`，保留浏览器默认复制行为
- 递归处理所有同域 iframe，自动跳过跨域 frame
- MutationObserver 监听动态加载的 iframe

### 🎯 适用场景
- 考试页面复制题目（嵌套在多层 iframe 中）
- 学习资料复制保存
- 答案内容快速提取
- 任何禁止复制的 21tb 页面

### 📝 实现原理
1. **内联事件清除**：移除 `body.oncopy`、`body.onpaste` 等内联属性
2. **捕获阶段拦截**：在 `window` 层面拦截事件，阻止向下传播
3. **CSS 强制允许**：注入 `user-select: auto !important` 覆盖页面样式
4. **递归处理 iframe**：自动处理所有同域子框架
5. **动态监听**：通过 MutationObserver 处理后续加载的 iframe

### ✨ 使用说明
- 无需任何配置，安装后自动生效
- 在考试页面可以直接选中并复制任何文本
- 右键菜单恢复正常，可以使用"复制"选项
- 支持 Ctrl+C / Cmd+C 快捷键复制

---

## v2.0.1 - UI优化版本

### 🎨 界面优化
- ✅ **播放速度控制全新设计**
  - 将文本输入框改为精美的滑块控件
  - 实时显示当前速度值（带渐变色彩）
  - 速度不同时显示不同颜色：
    - 1.0-1.5x: 绿色（慢速）
    - 1.6-2.5x: 蓝色（正常）
    - 2.6-3.5x: 紫色（快速）
    - 3.6-4.5x: 橙色（极速）
    - 4.6-5.0x: 红色（超速）
  - 添加速度刻度标记（1x, 2x, 3x, 4x, 5x）
  - 特殊渐变背景，提升视觉效果

- ✅ **布局优化**
  - 将播放速度设置移至第一位（最常用功能优先）
  - 添加视觉分隔线，区分视频设置和AI设置
  - 优化间距和排版

### 🎯 交互优化
- ✅ 滑块拖动时实时更新速度显示
- ✅ 鼠标悬停时滑块手柄放大效果
- ✅ 根据速度值动态改变显示颜色
- ✅ 添加表情符号增强视觉吸引力

### 🔧 技术改进
- 使用 CSS 渐变背景增强滑块视觉效果
- 添加平滑过渡动画
- 优化滑块手柄样式（白色带边框）
- 响应式设计，确保各种尺寸下显示正常

---

## v2.0.0 - Chrome扩展版

### ✨ 主要功能
- 从油猴脚本迁移到 Chrome 扩展
- 视频播放速度控制（1-5倍速）
- 键盘快捷键支持
- 自动答题功能
- 独立设置弹窗

### 🎯 核心改进
- 默认播放速度改为 2 倍
- 使用 Chrome Storage API
- 使用 Fetch API
- 现代化的 UI 设计

---

## 使用建议

### 推荐设置
- **学习视频**: 2.0x 倍速（默认）
- **复习视频**: 2.5-3.0x 倍速
- **快速浏览**: 3.5-4.0x 倍速
- **极速模式**: 5.0x 倍速（仅用于非常熟悉的内容）

### 键盘快捷键
在视频页面可使用：
- `1` - 1.0倍速
- `2` - 1.5倍速
- `3` - 2.0倍速
- `4` - 3.0倍速
- `5` - 5.0倍速
- `←` - 后退10秒
- `→` - 前进10秒

