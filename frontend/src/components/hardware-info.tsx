"use client";

import { useEffect, useState } from "react";

interface HardwareData {
    gpu_name: string;
    gpu_available: boolean;
    vram_total_gb: number;
    tier: string;
    cpu_cores: number;
    ram_total_gb: number;
    recommended_device: string;
    ai_connected?: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function HardwareInfo() {
    const [hw, setHw] = useState<HardwareData | null>(null);

    useEffect(() => {
        const fetchHardware = async () => {
            try {
                const res = await fetch(`${API}/api/hardware`);
                if (res.ok) setHw(await res.json());
            } catch { /* server not ready */ }
        };
        fetchHardware();
    }, []);

    if (!hw) return null;

    const tierColor = hw.tier === "high" ? "text-green-400"
        : hw.tier === "mid" ? "text-amber-400"
            : hw.tier === "low" ? "text-orange-400"
                : "text-zinc-400";

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Hardware</h3>
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">GPU</span>
                    <span className="text-xs text-zinc-200 font-medium truncate ml-2">
                        {hw.gpu_available ? hw.gpu_name : "CPU Only"}
                    </span>
                </div>
                {hw.gpu_available && (
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-500">VRAM</span>
                        <span className="text-xs text-zinc-200 font-medium">{hw.vram_total_gb.toFixed(1)} GB</span>
                    </div>
                )}
                <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">Tier</span>
                    <span className={`text-xs font-medium uppercase ${tierColor}`}>{hw.tier}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">Device</span>
                    <span className="text-xs text-zinc-200 font-mono">{hw.recommended_device}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">CPU</span>
                    <span className="text-xs text-zinc-200">{hw.cpu_cores} cores · {hw.ram_total_gb.toFixed(0)} GB RAM</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-zinc-800 mt-2">
                    <span className="text-xs text-zinc-500">AI Assistant</span>
                    <span className={`text-xs font-medium ${hw.ai_connected ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {hw.ai_connected ? "Online" : "Offline"}
                    </span>
                </div>
            </div>
        </div>
    );
}
