"use client";

import { CaretRightIcon, ChartLineIcon, CheckIcon, FileTextIcon, LinkSimpleIcon, MapTrifoldIcon, PackageIcon, PencilSimpleIcon, UserFocusIcon } from "@phosphor-icons/react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status";
import { CompanyMark, Flag, regionName } from "@/components/visuals";
import { entityLabel, entityTone, type Tone, toneVar, times, verdictSolid, verdictTone, routeStatus } from "@/lib/format";
import type { Assessment } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Section = "overview" | "counterparty" | "goods" | "route" | "briefing";

function itemTone(a: Assessment): Tone {
  const c = a.classification;
  if (c.chpl) return c.tier === "1" || c.tier === "2" ? "critical" : "serious";
  return c.status === "NOT LISTED" ? "good" : "warning";
}

function Kpi({ label, value, sub, onClick }: { label: string; value: ReactNode; sub?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="group flex min-w-0 flex-col items-start gap-1 bg-card px-4 py-3 text-left sm:px-5 transition-colors hover:bg-muted">
      <span className="flex w-full items-center justify-between gap-1 whitespace-nowrap text-[14px] text-muted-foreground">
        {label}
        <CaretRightIcon className="size-3.5 opacity-40 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
      <span className="flex min-h-8 flex-wrap items-center gap-2">{value}</span>
      {sub && <span className="text-[14px] leading-snug text-muted-foreground sm:line-clamp-3">{sub}</span>}
    </button>
  );
}

/** Copies the address bar, which always describes the assessment on screen. */
function CopyLink() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setState("copied");
    } catch {
      // Older browsers or blocked clipboard permission: copy through a temporary text field
      const field = Object.assign(document.createElement("textarea"), { value: window.location.href });
      field.style.cssText = "position:fixed;opacity:0";
      document.body.append(field);
      field.select();
      setState(document.execCommand("copy") ? "copied" : "failed");
      field.remove();
    }
    window.setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-live="polite">
      {state === "copied" ? <CheckIcon /> : <LinkSimpleIcon />}
      {state === "copied" ? "Link copied" : state === "failed" ? "Copy failed: use the address bar" : "Copy link"}
    </Button>
  );
}

