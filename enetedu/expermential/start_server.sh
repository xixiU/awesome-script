#!/bin/bash

# TS 代理服务器启动脚本

echo "==================================="
echo "   TS 代理服务器启动脚本"
echo "==================================="
echo ""

# 进入脚本所在目录
cd "$(dirname "$0")"

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 Python 3"
    echo "请先安装 Python 3: https://www.python.org/"
    exit 1
fi

echo "✓ Python 版本: $(python3 --version)"

# 检查 example.ts 文件是否存在
if [ ! -f "example.ts" ]; then
    echo "❌ 错误: 未找到 example.ts 文件"
    echo "请确保 example.ts 文件在当前目录下"
    exit 1
fi

echo "✓ TS 文件已找到: example.ts ($(du -h example.ts | cut -f1))"

# 检查并安装依赖
if ! python3 -c "import flask" 2>/dev/null; then
    echo ""
    echo "正在安装 Python 依赖..."
    pip3 install -r requirements.txt
    
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        echo "请手动运行: pip3 install -r requirements.txt"
        exit 1
    fi
    echo "✓ 依赖安装成功"
fi

echo ""
echo "==================================="
echo "   正在启动服务器..."
echo "==================================="
echo ""

# 启动服务器
python3 ts_proxy_server.py

