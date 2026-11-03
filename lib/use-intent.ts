import { useEffect, useMemo, useRef } from "react";

/**
 * Runs `go` once the mouse or keyboard focus has rested on a control for 150 ms, so the answer
 * is usually back before the click. One timer per component: only one control is hovered at a time.
 */
export function useIntent() {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useMemo(() => {
    const start = (go: () => void) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(go, 150);
    };
    const stop = () => clearTimeout(timer.current);
    /** Handlers for one control. Touch is left out: a tap clicks straight away. */
    const on = (go: () => void) => ({
      onPointerEnter: (e: { pointerType: string }) => { if (e.pointerType === "mouse") start(go); },
      onPointerLeave: stop,
      onFocus: () => start(go),
      onBlur: stop,
      // a quick click or Enter beats the timer: the click fetches, the timer must not fetch again
      onPointerDown: stop,
      onKeyDown: stop,
    });
    return { start, stop, on };
  }, []);
}
