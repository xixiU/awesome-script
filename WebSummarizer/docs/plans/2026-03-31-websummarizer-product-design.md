# WebSummarizer 产品化设计文档

> 创建日期：2026-03-30  
> 状态：设计已确认，待排期实现  
> 前置文档：[Chrome 插件迁移设计](./2026-03-30-websummarizer-chrome-extension-design.md)

---

## 一、产品定位

WebSummarizer 从个人工具升级为**对外提供服务的 AI 阅读增强产品**，参考「沉浸式翻译」的产品模式：

- 用户安装 Chrome 插件即可使用
- 提供账号体系，数据云端同步
- 核心功能：AI 总结 + 网页收藏（含备注）
- 配套独立 Web 管理页面，查看和管理所有收藏

**产品阶段规划：**

| 阶段 | 目标 | 关键功能 |
|---|---|---|
| MVP | 跑通产品闭环 | 登录、收藏、备注、插件内收藏列表 |
| V2 | 提升留存 | 独立 Web 管理页、标签/分类、搜索 |
| V3 | 商业化 | 付费会员、AI 额度管理、团队共享 |

---

## 二、技术架构

### 整体架构图

```
┌─────────────────────────────────────────────────────┐
│                   用户设备                           │
│  ┌──────────────────────────────────────────────┐   │
│  │          Chrome Extension (插件)              │   │
│  │                                              │   │
│  │  content.js      ← 注入页面，AI总结 + 收藏按钮  │   │
│  │  popup.html      ← 快捷操作 + 登录状态         │   │
│  │  options.html    ← AI配置 + 功能开关           │   │
│  │  service_worker  ← AI API调用 + Supabase调用   │   │
│  └──────────────────────────────────────────────┘   │
│                        │                            │
│                 chrome.runtime                       │
└────────────────────────┼────────────────────────────┘
                         │ HTTPS
            ┌────────────▼────────────┐
            │      Supabase           │
            │  ┌─────────────────┐   │
            │  │  Auth           │   │  ← GitHub / Google OAuth
            │  │  (JWT Token)    │   │
            │  └────────┬────────┘   │
            │           │            │
            │  ┌────────▼────────┐   │
            │  │  PostgreSQL DB  │   │  ← bookmarks 表（RLS 保护）
            │  └─────────────────┘   │
            └─────────────────────────┘
                         │
            ┌────────────▼────────────┐
            │  Web 管理页（Vercel）    │  ← 静态 HTML + Supabase SDK
            │  bookmarks.vercel.app   │  ← OAuth 回调也在此处理
            └─────────────────────────┘
```

### 关键技术决策

| 决策点 | 选型 | 理由 |
|---|---|---|
| 用户认证 | Supabase Auth | 内置 GitHub/Google OAuth，无需自建授权服务 |
| 数据存储 | Supabase PostgreSQL | 与 Auth 无缝集成，RLS 行级安全保护数据 |
| 插件 ↔ 后端 | Supabase JS SDK | 直连，无中间服务器，零运维 |
| Web 管理页 | Vercel 静态部署 | 免费、稳定，支持自定义域名，OAuth 回调友好 |
| API Key 管理 | anon key 内置插件 | Supabase anon key 是公开安全的，RLS 保护数据隔离 |

---

## 三、数据模型

### Supabase 数据库表设计

#### `bookmarks` 表

```sql
CREATE TABLE bookmarks (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    url         TEXT NOT NULL,
    title       TEXT NOT NULL,
    note        TEXT DEFAULT '',           -- 用户备注
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 同一用户不能重复收藏同一 URL
CREATE UNIQUE INDEX bookmarks_user_url_idx ON bookmarks(user_id, url);

-- RLS：每个用户只能操作自己的数据
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can only access own bookmarks"
    ON bookmarks FOR ALL
    USING (auth.uid() = user_id);
```

#### `profiles` 表（可选，V2 扩展用）

```sql
CREATE TABLE profiles (
    id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    display_name TEXT,
    avatar_url   TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 四、认证流程

### Chrome 插件 OAuth 登录流程

Chrome 插件无法直接使用浏览器标准 OAuth 重定向（`chrome-extension://` 协议不被 OAuth 提供商支持），需要借助 Web 页面完成授权：

```
1. 用户点击插件 popup 中的"GitHub 登录"
        ↓
2. service_worker 调用 chrome.tabs.create()
   打开 Vercel 网页的登录页：
   https://bookmarks.vercel.app/auth/login?provider=github
        ↓
3. 网页调用 supabase.auth.signInWithOAuth({ provider: 'github' })
   跳转到 GitHub 授权页
        ↓
4. 用户授权完成，GitHub 回调到：
   https://bookmarks.vercel.app/auth/callback
        ↓
5. Supabase 回调页解析 URL 中的 token，存储 session
   然后通过 postMessage 或 URL scheme 通知插件：
   chrome.runtime.sendMessage(extensionId, { type: 'AUTH_SUCCESS', token: '...' })
        ↓
6. service_worker 收到 token，存入 chrome.storage.local
   关闭授权 tab，更新 popup 登录状态
```

