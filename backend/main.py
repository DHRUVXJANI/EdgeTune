"""
Edge-AI Performance Autopilot — FastAPI Entrypoint

Boots the full local inference pipeline:
  1. Loads settings.yaml
  2. Detects hardware (GPU tier)
  3. Initialises inference engine, telemetry monitor, autopilot, LLM
  4. Starts the async inference pipeline loop
  5. Serves REST + WebSocket endpoints

Run with:
    cd backend
    python main.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

# Ensure the backend directory is on sys.path so subpackage imports resolve
# regardless of which directory the user runs `python main.py` from.
_BACKEND_DIR = Path(__file__).resolve().parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import cv2
import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as api_router, bind_app_state
from api.websocket import (
    broadcast_decision,
    broadcast_llm_explanation,
    broadcast_source_progress,
    broadcast_status,
    broadcast_telemetry,
    broadcast_video_frame,
    websocket_endpoint,
)
from core.autopilot_controller import AutopilotController
from core.hardware_profiler import HardwareProfiler
from core.inference_engine import InferenceEngine, InferenceParams
from core.telemetry_monitor import TelemetryMonitor
from core.video_source import VideoSource
from llm.analyst import LLMAnalyst
from llm.discovery import get_available_ollama_models, select_best_model

# ── Logging ──────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(name)s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("edgetune")


# ── Pipeline Orchestrator ────────────────────────────────────────


class InferencePipeline:
    """
    Orchestrates the full inference loop:
    VideoSource → InferenceEngine → Telemetry → Autopilot → WebSocket.
    """

    def __init__(
        self,
        engine: InferenceEngine,
        telemetry: TelemetryMonitor,
        controller: AutopilotController,
        analyst: LLMAnalyst,
        hardware_dict: dict,
        stream_video: bool = True,
        video_quality: int = 70,
        upload_dir: str = "./uploads",
    ) -> None:
        self._engine = engine
        self._telemetry = telemetry
        self._controller = controller
        self._analyst = analyst
        self._hardware_dict = hardware_dict
        self._stream_video = stream_video
        self._video_quality = video_quality
        self._upload_dir = upload_dir

        self._source = VideoSource()
        self._task: Optional[asyncio.Task] = None
        self._running = False

    @property
    def video_source(self) -> VideoSource:
        return self._source

    async def start(self, source: str = "camera", processing_mode: str = "paced") -> None:
        """Start the inference pipeline."""
        if self._running:
            self.stop()

        # Determine source
        if source == "camera" or source.isdigit():
            src = int(source) if source.isdigit() else 0
        else:
            # Treat as file path — resolve relative to upload dir
            src_path = Path(source)
            if not src_path.is_absolute():
                src_path = Path(self._upload_dir) / source
            src = str(src_path)

        self._source.open(src, processing_mode=processing_mode)
        is_benchmark = processing_mode == "benchmark"
        self._controller.set_benchmark(is_benchmark)

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Pipeline started: source=%s mode=%s", source, processing_mode)

    def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
        self._source.release()
        logger.info("Pipeline stopped.")

    async def _loop(self) -> None:
        """Main inference loop — runs until stopped."""
        telemetry_interval = 0.5  # seconds between telemetry broadcasts
        last_telemetry_broadcast = 0.0

        while self._running:
            # Get next frame
            ok, frame = self._source.read()
            if not ok:
                # If paused, wait and retry - DO NOT BREAK
                if self._source.is_paused:
                    await asyncio.sleep(0.1)
                    continue

                if self._source.get_metadata() and self._source.get_metadata().source_type.value == "file":
                    logger.info("End of video file reached.")
                    
                    summary = await self._telemetry.get_summary_stats()
                    msg = "Video analysis finished."
                    if summary:
                        msg += f" Avg FPS: {summary.get('avg_fps')} | GPU: {summary.get('avg_gpu_util')}%"

                    await broadcast_status("completed", msg, extra=summary)
                    self._running = False
                    break
                await asyncio.sleep(0.01)
                continue

            # Run inference
            result = self._engine.run_frame(frame)

            # Update telemetry with inference stats
            stats = self._engine.get_stats()
            self._telemetry.update_inference_metrics(
                fps=stats["fps"],
                latency_ms=stats["avg_latency_ms"],
            )

            # Broadcast video frame
            if self._stream_video and result.annotated_frame is not None:
                await broadcast_video_frame(result.annotated_frame, self._video_quality)

            # Periodic telemetry + autopilot evaluation
            now = time.time()
            if now - last_telemetry_broadcast >= telemetry_interval:
                last_telemetry_broadcast = now

                snap = await self._telemetry.get_latest()
                if snap:
                    await broadcast_telemetry(snap.to_dict())

                    # Autopilot evaluation
                    decision = self._controller.evaluate(snap)
                    if decision:
                        await broadcast_decision(decision.to_dict())

                        # LLM explanation (fire-and-forget)
                        asyncio.create_task(self._explain(decision.to_dict()))

                # Source progress (file mode)
                meta = self._source.get_metadata()
                if meta and meta.total_frames:
                    await broadcast_source_progress(
                        progress=self._source.get_progress(),
                        frame_number=self._source.get_current_frame_number(),
                        total_frames=meta.total_frames,
                        paused=self._source.is_paused,
                    )

            # Yield to the event loop
            await asyncio.sleep(0)

    async def _explain(self, decision_dict: dict) -> None:
        try:
            text = await self._analyst.explain(decision_dict, self._hardware_dict)
            await broadcast_llm_explanation(
                text=text,
                decision_id=str(decision_dict.get("timestamp", "")),
            )
        except Exception:
            logger.exception("LLM explanation failed")


# ── Settings Loader ──────────────────────────────────────────────


def load_settings() -> dict:
    settings_path = Path(__file__).parent / "config" / "settings.yaml"
    if not settings_path.exists():
        logger.warning("settings.yaml not found at %s, using defaults.", settings_path)
        return {}
    with open(settings_path) as f:
        return yaml.safe_load(f) or {}


# ── App Factory ──────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    settings = load_settings()

    # 1. Hardware detection
    profiler = HardwareProfiler()
    hardware = profiler.detect()
    app.state.hardware = hardware

    hardware_dict = {
        "gpu_name": hardware.gpu_name,
        "vram_total_gb": hardware.vram_total_gb,
        "tier": hardware.tier.value,
    }

    # 2. Inference engine
    inf_cfg = settings.get("inference", {})
    device = inf_cfg.get("device", "auto")
    if device == "auto":
        device = hardware.recommended_device

    engine = InferenceEngine(device=device)
    model_path = inf_cfg.get("model_path", "yolov8n.pt")
    engine.load_model(model_path)

    initial_params = InferenceParams(
        input_size=tuple(inf_cfg.get("input_size", [640, 640])),
        confidence_threshold=inf_cfg.get("confidence_threshold", 0.25),
        iou_threshold=inf_cfg.get("iou_threshold", 0.45),
        half_precision=inf_cfg.get("half_precision", False),
        backend=inf_cfg.get("backend", "pytorch"),
        model_variant=inf_cfg.get("model_variant", "yolov8n"),
    )
    engine.configure(initial_params)
    app.state.engine = engine

    # 3. Telemetry monitor
    tel_cfg = settings.get("telemetry", {})
    telemetry = TelemetryMonitor(
        sampling_interval_ms=tel_cfg.get("sampling_interval_ms", 500),
        history_size=tel_cfg.get("history_size", 120),
        gpu_available=hardware.gpu_available,
    )
    await telemetry.start()
    app.state.telemetry = telemetry

    # 4. Autopilot controller
    ap_cfg = settings.get("autopilot", {})
    controller = AutopilotController(
        hardware=hardware,
        engine=engine,
        mode=ap_cfg.get("mode", "balanced"),
        cooldown_seconds=ap_cfg.get("cooldown_seconds", 5.0),
        escalate_ticks=ap_cfg.get("escalate_ticks", 3),
        deescalate_ticks=ap_cfg.get("deescalate_ticks", 5),
    )
    app.state.controller = controller

    # 5. LLM analyst
    llm_cfg = settings.get("llm", {})
    ollama_cfg = llm_cfg.get("ollama", {})

    # Auto-detect Ollama model if configured to "auto"
    if llm_cfg.get("provider", "ollama") == "ollama" and ollama_cfg.get("model") == "auto":
        logger.info("Auto-detecting local Ollama models...")
        found_models = await get_available_ollama_models(ollama_cfg.get("endpoint", "http://localhost:11434"))
        best_model = select_best_model(found_models)
        if best_model:
            logger.info("Auto-selected LLM: %s", best_model)
            ollama_cfg["model"] = best_model
        else:
            logger.warning("No Ollama models found. Defaulting to 'phi3:mini'.")
            ollama_cfg["model"] = "phi3:mini"

    gemini_cfg = llm_cfg.get("gemini", {})
    analyst = LLMAnalyst(
        provider=llm_cfg.get("provider", "ollama"),
        ollama_endpoint=ollama_cfg.get("endpoint", "http://localhost:11434"),
        ollama_model=ollama_cfg.get("model", "phi3:mini"),
        ollama_timeout=ollama_cfg.get("timeout_seconds", 10),
        gemini_api_key=gemini_cfg.get("api_key", "") or os.getenv("GEMINI_API_KEY", ""),
        gemini_model=gemini_cfg.get("model", "gemini-2.0-flash"),
        enabled=llm_cfg.get("enabled", True),
    )
    app.state.analyst = analyst

    # 6. Pipeline
    src_cfg = settings.get("source", {})
    ws_cfg = settings.get("server", {}).get("websocket", {})
    upload_dir = src_cfg.get("upload_dir", "./uploads")
    os.makedirs(upload_dir, exist_ok=True)

    pipeline = InferencePipeline(
        engine=engine,
        telemetry=telemetry,
        controller=controller,
        analyst=analyst,
        hardware_dict=hardware_dict,
        stream_video=ws_cfg.get("stream_video", True),
        video_quality=ws_cfg.get("video_quality", 70),
        upload_dir=upload_dir,
    )
    app.state.pipeline = pipeline
    app.state.video_source = pipeline.video_source
    app.state.upload_dir = upload_dir

    # Bind app state to routes module for direct access
    bind_app_state(app.state)

    logger.info("═══ Edge-AI Performance Autopilot ready ═══")
    logger.info("  GPU: %s (%s)", hardware.gpu_name, hardware.tier.value)
    logger.info("  Model: %s on %s", model_path, device)
    logger.info("  Autopilot: %s mode", ap_cfg.get("mode", "balanced"))

    yield

    # Shutdown
    pipeline.stop()
    telemetry.stop()
    await analyst.close()
    logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Edge-AI Performance Autopilot",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    settings = load_settings()
    srv_cfg = settings.get("server", {})
    origins = srv_cfg.get("cors_origins", ["http://localhost:3000"])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # REST
    app.include_router(api_router)

    # WebSocket
    app.websocket("/ws")(websocket_endpoint)

    return app


# ── Entry point ──────────────────────────────────────────────────

app = create_app()

if __name__ == "__main__":
    import uvicorn

    settings = load_settings()
    srv = settings.get("server", {})
    uvicorn.run(
        "main:app",
        host=srv.get("host", "0.0.0.0"),
        port=srv.get("port", 8000),
        reload=False,
        log_level="info",
    )
