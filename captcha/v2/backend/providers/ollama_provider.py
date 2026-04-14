"""
Ollama 本地模型 Provider。

Ollama 提供 OpenAI 兼容 API，因此直接复用 OpenAIProvider，
只需修改 base_url 和默认模型名称。

使用方式：
1. 安装 Ollama: https://ollama.com
2. 拉取模型: ollama pull qwen2-vl
3. 启动服务: ollama serve (默认监听 http://localhost:11434)
4. 配置 config.yaml 或环境变量指向 Ollama 地址
"""
from typing import Optional
from .openai_provider import OpenAIProvider


class OllamaProvider(OpenAIProvider):
    """
    Ollama 本地模型 Provider，复用 OpenAI 兼容接口。
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434/v1",
        model: str = "qwen2-vl",
        timeout: float = 60.0,
    ):
        # Ollama 不需要 API Key，传空字符串
        super().__init__(
            api_key="ollama",  # Ollama 不验证 API Key，但 OpenAI SDK 要求非空
            model=model,
            base_url=base_url,
            timeout=timeout,
        )
