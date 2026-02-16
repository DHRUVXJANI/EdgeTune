"use client";

import { useCallback, useEffect, useState } from "react";

interface Props {
    onToggleInference: () => void;
    onSetMode: (mode: string) => void;
    running: boolean;
}

const shortcuts = [
    { key: "Space", desc: "Start / Stop inference" },
    { key: "1", desc: "Speed mode" },
    { key: "2", desc: "Balanced mode" },
    { key: "3", desc: "Accuracy mode" },
    { key: "F", desc: "Fullscreen video" },
    { key: "[", desc: "Collapse sidebar" },
    { key: "?", desc: "Show this help" },
];

export default function KeyboardShortcuts({ onToggleInference, onSetMode, running }: Props) {
    const [showHelp, setShowHelp] = useState(false);

    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

            switch (e.key) {
                case " ":
                    e.preventDefault();
                    onToggleInference();
                    break;
                case "1":
                    onSetMode("speed");
                    break;
                case "2":
                    onSetMode("balanced");
                    break;
                case "3":
                    onSetMode("accuracy");
                    break;
                case "?":
                    setShowHelp((v) => !v);
                    break;
                case "Escape":
                    setShowHelp(false);
                    break;
            }
        },
        [onToggleInference, onSetMode]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [handleKey]);

    if (!showHelp) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center shortcuts-backdrop bg-black/60"
            onClick={() => setShowHelp(false)}
        >
            <div
                className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-2xl max-w-sm w-full"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-sm font-semibold text-zinc-200 mb-4">Keyboard Shortcuts</h2>
                <div className="space-y-2">
                    {shortcuts.map((s) => (
                        <div key={s.key} className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">{s.desc}</span>
                            <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[11px] text-zinc-300 font-mono">
                                {s.key}
                            </kbd>
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-4 text-center">
                    Press <kbd className="px-1 bg-zinc-800 rounded text-zinc-400">?</kbd> or <kbd className="px-1 bg-zinc-800 rounded text-zinc-400">Esc</kbd> to close
                </p>
            </div>
        </div>
    );
}
