"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ModelInfo {
    name: string;
    type: "built-in" | "custom";
    size_mb?: number;
    loaded: boolean;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Status = "idle" | "uploading" | "success" | "error";

export default function ModelSelector({ onModelChange }: { onModelChange?: (model: string) => void }) {
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [uploadStatus, setUploadStatus] = useState<Status>("idle");
    const [switching, setSwitching] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadModels = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/model/list`);
            if (res.ok) {
                const data = await res.json();
                setModels(data.models);
                const loaded = data.models.find((m: ModelInfo) => m.loaded);
                if (loaded) onModelChange?.(loaded.name);
            }
        } catch { /* server not ready */ }
    }, [onModelChange]);

    useEffect(() => { loadModels(); }, [loadModels]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.name.endsWith(".pt")) return;
        setUploadStatus("uploading");
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch(`${API}/api/model/upload`, { method: "POST", body: fd });
            if (!res.ok) throw new Error(`${res.status}`);
            setUploadStatus("success");
            await loadModels();
            setTimeout(() => setUploadStatus("idle"), 2000);
        } catch (err) {
            console.error("Model upload failed:", err);
            setUploadStatus("error");
            setTimeout(() => setUploadStatus("idle"), 3000);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSwitch = async (name: string) => {
        setSwitching(name);
        try {
            const res = await fetch(`${API}/api/model/switch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model_path: name }),
            });
            if (res.ok) {
                await loadModels();
                onModelChange?.(name);
            }
        } catch { /* */ }
        setSwitching(null);
    };

    const current = models.find((m) => m.loaded);

    const uploadLabel = uploadStatus === "uploading" ? "Uploading…"
        : uploadStatus === "success" ? "Upload complete"
            : uploadStatus === "error" ? "Upload failed"
                : "Upload .pt model";

    const uploadBorder = uploadStatus === "uploading" ? "border-amber-500/40 cursor-wait"
        : uploadStatus === "success" ? "border-green-500/40 cursor-pointer"
            : uploadStatus === "error" ? "border-red-500/40 cursor-pointer"
                : "border-zinc-700 hover:border-zinc-600 cursor-pointer";

    const uploadText = uploadStatus === "uploading" ? "text-amber-400"
        : uploadStatus === "success" ? "text-green-400"
            : uploadStatus === "error" ? "text-red-400"
                : "text-zinc-500";

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Model</h3>

            {current && (
                <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 bg-indigo-500/10 rounded border border-indigo-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span className="text-xs text-indigo-400 font-medium truncate">{current.name}</span>
                </div>
            )}

            <div className="max-h-28 overflow-y-auto space-y-0.5 mb-3 custom-scrollbar">
                {models.map((m) => (
                    <button
                        key={m.name}
                        onClick={() => !m.loaded && handleSwitch(m.name)}
                        disabled={m.loaded || switching !== null}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors
                            ${m.loaded ? "text-indigo-400 cursor-default" :
                                switching === m.name ? "text-amber-400 cursor-wait" :
                                    "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"}`}
                    >
                        <span className="truncate flex-1 text-left">{m.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full
                            ${m.type === "custom" ? "bg-purple-500/15 text-purple-400" : "bg-zinc-800 text-zinc-500"}`}>
                            {m.type}
                        </span>
                    </button>
                ))}
            </div>

            <div
                onClick={() => uploadStatus !== "uploading" && fileInputRef.current?.click()}
                className={`border border-dashed rounded-md p-2.5 text-center transition-colors ${uploadBorder}`}
            >
                <input ref={fileInputRef} type="file" accept=".pt" className="hidden" onChange={handleUpload} />
                <span className={`text-xs ${uploadText}`}>{uploadLabel}</span>
            </div>
        </div>
    );
}
