import { useState, useEffect } from "react";

export interface ThemeColors {
  deepVoid: string;
  darkMatter: string;
  neuralNode: string;
  neonGreen: string;
  hotPink: string;
  bloodOrange: string;
  electricCyan: string;
  text: string;
  textMuted: string;
  font: string;
}

// Dark theme — matches Preview (A2aChatPreview.tsx) exactly
const T_DARK: ThemeColors = {
  deepVoid: "#0a0a0f",
  darkMatter: "#13131f",
  neuralNode: "#1e1e2d",
  neonGreen: "#39ff14",
  hotPink: "#ff3d7f",
  bloodOrange: "#ff5500",
  electricCyan: "#38bdf8",
  text: "#e2e8f0",
  textMuted: "#64748b",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

// Light theme — matches Preview (A2aChatPreview.tsx) exactly
const T_LIGHT: ThemeColors = {
  deepVoid: "#f9fafb",
  darkMatter: "#ffffff",
  neuralNode: "#e5e7eb",
  neonGreen: "#059669",
  hotPink: "#db2777",
  bloodOrange: "#ea580c",
  electricCyan: "#0284c7",
  text: "#111827",
  textMuted: "#6b7280",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

/**
 * Device theme hook for the website widget bundle.
 * Detects prefers-color-scheme: light from the user's device.
 * Listens for changes and re-renders.
 * (Red Mode on motherbrain.app is treated as Dark Mode — not handled separately.)
 */
export function useTheme(): ThemeColors {
  const [isLight, setIsLight] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => setIsLight(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isLight ? T_LIGHT : T_DARK;
}
