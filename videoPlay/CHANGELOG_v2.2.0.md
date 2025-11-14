# v2.2.0 更新日志

## 📅 更新日期

2024-11-14

## 🎯 本次更新概述

本次更新实现了两大核心功能：

1. **实时字幕翻译系统** - 完整的语音识别和翻译功能
2. **ConfigManager 集成** - 统一配置管理和国际化支持

## 🌍 新增功能：实时字幕翻译

### 核心特性

#### 1. 字幕识别和翻译

- **语音识别**：基于 faster-whisper
- **多语言翻译**：支持 12+ 种语言
- **实时处理**：每 5 秒捕获和处理音频
- **智能同步**：字幕与视频时间精确同步

#### 2. 用户界面

**智能按钮添加：**

- 自动检测播放器控制栏
- 支持 7+ 种主流播放器
- 浮动按钮作为降级方案

**支持的播放器：**

- ✅ Bilibili（B站）- `.bpx-player-control-bottom-right`
- ✅ YouTube - `.ytp-right-controls`
- ✅ 西瓜视频/抖音 - `.xgplayer-controls`
- ✅ 阿里播放器 - `.prism-controlbar`
- ✅ DPlayer - `.dplayer-icons-right`
- ✅ Video.js - `.vjs-control-bar`
- ✅ 通用播放器 - `.control-bar-right`

**字幕显示：**

- 位置：视频底部居中
- 样式：白色文字 + 黑色半透明背景
- 效果：文字阴影，提高可读性
- 适配：自动换行，不遮挡控制栏

#### 3. 控制方式

**快捷键：**

- **S 键** - 开启/关闭字幕

**按钮：**

- 控制栏字幕按钮（📝 图标）
- 浮动按钮（右下角）

**油猴菜单：**

- ⚙️ 字幕翻译配置
- 🔄 重启字幕服务

#### 4. 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| serverUrl | `http://localhost:8765` | 后端服务地址 |
| targetLanguage | `zh-CN` | 目标翻译语言 |
| autoTranslate | `true` | 是否自动翻译 |
| captureInterval | `5` | 音频捕获间隔（秒） |

### 技术实现

#### 前端（JavaScript）

```javascript
class SubtitleService {
    - 音频捕获（captureStream + MediaRecorder）
    - 定时录制（每 5 秒）
    - 后端通信（Fetch API）
    - 字幕管理（时间戳同步）
    - UI 创建和更新
}
```

**新增代码：** 243 行

#### 后端（Python）

```python
- FastAPI 服务器
- faster-whisper 语音识别
- Google Translator 翻译
- 异步处理和文件管理
```

**文件：**

- `subtitle_backend/server.py` - 主服务
- `subtitle_backend/requirements.txt` - 依赖
- `subtitle_backend/start.sh` - 启动脚本
- `subtitle_backend/test_api.py` - API 测试

## 🔧 ConfigManager 集成优化

### 增强的 ConfigManager

在 `/common/config_manager.js` 中添加：

#### 新增方法

```javascript
// 1. 国际化文本
t(key, defaultText)

// 2. 国际化菜单注册
registerMenuCommand(textKey, callback, icon)

// 3. 批量菜单注册
registerMenuCommands(commands)

// 4. 简化配置对话框
createSimpleDialog(fields, onSave)

// 5. 切换型菜单
createToggleMenu(titleKey, saveKey, defaultValue)
```

#### 构造函数增强

```javascript
// 新增 options 参数（可选，保持向后兼容）
constructor(configName, defaultConfig = {}, options = {})

options: {
    lang: 'zh',      // 当前语言
    i18n: { ... }    // 国际化文本对象
}
```

### html5videoPlay.js 简化

#### 菜单注册优化

**优化前（~50 行）：**

```javascript
GM_registerMenuCommand('⚙️ 字幕翻译配置', () => {
    const currentServer = GM_getValue('subtitle_serverUrl', 'http://localhost:8765');
    const newServer = prompt('后端服务地址:\n...', currentServer);
    if (newServer && newServer !== currentServer) {
        GM_setValue('subtitle_serverUrl', newServer);
        tip('服务地址已更新');
    }
    // ... 重复的代码
});
```

