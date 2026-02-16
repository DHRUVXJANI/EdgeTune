"use client";

import type { DetectionSummary } from "@/lib/types";

interface Props {
    summary: DetectionSummary | null;
}

const classColors: Record<string, string> = {
    person: "bg-sky-500",
    car: "bg-amber-500",
    truck: "bg-orange-500",
    bus: "bg-rose-500",
    bicycle: "bg-emerald-500",
    motorcycle: "bg-purple-500",
    dog: "bg-pink-500",
    cat: "bg-violet-500",
    bird: "bg-cyan-500",
    horse: "bg-lime-500",
};

export default function DetectionSummaryBar({ summary }: Props) {
    if (!summary || summary.total === 0) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-[10px] text-zinc-600">No detections</span>
            </div>
        );
    }

    const entries = Object.entries(summary.counts).sort((a, b) => b[1] - a[1]);

    return (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800 overflow-x-auto custom-scrollbar">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wide shrink-0">Detected</span>
            {entries.map(([cls, count]) => {
                const dot = classColors[cls] || "bg-zinc-500";
                return (
                    <div key={cls} className="flex items-center gap-1 shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                        <span className="text-[11px] text-zinc-400">{cls}</span>
                        <span className="text-[11px] text-zinc-200 font-semibold tabular-nums">{count}</span>
                    </div>
                );
            })}
            <span className="text-[10px] text-zinc-600 ml-auto shrink-0 tabular-nums">
                {summary.total} total
            </span>
        </div>
    );
}
