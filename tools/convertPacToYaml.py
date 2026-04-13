import re
import socket
import struct
import requests
import yaml
from urllib.parse import urlparse


def load_pac(source: str) -> str:
    if source.startswith("http"):
        return requests.get(source).text
    else:
        with open(source, "r", encoding="utf-8") as f:
            return f.read()


def resolve_pac_proxy(pac_text: str):
    """模拟 PAC 的 init() 函数，解析动态代理地址"""
    # 提取 id
    id_match = re.search(r'var\s+id\s*=\s*Number\((\d+)\)\.toString\(36\)', pac_text)
    pac_id = base36_encode(int(id_match.group(1))) if id_match else None

    # 提取 timestamp
    ts_match = re.search(r'var\s+timestamp\s*=\s*"([^"]*)"', pac_text)
    timestamp = ts_match.group(1) if ts_match else "0"

    # 获取本机 IP 并转换（模拟 convert_addr + toString(36)）
    local_ip = socket.gethostbyname(socket.gethostname())
    ip_int = struct.unpack("!I", socket.inet_aton(local_ip))[0]
    ip_b36 = base36_encode(ip_int)

    # 直接用提取的变量构造代理地址（匹配 init() 中的拼接逻辑）
    servers = []
    # 查找 init 函数中的 waspac.com 域名和端口
    waspac_ports = re.findall(r'\.waspac\.com:(\d+)', pac_text)
    if pac_id and waspac_ports:
        for port in waspac_ports:
            host = f"ssl-{pac_id}-{ip_b36}-{timestamp}.waspac.com"
            servers.append(f"HTTPS {host}:{port}")

    # 兜底：传统静态 proxy 定义
    if not servers:
        for match in re.findall(r'return\s+"((?:PROXY|HTTPS|SOCKS5?)\s+[^"]+)"', pac_text):
            servers.append(match.rstrip(";"))

    return servers, local_ip


def base36_encode(num):
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    if num == 0:
        return "0"
    result = []
    while num:
        result.append(chars[num % 36])
        num //= 36
    return "".join(reversed(result))


def parse_pac(pac_text: str):
    rules = []

    # 解析 proxyDomains 对象
    proxy_match = re.search(r'var\s+proxyDomains\s*=\s*\{([^}]+)\}', pac_text, re.DOTALL)
    if proxy_match:
        domains = re.findall(r'"([^"]+)":\s*1', proxy_match.group(1))
        for domain in domains:
            domain = domain.lstrip(".")
            rules.append(("DOMAIN-SUFFIX", domain, "Proxy"))

    # 解析 directDomains 对象
    direct_match = re.search(r'var\s+directDomains\s*=\s*\{([^}]+)\}', pac_text, re.DOTALL)
    if direct_match:
        domains = re.findall(r'"([^"]+)":\s*1', direct_match.group(1))
        for domain in domains:
            domain = domain.lstrip(".")
            rules.append(("DOMAIN-SUFFIX", domain, "DIRECT"))

    # dnsDomainIs (兼容传统格式)
    for domain in re.findall(r'dnsDomainIs\(host,\s*"(.*?)"\)', pac_text):
        domain = domain.lstrip(".")
        rules.append(("DOMAIN-SUFFIX", domain, "Proxy"))

    # shExpMatch (兼容传统格式)
    for pattern in re.findall(r'shExpMatch\(host,\s*"(.*?)"\)', pac_text):
        if pattern.startswith("*."):
            rules.append(("DOMAIN-SUFFIX", pattern[2:], "Proxy"))
        elif "*" in pattern:
            rules.append(("DOMAIN-KEYWORD", pattern.replace("*", ""), "Proxy"))
        else:
            rules.append(("DOMAIN", pattern, "Proxy"))

    # isInNet (兼容传统格式)
    for ip, mask in re.findall(r'isInNet\(host,\s*"(.*?)",\s*"(.*?)"\)', pac_text):
        cidr = mask_to_cidr(ip, mask)
        rules.append(("IP-CIDR", cidr, "DIRECT"))

    return rules


