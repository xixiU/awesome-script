from abc import ABC, abstractmethod


class BaseProvider(ABC):
    @abstractmethod
    async def recognize_text(self, image_bytes: bytes) -> dict:
        """Return {"text": "...", "confidence": 0.0}"""
        ...

    @abstractmethod
    async def detect_slide_gap(self, target: bytes, background: bytes, bg_width: int = 0) -> dict:
        """Return {"x": int, "y": int}"""
        ...

    async def classify_images(self, images: list[bytes], question: str) -> dict:
        """Phase 2: Return {"selected": [int]}"""
        raise NotImplementedError("Image classification not available in this provider")
