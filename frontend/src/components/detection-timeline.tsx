"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
    /** Array of { total: number, timestamp: number } entries */
    history: { total: number; timestamp: number }[];
}

const MAX_POINTS = 60;
const HEIGHT = 80;

export default function DetectionTimeline({ history }: Props) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(300);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const observer = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect.width;
            if (w && w > 0) setWidth(w);
        });
        observer.observe(svg);
        return () => observer.disconnect();
    }, []);

    if (history.length < 2) return null;

    const data = history.slice(-MAX_POINTS);
    const max = Math.max(...data.map(d => d.total), 1);
    const stepX = width / (data.length - 1);

    const points = data.map((d, i) => {
        const x = i * stepX;
        const y = HEIGHT - (d.total / max) * (HEIGHT - 8) - 4;
        return `${x},${y}`;
    });

    const areaPath = `M0,${HEIGHT} L${points.join(" L")} L${width},${HEIGHT} Z`;
    const linePath = `M${points.join(" L")}`;

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-600 uppercase tracking-wide">Detection Count Over Time</span>
                <span className="text-[10px] text-zinc-500 tabular-nums">
                    {data[data.length - 1]?.total ?? 0} detections
                </span>
            </div>
            <svg ref={svgRef} width="100%" height={HEIGHT} className="overflow-visible">
                <defs>
                    <linearGradient id="det-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#det-grad)" />
                <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="1.5" />
            </svg>
        </div>
    );
}
