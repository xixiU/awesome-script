# PAC to Clash 转换工具

将 PAC (Proxy Auto-Config) 文件转换为 Clash 配置文件的工具。

## 功能特性

- 自动解析 PAC 文件中的代理规则和域名配置
- 支持动态代理地址解析（基于本机 IP）
- 支持手动指定本机 IP 地址
- 自动生成 Clash 配置文件（YAML 格式）
- 支持从本地文件或 URL 加载 PAC 文件

## 依赖安装

```bash
pip install requests pyyaml
```

## 使用方法

### 基本用法

```bash
# 最简单：直接运行，使用默认的 26107698.pac
python convertPacToYaml.py

# 转换其他 PAC 文件
python convertPacToYaml.py myproxy.pac

# 从 URL 加载 PAC 文件
python convertPacToYaml.py https://example.com/proxy.pac
```

### 指定输出文件

```bash
# 指定输出文件名
python convertPacToYaml.py -o my-clash-config.yaml

# 完整示例
python convertPacToYaml.py myproxy.pac -o output.yaml
```

### 手动指定 IP 地址

在某些情况下，自动获取本机 IP 可能不准确，或者你需要使用特定的 IP 地址：

```bash
# 手动指定 IP
python convertPacToYaml.py -i 192.168.1.100

# 完整示例：指定 PAC 文件、输出文件和 IP
python convertPacToYaml.py myproxy.pac -o output.yaml -i 10.0.0.50
```

### 查看帮助

```bash
python convertPacToYaml.py -h
```

## 参数说明

| 参数 | 说明 | 默认值 | 必需 |
|------|------|--------|------|
| `pac_source` | PAC 文件路径或 URL | 26107698.pac | 否 |
| `-o, --output` | 输出的 YAML 文件名 | clash.yaml | 否 |
| `-i, --ip` | 手动指定本机 IP 地址 | 自动获取 | 否 |

## IP 获取策略

工具会按照以下优先级获取本机 IP：

1. **手动指定**：如果使用 `-i` 参数指定了 IP，则使用指定的 IP
2. **自动获取**（三级 fallback）：
   - 方法1：通过 `socket.gethostname()` 获取主机名并解析为 IP
   - 方法2：通过创建 socket 连接外部地址获取本机真实 IP（不会真正发送数据）
   - 方法3：使用默认值 `127.0.0.1`

> **注意**：在 macOS 上，方法1 可能会失败，工具会自动使用方法2 或方法3

## 输出示例

运行成功后，会显示以下信息：

```
自动获取IP: 192.168.2.27
Done: clash.yaml, 152 rules, 2 proxies
Local IP: 192.168.2.27
  - HTTPS ssl-fjktu-1hge1az-0.waspac.com:3389
  - HTTPS ssl-fjktu-1hge1az-0.waspac.com:443
```

生成的 `clash.yaml` 文件可以直接用于 Clash 客户端。

## 常见问题

### Q: 为什么要手动指定 IP？

A: PAC 文件中的某些代理服务器地址是根据客户端 IP 动态生成的。如果：
- 自动获取的 IP 不正确
- 你在 NAT 网络后面，需要使用公网 IP
- 需要模拟特定客户端的配置

这时可以使用 `-i` 参数手动指定。

### Q: 如何知道应该使用哪个 IP？

A: 
- 如果在本地网络使用，通常自动获取的 IP 就可以
- 如果代理服务器需要识别你的公网 IP，可以先访问 https://ip.sb 或 https://ifconfig.me 查看你的公网 IP
- 如果不确定，可以尝试运行一次，查看生成的代理地址是否正确

### Q: 支持哪些类型的 PAC 文件？

A: 支持以下格式：
- 包含 `proxyDomains` 和 `directDomains` 对象的现代 PAC 文件
- 传统的使用 `dnsDomainIs`、`shExpMatch`、`isInNet` 等函数的 PAC 文件
- 动态代理地址（基于 IP 和 ID 生成）

## 代码调用示例

如果需要在代码中使用：

```python
from convertPacToYaml import convert

# 基本用法
convert("myproxy.pac")

# 指定输出文件
convert("myproxy.pac", output_file="custom.yaml")

# 指定 IP
convert("myproxy.pac", output_file="custom.yaml", local_ip="192.168.1.100")

# 从 URL 加载
convert("https://example.com/proxy.pac")
```

## 许可证

本工具为开源工具，请根据项目许可证使用。