**优化后（~20 行）：**

```javascript
const dialog = videoConfigManager.createSimpleDialog([
    { key: 'subtitle_serverUrl', labelKey: 'serverUrl', type: 'text' },
    { key: 'subtitle_targetLang', labelKey: 'targetLang', type: 'text' },
    { key: 'subtitle_autoTranslate', labelKey: 'autoTranslate', type: 'checkbox' }
], (updates) => {
    // 统一的保存处理
});

videoConfigManager.registerMenuCommand('subtitleConfig', dialog, '⚙️');
```

**代码减少：** 60%

### 国际化支持

现在所有菜单命令支持三种语言：

| 功能 | 中文 | English | Italiano |
|------|------|---------|----------|
| 帮助 | 脚本功能快捷键表 | Hotkeys list | Elenco dei tasti |
| 字幕配置 | 字幕翻译配置 | Subtitle Translation Config | Configurazione traduzione |
| 重启服务 | 重启字幕服务 | Restart Subtitle Service | Riavvia servizio |
| 记忆速度 | 记忆播放速度 | Remember playback speed | Memorizza velocità |

## 📊 代码变更统计

### html5videoPlay.js

| 变更类型 | 行数 |
|---------|------|
| 新增 | +463 行 |
| 修改 | ~30 行 |
| 删除 | -0 行 |
| **总计** | **1,621 行** |

**主要新增部分：**

- SubtitleService 类：243 行
- 按钮创建方法：100 行
- 配置管理器集成：60 行
- 国际化文本：60 行

### config_manager.js

| 变更类型 | 行数 |
|---------|------|
| 新增 | +140 行 |
| 修改 | ~5 行 |
| **总计** | **727 行** |

**新增功能：**

- 国际化支持：~80 行
- 菜单注册方法：~60 行

### 文档

| 文档 | 大小 | 说明 |
|------|------|------|
| README.md | 9.3K | 更新主文档 |
| INTEGRATED_SUBTITLE_GUIDE.md | 5.6K | 集成字幕指南 |
| CONFIG_MANAGER_INTEGRATION.md | 新增 | 配置管理器集成说明 |
| INTEGRATION_SUMMARY.md | 6.1K | 集成总结 |
| SUBTITLE_QUICKREF.md | 1.3K | 快速参考 |
| subtitle_backend/README.md | 新增 | 后端服务文档 |

## 🎨 用户体验改进

### 字幕功能

**使用步骤简化：**

```
1. 启动后端: ./start.sh
2. 按 S 键
3. 完成！
```

**控制方式多样：**

- 快捷键（S）
- 控制栏按钮
- 浮动按钮
- 油猴菜单

**配置更简单：**

- 图形化配置界面（prompt）
- 国际化提示信息
- 实时配置更新
- 配置持久化

### 菜单系统

**优化前：**

- 菜单文本硬编码
- 没有图标
- 配置界面繁琐

**优化后：**

- ⚙️ 字幕翻译配置（图标+文本）
- 🔄 重启字幕服务（图标+文本）
- √ 记忆播放速度（勾选标记）
- 自动国际化

## 🔄 向后兼容性

### ConfigManager

**完全兼容现有脚本：**

```javascript
// 旧代码（继续工作）
const manager = new ConfigManager('名称', { key: 'value' });
manager.init([...]);
manager.get('key');
manager.set('key', 'newValue');

// 新代码（可选升级）
const manager = new ConfigManager('名称', { key: 'value' }, {
    lang: 'zh',
    i18n: { ... }
});
manager.registerMenuCommand('config', callback, '⚙️');
```

**不需要修改：**

- ✅ difyWebSummarizer
- ✅ SQLGeneratorHelper
- ✅ 其他使用 ConfigManager 的脚本

### html5videoPlay.js

**保留所有原有功能：**

- ✅ 所有快捷键
- ✅ 所有播放控制
- ✅ 所有网站适配
- ✅ 所有用户配置

