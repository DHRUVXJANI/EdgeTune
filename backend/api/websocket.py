"""
WebSocket Handler — real-time data broadcast for the dashboard.

Manages client connections, broadcasts telemetry snapshots, autopilot
decisions, LLM explanations, video frames, and source progress
events via a single ``/ws`` endpoint.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import Any, Dict, List, Optional, Set

import cv2
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket clients with heartbeat tracking."""

    def __init__(self) -> None:
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info("WebSocket client connected. Total: %d", len(self._connections))

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(ws)
        logger.info("WebSocket client disconnected. Total: %d", len(self._connections))

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Send a JSON message to all connected clients."""
        if not self._connections:
            return

        payload = json.dumps(message)
        dead: List[WebSocket] = []

        async with self._lock:
            for ws in self._connections:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)

            for ws in dead:
                self._connections.discard(ws)

    @property
    def client_count(self) -> int:
        return len(self._connections)


# ── Singleton manager ────────────────────────────────────────────

manager = ConnectionManager()


# ── WebSocket endpoint handler ───────────────────────────────────


async def websocket_endpoint(ws: WebSocket) -> None:
    """
    Main WebSocket handler at ``/ws``.

    Keeps the connection alive and listens for client messages
    (e.g., ping).  Broadcasting is done externally via ``manager``.
    """
    await manager.connect(ws)
    try:
        while True:
            # Keep-alive: wait for client messages (ping / commands)
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type", "")

                if msg_type == "ping":
                    await ws.send_text(json.dumps({
                        "type": "pong",
                        "timestamp": time.time(),
                    }))

            except json.JSONDecodeError:
                pass  # ignore non-JSON messages

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws)


# ── Broadcast helpers (called from the pipeline loop) ────────────


async def broadcast_telemetry(snapshot_dict: Dict) -> None:
    await manager.broadcast({
        "type": "telemetry",
        "data": snapshot_dict,
    })


async def broadcast_decision(decision_dict: Dict) -> None:
    await manager.broadcast({
        "type": "autopilot_decision",
        "data": decision_dict,
    })


async def broadcast_llm_explanation(text: str, decision_id: str = "") -> None:
    await manager.broadcast({
        "type": "llm_explanation",
        "data": {
            "text": text,
            "decision_id": decision_id,
            "timestamp": time.time(),
        },
    })


async def broadcast_advisor_suggestion(text: str, category: str = "tip") -> None:
    await manager.broadcast({
        "type": "advisor_suggestion",
        "data": {
            "text": text,
            "category": category,
            "timestamp": time.time(),
        },
    })


async def broadcast_detection_summary(counts: dict, total: int) -> None:
    await manager.broadcast({
        "type": "detection_summary",
        "data": {
            "counts": counts,
            "total": total,
            "timestamp": time.time(),
        },
    })


async def broadcast_video_frame(
    frame: np.ndarray,
    quality: int = 70,
) -> None:
    """Encode frame as JPEG and broadcast as base64."""
    if manager.client_count == 0:
        return  # skip encoding if nobody is listening

    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
    await manager.broadcast({
        "type": "video_frame",
        "data": {
            "frame": b64,
            "timestamp": time.time(),
        },
    })


async def broadcast_source_progress(
    progress: float,
    frame_number: int,
    total_frames: Optional[int],
    paused: bool = False,
) -> None:
    await manager.broadcast({
        "type": "source_progress",
        "data": {
            "progress": round(progress, 4),
            "frame": frame_number,
            "total": total_frames,
            "paused": paused,
        },
    })


async def broadcast_status(status: str, message: str, extra: dict = None) -> None:
    data = {"status": status, "message": message}
    if extra:
        data["extra"] = extra
    
    await manager.broadcast({
        "type": "status",
        "data": data,
    })
