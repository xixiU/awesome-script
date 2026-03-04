# WSL 右键菜单集成工具
# 在 Windows 资源管理器中添加「在 WSL 中打开」右键菜单项
# 用法:
#   安装: .\setup.ps1
#   卸载: .\setup.ps1 -Uninstall
#   指定终端: .\setup.ps1 -Terminal wt   (可选值: wt, wsl, auto，默认 auto)

param(
    [switch]$Uninstall,
    # wt = Windows Terminal, wsl = WSL 默认终端, auto = 自动检测
    [ValidateSet("wt", "wsl", "auto")]
    [string]$Terminal = "auto"
)

# ─── 常量 ────────────────────────────────────────────────────────────────────

$MENU_KEY  = "OpenInWSL"
$MENU_TEXT = "在 WSL 中打开(&W)"
$MENU_ICON = "wsl.exe"

# 注册表路径:
#   Background\shell → 右键点击文件夹空白处
#   Directory\shell  → 右键点击文件夹本身
$REG_PATHS = @(
    "Registry::HKEY_CLASSES_ROOT\Directory\Background\shell\$MENU_KEY",
    "Registry::HKEY_CLASSES_ROOT\Directory\shell\$MENU_KEY"
)

# ─── 管理员提权 ───────────────────────────────────────────────────────────────

function Assert-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal]
        [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "需要管理员权限，正在提权重启..." -ForegroundColor Yellow
        $args = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        if ($Uninstall)            { $args += " -Uninstall" }
        if ($Terminal -ne "auto")  { $args += " -Terminal $Terminal" }
        Start-Process powershell -Verb RunAs -ArgumentList $args
        exit
    }
}

# ─── 检测 Windows Terminal ────────────────────────────────────────────────────

function Get-TerminalCommand {
    if ($Terminal -eq "wt") {
        return "wt.exe wsl.exe --cd `"%V`""
    }
    if ($Terminal -eq "wsl") {
        return "wsl.exe --cd `"%V`""
    }

    # auto: 优先用 Windows Terminal
    $wtPath = (Get-Command wt.exe -ErrorAction SilentlyContinue)?.Source
    if ($wtPath) {
        return "wt.exe wsl.exe --cd `"%V`""
    }
    return "wsl.exe --cd `"%V`""
}

# ─── 安装 ────────────────────────────────────────────────────────────────────

function Install-Menu {
    $cmd = Get-TerminalCommand

    foreach ($path in $REG_PATHS) {
        New-Item -Path $path -Force | Out-Null
        Set-ItemProperty -Path $path -Name "(Default)" -Value $MENU_TEXT
        Set-ItemProperty -Path $path -Name "Icon"      -Value $MENU_ICON

        $cmdPath = "$path\command"
        New-Item -Path $cmdPath -Force | Out-Null
        Set-ItemProperty -Path $cmdPath -Name "(Default)" -Value $cmd
    }

    $termLabel = if ($cmd -match "^wt") { "Windows Terminal" } else { "WSL 默认终端" }
    Write-Host ""
    Write-Host "✅ 安装成功！" -ForegroundColor Green
    Write-Host "   终端程序 : $termLabel" -ForegroundColor Cyan
    Write-Host "   执行命令 : $cmd" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "现在右键点击任意文件夹，即可看到「$MENU_TEXT」选项。" -ForegroundColor White
}

# ─── 卸载 ────────────────────────────────────────────────────────────────────

function Uninstall-Menu {
    $removed = 0
    foreach ($path in $REG_PATHS) {
        if (Test-Path $path) {
            Remove-Item -Path $path -Recurse -Force
            $removed++
        }
    }

    if ($removed -gt 0) {
        Write-Host ""
        Write-Host "✅ 卸载成功，已移除 $removed 个注册表项。" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "ℹ️  未找到已安装的菜单项，无需卸载。" -ForegroundColor Yellow
    }
}

# ─── 入口 ────────────────────────────────────────────────────────────────────

Assert-Admin

if ($Uninstall) {
    Uninstall-Menu
} else {
    Install-Menu
}
