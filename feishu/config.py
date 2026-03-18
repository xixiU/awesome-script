from pathlib import Path
import yaml

# 加载配置文件
def load_config():
    """加载配置文件，优先级：config.yml > config.example.yml"""
    config_dir = Path(__file__).parent
    config_file = config_dir / "config.yml"
    example_file = config_dir / "config.example.yml"

    if config_file.exists():
        with open(config_file, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    elif example_file.exists():
        print("警告: 未找到 config.yml，使用 config.example.yml")
        with open(example_file, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    else:
        raise FileNotFoundError("配置文件不存在，请创建 config.yml")
    
# 加载配置
config = load_config()
URL_PREFIX = config['feishu']['url_prefix']
payload = {
    "app_id": config['feishu']['app_id'],
    "app_secret": config['feishu']['app_secret']
}