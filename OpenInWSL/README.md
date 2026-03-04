# WSL 右键菜单

在 Windows 资源管理器中注册「在 WSL 中打开」右键菜单，右键点击任意文件夹即可一键进入对应的 WSL 路径。

## 原理

向注册表写入两条记录，资源管理器启动时读取它们来构建右键菜单：

| 注册表路径 | 触发时机 |
|---|---|
| `HKCR\Directory\Background\shell` | 右键点击文件夹**内部空白处** |
| `HKCR\Directory\shell` | 右键点击**文件夹图标**本身 |

执行命令为 `wt.exe wsl.exe --cd "%V"`（无 Windows Terminal 时降级为 `wsl.exe --cd "%V"`），`%V` 由资源管理器自动注入为当前路径，`wsl --cd` 原生支持 Windows 路径并自动转换为 `/mnt/...`。

## 使用方法

在 PowerShell 中执行（脚本会自动弹 UAC 提权，无需手动以管理员身份打开）：

```powershell
# 安装
.\setup.ps1

# 卸载（完全还原注册表，不留痕迹）
.\setup.ps1 -Uninstall

# 强制指定终端（默认 auto 自动检测）
.\setup.ps1 -Terminal wt    # 强制使用 Windows Terminal
.\setup.ps1 -Terminal wsl   # 强制使用 WSL 默认终端
```

## 前提条件

- 已安装 WSL（Windows Subsystem for Linux）
- PowerShell 5.1+（Windows 10 自带）
- 可选：Windows Terminal（安装后自动优先使用）
