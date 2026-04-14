import base64
import json
import os
from typing import Optional
from .base import BaseProvider

try:
    from openai import AsyncOpenAI
    _OPENAI_AVAILABLE = True
except ImportError:
    _OPENAI_AVAILABLE = False


class OpenAIProvider(BaseProvider):
    """
    使用 OpenAI GPT-4o Vision API 进行图像分类。
    也支持 Ollama 等兼容 OpenAI API 的本地模型（通过 base_url 配置）。
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gpt-4o",
        base_url: Optional[str] = None,
        timeout: float = 30.0,
    ):
        if not _OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Run: pip install openai")

        self.model = model
        self.timeout = timeout
        self.client = AsyncOpenAI(
            api_key=api_key or os.environ.get("OPENAI_API_KEY", ""),
            base_url=base_url,
            timeout=timeout,
        )

    async def recognize_text(self, image_bytes: bytes) -> dict:
        """OCR via GPT-4o Vision — 用于 OpenAI provider 的文字识别。"""
        b64 = base64.b64encode(image_bytes).decode()
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}"},
                        },
                        {
                            "type": "text",
                            "text": (
                                "This is a CAPTCHA image. "
                                "Please output ONLY the text/characters shown in the image, "
                                "nothing else. No explanation, no punctuation."
                            ),
                        },
                    ],
                }
            ],
            max_tokens=20,
        )
        text = response.choices[0].message.content.strip()
        return {"text": text, "confidence": 0.9}

    async def detect_slide_gap(self, target: bytes, background: bytes, bg_width: int = 0) -> dict:
        """滑块缺口检测 — OpenAI provider 不支持，抛出异常。"""
        raise NotImplementedError("Slide gap detection is not supported by OpenAI provider. Use ddddocr provider.")

    async def classify_images(self, images: list[bytes], question: str) -> dict:
        """
        图像分类：发送多张图片 + 问题文本，返回选中的图片索引列表。

        Args:
            images: base64 编码的图片字节列表
            question: 分类问题，如 "选出包含红绿灯的图片"

        Returns:
            {"selected": [0, 2, 5]}  — 选中的图片索引（0-based）
        """
        if not images:
            return {"selected": []}

        content = []

        # 添加问题文本
        content.append({
            "type": "text",
            "text": (
                f"You are solving a CAPTCHA challenge. Task: {question}\n"
                f"There are {len(images)} images numbered 0 to {len(images) - 1}.\n"
                "Examine each image carefully and select the ones that match the task.\n"
                "Reply with ONLY a JSON array of the matching image indices (0-based), "
                "e.g. [0, 2, 5]. If none match, reply with []."
            ),
        })

        # 添加所有图片
        for i, img_bytes in enumerate(images):
            b64 = base64.b64encode(img_bytes).decode()
            content.append({
                "type": "text",
                "text": f"Image {i}:",
            })
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            })

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": content}],
            max_tokens=100,
        )

        raw = response.choices[0].message.content.strip()
        selected = _parse_index_list(raw)
        # 过滤越界索引
        selected = [i for i in selected if 0 <= i < len(images)]
        return {"selected": selected}


def _parse_index_list(text: str) -> list[int]:
    """从模型输出中解析整数索引列表，容错处理。"""
    # 尝试直接 JSON 解析
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return [int(x) for x in result if str(x).isdigit() or isinstance(x, int)]
    except (json.JSONDecodeError, ValueError):
        pass

    # 提取方括号内容
    import re
    match = re.search(r'\[([^\]]*)\]', text)
    if match:
        inner = match.group(1)
        nums = re.findall(r'\d+', inner)
        return [int(n) for n in nums]

    # 直接提取所有数字
    nums = re.findall(r'\d+', text)
    return [int(n) for n in nums]
