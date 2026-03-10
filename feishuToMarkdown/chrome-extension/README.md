# 飞书文档转 Markdown - Chrome 扩展 v3.0

一个轻量级的 Chrome 浏览器扩展，用于将飞书文档（Word 格式）转换为 Markdown 格式，并自动提取文档中的所有图片。

## 🎉 v3.0 重大更新

**全新转换方案**：自动下载 + 专业转换库

- ✅ **自动下载**：一键自动调用飞书下载 API 获取 docx
- ✅ **更稳定**：不依赖页面 DOM 结构，不会因飞书改版而失效
- ✅ **更准确**：使用 mammoth.js 专业库，格式转换更精确
- ✅ **更完整**：支持标题、段落、列表、表格、图片、代码块等所有格式
- ✅ **更简单**：一键完成：自动下载 docx → 自动转换为 Markdown

## 功能特性

- 📥 将飞书导出的 Word 文档（.docx）转换为 Markdown 格式
- 📷 自动提取文档中的所有图片
- 📦 打包为 ZIP 文件（包含 .md 文件和 images 文件夹）
- 🎨 支持标题、段落、列表、代码块、表格、图片、链接等
- 🚀 纯浏览器端处理，无需服务器
- 🔒 数据不上传，完全本地处理

## 安装方法

### 方式一：开发者模式安装（推荐）

1. **下载扩展文件**
   - 下载整个 `chrome-extension` 文件夹

