<p align="center">
  <img src="https://img.shields.io/badge/EdgeTune-Local--First_AI-8b5cf6?style=for-the-badge&labelColor=1e1e2e" alt="EdgeTune" />
</p>

<h1 align="center">EdgeTune</h1>

<p align="center">
  <strong>A self-tuning, local-first AI video analytics runtime that adapts to your hardware in real time.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10%2B-3776ab?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/TypeScript-5.0%2B-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/YOLOv8-FF6F00?style=flat-square&logo=yolo&logoColor=white" alt="YOLOv8" />
  <img src="https://img.shields.io/badge/Ollama-supported-f97316?style=flat-square" alt="Ollama" />
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License" />
</p>

---

## What is EdgeTune?

EdgeTune is a **privacy-focused video analytics system** that runs entirely on your local machine — no cloud, no API keys required. It pairs **YOLOv8 object detection** with a **finite-state autopilot** that continuously monitors your GPU/CPU and dynamically adjusts inference parameters (precision, resolution, frame skipping, model variant) to squeeze the best possible performance from your hardware.

An optional **LLM analyst** (via local Ollama or Google Gemini) explains every autopilot decision in plain language, so you always understand *why* the system made a specific optimization.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| **🔒 Fully Local** | Video never leaves your machine. All inference and analysis run on local hardware. |
| **⚙️ Self-Tuning Autopilot** | A 4-state FSM (Stable → Soft → Balanced → Aggressive) monitors GPU utilisation, FPS drops, and VRAM pressure, then auto-tunes inference parameters with hysteresis and cooldown to prevent oscillation. |
| **🧠 Dual-Brain Architecture** | **Fast Brain:** YOLOv8 for real-time detection. **Slow Brain:** Local LLM for semantic explanations of system decisions. |
| **📊 Real-Time Dashboard** | Live GPU, VRAM, FPS, and latency charts streamed over WebSockets at low latency. |
| **🎛️ Hot-Reconfigurable** | Switch models (YOLOv8n/s/m), change autopilot mode (Speed / Balanced / Accuracy), or upload custom `.pt` models — all without restarting. |
| **🎥 Flexible Input** | Webcam feed or uploaded video files with full playback controls (pause, seek, speed). |
| **📥 Export & Reporting** | Download a CSV report of hardware telemetry, autopilot decisions, and LLM explanations. |
| **🖥️ Hardware-Aware** | Auto-detects NVIDIA GPUs via `pynvml`, reads VRAM and compute capability, and classifies into performance tiers (Low / Mid / High / CPU-only). Falls back gracefully to CPU. |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Frontend  (Next.js 16 · React 19 · TypeScript · Tailwind CSS)         │
│                                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐ │
│  │Video Feed│ │GPU Chart │ │FPS Graph │ │VRAM Chart │ │Autopilot Log │ │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘ └──────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────────┐   │
│  │Source Selector│ │Model Selector│ │LLM Feed    │ │Analysis Export │   │
│  └──────────────┘ └──────────────┘ └────────────┘ └────────────────┘   │
│                                                                          │
│                        useWebSocket (custom hook)                        │
│                              ▲  WebSocket                                │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────────┐
│  Backend  (Python · FastAPI · Uvicorn)                                   │
│                              │                                           │
│  ┌────────────────┐    ┌─────┴─────────────┐    ┌───────────────────┐   │
│  │ REST API       │    │ WebSocket Handler  │    │ Pipeline          │   │
│  │ /api/health    │    │ /ws                │    │ Orchestrator      │   │
│  │ /api/hardware  │    │ · telemetry        │    │                   │   │
│  │ /api/inference │    │ · decisions        │    │  VideoSource      │   │
│  │ /api/source    │    │ · llm_explanation  │    │       ↓           │   │
│  │ /api/models    │    │ · video_frame      │    │  InferenceEngine  │   │
│  └────────────────┘    │ · source_progress  │    │       ↓           │   │
│                        └────────────────────┘    │  TelemetryMonitor │   │
│                                                  │       ↓           │   │
│  ┌─────────────────────┐                         │  Autopilot FSM    │   │
│  │ Hardware Profiler   │                         │       ↓           │   │
│  │ GPU/CPU detection   │                         │  LLM Analyst      │   │
│  │ VRAM / Tier / FP16  │                         │  (Ollama/Gemini)  │   │
│  └─────────────────────┘                         └───────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **VideoSource** captures frames from a webcam or uploaded file.
2. **InferenceEngine** runs YOLOv8 detection with the current parameter set.
3. **TelemetryMonitor** samples GPU utilisation, VRAM, FPS, and latency at 500 ms intervals.
4. **AutopilotController** evaluates the telemetry snapshot against mode-specific thresholds and transitions the FSM, applying parameter changes (precision, resolution, frame skip, model swap).
5. **LLMAnalyst** (optional) explains each state transition in 1–3 sentences via Ollama or Gemini.
6. **WebSocket Handler** broadcasts annotated video frames, telemetry, decisions, and explanations to the dashboard.

