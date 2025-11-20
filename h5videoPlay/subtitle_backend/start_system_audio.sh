#!/bin/bash
# 启动系统音频实时字幕翻译服务

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Python 版本
python_version=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
echo "使用 Python 版本: $python_version"

# 安装依赖
echo "检查并安装依赖..."
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 检查系统类型
system=$(uname -s)
echo "检测到系统: $system"

# macOS 提示
if [ "$system" == "Darwin" ]; then
    echo ""
    echo "⚠️  macOS 系统音频捕获提示："
    echo "1. 需要安装虚拟音频设备来捕获系统声音："
    echo "   - 推荐: BlackHole (https://github.com/ExistentialAudio/BlackHole)"
    echo "   - 或: Soundflower"
    echo ""
    echo "2. 安装后，在系统设置 > 声音 > 输出中选择 BlackHole"
    echo "3. 然后在系统设置 > 声音 > 输入中选择 BlackHole"
    echo ""
    echo "4. 或者使用音频路由工具（如 Loopback）"
    echo ""
fi

# Windows 提示
if [[ "$system" == MINGW* ]] || [[ "$system" == MSYS* ]] || [[ "$system" == CYGWIN* ]]; then
    echo ""
    echo "⚠️  Windows 系统音频捕获提示："
    echo "1. 需要启用立体声混音或安装虚拟音频设备："
    echo "   - 在声音设置中启用 '立体声混音'"
    echo "   - 或安装 VB-Audio Virtual Cable"
    echo ""
fi

# 启动服务
echo "================================"
echo "启动系统音频实时字幕翻译服务..."
echo "按 Ctrl+C 停止服务"
echo "================================"
echo ""

python3 system_audio_subtitle.py --target-lang zh-CN

