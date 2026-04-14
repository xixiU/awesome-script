from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import ocr, slide, classify

app = FastAPI(title="Captcha Recognition API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr.router)
app.include_router(slide.router)
app.include_router(classify.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "running"}
