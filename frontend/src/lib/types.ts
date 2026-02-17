// ──────────────────────────────────────────────────────────────
// Shared TypeScript interfaces for the Edge-AI Performance Autopilot
// ──────────────────────────────────────────────────────────────

export interface TelemetrySnapshot {
    timestamp: number;
    gpu_util: number;
    vram_used: number;
    vram_total: number;
    cpu_util: number;
    ram_used: number;
    fps: number;
    latency_ms: number;
}

export interface HardwareProfile {
    gpu_name: string;
    gpu_available: boolean;
    vram_total_gb: number;
    compute_capability: number[];
    fp16_supported: boolean;
    tensor_cores: boolean;
    tier: "low" | "mid" | "high" | "cpu_only";
    cpu_cores: number;
    ram_total_gb: number;
    recommended_device: string;
}

export interface OptimizationDecision {
    timestamp: number;
    previous_state: string;
    new_state: string;
    action: string;
    reason: string;
    params_applied: Record<string, unknown>;
    telemetry_summary: {
        gpu_util: number;
        fps: number;
        vram_used: number;
    };
}

export interface LlmExplanation {
    text: string;
    decision_id: string;
    timestamp: number;
}

export interface AdvisorSuggestion {
    text: string;
    category: "tip" | "status" | "warning" | "info";
    timestamp: number;
}

export interface DetectionSummary {
    counts: Record<string, number>;
    total: number;
    timestamp: number;
}

export interface SourceProgress {
    progress: number;
    frame: number;
    total: number | null;
    paused: boolean;
}

export interface SourceMetadata {
    source_type: "camera" | "file";
    total_frames: number | null;
    native_fps: number | null;
    duration_sec: number | null;
    resolution: [number, number];
    progress: number;
}

export interface AutopilotState {
    state: string;
    mode: string;
    baseline_fps: number | null;
    is_benchmark: boolean;
    tier: string;
    current_params: Record<string, unknown>;
}

export type AutopilotMode = "speed" | "balanced" | "accuracy";

// WebSocket message types
export interface WsMessage<T = unknown> {
    type: "telemetry" | "autopilot_decision" | "llm_explanation" | "advisor_suggestion" | "detection_summary" | "video_frame" | "source_progress" | "pong" | "status";
    data: T;
}

export interface VideoFrameData {
    frame: string; // base64-encoded JPEG
    timestamp: number;
}
