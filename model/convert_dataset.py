"""
convert_dataset.py

Converts the Grocery Store Dataset (classification-only) into YOLO detection format.
Each image gets a single full-frame bounding box:  <class_id> 0.5 0.5 1.0 1.0

Run from the project/ directory:
    python convert_dataset.py
"""

from __future__ import annotations

import csv
import shutil
import yaml
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
REPO_ROOT    = Path(__file__).resolve().parent.parent
DATASET_ROOT = REPO_ROOT / "model" / "GroceryStoreDataset" / "dataset"
OUT_ROOT     = Path(__file__).resolve().parent / "yolo_dataset"
DATA_YAML    = Path(__file__).resolve().parent / "data.yaml"

SPLITS = ["train", "val", "test"]


def load_classes(classes_csv: Path) -> dict[int, str]:
    """Return {class_id: class_name} from classes.csv."""
    mapping = {}
    with classes_csv.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid  = int(row["Class ID (int)"])
            name = row["Class Name (str)"].strip()
            mapping[cid] = name
    return mapping


def convert_split(split: str, class_map: dict[int, str]) -> int:
    """Copy images and write YOLO label files for one split. Returns image count."""
    split_file = DATASET_ROOT / f"{split}.txt"
    img_out    = OUT_ROOT / "images" / split
    lbl_out    = OUT_ROOT / "labels" / split
    img_out.mkdir(parents=True, exist_ok=True)
    lbl_out.mkdir(parents=True, exist_ok=True)

    count = 0
    with split_file.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            parts    = [p.strip() for p in line.split(",")]
            rel_path = parts[0]          # e.g. train/Fruit/Apple/...jpg
            class_id = int(parts[1])

            src = DATASET_ROOT / rel_path
            if not src.exists():
                print(f"  [WARN] Missing image: {src}")
                continue

            # Copy image (preserve filename; flatten to split dir)
            dst_img = img_out / src.name
            # Handle duplicate filenames across sub-folders by using a unique stem
            if dst_img.exists():
                dst_img = img_out / (src.parent.name + "_" + src.name)
            shutil.copy2(src, dst_img)

            # Write full-frame YOLO label
            dst_lbl = lbl_out / (dst_img.stem + ".txt")
            dst_lbl.write_text(f"{class_id} 0.5 0.5 1.0 1.0\n")

            count += 1

    return count


def write_data_yaml(class_map: dict[int, str]) -> None:
    """Write data.yaml for YOLOv8 training."""
    names = {cid: name for cid, name in sorted(class_map.items())}
    cfg = {
        "path":  str(OUT_ROOT.resolve()),
        "train": "images/train",
        "val":   "images/val",
        "test":  "images/test",
        "nc":    len(class_map),
        "names": names,
    }
    with DATA_YAML.open("w") as f:
        yaml.dump(cfg, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
    print(f"  Wrote {DATA_YAML}")


def main():
    print("Loading class definitions …")
    class_map = load_classes(DATASET_ROOT / "classes.csv")
    print(f"  {len(class_map)} classes found.")

    for split in SPLITS:
        print(f"Converting split: {split} …")
        n = convert_split(split, class_map)
        print(f"  {n} images processed.")

    print("Writing data.yaml …")
    write_data_yaml(class_map)

    print("\nDone. Dataset is ready at:", OUT_ROOT)


if __name__ == "__main__":
    main()
