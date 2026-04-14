import base64
from fastapi import APIRouter
from ..providers.factory import get_ocr_provider

router = APIRouter(prefix="/api")


def parse_base64(image_str: str) -> bytes:
    if "," in image_str:
        image_str = image_str.split(",", 1)[1]
    return base64.b64decode(image_str)


@router.post("/ocr")
async def recognize_ocr(body: dict):
    image_b64 = body.get("image", "")
    if not image_b64:
        return {"error": "Missing 'image' field"}
    image_bytes = parse_base64(image_b64)
    provider = get_ocr_provider()
    result = await provider.recognize_text(image_bytes)
    return result
