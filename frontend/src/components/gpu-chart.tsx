"use client";
import { useEffect, useRef } from "react";
import type { TelemetrySnapshot } from "@/lib/types";

interface Props {
    history: TelemetrySnapshot[];
}

export default function GpuChart({ history }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || history.length === 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const W = rect.width;
        const H = rect.height;

        ctx.clearRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
            const y = (H / 4) * i;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        const data = history.map((s) => s.gpu_util);
        const maxPts = Math.min(data.length, 120);
        const pts = data.slice(-maxPts);
        const stepX = W / (maxPts - 1 || 1);

        // Fill
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "rgba(99, 102, 241, 0.15)");
        grad.addColorStop(1, "rgba(99, 102, 241, 0.0)");
        ctx.beginPath();
        ctx.moveTo(0, H);
        pts.forEach((v, i) => ctx.lineTo(i * stepX, H - (v / 100) * H));
        ctx.lineTo((pts.length - 1) * stepX, H);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        pts.forEach((v, i) => {
            const x = i * stepX, y = H - (v / 100) * H;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#6366f1";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        const last = pts[pts.length - 1] ?? 0;
        ctx.fillStyle = "#818cf8";
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(last)}%`, W - 4, 12);
    }, [history]);

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
            <h3 className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide mb-2">GPU</h3>
            <canvas ref={canvasRef} className="w-full h-16" />
        </div>
    );
}
