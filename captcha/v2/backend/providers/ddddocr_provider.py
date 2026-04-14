import ddddocr
from PIL import Image
import io
from .base import BaseProvider
from ..preprocessing.image import get_candidates


class DdddocrProvider(BaseProvider):
    def __init__(self):
        try:
            self.ocr = ddddocr.DdddOcr(beta=True, show_ad=False)
        except Exception:
            self.ocr = ddddocr.DdddOcr(show_ad=False)

        self.det = ddddocr.DdddOcr(det=False, ocr=False, show_ad=False)

    async def recognize_text(self, image_bytes: bytes) -> dict:
        from collections import Counter

        try:
            candidates = get_candidates(image_bytes)
        except Exception:
            text = self.ocr.classification(image_bytes)
            return {"text": text, "confidence": 0.5}

        results = []
        for candidate in candidates:
            try:
                text = self.ocr.classification(candidate)
                if text:
                    results.append(text)
            except Exception:
                pass

        if not results:
            text = self.ocr.classification(image_bytes)
            return {"text": text, "confidence": 0.5}

        vote = Counter(results)
        best = vote.most_common(1)[0]
        confidence = best[1] / len(results)
        return {"text": best[0], "confidence": round(confidence, 2)}

    async def detect_slide_gap(self, target: bytes, background: bytes, bg_width: int = 0) -> dict:
        result = self.det.slide_match(target, background, simple_target=True)

        if not result or "target" not in result:
            return {"x": 0, "y": 0}

        x = result["target"][0]
        y = result["target"][1]

        if bg_width > 0:
            bg_img = Image.open(io.BytesIO(background))
            original_width = bg_img.width
            if original_width > 0:
                scale = bg_width / original_width
                x = int(x * scale)
                y = int(y * scale)

        return {"x": x, "y": y}
