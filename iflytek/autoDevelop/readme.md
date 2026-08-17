# 前端ZIP包自动部署系统

> 基于n8n工作流的前后端统一自动化部署解决方案

## 📖 项目概述

本项目扩展了现有的n8n自动部署工作流，在保持后端JAR包部署功能的基础上，新增了**前端ZIP包自动部署**能力，实现：

✅ 上传ZIP文件自动解压到指定目录  
✅ 智能排除配置文件（保护生产环境配置）  
✅ 自动备份旧版本  
✅ 飞书通知部署结果  
✅ 完全向后兼容现有JAR包部署  

## 🎯 核心特性

### 1. 统一的部署入口
- 同一个Webhook同时支持JAR和ZIP文件
- 前端页面自动识别文件类型
- 无需修改现有的部署流程

### 2. 配置文件保护
- 支持排除指定配置文件（如 config.json）
- 用户可选择是否排除（前端勾选框）
- 适合多环境部署场景

### 3. 安全的备份机制
- JAR包：单文件备份
- ZIP包：整个目录打包备份（tar.gz）
- 支持手动回滚

### 4. 智能流程控制
- 前端部署跳过重启服务
- 前端部署跳过端口探活
- 后端继续使用完整的重启+探活流程

## 📁 项目结构

```
autoDeploy/
├── n8n_develop.json                          # 原始工作流配置（备份）
├── n8n_develop_upgraded.json                 # ⭐ 升级后的工作流配置
├── uploadJar.html                            # 原始上传页面（仅JAR）
├── uploadFile.html                           # ⭐ 新版上传页面（JAR+ZIP）
├── upgraded_path_conversion.py               # 路径转换节点代码
├── upgraded_backup_replace.sh                # 备份替换节点代码
├── docs/
│   ├── implementation/
│   │   └── 前端ZIP包部署实施文档.md          # 详细技术文档
│   └── 快速使用指南.md                       # 快速上手指南
└── README-前端部署.md                        # 本文件
```

## 🚀 快速开始

### 1. 导入工作流

```bash
# 方式1：在n8n界面导入
打开 http://172.31.160.184:5678/workflow/CCuqWj9nv9ucjsIM
点击 "..." → "Import from File"
选择 n8n_develop_upgraded.json

# 方式2：直接复制JSON到编辑器
```

### 2. 配置前端包

在 `路径转换` 节点添加你的前端包配置：

```python
zip_file_map = {
    "tsManagementClientWeb.zip": {
        "targetDir": "/iflytek/server/zhft-4.0-mysql/zhft-web/tsManagementClientWeb",
        "excludeFiles": ["config.json"],
        "needRestart": False,
    },
}
```

### 3. 上传部署

```bash
# 使用前端页面
打开 uploadFile.html → 选择"前端ZIP包" → 上传

# 使用curl命令
curl -X POST \
  --data-binary "@your-app.zip" \
  "http://172.31.160.184:5678/webhook/uploadJar?fileName=your-app.zip&excludeConfig=true"
```

## 📋 使用示例

### 场景1：首次部署前端项目

```bash
# 1. 打包前端项目
cd your-frontend-project/dist
zip -r ../frontend-app.zip .

# 2. 首次部署不排除配置文件
curl -X POST \
  --data-binary "@../frontend-app.zip" \
  "http://172.31.160.184:5678/webhook/uploadJar?fileName=frontend-app.zip&excludeConfig=false"

# 3. 登录服务器，修改生产配置
ssh user@server
vi /path/to/target/config.json  # 修改为生产环境配置
```

### 场景2：日常更新部署

```bash
# 打包并上传（排除配置文件）
cd your-frontend-project/dist
zip -r ../frontend-app.zip .
curl -X POST \
  --data-binary "@../frontend-app.zip" \
  "http://172.31.160.184:5678/webhook/uploadJar?fileName=frontend-app.zip&excludeConfig=true"
```

### 场景3：后端JAR包部署（保持不变）

```bash
# 原有的JAR包部署方式完全不变
curl -X POST \
  --data-binary "@service.jar" \
  "http://172.31.160.184:5678/webhook/uploadJar?fileName=ts-service-5.0.jar"
```

## 🔧 技术实现

### 工作流节点改造

