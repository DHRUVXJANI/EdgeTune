"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api";

interface Props {
    onStart: (source: string, mode: string) => void;
}

type UploadStatus = "idle" | "uploading" | "success" | "error";

export default function SourceSelector({ onStart }: Props) {
    const [tab, setTab] = useState<"camera" | "file">("camera");
    const [files, setFiles] = useState<string[]>([]);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [processingMode, setProcessingMode] = useState("paced");
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadFiles = useCallback(async () => {
        try {
            const res = await api.listSourceFiles();
            setFiles(res.files);
        } catch { /* server not ready */ }
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadStatus("uploading");
        try {
            const result = await api.uploadVideo(file);
            setSelectedFile(result.filename);
            setUploadStatus("success");
            await loadFiles();
            setTimeout(() => setUploadStatus("idle"), 2000);
        } catch {
            setUploadStatus("error");
            setTimeout(() => setUploadStatus("idle"), 3000);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleStart = () => {
        if (tab === "camera") onStart("camera", "paced");
        else if (selectedFile) onStart(selectedFile, processingMode);
    };

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-4">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Source</h3>

            {/* Tabs */}
            <div className="flex bg-zinc-800/50 rounded-md p-0.5 mb-3">
                {(["camera", "file"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => { setTab(t); if (t === "file") loadFiles(); }}
                        className={`flex-1 py-1.5 rounded text-xs font-medium capitalize transition-colors
                            ${tab === t ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                        {t}
                    </button>
                ))}
            </div>

            {/* File mode */}
            {tab === "file" && (
                <div className="space-y-2 mb-3">
                    <div
                        onClick={() => uploadStatus !== "uploading" && fileInputRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={async (e) => {
                            e.preventDefault();
                            setDragActive(false);
                            const f = e.dataTransfer.files?.[0];
                            if (!f) return;
                            setUploadStatus("uploading");
                            try {
                                const result = await api.uploadVideo(f);
                                setSelectedFile(result.filename);
                                setUploadStatus("success");
                                await loadFiles();
                                setTimeout(() => setUploadStatus("idle"), 2000);
                            } catch {
                                setUploadStatus("error");
                                setTimeout(() => setUploadStatus("idle"), 3000);
                            }
                        }}
                        className={`border border-dashed rounded-md p-3 text-center transition-colors
                            ${dragActive ? "dnd-active" :
                                uploadStatus === "uploading" ? "border-amber-500/40 cursor-wait" :
                                    uploadStatus === "success" ? "border-green-500/40 cursor-pointer" :
                                        uploadStatus === "error" ? "border-red-500/40 cursor-pointer" :
                                            "border-zinc-700 hover:border-zinc-600 cursor-pointer"}`}
                    >
                        <input ref={fileInputRef} type="file" accept=".mp4,.avi,.mov,.mkv,.webm" className="hidden" onChange={handleUpload} />
                        <span className={`text-xs
                            ${uploadStatus === "uploading" ? "text-amber-400" :
                                uploadStatus === "success" ? "text-green-400" :
                                    uploadStatus === "error" ? "text-red-400" :
                                        "text-zinc-500"}`}>
                            {uploadStatus === "uploading" ? "Uploading…" :
                                uploadStatus === "success" ? "Upload complete" :
                                    uploadStatus === "error" ? "Upload failed" :
                                        "Upload video file"}
                        </span>
                    </div>

                    {files.length > 0 && (
                        <div className="max-h-24 overflow-y-auto space-y-0.5 custom-scrollbar">
                            {files.map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setSelectedFile(f)}
                                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs truncate transition-colors
                                        ${selectedFile === f
                                            ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                                            : "text-zinc-400 hover:bg-zinc-800 border border-transparent"}`}
                                >
                                    {selectedFile === f && <span className="mr-1.5">●</span>}
                                    {f}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Selected file indicator */}
                    {selectedFile && (
                        <div className="px-2.5 py-1.5 bg-indigo-500/10 rounded border border-indigo-500/20 text-xs text-indigo-400 truncate">
                            Selected: {selectedFile}
                        </div>
                    )}

                    <div className="flex gap-1.5">
                        {(["paced", "benchmark"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setProcessingMode(m)}
                                className={`flex-1 py-1 rounded text-xs transition-colors capitalize
                                    ${processingMode === m ? "bg-indigo-600 text-white" : "text-zinc-600 hover:text-zinc-400"}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <button
                onClick={handleStart}
                disabled={tab === "file" && !selectedFile}
                className="w-full py-2 rounded-md bg-indigo-600 text-white text-xs font-medium
                           hover:bg-indigo-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
                Start Inference
            </button>
        </div>
    );
}
