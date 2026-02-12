# EdgeTune: Local-First AI Video Analytics runtime

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.0%2B-blue)
![Ollama](https://img.shields.io/badge/ollama-supported-orange)

EdgeTune is a high-performance, privacy-focused video analytics system designed to run entirely on local edge hardware. It combines real-time object detection (YOLOv8) with LLM-powered insights (via local Ollama models) to provide actionable intelligence without sending video data to the cloud.

---

## 🚀 Key Features

- **Local-First Architecture:** No cloud dependencies. Video processing and LLM inference happen on your machine.
- **Adaptive Performance:** Automatically scales inference precision (FP16/FP32), resolution, and frame skipping based on hardware load (GPU/CPU stats).
- **Dual-Brain Intelligence:**
  - **Fast Brain:** YOLOv8 for real-time object detection (60+ FPS on RTX 3050).
  - **Slow Brain:** Local LLM (Llama 3, Phi-3, Mistral) for semantic understanding and event explanation.
- **Hardware-Aware:** Auto-detects NVIDIA GPUs and optimizes pipeline parameters dynamically.
- **Privacy-Centric:** Your video feeds never leave your local network.

---

## 🛠️ Architecture

The system consists of a Python FastAPI backend and a Next.js frontend, communicating via WebSockets for low-latency telemetry and video streaming.

```mermaid
graph TD
    subgraph "Backend (Python)"
        A[Video Source] --> B[Inference Engine (YOLO)]
        B --> C[Telemetry Monitor]
        C --> D[Autopilot Controller]
        D --> E[LLM Analyst (Ollama)]
        B --> F[WebSocket Broadcaster]
    end
    subgraph "Frontend (Next.js)"
        F --> G[Real-time Dashboard]
        G --> H[Performance Charts]
        G --> I[AI Insights Feed]
    end
```

---

## 📦 Installation

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **NVIDIA GPU** (Recommended for best performance)
- **Ollama** (Optional, for AI Analysis features)

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # Linux/Mac:
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   *(Note: This installs PyTorch with CUDA support automatically via `ultralytics`)*

4. (Optional) Run Ollama for AI features:
   - Install from [ollama.com](https://ollama.com)
   - Pull a model: `ollama pull phi3:mini` (or `llama3`, `mistral`)

5. Start the server:
   ```bash
   python main.py
   ```
   The API will be available at `http://localhost:8000`.

### 2. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   Access the dashboard at `http://localhost:3000`.

---

## 🖥️ Usage

1. Open `http://localhost:3000` in your browser.
2. Select a **Video Source** (Webcam or upload a file).
3. Click **Start Inference**.
4. Monitor the Real-time Dashboard:
   - **Performance:** Watch FPS, GPU, and VRAM charts.
   - **Autopilot:** Observe the system adjusting parameters (e.g., "Switching to FP16 to save VRAM").
   - **AI Insights:** If enabled, read LLM-generated explanations of scene events.
5. **Export Analysis:** When finished, download a CSV report containing hardware stats, decision logs, and performance metrics.

---

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
