"use client";

import { createContext, useContext, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePersisted } from "./persisted";

export type Theme = "light" | "dark";
export type ThemeChoice = Theme | "system";
/** `theme` is what is shown; `choice` is what the reader picked ("system" follows the OS setting). */
const ThemeContext = createContext<{ theme: Theme; choice: ThemeChoice; setTheme: (t: ThemeChoice) => void } | null>(null);

/** Runs before first paint (in <head>) so a dark theme never flashes light. Without a saved choice, follow the system. */
export const THEME_SCRIPT =
  "try{var t=localStorage.getItem('aegis-theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}";

const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeSystem(cb: () => void) {
  const m = window.matchMedia(DARK_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setTheme] = usePersisted<ThemeChoice>("aegis-theme", "system", ["light", "dark", "system"]);
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK_QUERY).matches, () => false);
  const theme: Theme = saved === "system" ? (systemDark ? "dark" : "light") : saved;
  // Layout effect: the class must be on <html> before child effects (the 3D views) read theme colours.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.classList.toggle("dark", theme === "dark");
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, choice: saved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
