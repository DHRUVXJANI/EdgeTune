"""
Inference Engine — YOLO model wrapper with hot-reconfigurable parameters.

Loads the model once at startup, then allows resolution, precision,
frame-skip, and backend to be changed on the fly without reloading.
Supports lazy model-variant swapping when the autopilot controller
requests a lighter (or heavier) model.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Deque, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# ── Data Structures ──────────────────────────────────────────────


@dataclass
class InferenceParams:
    """Hot-reconfigurable inference parameters."""
    input_size: Tuple[int, int] = (640, 640)
    confidence_threshold: float = 0.25
    iou_threshold: float = 0.45
    half_precision: bool = False
    backend: str = "pytorch"           # "pytorch" | "onnx" | "tensorrt"
    process_every_n_frames: int = 1
    model_variant: str = "yolov8n"


@dataclass
class Detection:
    """Single detected object."""
    bbox: Tuple[int, int, int, int]  # x1, y1, x2, y2
    confidence: float
    class_id: int
    class_name: str


@dataclass
class DetectionResult:
    """Result of a single frame inference."""
    detections: List[Detection]
    annotated_frame: Optional[np.ndarray]
    latency_ms: float
    frame_number: int
    skipped: bool  # True if frame was skipped due to process_every_n_frames


# ── Engine ───────────────────────────────────────────────────────


class InferenceEngine:
    """
    Wraps the Ultralytics YOLO model with production-grade lifecycle
    management and hot-reconfiguration.

    Usage::

        engine = InferenceEngine(device="cuda:0")
        engine.load_model("yolov8n.pt")
        engine.configure(InferenceParams(half_precision=True))
        result = engine.run_frame(frame)
    """

    _FPS_WINDOW = 30  # rolling window for FPS calculation

    def __init__(self, device: str = "auto") -> None:
        self._device = device
        self._model: Any = None
        self._model_path: Optional[str] = None
        self._params = InferenceParams()
        self._frame_counter: int = 0
        self._last_result: Optional[DetectionResult] = None

        # FPS / latency tracking
        self._frame_times: Deque[float] = deque(maxlen=self._FPS_WINDOW)
        self._latencies: Deque[float] = deque(maxlen=self._FPS_WINDOW)
        self._running: bool = False

    # ── Model Lifecycle ──────────────────────────────────────────

    def load_model(self, model_path: str) -> None:
        """Load (or reload) the YOLO model."""
        from ultralytics import YOLO

        logger.info("Loading model: %s (device=%s)", model_path, self._device)
        self._model = YOLO(model_path)
        self._model_path = model_path

        # Pin to device
        if self._device != "auto":
            self._model.to(self._device)

        self._frame_counter = 0
        logger.info("Model loaded successfully.")

    def _swap_model_if_needed(self, new_variant: str) -> None:
        """Lazy model swap when autopilot changes the variant."""
        expected_path = f"{new_variant}.pt"
        if self._model_path and self._model_path != expected_path:
            logger.info("Swapping model variant: %s → %s", self._model_path, expected_path)
            self.load_model(expected_path)

    # ── Configuration ────────────────────────────────────────────

    def configure(self, params: InferenceParams) -> None:
        """
        Hot-reconfigure inference parameters **without** reloading
        the model (unless model_variant changes).
        """
        # Swap model only if variant actually changed
        if params.model_variant != self._params.model_variant:
            self._swap_model_if_needed(params.model_variant)

        self._params = params
        logger.info(
            "Inference params updated: size=%s half=%s skip=%d backend=%s",
            params.input_size,
            params.half_precision,
            params.process_every_n_frames,
            params.backend,
        )

    # ── Inference ────────────────────────────────────────────────

    def run_frame(self, frame: np.ndarray) -> DetectionResult:
        """
        Run inference on a single frame.

        Respects ``process_every_n_frames`` — if the current frame
        should be skipped, the previous result is returned with
        ``skipped=True``.
        """
        self._frame_counter += 1

        # ── Frame skip gating ────────────────────────────────────
        if (
            self._params.process_every_n_frames > 1
            and self._frame_counter % self._params.process_every_n_frames != 0
        ):
            if self._last_result:
                return DetectionResult(
                    detections=self._last_result.detections,
                    annotated_frame=self._last_result.annotated_frame,
                    latency_ms=0.0,
                    frame_number=self._frame_counter,
                    skipped=True,
                )
            # No previous result yet — run anyway
            pass

        # ── Pre-process ──────────────────────────────────────────
        h, w = self._params.input_size
        if frame.shape[:2] != (h, w):
            resized = cv2.resize(frame, (w, h))
        else:
            resized = frame

        # ── Run model ────────────────────────────────────────────
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        t0 = time.perf_counter()
        results = self._model(
            resized,
            conf=self._params.confidence_threshold,
            iou=self._params.iou_threshold,
            half=self._params.half_precision,
            verbose=False,
        )
        latency_ms = (time.perf_counter() - t0) * 1000

        # ── Parse results ────────────────────────────────────────
        detections: List[Detection] = []
        annotated_frame: Optional[np.ndarray] = None

        if results and len(results) > 0:
            r = results[0]
            annotated_frame = r.plot()

            if r.boxes is not None:
                for box in r.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                    conf = float(box.conf[0].cpu().numpy())
                    cls_id = int(box.cls[0].cpu().numpy())
                    cls_name = r.names.get(cls_id, str(cls_id))
                    detections.append(Detection(
                        bbox=(x1, y1, x2, y2),
                        confidence=conf,
                        class_id=cls_id,
                        class_name=cls_name,
                    ))

        # ── Update metrics ───────────────────────────────────────
        now = time.perf_counter()
        self._frame_times.append(now)
        self._latencies.append(latency_ms)

        result = DetectionResult(
            detections=detections,
            annotated_frame=annotated_frame,
            latency_ms=latency_ms,
            frame_number=self._frame_counter,
            skipped=False,
        )
        self._last_result = result
        return result

    # ── Stats ────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, float]:
        """Return current FPS and average latency."""
        fps = 0.0
        if len(self._frame_times) >= 2:
            elapsed = self._frame_times[-1] - self._frame_times[0]
            if elapsed > 0:
                fps = (len(self._frame_times) - 1) / elapsed

        avg_latency = (
            sum(self._latencies) / len(self._latencies)
            if self._latencies
            else 0.0
        )

        return {"fps": round(fps, 1), "avg_latency_ms": round(avg_latency, 1)}

    def get_current_params(self) -> Dict[str, Any]:
        """Return current inference parameters as a dict."""
        return {
            "input_size": list(self._params.input_size),
            "confidence_threshold": self._params.confidence_threshold,
            "half_precision": self._params.half_precision,
            "backend": self._params.backend,
            "process_every_n_frames": self._params.process_every_n_frames,
            "model_variant": self._params.model_variant,
        }

    @property
    def frame_counter(self) -> int:
        return self._frame_counter

    @property
    def is_loaded(self) -> bool:
        return self._model is not None
