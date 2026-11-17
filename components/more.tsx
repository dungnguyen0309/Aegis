"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { scrollMode } from "@/lib/use-reduced-motion";

/** A folded row for context the decision does not need. Its contents (often 3D) are only built once opened;
 *  `holds` names the tour targets inside, so the tour can open it. */
export function More({ label, holds, children }: { label: string; holds: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details data-holds={holds} onToggle={(e) => setOpen(e.currentTarget.open)} className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-base font-semibold transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
        {open ? label.replace(/^Show /, "Hide ") : label}
        <CaretDownIcon className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </details>
  );
}

/** Opens the folded row holding a tour target (`holds`), focuses it and scrolls to it, once the tab that contains it has rendered. */
export function openFold(target: string, tries = 20) {
  const fold = document.querySelector<HTMLDetailsElement>(`details[data-holds~="${target}"]`);
  if (!fold) {
    if (tries > 0) window.setTimeout(() => openFold(target, tries - 1), 100);
    return;
  }
  fold.open = true;
  // Keyboard focus follows to the fold, so it does not fall back to the top of the page
  fold.querySelector("summary")?.focus({ preventScroll: true });
  window.setTimeout(() => document.querySelector(`[data-tour="${target}"]`)?.scrollIntoView({ behavior: scrollMode(), block: "start" }), 120);
}
