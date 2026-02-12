"""
REST API Routes — FastAPI router for the Edge-AI Performance Autopilot.

Exposes endpoints for health checks, hardware info, telemetry,
autopilot control, inference lifecycle, source management, and
video file upload.
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# ── Module-level refs (set by main.py at startup) ────────────────
# This avoids reliance on request.app.state for every handler,
# which can fail in certain FastAPI versions with File() params.

_app_state: Any = None


def bind_app_state(state: Any) -> None:
    """Called once from main.py after app.state is populated."""
    global _app_state
    _app_state = state


def _get(name: str) -> Any:
    if _app_state is None:
        raise HTTPException(503, "Server not fully initialised")
    obj = getattr(_app_state, name, None)
    if obj is None:
        raise HTTPException(503, f"{name} not initialised")
    return obj


# ── Request / Response Models ────────────────────────────────────


class ModeRequest(BaseModel):
    mode: str  # "speed" | "balanced" | "accuracy"


class InferenceStartRequest(BaseModel):
    source: str = "camera"           # "camera" | file path
    processing_mode: str = "paced"   # "benchmark" | "paced"


class PlaybackRequest(BaseModel):
    action: str     # "pause" | "resume" | "seek" | "seek_percent" | "speed"
    value: float = 0.0


class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    inference_running: bool
    llm_available: bool


# ── Health ───────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse)
async def health():
    gpu = getattr(_app_state, "hardware", None)
    engine = getattr(_app_state, "engine", None)
    analyst = getattr(_app_state, "analyst", None)
    
    llm_ok = False
    if analyst:
        llm_ok = await analyst.health_check()

    return HealthResponse(
        status="ok",
        gpu_available=gpu.gpu_available if gpu else False,
        inference_running=engine._running if engine else False,
        llm_available=llm_ok,
    )


# ── Hardware ─────────────────────────────────────────────────────


@router.get("/hardware")
async def get_hardware():
    hw = _get("hardware")
    analyst = _get("analyst")
    ai_connected = await analyst.health_check() if analyst else False
    
    return {
        "gpu_name": hw.gpu_name,
        "gpu_available": hw.gpu_available,
        "vram_total_gb": hw.vram_total_gb,
        "compute_capability": list(hw.compute_capability),
        "fp16_supported": hw.fp16_supported,
        "tensor_cores": hw.tensor_cores,
        "tier": hw.tier.value,
        "cpu_cores": hw.cpu_cores,
        "ram_total_gb": hw.ram_total_gb,
        "recommended_device": hw.recommended_device,
        "ai_connected": ai_connected,
    }


# ── Telemetry ────────────────────────────────────────────────────


@router.get("/telemetry")
async def get_telemetry():
    monitor = _get("telemetry")
    snap = await monitor.get_latest()
    if snap is None:
        return {"message": "No telemetry data yet"}
    return snap.to_dict()


@router.get("/telemetry/history")
async def get_telemetry_history(n: int = 60):
    monitor = _get("telemetry")
    history = await monitor.get_history(n)
    return [s.to_dict() for s in history]


# ── Autopilot ────────────────────────────────────────────────────


@router.get("/autopilot/state")
async def get_autopilot_state():
    ctrl = _get("controller")
    return ctrl.get_state_info()


@router.post("/autopilot/mode")
async def set_autopilot_mode(body: ModeRequest):
    ctrl = _get("controller")
    if body.mode not in ("speed", "balanced", "accuracy"):
        raise HTTPException(400, "Invalid mode. Use speed|balanced|accuracy")
    ctrl.set_mode(body.mode)
    return {"mode": body.mode}


# ── Inference Lifecycle ──────────────────────────────────────────


@router.post("/inference/start")
async def start_inference(body: InferenceStartRequest):
    pipeline = _get("pipeline")
    try:
        await pipeline.start(source=body.source, processing_mode=body.processing_mode)
        return {"status": "started", "source": body.source, "mode": body.processing_mode}
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/inference/stop")
async def stop_inference():
    pipeline = _get("pipeline")
    pipeline.stop()
    return {"status": "stopped"}


# ── Source Management ────────────────────────────────────────────


@router.post("/source/upload")
async def upload_video(file: UploadFile = File(...)):
    upload_dir = getattr(_app_state, "upload_dir", "./uploads")
    os.makedirs(upload_dir, exist_ok=True)

    dest = Path(upload_dir) / file.filename
    content = await file.read()
    dest.write_bytes(content)
    logger.info("Uploaded video: %s (%.1f MB)", file.filename, len(content) / 1e6)
    return {"filename": file.filename, "size_mb": round(len(content) / 1e6, 2)}


@router.get("/source/files")
async def list_source_files():
    upload_dir = getattr(_app_state, "upload_dir", "./uploads")
    if not os.path.isdir(upload_dir):
        return {"files": []}
    files = [
        f for f in os.listdir(upload_dir)
        if f.lower().endswith((".mp4", ".avi", ".mov", ".mkv", ".webm"))
    ]
    return {"files": sorted(files)}


@router.get("/source/info")
async def get_source_info():
    source = getattr(_app_state, "video_source", None)
    if source is None or not source.is_open:
        return {"status": "no_active_source"}
    
    # Use the source's own info method which includes paused state
    info = source.get_info()
    
    # Add metadata fields if available
    meta = source.get_metadata()
    if meta:
        info.update({
            "total_frames": meta.total_frames,
            "native_fps": meta.native_fps,
            "duration_sec": meta.duration_sec,
            "resolution": list(meta.resolution),
        })
    return info


@router.post("/source/playback")
async def playback_control(body: PlaybackRequest):
    source = getattr(_app_state, "video_source", None)
    if source is None or not source.is_open:
        raise HTTPException(400, "No active source")

    if body.action == "pause":
        source.pause()
    elif body.action == "resume":
        source.resume()
    elif body.action == "seek":
        source.seek(int(body.value))
    elif body.action == "seek_percent":
        source.seek_percent(body.value)
    elif body.action == "speed":
        source.set_speed(body.value)
    else:
        raise HTTPException(400, f"Unknown action: {body.action}")

    return {"action": body.action, "value": body.value}


# ── Model Management ─────────────────────────────────────────────

MODELS_DIR = Path("./models")
BUILT_IN_MODELS = ["yolov8n.pt", "yolov8s.pt", "yolov8m.pt"]


class ModelSwitchRequest(BaseModel):
    model_path: str  # filename like "yolov8n.pt" or "my_custom.pt"


@router.post("/model/upload")
async def upload_model(file: UploadFile = File(...)):
    """Upload a custom YOLO .pt model file."""
    if not file.filename.endswith(".pt"):
        raise HTTPException(400, "Only .pt model files are accepted")

    os.makedirs(MODELS_DIR, exist_ok=True)
    dest = MODELS_DIR / file.filename
    content = await file.read()
    dest.write_bytes(content)
    logger.info("Uploaded model: %s (%.1f MB)", file.filename, len(content) / 1e6)
    return {"filename": file.filename, "size_mb": round(len(content) / 1e6, 2)}


@router.get("/model/list")
async def list_models():
    """List built-in + user-uploaded models."""
    models = []

    # Built-in models (in cwd or already downloaded by ultralytics)
    for name in BUILT_IN_MODELS:
        models.append({"name": name, "type": "built-in", "loaded": False})

    # User-uploaded models
    if MODELS_DIR.is_dir():
        for f in sorted(MODELS_DIR.iterdir()):
            if f.suffix == ".pt" and f.name not in BUILT_IN_MODELS:
                size_mb = round(f.stat().st_size / 1e6, 2)
                models.append({"name": f.name, "type": "custom", "size_mb": size_mb, "loaded": False})

    # Mark the currently loaded model
    engine = getattr(_app_state, "engine", None)
    if engine and engine._model_path:
        current = Path(engine._model_path).name
        for m in models:
            if m["name"] == current:
                m["loaded"] = True

    return {"models": models}


@router.post("/model/switch")
async def switch_model(body: ModelSwitchRequest):
    """Hot-switch the active inference model."""
    engine = _get("engine")

    # Resolve model path: check custom uploads first, then CWD/built-in
    custom_path = MODELS_DIR / body.model_path
    if custom_path.exists():
        model_path = str(custom_path)
    else:
        # Built-in — ultralytics will download if not cached
        model_path = body.model_path

    try:
        engine.load_model(model_path)
        return {"status": "switched", "model": body.model_path}
    except Exception as exc:
        raise HTTPException(500, f"Failed to load model: {exc}")
