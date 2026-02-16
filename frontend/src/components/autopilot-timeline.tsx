"use client";
import type { OptimizationDecision } from "@/lib/types";

interface Props {
    decisions: OptimizationDecision[];
}

const stateColor: Record<string, string> = {
    stable: "bg-green-500",
    soft_tuning: "bg-sky-500",
    balanced_tuning: "bg-amber-500",
    aggressive_tuning: "bg-red-500",
};

export default function AutopilotTimeline({ decisions }: Props) {
    if (decisions.length === 0) {
        return (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 flex items-center justify-center min-h-[120px]">
                <p className="text-xs text-zinc-600">No decisions yet</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 min-h-[120px]">
            <h3 className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide mb-3">Autopilot</h3>
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                {[...decisions].reverse().map((d, i) => {
                    const time = new Date(d.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                    const color = stateColor[d.new_state] || "bg-zinc-500";
                    return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-600 font-mono text-[11px] w-14 shrink-0">{time}</span>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
                            <span className="text-zinc-400 truncate">{d.action.replaceAll("_", " ")}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