---

## 📂 Project Structure

```
EdgeTune/
├── backend/
│   ├── main.py                     # FastAPI entrypoint & pipeline orchestrator
│   ├── requirements.txt
│   ├── config/
│   │   └── settings.yaml           # All runtime configuration
│   ├── core/
│   │   ├── inference_engine.py     # YOLO wrapper with hot-reconfiguration
│   │   ├── autopilot_controller.py # 4-state FSM optimisation engine
│   │   ├── telemetry_monitor.py    # GPU/CPU/FPS sampling
│   │   ├── hardware_profiler.py    # GPU detection & tier classification
│   │   └── video_source.py         # Camera & file input with playback
│   ├── llm/
│   │   ├── analyst.py              # LLM decision explainer (Ollama/Gemini)
│   │   └── discovery.py            # Auto-detect available Ollama models
│   └── api/
│       ├── routes.py               # REST endpoints
│       └── websocket.py            # WebSocket manager & broadcast helpers
│
├── frontend/
│   ├── package.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   └── page.tsx            # Main dashboard page
│       ├── components/
│       │   ├── video-feed.tsx      # Live annotated video stream
│       │   ├── gpu-chart.tsx       # GPU utilisation chart
│       │   ├── vram-chart.tsx      # VRAM usage chart
│       │   ├── fps-graph.tsx       # FPS over time graph
│       │   ├── autopilot-timeline.tsx  # Autopilot decision log
│       │   ├── llm-feed.tsx        # LLM explanation feed
│       │   ├── source-selector.tsx # Webcam / file input picker
│       │   ├── model-selector.tsx  # YOLO model switcher + upload
│       │   ├── mode-selector.tsx   # Speed / Balanced / Accuracy toggle
│       │   ├── playback-controls.tsx   # Video seek, pause, speed
│       │   ├── hardware-info.tsx   # GPU/CPU hardware card
│       │   ├── analysis-export.tsx # CSV download
│       │   └── connection-status.tsx   # WebSocket status indicator
│       ├── hooks/
│       │   └── useWebSocket.ts     # WebSocket client with auto-reconnect
│       └── lib/
│           ├── api.ts              # REST API client
│           └── types.ts            # Shared TypeScript interfaces
│
├── .gitignore
└── README.md
```

---

## � Getting Started

### Prerequisites

| Requirement | Notes |
|---|---|
| **Python 3.10+** | Backend runtime |
| **Node.js 18+** | Frontend build |
| **NVIDIA GPU** | Recommended; falls back to CPU automatically |
| **Ollama** | Optional — only needed for local LLM explanations |

### 1 · Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# Install dependencies (includes PyTorch with CUDA via Ultralytics)
pip install -r requirements.txt

# Start the API server
python main.py
```

The API will be available at **`http://localhost:8000`**. API docs at `/docs`.

### 2 · Frontend

```bash
cd frontend

npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser.

### 3 · LLM (Optional)

If you want AI-powered explanations of autopilot decisions:

```bash
# Install Ollama from https://ollama.com
ollama pull phi3:mini     # lightweight, fast
# or: ollama pull llama3 / mistral
```

EdgeTune auto-discovers available Ollama models at startup. You can also configure Gemini in `settings.yaml` by setting a `GEMINI_API_KEY`.

---

## 🖥️ Usage

1. Open the dashboard at `http://localhost:3000`.
2. Pick a **video source** — webcam or upload a video file.
3. *(Optional)* Select a **YOLO model** or upload a custom `.pt` file.
4. Choose an **autopilot mode** — Speed, Balanced, or Accuracy.
5. Click **Start Inference**.
6. Watch the dashboard in real time:
   - **Video Feed** — annotated detections overlaid on the live stream.
   - **Performance Cards** — GPU %, FPS, VRAM, and latency at a glance.
   - **Charts** — GPU utilisation, VRAM, and FPS history graphs.
   - **Autopilot Timeline** — every FSM transition with reason and applied parameters.
   - **LLM Insights** — plain-language explanations of optimisation decisions.