**新增功能：**

- ✅ 字幕翻译（可选）
- ✅ 配置管理器
- ✅ 国际化菜单

## 🐛 修复的问题

### 字幕相关

- ✅ 无字幕功能 → 完整的字幕系统
- ✅ 配置分散 → 统一配置管理

### 配置管理

- ✅ 菜单代码冗余 → 简洁的声明式配置
- ✅ 无国际化 → 完整的多语言支持
- ✅ 硬编码文本 → 国际化文本管理

## 📝 文件清单

### 新增文件

**后端服务：**

```
subtitle_backend/
├── server.py (主服务)
├── requirements.txt (依赖)
├── start.sh (启动脚本)
├── test_api.py (测试工具)
├── README.md (文档)
└── .gitignore
```

**文档：**

```
INTEGRATED_SUBTITLE_GUIDE.md
SUBTITLE_QUICKREF.md
INTEGRATION_SUMMARY.md
CONFIG_MANAGER_INTEGRATION.md
CHANGELOG_v2.2.0.md (本文件)
```

**可选脚本：**

```
subtitle_module.js (独立字幕模块，不推荐使用)
```

### 修改文件

**主脚本：**

- `html5videoPlay.js` - 集成字幕功能
- `common/config_manager.js` - 增强国际化

**文档：**

- `README.md` - 更新功能说明
- `PROJECT_SUMMARY.md` - 更新项目总结

## 🚀 升级指南

### 现有用户升级

1. **更新脚本**
   - 复制新版 `html5videoPlay.js`
   - 覆盖旧版本

2. **（可选）使用字幕功能**

   ```bash
   cd subtitle_backend
   ./start.sh
   ```

3. **配置字幕**
   - 油猴菜单 → ⚙️ 字幕翻译配置

### 新用户安装

1. **安装 Tampermonkey**
2. **安装脚本**
   - 复制 `html5videoPlay.js` 内容
3. **使用视频控制**
   - 访问视频网站即可
4. **（可选）启用字幕**
   - 启动后端服务
   - 按 S 键

## 💻 技术细节

### SubtitleService 架构

```javascript
SubtitleService
├── constructor(video, configManager)
├── createSubtitleUI()          // UI 创建
├── initAudioCapture()          // 音频捕获初始化
├── startRecording()            // 开始录制
├── processRecordedAudio()      // 处理音频
├── sendAudioToBackend()        // 发送到后端
├── addSubtitles()              // 添加字幕
├── start()                     // 启动服务
├── stop()                      // 停止服务
└── toggle()                    // 切换状态
```

### ConfigManager 新增 API

```javascript
// 国际化
t(key, defaultText) → string

// 菜单注册
registerMenuCommand(textKey, callback, icon) → void
registerMenuCommands(commands) → void

// 配置对话框
createSimpleDialog(fields, onSave) → function

// 切换菜单
createToggleMenu(titleKey, saveKey, defaultValue) → boolean
```

## 🎨 代码质量提升

### 代码组织

**模块化：**

- SubtitleService 独立封装
- ConfigManager 统一管理
- 清晰的职责划分

**可读性：**

- 详细的注释
- 有意义的命名
- 清晰的结构

**可维护性：**

- 集中的配置
- 统一的错误处理
- 易于扩展

### 国际化实现

**文本组织：**

```javascript
i18n: {
    'zh': { /* 中文 */ },
    'en': { /* 英文 */ },
    'it': { /* 意大利语 */ }
}
```

**自动降级：**

```
当前语言 → zh → en → 默认文本
```

## 📈 性能影响

### 内存占用

| 场景 | 优化前 | 优化后 | 说明 |
|------|--------|--------|------|
| 基础使用 | ~5 MB | ~5 MB | 无影响 |
| 启用字幕 | N/A | ~6-7 MB | 音频缓冲 |
| 后端服务 | N/A | ~1.5-2 GB | Whisper 模型 |

### CPU 使用

