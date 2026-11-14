"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { lsGet, lsSet } from "./safeStorage";

export type ThemeCode = "obsidian" | "titanium" | "daylight";

export const THEMES: { code: ThemeCode; dots: [string, string, string] }[] = [
  { code: "obsidian", dots: ["#070A0F", "#00EC97", "#F59E0B"] },
  { code: "titanium", dots: ["#0D1420", "#10B981", "#94A3B8"] },
  { code: "daylight", dots: ["#F8FAFC", "#059669", "#D97706"] },
];

interface Ctx {
  theme: ThemeCode;
  setTheme: (t: ThemeCode) => void;
}
const ThemeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "nearsignet.theme.v2";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeCode>("obsidian");

  useEffect(() => {
    const saved = lsGet(STORAGE_KEY) as ThemeCode | null;
    if (saved && THEMES.some((t) => t.code === saved)) setThemeState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t: ThemeCode) => {
    setThemeState(t);
    lsSet(STORAGE_KEY, t);
  }, []);

  const value = useMemo<Ctx>(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
