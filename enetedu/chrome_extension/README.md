# 教师网课助手 Pro - 开发者文档

本文档包含插件的开发、混淆构建、打包发布以及授权管理流程。

## 目录结构说明

```text
chrome_extension/
├── admin/                  # 【管理员专用】
│   ├── 1_generate_keys.js  # 生成RSA密钥对（首次运行一次即可）
│   ├── 2_issue_license.js  # 给客户生成授权码
│   └── private_key.pem     # 私钥（严禁泄露！）
├── extension/              # 【插件源码】（开发时加载此目录）
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── content.src.js      # 核心逻辑源码（开发改这里）
│   ├── content.js          # 混淆后的代码（发布用这个）
│   ├── inject.js           # 注入页面的脚本
│   ├── public_key.js       # 公钥（自动生成）
│   └── icons/
├── build.js                # 构建脚本（负责混淆代码）
├── package.json            # 项目依赖配置
└── README.md               # 本文档
```

---

## 一、 环境搭建

你需要安装 Node.js 环境。

1. **初始化项目**
   在 `chrome_extension` 目录下打开终端：

   ```bash
   npm init -y
   ```

2. **安装混淆工具**
   *注意：如果你遇到权限错误（EPERM），请尝试使用管理员身份打开终端，或清理 npm 缓存。*

   ```bash
   npm install --save-dev javascript-obfuscator fs-extra
   ```

---

## 二、 开发与构建（代码混淆）

为了保护核心逻辑，我们需要将 `content.src.js`（源码）混淆为 `content.js`（发布代码）。

### 1. 准备工作
将现有的 `extension/content.js` 重命名为 `extension/content.src.js`，作为你的开发源码。

### 2. 创建构建脚本
在 `chrome_extension` 根目录下创建 `build.js` 文件，内容如下：

```javascript
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// 配置路径
const srcPath = path.join(__dirname, 'extension', 'content.src.js');
const distPath = path.join(__dirname, 'extension', 'content.js');

console.log('正在读取源码:', srcPath);
const code = fs.readFileSync(srcPath, 'utf8');

console.log('正在进行混淆保护...');
const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
    compact: true,                      // 压缩代码
    controlFlowFlattening: true,        // 控制流扁平化（核心保护）
    controlFlowFlatteningThreshold: 0.75,
    numbersToExpressions: true,         // 数字变表达式
    simplify: true,                     // 简化
    stringArray: true,                  // 字符串加密
    stringArrayEncoding: ['base64'],    // 字符串编码方式
    splitStrings: true,                 // 分割字符串
    stringArrayThreshold: 0.75,
    // debugProtection: true,           // 防调试（可选，会卡死开发者工具）
    // disableConsoleOutput: true,      // 禁用控制台输出（如果需要看日志请关闭此项）
    selfDefending: true                 // 自我保护
});

console.log('写入混淆代码:', distPath);
fs.writeFileSync(distPath, obfuscationResult.getObfuscatedCode());

console.log('✅ 构建完成！请发布 extension 目录。');
```

### 3. 运行构建
每次修改完源码后，运行以下命令生成混淆代码：

```bash
node build.js
```

构建成功后，`extension/content.js` 将变成难以阅读的乱码，但功能保持不变。

---

## 三、 授权管理（如何卖卡密）

### 1. 初始化密钥（仅第一次）
运行以下命令，生成你的专属私钥和公钥：

```bash
node admin/1_generate_keys.js
```
*   `admin/private_key.pem`: **私钥**。这是你的印钞机，千万不要发给别人，也不要打包进插件里。
*   `extension/public_key.js`: **公钥**。会自动写入插件目录，用于验证签名。

### 2. 生成客户授权码
当用户付费后，修改 `admin/2_issue_license.js` 中的配置：

```javascript
const userNote = '客户张三';      // 备注
const deadline = '2025-12-31';   // 过期时间
```

然后运行：

```bash
node admin/2_issue_license.js
```

终端会输出一串字符（例如 `eyJh...`），这就是**激活码**。发送给用户即可。

---

## 四、 插件发布与安装

1. **打包**
   *   确保已经运行过 `node build.js`。
   *   将 `extension` 文件夹打包为 `extension.zip`。
   *   或者直接发送 `extension` 文件夹给用户。

2. **用户安装**
   *   打开 Chrome 浏览器，访问 `chrome://extensions/`。
   *   开启右上角 **"开发者模式"**。
   *   点击 **"加载已解压的扩展程序"**。
   *   选择 `extension` 文件夹。

3. **用户激活**
   *   点击浏览器右上角的插件图标。
   *   粘贴你发给他的 **激活码**。
   *   点击激活，开始使用。

---

## 常见问题

**Q: 我修改了代码，为什么插件没变化？**
A: 每次修改 `content.src.js` 后，必须运行 `node build.js`，然后在 Chrome 扩展页面点击 **"刷新"** 按钮（环形箭头）。

**Q: 混淆后的代码报错怎么办？**
A: 混淆可能会破坏某些依赖特定变量名的逻辑。如果报错，请检查 `build.js` 中的混淆配置，尝试降低保护强度（例如关闭 `renameGlobals`）。

**Q: 如何防止用户修改系统时间破解？**
A: 代码中已经内置了 `fetch(window.location.origin)` 获取服务器时间头的逻辑。只要用户联网，修改本地时间是无效的。

