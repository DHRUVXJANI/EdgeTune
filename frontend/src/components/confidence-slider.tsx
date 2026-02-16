"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";

export default function ConfidenceSlider() {
    const [value, setValue] = useState(0.25);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const v = parseFloat(e.target.value);
            setValue(v);

            // Debounce API call
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(async () => {
                try {
                    await api.configureInference({ confidence_threshold: v });
                } catch (err) {
                    console.error("Failed to update confidence:", err);
                }
            }, 300);
        },
        []
    );

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Confidence</h3>
                <span className="text-xs font-semibold text-indigo-400 tabular-nums">{value.toFixed(2)}</span>
            </div>
            <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={value}
                onChange={handleChange}
                className="w-full"
            />
            <div className="flex justify-between mt-1">
                <span className="text-[10px] text-zinc-600">More detections</span>
                <span className="text-[10px] text-zinc-600">Higher precision</span>
            </div>
        </div>
    );
}
