"""
Telemetry Monitor — async GPU / system metrics collector.

Runs as a background asyncio task, sampling GPU utilization, VRAM,
and system stats at a configurable interval.  Stores snapshots in a
thread-safe rolling window for downstream consumption by the
autopilot controller and WebSocket broadcaster.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, List, Optional

import psutil

logger = logging.getLogger(__name__)


# ── Data Structures ──────────────────────────────────────────────


@dataclass
class TelemetrySnapshot:
    """Single point-in-time telemetry reading."""
    timestamp: float                 # time.time()
    gpu_utilization_pct: float       # 0–100
    vram_used_gb: float
    vram_total_gb: float
    cpu_utilization_pct: float       # 0–100
    ram_used_gb: float
    fps: float                       # inference FPS (set externally)
    latency_ms: float                # per-frame latency (set externally)

    def to_dict(self) -> dict:
        return {
            "timestamp": round(self.timestamp, 3),
            "gpu_util": round(self.gpu_utilization_pct, 1),
            "vram_used": round(self.vram_used_gb, 2),
            "vram_total": round(self.vram_total_gb, 2),
            "cpu_util": round(self.cpu_utilization_pct, 1),
            "ram_used": round(self.ram_used_gb, 2),
            "fps": round(self.fps, 1),
            "latency_ms": round(self.latency_ms, 1),
        }


# ── Monitor ──────────────────────────────────────────────────────


class TelemetryMonitor:
    """
    Async background service that samples hardware metrics and exposes
    a rolling window of ``TelemetrySnapshot`` objects.

    Start with ``await monitor.start()``, stop with ``monitor.stop()``.
    """

    def __init__(
        self,
        sampling_interval_ms: int = 500,
        history_size: int = 3600,
        gpu_available: bool = True,
    ) -> None:
        self._interval = sampling_interval_ms / 1000.0
        self._history: Deque[TelemetrySnapshot] = deque(maxlen=history_size)
        self._gpu_available = gpu_available
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._running = False

        # Latest inference metrics — set externally by the inference engine
        self._current_fps: float = 0.0
        self._current_latency: float = 0.0

    # ── Lifecycle ────────────────────────────────────────────────

    async def start(self) -> None:
        """Launch background sampling loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._sampling_loop())
        logger.info("Telemetry monitor started (interval=%.1f s)", self._interval)

    def stop(self) -> None:
        """Signal the sampling loop to halt."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info("Telemetry monitor stopped.")

    # ── External metric injection ────────────────────────────────

    def update_inference_metrics(self, fps: float, latency_ms: float) -> None:
        """Called by the inference engine after each frame batch."""
        self._current_fps = fps
        self._current_latency = latency_ms

    # ── Accessors ────────────────────────────────────────────────

    async def get_latest(self) -> Optional[TelemetrySnapshot]:
        async with self._lock:
            return self._history[-1] if self._history else None

    async def get_history(self, n: Optional[int] = None) -> List[TelemetrySnapshot]:
        async with self._lock:
            if n is None:
                return list(self._history)
            return list(self._history)[-n:]

    async def get_summary_stats(self) -> dict:
        """Calculate average metrics over the current history."""
        async with self._lock:
            snaps = list(self._history)
        
        if not snaps:
            return {}
        
        count = len(snaps)
        avg_gpu = sum(s.gpu_utilization_pct for s in snaps) / count
        avg_vram = sum(s.vram_used_gb for s in snaps) / count
        avg_fps = sum(s.fps for s in snaps) / count
        avg_cpu = sum(s.cpu_utilization_pct for s in snaps) / count
        
        return {
            "avg_fps": round(avg_fps, 1),
            "avg_gpu_util": round(avg_gpu, 1),
            "avg_vram_used_gb": round(avg_vram, 2),
            "avg_cpu_util": round(avg_cpu, 1),
            "duration_sec": round(snaps[-1].timestamp - snaps[0].timestamp, 1)
        }

    # ── Internal ─────────────────────────────────────────────────

    async def _sampling_loop(self) -> None:
        while self._running:
            try:
                snapshot = self._sample()
                async with self._lock:
                    self._history.append(snapshot)
            except Exception:
                logger.exception("Telemetry sampling error")
            await asyncio.sleep(self._interval)

    def _sample(self) -> TelemetrySnapshot:
        gpu_util = 0.0
        vram_used = 0.0
        vram_total = 0.0

        if self._gpu_available:
            try:
                import pynvml
                pynvml.nvmlInit()
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                gpu_util = float(util.gpu)
                vram_used = round(mem.used / (1024 ** 3), 2)
                vram_total = round(mem.total / (1024 ** 3), 2)
                pynvml.nvmlShutdown()
            except Exception:
                logger.debug("GPU telemetry read failed, reporting zeros.")

        ram = psutil.virtual_memory()

        return TelemetrySnapshot(
            timestamp=time.time(),
            gpu_utilization_pct=gpu_util,
            vram_used_gb=vram_used,
            vram_total_gb=vram_total,
            cpu_utilization_pct=psutil.cpu_percent(interval=None),
            ram_used_gb=round(ram.used / (1024 ** 3), 2),
            fps=self._current_fps,
            latency_ms=self._current_latency,
        )
