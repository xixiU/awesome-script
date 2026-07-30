# iFlytek 工具集

讯飞全域工具箱，提升办公效率。

## 📦 工具列表

### 1. iflytek_toolkit.user.js - 讯飞统一工具箱

**适用范围：** 所有讯飞域名（`*.iflytek.com`、`*.iflytek.cn`）

**功能：**
- ✅ **自动登录助手** - 自动处理 3 种登录场景
- ✅ **解除复制限制** - 解除云盘/知识库/邮件等所有讯飞域名的复制限制

**安装方式：**
```
https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/iflytek_toolkit.user.js
```

**详细功能说明：**

#### 🔐 自动登录助手
- **场景1**: Coremail 邮件系统自动登录
- **场景2**: 中间页自动点击"使用集团账号登录"
- **场景3**: 集团统一认证自动登录（无验证码时）

#### 📋 解除复制限制
- 解除 `user-select: none` CSS 限制
- 拦截阻止复制的事件监听器（copy、cut、selectstart、contextmenu）
- 支持动态加载的内容
- 递归处理 iframe 嵌套页面
- **三重保障机制：**
  1. 捕获阶段事件拦截
  2. 清除内联事件属性
  3. CSS 强制样式覆盖

**适用场景：**
- 讯飞云盘分享页面
- 内部知识库文档
- 邮件系统
- 其他所有讯飞域名下的页面

---

### 2. 21tb/21tbHepler.js - 21tb 增强脚本

**适用范围：** `*.21tb.com`（内部培训平台）

**功能：**
- ✅ **视频控制增强** - 键盘快捷键、速度调节
- ✅ **考试自动答题** - 调用 Dify API 智能答题
- ✅ **解除复制限制** - 考试页面解除限制

**详见：** [21tb/README.md](./21tb/README.md)

---

### 3. autoDevelop - 自动开发工具

**详见：** [autoDevelop/](./autoDevelop/)

---

### 4. forcePagination - 强制分页

**详见：** [forcePagination/](./forcePagination/)

---

### 5. logDownloader - 日志下载器

**详见：** [logDownloader/](./logDownloader/)

---

## 🚀 快速开始

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击上面的安装链接
3. 确认安装
4. 访问讯飞相关网站即可自动生效

## 📝 更新日志

### iflytek_toolkit v1.0.0 (2026-07-30)
- 整合自动登录和解除复制限制功能
- 统一适配所有讯飞域名
- 优化事件拦截逻辑
- 替代原 autoLogin 脚本

## 🐛 问题反馈

如遇到问题，请提供：
- 浏览器版本
- 脚本版本
- 具体网址
- 错误信息（F12 控制台）

## 📄 许可证

MIT License