### Token 存储与刷新

- Access Token 存储：`chrome.storage.local`（不用 session storage，插件重启不丢失）
- Token 过期：Supabase token 默认 1 小时过期，使用 Refresh Token 静默续期
- 登出：清除 `chrome.storage.local` 中的 token，调用 Supabase `signOut()`

---

## 五、插件 UI 改动

### Popup 页面新增内容

```
┌─────────────────────────┐
│  📝 WebSummarizer  v2.0 │
├─────────────────────────┤
│  👤 未登录              │
│  [GitHub 登录] [Google] │
├─────────────────────────┤  ← 登录后显示：
│  👤 @username           │
│  已收藏 42 个网页        │
├─────────────────────────┤
│  [📝 AI 总结当前页面]   │
│  [⭐ 收藏当前页面]      │  ← 新增
│  [📚 查看我的收藏]      │  ← 新增
├─────────────────────────┤
│  [⚙️ 设置]              │
└─────────────────────────┘
```

### 收藏弹窗（点击"收藏当前页面"时）

在当前页面弹出一个轻量 Modal：

```
┌──────────────────────────────┐
│  ⭐ 收藏网页                  │
├──────────────────────────────┤
│  标题：【自动填入页面标题】    │
│  链接：【自动填入当前 URL】    │
│                              │
│  备注（可选）：               │
│  ┌──────────────────────┐    │
│  │ 输入备注...           │    │
│  └──────────────────────┘    │
│                              │
│  [取消]        [确认收藏]     │
└──────────────────────────────┘
```

### 插件内收藏列表（Popup 中"查看我的收藏"展开）

显示最近 10 条收藏，每条显示：
- 网站 favicon + 标题（可点击跳转）
- 收藏时间
- 备注摘要（超长截断）
- 删除按钮

---

## 六、Web 管理页（Vercel）

### 页面结构

```
bookmarks.vercel.app/
├── index.html          ← 收藏列表主页（需登录）
├── auth/
│   ├── login.html      ← 登录入口（GitHub/Google）
│   └── callback.html   ← OAuth 回调处理，通知插件
```

### 主页功能（V2 实现）

- 收藏列表（分页或无限滚动）
- 搜索框（按标题/URL/备注搜索）
- 点击标题跳转原网页
- 编辑备注
- 删除收藏
- 导出为 CSV / JSON

---

## 七、新增文件规划

### 插件端新增文件

```
chrome_extension/
├── modules/
│   └── bookmark-manager.js   ← 收藏的 CRUD 操作（Supabase SDK 封装）
├── modules/
│   └── auth-manager.js       ← 登录/登出/Token 管理
├── lib/
│   └── supabase.js           ← Supabase 客户端初始化（含 anon key）
└── content/
    └── bookmark-modal.js     ← 收藏弹窗 UI（注入页面）
    └── bookmark-modal.css
```

### Web 管理页新增目录

```
WebSummarizer/
└── web/                      ← 部署到 Vercel
    ├── index.html
    ├── auth/
    │   ├── login.html
    │   └── callback.html
    ├── js/
    │   ├── supabase.js
    │   ├── auth.js
    │   └── bookmarks.js
    └── css/
        └── style.css
```

---

## 八、安全考量

| 风险 | 应对措施 |
|---|---|
| anon key 暴露在插件代码中 | Supabase anon key 设计上就是公开的，RLS 策略保证数据隔离 |
| 用户数据隔离 | RLS `auth.uid() = user_id` 策略，每个用户只能访问自己的数据 |
| Token 泄露 | Token 仅存 `chrome.storage.local`，不传给第三方，定期 refresh |
| CSRF | Supabase OAuth 流程自带 state 参数防 CSRF |
| XSS | 收藏弹窗 UI 使用 DOM API 创建元素，不使用 innerHTML |

---

## 九、MVP 任务清单

### 阶段一：基础设施

- [ ] 创建 Supabase 项目，配置 GitHub/Google OAuth
- [ ] 创建 `bookmarks` 表，配置 RLS 策略
- [ ] 注册 Vercel 项目，配置 OAuth 回调域名

### 阶段二：认证模块

- [ ] 实现 `auth-manager.js`（登录/登出/token 存储/刷新）
- [ ] 实现 `web/auth/login.html`（登录入口页）
- [ ] 实现 `web/auth/callback.html`（OAuth 回调 + 通知插件）
- [ ] 更新 popup：显示登录状态 + 登录/登出按钮

### 阶段三：收藏功能

- [ ] 实现 `bookmark-manager.js`（增删查 Supabase 操作）
- [ ] 实现收藏弹窗 UI（`bookmark-modal.js`）
- [ ] popup 中新增收藏按钮 + 收藏列表展示
- [ ] 处理重复收藏（已收藏则改为"取消收藏"或"编辑备注"）

### 阶段四：Web 管理页（V2）

- [ ] 实现 `web/index.html` 收藏列表主页
- [ ] 配置 Vercel 部署

---

## 十、变更记录

| 日期 | 内容 |
|---|---|
| 2026-03-30 | 初版产品化设计文档，完成架构探讨与方案确认 |