7. When finished, **Export Analysis** as a CSV.

---

## 📸 Screenshots

### Dashboard with Real-Time Detection

The main dashboard displays live video streams with YOLOv8 object detection overlays, showing confidence scores for detected objects. The interface features real-time performance metrics and a three-panel layout: autopilot decisions on the left, advisor explanations in the center, and analysis data on the right.

![EdgeTune Dashboard - Live Detection Feed](./screenshots/Screenshot%202026-02-17%20105117.png)

### Performance Monitoring & Analytics

Real-time performance charts show GPU utilisation, VRAM usage, latency, and FPS tracking. The system displays historical trends with interactive graphs and provides detailed telemetry alongside autopilot state transitions and LLM-powered explanations of optimization decisions.

![EdgeTune Performance Metrics](./screenshots/Screenshot%202026-02-17%20105057.png)

### Accuracy Mode with Dense Detection

In Accuracy mode, EdgeTune provides maximum detection coverage with comprehensive object identification across the entire frame — detecting multiple object classes simultaneously while maintaining high precision on complex street scenes.

![EdgeTune Accuracy Mode - Comprehensive Detection](./screenshots/Screenshot%202026-02-17%20104658.png)

---

## ⚙️ Configuration

All settings live in **[`backend/config/settings.yaml`](backend/config/settings.yaml)**.

<details>
<summary><strong>Key configuration options</strong></summary>

| Section | Key | Default | Description |
|---|---|---|---|
| `source` | `type` | `camera` | `camera` or `file` |
| `source` | `processing_mode` | `paced` | `paced` (real-time) or `benchmark` (max speed) |
| `inference` | `model_variant` | `yolov8n` | `yolov8n`, `yolov8s`, or `yolov8m` |
| `inference` | `device` | `auto` | `auto`, `cuda:0`, or `cpu` |
| `inference` | `backend` | `pytorch` | `pytorch`, `onnx`, or `tensorrt` |
| `autopilot` | `mode` | `balanced` | `speed`, `balanced`, or `accuracy` |
| `autopilot` | `escalate_gpu_threshold` | `90` | GPU % to trigger escalation |
| `autopilot` | `cooldown_seconds` | `5.0` | Min seconds between state changes |
| `llm` | `provider` | `ollama` | `ollama` or `gemini` |
| `llm` | `enabled` | `true` | Toggle LLM explanations on/off |
| `server` | `port` | `8000` | Backend API port |

</details>

---

## � API Reference

### REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | System health check (GPU, inference, LLM status) |
| `GET` | `/api/hardware` | Detected hardware profile |
| `GET` | `/api/telemetry` | Latest telemetry snapshot |
| `GET` | `/api/telemetry/history?n=60` | Rolling telemetry history |
| `GET` | `/api/autopilot` | Current autopilot state and mode |
| `PUT` | `/api/autopilot/mode` | Change autopilot mode |
| `POST` | `/api/inference/start` | Start the inference pipeline |
| `POST` | `/api/inference/stop` | Stop the inference pipeline |
| `POST` | `/api/source/upload` | Upload a video file |
| `GET` | `/api/source/files` | List available source files |
| `GET` | `/api/source/info` | Current source metadata |
| `POST` | `/api/source/playback` | Playback control (pause, seek, speed) |
| `GET` | `/api/models` | List available YOLO models |
| `POST` | `/api/models/upload` | Upload a custom `.pt` model |
| `POST` | `/api/models/switch` | Hot-swap the active model |

### WebSocket (`/ws`)

The single WebSocket connection streams these message types:

| Type | Payload | Direction |
|---|---|---|
| `telemetry` | GPU %, FPS, VRAM, latency, CPU % | Server → Client |
| `autopilot_decision` | State transition, action, reason, params | Server → Client |
| `llm_explanation` | Plain-text explanation of a decision | Server → Client |
| `video_frame` | Base64-encoded JPEG frame | Server → Client |
| `source_progress` | File progress, frame number, paused state | Server → Client |
| `status` | Toast notifications (errors, info) | Server → Client |
| `ping` / `pong` | Keep-alive heartbeat | Both |

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.10+, FastAPI, Uvicorn, Ultralytics YOLOv8, PyTorch, OpenCV |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Communication** | WebSocket (real-time) + REST (control plane) |
| **GPU Monitoring** | pynvml, psutil |
| **LLM Integration** | Ollama (local) · Google Gemini (optional cloud) |
| **Configuration** | YAML (`settings.yaml`) |

---

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
