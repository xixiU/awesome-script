import os
import time
import tempfile
import json

from datetime import date, timedelta
from flask import Flask, request, render_template, send_file, flash, redirect, url_for, jsonify

import paramiko

# --- 创建 Flask 应用 ---
app = Flask(__name__)
app.secret_key = 'a_super_secret_key_for_flash_messages'
CONFIG_DIR = 'configs'
SERVERS_CONFIG_FILE = os.path.join(CONFIG_DIR, 'servers.json')

def load_servers():
    """从 servers.json 加载服务器配置"""
    if not os.path.exists(SERVERS_CONFIG_FILE):
        return {}
    try:
        with open(SERVERS_CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {}

def save_servers(servers_data):
    """将服务器配置保存到 servers.json"""
    # 确保 config 目录存在
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(SERVERS_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(servers_data, f, indent=4, ensure_ascii=False)

# --- 核心日志下载逻辑 ---
def execute_command(client, command):
    """一个辅助函数，用于执行命令并返回标准输出和错误"""
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    return stdout.read().decode('utf-8').strip(), stderr.read().decode('utf-8').strip(), exit_status

def get_logs_as_archive(hostname, ssh_port, username, password, service_port:int, start_date_str=None, end_date_str=None):
    """
    【Web后端专用版】
    此版本不直接下载文件到本地，而是将远程打包的日志流式传输到服务器的一个临时文件中，
    并返回临时文件的路径和最终要呈现给用户的下载文件名。
    """
    client = None
    remote_archive_path = None # 在 finally 中需要清理
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(hostname, port=ssh_port, username=username, password=password, timeout=10)

        output, err, status = execute_command(client, f"ss -lptn 'sport = :{service_port}' | grep LISTEN")
        if status != 0 or 'pid=' not in output:
             output, err, status = execute_command(client, f"lsof -iTCP:{service_port} -sTCP:LISTEN -n -P")
             if status != 0 or 'PID' not in output:
                raise Exception(f"找不到监听在端口 {service_port} 的服务")
             pid = output.splitlines()[-1].split()[1]
        else:
             pid = output.split('pid=')[1].split(',')[0]
        
        service_base_path, err, status = execute_command(client, f"readlink /proc/{pid}/cwd")
        if status != 0 or not service_base_path:
             raise Exception("无法获取服务工作目录")

        log_files_to_pack = []
        current_logs_cmd = f"find {service_base_path}/logs/ -maxdepth 1 -type f -name '*.log'"
        current_log_paths, err, status = execute_command(client, current_logs_cmd)
        if current_log_paths:
            for full_path in current_log_paths.splitlines():
                log_files_to_pack.append(full_path.replace(f"{service_base_path}/", ""))

        if not start_date_str: start_date_str = date.today().strftime('%Y-%m-%d')
        if not end_date_str: end_date_str = start_date_str
        start = date.fromisoformat(start_date_str)
        end = date.fromisoformat(end_date_str)
        
        current_date = start
        while current_date <= end:
            day_str = current_date.strftime('%Y-%m-%d')
            history_dir = f"{service_base_path}/logs/history/{day_str}"
            dir_exists_cmd = f"test -d {history_dir} && echo 'exists'"
            output, err, status = execute_command(client, dir_exists_cmd)
            if output == 'exists':
                list_files_cmd = f"find {history_dir} -type f"
                history_files, err, status = execute_command(client, list_files_cmd)
                if history_files:
                    for full_path in history_files.splitlines():
                        log_files_to_pack.append(full_path.replace(f"{service_base_path}/", ""))
            current_date += timedelta(days=1)

        if not log_files_to_pack:
            raise Exception("在指定日期范围内未找到任何日志文件")

        # archive_name = f"log_archive_{hostname}_{time.strftime('%Y%m%d%H%M%S')}.tar.gz"
        # remote_archive_path = f"/tmp/{archive_name}"
        # log_files_str = " ".join(f"'{f}'" for f in log_files_to_pack)

        # tar_command = f"tar -czf {remote_archive_path} -C {service_base_path} {log_files_str}"
        # output, err, status = execute_command(client, tar_command)
        # if status != 0:
        #     raise Exception(f"远程打包失败: {err}")

        # # 创建一个本地临时文件来接收远程压缩包
        # temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.tar.gz')
        # sftp = client.open_sftp()
        # sftp.get(remote_archive_path, temp_file.name)
        # sftp.close()
        # temp_file.close()

        archive_name = f"log_archive_{hostname}_{time.strftime('%Y%m%d%H%M%S')}.zip"
        remote_archive_path = f"/tmp/{archive_name}"
        log_files_str = " ".join(f"'{f}'" for f in log_files_to_pack)

        # zip 命令没有类似 tar 的 -C 参数，所以我们先 cd 到目标目录再执行 zip
        # -q 参数表示静默模式，减少不必要的输出
        zip_command = f"cd {service_base_path} && zip -q {remote_archive_path} {log_files_str}"
        output, err, status = execute_command(client, zip_command)
        
        # 检查 zip 命令的退出状态码
        if status != 0:
            # zip 的常见错误码12表示“nothing to do”，这里我们不视其为致命错误
            # 其他错误则认为是失败
            if status != 12:
                 raise Exception(f"远程打包失败: {err}")

        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        sftp = client.open_sftp()
        sftp.get(remote_archive_path, temp_file.name)
        sftp.close()
        temp_file.close()
        
        # 返回临时文件路径和希望用户看到的下载文件名
        return temp_file.name, archive_name

    finally:
        if client:
            # 清理远程服务器上的临时压缩包
            if remote_archive_path:
                execute_command(client, f"rm {remote_archive_path}")
            client.close()


# --- Flask 路由定义 ---
@app.route('/')
def index():
    """渲染主页，并传入服务器列表"""
    servers = load_servers()
    # 传递排序后的服务器列表给模板，按备注排序
    sorted_servers = sorted(servers.values(), key=lambda x: x['remarks'])
    return render_template('index.html', servers=sorted_servers)

@app.route('/manage')
def manage_page():
    """渲染服务器配置管理页面"""
    servers = load_servers()
    # 传递排序后的服务器列表给模板，按IP排序
    sorted_servers = sorted(servers.values(), key=lambda x: x['ip'])
    return render_template('manage.html', servers=sorted_servers)

@app.route('/download_logs', methods=['POST'])
def download_logs():
    form_data = request.get_json()
    
    service_port_str = str(form_data.get('service_port', ''))
    if not service_port_str or not service_port_str.isdigit():
        return "'服务运行端口' 不能为空且必须是纯数字"
    servers = load_servers()

    server_ip = form_data.get('server_ip')
    if not server_ip or server_ip not in servers:
        flash("错误: 请选择一个有效的服务器配置。", "error")
        return redirect(url_for('index'))
    
    server_config = servers[server_ip]
    local_temp_file_path = None
    try:
        # service_port 从已保存的配置中获取，不再从 form 中获取
        service_port = int(service_port_str)
        
        local_temp_file_path, download_filename = get_logs_as_archive(
            hostname=server_config['ip'],
            ssh_port=int(server_config['ssh_port']),
            username=server_config['username'],
            password=server_config['password'],
            service_port=service_port, # 使用配置中的端口
            start_date_str=form_data.get('start_date'),
            end_date_str=form_data.get('end_date')
        )
        
        # 打印日志确认文件已生成
        print(f"临时文件已生成: {local_temp_file_path}")
        print(f"下载文件名: {download_filename}")

        return send_file(
            local_temp_file_path,
            as_attachment=True,
            download_name=download_filename
        )
    except Exception as e:
        print(e)
        flash(f"操作失败: {e}", "error")
        return redirect(url_for('index'))
    finally:
        if local_temp_file_path and os.path.exists(local_temp_file_path):
            print(f"临时文件已清理: {local_temp_file_path}")
            os.remove(local_temp_file_path)

def validate_server_data(data):
    if not data:
        return "无效的请求: 缺少JSON数据或Content-Type不正确"
    
    """用于校验服务器数据的辅助函数"""
    ip = data.get('ip')
    
    if not ip:
        return "IP地址不能为空"
    ssh_port_str = str(data.get('ssh_port', ''))
    if not ssh_port_str or not ssh_port_str.isdigit():
        return "'服务运行端口' 不能为空且必须是纯数字"
    return None


@app.route('/api/servers', methods=['POST'])
def add_server():
    """添加一个新的服务器配置"""
    data = request.json

    if not data:
        return jsonify({"success": False, "error": "无效的请求: 缺少JSON数据或Content-Type不正确"}), 400
    
    error = validate_server_data(data)
    if error:
        return jsonify({"success": False, "error": error}), 400

    servers = load_servers()
    ip = data.get('ip')
    if not ip:
        return jsonify({"success": False, "error": "IP地址不能为空"}), 400
    if ip in servers:
        return jsonify({"success": False, "error": f"IP地址 {ip} 已存在"}), 409
    
    # 如果备注为空，则默认使用IP地址作为备注
    if not data.get('remarks'):
        data['remarks'] = ip
        
    servers[ip] = data
    save_servers(servers)
    return jsonify({"success": True, "message": "添加成功"})

@app.route('/api/servers/<server_ip>', methods=['PUT'])
def update_server(server_ip):
    """更新一个已有的服务器配置"""
    data = request.json
    servers = load_servers()
    if server_ip not in servers:
        return jsonify({"success": False, "error": "未找到要更新的服务器"}), 404
    
    # 更新数据
    servers[server_ip] = data
    save_servers(servers)
    return jsonify({"success": True, "message": "更新成功"})

@app.route('/api/servers/<server_ip>', methods=['DELETE'])
def delete_server(server_ip):
    """删除一个服务器配置"""
    servers = load_servers()
    if server_ip in servers:
        del servers[server_ip]
        save_servers(servers)
        return jsonify({"success": True, "message": "删除成功"})
    return jsonify({"success": False, "error": "未找到要删除的服务器"}), 404


# --- 启动服务器 ---
if __name__ == '__main__':
    # 监听在 0.0.0.0 上可以让局域网内的其他机器访问
    app.run(host='0.0.0.0', port=5000, debug=True)