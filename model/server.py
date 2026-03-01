"""
TasteBuddy local YOLO inference server.

Usage:
    cd model/
    source .venv/bin/activate
    uvicorn server:app --host 127.0.0.1 --port 8000 --reload
"""

import asyncio
import base64
import io
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Class name → canonical grocery name
# Covers all 81 classes from data.yaml
# ---------------------------------------------------------------------------
CLASS_CANONICAL_MAP: dict[str, str] = {
    # Apples
    "golden-delicious": "apple",
    "granny-smith": "apple",
    "pink-lady": "apple",
    "red-delicious": "apple",
    "royal-gala": "apple",
    # Other fruit
    "avocado": "avocado",
    "banana": "banana",
    "kiwi": "kiwi",
    "lemon": "lemon",
    "lime": "lime",
    "mango": "mango",
    "cantaloupe": "melon",
    "galia-melon": "melon",
    "honeydew-melon": "melon",
    "watermelon": "watermelon",
    "nectarine": "peach",
    "orange": "orange",
    "papaya": "papaya",
    "passion-fruit": "passion fruit",
    "peach": "peach",
    "anjou": "pear",
    "conference": "pear",
    "kaiser": "pear",
    "pineapple": "pineapple",
    "plum": "plum",
    "pomegranate": "pomegranate",
    "red-grapefruit": "grapefruit",
    "satsumas": "orange",
    # Juices
    "bravo-apple-juice": "apple juice",
    "bravo-orange-juice": "orange juice",
    "god-morgon-apple-juice": "apple juice",
    "god-morgon-orange-juice": "orange juice",
    "god-morgon-orange-red-grapefruit-juice": "grapefruit juice",
    "god-morgon-red-grapefruit-juice": "grapefruit juice",
    "tropicana-apple-juice": "apple juice",
    "tropicana-golden-grapefruit": "grapefruit juice",
    "tropicana-juice-smooth": "orange juice",
    "tropicana-mandarin-morning": "orange juice",
    # Milks
    "arla-ecological-medium-fat-milk": "milk",
    "arla-lactose-medium-fat-milk": "milk",
    "arla-medium-fat-milk": "milk",
    "arla-standard-milk": "milk",
    "garant-ecological-medium-fat-milk": "milk",
    "garant-ecological-standard-milk": "milk",
    "oatly-oat-milk": "milk",
    "arla-sour-milk": "milk",
    "alpro-fresh-soy-milk": "milk",
    "alpro-shelf-soy-milk": "milk",
    # Sour cream
    "arla-ecological-sour-cream": "sour cream",
    "arla-sour-cream": "sour cream",
    # Yogurts
    "oatly-natural-oatghurt": "yogurt",
    "alpro-blueberry-soyghurt": "yogurt",
    "alpro-vanilla-soyghurt": "yogurt",
    "arla-mild-vanilla-yoghurt": "yogurt",
    "arla-natural-mild-low-fat-yoghurt": "yogurt",
    "arla-natural-yoghurt": "yogurt",
    "valio-vanilla-yoghurt": "yogurt",
    "yoggi-strawberry-yoghurt": "yogurt",
    "yoggi-vanilla-yoghurt": "yogurt",
    # Vegetables
    "asparagus": "asparagus",
    "aubergine": "aubergine",
    "cabbage": "cabbage",
    "carrots": "carrot",
    "cucumber": "cucumber",
    "garlic": "garlic",
    "ginger": "ginger",
    "leek": "leek",
    "brown-cap-mushroom": "mushroom",
    "yellow-onion": "onion",
    "green-bell-pepper": "bell pepper",
    "orange-bell-pepper": "bell pepper",
    "red-bell-pepper": "bell pepper",
    "yellow-bell-pepper": "bell pepper",
    "floury-potato": "potato",
    "solid-potato": "potato",
    "sweet-potato": "sweet potato",
    "red-beet": "beet",
    "beef-tomato": "tomato",
    "regular-tomato": "tomato",
    "vine-tomato": "tomato",
    "zucchini": "zucchini",
}

WEIGHTS_PATH = Path(__file__).parent / "runs/detect/grocery/weights/best.pt"

# Global model reference set during lifespan startup
_model: YOLO | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    device = (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )
    if not WEIGHTS_PATH.exists():
        raise RuntimeError(
            f"Model weights not found at {WEIGHTS_PATH}. "
            "Run `python train.py` first."
        )
    _model = YOLO(str(WEIGHTS_PATH))
    _model.to(device)
    print(f"[server] Model loaded on {device.upper()}")
    yield
    _model = None


app = FastAPI(title="TasteBuddy Local YOLO Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class DetectRequest(BaseModel):
    base64_image: str


class Prediction(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    x: float
    y: float
    width: float
    height: float
    confidence: float
    class_: str = Field(alias="class")
    class_id: int


class ImageMeta(BaseModel):
    width: int
    height: int


class DetectResponse(BaseModel):
    predictions: list[Prediction]
    image: ImageMeta


# ---------------------------------------------------------------------------
# Inference helper (runs in a thread pool to avoid blocking the event loop)
# ---------------------------------------------------------------------------

def _run_inference(image: Image.Image) -> DetectResponse:
    assert _model is not None
    results = _model(image, verbose=False)
    result = results[0]

    img_w, img_h = image.size
    predictions: list[Prediction] = []

    boxes = result.boxes
    if boxes is not None:
        for box in boxes:
            xyxy = box.xyxy[0].tolist()
            x1, y1, x2, y2 = xyxy
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            bw = x2 - x1
            bh = y2 - y1

            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            raw_name = result.names[cls_id]
            canonical = CLASS_CANONICAL_MAP.get(raw_name.lower(), raw_name.lower())

            pred = Prediction.model_validate({
                "x": cx,
                "y": cy,
                "width": bw,
                "height": bh,
                "confidence": conf,
                "class": canonical,
                "class_id": cls_id,
            })
            predictions.append(pred)

    return DetectResponse(
        predictions=predictions,
        image=ImageMeta(width=img_w, height=img_h),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": _model is not None}


@app.post("/detect", response_model=DetectResponse)
async def detect(body: DetectRequest):
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    # Fix padding and decode base64
    img_b64 = body.base64_image
    img_b64 += "=" * (-len(img_b64) % 4)

    try:
        img_bytes = base64.b64decode(img_b64)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")

    result = await asyncio.to_thread(_run_inference, image)
    return result
