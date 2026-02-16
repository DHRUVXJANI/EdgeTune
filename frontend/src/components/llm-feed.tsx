"use client";
import type { LlmExplanation } from "@/lib/types";

interface Props {
    explanations: LlmExplanation[];
}

export default function LlmFeed({ explanations }: Props) {
    if (explanations.length === 0) {
        return (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 flex items-center justify-center min-h-[120px]">
                <p className="text-xs text-zinc-600">No analysis yet</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 min-h-[120px]">
            <h3 className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide mb-3">Analysis</h3>
            <div className="space-y-3 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                {[...explanations].reverse().map((e, i) => {
                    const time = new Date(e.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    return (
                        <div key={i} className="text-xs">
                            <span className="text-zinc-600 font-mono text-[11px] mr-2">{time}</span>
                            <span className="text-zinc-400 leading-relaxed">{e.text}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
