"use client";

import { CaretRightIcon, ChartLineIcon, FileTextIcon, MapTrifoldIcon, PackageIcon, PencilSimpleIcon, UserFocusIcon } from "@phosphor-icons/react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { CopyLink } from "@/components/copy-link";
import { Button } from "@/components/ui/button";
import { StatusBadge, ToneIcon } from "@/components/status";
import { CompanyMark, Flag, Name, regionName, To } from "@/components/visuals";
import { change, componentLabel, entityLabel, entityTone, itemTone, type Tone, toneVar, times, verdictSolid, verdictTone, routeStatus, ytdLabel, NONE } from "@/lib/format";
import type { Assessment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { scrollMode } from "@/lib/use-reduced-motion";

export type Section = "overview" | "counterparty" | "goods" | "route" | "briefing";


/** `spoken`: the figure in words, so a screen reader hears "Route risk: 85 of 100, critical" rather than the run-together text.
 *  `note` is the line that must always show (review progress, this year's direction); `sub` is detail that may be cut,
 *  to one line with `oneLine`. On phones a tile is one row of a list: label left, value right, no sub line. */
function Kpi({ label, value, note, sub, oneLine, onClick, spoken }: {
  label: string; value: ReactNode; note?: string; sub?: string; oneLine?: boolean; onClick: () => void; spoken: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={[`${label}: ${spoken}`, note, sub].filter(Boolean).join(". ")}
      className="group flex min-w-0 flex-col items-start gap-1 bg-card px-4 py-3 text-left transition-colors hover:bg-muted max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-3 max-sm:py-2.5 sm:px-5">
      {/* The label may wrap on narrow tiles; the caret keeps its size */}
      <span className="flex w-full items-start justify-between gap-1 text-sm leading-snug text-muted-foreground">
        {label}
        <CaretRightIcon className="mt-0.5 size-3.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-100 max-sm:hidden" aria-hidden />
      </span>
      <span className="flex min-h-8 min-w-0 flex-wrap items-center gap-2 max-sm:justify-end">{value}</span>
      {note && <span className="text-sm leading-snug text-muted-foreground max-sm:col-span-2">{note}</span>}
      {sub && <span title={sub} className={cn("text-sm leading-snug text-muted-foreground max-sm:hidden", oneLine ? "line-clamp-1 break-words" : "line-clamp-2")}>{sub}</span>}
    </button>
  );
}

const BUYER_TAB = "Buyer tab";
const LINK = "font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground";

/** A step as text, with a mention of the Buyer tab as a link to it. */
function Step({ text, onBuyer }: { text: string; onBuyer: () => void }) {
  const at = text.indexOf(BUYER_TAB);
  if (at < 0) return text;
  return <>
    {text.slice(0, at)}
    {/* Touch: a 44px hit area that does not grow the line box */}
    <button type="button" onClick={onBuyer}
      className={cn(LINK, "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3")}>{BUYER_TAB}</button>
    {text.slice(at + BUYER_TAB.length)}
  </>;
}

/** The recommended action as the headline, who and what was assessed, and the four figures behind it. */
export function AssessmentSummary({ a, onSection, example, keptBuyer, editing, onEdit }: {
  a: Assessment; onSection: (s: Section) => void; example?: boolean;
  /** Opened from Radar, which changes only the route: the buyer is the one from the last assessment. */
  keptBuyer?: boolean;
  /** Below lg: whether the form is open above the result, and the toggle for it. */
  editing: boolean; onEdit: () => void;
}) {
  const { query: q, classification: c, route: r, entity: e } = a;
  const tone = verdictTone[a.verdict.code];
  const best = e.subjects.flatMap((s) => s.matches).filter((m) => m.review?.decision !== "different")
    .sort((x, y) => y.score - x.score)[0];
  // A name hit is a lead until an officer confirms it on the Buyer tab
  // Hits that need the officer's decision (80%+, or already decided), across all names. Once a name's match
  // is confirmed, its other hits no longer need one.
  const dueBy = e.subjects.map((s) => s.matches.filter((m) => m.review || (!s.confirmed && m.score >= 80)));
  const due = dueBy.flat();
  const names = dueBy.filter((d) => d.length).length;
  // Hits that left the count because their name's match was confirmed, so the total shrinking is explained
  const closed = e.subjects.filter((s) => s.confirmed).flatMap((s) => s.matches).filter((m) => !m.review && m.score >= 80).length;
  // Confirmed when the hit behind the status is, whatever is still open on other names
  const confirmed = e.subjects.some((s) => s.confirmed && s.status === e.status);
  const state = e.status === "CLEAN" ? null : confirmed ? "Confirmed" : "Unconfirmed";
  const screening = `${entityLabel[e.status]}${state ? `, ${state.toLowerCase()}` : ""}`;
  const itemLabel = c.chpl ? `Tier ${c.tier}` : c.status === "NOT LISTED" ? "Not on item list" : "Check parameters";
  const exportsValue = r.multiplier !== null ? times(r.multiplier) : r.emergent ? "New flow" : NONE;
  const ytd = a.monthly?.ytd;
  const rs = routeStatus(r.band, r.no_baseline);
  const top = r.components.filter((x) => x.points).sort((x, y) => y.points! - x.points!)[0];
  // Phones show the first step; the rest open on request. Never for Stop, Hold or Red flag: every step there blocks the shipment.
  const [allSteps, setAllSteps] = useState(false);
  // Steps the law requires (the Art. 12g clause) always show too
  const foldable = (s: string, i: number) => i > 0 && !a.verdict.required?.includes(s);
  // Only worth a toggle when it hides at least two steps
  const collapsible = a.verdict.code === "ELEVATED" && a.verdict.actions.filter(foldable).length >= 2;
  // Cleared, then set: a rerun with the same company and verdict is announced again
  const [said, setSaid] = useState("");
  useEffect(() => {
    const text = `${q.company}: ${a.verdict.title}.`;
    const clear = setTimeout(() => setSaid(""), 0);
    const say = setTimeout(() => setSaid(text), 150);
    return () => { clearTimeout(clear); clearTimeout(say); };
  }, [a, q.company]);

  return (
    <section data-tour="verdict" className="bg-card">
      {/* Screen readers hear the decision once per result, not the whole card */}
      <p className="sr-only" aria-live="polite">{said}</p>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyMark name={q.company} size={36} flagged={e.status !== "CLEAN"} />
          <div className="min-w-0 wrap-anywhere">
            <h1 className="flex flex-wrap items-center gap-x-2 text-xl font-bold leading-tight">
              <Name>{q.company}</Name>
              {example && <span className="bg-muted px-1.5 text-sm font-semibold text-foreground">Example case</span>}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
              {q.jurisdiction && <><Flag code={q.jurisdiction} size={14} /> {regionName(q.jurisdiction)} <span className="text-faint">·</span></>}
              <span>HS {c.hs.slice(0, 4)}.{c.hs.slice(4)}{c.description && ` ${c.description}`}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <Flag code={q.exporter} size={14} /> {q.exporter_name} <To />
              <Flag code={q.intermediary} size={14} /> {q.intermediary_name} <To />
              <Flag code="RU" size={14} /> Russia
            </div>
            {keptBuyer && <p className="mt-0.5 text-sm text-muted-foreground">Buyer kept from the last assessment</p>}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {/* Below lg the form is hidden until asked for; it opens above the result */}
          <Button variant="ghost" size="sm" className="lg:hidden" aria-expanded={editing} onClick={() => {
            onEdit();
            if (editing) return;
            requestAnimationFrame(() => {
              document.querySelector('[data-tour="query"]')?.scrollIntoView({ behavior: scrollMode(), block: "start" });
              document.getElementById("company")?.focus({ preventScroll: true });
            });
          }}><PencilSimpleIcon /> {editing ? "Hide form" : "New assessment"}</Button>
          <CopyLink />
        </div>
      </div>

      <div className="px-5 pb-4 pt-4">
        {/* The action sits in a box in its own colour (red for Stop, green for Standard): action, steps and notes read as one */}
        <div className="border px-4 py-3.5 sm:px-5" style={{
          borderColor: `color-mix(in srgb, ${toneVar[tone]} 60%, transparent)`,
          background: `color-mix(in srgb, ${toneVar[tone]} 7%, var(--card))`,
        }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="sr-only">Action:</span>
          <StatusBadge tone={tone} solid={verdictSolid(a.verdict.code)} large>{a.verdict.code}</StatusBadge>
          <h2 className="min-w-0 wrap-break-word hyphens-auto text-xl font-bold leading-tight sm:text-3xl">{a.verdict.title}</h2>
        </div>
        {a.verdict.actions.length > 0 && (
          <ol id="verdict-steps" className="mt-3 list-decimal space-y-0.5 pl-5 text-base font-medium max-sm:text-sm">
            {a.verdict.actions.map((s, i) => <li key={s} className={cn(foldable(s, i) && collapsible && !allSteps && "max-sm:hidden")}>
              <Step text={s} onBuyer={() => onSection("counterparty")} />
            </li>)}
          </ol>
        )}
        {collapsible && (
          <button type="button" aria-expanded={allSteps} aria-controls="verdict-steps" onClick={() => setAllSteps(!allSteps)}
            className={cn(LINK, "mt-1 text-sm pointer-coarse:py-3 sm:hidden")}>
            {allSteps ? "Show fewer steps" : `All ${a.verdict.actions.length} steps`}
          </button>
        )}
        {a.verdict.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-base text-muted-foreground max-sm:text-sm">
            {a.verdict.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <button type="button" onClick={() => onSection("briefing")} className={cn(LINK, "pointer-coarse:py-3")}>
            Open briefing
          </button>
        </div>
        </div>
      </div>

      {/* Four across only from xl: beside the form column, lg tiles are too narrow for the status */}
      <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sanctions screening" onClick={() => onSection("counterparty")} spoken={`${screening}. Opens the Buyer tab`}
          value={<>
            <StatusBadge tone={entityTone[e.status]}>{entityLabel[e.status]}</StatusBadge>
            {state && <span className="text-sm font-medium text-muted-foreground">{state}</span>}
          </>}
          note={due.length ? `${due.filter((m) => m.review).length} of ${due.length} hits reviewed${names > 1 ? ` across ${names} names` : ""}${closed ? `, ${closed} closed by the confirmed match` : ""}` : undefined}
          sub={best && e.status !== "CLEAN"
            ? `${best.name} · ${best.lists.join(", ")} · ${best.score.toFixed(0)}%`
            : `${e.subjects.length} name${e.subjects.length > 1 ? "s" : ""} checked`} oneLine />
        <Kpi label="Route risk" onClick={() => onSection("route")} spoken={`${r.score} of 100, ${rs.label.toLowerCase()}. Opens the Route tab`}
          value={<><span className="text-xl font-bold leading-none">{r.score}</span><span className="text-muted-foreground">/ 100</span>
            <StatusBadge tone={rs.tone}>{rs.label}</StatusBadge></>}
          sub={top ? `Biggest factor: ${componentLabel[top.key] ?? top.key}, ${top.points!.toFixed(0)} / ${top.weight.toFixed(0)}` : undefined} />
        <Kpi label="Item" onClick={() => onSection("goods")} spoken={`${itemLabel}. Opens the Item tab`}
          value={<StatusBadge tone={itemTone(a.classification)}>{itemLabel}</StatusBadge>}
          sub={c.chpl ? "EU battlefield item list" : undefined} />
        <Kpi label={`Exports to ${q.intermediary_name} vs pre-war`} onClick={() => onSection("route")}
          spoken={`${exportsValue === NONE ? "not available" : exportsValue}. Opens the Route tab`}
          value={<>
            <span className="text-xl font-bold leading-none">{exportsValue}</span>
            {/* Phones drop the sub line, so the basis rides with the figure: the note below is a different comparison */}
            <span className="text-sm text-muted-foreground sm:hidden">since 2022 vs 2017–21</span>
          </>}
          // A second, different comparison: the same months this year and in 2021, as a change
          note={ytd?.ratio != null ? `${ytdLabel(ytd.year, ytd.through_month, ytd.reference_year)}: ${change(ytd.ratio)}` : undefined}
          sub="Yearly average since 2022 vs 2017–21" />
      </div>
    </section>
  );
}

const SECTIONS: { id: Section; label: string; icon: typeof PackageIcon }[] = [
  { id: "overview", label: "Overview", icon: MapTrifoldIcon },
  { id: "counterparty", label: "Buyer", icon: UserFocusIcon },
  { id: "goods", label: "Item", icon: PackageIcon },
  { id: "route", label: "Route", icon: ChartLineIcon },
  { id: "briefing", label: "Briefing", icon: FileTextIcon },
];

const DOT_WORD: Record<Tone, string> = { good: "clear", neutral: "info", warning: "check", serious: "check", critical: "alert" };

/** Section switcher for the assessment, with a status icon where a section carries a finding. */
export function SectionTabs({ value, onChange, a }: { value: Section; onChange: (s: Section) => void; a: Assessment }) {
  const dot: Partial<Record<Section, Tone>> = {
    counterparty: entityTone[a.entity.status],
    goods: itemTone(a.classification),
    route: routeStatus(a.route.band, a.route.no_baseline).tone,
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SECTIONS.findIndex((x) => x.id === value);
    const next = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: SECTIONS.length - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = SECTIONS[(next + SECTIONS.length) % SECTIONS.length].id;
    onChange(id);
    document.getElementById(`tab-${id}`)?.focus();
  };
  return (
    // The negative margin cancels the scroll padding kept for these tabs, so scrolling to them lands them at the top
    <div className="sticky top-0 z-20 -mx-1 -scroll-mt-tabs bg-background px-1 lg:top-14" data-tour="sections">
      {/* All five fit from 360px; on narrower phones the tabs scroll sideways and the right edge fades */}
      <div role="tablist" aria-label="Assessment sections" onKeyDown={onKey}
        className="relative flex gap-0 scroll-row border-b border-border sm:gap-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={value === id} aria-controls="section-panel"
            tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)}
            className={cn("flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-base font-medium transition-colors max-sm:px-1.5 max-sm:text-sm sm:px-3 pointer-coarse:py-3 focus-visible:-outline-offset-2",
              value === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4 max-sm:hidden" aria-hidden /> {label}
            {dot[id] && <ToneIcon tone={dot[id]!} className="size-3.5" />}
            {dot[id] && <span className="sr-only">({DOT_WORD[dot[id]!]})</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
