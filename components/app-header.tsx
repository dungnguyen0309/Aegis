"use client";

import { BinocularsIcon, MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MethodologyDialog } from "@/components/methodology-dialog";
import type { Reference } from "@/lib/types";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type View = "radar" | "assess" | "batch" | "calc";

function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <path d="M16 2.5 L27.5 6.5 V15 C27.5 22.5 22.5 27.6 16 29.5 C9.5 27.6 4.5 22.5 4.5 15 V6.5 Z" fill="var(--card)"
          stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M9.5 20.5 A6.5 6.5 0 0 1 22.5 20.5" fill="none" stroke="var(--chart-baseline)" strokeWidth="1.4" />
        <path d="M12.8 20.5 A3.2 3.2 0 0 1 19.2 20.5" fill="none" stroke="var(--chart-baseline)" strokeWidth="1.4" />
        <line x1="16" y1="20.5" x2="21" y2="12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16" cy="20.5" r="1.6" fill="currentColor" />
        <circle cx="21.2" cy="11.8" r="2.3" fill="var(--status-critical)" />
      </svg>
      <div className="text-lg font-bold leading-none">Aegis</div>
    </div>
  );
}

const THEME_NAME: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", system: "System" };
const THEME_ICON = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };

const NAV: { view: View; label: string }[] = [
  { view: "assess", label: "Assessment" },
  { view: "radar", label: "Radar" },
  { view: "batch", label: "Batch" },
  { view: "calc", label: "Calculator" },
];

export function AppHeader({ reference, view, onView, onTour }: {
  reference: Reference | null;
  view: View;
  onView: (v: View) => void;
  onTour: () => void;
}) {
  const { theme, choice, setTheme } = useTheme();
  // Light, dark, then back to following the system; from system, the first click always changes what is shown
  const next: ThemeChoice = choice === "light" ? "dark" : choice === "dark" ? "system" : theme === "dark" ? "light" : "dark";
  const ThemeIcon = THEME_ICON[choice];
  return (
    // Stays on screen from desktop width (one row); below that it can wrap and would take too much of the screen
    <header className="z-30 border-b border-border bg-card lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-app flex-wrap items-center gap-x-6 px-4 sm:px-6">
        <div className="flex h-14 items-center"><Brand /></div>
        {/* Links, so a view opens in a new tab with a middle click; a plain click switches in place */}
        <nav className="order-last -mx-4 flex w-full items-center gap-0.5 scroll-row sm:gap-1 py-1.5 md:py-0 border-t border-border px-4 md:order-none md:mx-0 md:h-14 md:w-auto md:border-0 md:px-0"
          aria-label="Views">
          {NAV.map(({ view: v, label }) => (
            <a key={v} href={v === "assess" ? "/" : `/?view=${v}`} data-tour={v === "radar" ? "nav-radar" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onView(v);
              }}
              aria-current={view === v ? "page" : undefined}
              // Views are filled, a case's sections are underlined: the two levels never look alike
              className={cn("flex shrink-0 items-center px-3 py-1.5 text-base font-medium transition-colors max-sm:px-2 max-sm:text-sm pointer-coarse:py-3 focus-visible:-outline-offset-2",
                view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex min-h-14 flex-wrap items-center justify-end gap-1.5">
          <Button variant="ghost" size="sm" className="text-base max-sm:text-sm" onClick={onTour}><BinocularsIcon /> Tour</Button>
          <MethodologyDialog reference={reference} />
          <Button variant="ghost" size="icon-sm" onClick={() => setTheme(next)}
            aria-label={`Theme: ${THEME_NAME[choice]}. Switch to ${THEME_NAME[next].toLowerCase()}`} title={`Theme: ${THEME_NAME[choice]}`}>
            <ThemeIcon />
          </Button>
        </div>
      </div>
    </header>
  );
}
