"use client";

export default function ConnectionStatus({ connected }: { connected: boolean }) {
    return (
        <div className="flex items-center gap-1.5">
            <span
                className={`w-1.5 h-1.5 rounded-full ${connected
                    ? "bg-green-500 animate-pulse-connected"
                    : "bg-red-500 animate-pulse"
                    }`}
            />
            <span className={`text-[11px] ${connected ? "text-zinc-500" : "text-red-400"}`}>
                {connected ? "Connected" : "Disconnected"}
            </span>
        </div>
    );
}
