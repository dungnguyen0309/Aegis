import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

/** True when the viewer asked for reduced motion (and during server rendering). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => true);
}

/** Scroll behaviour that respects reduced motion (browsers do not apply it to scripted smooth scrolling). */
export const scrollMode = (): ScrollBehavior => (window.matchMedia(QUERY).matches ? "auto" : "smooth");
