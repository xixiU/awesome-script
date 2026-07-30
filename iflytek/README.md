# iFlytek Toolkit 讯飞工具箱

一个脚本搞定讯飞全域办公效率工具，整合了原 autoLogin 和 21tb 增强脚本的全部功能。

## 📦 安装

安装 [Tampermonkey](https://www.tampermonkey.net/) 后，点击链接安装：

```
https://raw.githubusercontent.com/xixiU/awesome-script/refs/heads/master/iflytek/iflytek_toolkit.user.js
```

## 🎯 适用范围

| 域名 | 生效功能 |
| --- | --- |
| `*.iflytek.com` / `*.iflytek.cn` | 自动登录 + 解除复制限制 |
| `*.21tb.com` | 自动答题 + 视频控制 + 解除复制限制 |

脚本内部通过域名判断自动隔离功能，各域名只加载对应模块。

## 🧩 功能模块

### 1. 自动登录（讯飞域名）
- **场景1**: Coremail 邮件系统 - 账号密码已填充时自动登录
- **场景2**: 中间页 - 自动点击"使用集团账号登录"
- **场景3**: 集团统一认证 - 无验证码时自动登录

### 2. 解除复制限制（全站）
解除云盘/知识库/邮件/考试页等所有页面的复制、粘贴、右键、文本选择限制。

**三重保障机制：**
1. 捕获阶段拦截事件（copy/cut/paste/contextmenu/selectstart/dragstart）
2. 清除内联事件属性
3. CSS 强制 `user-select: text`

支持动态内容与多层 iframe 嵌套。

### 3. 考试自动答题（21tb）
- 直接调用 Dify API 智能答题，无需本地代理
- 支持暂停/继续、失败题目重试
- 通过油猴菜单「⚙️ 21tb脚本设置」配置 Dify API Key

### 4. 视频控制（21tb）
- 键盘快捷键：`←/→` 快退/快进 10 秒，`1/2/3` 切换 1.0x/1.5x/2.0x 倍速
- 右下角浮动倍速按钮

## ⚙️ 21tb 答题配置

首次使用需配置 Dify API Key：
1. 点击油猴图标 → 「⚙️ 21tb脚本设置」
2. 填写 Dify API Key（格式 `app-xxxxxxxx`）
3. 保存后即可使用自动答题

## 📝 更新日志

### v2.0.0 (2026-07-30)
- 合并 autoLogin + 21tbHepler 全部功能为单一脚本
- 按域名自动隔离功能模块
- 21tb 专属功能（答题/视频/设置面板）仅在 21tb.com 加载
- 自动登录仅在讯飞域名加载
- 解除复制限制全站通用

## 🗂️ 其他工具

- [autoDevelop/](./autoDevelop/) - 自动开发工具
- [forcePagination/](./forcePagination/) - 强制分页
- [logDownloader/](./logDownloader/) - 日志下载器
- [21tb/](./21tb/) - 21tb 相关资源（chrome-extension、proxy 脚本）

## 🐛 问题反馈

如遇问题请提供：浏览器版本、脚本版本、具体网址、F12 控制台错误信息。

## 📄 许可证

MIT License
