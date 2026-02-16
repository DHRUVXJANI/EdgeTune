"""
Advisor — always-on insight engine for the autopilot dashboard.

Periodically evaluates telemetry, hardware profile, and autopilot state
to produce contextual, read-only suggestions.  Unlike the autopilot
controller the advisor **never** modifies inference parameters — it
only generates human-readable tips.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

from core.hardware_profiler import HardwareProfile
from core.telemetry_monitor import TelemetrySnapshot

logger = logging.getLogger(__name__)


# ── Data Structures ──────────────────────────────────────────────


@dataclass
class AdvisorSuggestion:
    """A single read-only suggestion emitted by the advisor."""
    text: str
    category: str  # "tip" | "status" | "warning" | "info"
    timestamp: float

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "category": self.category,
            "timestamp": round(self.timestamp, 3),
        }


# ── Advisor ──────────────────────────────────────────────────────


class Advisor:
    """
    Rule-based suggestion engine that emits contextual insights at
    a fixed cooldown interval.

    Usage::

        advisor = Advisor(hardware_profile, cooldown=30.0)
        suggestion = advisor.evaluate(snapshot, autopilot_info)
        if suggestion:
            await broadcast_advisor_suggestion(...)
    """

    def __init__(
        self,
        hardware: HardwareProfile,
        cooldown: float = 30.0,
    ) -> None:
        self._hardware = hardware
        self._cooldown = cooldown
        self._last_emit_time: float = 0.0
        self._last_autopilot_state: Optional[str] = None
        self._suggestion_index: int = 0

    # ── Public API ───────────────────────────────────────────────

    def evaluate(
        self,
        snapshot: TelemetrySnapshot,
        autopilot_info: Dict[str, Any],
    ) -> Optional[AdvisorSuggestion]:
        """
        Evaluate current system state and return a suggestion if the
        cooldown period has elapsed.  Returns ``None`` otherwise.
        """
        now = time.time()
        if now - self._last_emit_time < self._cooldown:
            return None

        suggestion = self._generate(snapshot, autopilot_info)
        if suggestion:
            self._last_emit_time = now

        return suggestion

    # ── Rule Engine ──────────────────────────────────────────────

    def _generate(
        self,
        snap: TelemetrySnapshot,
        autopilot: Dict[str, Any],
    ) -> Optional[AdvisorSuggestion]:
        """
        Walk a priority-ordered rule list.  Returns the first
        suggestion that matches, rotating through lower-priority
        "always true" rules to keep the feed varied.
        """
        current_state = autopilot.get("state", "stable")
        current_params = autopilot.get("current_params", {})
        baseline_fps = autopilot.get("baseline_fps")
        model_variant = current_params.get("model_variant", "yolov8n")
        half_precision = current_params.get("half_precision", False)

        # ── Priority rules (fire immediately if matched) ─────────

        # 1. VRAM pressure warning
        if snap.vram_total_gb > 0:
            vram_pct = (snap.vram_used_gb / snap.vram_total_gb) * 100
            if vram_pct > 85:
                return AdvisorSuggestion(
                    text=(
                        f"VRAM usage is high at {snap.vram_used_gb:.1f}/{snap.vram_total_gb:.1f} GB "
                        f"({vram_pct:.0f}%). Consider switching to a lighter model or enabling FP16 "
                        f"to reduce memory pressure."
                    ),
                    category="warning",
                    timestamp=time.time(),
                )

        # 2. Post-escalation context
        if current_state != self._last_autopilot_state:
            prev = self._last_autopilot_state
            self._last_autopilot_state = current_state

            if prev is not None:
                state_labels = {
                    "stable": "Stable",
                    "soft_tuning": "Soft Tuning",
                    "balanced_tuning": "Balanced Tuning",
                    "aggressive_tuning": "Aggressive Tuning",
                }
                impact = {
                    "soft_tuning": "Enabled FP16 precision — minimal accuracy impact (~0.1% mAP), noticeable speed gain.",
                    "balanced_tuning": "Reduced input resolution — some small-object accuracy loss, significant FPS improvement.",
                    "aggressive_tuning": "Frame skipping active + reduced resolution — fastest mode, but may miss fast-moving objects.",
                    "stable": "All optimisations removed — running at full quality with default parameters.",
                }
                return AdvisorSuggestion(
                    text=(
                        f"Autopilot transitioned to {state_labels.get(current_state, current_state)}. "
                        f"{impact.get(current_state, '')}"
                    ),
                    category="info",
                    timestamp=time.time(),
                )
            else:
                self._last_autopilot_state = current_state

        # ── Rotating rules (cycle through these) ─────────────────

        rotating_rules = [
            self._rule_headroom,
            self._rule_stable_status,
            self._rule_fps_report,
            self._rule_hardware_capability,
        ]

        # Try each rule starting from where we left off
        for i in range(len(rotating_rules)):
            idx = (self._suggestion_index + i) % len(rotating_rules)
            suggestion = rotating_rules[idx](snap, autopilot)
            if suggestion:
                self._suggestion_index = (idx + 1) % len(rotating_rules)
                return suggestion

        return None

    # ── Individual Rules ─────────────────────────────────────────

    def _rule_headroom(
        self,
        snap: TelemetrySnapshot,
        autopilot: Dict[str, Any],
    ) -> Optional[AdvisorSuggestion]:
        """GPU well under capacity — suggest heavier model."""
        if snap.gpu_utilization_pct >= 50:
            return None

        model = autopilot.get("current_params", {}).get("model_variant", "yolov8n")
        upgrades = {"yolov8n": "yolov8s", "yolov8s": "yolov8m"}
        next_model = upgrades.get(model)

        if next_model:
            return AdvisorSuggestion(
                text=(
                    f"GPU at only {snap.gpu_utilization_pct:.0f}% — plenty of headroom. "
                    f"Consider upgrading from {model} to {next_model} for higher detection accuracy."
                ),
                category="tip",
                timestamp=time.time(),
            )

        return AdvisorSuggestion(
            text=(
                f"GPU at {snap.gpu_utilization_pct:.0f}% with {model} — your hardware has significant "
                f"spare capacity. The system is running at optimal accuracy."
            ),
            category="status",
            timestamp=time.time(),
        )

    def _rule_stable_status(
        self,
        snap: TelemetrySnapshot,
        autopilot: Dict[str, Any],
    ) -> Optional[AdvisorSuggestion]:
        """System running smoothly in the sweet spot."""
        baseline = autopilot.get("baseline_fps")
        if (
            50 <= snap.gpu_utilization_pct <= 70
            and baseline
            and baseline > 0
            and abs(1 - snap.fps / baseline) < 0.10
        ):
            return AdvisorSuggestion(
                text=(
                    f"System is well-optimised — GPU at {snap.gpu_utilization_pct:.0f}%, "
                    f"FPS steady at {snap.fps:.1f}. No adjustments needed."
                ),
                category="status",
                timestamp=time.time(),
            )
        return None

    def _rule_fps_report(
        self,
        snap: TelemetrySnapshot,
        autopilot: Dict[str, Any],
    ) -> Optional[AdvisorSuggestion]:
        """Report baseline FPS and current deviation."""
        baseline = autopilot.get("baseline_fps")
        if not baseline or baseline <= 0:
            return None

        deviation_pct = abs(1 - snap.fps / baseline) * 100

        if deviation_pct < 5:
            return AdvisorSuggestion(
                text=(
                    f"FPS baseline: {baseline:.1f} | Current: {snap.fps:.1f} — "
                    f"rock-steady performance with less than 5% deviation."
                ),
                category="status",
                timestamp=time.time(),
            )

        direction = "above" if snap.fps > baseline else "below"
        return AdvisorSuggestion(
            text=(
                f"FPS baseline: {baseline:.1f} | Current: {snap.fps:.1f} — "
                f"running {deviation_pct:.0f}% {direction} baseline."
            ),
            category="info",
            timestamp=time.time(),
        )

    def _rule_hardware_capability(
        self,
        snap: TelemetrySnapshot,
        autopilot: Dict[str, Any],
    ) -> Optional[AdvisorSuggestion]:
        """Mention available hardware features not currently in use."""
        half = autopilot.get("current_params", {}).get("half_precision", False)

        if self._hardware.fp16_supported and not half:
            return AdvisorSuggestion(
                text=(
                    f"Your {self._hardware.gpu_name} supports FP16 precision, "
                    f"which is not currently active. The autopilot will enable it "
                    f"automatically if GPU load increases."
                ),
                category="tip",
                timestamp=time.time(),
            )

        if self._hardware.tensor_cores and half:
            return AdvisorSuggestion(
                text=(
                    f"FP16 is active and your GPU has Tensor Cores — inference is "
                    f"accelerated. Current latency: {snap.latency_ms:.0f}ms per frame."
                ),
                category="info",
                timestamp=time.time(),
            )

        return None
