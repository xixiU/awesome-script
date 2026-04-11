#!/bin/bash

# ==================== 验证码识别服务生产环境启动脚本 ====================
# Captcha Recognition Service Production Startup Script
# ====================================================================

# 脚本配置
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="captcha-recognition"
PYTHON_APP="recognize_captcha.py"
LOG_DIR="${SCRIPT_DIR}/logs"
PID_FILE="${SCRIPT_DIR}/captcha_service.pid"
CONFIG_FILE="${SCRIPT_DIR}/config.env"

# 默认配置
DEFAULT_HOST="0.0.0.0"
DEFAULT_PORT="9876"
DEFAULT_WORKERS="4"
DEFAULT_TIMEOUT="120"
DEFAULT_MAX_REQUESTS="1000"
DEFAULT_MAX_REQUESTS_JITTER="100"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" > /dev/null 2>&1; then
        log_error "命令 '$1' 未找到，请先安装"
        return 1
    fi
    return 0
}

# 检查Python环境
check_python_env() {
    log_info "检查Python环境..."
    
    # 检查Python版本
    if ! check_command "python3"; then
        log_error "Python3 未安装"
        exit 1
    fi
    
    # 检查pip
    if ! check_command "pip3"; then
        log_error "pip3 未安装"
        exit 1
    fi
    
    # 检查虚拟环境
    if [ -z "$VIRTUAL_ENV" ]; then
        log_warn "未检测到虚拟环境，建议使用虚拟环境运行"
        read -p "是否继续？(y/N): " REPLY
        echo
        if [ ! "$REPLY" = "y" ] && [ ! "$REPLY" = "Y" ]; then
            log_info "请先创建并激活虚拟环境："
            log_info "python3 -m venv venv"
            log_info "source venv/bin/activate"
            log_info "pip install -r requirements.txt"
            exit 1
        fi
    else
        log_info "检测到虚拟环境: $VIRTUAL_ENV"
    fi
}

# 检查依赖是否已安装
check_dependencies() {
    log_info "检查依赖包状态..."
    
    local missing_deps=""
    local installed_deps=""
    
    # 检查依赖包
    local packages="flask flask-cors ddddocr Pillow"
    local import_names="flask flask_cors ddddocr PIL"
    
    for package in $packages; do
        case "$package" in
            "flask")
                import_name="flask"
                ;;
            "flask-cors")
                import_name="flask_cors"
                ;;
            "ddddocr")
                import_name="ddddocr"
                ;;
            "Pillow")
                import_name="PIL"
                ;;
        esac
        
        if python3 -c "import ${import_name}" 2>/dev/null; then
            if [ -z "$installed_deps" ]; then
                installed_deps="$package"
            else
                installed_deps="$installed_deps $package"
            fi
            log_debug "✓ $package 已安装"
        else
            if [ -z "$missing_deps" ]; then
                missing_deps="$package"
            else
                missing_deps="$missing_deps $package"
            fi
            log_debug "✗ $package 未安装"
        fi
    done
    
    # 输出检查结果
    if [ -n "$installed_deps" ]; then
        log_info "已安装的依赖: $installed_deps"
    fi
    
    if [ -z "$missing_deps" ]; then
        log_info "✓ 所有依赖包已安装"
        return 0
    else
        log_warn "缺少以下依赖包: $missing_deps"
        return 1
    fi
}

# 安装依赖
install_dependencies() {
    log_info "检查并安装依赖..."
    
    # 首先检查依赖是否已安装
    if check_dependencies; then
        log_info "✓ 依赖检查通过，无需重新安装"
        return 0
    fi
    
    if [ -f "${SCRIPT_DIR}/requirements.txt" ]; then
        log_info "开始安装缺失的依赖包..."
        log_info "安装命令: pip3 install -r requirements.txt --upgrade"
        
        # 显示安装进度
        pip3 install -r "${SCRIPT_DIR}/requirements.txt" --upgrade --progress-bar on
        local install_result=$?
        
        if [ $install_result -eq 0 ]; then
            log_info "✓ 依赖安装完成"
            
            # 再次检查依赖
            log_info "验证安装结果..."
            if check_dependencies; then
                log_info "🎉 所有依赖包安装成功！"
                return 0
            else
                log_error "❌ 依赖安装后仍有缺失，请检查安装日志"
                log_error "建议手动执行: pip3 install -r requirements.txt"
                return 1
            fi
        else
            log_error "❌ 依赖安装失败 (退出码: $install_result)"
            log_error "请检查网络连接和Python环境"
            log_error "建议手动执行: pip3 install -r requirements.txt"
            return 1
        fi
    else
        log_error "❌ requirements.txt 文件不存在: ${SCRIPT_DIR}/requirements.txt"
        return 1
    fi
}

