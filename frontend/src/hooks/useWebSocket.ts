"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
    AdvisorSuggestion,
    DetectionSummary,
    LlmExplanation,
    OptimizationDecision,
    SourceProgress,
    TelemetrySnapshot,
    VideoFrameData,
    WsMessage,
} from "@/lib/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const MAX_HISTORY = 120;
const MAX_DECISIONS = 50;
const MAX_EXPLANATIONS = 50;
const MAX_SUGGESTIONS = 20;

type FrameCallback = (frame: string) => void;

export interface WebSocketState {
    connected: boolean;
    telemetry: TelemetrySnapshot | null;
    telemetryHistory: TelemetrySnapshot[];
    decisions: OptimizationDecision[];
    explanations: LlmExplanation[];
    suggestions: AdvisorSuggestion[];
    detectionSummary: DetectionSummary | null;
    sourceProgress: SourceProgress | null;
    notification: { type: string; message: string; extra?: any } | null;
    subscribeToFrames: (cb: FrameCallback) => () => void;
    resetState: () => void;
}

export function useWebSocket(): WebSocketState {
    const [connected, setConnected] = useState(false);
    const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
    const [telemetryHistory, setTelemetryHistory] = useState<TelemetrySnapshot[]>([]);
    const [decisions, setDecisions] = useState<OptimizationDecision[]>([]);
    const [explanations, setExplanations] = useState<LlmExplanation[]>([]);
    const [suggestions, setSuggestions] = useState<AdvisorSuggestion[]>([]);
    const [detectionSummary, setDetectionSummary] = useState<DetectionSummary | null>(null);
    const [sourceProgress, setSourceProgress] = useState<SourceProgress | null>(null);
    const [notification, setNotification] = useState<{ type: string; message: string; extra?: any } | null>(null);

    // Frame subscribers (to avoid React state re-renders for 30fps video)
    const wsRef = useRef<WebSocket | null>(null);
    const retriesRef = useRef(0);
    const mountedRef = useRef(true);

    // Frame subscriber pattern — bypasses React state for smooth video
    const frameListenersRef = useRef<Set<FrameCallback>>(new Set());

    const subscribeToFrames = useCallback((cb: FrameCallback) => {
        frameListenersRef.current.add(cb);
        return () => {
            frameListenersRef.current.delete(cb);
        };
    }, []);

    const connect = useCallback(() => {
        if (!mountedRef.current) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            retriesRef.current = 0;
        };

        ws.onmessage = (event) => {
            try {
                const msg: WsMessage = JSON.parse(event.data);

                switch (msg.type) {
                    case "telemetry": {
                        const snap = msg.data as TelemetrySnapshot;
                        setTelemetry(snap);
                        setTelemetryHistory((prev) => {
                            const next = [...prev, snap];
                            return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
                        });
                        break;
                    }
                    case "autopilot_decision": {
                        const d = msg.data as OptimizationDecision;
                        setDecisions((prev) => {
                            const next = [...prev, d];
                            return next.length > MAX_DECISIONS ? next.slice(-MAX_DECISIONS) : next;
                        });
                        break;
                    }
                    case "llm_explanation": {
                        const e = msg.data as LlmExplanation;
                        setExplanations((prev) => {
                            const next = [...prev, e];
                            return next.length > MAX_EXPLANATIONS ? next.slice(-MAX_EXPLANATIONS) : next;
                        });
                        break;
                    }
                    case "video_frame": {
                        const vf = msg.data as VideoFrameData;
                        // Dispatch directly to subscribers — no React state
                        frameListenersRef.current.forEach((cb) => cb(vf.frame));
                        break;
                    }
                    case "advisor_suggestion": {
                        const s = msg.data as AdvisorSuggestion;
                        setSuggestions((prev) => {
                            const next = [...prev, s];
                            return next.length > MAX_SUGGESTIONS ? next.slice(-MAX_SUGGESTIONS) : next;
                        });
                        break;
                    }
                    case "detection_summary": {
                        setDetectionSummary(msg.data as DetectionSummary);
                        break;
                    }
                    case "source_progress": {
                        setSourceProgress(msg.data as SourceProgress);
                        break;
                    }
                    case "status": {
                        const statusData = msg.data as { status: string; message: string; extra?: any };
                        setNotification({
                            type: statusData.status,
                            message: statusData.message,
                            extra: statusData.extra,
                        });
                        // Auto-clear after 5 seconds
                        setTimeout(() => setNotification(null), 5000);
                        break;
                    }
                }
            } catch {
                // ignore parse errors
            }
        };

        ws.onclose = () => {
            setConnected(false);
            if (!mountedRef.current) return;
            const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
            retriesRef.current++;
            setTimeout(connect, delay);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        connect();
        return () => {
            mountedRef.current = false;
            wsRef.current?.close();
        };
    }, [connect]);

    const resetState = useCallback(() => {
        setTelemetry(null);
        setTelemetryHistory([]);
        setDecisions([]);
        setExplanations([]);
        setSuggestions([]);
        setDetectionSummary(null);
        setSourceProgress(null);
        setNotification(null);
    }, []);

    return {
        connected,
        telemetry,
        telemetryHistory,
        decisions,
        explanations,
        suggestions,
        detectionSummary,
        sourceProgress,
        notification,
        subscribeToFrames,
        resetState,
    };
}
