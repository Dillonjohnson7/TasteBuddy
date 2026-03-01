"""
detect_webcam.py

Real-time grocery detection via webcam using a fine-tuned YOLOv8 model.

Controls:
    q — quit

Terminal output (debounced per class, 2-second cooldown):
    [DETECTED] Banana  (confidence: 0.87)

Run from the project/ directory:
    python detect_webcam.py
"""

import time
from pathlib import Path
import cv2
from ultralytics import YOLO

# ── Config ─────────────────────────────────────────────────────────────────────
WEIGHTS    = Path(__file__).resolve().parent / "runs/detect/grocery/weights/best.pt"
CONF_THRESH = 0.5
COOLDOWN    = 2.0   # seconds before the same class prints again
CAM_INDEX   = 0     # change if your webcam is on a different index

# Bounding-box colours (BGR) — cycle through a fixed palette
PALETTE = [
    (255,  56,  56), (255, 157,  51), (255, 212,  51), (51, 255,  86),
    (  0, 204, 255), ( 51,  51, 255), (200,  51, 255), (255,  51, 153),
]


def color_for(class_id: int):
    return PALETTE[class_id % len(PALETTE)]


def draw_boxes(frame, results, class_names):
    """Draw bounding boxes and labels on frame in-place."""
    for box in results[0].boxes:
        cls_id  = int(box.cls)
        conf    = float(box.conf)
        name    = class_names[cls_id]
        color   = color_for(cls_id)

        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        label = f"{name} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
        cv2.putText(
            frame, label, (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA,
        )


def main():
    if not WEIGHTS.exists():
        raise FileNotFoundError(
            f"Trained weights not found at {WEIGHTS}.\n"
            "Run train.py first."
        )

    print(f"Loading model from {WEIGHTS} …")
    model = YOLO(str(WEIGHTS))
    class_names = model.names  # {id: name}

    cap = cv2.VideoCapture(CAM_INDEX)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open webcam at index {CAM_INDEX}.")

    print("Webcam open. Press 'q' to quit.\n")

    last_printed: dict[str, float] = {}

    while True:
        ok, frame = cap.read()
        if not ok:
            print("Failed to read frame — camera disconnected?")
            break

        results = model(frame, conf=CONF_THRESH, verbose=False)

        draw_boxes(frame, results, class_names)

        # Terminal output with per-class cooldown
        now = time.time()
        for box in results[0].boxes:
            cls_name = class_names[int(box.cls)]
            conf     = float(box.conf)
            if now - last_printed.get(cls_name, 0) > COOLDOWN:
                print(f"[DETECTED] {cls_name}  (confidence: {conf:.2f})")
                last_printed[cls_name] = now

        cv2.imshow("Grocery Detector — press q to quit", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Done.")


if __name__ == "__main__":
    main()