# 创建必要的目录
create_directories() {
    log_info "创建必要的目录..."
    
    # 创建日志目录
    mkdir -p "$LOG_DIR"
    
    # 创建配置文件（如果不存在）
    if [ ! -f "$CONFIG_FILE" ]; then
        cat > "$CONFIG_FILE" << EOF
# 验证码识别服务配置文件
# Captcha Recognition Service Configuration

# 服务配置
HOST=${DEFAULT_HOST}
PORT=${DEFAULT_PORT}
WORKERS=${DEFAULT_WORKERS}
TIMEOUT=${DEFAULT_TIMEOUT}
MAX_REQUESTS=${DEFAULT_MAX_REQUESTS}
MAX_REQUESTS_JITTER=${DEFAULT_MAX_REQUESTS_JITTER}

# 日志配置
LOG_LEVEL=INFO
LOG_FILE=${LOG_DIR}/captcha_service.log
ACCESS_LOG_FILE=${LOG_DIR}/access.log
ERROR_LOG_FILE=${LOG_DIR}/error.log

# 性能配置
KEEPALIVE=2
MAX_REQUESTS_PER_WORKER=1000
PRELOAD_APP=true

# 安全配置
FORWARDED_ALLOW_IPS=*
EOF
        log_info "配置文件已创建: $CONFIG_FILE"
    fi
}

# 加载配置
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        log_info "加载配置文件: $CONFIG_FILE"
        source "$CONFIG_FILE"
    else
        log_warn "配置文件不存在，使用默认配置"
        HOST="$DEFAULT_HOST"
        PORT="$DEFAULT_PORT"
        WORKERS="$DEFAULT_WORKERS"
        TIMEOUT="$DEFAULT_TIMEOUT"
        MAX_REQUESTS="$DEFAULT_MAX_REQUESTS"
        MAX_REQUESTS_JITTER="$DEFAULT_MAX_REQUESTS_JITTER"
    fi
    
    log_info "服务配置:"
    log_info "  主机: $HOST"
    log_info "  端口: $PORT"
    log_info "  工作进程: $WORKERS"
    log_info "  超时时间: ${TIMEOUT}s"
    log_info "  最大请求数: $MAX_REQUESTS"
}

# 检查服务是否运行
is_running() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# 启动服务
start_service() {
    log_info "启动验证码识别服务..."
    
    if is_running; then
        log_warn "服务已在运行中"
        return 0
    fi
    
    # 检查应用文件
    if [ ! -f "${SCRIPT_DIR}/${PYTHON_APP}" ]; then
        log_error "应用文件不存在: ${SCRIPT_DIR}/${PYTHON_APP}"
        exit 1
    fi
    
    # 检查gunicorn
    if ! check_command "gunicorn"; then
        log_warn "gunicorn 未安装，尝试安装..."
        pip3 install gunicorn
        if [ $? -ne 0 ]; then
            log_error "gunicorn 安装失败"
            exit 1
        fi
    fi
    
    # 启动服务
    log_info "使用 gunicorn 启动服务..."
    
    # 构建gunicorn命令
    local gunicorn_cmd="gunicorn"
    gunicorn_cmd="$gunicorn_cmd --bind ${HOST}:${PORT}"
    gunicorn_cmd="$gunicorn_cmd --workers ${WORKERS}"
    gunicorn_cmd="$gunicorn_cmd --timeout ${TIMEOUT}"
    gunicorn_cmd="$gunicorn_cmd --max-requests ${MAX_REQUESTS}"
    gunicorn_cmd="$gunicorn_cmd --max-requests-jitter ${MAX_REQUESTS_JITTER}"
    gunicorn_cmd="$gunicorn_cmd --keep-alive ${KEEPALIVE:-2}"
    gunicorn_cmd="$gunicorn_cmd --preload"
    gunicorn_cmd="$gunicorn_cmd --access-logfile ${ACCESS_LOG_FILE:-${LOG_DIR}/access.log}"
    gunicorn_cmd="$gunicorn_cmd --error-logfile ${ERROR_LOG_FILE:-${LOG_DIR}/error.log}"
    gunicorn_cmd="$gunicorn_cmd --log-level ${LOG_LEVEL:-INFO}"
    gunicorn_cmd="$gunicorn_cmd --pid ${PID_FILE}"
    gunicorn_cmd="$gunicorn_cmd --daemon"
    gunicorn_cmd="$gunicorn_cmd --chdir ${SCRIPT_DIR}"
    gunicorn_cmd="$gunicorn_cmd ${PYTHON_APP%.py}:app"
    
    log_debug "执行命令: $gunicorn_cmd"
    
    # 执行启动命令
    eval "$gunicorn_cmd"
    
    # 等待服务启动
    sleep 10
    
    if is_running; then
        local pid=$(cat "$PID_FILE")
        log_info "服务启动成功! PID: $pid"
        log_info "服务地址: http://${HOST}:${PORT}"
        log_info "健康检查: http://${HOST}:${PORT}/health"
        log_info "日志文件: ${LOG_DIR}/"
        return 0
    else
        log_error "服务启动失败"
        return 1
    fi
}

