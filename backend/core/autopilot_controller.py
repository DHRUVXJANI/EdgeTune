"""
Autopilot Controller — finite-state optimization engine.

Evaluates telemetry snapshots, decides whether to escalate or
de-escalate the optimization level, and applies parameter changes
to the inference engine.  Uses hysteresis and cooldown timers to
prevent oscillation.

The controller is **source-aware**:
- Camera / paced mode: targets stable FPS at the native frame rate.
- Benchmark mode (video file): targets maximum throughput.

The controller **never** directly sets FPS.  It adjusts execution
parameters; FPS changes are a side-effect.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Dict, List, Optional

from core.hardware_profiler import HardwareProfile, PerformanceTier
from core.inference_engine import InferenceEngine, InferenceParams
from core.telemetry_monitor import TelemetrySnapshot

logger = logging.getLogger(__name__)


# ── Data Structures ──────────────────────────────────────────────


class AutopilotState(str, Enum):
    """FSM states — ordered from least to most aggressive."""
    STABLE = "stable"
    SOFT_TUNING = "soft_tuning"
    BALANCED_TUNING = "balanced_tuning"
    AGGRESSIVE_TUNING = "aggressive_tuning"


class AutopilotMode(str, Enum):
    """User-facing preset that shifts escalation sensitivity."""
    SPEED = "speed"
    BALANCED = "balanced"
    ACCURACY = "accuracy"


@dataclass
class OptimizationDecision:
    """Record of an optimization action taken by the controller."""
    timestamp: float
    previous_state: str
    new_state: str
    action: str
    reason: str
    params_applied: Dict[str, Any]
    telemetry_summary: Dict[str, float]

    def to_dict(self) -> dict:
        return {
            "timestamp": round(self.timestamp, 3),
            "previous_state": self.previous_state,
            "new_state": self.new_state,
            "action": self.action,
            "reason": self.reason,
            "params_applied": self.params_applied,
            "telemetry_summary": self.telemetry_summary,
        }


# ── Threshold presets per mode ───────────────────────────────────

_MODE_THRESHOLDS: Dict[AutopilotMode, Dict[str, float]] = {
    AutopilotMode.SPEED: {
        "escalate_gpu": 80,
        "deescalate_gpu": 60,
        "escalate_fps_drop_pct": 15,
        "deescalate_fps_recovery_pct": 10,
    },
    AutopilotMode.BALANCED: {
        "escalate_gpu": 90,
        "deescalate_gpu": 70,
        "escalate_fps_drop_pct": 25,
        "deescalate_fps_recovery_pct": 15,
    },
    AutopilotMode.ACCURACY: {
        "escalate_gpu": 95,
        "deescalate_gpu": 80,
        "escalate_fps_drop_pct": 35,
        "deescalate_fps_recovery_pct": 25,
    },
}

# FSM transition order
_STATE_ORDER: List[AutopilotState] = [
    AutopilotState.STABLE,
    AutopilotState.SOFT_TUNING,
    AutopilotState.BALANCED_TUNING,
    AutopilotState.AGGRESSIVE_TUNING,
]


# ── Controller ───────────────────────────────────────────────────


class AutopilotController:
    """
    Finite-state machine that evaluates telemetry and tunes inference
    parameters across a SOFT → BALANCED → AGGRESSIVE hierarchy.
    """

    def __init__(
        self,
        hardware: HardwareProfile,
        engine: InferenceEngine,
        mode: str = "balanced",
        cooldown_seconds: float = 5.0,
        escalate_ticks: int = 3,
        deescalate_ticks: int = 5,
        is_benchmark: bool = False,
    ) -> None:
        self._hardware = hardware
        self._engine = engine
        self._mode = AutopilotMode(mode)
        self._cooldown = cooldown_seconds
        self._escalate_ticks_needed = escalate_ticks
        self._deescalate_ticks_needed = deescalate_ticks
        self._is_benchmark = is_benchmark

        # FSM state
        self._state = AutopilotState.STABLE
        self._last_transition_time: float = 0.0
        self._escalate_counter: int = 0
        self._deescalate_counter: int = 0

        # FPS baseline — set after first few ticks
        self._baseline_fps: Optional[float] = None
        self._warmup_ticks: int = 0
        self._warmup_target: int = 5

        # Decision log
        self._decisions: list[OptimizationDecision] = []

    # ── Public API ───────────────────────────────────────────────

    def evaluate(self, snapshot: TelemetrySnapshot) -> Optional[OptimizationDecision]:
        """
        Evaluate a telemetry snapshot and possibly transition state.
        Returns an ``OptimizationDecision`` if a change was made,
        ``None`` otherwise.
        """
        # Warm-up: establish baseline FPS
        if self._baseline_fps is None:
            self._warmup_ticks += 1
            if self._warmup_ticks >= self._warmup_target and snapshot.fps > 0:
                self._baseline_fps = snapshot.fps
                logger.info("Autopilot baseline FPS set to %.1f", self._baseline_fps)
            return None

        thresholds = _MODE_THRESHOLDS[self._mode]

        should_escalate = self._should_escalate(snapshot, thresholds)
        should_deescalate = self._should_deescalate(snapshot, thresholds)

        # Hysteresis counters
        if should_escalate:
            self._escalate_counter += 1
            self._deescalate_counter = 0
        elif should_deescalate:
            self._deescalate_counter += 1
            self._escalate_counter = 0
        else:
            self._escalate_counter = 0
            self._deescalate_counter = 0

        # Cooldown gate
        now = time.time()
        if now - self._last_transition_time < self._cooldown:
            return None

        # Transition?
        decision = None
        if self._escalate_counter >= self._escalate_ticks_needed:
            decision = self._escalate(snapshot)
        elif self._deescalate_counter >= self._deescalate_ticks_needed:
            decision = self._deescalate(snapshot)

        if decision:
            self._last_transition_time = now
            self._escalate_counter = 0
            self._deescalate_counter = 0
            self._decisions.append(decision)

        return decision

    def set_mode(self, mode: str) -> None:
        self._mode = AutopilotMode(mode)
        logger.info("Autopilot mode changed to: %s", self._mode.value)

    def set_benchmark(self, enabled: bool) -> None:
        self._is_benchmark = enabled

    @property
    def state(self) -> str:
        return self._state.value

    @property
    def mode(self) -> str:
        return self._mode.value

    def get_recent_decisions(self, n: int = 20) -> List[Dict]:
        return [d.to_dict() for d in self._decisions[-n:]]

    def get_state_info(self) -> Dict[str, Any]:
        return {
            "state": self._state.value,
            "mode": self._mode.value,
            "baseline_fps": self._baseline_fps,
            "is_benchmark": self._is_benchmark,
            "tier": self._hardware.tier.value,
            "current_params": self._engine.get_current_params(),
        }

    # ── Escalation / De-escalation Logic ─────────────────────────

    def _should_escalate(self, snap: TelemetrySnapshot, t: Dict) -> bool:
        """Returns True if conditions warrant moving to a more aggressive state."""
        gpu_hot = snap.gpu_utilization_pct > t["escalate_gpu"]

        fps_dropped = False
        if self._baseline_fps and self._baseline_fps > 0:
            drop_pct = (1 - snap.fps / self._baseline_fps) * 100
            fps_dropped = drop_pct > t["escalate_fps_drop_pct"]

        return gpu_hot or fps_dropped

    def _should_deescalate(self, snap: TelemetrySnapshot, t: Dict) -> bool:
        """Returns True if we can safely back off to a less aggressive state."""
        if self._state == AutopilotState.STABLE:
            return False  # already at minimum

        gpu_cool = snap.gpu_utilization_pct < t["deescalate_gpu"]

        fps_recovered = False
        if self._baseline_fps and self._baseline_fps > 0:
            recovery_pct = (1 - snap.fps / self._baseline_fps) * 100
            fps_recovered = recovery_pct < t["deescalate_fps_recovery_pct"]

        return gpu_cool and fps_recovered

    # ── State Transitions ────────────────────────────────────────

    def _escalate(self, snap: TelemetrySnapshot) -> Optional[OptimizationDecision]:
        idx = _STATE_ORDER.index(self._state)
        if idx >= len(_STATE_ORDER) - 1:
            return None  # already at most aggressive

        prev = self._state
        self._state = _STATE_ORDER[idx + 1]
        action, params = self._apply_state(self._state)

        return OptimizationDecision(
            timestamp=time.time(),
            previous_state=prev.value,
            new_state=self._state.value,
            action=action,
            reason=self._build_reason(snap, "escalate"),
            params_applied=params,
            telemetry_summary={
                "gpu_util": snap.gpu_utilization_pct,
                "fps": snap.fps,
                "vram_used": snap.vram_used_gb,
            },
        )

    def _deescalate(self, snap: TelemetrySnapshot) -> Optional[OptimizationDecision]:
        idx = _STATE_ORDER.index(self._state)
        if idx <= 0:
            return None  # already at STABLE

        prev = self._state
        self._state = _STATE_ORDER[idx - 1]
        action, params = self._apply_state(self._state)

        return OptimizationDecision(
            timestamp=time.time(),
            previous_state=prev.value,
            new_state=self._state.value,
            action=action,
            reason=self._build_reason(snap, "deescalate"),
            params_applied=params,
            telemetry_summary={
                "gpu_util": snap.gpu_utilization_pct,
                "fps": snap.fps,
                "vram_used": snap.vram_used_gb,
            },
        )

    # ── Apply Optimization Params ────────────────────────────────

    def _apply_state(self, state: AutopilotState) -> tuple[str, Dict[str, Any]]:
        """
        Map FSM state to concrete inference parameter changes.
        Returns (action_description, params_dict).
        """
        current = self._engine.get_current_params()

        if state == AutopilotState.STABLE:
            params = InferenceParams(
                half_precision=False,
                input_size=(640, 640),
                process_every_n_frames=1,
                model_variant=current.get("model_variant", "yolov8n"),
            )
            action = "restore_defaults"

        elif state == AutopilotState.SOFT_TUNING:
            params = InferenceParams(
                half_precision=self._hardware.fp16_supported,
                input_size=(640, 640),
                process_every_n_frames=1,
                model_variant=current.get("model_variant", "yolov8n"),
            )
            action = "enable_fp16" if self._hardware.fp16_supported else "soft_tuning"

        elif state == AutopilotState.BALANCED_TUNING:
            # Reduce resolution based on tier
            new_size = (480, 480) if self._hardware.tier == PerformanceTier.LOW else (544, 544)
            params = InferenceParams(
                half_precision=self._hardware.fp16_supported,
                input_size=new_size,
                process_every_n_frames=1,
                model_variant=current.get("model_variant", "yolov8n"),
            )
            action = f"reduce_resolution_{new_size[0]}"

        elif state == AutopilotState.AGGRESSIVE_TUNING:
            new_size = (416, 416) if self._hardware.tier == PerformanceTier.LOW else (480, 480)
            lighter_model = "yolov8n"  # always fall back to nano in aggressive
            params = InferenceParams(
                half_precision=self._hardware.fp16_supported,
                input_size=new_size,
                process_every_n_frames=2,
                model_variant=lighter_model,
            )
            action = "aggressive_skip_frames_and_downscale"
        else:
            return "noop", {}

        self._engine.configure(params)
        return action, {
            "input_size": list(params.input_size),
            "half_precision": params.half_precision,
            "process_every_n_frames": params.process_every_n_frames,
            "model_variant": params.model_variant,
        }

    # ── Helpers ──────────────────────────────────────────────────

    @staticmethod
    def _build_reason(snap: TelemetrySnapshot, direction: str) -> str:
        return (
            f"{direction.title()} triggered: "
            f"GPU {snap.gpu_utilization_pct:.0f}%, "
            f"FPS {snap.fps:.1f}, "
            f"VRAM {snap.vram_used_gb:.1f}/{snap.vram_total_gb:.1f} GB"
        )
