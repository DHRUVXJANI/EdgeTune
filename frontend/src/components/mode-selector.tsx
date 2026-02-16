"use client";

import { useState } from "react";
import { api } from "@/lib/api";

const modes = ["speed", "balanced", "accuracy"] as const;

const descriptions: Record<string, string> = {
    speed: "Maximize FPS (lower resolution, FP16)",
    balanced: "Optimal trade-off between speed and accuracy",
    accuracy: "Maximize detection quality (higher resolution)"
};

export default function ModeSelector({ onModeChange }: { onModeChange?: (mode: string) => void }) {
    const [active, setActive] = useState<string>("balanced");

    const handleSelect = async (mode: string) => {
        const prev = active;
        setActive(mode);
        try {
            await api.setAutopilotMode(mode);
            onModeChange?.(mode);
        } catch {
            setActive(prev);
        }
    };

    return (
        <div className="flex bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
            {modes.map((m) => (
                <button
                    key={m}
                    onClick={() => handleSelect(m)}
                    title={descriptions[m]}
                    className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors
                        ${active === m
                            ? "bg-indigo-600 text-white"
                            : "text-zinc-500 hover:text-zinc-300"
                        }`}
                >
                    {m}
                </button>
            ))}
        </div>
    );
}
