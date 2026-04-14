from pydantic import BaseModel
import yaml
import os


class ProviderConfig(BaseModel):
    ocr: str = "ddddocr"
    slide: str = "ddddocr"
    classify: str = "openai"  # Phase 2


class OpenAIConfig(BaseModel):
    api_key: str = ""
    model: str = "gpt-4o"
    base_url: str = ""  # 留空则使用 OpenAI 官方地址


class OllamaConfig(BaseModel):
    base_url: str = "http://localhost:11434/v1"
    model: str = "qwen2-vl"


class Settings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 9876
    debug: bool = False
    providers: ProviderConfig = ProviderConfig()
    openai: OpenAIConfig = OpenAIConfig()
    ollama: OllamaConfig = OllamaConfig()

    # 兼容旧的扁平字段（环境变量优先）
    @property
    def openai_api_key(self) -> str:
        return self.openai.api_key

    @property
    def openai_model(self) -> str:
        return self.openai.model

    @property
    def openai_base_url(self) -> str:
        return self.openai.base_url

    @property
    def ollama_base_url(self) -> str:
        return self.ollama.base_url

    @property
    def ollama_model(self) -> str:
        return self.ollama.model


def load_settings() -> Settings:
    config_path = os.path.join(os.path.dirname(__file__), "config.yaml")
    data: dict = {}
    if os.path.exists(config_path):
        with open(config_path) as f:
            data = yaml.safe_load(f) or {}

    # 环境变量优先级高于 config.yaml
    openai_data = data.setdefault("openai", {})
    if os.environ.get("OPENAI_API_KEY"):
        openai_data["api_key"] = os.environ["OPENAI_API_KEY"]
    if os.environ.get("OPENAI_MODEL"):
        openai_data["model"] = os.environ["OPENAI_MODEL"]
    if os.environ.get("OPENAI_BASE_URL"):
        openai_data["base_url"] = os.environ["OPENAI_BASE_URL"]

    ollama_data = data.setdefault("ollama", {})
    if os.environ.get("OLLAMA_BASE_URL"):
        ollama_data["base_url"] = os.environ["OLLAMA_BASE_URL"]
    if os.environ.get("OLLAMA_MODEL"):
        ollama_data["model"] = os.environ["OLLAMA_MODEL"]

    return Settings(**data)


settings = load_settings()
