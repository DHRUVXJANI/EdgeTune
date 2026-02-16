"use client";

import { useCallback, useEffect, useState } from "react";

export default function ThemeToggle() {
    const [dark, setDark] = useState(true);

    // Load saved theme on mount
    useEffect(() => {
        const saved = localStorage.getItem("edgetune_theme");
        if (saved === "light") {
            setDark(false);
            document.documentElement.setAttribute("data-theme", "light");
        }
    }, []);

    const toggle = useCallback(() => {
        setDark(prev => {
            const next = !prev;
            const theme = next ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", theme);
            localStorage.setItem("edgetune_theme", theme);
            return next;
        });
    }, []);

    return (
        <button
            onClick={toggle}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
            {dark ? (
                /* Sun icon */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="5" />
                    <path strokeLinecap="round" d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.73 12.73l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
            ) : (
                /* Moon icon */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
            )}
        </button>
    );
}
