"""
LLM Performance Analyst — explains autopilot decisions in plain language.

Calls a local Ollama model (default: Phi-3 Mini) or optionally a cloud
LLM (Gemini).  The analyst is **strictly read-only** — it has no
reference to the controller or inference engine and cannot modify
system behaviour.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

# ── Default prompt template ──────────────────────────────────────

_SYSTEM_PROMPT = (
    "You are an edge-AI performance analyst embedded in a local GPU "
    "monitoring tool.  The user runs YOLO inference on their own hardware.  "
    "Your job is to explain optimisation decisions in 1–3 concise sentences.  "
    "Mention the GPU capability, the telemetry trigger, and why the chosen "
    "action helps.  Never suggest actions yourself — only explain what was "
    "already done."
)

_USER_TEMPLATE = (
    "Hardware: {gpu_name} ({vram_total:.1f} GB VRAM, tier={tier}).\n"
    "Telemetry: GPU utilisation {gpu_util:.0f}%, FPS {fps:.1f}, "
    "VRAM used {vram_used:.1f}/{vram_total:.1f} GB.\n"
    "Decision: transitioned from {prev_state} → {new_state}.\n"
    "Action taken: {action}.\n"
    "Params applied: {params}.\n\n"
    "Explain this decision."
)


class LLMAnalyst:
    """
    Generates human-readable explanations for autopilot decisions.

    Usage::

        analyst = LLMAnalyst(provider="ollama")
        text = await analyst.explain(decision_dict, hardware_dict)
    """

    def __init__(
        self,
        provider: str = "ollama",
        ollama_endpoint: str = "http://localhost:11434",
        ollama_model: str = "phi3:mini",
        ollama_timeout: float = 10.0,
        gemini_api_key: str = "",
        gemini_model: str = "gemini-2.0-flash",
        enabled: bool = True,
    ) -> None:
        self._provider = provider
        self._ollama_endpoint = ollama_endpoint.rstrip("/")
        self._ollama_model = ollama_model
        self._ollama_timeout = ollama_timeout
        self._gemini_api_key = gemini_api_key
        self._gemini_model = gemini_model
        self._enabled = enabled
        self._client = httpx.AsyncClient(timeout=ollama_timeout)

    # ── Public API ───────────────────────────────────────────────

    async def explain(
        self,
        decision: Dict[str, Any],
        hardware: Dict[str, Any],
    ) -> str:
        """
        Generate a plain-language explanation for an optimisation decision.

        Returns a canned fallback if the LLM is unavailable.
        """
        if not self._enabled:
            return self._canned_explanation(decision)

        prompt = self._build_prompt(decision, hardware)

        try:
            if self._provider == "ollama":
                return await self._call_ollama(prompt)
            elif self._provider == "gemini":
                return await self._call_gemini(prompt)
            else:
                logger.warning("Unknown LLM provider: %s", self._provider)
                return self._canned_explanation(decision)
        except Exception:
            logger.exception("LLM call failed — returning canned explanation")
            return self._canned_explanation(decision)

    async def health_check(self) -> bool:
        """Check whether the configured LLM backend is reachable."""
        if self._provider == "ollama":
            try:
                r = await self._client.get(f"{self._ollama_endpoint}/api/version")
                return r.status_code == 200
            except Exception:
                return False
        return True  # cloud is presumed reachable

    async def close(self) -> None:
        await self._client.aclose()

    # ── Prompt Construction ──────────────────────────────────────

    @staticmethod
    def _build_prompt(decision: Dict, hardware: Dict) -> str:
        telemetry = decision.get("telemetry_summary", {})
        return _USER_TEMPLATE.format(
            gpu_name=hardware.get("gpu_name", "Unknown"),
            vram_total=hardware.get("vram_total_gb", 0),
            tier=hardware.get("tier", "unknown"),
            gpu_util=telemetry.get("gpu_util", 0),
            fps=telemetry.get("fps", 0),
            vram_used=telemetry.get("vram_used", 0),
            prev_state=decision.get("previous_state", "?"),
            new_state=decision.get("new_state", "?"),
            action=decision.get("action", "?"),
            params=decision.get("params_applied", {}),
        )

    # ── LLM Backends ─────────────────────────────────────────────

    async def _call_ollama(self, prompt: str) -> str:
        payload = {
            "model": self._ollama_model,
            "system": _SYSTEM_PROMPT,
            "prompt": prompt,
            "stream": False,
        }
        r = await self._client.post(
            f"{self._ollama_endpoint}/api/generate",
            json=payload,
        )
        r.raise_for_status()
        return r.json().get("response", "").strip()

    async def _call_gemini(self, prompt: str) -> str:
        if not self._gemini_api_key:
            return self._canned_explanation({})

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._gemini_model}:generateContent?key={self._gemini_api_key}"
        )
        payload = {
            "contents": [
                {"parts": [{"text": f"{_SYSTEM_PROMPT}\n\n{prompt}"}]}
            ]
        }
        r = await self._client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "").strip()
        return self._canned_explanation({})

    # ── Fallback ─────────────────────────────────────────────────

    @staticmethod
    def _canned_explanation(decision: Dict) -> str:
        action = decision.get("action", "parameter adjustment")
        new_state = decision.get("new_state", "tuning")
        return (
            f"The autopilot performed a {action} and transitioned to "
            f"{new_state} state to maintain stable inference performance "
            f"within the detected hardware constraints."
        )
