"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { api } from "@/lib/api";

import ModeSelector from "@/components/mode-selector";
import SourceSelector from "@/components/source-selector";
import ModelSelector from "@/components/model-selector";
import PlaybackControls from "@/components/playback-controls";
import VideoFeed from "@/components/video-feed";
import GpuChart from "@/components/gpu-chart";
import VramChart from "@/components/vram-chart";
import FpsGraph from "@/components/fps-graph";
import AutopilotTimeline from "@/components/autopilot-timeline";
import LlmFeed from "@/components/llm-feed";
import ConnectionStatus from "@/components/connection-status";
import AnalysisExport from "@/components/analysis-export";
import HardwareInfo from "@/components/hardware-info";
import AdvisorFeed from "@/components/advisor-feed";
import DetectionSummaryBar from "@/components/detection-summary";
import ConfidenceSlider from "@/components/confidence-slider";
import StatCard from "@/components/stat-card";
import SessionHistory, { Session } from "@/components/session-history";
import KeyboardShortcuts from "@/components/keyboard-shortcuts";
import DetectionFilter from "@/components/detection-filter";
import DetectionTimeline from "@/components/detection-timeline";
import ThemeToggle from "@/components/theme-toggle";

export default function DashboardPage() {
  const ws = useWebSocket();
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentModel, setCurrentModel] = useState("yolov8n");
  const [currentMode, setCurrentMode] = useState("balanced");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [hiddenClasses, setHiddenClasses] = useState<Set<string>>(new Set());
  const [modelLoading, setModelLoading] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("edgetune_sessions");
      if (saved) setSessions(JSON.parse(saved));
    } catch { }
    // Sync running state with backend on mount/reload
    api.health().then((h) => {
      if (h.inference_running) {
        setRunning(true);
        if (!startTime) setStartTime(Date.now());
      }
    }).catch(() => { });
  }, []);

  const saveSessions = (newSessions: Session[]) => {
    setSessions(newSessions);
    localStorage.setItem("edgetune_sessions", JSON.stringify(newSessions));
  };

  // Autopilot decision toasts
  const [decisionToast, setDecisionToast] = useState<string | null>(null);
  const lastDecisionCount = useRef(0);
  useEffect(() => {
    if (ws.decisions.length > lastDecisionCount.current) {
      const latest = ws.decisions[ws.decisions.length - 1];
      setDecisionToast(`⚡ ${latest.action}`);
      const timer = setTimeout(() => setDecisionToast(null), 4000);
      lastDecisionCount.current = ws.decisions.length;
      return () => clearTimeout(timer);
    }
  }, [ws.decisions]);

  // Model loading status from WS
  useEffect(() => {
    if (ws.notification) {
      if (ws.notification.type === "loading") setModelLoading(true);
      if (ws.notification.type === "ready") setModelLoading(false);
      if (ws.notification.type === "completed") {
        setRunning(false);

        // Create new session
        const extra = ws.notification.extra || {};
        const dur = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
        const mins = Math.floor(dur / 60);
        const secs = dur % 60;

        const session: Session = {
          id: Date.now(),
          model: currentModel,
          mode: currentMode,
          // Use backend stats if available, else 0
          avgFps: extra.avg_fps ? Math.round(extra.avg_fps * 10) / 10 : 0,
          avgGpu: extra.avg_gpu_util ? Math.round(extra.avg_gpu_util) : 0,
          duration: `${mins}m ${secs}s`,
          date: new Date().toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        };

        const updated = [session, ...sessions].slice(0, 10);
        saveSessions(updated);
      }
      if (ws.notification.type === "error") {
        setRunning(false);
        // Toast is handled by the ws component or we can add one here if needed
      }
    }
  }, [ws.notification]);

  // Detection summary history for timeline chart
  const detectionHistory = useRef<{ total: number; timestamp: number }[]>([]);
  useEffect(() => {
    if (ws.detectionSummary) {
      detectionHistory.current = [
        ...detectionHistory.current.slice(-59),
        { total: ws.detectionSummary.total, timestamp: Date.now() },
      ];
    }
  }, [ws.detectionSummary]);

  // Session timer
  useEffect(() => {
    if (!running || !startTime) { setElapsed(""); return; }
    const interval = setInterval(() => {
      const sec = Math.floor((Date.now() - startTime) / 1000);
      const h = Math.floor(sec / 3600).toString().padStart(2, "0");
      const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
      const s = (sec % 60).toString().padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [running, startTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
      if (e.key === "f" || e.key === "F") setFullscreen((v) => !v);
      if (e.key === "[") setSidebarCollapsed((v) => !v);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [fullscreen]);

  const handleStart = useCallback(async (source: string, mode: string) => {
    ws.resetState();
    detectionHistory.current = [];
    setHiddenClasses(new Set());
    try {
      await api.startInference(source, mode);
      setRunning(true);
      setStartTime(Date.now());
    } catch (e) {
      console.error("Start failed:", e);
    }
  }, [ws]);

  const handleStop = useCallback(async () => {
    try {
      await api.stopInference();
      setRunning(false);
      ws.resetState();
      detectionHistory.current = [];
      setHiddenClasses(new Set());
    } catch (e) {
      console.error("Stop failed:", e);
    }
  }, [ws]);

  const handleToggleInference = useCallback(() => {
    if (running) handleStop();
  }, [running, handleStop]);

  const handleSetMode = useCallback(async (mode: string) => {
    try { await api.setAutopilotMode(mode); } catch { /* */ }
  }, []);

  const handleToggleClass = useCallback((cls: string) => {
    setHiddenClasses(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      return next;
    });
  }, []);

  // Averages for session history
  const avgFps = useMemo(() => {
    if (ws.telemetryHistory.length === 0) return 0;
    return ws.telemetryHistory.reduce((s, t) => s + t.fps, 0) / ws.telemetryHistory.length;
  }, [ws.telemetryHistory]);

  const avgGpu = useMemo(() => {
    if (ws.telemetryHistory.length === 0) return 0;
    return ws.telemetryHistory.reduce((s, t) => s + t.gpu_util, 0) / ws.telemetryHistory.length;
  }, [ws.telemetryHistory]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-5 h-12 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">EdgeTune</span>
          <ConnectionStatus connected={ws.connected} />
          {modelLoading && (
            <span className="text-[10px] text-amber-400 animate-pulse">Loading model…</span>
          )}
          {elapsed && (
            <span className="text-[11px] text-zinc-600 font-mono tabular-nums">{elapsed}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ModeSelector onModeChange={setCurrentMode} />
          {running ? (
            <button
              onClick={handleStop}
              className="px-3 py-1 rounded-md text-xs font-medium text-red-400
                         border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              Stop
            </button>
          ) : (
            <span className="text-[11px] text-zinc-600 px-2">Idle</span>
          )}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            title="Toggle sidebar"
            className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {sidebarCollapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              }
            </svg>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className={`flex-1 grid gap-3 p-3 min-h-0 transition-all duration-300 dashboard-grid ${sidebarCollapsed ? "grid-cols-1" : "grid-cols-[1fr_300px]"
        }`}>
        {/* Left — video + bottom panels */}
        <div className={`flex flex-col gap-3 min-h-0 ${fullscreen ? "hidden" : ""}`} style={fullscreen ? { display: "none" } : {}}>
          <VideoFeed
            subscribeToFrames={ws.subscribeToFrames}
            running={running}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen((v) => !v)}
          />
          {running && ws.detectionSummary && <DetectionSummaryBar summary={ws.detectionSummary} />}
          {ws.sourceProgress && <PlaybackControls progress={ws.sourceProgress} />}
          <div className="grid grid-cols-3 gap-3">
            <AutopilotTimeline decisions={ws.decisions} />
            <AdvisorFeed suggestions={ws.suggestions} />
            <LlmFeed explanations={ws.explanations} />
          </div>
        </div>

        {/* Fullscreen video overlay */}
        {fullscreen && (
          <VideoFeed
            subscribeToFrames={ws.subscribeToFrames}
            running={running}
            fullscreen={true}
            onToggleFullscreen={() => setFullscreen(false)}
          />
        )}

        {/* Right — controls + metrics */}
        {!sidebarCollapsed && !fullscreen && (
          <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar min-h-0">
            <SourceSelector onStart={handleStart} />
            <ModelSelector onModelChange={setCurrentModel} />
            <ConfidenceSlider />
            <DetectionFilter
              summary={ws.detectionSummary}
              hiddenClasses={hiddenClasses}
              onToggle={handleToggleClass}
            />
            <HardwareInfo />
            <SessionHistory
              sessions={sessions}
              onClear={() => saveSessions([])}
            />
            <AnalysisExport
              decisions={ws.decisions}
              explanations={ws.explanations}
              telemetryHistory={ws.telemetryHistory}
            />

            {/* Live stats with sparklines */}
            {ws.telemetry && (
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="GPU" value={ws.telemetry.gpu_util.toFixed(0)} unit="%" color="text-indigo-400" sparkColor="#6366f1" history={ws.telemetryHistory.map((t) => t.gpu_util)} />
                <StatCard label="FPS" value={ws.telemetry.fps.toFixed(1)} color="text-amber-400" sparkColor="#f59e0b" history={ws.telemetryHistory.map((t) => t.fps)} />
                <StatCard label="VRAM" value={ws.telemetry.vram_used.toFixed(1)} unit="G" color="text-green-400" sparkColor="#22c55e" history={ws.telemetryHistory.map((t) => t.vram_used)} />
                <StatCard label="Latency" value={ws.telemetry.latency_ms.toFixed(0)} unit="ms" color="text-rose-400" sparkColor="#f43f5e" history={ws.telemetryHistory.map((t) => t.latency_ms)} />
              </div>
            )}

            {/* Skeleton stats when no data */}
            {!ws.telemetry && (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-zinc-900 rounded-lg border border-zinc-800 p-3 text-center">
                    <div className="skeleton-shimmer h-5 w-12 mx-auto mb-1" />
                    <div className="skeleton-shimmer h-3 w-8 mx-auto" />
                  </div>
                ))}
              </div>
            )}

            <GpuChart history={ws.telemetryHistory} />
            <VramChart history={ws.telemetryHistory} />
            <FpsGraph history={ws.telemetryHistory} />
            <DetectionTimeline history={detectionHistory.current} />
          </div>
        )}
      </main>

      {/* Keyboard shortcuts handler */}
      <KeyboardShortcuts
        onToggleInference={handleToggleInference}
        onSetMode={handleSetMode}
        running={running}
      />

      {/* Status Toast (backend events) */}
      {ws.notification && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-xl text-sm font-medium z-50 animate-toast-in ${ws.notification.type === "error" ? "bg-rose-600 text-white"
          : ws.notification.type === "warning" ? "bg-amber-600 text-white"
            : "bg-emerald-600 text-white"
          }`}>
          {ws.notification.message}
        </div>
      )}

      {/* Autopilot Decision Toast */}
      {decisionToast && (
        <div className="fixed bottom-16 right-6 px-3 py-2 rounded-lg bg-indigo-600/90 text-white text-xs font-medium z-50 animate-toast-in shadow-lg">
          {decisionToast}
        </div>
      )}
    </div>
  );
}
