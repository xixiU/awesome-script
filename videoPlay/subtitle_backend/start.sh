#!/bin/bash
# 启动字幕翻译服务

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 使用conda
conda activate base

# 检查 Python 版本
python_version=$(python3 --version 2>&1 | awk '{print $2}' | cut -d. -f1,2)
echo "使用 Python 版本: $python_version"

# 创建虚拟环境（如果不存在）
# if [ ! -d "venv" ]; then
#     echo "创建虚拟环境..."
#     python3 -m venv venv
# fi

# 激活虚拟环境
# source venv/bin/activate

# 安装依赖
echo "检查并安装依赖..."
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 启动服务
echo "启动字幕翻译服务..."
echo "服务地址: http://localhost:8765"
echo "按 Ctrl+C 停止服务"
echo "================================"

python server.py

