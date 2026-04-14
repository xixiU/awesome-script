import base64
from fastapi import APIRouter, HTTPException
from ..providers.factory import get_classify_provider
from ..providers.openai_provider import OpenAIProvider
from ..config import settings

router = APIRouter(prefix="/api")


def parse_base64(image_str: str) -> bytes:
    if "," in image_str:
        image_str = image_str.split(",", 1)[1]
    return base64.b64decode(image_str)


@router.post("/classify")
async def classify_images(body: dict):
    """
    Phase 2: 图像分类接口，用于 hCaptcha/reCAPTCHA。

    请求体：
    {
        "images": ["data:image/png;base64,...", "base64...", ...],
        "question": "选出包含红绿灯的图片"
    }

    响应：
    {
        "selected": [0, 2, 5]  // 选中的图片索引（0-based）
    }
    """
    images_b64 = body.get("images", [])
    question = body.get("question", "")
    api_key = body.get("api_key", "")  # 可选，优先级高于 config.yaml

    if not images_b64:
        return {"error": "Missing 'images' field", "selected": []}

    if not question:
        return {"error": "Missing 'question' field", "selected": []}

    try:
        images_bytes = [parse_base64(img) for img in images_b64]

        # 若请求体带了 api_key，临时创建一个使用该 key 的 provider
        if api_key:
            provider = OpenAIProvider(
                api_key=api_key,
                model=settings.openai.model,
                base_url=settings.openai.base_url or None,
            )
        else:
            provider = get_classify_provider()

        result = await provider.classify_images(images_bytes, question)
        return result

    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        return {"error": f"Classification failed: {str(e)}", "selected": []}
