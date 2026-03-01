# TasteBuddy

TasteBuddy is a fridge inventory app that uses a locally-trained YOLOv8 model to detect grocery items from your webcam. Detected items are stored in a Supabase database and displayed on a live dashboard, giving you an instant view of what's in your fridge.

## Architecture

```
Webcam capture → /api/scan → local YOLO server (port 8000) → Supabase DB → Dashboard
```

## Prerequisites

- Node.js 20+ and npm
- Python 3.10+
- ~4 GB disk space for model weights and dataset

## Environment Setup

Create a `.env.local` file in the repo root with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
USE_LOCAL_MODEL=true
LOCAL_MODEL_URL=http://localhost:8000
```

`USE_LOCAL_MODEL` and `LOCAL_MODEL_URL` are already set to the correct defaults — you only need to fill in the Supabase values.

## One-Time: Dataset + Training

### 1. Obtain the dataset

Download the [GroceryStoreDataset](https://github.com/marcusklasson/GroceryStoreDataset) and place it **one level above the repo root**, so the path looks like:

```
../GroceryStoreDataset/dataset/
TasteBuddy/              ← repo root
```

`convert_dataset.py` expects the dataset at `../GroceryStoreDataset/dataset/` relative to the repo root.

### 2. Create a Python virtual environment

```bash
cd model
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Convert the dataset

```bash
python convert_dataset.py
```

This converts the dataset to YOLO format and rewrites `data.yaml` with the correct absolute path. Do **not** edit `data.yaml` manually after this step.

### 5. Train the model

```bash
python train.py
```

Training takes approximately 10 minutes on an MPS/CUDA GPU, or 60–90 minutes on CPU.

> **Apple Silicon note:** `train.py` auto-detects CUDA but not MPS. To use your GPU, open `train.py` and change the `device` variable:
> ```python
> # Before
> device = "0" if torch.cuda.is_available() else "cpu"
> # After
> device = "mps"
> ```
> If you skip this, training will fall back to CPU automatically.

### 6. Verify weights were saved

```bash
ls runs/detect/grocery/weights/best.pt
```

You should see `best.pt` listed. This is the file the inference server loads at startup.

## Running the App

You need two terminals running simultaneously.

**Terminal 1 — Python inference server:**

```bash
cd model && source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

Expected startup output: `[server] Model loaded on MPS/CUDA/CPU`

**Terminal 2 — Next.js app:**

```bash
npm install   # first time only
npm run dev
```

Open http://localhost:3000

## Verifying Everything Works

Check the inference server is healthy:

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","model_loaded":true}
```

Then open http://localhost:3000/capture, click **Scan**, and check the dashboard for detected items.

## Configuration Reference

| Env var | Default | Purpose |
|---------|---------|---------|
| `USE_LOCAL_MODEL` | `true` | Set to `false` to fall back to Roboflow/mock |
| `LOCAL_MODEL_URL` | `http://localhost:8000` | URL of the Python inference server |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Supabase anon key |

## Model Details

- **Architecture:** YOLOv8n
- **Dataset:** Grocery Store Dataset — 81 grocery classes
- **Class mapping:** Raw class names (e.g. `Arla-Standard-Milk`) are mapped to canonical names (e.g. `milk`) automatically
- **Confidence threshold:** 0.4
- **Weights location:** `model/runs/detect/grocery/weights/best.pt`
