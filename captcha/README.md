# 网页通用验证码识别

## 功能简介

解放眼睛和双手，自动识别并填入数字、字母（支持大小写）、文字验证码。

### 主要功能

- ✅ 自动检测页面验证码图片
- ✅ 智能识别验证码输入框
- ✅ 支持多种验证码类型
- ✅ 支持跨域图片处理
- ✅ 手动选择验证码和输入框
- ✅ 配置管理功能

## 使用说明

### 安装

1. 安装 Tampermonkey 浏览器扩展
   - [Chrome 商店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox 商店](https://addons.mozilla.org/firefox/addon/tampermonkey/)
   - [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. 安装本脚本
   - 点击 [browser_capture.js](./browser_capture.js)
   - 或从 [GitHub Raw](https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/captcha/browser_capture.js) 安装

3. 配置识别服务
   - 默认使用本地服务：`http://localhost:9876`
   - 可在脚本中修改 `routePrefix` 变量自定义服务地址

### 使用方法

#### 自动识别模式

脚本会自动检测页面中的验证码图片和输入框，并进行识别填充。

#### 手动选择模式

如果自动识别失败，可以使用手动选择功能：

1. 点击浏览器工具栏的 Tampermonkey 图标
2. 选择"手动选择验证码和输入框"菜单项
3. 依次点击验证码图片和输入框
4. 脚本会保存配置，下次访问自动使用

### 配置说明

脚本支持以下 GM 值存储配置：

- `tipsConfig`: 提示配置
- `husky_slidePath[domain]`: 滑动验证码路径
- `husky_normalPath[domain]`: 普通验证码路径

## 技术实现

### 核心功能

#### 1. 跨域图片处理

脚本使用两种方式处理验证码图片：

**方式一：Canvas 直接转换**

```javascript
// 适用于同域或设置了 CORS 的图片
canvas.drawImage(img, 0, 0);
dataURL = canvas.toDataURL("image/png");
```

**方式二：GM_xmlhttpRequest 重新获取**

```javascript
// 适用于跨域图片，使用 Tampermonkey 特权 API
GM_xmlhttpRequest({
    method: "GET",
    url: imgSrc,
    responseType: "blob",
    onload: (res) => {
        // 转换为 base64
        fileReader.readAsDataURL(blob);
    }
});
```

#### 2. 验证码检测策略

- 基于图片尺寸过滤（排除过大或过小的图片）
- 基于元素属性匹配（id、class、name、src 等包含 captcha/code/verify 等关键词）
- DOM 变化监听，实时检测新增的验证码元素

#### 3. 输入框智能匹配

- 优先匹配明确的验证码输入框（属性包含 captcha/code/verify）
- 支持手动选择并保存配置
- 自动填充识别结果

### 依赖项

- Vue.js 2.6.12
- Element UI
- Tampermonkey GM API

## 更新记录

### v4.3 (2025-10-21)

**问题修复**

- ✅ 修复跨域验证码图片 Canvas 污染问题（SecurityError: Tainted canvases may not be exported）
- ✅ 修复输入框匹配错误，验证码被填入错误输入框的问题
- ✅ 修复验证码图片误识别问题（排除二维码、按钮等非验证码图片）
- ✅ 增强错误处理机制，添加详细错误日志
- ✅ 实现 `handleCrossOriginImg` 备用方案

**技术改进**

- **跨域图片处理**：当 Canvas.toDataURL() 抛出 SecurityError 时，自动使用 GM_xmlhttpRequest 重新获取图片
- **验证码图片检测优化**：
  - 移除过于宽泛的 `image` 关键词匹配
  - 新增排除规则：自动排除 PersonalCenter、gzh、qrcode、logo、icon、button 等路径
  - 优先识别 src 包含 `createimage`、`captcha`、`verify` 等明确验证码路径的图片
  - 增加宽高比验证：要求宽度至少是高度的 1.5 倍，排除正方形图片（如二维码）
  - 避免误识别二维码、按钮图片等非验证码图片
- **输入框匹配优化**：使用多层匹配策略，精准定位验证码输入框
- **匹配策略改进**：
  - **方法1**：查找验证码图片的前一个兄弟节点中的输入框（最接近）
  - **方法2**：使用 `compareDocumentPosition` API 比较 DOM 位置，只匹配在图片之前出现的输入框
  - **方法3**：兜底方案，向上遍历父节点倒序查找
  - 彻底避免匹配到图片后面的输入框（如手机验证码 vcCode）
- 添加 FileReader 错误处理和超时处理
- 优化日志输出，便于调试

**影响范围**

- 解决了在部分网站（如 enetedu.com）上验证码图片无法导出的跨域问题
- 解决了误识别二维码、按钮图片为验证码的问题
- 解决了在同一表单中存在多个包含"验证码"关键词输入框时的匹配错误
- 大幅提升验证码图片检测和输入框识别的准确性
- 减少误报和无效识别，提升用户体验

### v4.2 及更早版本

- 支持更多验证码类型
- 智能识别验证码输入框
- 基础自动识别功能

## 常见问题

### Q1: 脚本无法识别验证码？

**解决方案：**

1. 检查识别服务是否正常运行（默认 localhost:9876）
2. 使用"手动选择验证码和输入框"功能
3. 查看浏览器控制台错误信息

### Q2: 跨域图片错误？

**解决方案：**
v4.3 版本已自动处理跨域问题，无需手动配置。如仍有问题：

1. 确认 Tampermonkey 版本为最新
2. 检查 `@grant GM_xmlhttpRequest` 权限是否启用
3. 查看控制台日志确认备用方案是否生效

### Q3: 误识别二维码、按钮等非验证码图片？

**解决方案：**

1. v4.3 版本已大幅优化图片检测逻辑，自动排除常见的非验证码图片
2. 脚本会检查图片路径、尺寸比例，只识别真正的验证码图片
3. 如果仍有误识别，可使用"手动选择验证码和输入框"功能

### Q4: 验证码填入了错误的输入框？

**解决方案：**

1. v4.3 版本已优化输入框匹配逻辑，优先匹配同级输入框
2. 如果自动匹配仍然错误，使用"手动选择验证码和输入框"功能
3. 手动选择后配置会保存，下次访问自动使用正确的配置

### Q5: 识别结果不准确？

**解决方案：**

1. 验证码识别依赖后端识别服务的准确率
2. 确认识别服务配置正确
3. 可尝试手动刷新验证码重新识别

## 开发说明

### 本地调试

1. 在浏览器中安装 Tampermonkey
2. 创建新脚本，复制 `browser_capture.js` 内容
3. 修改 `routePrefix` 为你的识别服务地址
4. 保存并访问目标网站测试

### 代码结构

```
Captcha 类
├── init()              - 初始化，设置 DOM 监听
├── findCaptcha()       - 查找验证码图片
├── handleImg()         - 处理图片转 base64
├── handleCrossOriginImg() - 处理跨域图片
├── doRecognition()     - 调用识别服务
└── manualLocateCaptcha() - 手动选择功能
```

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交 Issue

请包含以下信息：

- 浏览器版本
- Tampermonkey 版本
- 目标网站 URL（如可公开）
- 错误信息截图
- 控制台日志

### 代码规范

- 使用 ES6+ 语法
- 添加必要的注释
- 保持代码可读性
- 遵循项目现有代码风格

## 许可证

MIT License

## 致谢

- 感谢 哈士奇 的贡献
- 感谢所有使用和反馈的用户
