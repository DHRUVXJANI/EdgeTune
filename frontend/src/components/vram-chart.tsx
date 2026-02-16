"use client";
import { useEffect, useRef } from "react";
import type { TelemetrySnapshot } from "@/lib/types";

interface Props {
    history: TelemetrySnapshot[];
}

export default function VramChart({ history }: Props) {
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

        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
            const y = (H / 4) * i;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        const latest = history[history.length - 1];
        const vramTotal = latest.vram_total || 1;
        const data = history.map((s) => s.vram_used);
        const maxPts = Math.min(data.length, 120);
        const pts = data.slice(-maxPts);
        const stepX = W / (maxPts - 1 || 1);

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "rgba(34, 197, 94, 0.15)");
        grad.addColorStop(1, "rgba(34, 197, 94, 0.0)");
        ctx.beginPath();
        ctx.moveTo(0, H);
        pts.forEach((v, i) => ctx.lineTo(i * stepX, H - (v / vramTotal) * H));
        ctx.lineTo((pts.length - 1) * stepX, H);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        pts.forEach((v, i) => {
            const x = i * stepX, y = H - (v / vramTotal) * H;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const last = pts[pts.length - 1] ?? 0;
        ctx.fillStyle = "#4ade80";
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${last.toFixed(1)}/${vramTotal.toFixed(0)}G`, W - 4, 12);
    }, [history]);

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
            <h3 className="text-[10px] font-medium text-zinc-600 uppercase tracking-wide mb-2">VRAM</h3>
            <canvas ref={canvasRef} className="w-full h-16" />
        </div>
    );
}