| 操作 | CPU 占用 | 说明 |
|------|---------|------|
| 视频播放 | 正常 | 无影响 |
| 音频录制 | +5-10% | 录制期间 |
| 字幕识别 | 后端处理 | 前端无影响 |

## 🔒 安全性和隐私

### 数据处理

- ✅ 音频仅在本地网络传输（localhost）
- ✅ 不上传到云端服务器
- ✅ 临时文件自动清理
- ⚠️ 翻译需要访问 Google Translate API

### 权限使用

- `GM_setValue` / `GM_getValue` - 配置存储
- `GM_xmlhttpRequest` - 后端通信
- `GM_registerMenuCommand` - 菜单注册
- `GM_addStyle` - 样式注入

## 🐛 已知问题和限制

### 浏览器兼容性

- Chrome/Edge: ✅ 完全支持
- Firefox: ✅ 支持（需 captureStream）
- Safari: ⚠️ 部分支持
- Opera: ✅ 支持

### 功能限制

- 音频捕获需要浏览器支持 `captureStream()` API
- 识别准确率受音频质量影响
- 翻译需要网络连接
- 存在 5-10 秒的固有延迟

## 🔮 未来计划

### 短期（v2.3）

- [ ] 优化字幕显示位置
- [ ] 添加字幕样式自定义
- [ ] 支持字幕导出
- [ ] 优化音频捕获性能

### 中期（v2.4-v2.5）

- [ ] 支持离线翻译
- [ ] WebWorker 音频处理
- [ ] 字幕历史记录
- [ ] 多音轨支持

### 长期（v3.0）

- [ ] AI 实时翻译
- [ ] 字幕编辑器
- [ ] 云端配置同步
- [ ] 插件系统

## 📞 反馈和支持

### 问题反馈

1. 打开浏览器控制台（F12）
2. 查看错误信息
3. 查阅相关文档
4. 提交详细的问题报告

### 功能建议

欢迎提出改进建议：

- 新功能想法
- 用户体验改进
- 性能优化建议
- 文档完善

## 🙏 致谢

- **faster-whisper** - 高效的语音识别
- **OpenAI Whisper** - 强大的 AI 模型
- **deep-translator** - 多语言翻译支持
- **FastAPI** - 现代 Web 框架
- **Greasyfork 用户 7036** - 原始脚本作者
- **Dario Costa** - 英语和意大利语翻译
- **所有用户** - 宝贵的反馈和建议

## 📄 许可证

MIT License

---

**v2.2.0 - 让视频观看无语言障碍！** 🌍✨

---

## 附录：完整变更列表

### common/config_manager.js

```diff
+ constructor 添加 options 参数
+ 新增 i18n 和 currentLang 属性
+ 新增 menuCommands 数组
+ 新增 t() 方法 - 国际化文本
+ 新增 registerMenuCommand() 方法
+ 新增 registerMenuCommands() 方法
+ 新增 createSimpleDialog() 方法
+ 新增 createToggleMenu() 方法
```

### videoPlay/html5videoPlay.js

```diff
+ 版本号 2.1.0 → 2.2.0
+ @description 添加"实时字幕翻译"
+ @require config_manager.js
+ 新增 SubtitleService 类（243行）
+ 新增 subtitleService 全局变量
+ 新增 bRateEnabled 全局变量
+ 新增 videoConfigManager 实例
+ 新增 S 键快捷键绑定
+ 新增 addSubtitleButton() 方法
+ 新增 addFloatingSubtitleButton() 方法
+ 简化菜单注册代码（-30行）
+ 更新多语言帮助文本
```

### 新增文件

```
subtitle_backend/
├── server.py
├── requirements.txt
├── start.sh
├── test_api.py
├── README.md
└── .gitignore

INTEGRATED_SUBTITLE_GUIDE.md
SUBTITLE_QUICKREF.md
INTEGRATION_SUMMARY.md
CONFIG_MANAGER_INTEGRATION.md
CHANGELOG_v2.2.0.md
```

---

**版本发布日期：** 2024-11-14
**下一个版本：** v2.3.0（计划中）