2. **下载依赖库**
   - 在 `chrome-extension` 目录下确保有 `libs` 文件夹
   - 下载以下文件并放入 `libs` 文件夹：
     - [turndown.min.js](https://cdn.jsdelivr.net/npm/turndown@7.1.2/dist/turndown.min.js)
     - [jszip.min.js](https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js)
     - [mammoth.browser.min.js](https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js) - **新增，必须下载**

3. **创建图标文件**
   - 在 `chrome-extension` 目录下创建 `icons` 文件夹
   - 准备三个尺寸的图标：16x16、48x48、128x128（PNG 格式）
   - 或者使用临时图标（见下方说明）

4. **加载扩展**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `chrome-extension` 文件夹
   - 完成！

### 临时图标创建

如果没有图标文件，可以创建简单的临时图标：

```bash
# 在 chrome-extension 目录下执行
mkdir icons
# 然后手动创建或下载任意 PNG 图标，重命名为 icon16.png, icon48.png, icon128.png
```

或者使用在线工具生成图标：
- [Favicon Generator](https://favicon.io/)
- [Icon Generator](https://www.favicon-generator.org/)

## 文件结构

```
chrome-extension/
├── manifest.json              # 扩展配置文件
├── content_v3.js              # 内容脚本（自动下载+转换）
├── popup.html                 # 弹出窗口（手动转换器）
├── popup.js                   # 弹出窗口逻辑
├── libs/                      # 依赖库
│   ├── turndown.min.js        # HTML 转 Markdown
│   ├── jszip.min.js           # ZIP 打包
│   └── mammoth.browser.min.js # docx 解析（需下载）
└── icons/                     # 图标文件
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 使用方法

### 方式一：一键自动导出（推荐）

1. 打开飞书文档页面
2. 等待页面完全加载
3. 点击右上角 **「📥 导出 Markdown」** 按钮
4. 扩展自动完成：
   - 🔍 查找飞书下载 API
   - 📥 自动下载 docx 文件
   - 📄 解析 docx 内容
   - 📝 转换为 Markdown
   - 📦 打包图片和文件
5. 自动下载包含 Markdown 和图片的 ZIP 文件

### 方式二：手动下载转换（备用）

如果自动下载失败，可以使用手动方式：

1. 在飞书文档页面点击 **「···」** 更多菜单
2. 选择 **「导出」→「导出为 Word（.docx）」**
3. 等待文件下载到本地
4. 点击浏览器右上角扩展图标
5. 将 docx 文件**拖拽**到弹窗区域（或点击选择文件）
6. 点击 **「开始转换」**
7. 自动下载包含 Markdown 和图片的 ZIP 文件

## 导出内容

导出的 ZIP 文件包含：

```
文档标题.zip
├── 文档标题.md          # Markdown 文件
└── images/              # 图片文件夹
    ├── image_001.png
    ├── image_002.jpg
    └── ...
```

## 支持的格式

- ✅ 标题（H1-H6）
- ✅ 段落文本
- ✅ 粗体、斜体、删除线
- ✅ 有序列表、无序列表
- ✅ 代码块（带语法高亮标记）
- ✅ 行内代码
- ✅ 引用块
- ✅ 表格
- ✅ 图片
- ✅ 链接

## 性能优化

v3.0 采用全新架构：

1. **稳定性提升**：不依赖飞书页面 DOM 结构，不会因改版失效
2. **准确性提升**：使用 mammoth.js 专业库，转换质量更高
3. **本地处理**：所有转换在浏览器完成，数据不上传
4. **格式完整**：支持标题、列表、表格、图片、代码块等所有格式

## 注意事项

⚠️ **重要提示**：

1. **必须下载 mammoth.browser.min.js**：这是 v3.0 新增的核心依赖
2. **自动下载可能失败**：如果飞书 API 变化，自动下载可能失败，请使用手动方式
3. **需要登录状态**：自动下载需要浏览器已登录飞书账号
4. **大文档**：包含大量图片的文档可能需要较长处理时间
5. **图片格式**：支持 PNG、JPG、GIF、WebP、SVG 等格式

## 故障排查

### 自动下载失败

如果点击按钮后提示"自动下载失败"：
1. **使用手动方式**：点击扩展图标，使用弹窗手动上传 docx
2. **检查登录状态**：确保已登录飞书账号
3. **查看控制台**：打开 F12 查看具体错误信息
4. **API 可能变化**：飞书可能更新了下载接口

### 弹窗显示"缺少依赖库"

需要下载 `mammoth.browser.min.js` 并放入 `libs/` 目录：
- 下载地址：https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js
- 保存为 `libs/mammoth.browser.min.js`
- 重新加载扩展

### 转换结果格式有问题

- 检查飞书导出的 docx 文件是否完整
- 查看浏览器控制台的警告信息
- mammoth.js 专注于语义结构，不保留字体颜色等样式信息

### 找不到导出按钮（飞书页面）

- 刷新飞书文档页面重试
- 检查扩展是否已启用（chrome://extensions/）


## 自定义配置

### 修改按钮位置

编辑 `content.js` 中的按钮样式：

```javascript
button.style.cssText = `
    position: fixed;
    top: 80px;      // 修改垂直位置
    right: 20px;    // 修改水平位置
    ...
`;
```

### 修改图片命名规则

编辑 `content.js` 中的 `processImages` 函数：

```javascript
const filename = `image_${String(i + 1).padStart(3, '0')}.${validExt}`;
```

## 技术实现

- **Manifest V3**：使用最新的 Chrome 扩展规范
- **docx 解析**：[mammoth.js](https://github.com/mwilliamson/mammoth.js) - 将 Word 文档转换为 HTML
- **HTML 转 Markdown**：[Turndown](https://github.com/mixmark-io/turndown)
- **ZIP 打包**：[JSZip](https://stuk.github.io/jszip/)
- **图片提取**：mammoth.js 内置图片提取，转换为独立文件
- **本地处理**：所有操作在浏览器端完成，不上传数据

## 兼容性

- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ 其他基于 Chromium 的浏览器

## 更新日志

### v3.0.0 (2026-03-09)
- 🎉 **重大更新**：采用全新转换方案
- ✅ **自动下载**：一键自动调用飞书 API 下载 docx
- ✅ 使用 mammoth.js 转换，不再依赖 DOM 解析
- ✅ 转换质量大幅提升，更稳定
- ✅ 支持完整的文档格式（标题、列表、表格、图片、代码块）
- ✅ 新增 popup 手动转换器作为备用方案
- ✅ 自动下载失败时提示用户使用手动方式

### v2.0.0 (2024-03-09)
- 优化 UI：单按钮悬停菜单
- 添加导出选项对话框
- 修复 Word 导出问题

### v1.0.0 (2024-03-09)
- 初始版本
- 支持基本的 Markdown 转换
- 支持图片下载和打包

## 许可证

MIT License

## 常见问题

**Q: 自动下载是如何工作的？**

A: 扩展会尝试多个可能的飞书下载 API 端点，使用浏览器的 session cookies 进行认证。如果所有端点都失败，会提示使用手动方式。

**Q: 为什么自动下载会失败？**

A: 可能的原因：
1. 飞书更新了 API 端点
2. 浏览器未登录飞书账号
3. 文档权限不足
4. 网络问题

**Q: 手动方式和自动方式有什么区别？**

A: 两种方式最终效果相同，都是将 docx 转换为 Markdown。自动方式更便捷，手动方式更稳定可靠。

**Q: 可以在其他浏览器使用吗？**

A: 可以在所有基于 Chromium 的浏览器使用，如 Edge、Brave、Opera 等。

**Q: 扩展会收集我的数据吗？**

A: 不会。所有处理都在本地完成，不会上传任何数据。

**Q: 转换后的 Markdown 格式不完美怎么办？**

A: mammoth.js 专注于语义结构转换，不保留字体颜色、大小等样式。如需精确样式，建议直接使用 docx 文件。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 相关项目

- [Turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown converter
- [JSZip](https://github.com/Stuk/jszip) - Create ZIP files in JavaScript
