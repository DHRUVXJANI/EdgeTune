"use client";

import { api } from "@/lib/api";
import type { SourceProgress } from "@/lib/types";

interface Props {
    progress: SourceProgress;
}

export default function PlaybackControls({ progress }: Props) {
    const rawPct = progress.progress * 100;
    const pct = rawPct >= 99.5 ? "100.0" : rawPct.toFixed(1);

    const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            await api.playbackControl("seek_percent", parseFloat(e.target.value) / 100);
        } catch { /* */ }
    };

    const handlePause = async () => {
        try { await api.playbackControl("pause"); } catch { /* */ }
    };

    const handleResume = async () => {
        try { await api.playbackControl("resume"); } catch { /* */ }
    };

    const handleStep = async (direction: "step_forward" | "step_backward") => {
        try { await api.playbackControl(direction); } catch { /* */ }
    };

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-4 py-3 flex items-center gap-3">
            {/* Playback buttons */}
            <div className="flex gap-1 min-w-[100px] justify-center items-center">
                {/* Step backward */}
                <button
                    onClick={() => handleStep("step_backward")}
                    disabled={!progress.paused}
                    title="Step backward"
                    className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Pause / Resume */}
                {progress.paused ? (
                    <button onClick={handleResume} className="text-xs text-zinc-100 hover:text-white transition-colors px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">
                        Resume
                    </button>
                ) : (
                    <button onClick={handlePause} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-800">
                        Pause
                    </button>
                )}

                {/* Step forward */}
                <button
                    onClick={() => handleStep("step_forward")}
                    disabled={!progress.paused}
                    title="Step forward"
                    className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* Custom Progress Bar */}
            <div className="flex-1 relative h-6 flex items-center group cursor-pointer">
                <div className="w-full h-1 relative">
                    <div className="absolute inset-0 bg-zinc-800 rounded-full" />
                    <div
                        className="absolute left-0 top-0 bottom-0 bg-white rounded-full pointer-events-none"
                        style={{ width: `${pct}%` }}
                    />
                    <div
                        className="absolute top-1/2 h-3 w-3 bg-white rounded-full shadow-sm pointer-events-none transition-transform group-hover:scale-125"
                        style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
                    />
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={progress.progress * 100}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
            </div>
            <span className="text-[11px] text-zinc-500 tabular-nums w-16 text-right">
                {pct}%
            </span>
        </div>
    );
}
