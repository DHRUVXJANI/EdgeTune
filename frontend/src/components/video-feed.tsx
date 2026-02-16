"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
    subscribeToFrames: (cb: (frame: string) => void) => () => void;
    running: boolean;
    fullscreen?: boolean;
    onToggleFullscreen?: () => void;
}

export default function VideoFeed({ subscribeToFrames, running, fullscreen, onToggleFullscreen }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [hasFrame, setHasFrame] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) return;

        let latest: string | null = null;
        let rendering = false;
        let activated = false;

        function render() {
            if (!latest || rendering || !ctx || !canvas) return;
            rendering = true;
            const src = latest;
            latest = null;

            const img = new Image();
            img.onload = () => {
                if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
                    canvas.width = img.naturalWidth;
                    canvas.height = img.naturalHeight;
                }
                ctx.drawImage(img, 0, 0);
                rendering = false;
                if (!activated) {
                    activated = true;
                    setHasFrame(true);
                }
                if (latest) render();
            };
            img.onerror = () => { rendering = false; };
            img.src = `data:image/jpeg;base64,${src}`;
        }

        const unsub = subscribeToFrames((frame: string) => {
            latest = frame;
            render();
        });

        return () => {
            unsub();
            activated = false;
        };
    }, [subscribeToFrames]);

    // Clear canvas when stopped
    useEffect(() => {
        if (!running && canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                setHasFrame(false);
                setZoom(1);
                setPan({ x: 0, y: 0 });
            }
        }
    }, [running]);

    // Scroll-to-zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        setZoom(prev => {
            const next = prev - e.deltaY * 0.001;
            return Math.min(5, Math.max(1, next));
        });
    }, []);

    // Pan handlers
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (zoom <= 1) return;
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }, [zoom, pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanningRef.current) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
    }, []);

    const handleMouseUp = useCallback(() => {
        isPanningRef.current = false;
    }, []);

    const handleResetZoom = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    const handleScreenshot = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const link = document.createElement("a");
        link.download = `edgetune-${Date.now()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }, []);

    const showEmpty = !hasFrame && !running;

    return (
        <div
            ref={containerRef}
            className={`relative bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center min-h-0 ${fullscreen ? "fixed inset-0 z-40 rounded-none" : "flex-1"
                }`}
            onDoubleClick={onToggleFullscreen}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <canvas
                ref={canvasRef}
                className={`max-w-full max-h-full ${hasFrame ? "block" : "hidden"}`}
                style={{
                    objectFit: "contain",
                    willChange: "transform",
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    cursor: zoom > 1 ? "grab" : "default",
                    transition: isPanningRef.current ? "none" : "transform 0.15s ease-out",
                }}
            />

            {showEmpty && (
                <div className="text-center py-16">
                    <p className="text-sm text-zinc-500">No active feed</p>
                    <p className="text-xs text-zinc-600 mt-1">Start inference to see output</p>
                </div>
            )}

            {/* Live badge */}
            {hasFrame && running && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 px-2 py-0.5 rounded text-[10px] font-semibold text-white uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Live
                </div>
            )}

            {/* Top-right controls */}
            {hasFrame && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {/* Zoom indicator + reset */}
                    {zoom > 1 && (
                        <button
                            onClick={handleResetZoom}
                            className="px-1.5 py-0.5 bg-zinc-800/80 hover:bg-zinc-700 rounded text-[10px] text-zinc-300 font-mono transition-colors"
                        >
                            {zoom.toFixed(1)}× ✕
                        </button>
                    )}
                    {/* Screenshot */}
                    <button
                        onClick={handleScreenshot}
                        title="Save screenshot"
                        className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 rounded transition-colors"
                    >
                        <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <circle cx="12" cy="13" r="3" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Fullscreen exit hint */}
            {fullscreen && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600 bg-zinc-900/80 px-2 py-1 rounded">
                    Double-click or press Esc to exit fullscreen
                </div>
            )}
        </div>
    );
}
