"""
train.py

Fine-tunes YOLOv8n on the converted Grocery Store Dataset.

Run from the project/ directory:
    python train.py

After training, best weights will be at:
    runs/detect/grocery/weights/best.pt
"""

from pathlib import Path
import torch
from ultralytics import YOLO

# ── Config ─────────────────────────────────────────────────────────────────────
MODEL  = "yolov8n.pt"   # swap to "yolov8s.pt" for ~15% better accuracy
IMGSZ  = 640
EPOCHS = 50
BATCH  = 16
DATA   = Path(__file__).resolve().parent / "data.yaml"

# ── Training ───────────────────────────────────────────────────────────────────
def main():
    if not DATA.exists():
        raise FileNotFoundError(
            f"data.yaml not found at {DATA}.\n"
            "Run convert_dataset.py first."
        )

    device = "0" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {'GPU (cuda:0)' if device == '0' else 'CPU'}")

    model = YOLO(MODEL)
    model.train(
        data=str(DATA),
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        device=device,
        project="runs/detect",
        name="grocery",
        exist_ok=True,
    )

    best = Path("runs/detect/grocery/weights/best.pt")
    if best.exists():
        print(f"\nTraining complete. Best weights: {best.resolve()}")
    else:
        print("\nTraining finished (weights path not found — check runs/ directory).")


if __name__ == "__main__":
    main()
