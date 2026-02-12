"""
Hardware Profiler — GPU capability detection and performance tiering.

Detects the user's GPU at startup, reads VRAM / compute capability,
and classifies the hardware into a capability-based performance tier.
Falls back to CPU-only profile when no NVIDIA GPU is present.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import psutil

logger = logging.getLogger(__name__)


# ── Data Structures ──────────────────────────────────────────────


class PerformanceTier(str, Enum):
    """Capability-based tier — NOT tied to GPU model strings."""
    LOW = "low"
    MID = "mid"
    HIGH = "high"
    CPU_ONLY = "cpu_only"


@dataclass(frozen=True)
class HardwareProfile:
    """Immutable snapshot of detected hardware capabilities."""
    gpu_name: str
    gpu_available: bool
    vram_total_gb: float
    compute_capability: tuple[int, int]
    fp16_supported: bool
    tensor_cores: bool
    tier: PerformanceTier
    cpu_cores: int
    ram_total_gb: float
    recommended_device: str  # "cuda:0" | "cpu"


# ── Profiler ─────────────────────────────────────────────────────


class HardwareProfiler:
    """
    Detects GPU capabilities via pynvml and classifies into a
    performance tier.  Entirely stateless after ``detect()`` runs.
    """

    # VRAM tier boundaries (GB)
    _LOW_CEILING: float = 8.0
    _MID_CEILING: float = 16.0

    # Compute-capability thresholds
    _FP16_MIN_CC: tuple[int, int] = (5, 3)
    _TENSOR_CORE_MIN_CC: tuple[int, int] = (7, 0)

    def __init__(self) -> None:
        self._profile: Optional[HardwareProfile] = None

    # ── Public API ───────────────────────────────────────────────

    def detect(self) -> HardwareProfile:
        """Run full hardware detection and return a ``HardwareProfile``."""
        # Check PyTorch CUDA availability FIRST — before pynvml grabs the
        # driver handle, which can interfere with torch's lazy CUDA init.
        torch_cuda_ok = False
        try:
            import torch
            torch_cuda_ok = torch.cuda.is_available()
            if torch_cuda_ok:
                logger.info("PyTorch CUDA available (torch %s, CUDA %s)",
                            torch.__version__, torch.version.cuda)
            else:
                logger.warning("PyTorch reports CUDA not available — will use CPU.")
        except ImportError:
            pass  # torch not installed yet

        try:
            profile = self._detect_nvidia()
        except Exception as exc:
            logger.warning("NVIDIA GPU detection failed (%s). Falling back to CPU.", exc)
            profile = self._cpu_fallback()

        # If pynvml found a GPU but PyTorch can't use CUDA, fall back to CPU
        if profile.gpu_available and not torch_cuda_ok:
            logger.warning(
                "pynvml detected %s but PyTorch has no CUDA support. "
                "Install the CUDA build of PyTorch to use GPU. Falling back to CPU.",
                profile.gpu_name,
            )
            profile = self._cpu_fallback()

        self._profile = profile
        logger.info(
            "Hardware profile: %s | VRAM %.1f GB | Tier %s | Device %s",
            profile.gpu_name,
            profile.vram_total_gb,
            profile.tier.value,
            profile.recommended_device,
        )
        return profile

    def get_profile(self) -> HardwareProfile:
        """Return cached profile.  Calls ``detect()`` if not yet run."""
        if self._profile is None:
            return self.detect()
        return self._profile

    # ── Internal ─────────────────────────────────────────────────

    def _detect_nvidia(self) -> HardwareProfile:
        import pynvml  # deferred — only imported when GPU is present

        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)

        gpu_name: str = pynvml.nvmlDeviceGetName(handle)
        if isinstance(gpu_name, bytes):
            gpu_name = gpu_name.decode("utf-8")

        mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        vram_total_gb = round(mem_info.total / (1024 ** 3), 2)

        cc_major, cc_minor = pynvml.nvmlDeviceGetCudaComputeCapability(handle)
        compute_capability = (cc_major, cc_minor)

        fp16 = self._check_fp16(compute_capability)
        tensor = self._check_tensor_cores(compute_capability)
        tier = self._classify_tier(vram_total_gb)

        pynvml.nvmlShutdown()

        return HardwareProfile(
            gpu_name=gpu_name,
            gpu_available=True,
            vram_total_gb=vram_total_gb,
            compute_capability=compute_capability,
            fp16_supported=fp16,
            tensor_cores=tensor,
            tier=tier,
            cpu_cores=psutil.cpu_count(logical=False) or 1,
            ram_total_gb=round(psutil.virtual_memory().total / (1024 ** 3), 2),
            recommended_device="cuda:0",
        )

    def _cpu_fallback(self) -> HardwareProfile:
        return HardwareProfile(
            gpu_name="N/A (CPU only)",
            gpu_available=False,
            vram_total_gb=0.0,
            compute_capability=(0, 0),
            fp16_supported=False,
            tensor_cores=False,
            tier=PerformanceTier.CPU_ONLY,
            cpu_cores=psutil.cpu_count(logical=False) or 1,
            ram_total_gb=round(psutil.virtual_memory().total / (1024 ** 3), 2),
            recommended_device="cpu",
        )

    # ── Capability checks ────────────────────────────────────────

    @staticmethod
    def _check_fp16(cc: tuple[int, int]) -> bool:
        return cc >= HardwareProfiler._FP16_MIN_CC

    @staticmethod
    def _check_tensor_cores(cc: tuple[int, int]) -> bool:
        return cc >= HardwareProfiler._TENSOR_CORE_MIN_CC

    def _classify_tier(self, vram_gb: float) -> PerformanceTier:
        if vram_gb <= 0:
            return PerformanceTier.CPU_ONLY
        if vram_gb < self._LOW_CEILING:
            return PerformanceTier.LOW
        if vram_gb <= self._MID_CEILING:
            return PerformanceTier.MID
        return PerformanceTier.HIGH
