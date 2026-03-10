# 飞书文档转 Markdown - Chrome 扩展

一个轻量级的 Chrome 浏览器扩展，支持飞书文档导出为 Markdown、Word、PDF 格式。

## 功能特性

- 📥 **一键导出 Markdown**：自动下载 docx 并转换为 Markdown + 图片 ZIP 包
- 📄 **直接下载 Word**：调用飞书 API 直接下载 docx 文件
- 📕 **直接下载 PDF**：调用飞书 API 直接下载 PDF 文件
- ⚙️ **灵活配置**：在扩展弹窗中自由配置显示哪些导出选项
- 🔄 **通用转换器**：扩展弹窗提供独立的 docx 转 Markdown 工具，可用于任何网站的 Word 文件
- 🚀 **纯本地处理**：所有转换在浏览器完成，数据不上传
- 🔒 **隐私安全**：不收集任何用户数据

## 安装方法

### 1. 下载依赖库

在 `libs/` 目录下需要以下文件：

- **mammoth.browser.min.js**（必须）
  - 下载：https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js
  - 保存为：`libs/mammoth.browser.min.js`

- **jszip.min.js**
  - 下载：https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js

- **turndown.min.js**
  - 下载：https://cdn.jsdelivr.net/npm/turndown@7.1.2/dist/turndown.min.js

### 2. 准备图标文件

在 `icons/` 目录下准备三个尺寸的图标：
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

### 3. 加载扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `chrome-extension` 文件夹
6. 完成！

## 使用方法

### 在飞书文档页面

1. 打开任意飞书文档
2. 页面右上角会出现「📥 导出」按钮
3. 鼠标悬停在按钮上，显示导出菜单
4. 选择需要的导出格式：
   - **导出 Markdown**：自动下载 docx → 转换为 Markdown → 打包图片 → 下载 ZIP
   - **下载 Word**：直接下载 docx 文件
   - **下载 PDF**：直接下载 PDF 文件

### 配置导出选项

1. 点击浏览器工具栏的扩展图标
2. 在弹窗顶部的「⚙️ 导出选项配置」区域
3. 勾选/取消勾选想要显示的导出选项
4. 配置会自动保存并同步

### 通用 Word 转 Markdown

扩展弹窗下部提供独立的转换工具，可用于任何来源的 Word 文件：

1. 点击浏览器工具栏的扩展图标
2. 在「📄 Word 转 Markdown」区域
3. 拖拽或选择 docx 文件
4. 点击「开始转换」
5. 自动下载 Markdown ZIP 文件

## 文件结构

```
chrome-extension/
├── manifest.json              # 扩展配置文件
├── content_v3.js              # 页面脚本（自动下载+转换）
├── popup.html                 # 弹窗界面
├── popup.js                   # 弹窗逻辑
├── libs/                      # 依赖库
│   ├── mammoth.browser.min.js # docx 解析
│   ├── jszip.min.js           # ZIP 打包
│   └── turndown.min.js        # HTML 转 Markdown
└── icons/                     # 图标文件
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 导出内容

### Markdown 导出

```
文档标题.zip
├── 文档标题.md          # Markdown 文件
└── images/              # 图片文件夹
    ├── image_001.png
    ├── image_002.jpg
    └── ...
```

### 支持的格式

- ✅ 标题（H1-H6）
- ✅ 段落文本
- ✅ 粗体、斜体、删除线
- ✅ 有序列表、无序列表
- ✅ 代码块（带语法高亮标记）
- ✅ 行内代码
- ✅ 引用块
- ✅ 表格
- ✅ 图片（自动提取）
- ✅ 链接

## 技术实现

- **Manifest V3**：使用最新的 Chrome 扩展规范
- **docx 解析**：[mammoth.js](https://github.com/mwilliamson/mammoth.js)
- **HTML 转 Markdown**：[Turndown](https://github.com/mixmark-io/turndown)
- **ZIP 打包**：[JSZip](https://stuk.github.io/jszip/)
- **飞书 API**：自动调用飞书导出接口
- **配置存储**：chrome.storage.sync 跨设备同步

## 故障排查

### 自动下载失败

如果点击按钮后提示失败：
1. 检查是否已登录飞书账号
2. 打开 F12 查看控制台错误信息
3. 飞书可能更新了 API 接口
4. 使用扩展弹窗的通用转换工具作为备选方案

### 弹窗显示「缺少依赖库」

需要下载 `mammoth.browser.min.js` 并放入 `libs/` 目录：
- 下载地址：https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js
- 保存为 `libs/mammoth.browser.min.js`
- 重新加载扩展

### 转换结果格式有问题

- mammoth.js 专注于语义结构转换，不保留字体颜色、大小等样式
- 检查飞书导出的 docx 文件是否完整
- 查看浏览器控制台的警告信息

### 找不到导出按钮

- 刷新飞书文档页面重试
- 检查扩展是否已启用（chrome://extensions/）
- 确认 URL 匹配 `/docx/` 或 `/docs/` 路径

## 注意事项

1. **必须下载 mammoth.browser.min.js**：这是核心依赖
2. **需要登录状态**：自动下载需要浏览器已登录飞书账号
3. **API 可能变化**：飞书可能更新接口，导致自动下载失败
4. **大文档处理**：包含大量图片的文档可能需要较长处理时间
5. **样式限制**：mammoth.js 不保留字体颜色、大小等样式信息

## 兼容性

- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ 其他基于 Chromium 的浏览器

## 更新日志

### v3.0.0 (2026-03-10)
- 🎉 优化 UI：单个导出按钮 + 悬停菜单
- ⚙️ 配置移到扩展弹窗
- 🔄 扩展弹窗提供通用 docx 转 Markdown 工具
- ✅ 支持导出 Markdown、下载 Word、下载 PDF
- ✅ 使用 mammoth.js 转换，不依赖 DOM 解析
- ✅ 自动调用飞书 API 下载文件

## 许可证

MIT License

## 常见问题

**Q: 自动下载是如何工作的？**

A: 扩展调用飞书的导出 API（create → poll result → download），使用浏览器的 session cookies 进行认证。

**Q: 为什么需要三种导出方式？**

A:
- **Markdown**：适合文档编辑、版本控制、静态网站生成
- **Word**：保留原始格式，适合进一步编辑
- **PDF**：适合打印、分享、归档

**Q: 扩展会收集我的数据吗？**

A: 不会。所有处理都在本地完成，不会上传任何数据。

**Q: 可以在其他浏览器使用吗？**

A: 可以在所有基于 Chromium 的浏览器使用，如 Edge、Brave、Opera 等。

**Q: 转换后的 Markdown 格式不完美怎么办？**

A: mammoth.js 专注于语义结构转换。如需精确样式，建议直接使用 docx 或 PDF 格式。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关项目

- [Turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown converter
- [JSZip](https://github.com/Stuk/jszip) - Create ZIP files in JavaScript
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) - Convert Word documents to HTML
