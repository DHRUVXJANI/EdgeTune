"use client";

import { useMemo } from "react";

interface Props {
    label: string;
    value: string;
    color: string;         // tailwind text color class, e.g. "text-indigo-400"
    sparkColor: string;    // hex color for sparkline, e.g. "#6366f1"
    history: number[];     // last N values
    unit?: string;
}

function buildSparklinePath(data: number[], width: number, height: number): string {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const pad = 2;
    const h = height - pad * 2;

    return data
        .map((v, i) => {
            const x = i * stepX;
            const y = pad + h - ((v - min) / range) * h;
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
}

export default function StatCard({ label, value, color, sparkColor, history, unit }: Props) {
    const path = useMemo(() => buildSparklinePath(history.slice(-30), 80, 28), [history]);

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3 flex flex-col items-center relative overflow-hidden">
            {/* Sparkline background */}
            {path && (
                <svg
                    className="absolute bottom-0 left-0 w-full opacity-30"
                    viewBox="0 0 80 28"
                    preserveAspectRatio="none"
                    style={{ height: "60%" }}
                >
                    <path d={path} fill="none" stroke={sparkColor} strokeWidth="1.5" />
                </svg>
            )}
            <div className={`text-base font-semibold tabular-nums relative z-10 ${color}`}>
                {value}{unit}
            </div>
            <div className="text-[10px] text-zinc-600 mt-0.5 relative z-10">{label}</div>
        </div>
    );
}
