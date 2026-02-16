"use client";

import { useCallback, useState } from "react";

export interface Session {
    id: number;
    model: string;
    mode: string;
    avgFps: number;
    avgGpu: number;
    duration: string;
    date: string;
}

interface Props {
    sessions: Session[];
    onClear: () => void;
}

export default function SessionHistory({ sessions, onClear }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [comparing, setComparing] = useState<[number, number] | null>(null);

    const toggleCompare = useCallback((id: number) => {
        setComparing(prev => {
            if (!prev) return [id, -1];
            if (prev[0] === id) return null;
            if (prev[1] === id) return [prev[0], -1];
            if (prev[1] === -1) return [prev[0], id];
            return [id, -1];
        });
    }, []);

    const compareA = comparing ? sessions.find(s => s.id === comparing[0]) : null;
    const compareB = comparing && comparing[1] !== -1 ? sessions.find(s => s.id === comparing[1]) : null;

    // Reset comparing if sessions are cleared
    if (sessions.length === 0 && comparing) {
        setComparing(null);
    }

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-xs font-medium text-zinc-500 uppercase tracking-wide flex items-center gap-1 hover:text-zinc-300 transition-colors"
                >
                    <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▸</span>
                    Sessions ({sessions.length})
                </button>
                <div className="flex gap-2">
                    {expanded && sessions.length >= 2 && (
                        <button
                            onClick={() => setComparing(comparing ? null : [sessions[0].id, sessions[1].id])}
                            className={`text-[10px] transition-colors ${comparing ? "text-indigo-400 hover:text-indigo-300" : "text-zinc-600 hover:text-zinc-400"}`}
                        >
                            {comparing ? "Exit Compare" : "Compare"}
                        </button>
                    )}
                    {expanded && sessions.length > 0 && (
                        <button onClick={onClear} className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors">
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {expanded && sessions.length === 0 && (
                <p className="text-[11px] text-zinc-600">No sessions yet — stop an inference run to save one.</p>
            )}

            {expanded && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                    {sessions.map((s) => {
                        const isSelected = comparing && (comparing[0] === s.id || comparing[1] === s.id);
                        return (
                            <div
                                key={s.id}
                                onClick={comparing ? () => toggleCompare(s.id) : undefined}
                                className={`flex items-center gap-2 text-[11px] rounded px-1 py-0.5 transition-colors ${comparing ? "cursor-pointer hover:bg-zinc-800" : ""
                                    } ${isSelected ? "bg-indigo-500/10 border border-indigo-500/20" : "border border-transparent"}`}
                            >
                                {comparing && (
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? "bg-indigo-400" : "bg-zinc-700"}`} />
                                )}
                                <span className="text-zinc-600 w-20 shrink-0 truncate">{s.date}</span>
                                <span className="text-zinc-400 font-mono truncate">{s.model}</span>
                                <span className="text-zinc-600 capitalize">{s.mode}</span>
                                <span className="text-amber-400 ml-auto tabular-nums">{s.avgFps} fps</span>
                                <span className="text-indigo-400 tabular-nums">{s.avgGpu}%</span>
                                <span className="text-zinc-600 tabular-nums">{s.duration}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Comparison table */}
            {compareA && compareB && (
                <div className="mt-3 border-t border-zinc-800 pt-3">
                    <table className="w-full text-[10px]">
                        <thead>
                            <tr className="text-zinc-600">
                                <th className="text-left font-medium pb-1">Metric</th>
                                <th className="text-right font-medium pb-1">{compareA.model}</th>
                                <th className="text-right font-medium pb-1">{compareB.model}</th>
                                <th className="text-right font-medium pb-1">Δ</th>
                            </tr>
                        </thead>
                        <tbody className="text-zinc-300">
                            {([
                                ["FPS", compareA.avgFps, compareB.avgFps, "fps"],
                                ["GPU", compareA.avgGpu, compareB.avgGpu, "%"],
                            ] as const).map(([label, a, b, unit]) => {
                                const diff = b - a;
                                const color = label === "FPS"
                                    ? (diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-zinc-500")
                                    : (diff < 0 ? "text-green-400" : diff > 0 ? "text-red-400" : "text-zinc-500");
                                return (
                                    <tr key={label} className="border-t border-zinc-800/50">
                                        <td className="py-1 text-zinc-500">{label}</td>
                                        <td className="py-1 text-right tabular-nums">{a} {unit}</td>
                                        <td className="py-1 text-right tabular-nums">{b} {unit}</td>
                                        <td className={`py-1 text-right tabular-nums ${color}`}>
                                            {diff > 0 ? "+" : ""}{diff.toFixed(1)} {unit}
                                        </td>
                                    </tr>
                                );
                            })}
                            <tr className="border-t border-zinc-800/50">
                                <td className="py-1 text-zinc-500">Duration</td>
                                <td className="py-1 text-right tabular-nums">{compareA.duration}</td>
                                <td className="py-1 text-right tabular-nums">{compareB.duration}</td>
                                <td className="py-1 text-right text-zinc-500">—</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
