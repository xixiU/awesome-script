import base64
from fastapi import APIRouter
from ..providers.factory import get_slide_provider

router = APIRouter(prefix="/api")


def parse_base64(image_str: str) -> bytes:
    if "," in image_str:
        image_str = image_str.split(",", 1)[1]
    return base64.b64decode(image_str)


@router.post("/slide")
async def detect_slide(body: dict):
    target_b64 = body.get("target", "")
    bg_b64 = body.get("background", "")
    bg_width = body.get("bg_width", 0)
    if not target_b64 or not bg_b64:
        return {"error": "Missing 'target' or 'background' field"}
    target_bytes = parse_base64(target_b64)
    bg_bytes = parse_base64(bg_b64)
    provider = get_slide_provider()
    result = await provider.detect_slide_gap(target_bytes, bg_bytes, bg_width)
    return result