| 节点名称 | 改造内容 | 技术要点 |
|---------|---------|---------|
| 路径转换 | 增加文件类型识别和ZIP配置映射 | Python字典配置、文件扩展名判断 |
| ssh备份并替换 | 增加ZIP解压和rsync同步逻辑 | unzip、rsync --exclude、条件分支 |
| 重启服务 | 增加needRestart判断 | 前端跳过重启 |
| 探活 | 增加文件类型判断 | 前端直接返回成功 |

### 关键技术点

**1. 配置文件排除（rsync）**
```bash
rsync -av --exclude=config.json --exclude=app.config.js source/ target/
```

**2. 目录备份（tar）**
```bash
tar -czf backup/backup_$(date +%Y%m%d%H%M%S).tar.gz target_dir/
```

**3. 条件流程控制**
```python
if is_zip:
    need_restart = False  # 前端不重启
    service_port = None   # 前端不探活
elif is_jar:
    need_restart = True   # 后端重启
    service_port = 9191   # 后端探活
```

## 📊 对比说明

### 升级前后对比

| 功能 | 升级前 | 升级后 |
|-----|-------|-------|
| 支持文件类型 | 仅JAR | JAR + ZIP |
| 前端部署 | ❌ 不支持 | ✅ 支持 |
| 配置文件保护 | ❌ | ✅ 可选排除 |
| 重启控制 | 统一重启 | 按类型控制 |
| 探活机制 | 端口探活 | JAR探活，ZIP跳过 |
| 向后兼容 | - | ✅ 完全兼容 |

### 部署流程对比

**后端JAR包（无变化）**
```
上传 → 识别 → 备份 → 替换 → 重启 → 探活 → 通知
```

**前端ZIP包（新增）**
```
上传 → 识别 → 备份 → 解压 → 排除配置 → 同步 → 通知
                              ↓
                       （跳过重启和探活）
```

## ⚙️ 配置参数说明

### URL参数

| 参数 | 类型 | 必填 | 说明 | 示例 |
|-----|------|------|------|------|
| fileName | string | ✅ | 上传的文件名（需在配置映射中） | tsManagementClientWeb.zip |
| excludeConfig | boolean | ❌ | 是否排除配置文件（默认true） | true/false |

### zip_file_map 配置

```python
{
    "文件名.zip": {
        "targetDir": "目标目录绝对路径",
        "excludeFiles": ["要排除的文件1", "要排除的文件2"],
        "needRestart": False  # 前端一般为False
    }
}
```

## 📚 文档导航

- **快速上手**：`docs/快速使用指南.md`
- **详细文档**：`docs/implementation/前端ZIP包部署实施文档.md`
- **工作流配置**：`n8n_develop_upgraded.json`
- **前端页面**：`uploadFile.html`

## 🐛 常见问题

### Q1: 首次部署应该排除配置文件吗？

**A**: 首次部署建议**不排除**（`excludeConfig=false`），让所有文件都部署上去。后续更新时再**排除配置文件**。

### Q2: 如何知道配置文件被成功排除了？

**A**: 查看n8n执行日志中 `ssh备份并替换` 节点的输出，会显示：
```
将排除文件: config.json
使用rsync同步文件，排除配置文件...
```

### Q3: 部署后前端页面报错404？

**A**: 检查以下几点：
1. ZIP包结构是否正确（平铺或单层目录）
2. 目标路径配置是否正确
3. Web服务器（Nginx/Apache）配置是否正确

### Q4: 后端JAR包部署还能用吗？

**A**: 完全兼容！后端JAR包部署逻辑**没有任何改动**，继续按原来的方式使用即可。

## 🔄 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v2.0 | 2026-08-17 | 新增前端ZIP包部署支持 |
| v1.0 | 之前 | 初始JAR包部署功能 |

## 📞 技术支持

- n8n工作流：http://172.31.160.184:5678/workflow/CCuqWj9nv9ucjsIM
- 部署页面：http://172.31.160.184/uploadFile.html（部署后访问）
- 问题反馈：通过飞书群组联系开发团队

---

**注意**：首次使用前请仔细阅读 `docs/快速使用指南.md` 和 `docs/implementation/前端ZIP包部署实施文档.md`
