# 安装依赖
```bash
python3 -m venv venv
source venv/bin/activate # macOS/Linux
# 或在 Windows 上使用：venv\Scripts\activate
pip3 install -r requirements.txt
```

# 部署
项目包含一个用于生产环境部署的启动脚本。请根据您的实际部署环境调整此脚本：

```bash
# scripts/start_prod.sh
# 进入到二级目录，如scripts中
nohup sh ../scripts/start.sh > gunicorn.log 2>&1 &
```

# 配置nginx
如果您计划将应用部署在 Nginx 等反向代理之后，您可能需要配置 Nginx。以下是一个基本示例：

```nginx
# 查询nginx配置文件路径
# nginx -t

# 示例 Nginx 配置 (通常位于 /etc/nginx/sites-available/your_app_name)
# server {
#     listen 80;
#     server_name yourdomain.com; # 替换为您的域名或IP

#     location / {
#         proxy_pass http://127.0.0.1:5000; # 替换为您的 Flask 应用运行地址
#         proxy_set_header Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#     }
# }
```