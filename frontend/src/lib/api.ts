// ──────────────────────────────────────────────────────────────
// REST API client for the Edge-AI Performance Autopilot backend
// ──────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { "Content-Type": "application/json", ...options?.headers },
        ...options,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
    }
    return res.json();
}

// ── Health ───────────────────────────────────────────────────────

export const api = {
    health: () => request<{ status: string; gpu_available: boolean; inference_running: boolean }>("/api/health"),

    // ── Hardware ──────────────────────────────────────────────────
    getHardware: () =>
        request<import("./types").HardwareProfile>("/api/hardware"),

    // ── Telemetry ─────────────────────────────────────────────────
    getTelemetry: () =>
        request<import("./types").TelemetrySnapshot>("/api/telemetry"),

    getTelemetryHistory: (n = 60) =>
        request<import("./types").TelemetrySnapshot[]>(`/api/telemetry/history?n=${n}`),

    // ── Autopilot ─────────────────────────────────────────────────
    getAutopilotState: () =>
        request<import("./types").AutopilotState>("/api/autopilot/state"),

    setAutopilotMode: (mode: string) =>
        request<{ mode: string }>("/api/autopilot/mode", {
            method: "POST",
            body: JSON.stringify({ mode }),
        }),

    // ── Inference Lifecycle ───────────────────────────────────────
    startInference: (source = "camera", processing_mode = "paced") =>
        request<{ status: string }>("/api/inference/start", {
            method: "POST",
            body: JSON.stringify({ source, processing_mode }),
        }),

    stopInference: () =>
        request<{ status: string }>("/api/inference/stop", { method: "POST" }),

    // ── Source Management ─────────────────────────────────────────
    uploadVideo: async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${BASE_URL}/api/source/upload`, {
            method: "POST",
            body: formData,
        });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        return res.json() as Promise<{ filename: string; size_mb: number }>;
    },

    listSourceFiles: () =>
        request<{ files: string[] }>("/api/source/files"),

    getSourceInfo: () =>
        request<import("./types").SourceMetadata>("/api/source/info"),

    playbackControl: (action: string, value = 0) =>
        request<{ action: string; value: number }>("/api/source/playback", {
            method: "POST",
            body: JSON.stringify({ action, value }),
        }),

    // ── Inference Configuration ──────────────────────────────────
    configureInference: (params: { confidence_threshold?: number; iou_threshold?: number }) =>
        request<{ status: string; confidence_threshold: number }>("/api/inference/configure", {
            method: "POST",
            body: JSON.stringify(params),
        }),
};