/** The recommended action as the headline, who and what was assessed, and the four figures behind it. */
export function AssessmentSummary({ a, onSection, example }: {
  a: Assessment; onSection: (s: Section) => void; example?: boolean;
}) {
  const { query: q, classification: c, route: r, entity: e } = a;
  const tone = verdictTone[a.verdict.code];
  const best = e.subjects.flatMap((s) => s.matches).sort((x, y) => y.score - x.score)[0];
  const ytd = a.monthly?.ytd;
  const rs = routeStatus(r.band, r.no_baseline);
  // Cleared, then set: a rerun with the same company and verdict is announced again
  const [said, setSaid] = useState("");
  useEffect(() => {
    const text = `${q.company}: ${a.verdict.title}.`;
    const clear = setTimeout(() => setSaid(""), 0);
    const say = setTimeout(() => setSaid(text), 150);
    return () => { clearTimeout(clear); clearTimeout(say); };
  }, [a, q.company]);

  return (
    <section data-tour="verdict" className="border border-border bg-card">
      {/* Screen readers hear the decision once per result, not the whole card */}
      <p className="sr-only" aria-live="polite">{said}</p>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 pt-4">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyMark name={q.company} size={36} flagged={e.status !== "CLEAN"} />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2 text-[21px] font-bold leading-tight">
              {q.company}
              {example && <span className="border border-border px-1.5 text-[14px] font-normal text-muted-foreground">Example</span>}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] text-muted-foreground">
              {q.jurisdiction && <><Flag code={q.jurisdiction} size={14} /> {regionName(q.jurisdiction)} <span className="text-faint">·</span></>}
              <span>HS {c.hs.slice(0, 4)}.{c.hs.slice(4)}{c.description && ` ${c.description}`}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[15px] text-muted-foreground">
              <Flag code={q.exporter} size={14} /> {q.exporter_name} <span className="text-faint">→</span>
              <Flag code={q.intermediary} size={14} /> {q.intermediary_name} <span className="text-faint">→</span>
              <Flag code="RU" size={14} /> Russia
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Below lg the form sits under the results: jump to it */}
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => {
            document.querySelector('[data-tour="query"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
            document.getElementById("company")?.focus({ preventScroll: true });
          }}><PencilSimpleIcon /> New assessment</Button>
          <CopyLink />
        </div>
      </div>

      <div className="px-5 pb-4 pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="sr-only">Action:</span>
          <StatusBadge tone={tone} solid={verdictSolid(a.verdict.code)} large>{a.verdict.code}</StatusBadge>
          <h2 className="text-[26px] font-bold leading-tight sm:text-[32px]">{a.verdict.title}</h2>
        </div>
        {a.verdict.actions.length > 0 && (
          <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-[17px] font-semibold">
            {a.verdict.actions.map((s) => <li key={s}>{s}</li>)}
          </ol>
        )}
        {a.verdict.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[16px] text-muted-foreground">
            {a.verdict.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
          <button type="button" onClick={() => onSection("briefing")}
            className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
            Open briefing
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border lg:grid-cols-4">
        <Kpi label="Sanctions screening" onClick={() => onSection("counterparty")}
          value={<StatusBadge tone={entityTone[e.status]}>{entityLabel[e.status]}</StatusBadge>}
          sub={best && e.status !== "CLEAN"
            ? `${best.name} · ${best.lists.join(", ")} · ${best.score.toFixed(0)}%`
            : `${e.subjects.length} name${e.subjects.length > 1 ? "s" : ""} checked`} />
        <Kpi label="Route risk" onClick={() => onSection("route")}
          value={<><span className="text-xl font-bold leading-none tabular">{r.score}</span><span className="text-muted-foreground">/ 100</span>
            <StatusBadge tone={rs.tone}>{rs.label}</StatusBadge></>}
          sub={undefined} />
        <Kpi label="Item" onClick={() => onSection("goods")}
          value={<StatusBadge tone={itemTone(a)}>{c.chpl ? `Tier ${c.tier}` : c.status === "NOT LISTED" ? "Not on item list" : "Check parameters"}</StatusBadge>}
          sub={c.chpl ? "EU battlefield item list" : undefined} />
        <Kpi label="Exports vs pre-war" onClick={() => onSection("route")}
          value={<span className="text-xl font-bold leading-none tabular">{r.multiplier !== null ? times(r.multiplier) : r.emergent ? "New flow" : "—"}</span>}
          sub={ytd?.ratio != null ? `Since 2022 · ${ytd.year} so far vs ${ytd.reference_year}: ${times(ytd.ratio)}` : "Since 2022"} />
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

/** Section switcher for the assessment, with a status dot where a section carries a finding. */
export function SectionTabs({ value, onChange, a }: { value: Section; onChange: (s: Section) => void; a: Assessment }) {
  const dot: Partial<Record<Section, Tone>> = {
    counterparty: entityTone[a.entity.status],
    goods: itemTone(a),
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
    <div className="sticky top-0 z-20 -mx-1 bg-background px-1" data-tour="sections">
      {/* On phones the tabs scroll sideways; the fade at the right edge shows there is more */}
      <div role="tablist" aria-label="Assessment sections" onKeyDown={onKey}
        className="flex gap-0.5 overflow-x-auto border-b border-border max-sm:[mask-image:linear-gradient(to_right,#000_85%,transparent)] sm:gap-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={value === id} aria-controls="section-panel"
            tabIndex={value === id ? 0 : -1} onClick={() => onChange(id)}
            className={cn("flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[16px] transition-colors sm:px-3",
              value === id ? "border-foreground font-bold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4 max-sm:hidden" aria-hidden /> {label}
            {dot[id] && <span className="size-2 rounded-full" style={{ background: toneVar[dot[id]!] }} aria-hidden />}
            {dot[id] && <span className="sr-only">({DOT_WORD[dot[id]!]})</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
