#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 设置项目根目录（假设 scripts 和 web 在同一层级）
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
# 设置工作目录为 web 目录
WORK_DIR="$PROJECT_DIR"

# 切换到 web 目录
cd "$WORK_DIR"

# 定义应用相关变量
APP_MODULE="app:app"  # 修改为正确的模块路径
HOST="0.0.0.0"
PORT="5000"
WORKERS=4
THREADS=2
LOG_DIR="$WORK_DIR/logs"  # 确保日志目录在 web 目录下
LOG_LEVEL="info"

# 创建日志目录（如果不存在）
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR"
fi

# 检查是否安装了 Gunicorn
if ! command -v gunicorn > /dev/null; then
    echo "Error: Gunicorn is not installed. Please install it with 'pip install gunicorn'."
    exit 1
fi

# 启动 Gunicorn
echo "Starting Gunicorn with $WORKERS workers on $HOST:$PORT..."
echo "Working directory: $WORK_DIR"
gunicorn \
    --bind "$HOST:$PORT" \
    --workers "$WORKERS" \
    --threads "$THREADS" \
    --access-logfile "$LOG_DIR/access.log" \
    --error-logfile "$LOG_DIR/error.log" \
    --log-level "$LOG_LEVEL" \
    "$APP_MODULE"

echo "Gunicorn started. Check logs in $LOG_DIR for details."