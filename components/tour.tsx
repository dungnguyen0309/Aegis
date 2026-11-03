"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Section } from "@/components/assessment-summary";
import { Button } from "@/components/ui/button";

export const TOUR_STEPS: { target: string; section?: Section; title: string; body: string }[] = [
  { target: "query", title: "Assessment form", body: "Enter the buyer, owners, HS code and route, or pick an example." },
  { target: "verdict", title: "Result", body: "The action and the four figures behind it. Click a figure to open its section." },
  { target: "sections", title: "Sections", body: "One tab per part of the check: buyer, item, route and briefing." },
  { target: "map", section: "overview", title: "Freight corridors", body: "Click a flag to assess another transit country. Play shows export volumes year by year since 2017." },
  { target: "scene", section: "overview", title: "Shipment", body: "Illustration, not an observed shipment." },
  { target: "entity", section: "counterparty", title: "Sanctions screening", body: "The buyer and owners against the EU, US and UN lists, in any script, plus the LEI register." },
  { target: "network", section: "counterparty", title: "Connections", body: "Red links are matches. Click a listed name to open its record." },
  { target: "legal", section: "goods", title: "Item", body: "EU battlefield item list status and the export rules that apply." },
  { target: "exports", section: "route", title: "Annual exports", body: "Exports vs pre-war (2017–21). Red bars: unusual years, more than two standard deviations above." },
  { target: "score", section: "route", title: "Route risk", body: "Each part of the score, with adjustable weights." },
  { target: "mirror", section: "route", title: "Cross-checks", body: "What the transit country reports, price per kg and all transit countries. Ask about large gaps." },
  { target: "memo", section: "briefing", title: "Briefing", body: "Findings, legal exposure and next steps on one printable page." },
];

type Rect = { top: number; left: number; width: number; height: number };

export function Tour({ onClose, onSection }: { onClose: () => void; onSection: (s: Section) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[i];

  // Focus moves into the card on every step and Tab cycles inside it
  useEffect(() => {
    card.current?.querySelector<HTMLButtonElement>("[data-primary]")?.focus();
  }, [i]);

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step.target]);

  useEffect(() => {
    if (step.section) onSection(step.section);
    const scroll = window.setTimeout(() => {
      document.querySelector(`[data-tour="${step.target}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const timers = [scroll, ...[200, 500, 850].map((ms) => window.setTimeout(measure, ms))];
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target, step.section, measure, onSection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, TOUR_STEPS.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
      if (e.key === "Tab" && card.current) {
        const buttons = [...card.current.querySelectorAll<HTMLButtonElement>("button")];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pad = 8;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const cardW = Math.min(360, vw - 24);
  const below = rect ? rect.top + rect.height + 200 < vh : true;
  const cardTop = rect ? (below ? Math.min(rect.top + rect.height + pad + 10, vh - 210) : Math.max(12, rect.top - 200)) : vh / 2 - 100;
  const cardLeft = rect ? Math.min(Math.max(12, rect.left), vw - cardW - 12) : vw / 2 - cardW / 2;
  const last = i === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <div className="pointer-events-none absolute rounded-md ring-2 ring-ring transition-all duration-300"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px var(--tour-dim)" }} />
      ) : <div className="absolute inset-0" style={{ background: "var(--tour-dim)" }} />}
      <div ref={card} className="absolute border border-border bg-popover p-4 shadow-2xl transition-all duration-300"
        style={{ top: cardTop, left: cardLeft, width: cardW }}>
        <div className="text-[14px] text-muted-foreground">Step {i + 1} of {TOUR_STEPS.length}</div>
        <h2 className="mt-0.5 text-lg font-bold">{step.title}</h2>
        <p className="mt-1 text-[16px] leading-snug">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-[15px] text-muted-foreground hover:text-foreground">Skip tour</button>
          <div className="flex gap-2">
            {i > 0 && <Button size="sm" variant="outline" onClick={() => setI(i - 1)}>Back</Button>}
            <Button size="sm" data-primary onClick={() => (last ? onClose() : setI(i + 1))}>{last ? "Finish" : "Next"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