def mask_to_cidr(ip, mask):
    mask_bin = "".join([bin(int(x)).count("1").__str__() for x in mask.split(".")])
    prefix = sum(int(x) for x in mask_bin)
    return f"{ip}/{prefix}"


def generate_clash_yaml(rules, proxy_servers):
    yaml_rules = []
    for rtype, value, policy in rules:
        yaml_rules.append(f"{rtype},{value},{policy}")

    proxies = []
    proxy_names = []
    for i, server_str in enumerate(proxy_servers):
        # 解析 "HTTPS host:port" 或 "PROXY host:port" 格式
        parts = server_str.strip().rstrip(";").split()
        proto = parts[0] if len(parts) > 1 else "HTTPS"
        addr = parts[-1]
        host, port = addr.rsplit(":", 1) if ":" in addr else (addr, "443")
        name = f"Proxy-{i+1}" if len(proxy_servers) > 1 else "Proxy"
        proxy_names.append(name)

        if proto.upper() == "HTTPS":
            proxies.append({
                "name": name,
                "type": "http",
                "server": host,
                "port": int(port),
                "tls": True,
            })
        elif proto.upper() in ("SOCKS5", "SOCKS"):
            proxies.append({
                "name": name,
                "type": "socks5",
                "server": host,
                "port": int(port),
            })
        else:
            proxies.append({
                "name": name,
                "type": "http",
                "server": host,
                "port": int(port),
            })

    if not proxies:
        proxy_names = ["Proxy"]
        proxies = [{"name": "Proxy", "type": "http", "server": "127.0.0.1", "port": 8080}]

    return {
        "port": 7890,
        "socks-port": 7891,
        "allow-lan": False,
        "mode": "rule",
        "log-level": "info",
        "external-controller": "127.0.0.1:9090",
        "proxies": proxies,
        "proxy-groups": [
            {
                "name": "Proxy",
                "type": "select",
                "proxies": proxy_names + ["DIRECT"]
            }
        ],
        "rules": yaml_rules + ["MATCH,DIRECT"]
    }


def convert(pac_source, output_file="clash.yaml"):
    pac_text = load_pac(pac_source)

    # 解析动态代理服务器
    proxy_servers, local_ip = resolve_pac_proxy(pac_text)

    # 解析规则
    rules = parse_pac(pac_text)

    # 生成 Clash 配置
    clash_yaml = generate_clash_yaml(rules, proxy_servers)

    with open(output_file, "w", encoding="utf-8") as f:
        yaml.dump(clash_yaml, f, allow_unicode=True, sort_keys=False)

    print(f"Done: {output_file}, {len(rules)} rules, {len(proxy_servers)} proxies")
    print(f"Local IP: {local_ip}")
    if proxy_servers:
        for server in proxy_servers:
            print(f"  - {server}")


if __name__ == "__main__":
    # 示例：
    convert("26107698.pac")
    # convert("https://example.com/proxy.pac")

    # 如果需要手动添加节点到现有配置：
    # add_proxy_to_clash("clash.yaml", {
    #     "name": "My-Proxy",
    #     "type": "ss",  # 或 vmess, trojan, http, socks5
    #     "server": "example.com",
    #     "port": 8388,
    #     "cipher": "aes-256-gcm",
    #     "password": "your-password"
    # })


def add_proxy_to_clash(yaml_file, proxy_config):
    """向现有 Clash 配置添加新节点"""
    with open(yaml_file, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # 添加到 proxies 列表
    if "proxies" not in config:
        config["proxies"] = []
    config["proxies"].append(proxy_config)

    # 添加到 proxy-groups 的选择列表
    if "proxy-groups" in config:
        for group in config["proxy-groups"]:
            if group.get("type") == "select" and "proxies" in group:
                if proxy_config["name"] not in group["proxies"]:
                    group["proxies"].insert(0, proxy_config["name"])

    with open(yaml_file, "w", encoding="utf-8") as f:
        yaml.dump(config, f, allow_unicode=True, sort_keys=False)

    print(f"Added proxy '{proxy_config['name']}' to {yaml_file}")