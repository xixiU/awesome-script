# Dify网页智能总结 - 油猴脚本

## 📝 简介

这是一个基于Dify工作流的智能网页总结工具，可以在任何网页上一键调用AI对当前页面内容进行总结。脚本采用智能算法自动提取网页正文，适用于各类知识型网站。

## ✨ 特性

- 🎯 **智能内容提取**：采用多策略智能算法，自动识别并提取网页正文
  - 支持常见的文章网站（博客、新闻、技术文档等）
  - 自动过滤广告、导航栏、侧边栏等无关内容
  - 使用文本密度算法精准定位主要内容区域

- 🚀 **一键总结**：点击浮动按钮即可调用Dify工作流进行内容总结

- 💡 **美观的UI**：
  - 现代化的渐变色设计
  - 流畅的动画效果
  - 响应式结果展示面板

- ⚙️ **灵活配置**：支持自定义Dify API地址和密钥

## 📦 安装

### 前置要求

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)
   - Chrome: [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojobhflfapmlkmbgj)
   - Firefox: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - Edge: [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. 准备Dify工作流
   - 登录你的Dify平台
   - 创建一个工作流，包含以下输入参数：
     - `newsUrl` (文本): 网页URL
     - `newsContent` (文本): 网页正文内容
   - 获取工作流的API地址和API Key

### 安装步骤

1. 点击Tampermonkey图标 → 管理面板
2. 点击"+"号创建新脚本
3. 复制 `dify_web_summarizer.js` 的全部内容
4. 粘贴到编辑器中，保存（Ctrl+S 或 Cmd+S）

## ⚙️ 配置

### 首次使用配置

1. 打开任意网页
2. 点击页面右下角的 **⚙️ 齿轮图标**
3. 在弹出的对话框中输入：
   - **Dify工作流API地址**：例如 `https://api.dify.ai/v1/workflows/run`
   - **Dify API Key**：你的API密钥
4. 点击确定保存

### Dify工作流配置示例

在Dify中创建工作流时，建议包含以下节点：

```yaml
输入参数:
  - newsUrl: 网页地址
  - newsContent: 网页正文

处理流程:
  1. 使用LLM节点分析newsContent
  2. 生成总结（可以包含：关键要点、主要观点、总结等）
  3. 输出结果到 outputs.text 或 outputs.result

输出格式:
  - text: 总结结果（支持Markdown格式）
```

## 🚀 使用方法

1. **访问任意网页**
   - 打开你想要总结的文章、博客或新闻页面

2. **点击总结按钮**
   - 点击页面右下角的 **📝 AI总结** 按钮

3. **等待处理**
   - 脚本会自动提取网页正文
   - 调用Dify工作流进行分析
   - 处理时间取决于文章长度和API响应速度

4. **查看结果**
   - 总结结果会在弹出面板中显示
   - 支持Markdown格式渲染
   - 点击关闭按钮或遮罩层关闭面板

## 🔧 智能内容提取原理

脚本采用三层策略确保准确提取网页正文：

### 策略1: 常见选择器匹配

尝试使用以下选择器：

- `article`, `main`, `[role="main"]`
- `.article-content`, `.post-content`, `.entry-content`
- `.markdown-body`, `.news-content`, `.detail-content`
- 等等...

### 策略2: 文本密度算法

当常见选择器失效时，使用智能算法：

- 计算每个容器的文本长度
- 分析链接密度（链接少的区域更可能是正文）
- 检测标点符号密度（正文通常有合理的标点密度）
- 统计段落数量（正文通常包含多个段落）
- 综合评分并选择最佳候选区域

### 策略3: Body回退

当以上策略都失败时，从整个body提取并清理内容

### 内容清理

- 自动移除导航栏、侧边栏、广告、评论区等
- 规范化空白字符和换行
- 保留段落结构

## 🎨 自定义

### 修改按钮位置

编辑脚本中的 `CONFIG` 对象：

```javascript
const CONFIG = {
    buttonPosition: {
        bottom: '80px',  // 距离底部的距离
        right: '20px'    // 距离右侧的距离
    }
};
```

### 修改样式

在脚本的 `styles` 部分自定义CSS样式，可以修改：

- 按钮颜色和样式
- 面板大小和位置
- 动画效果
- 字体和排版

### 添加自定义选择器

在 `ContentExtractor` 类的 `contentSelectors` 数组中添加更多选择器：

```javascript
this.contentSelectors = [
    'article',
    'main',
    '.your-custom-selector',  // 添加你的选择器
    // ...
];
```

## 🐛 故障排除

### 问题1: 点击按钮无反应

- 检查控制台是否有错误信息（F12打开开发者工具）
- 确认已正确配置Dify API地址和密钥
- 检查网络连接

### 问题2: 提取的内容不准确

- 打开控制台查看提取的内容（会有日志输出）
- 可以手动添加该网站的特定选择器
- 反馈问题，帮助改进算法

### 问题3: API调用失败

- 确认Dify API地址正确
- 确认API Key有效且有足够的调用额度
- 检查Dify工作流的输入输出参数配置
- 查看控制台错误信息获取详细原因

### 问题4: 显示格式错误

- Dify工作流返回的数据结构可能需要调整
- 编辑脚本中的 `DifyAPI.summarize` 方法
- 调整响应数据的解析路径

## 📝 Dify响应格式说明

脚本默认尝试从以下路径获取结果：

1. `data.data.outputs.text`
2. `data.data.outputs.result`
3. `data.answer`
4. 完整的JSON响应

如果你的Dify工作流返回格式不同，请修改脚本中的这部分代码：

```javascript
const result = data.data?.outputs?.text || 
               data.data?.outputs?.result || 
               data.answer || 
               JSON.stringify(data, null, 2);
```

## 📄 许可证

MIT License - 可自由使用和修改

## 🤝 贡献

欢迎提交问题和改进建议！

## 📮 反馈

如有问题或建议，请通过以下方式反馈：

- 提交Issue
- 发送邮件
- 或其他联系方式

---

**享受智能阅读体验！** 📚✨
