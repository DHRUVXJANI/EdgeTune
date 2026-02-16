"use client";
import type { AdvisorSuggestion } from "@/lib/types";

interface Props {
    suggestions: AdvisorSuggestion[];
}

const categoryStyle: Record<string, { dot: string; label: string }> = {
    tip: { dot: "bg-emerald-500", label: "Tip" },
    status: { dot: "bg-sky-500", label: "Status" },
    warning: { dot: "bg-amber-500", label: "Warning" },
    info: { dot: "bg-zinc-400", label: "Info" },
};

export default function AdvisorFeed({ suggestions }: Props) {
    if (suggestions.length === 0) {
        return (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 flex items-center justify-center min-h-[120px]">
                <p className="text-xs text-zinc-600">Monitoring system…</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 min-h-[120px]">
            <h3 className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide mb-3">Advisor</h3>
            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                {[...suggestions].reverse().map((s, i) => {
                    const time = new Date(s.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const style = categoryStyle[s.category] || categoryStyle.info;
                    return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-zinc-600 font-mono text-[11px] w-12 shrink-0 pt-0.5">{time}</span>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${style.dot}`} />
                            <span className="text-zinc-400 leading-relaxed">{s.text}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
