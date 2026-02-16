"use client";

import { useMemo } from "react";
import type { DetectionSummary } from "@/lib/types";

interface Props {
    summary: DetectionSummary | null;
    hiddenClasses: Set<string>;
    onToggle: (className: string) => void;
}

export default function DetectionFilter({ summary, hiddenClasses, onToggle }: Props) {
    const classes = useMemo(() => {
        if (!summary) return [];
        return Object.entries(summary.counts)
            .sort((a, b) => b[1] - a[1])
            .map(([name]) => name);
    }, [summary]);

    if (classes.length === 0) return null;

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
            <h4 className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Filter Classes</h4>
            <div className="flex flex-wrap gap-1.5">
                {classes.map((cls) => {
                    const hidden = hiddenClasses.has(cls);
                    return (
                        <button
                            key={cls}
                            onClick={() => onToggle(cls)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${hidden
                                ? "bg-zinc-800 text-zinc-600 line-through opacity-50"
                                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                }`}
                        >
                            {cls}
                        </button>
                    );
                })}
                {hiddenClasses.size > 0 && (
                    <button
                        onClick={() => hiddenClasses.forEach(c => onToggle(c))}
                        className="px-2 py-0.5 rounded text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                    >
                        Show all
                    </button>
                )}
            </div>
        </div>
    );
}
