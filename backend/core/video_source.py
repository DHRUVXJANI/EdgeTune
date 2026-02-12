"""
Video Source — unified abstraction over camera and video file inputs.

Wraps ``cv2.VideoCapture`` and exposes playback controls (pause, seek,
speed) that only take effect in file mode.  Camera mode silently no-ops
playback calls and always runs in real-time.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# ── Data Structures ──────────────────────────────────────────────


class SourceType(str, Enum):
    CAMERA = "camera"
    FILE = "file"


class ProcessingMode(str, Enum):
    BENCHMARK = "benchmark"  # process as fast as GPU allows
    PACED = "paced"          # respect native FPS (with speed multiplier)


@dataclass
class SourceMetadata:
    """Read-only metadata about the current source."""
    source_type: SourceType
    total_frames: Optional[int]   # None for camera
    native_fps: Optional[float]   # None for camera
    duration_sec: Optional[float]  # None for camera
    resolution: Tuple[int, int]    # (width, height)


# ── Video Source ─────────────────────────────────────────────────


class VideoSource:
    """
    Unified frame provider for camera or video file.

    Usage::

        source = VideoSource()
        source.open(0)             # camera index
        source.open("video.mp4")   # file path
        ok, frame = source.read()
    """

    def __init__(self) -> None:
        self._cap: Optional[cv2.VideoCapture] = None
        self._source_type: SourceType = SourceType.CAMERA
        self._processing_mode: ProcessingMode = ProcessingMode.PACED
        self._paused: bool = False
        self._speed: float = 1.0
        self._last_frame_time: float = 0.0
        self._metadata: Optional[SourceMetadata] = None

    # ── Open / Close ─────────────────────────────────────────────

    def open(
        self,
        source: int | str,
        processing_mode: str = "paced",
    ) -> SourceMetadata:
        """
        Open a video source.

        Args:
            source: Camera index (int) or file path (str).
            processing_mode: ``"benchmark"`` or ``"paced"`` (file only).
        """
        self.release()

        if isinstance(source, int):
            self._source_type = SourceType.CAMERA
            self._cap = cv2.VideoCapture(source)
        else:
            if not os.path.isfile(source):
                raise FileNotFoundError(f"Video file not found: {source}")
            self._source_type = SourceType.FILE
            self._cap = cv2.VideoCapture(source)
            self._processing_mode = ProcessingMode(processing_mode)

        if not self._cap.isOpened():
            raise RuntimeError(f"Failed to open video source: {source}")

        self._metadata = self._build_metadata()
        self._paused = False
        self._speed = 1.0
        self._last_frame_time = time.perf_counter()

        logger.info(
            "Opened %s source: %s (%dx%d)",
            self._source_type.value,
            source,
            self._metadata.resolution[0],
            self._metadata.resolution[1],
        )
        return self._metadata

    def release(self) -> None:
        """Release the underlying VideoCapture."""
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._metadata = None
        self._paused = False

    @property
    def is_open(self) -> bool:
        return self._cap is not None and self._cap.isOpened()

    # ── Frame Reading ────────────────────────────────────────────

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        """
        Read the next frame.

        In **paced** file mode, this method sleeps to respect the
        video's native FPS (adjusted by the speed multiplier).
        In **benchmark** mode, frames are returned immediately.
        Camera mode always reads in real-time.

        Returns:
            (success, frame) — frame is ``None`` on failure / end-of-file.
        """
        if self._cap is None:
            return False, None

        if self._paused:
            return False, None  # caller should re-use the last frame

        # ── Frame pacing (file + paced mode only) ────────────────
        if (
            self._source_type == SourceType.FILE
            and self._processing_mode == ProcessingMode.PACED
            and self._metadata
            and self._metadata.native_fps
        ):
            target_interval = 1.0 / (self._metadata.native_fps * self._speed)
            elapsed = time.perf_counter() - self._last_frame_time
            if elapsed < target_interval:
                time.sleep(target_interval - elapsed)

        ret, frame = self._cap.read()
        self._last_frame_time = time.perf_counter()
        return ret, frame if ret else (False, None)

    # ── Playback Controls (file mode only) ───────────────────────

    def pause(self) -> None:
        if self._source_type == SourceType.FILE:
            self._paused = True

    def resume(self) -> None:
        if self._source_type == SourceType.FILE:
            self._paused = False
            self._last_frame_time = time.perf_counter()

    def seek(self, frame_number: int) -> None:
        """Seek to an absolute frame number (file mode only)."""
        if self._source_type == SourceType.FILE and self._cap:
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)

    def seek_percent(self, pct: float) -> None:
        """Seek to a percentage of the video (0.0 – 1.0)."""
        if (
            self._source_type == SourceType.FILE
            and self._cap
            and self._metadata
            and self._metadata.total_frames
        ):
            target = int(self._metadata.total_frames * max(0.0, min(1.0, pct)))
            self.seek(target)

    def set_speed(self, multiplier: float) -> None:
        """Set playback speed multiplier (0.25× – 4×).  File mode only."""
        if self._source_type == SourceType.FILE:
            self._speed = max(0.25, min(4.0, multiplier))

    def get_progress(self) -> float:
        """Return playback progress as 0.0 – 1.0.  Always 0 for camera."""
        if (
            self._source_type == SourceType.FILE
            and self._cap
            and self._metadata
            and self._metadata.total_frames
            and self._metadata.total_frames > 0
        ):
            current = int(self._cap.get(cv2.CAP_PROP_POS_FRAMES))
            return current / self._metadata.total_frames
        return 0.0

    def get_current_frame_number(self) -> int:
        if self._cap:
            return int(self._cap.get(cv2.CAP_PROP_POS_FRAMES))
        return 0

    # ── Metadata ─────────────────────────────────────────────────

    def get_metadata(self) -> Optional[SourceMetadata]:
        return self._metadata

    def _build_metadata(self) -> SourceMetadata:
        assert self._cap is not None

        w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        if self._source_type == SourceType.FILE:
            total = int(self._cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = self._cap.get(cv2.CAP_PROP_FPS)
            duration = total / fps if fps > 0 else 0.0
            return SourceMetadata(
                source_type=SourceType.FILE,
                total_frames=total,
                native_fps=fps,
                duration_sec=round(duration, 2),
                resolution=(w, h),
            )

        return SourceMetadata(
            source_type=SourceType.CAMERA,
            total_frames=None,
            native_fps=None,
            duration_sec=None,
            resolution=(w, h),
        )

    @property
    def is_paused(self) -> bool:
        return self._paused

    def get_info(self) -> dict:
        """Return runtime info dictionary."""
        progress = 0.0
        # If we have metadata for a file, calculate progress
        if (
            self._source_type == SourceType.FILE
            and self._cap
            and self._metadata
            and self._metadata.total_frames
            and self._metadata.total_frames > 0
        ):
            current = int(self._cap.get(cv2.CAP_PROP_POS_FRAMES))
            progress = current / self._metadata.total_frames

        return {
            "source_type": self._source_type.value,
            "paused": self._paused,
            "speed": self._speed,
            "progress": round(progress, 4),
        }