# 停止服务
stop_service() {
    log_info "停止验证码识别服务..."
    
    if ! is_running; then
        log_warn "服务未运行"
        return 0
    fi
    
    local pid=$(cat "$PID_FILE")
    log_info "停止进程 PID: $pid"
    
    # 优雅停止
    kill -TERM "$pid"
    
    # 等待进程结束
    local count=0
    while ps -p "$pid" > /dev/null 2>&1 && [ $count -lt 30 ]; do
        sleep 1
        ((count++))
    done
    
    # 强制停止
    if ps -p "$pid" > /dev/null 2>&1; then
        log_warn "优雅停止失败，强制停止进程"
        kill -KILL "$pid"
        sleep 1
    fi
    
    # 清理PID文件
    rm -f "$PID_FILE"
    
    if ! is_running; then
        log_info "服务已停止"
        return 0
    else
        log_error "服务停止失败"
        return 1
    fi
}

# 重启服务
restart_service() {
    log_info "重启验证码识别服务..."
    stop_service
    sleep 2
    start_service
}

# 查看服务状态
status_service() {
    log_info "检查服务状态..."
    
    if is_running; then
        local pid=$(cat "$PID_FILE")
        log_info "服务正在运行"
        log_info "PID: $pid"
        log_info "端口: $PORT"
        log_info "地址: http://${HOST}:${PORT}"
        
        # 检查健康状态
        log_info "检查服务健康状态..."
        if command -v curl > /dev/null 2>&1; then
            local health_url="http://${HOST}:${PORT}/health"
            local health_response=$(curl -s -w "%{http_code}" -o /dev/null "$health_url" 2>/dev/null)
            if [ "$health_response" = "200" ]; then
                log_info "健康检查: 通过"
            else
                log_warn "健康检查: 失败 (HTTP $health_response)"
            fi
        else
            log_warn "curl 未安装，无法进行健康检查"
        fi
        
        return 0
    else
        log_warn "服务未运行"
        return 1
    fi
}

# 查看日志
view_logs() {
    local log_type="${1:-all}"
    
    case "$log_type" in
        "access")
    if [ -f "${LOG_DIR}/access.log" ]; then
                tail -f "${LOG_DIR}/access.log"
            else
                log_error "访问日志文件不存在"
            fi
            ;;
        "error")
            if [ -f "${LOG_DIR}/error.log" ]; then
                tail -f "${LOG_DIR}/error.log"
            else
                log_error "错误日志文件不存在"
            fi
            ;;
        "all"|*)
            if [ -f "${LOG_DIR}/captcha_service.log" ]; then
                tail -f "${LOG_DIR}/captcha_service.log"
            else
                log_error "服务日志文件不存在"
            fi
            ;;
    esac
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    if ! is_running; then
        log_error "服务未运行"
        return 1
    fi
    
    local health_url="http://${HOST}:${PORT}/health"
    
    if command -v curl > /dev/null 2>&1; then
        local response=$(curl -s "$health_url")
        local http_code=$(curl -s -w "%{http_code}" -o /dev/null "$health_url")
        
        if [ "$http_code" = "200" ]; then
            log_info "健康检查通过"
            echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
            return 0
        else
            log_error "健康检查失败 (HTTP $http_code)"
            return 1
        fi
    else
        log_error "curl 未安装，无法进行健康检查"
        return 1
    fi
}

# 显示帮助信息
show_help() {
    cat << EOF
验证码识别服务管理脚本
Captcha Recognition Service Management Script

用法: $0 [命令]

命令:
    start       启动服务
    stop        停止服务
    restart     重启服务
    status      查看服务状态
    health      健康检查
    logs        查看日志 (可选参数: access, error, all)
    install     安装依赖
    check       检查依赖状态
    config      编辑配置文件
    help        显示此帮助信息

示例:
    $0 start                    # 启动服务
    $0 stop                     # 停止服务
    $0 restart                  # 重启服务
    $0 status                   # 查看状态
    $0 health                   # 健康检查
    $0 logs                     # 查看所有日志
    $0 logs access              # 查看访问日志
    $0 logs error               # 查看错误日志
    $0 install                  # 安装依赖
    $0 check                    # 检查依赖状态
    $0 config                   # 编辑配置

配置文件: $CONFIG_FILE
日志目录: $LOG_DIR
PID文件:  $PID_FILE

EOF
}

# 编辑配置文件
edit_config() {
    if [ -f "$CONFIG_FILE" ]; then
        ${EDITOR:-nano} "$CONFIG_FILE"
        log_info "配置文件已更新，重启服务以应用新配置"
    else
        log_error "配置文件不存在: $CONFIG_FILE"
        exit 1
    fi
}

# 主函数
main() {
    case "${1:-help}" in
        "start")
            check_python_env
            install_dependencies
            create_directories
            load_config
            start_service
            ;;
        "stop")
            stop_service
            ;;
        "restart")
            check_python_env
            create_directories
            load_config
            restart_service
            ;;
        "status")
            load_config
            status_service
            ;;
        "health")
            load_config
            health_check
            ;;
        "logs")
            view_logs "$2"
            ;;
        "install")
            check_python_env
            install_dependencies
            ;;
        "check")
            check_python_env
            check_dependencies
            ;;
        "config")
            edit_config
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"
