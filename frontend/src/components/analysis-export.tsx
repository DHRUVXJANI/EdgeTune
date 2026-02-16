"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HardwareProfile, LlmExplanation, OptimizationDecision, TelemetrySnapshot } from "@/lib/types";

interface Props {
    decisions: OptimizationDecision[];
    explanations: LlmExplanation[];
    telemetryHistory: TelemetrySnapshot[];
}

export default function AnalysisExport({ decisions, explanations, telemetryHistory }: Props) {
    const [hw, setHw] = useState<HardwareProfile | null>(null);

    useEffect(() => {
        api.getHardware().then(setHw).catch(() => { });
    }, []);

    const downloadCsv = () => {
        if (!hw) return;

        const rows: string[] = [];

        // 1. Hardware Info
        rows.push("=== SYSTEM HARDWARE ===");
        rows.push(`GPU Name,${hw.gpu_name}`);
        rows.push(`GPU Available,${hw.gpu_available}`);
        rows.push(`VRAM Total (GB),${hw.vram_total_gb}`);
        rows.push(`Tier,${hw.tier}`);
        rows.push(`Recommended Device,${hw.recommended_device}`);
        rows.push(`CPU Cores,${hw.cpu_cores}`);
        rows.push(`RAM Total (GB),${hw.ram_total_gb}`);
        rows.push("");

        // 2. Analysis / Decisions
        rows.push("=== AUTOPILOT DECISIONS & ANALYSIS ===");
        rows.push("Timestamp,Action,Reason,New State,LLM Explanation");

        // Merge decisions with explanations
        decisions.forEach(d => {
            const expl = explanations.find(e => Math.abs(e.timestamp - d.timestamp) < 2.0); // fuzz match
            const date = new Date(d.timestamp * 1000).toISOString();
            const text = expl ? `"${expl.text.replace(/"/g, '""')}"` : "";
            rows.push(`${date},${d.action},"${d.reason}",${d.new_state},${text}`);
        });
        rows.push("");

        // 3. Performance History (Comparison)
        rows.push("=== PERFORMANCE HISTORY ===");
        rows.push("Timestamp,FPS,GPU Util %,VRAM Used (GB),Latency (ms)");
        telemetryHistory.forEach(t => {
            const date = new Date(t.timestamp * 1000).toISOString();
            rows.push(`${date},${t.fps.toFixed(1)},${t.gpu_util.toFixed(1)},${t.vram_used.toFixed(2)},${t.latency_ms.toFixed(0)}`);
        });
        rows.push("");

        // 4. Session Summary
        rows.push("=== SESSION SUMMARY ===");
        if (telemetryHistory.length > 0) {
            const avgFps = telemetryHistory.reduce((a, b) => a + b.fps, 0) / telemetryHistory.length;
            const avgGpu = telemetryHistory.reduce((a, b) => a + b.gpu_util, 0) / telemetryHistory.length;
            const avgVram = telemetryHistory.reduce((a, b) => a + b.vram_used, 0) / telemetryHistory.length;
            const avgLatency = telemetryHistory.reduce((a, b) => a + b.latency_ms, 0) / telemetryHistory.length;

            rows.push(`Average FPS,${avgFps.toFixed(1)}`);
            rows.push(`Average GPU Util (%),${avgGpu.toFixed(1)}`);
            rows.push(`Average VRAM Used (GB),${avgVram.toFixed(2)}`);
            rows.push(`Average Latency (ms),${avgLatency.toFixed(1)}`);
            rows.push(`Total Duration (s),${(telemetryHistory[telemetryHistory.length - 1].timestamp - telemetryHistory[0].timestamp).toFixed(1)}`);
        }

        // Create blob and download
        const blob = new Blob([rows.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `edgetune_report_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <button
            onClick={downloadCsv}
            disabled={!hw || telemetryHistory.length === 0}
            className="w-full py-2 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 text-xs font-medium
                       hover:bg-zinc-700 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
        >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Analysis Report
        </button>
    );
}
