"""
Provider 工厂模块。
根据 settings.providers 配置动态实例化对应的 provider。
"""
from functools import lru_cache
from .base import BaseProvider


@lru_cache(maxsize=None)
def get_ddddocr_provider() -> "BaseProvider":
    from .ddddocr_provider import DdddocrProvider
    return DdddocrProvider()


@lru_cache(maxsize=None)
def get_openai_provider() -> "BaseProvider":
    from .openai_provider import OpenAIProvider
    from ..config import settings
    return OpenAIProvider(
        api_key=settings.openai_api_key or None,
        model=settings.openai_model,
        base_url=settings.openai_base_url or None,
    )


@lru_cache(maxsize=None)
def get_ollama_provider() -> "BaseProvider":
    from .ollama_provider import OllamaProvider
    from ..config import settings
    return OllamaProvider(
        base_url=settings.ollama_base_url,
        model=settings.ollama_model,
    )


def get_ocr_provider() -> "BaseProvider":
    from ..config import settings
    if settings.providers.ocr == "openai":
        return get_openai_provider()
    if settings.providers.ocr == "ollama":
        return get_ollama_provider()
    return get_ddddocr_provider()


def get_slide_provider() -> "BaseProvider":
    from ..config import settings
    if settings.providers.slide == "openai":
        return get_openai_provider()
    if settings.providers.slide == "ollama":
        return get_ollama_provider()
    return get_ddddocr_provider()


def get_classify_provider() -> "BaseProvider":
    from ..config import settings
    if settings.providers.classify == "ddddocr":
        return get_ddddocr_provider()
    if settings.providers.classify == "ollama":
        return get_ollama_provider()
    return get_openai_provider()
