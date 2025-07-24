import os
import time
import tempfile
from datetime import date, timedelta
from flask import Flask, request, jsonify, render_template, send_file

import paramiko

# --- 创建 Flask 应用 ---
app = Flask(__name__)

# --- 核心日志下载逻辑 (之前已优化) ---
def execute_command(client, command):
    """一个辅助函数，用于执行命令并返回标准输出和错误"""
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    return stdout.read().decode('utf-8').strip(), stderr.read().decode('utf-8').strip(), exit_status

def get_logs_as_archive(hostname, ssh_port, username, password, service_port, start_date_str=None, end_date_str=None):
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
    """渲染主页面"""
    return render_template('index.html')

@app.route('/api/download_logs', methods=['POST'])
def api_download_logs():
    """处理日志下载请求的API"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "无效的请求"}), 400

    # 从请求中获取参数
    hostname = data.get('hostname')
    ssh_port = int(data.get('ssh_port', 22))
    username = data.get('username')
    password = data.get('password')
    service_port = int(data.get('service_port'))
    start_date = data.get('start_date')
    end_date = data.get('end_date')

    # 参数校验
    if not all([hostname, username, password, service_port]):
        return jsonify({"error": "缺少必要参数：服务器IP, 用户名, 密码, 服务端口"}), 400

    local_temp_file_path = None
    try:
        # 调用核心函数获取日志
        local_temp_file_path, download_filename = get_logs_as_archive(
            hostname, ssh_port, username, password, service_port, start_date, end_date
        )
        
        # 使用 send_file 将文件作为附件发送给浏览器
        return send_file(
            local_temp_file_path,
            as_attachment=True,
            download_name=download_filename
        )

    except Exception as e:
        # 如果发生任何错误，返回一个JSON错误信息
        app.logger.error(f"操作失败: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        # 确保无论成功与否，都删除本地服务器上的临时文件
        if local_temp_file_path and os.path.exists(local_temp_file_path):
            os.remove(local_temp_file_path)


# --- 启动服务器 ---
if __name__ == '__main__':
    # 监听在 0.0.0.0 上可以让局域网内的其他机器访问
    app.run(host='0.0.0.0', port=5000, debug=True)