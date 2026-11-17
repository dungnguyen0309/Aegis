"use client";

import {
  ArrowRightIcon, CrosshairIcon, CubeIcon, FunnelIcon, GridFourIcon, SpinnerGapIcon, SquaresFourIcon, TableIcon, XIcon,
} from "@phosphor-icons/react";
import { lazy3D, VIEW_H } from "@/components/three/lazy";
import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CopyLink } from "@/components/copy-link";
import { Segmented } from "@/components/corridor-panel";
import { PageHeader, Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductArt } from "@/components/product-art";
import { StatusBadge, ToneIcon } from "@/components/status";
import { Flag, regionName, To } from "@/components/visuals";
import { api, ApiUnavailable } from "@/lib/api";
import { bandTone, change, hsCode, money, times, ytdLabel, NONE } from "@/lib/format";
import { usePersisted } from "@/lib/persisted";
import type { Band, Radar, RadarCell } from "@/lib/types";
import { readRadar, writeRadar, type RadarFilters, type RadarKey } from "@/lib/url-state";
import { useIntent } from "@/lib/use-intent";
import { useReconnect } from "@/lib/use-reconnect";
import { cn } from "@/lib/utils";

const Skyline3D = lazy3D(() => import("@/components/three/skyline-3d").then((m) => m.Skyline3D), "Risk skyline", VIEW_H.skyline);

const EXPORTERS = [{ code: "DE", name: "Germany" }, { code: "EU27_2020", name: "EU-27" }];
type Corridor = RadarCell & { hs: string; description: string; tier: string };
const crit = (c: Corridor) => Number(c.band === "CRITICAL");
type Mode = "goods" | "table" | "heatmap" | "3d";
type Facet = Exclude<RadarKey, "from">;
type Prefetch = (hs: string, partner: string) => void;

const FACETS: Facet[] = ["risk", "tier", "to", "signal", "item"];
const BANDS: Band[] = ["CRITICAL", "HIGH", "MODERATE", "LOW"];
const SIGNALS: { key: string; label: string; test: (c: RadarCell) => boolean }[] = [
  { key: "fell", label: "Direct exports to Russia fell", test: (c) => c.diversion },
  { key: "new", label: "New flow since 2022", test: (c) => c.emergent },
  { key: "x2", label: "At least 2× pre-war", test: (c) => (c.multiplier ?? 0) >= 2 },
];
const valueOf: Record<Exclude<Facet, "signal">, (c: Corridor) => string> = {
  risk: (c) => c.band, tier: (c) => c.tier, to: (c) => c.partner, item: (c) => c.hs,
};
const EMPTY: RadarFilters = { from: [], risk: [], tier: [], to: [], signal: [], item: [] };
const key = (c: { hs: string; partner: string }) => `${c.hs}-${c.partner}`;
const word = (b: Band) => b[0] + b.slice(1).toLowerCase();

/** Values within a filter widen the set (or); filters narrow it (and). `skip` leaves one out, for its own counts. */
function matches(c: Corridor, f: RadarFilters, skip?: Facet) {
  return FACETS.every((k) => {
    if (k === skip || !f[k].length) return true;
    if (k === "signal") return f.signal.some((s) => SIGNALS.find((x) => x.key === s)?.test(c));
    return f[k].includes(valueOf[k](c));
  });
}

/** A navy ramp (red is kept for Stop); it stops at 60%, where the theme's own text still reads at 5:1 in light and dark. */
function cellStyle(score: number) {
  return {
    background: `color-mix(in srgb, var(--heat) ${Math.round(4 + score * 0.56)}%, var(--card))`,
    color: "var(--foreground)",
  };
}

/** Exports per year as small labelled bars: grey before 2022, accent after. */
function YearBars({ values, years }: { values: number[]; years: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div>
      <div className="flex h-16 items-end gap-0.5" role="img"
        aria-label={`Exports per year, ${years[0]} to ${years.at(-1)}: ${values.map((v, i) => `${years[i]} ${money(v)}`).join(", ")}`}>
        {values.map((v, i) => (
          <div key={years[i]} className="flex-1" title={`${years[i]}: ${money(v)}`}
            style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: years[i] < 2022 ? "var(--chart-baseline)" : "var(--series-1)" }} />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-xs text-muted-foreground">
        <span className="absolute left-0">{years[0]}</span>
        {years.includes(2022) && (
          <span className="absolute -translate-x-1/2" style={{ left: `${((years.indexOf(2022) + 0.5) / years.length) * 100}%` }}>2022</span>
        )}
        <span className="absolute right-0">{years.at(-1)}</span>
      </div>
    </div>
  );
}

/** One filter: a checkbox per value with the count it would give. Long lists get a search box. */
function FacetGroup({ title, options, selected, onToggle, search }: {
  title: string;
  options: { value: string; label: ReactNode; text: string; n: number }[];
  selected: string[];
  onToggle: (v: string) => void;
  search?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const list = q.trim() ? options.filter((o) => o.text.toLowerCase().includes(q.trim().toLowerCase())) : options;
  // The aside already scrolls: show a short list (ticked options always stay) instead of a second scroll area
  const LIMIT = 8;
  const shown = all || q.trim() ? list : list.filter((o, i) => i < LIMIT || selected.includes(o.value));
  return (
    <div role="group" aria-labelledby={id} className="border-t border-border py-3">
      <h3 id={id} className="mb-1.5 text-base font-bold">{title}</h3>
      {search && (
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or name"
          aria-label={`Search ${title.toLowerCase()}`} className="mb-1.5 h-7 px-2" />
      )}
      <ul className="space-y-0.5">
        {shown.map((o) => {
          const checked = selected.includes(o.value);
          const none = o.n === 0 && !checked;
          return (
            <li key={o.value}>
              <label className={cn("flex items-center gap-2 py-0.5 text-sm leading-tight pointer-coarse:py-3", none ? "text-faint" : "cursor-pointer hover:text-foreground")}>
                <input type="checkbox" checked={checked} disabled={none} onChange={() => onToggle(o.value)} className="size-3.5 shrink-0 accent-foreground" />
                <span className="flex min-w-0 flex-1 items-center gap-1.5" title={o.text}>{o.label}</span>
                <span className="shrink-0 text-sm text-faint">{o.n}</span>
              </label>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-sm text-faint">{`No matches for "${q.trim()}"`}</li>}
      </ul>
      {!q.trim() && list.length > LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
          className="mt-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline pointer-coarse:py-3">
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}

/** The listed goods by tier, each with the number of matching corridors. Picking one opens its corridors. */
function Catalogue({ rows, tiers, shown, onPick }: {
  rows: Radar["rows"];
  tiers: Record<string, string> | undefined;
  shown: Corridor[];
  onPick: (hs: string) => void;
}) {
  const stats = new Map<string, { n: number; top: Corridor }>();
  for (const c of shown) {
    const s = stats.get(c.hs);
    if (!s) stats.set(c.hs, { n: 1, top: c });
    else { s.n += 1; if (c.score > s.top.score) s.top = c; }
  }
  const groups = new Map<string, Radar["rows"]>();
  for (const r of rows) if (stats.has(r.hs)) groups.set(r.tier, [...(groups.get(r.tier) ?? []), r]);
  return (
    <div className="space-y-5">
      {[...groups].map(([tier, items]) => (
        <section key={tier} aria-label={`Tier ${tier}`}>
          <h3 className="mb-2 text-base font-bold">
            Tier {tier} {tiers?.[tier] && <span className="font-normal text-muted-foreground">{tiers[tier]}</span>}
          </h3>
          <ul className="grid border-l border-t border-border sm:grid-cols-2 2xl:grid-cols-3">
            {items.map((r) => {
              const s = stats.get(r.hs)!;
              return (
                <li key={r.hs} className="border-b border-r border-border">
                  <button type="button" onClick={() => onPick(r.hs)}
                    className="flex h-full w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                    <ProductArt hs={r.hs} size={44} />
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{r.hs}</span>
                      <span className="line-clamp-2 text-sm leading-snug">{r.description}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <ToneIcon tone={bandTone[s.top.band]} className="size-3.5" />
                        {s.n} route{s.n === 1 ? "" : "s"} · highest {s.top.score}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Every matching corridor, grouped by item under a heading that stays in view while its rows scroll. */
function CorridorTable({ rows, shown, year, ytdName, onAssess, onPrefetch }: {
  rows: Radar["rows"];
  shown: Corridor[];
  year: number | undefined;
  ytdName: string | null;
  onAssess: (hs: string, partner: string) => void;
  onPrefetch: Prefetch;
}) {
  const intent = useIntent();
  const byItem = new Map<string, Corridor[]>();
  for (const c of shown) byItem.set(c.hs, [...(byItem.get(c.hs) ?? []), c]);
  const head = "border-b border-border px-3 font-bold";
  const cell = "border-b border-border px-3 py-1";
  const [all, setAll] = useState(false);
  const items = rows.filter((r) => byItem.has(r.hs));
  const SHOWN_ITEMS = 10;
  return (
    <>
    <div className="@container max-h-170 scroll-pl-52 scroll-pt-27 overflow-auto">
      <table className="w-full min-w-170 border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-card text-sm leading-tight">
          <tr className="h-11">
            <th scope="col" className={cn(head, "sticky left-0 z-20 min-w-52 bg-card text-left")}>Transit country</th>
            <th scope="col" className={cn(head, "text-right")}>Route risk</th>
            <th scope="col" className={cn(head, "text-right")}>Exports vs pre-war<div className="font-normal text-faint">2017–21</div></th>
            <th scope="col" className={cn(head, "text-right")}>{year ?? "Latest"} exports</th>
            <th scope="col" className={cn(head, "text-right")}>{ytdName ?? "Year so far vs 2021"}</th>
            <th scope="col" className={cn(head, "text-left")}>Direct exports to Russia fell</th>
            <th scope="col" className={head}><span className="sr-only">Assess</span></th>
          </tr>
        </thead>
        <tbody>
          {(all ? items : items.slice(0, SHOWN_ITEMS)).map((r) => (
            <Fragment key={r.hs}>
              <tr>
                <th colSpan={7} scope="colgroup" className="sticky top-11 z-5 border-b border-border bg-muted px-3 py-1.5 text-left font-normal">
                  {/* As wide as the visible box and pinned to its left edge, so the item stays named after scrolling right */}
                  <span className="sticky left-3 flex w-[calc(100cqw_-_1.5rem)] items-center gap-2">
                    <ProductArt hs={r.hs} size={22} />
                    <span className="font-bold">{r.hs}</span>
                    <span className="min-w-0 truncate">{r.description}</span>
                    <span className="ml-auto shrink-0 text-sm text-muted-foreground">Tier {r.tier}</span>
                  </span>
                </th>
              </tr>
              {byItem.get(r.hs)!.sort((a, b) => b.score - a.score).map((c) => (
                <tr key={c.partner} className="hover:bg-muted/40">
                  <td className={cn(cell, "sticky left-0 z-1 bg-card")}><span className="flex items-center gap-2"><Flag code={c.partner} size={16} />{regionName(c.partner)}</span></td>
                  <td className={cn(cell, "text-right")}>
                    <span className="inline-flex items-center gap-1.5">
                      <ToneIcon tone={bandTone[c.band]} className="size-3.5" /><b>{c.score}</b>
                      <span className="w-18 text-left text-muted-foreground">{word(c.band)}</span>
                    </span>
                  </td>
                  <td className={cn(cell, "text-right")}>{c.multiplier !== null ? times(c.multiplier) : c.emergent ? "New flow" : NONE}</td>
                  <td className={cn(cell, "text-right")}>{money(c.latest)}</td>
                  <td className={cn(cell, "text-right")}>{change(c.ytd)}</td>
                  <td className={cell}>{c.diversion ? "Yes" : "No"}</td>
                  <td className={cn(cell, "text-right")}>
                    <Button size="xs" variant="ghost" onClick={() => onAssess(c.hs, c.partner)} {...intent.on(() => onPrefetch(c.hs, c.partner))}
                      aria-label={`Assess HS ${c.hs} to ${regionName(c.partner)}`}>
                      Assess <ArrowRightIcon />
                    </Button>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
    {/* A toggle, not a one-off button, so keyboard focus stays on it after the table grows */}
    {items.length > SHOWN_ITEMS && (
      <div className="border-t border-border px-3 py-2">
        <Button size="sm" variant="outline" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? `Show first ${SHOWN_ITEMS} items` : `Show all ${items.length} items (${shown.length} routes)`}
        </Button>
      </div>
    )}
    </>
  );
}

/**
 * The 600-cell heatmap. Memoized: hovering a cell updates the side panel without re-rendering the table.
 */
const Heatmap = memo(function Heatmap({ rows, partners, on, onHover, onAssess, onPrefetch }: {
  rows: Radar["rows"];
  partners: Radar["partners"];
  on: Set<string> | null;
  onHover: (c: Corridor) => void;
  onAssess: (hs: string, partner: string) => void;
  onPrefetch: Prefetch;
}) {
  const [focused, setCur] = useState("0-0"); // the one cell in the tab order: the last one focused
  const [fi, fj] = focused.split("-").map(Number);
  const cur = fi < rows.length && fj < partners.length ? focused : "0-0"; // filtering can remove it
  const intent = useIntent();
  return (
    <div className="max-h-170 scroll-pl-59 scroll-pt-13.25 overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-sm" onKeyDown={(e) => {
        const at = (e.target as HTMLElement).dataset.cell?.split("-").map(Number);
        const step = ({ ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] } as Record<string, number[]>)[e.key];
        if (!at || !step) return;
        const next = e.currentTarget.querySelector<HTMLButtonElement>(`[data-cell="${at[0] + step[0]}-${at[1] + step[1]}"]`);
        if (next) {
          e.preventDefault();
          next.focus({ preventScroll: true });
          next.scrollIntoView({ block: "nearest", inline: "nearest" }); // honours the scroll padding for the sticky header and column
        }
      }}>
        <thead className="sticky top-0 z-10 bg-card">
          <tr>
            <th className="sticky left-0 z-20 min-w-57.5 border-b border-border bg-card px-3 py-2 text-left">Item</th>
            {partners.map((p) => (
              <th key={p.code} className="border-b border-border px-1 py-2 font-normal" title={p.name}>
                <div className="flex flex-col items-center gap-0.5">
                  <Flag code={p.code} size={18} />
                  <span className="text-sm text-muted-foreground">{p.code}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.hs}>
              <th className="sticky left-0 z-5 border-b border-border bg-card px-3 py-1 text-left font-normal">
                <div className="flex items-center gap-2">
                  <ProductArt hs={r.hs} size={24} />
                  <div className="min-w-0">
                    <div className="font-bold">{r.hs} <span className="font-normal text-faint">Tier {r.tier}</span></div>
                    <div className="max-w-45 truncate text-muted-foreground" title={r.description}>{r.description}</div>
                  </div>
                </div>
              </th>
              {r.cells.map((c, j) => {
                const corridor = { ...c, hs: r.hs, description: r.description, tier: r.tier };
                const match = !on || on.has(key(corridor));
                return (
                  <td key={c.partner} className="border-b border-border p-0.5">
                    <button type="button" data-cell={`${i}-${j}`} tabIndex={cur === `${i}-${j}` ? 0 : -1}
                      style={match ? cellStyle(c.score) : { background: "var(--card)", color: "var(--faint-foreground)" }}
                      onMouseEnter={() => { onHover(corridor); intent.start(() => onPrefetch(r.hs, c.partner)); }}
                      onMouseLeave={intent.stop}
                      onFocus={() => { setCur(`${i}-${j}`); onHover(corridor); intent.start(() => onPrefetch(r.hs, c.partner)); }}
                      onBlur={intent.stop}
                      onClick={() => { intent.stop(); onAssess(r.hs, c.partner); }}
                      aria-label={`Assess HS ${r.hs} to ${regionName(c.partner)}: route risk ${c.score} ${word(c.band)}${match ? "" : ", outside the filters"}`}
                      className="block h-7 w-full min-w-10 pointer-coarse:h-11 pointer-coarse:min-w-11 text-center font-bold outline-none ring-inset transition-shadow hover:ring-2 hover:ring-foreground focus-visible:ring-2 focus-visible:ring-ring">
                      {c.score}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export function RadarView({ onAssess, onPrefetch, tiers }: {
  onAssess: (hs: string, partner: string, exporter: string) => void;
  onPrefetch?: (hs: string, partner: string, exporter: string) => void;
  tiers?: Record<string, string>;
}) {
  const [filters, setFilters] = useState<RadarFilters>(() => (typeof window === "undefined" ? EMPTY : readRadar(window.location.search)));
  const exporter = EXPORTERS.some((x) => x.code === filters.from[0]) ? filters.from[0] : "DE";
  const [data, setData] = useState<Radar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sort, setSort] = useState<"tier" | "risk">("tier");
  const [hover, setHover] = useState<Corridor | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Touch screens get the heatmap first: the 3D skyline needs hover to read
  // The heatmap is the readable overview on every device; 3D stays one click away
  const [mode, setMode] = usePersisted<Mode>("aegis-radar-view", "heatmap", ["goods", "table", "3d", "heatmap"]);
  const topIntent = useIntent();

  useEffect(() => {
    let live = true;
    api.radar(exporter)
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e: Error) => {
        if (!live) return;
        setError(e.message);
        if (e instanceof ApiUnavailable) setOffline(true);
      });
    return () => { live = false; };
  }, [exporter, attempt]);

  useReconnect(offline, () => {
    setOffline(false);
    setAttempt((n) => n + 1);
  });

  // Back and Forward step through filter changes, as on a catalogue
  useEffect(() => {
    const onPop = () => {
      setFilters(readRadar(window.location.search));
      const m = (window.history.state as { radarMode?: Mode } | null)?.radarMode;
      if (m) setMode(m);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setMode]);

  const countRef = useRef<HTMLSpanElement>(null);
  const changed = useRef(false);
  // The control that was used may disappear (a chip, a tile, Clear all): keep focus on the result count
  useEffect(() => {
    if (changed.current && (!document.activeElement || document.activeElement === document.body)) countRef.current?.focus();
    changed.current = false;
  }, [filters]);
  const update = (next: RadarFilters, state: Record<string, unknown> | null = null) => {
    changed.current = true;
    setFilters(next);
    writeRadar(next, state);
  };
  // Picking a goods tile opens its table; Back returns to the goods
  const pick = (hs: string) => {
    window.history.replaceState({ ...window.history.state, radarMode: mode }, "");
    update({ ...filters, item: [hs] }, { radarMode: "table" });
    setMode("table");
  };
  const toggle = (k: Facet, v: string) =>
    update({ ...filters, [k]: filters[k].includes(v) ? filters[k].filter((x) => x !== v) : [...filters[k], v] });
  const clear = () => update({ ...EMPTY, from: filters.from });

  const ready = data && data.exporter === exporter ? data : null;
  const ytdName = ready?.latest_month ? ytdLabel(ready.latest_month.slice(0, 4), Number(ready.latest_month.slice(5))) : null;
  const all = useMemo<Corridor[]>(() => (ready
    ? ready.rows.flatMap((r) => r.cells.map((c) => ({ ...c, hs: r.hs, description: r.description, tier: r.tier })))
    : []), [ready]);
  const shown = useMemo(() => all.filter((c) => matches(c, filters)), [all, filters]);
  const on = useMemo(() => (shown.length === all.length ? null : new Set(shown.map(key))), [shown, all]);
  // Critical routes always lead; below that, small pre-war bases go last (a 900× ratio on a few thousand euros is weak)
  const ranked = useMemo(() => [...shown].sort((a, b) => crit(b) - crit(a) ||
    Number(a.small_base) - Number(b.small_base) || b.score - a.score || b.latest - a.latest), [shown]);
  const top = ranked.slice(0, 9);
  const moreCritical = ranked.slice(9).filter(crit).length;

  // Each filter's counts follow the other filters, so a count says what ticking that box would give
  const counts = useMemo(() => {
    const out = {} as Record<Facet, Map<string, number>>;
    for (const k of FACETS) {
      const m = new Map<string, number>();
      for (const c of all) {
        if (!matches(c, filters, k)) continue;
        const values = k === "signal" ? SIGNALS.filter((s) => s.test(c)).map((s) => s.key) : [valueOf[k](c)];
        for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
      }
      out[k] = m;
    }
    return out;
  }, [all, filters]);

  // Heatmap and skyline: the items and countries with at least one match, in the chosen order
  const matrix = useMemo(() => {
    if (!ready) return null;
    const items = new Set(shown.map((c) => c.hs)), places = new Set(shown.map((c) => c.partner));
    const cols = ready.partners.map((p, j) => (places.has(p.code) ? j : -1)).filter((j) => j >= 0);
    const rows = ready.rows.filter((r) => items.has(r.hs)).map((r) => ({ ...r, cells: cols.map((j) => r.cells[j]) }));
    const best = new Map<string, number>(); // highest score within the filters, not over all countries
    for (const c of shown) best.set(c.hs, Math.max(best.get(c.hs) ?? 0, c.score));
    return {
      data: { ...ready, partners: cols.map((j) => ready.partners[j]) },
      rows: sort === "risk" ? rows.sort((a, b) => best.get(b.hs)! - best.get(a.hs)!) : rows,
    };
  }, [ready, shown, sort]);

  // Stable callbacks so the memoized heatmap and skyline do not re-render on hover
  const assess = useCallback((hs: string, partner: string) => onAssess(hs, partner, exporter), [onAssess, exporter]);
  const prefetch = useCallback((hs: string, partner: string) => onPrefetch?.(hs, partner, exporter), [onPrefetch, exporter]);
  // A hovered corridor belongs to the exporter it was hovered under
  const [hoverFor, setHoverFor] = useState(ready);
  if (hoverFor !== ready) { setHoverFor(ready); setHover(null); }
  const detail = hover && (!on || on.has(key(hover))) ? hover : top[0] ?? null;

  const n = (k: Facet, v: string) => counts[k].get(v) ?? 0;
  const chips: { k: Facet; v: string; text: string }[] = FACETS.flatMap((k) => filters[k].map((v) => ({
    k, v,
    text: k === "risk" ? word(v as Band) : k === "tier" ? `Tier ${v}` : k === "to" ? regionName(v)
      : k === "signal" ? SIGNALS.find((s) => s.key === v)?.label ?? v : `HS ${hsCode(v)}`,
  })));

  return (
    <div className="space-y-4">
      <PageHeader title="Radar" tour="radar"
        description={`${data?.rows.length ?? 50} items × ${data?.partners.length ?? 12} transit countries`}
        actions={
          <Segmented label="Exporter" value={exporter} onChange={(code) => update({ ...filters, from: code === "DE" ? [] : [code] })}
            options={EXPORTERS.map((x) => ({ value: x.code, label: x.name, icon: <Flag code={x.code} size={14} /> }))} />
        } />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!ready || !matrix ? (
        <div className="grid h-64 place-items-center border border-border bg-card text-sm text-muted-foreground">
          {error && !offline ? "Routes not loaded. Reload the page to try again." : <span className="flex items-center gap-2" role="status"><SpinnerGapIcon className="size-4 animate-spin" aria-hidden /> {offline ? "Reconnecting…" : "Scoring routes…"}</span>}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside aria-label="Filters" className="lg:sticky lg:top-header lg:max-h-[calc(100dvh-var(--spacing-header)-1rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <Button variant="outline" size="sm" className="lg:hidden" aria-expanded={filtersOpen} aria-controls="radar-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}>
              <FunnelIcon /> Filters{chips.length > 0 && ` (${chips.length})`}
            </Button>
            <div id="radar-filters" className={cn("max-lg:mt-2", !filtersOpen && "max-lg:hidden")}>
              <div className="flex items-baseline justify-between pb-2">
                <h2 className="text-base font-bold">Filters</h2>
                {chips.length > 0 && (
                  <button type="button" onClick={clear} className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground pointer-coarse:py-3">Clear all</button>
                )}
              </div>
              <FacetGroup title="Route risk" selected={filters.risk} onToggle={(v) => toggle("risk", v)}
                options={BANDS.map((b) => ({ value: b, text: word(b), n: n("risk", b), label: <><ToneIcon tone={bandTone[b]} className="size-3.5" />{word(b)}</> }))} />
              <FacetGroup title="Tier" selected={filters.tier} onToggle={(v) => toggle("tier", v)}
                options={[...new Set(ready.rows.map((r) => r.tier))].map((t) => ({
                  value: t, n: n("tier", t), text: `Tier ${t}${tiers?.[t] ? `: ${tiers[t]}` : ""}`, label: <span className="truncate">Tier {t}</span>,
                }))} />
              <FacetGroup title="Transit country" selected={filters.to} onToggle={(v) => toggle("to", v)}
                options={ready.partners.map((p) => ({ value: p.code, text: p.name, n: n("to", p.code), label: <><Flag code={p.code} size={14} /><span className="truncate">{p.name}</span></> }))} />
              <FacetGroup title="Signals" selected={filters.signal} onToggle={(v) => toggle("signal", v)}
                options={SIGNALS.map((s) => ({ value: s.key, text: s.label, n: n("signal", s.key), label: s.label }))} />
              <FacetGroup title="Item" search selected={filters.item} onToggle={(v) => toggle("item", v)}
                options={ready.rows.map((r) => ({
                  value: r.hs, text: `${r.hs} ${r.description}`, n: n("item", r.hs),
                  label: <><span>{r.hs}</span><span className="truncate text-muted-foreground">{r.description}</span></>,
                }))} />
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border pb-2 text-sm">
              <span ref={countRef} tabIndex={-1} className="font-bold outline-none" role="status">{shown.length} of {all.length} routes</span>
              {chips.map((c) => (
                <button key={c.k + c.v} type="button" onClick={() => toggle(c.k, c.v)} aria-label={`Remove filter: ${c.text}`}
                  className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-sm hover:border-ring pointer-coarse:min-h-11 pointer-coarse:px-3">
                  {c.text} <XIcon className="size-3" />
                </button>
              ))}
              <CopyLink size="xs" className="ml-auto" />
            </div>

            {shown.length === 0 ? (
              <div className="grid h-48 place-items-center border border-border bg-card text-center text-sm text-muted-foreground">
                <div className="space-y-2">
                  <p>No routes match these filters.</p>
                  <Button size="sm" variant="outline" onClick={clear}>Clear all filters</Button>
                </div>
              </div>
            ) : (
              <>
                <Panel title="Highest-risk routes" subtitle="Critical first, then by route risk. Routes with a pre-war base under €100k a year come after the others.">
                  <div className="grid grid-cols-[minmax(0,1fr)] border-l border-t border-border sm:grid-cols-2 xl:grid-cols-3">
                    {top.map((c) => (
                      <button key={key(c)} type="button" onClick={() => assess(c.hs, c.partner)} {...topIntent.on(() => prefetch(c.hs, c.partner))}
                        className="flex items-start gap-3 border-b border-r border-border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                        <ProductArt hs={c.hs} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-base font-bold leading-snug" title={c.description}>{c.description}</div>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <span>HS {hsCode(c.hs)}</span> <To /> <Flag code={c.partner} size={14} /> <span className="text-foreground">{regionName(c.partner)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <StatusBadge tone={bandTone[c.band]}>{`${c.score} ${word(c.band)}`}</StatusBadge>
                            <span>{c.multiplier !== null ? `Exports vs pre-war: ${times(c.multiplier)}` : c.emergent ? "Exports vs pre-war: New flow" : "No baseline"}</span>
                            {c.ytd !== null && ytdName && <span className="text-muted-foreground">{ytdName}: {change(c.ytd)}</span>}
                          </div>
                          {c.small_base && (
                            <div className="mt-0.5 text-sm text-muted-foreground">Small pre-war base: under €100k a year</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  {moreCritical > 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">{moreCritical} more Critical route{moreCritical === 1 ? "" : "s"} in All routes below.</p>
                  )}
                </Panel>

                <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", (mode === "heatmap" || mode === "3d") && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
                  <Panel title={mode === "goods" ? "Items" : "All routes"} tour="skyline"
                    bodyClassName={mode === "heatmap" || mode === "table" ? "p-0" : undefined}
                    subtitle={mode === "goods" ? "EU battlefield item list, by tier" : mode === "3d" ? "Bar height and colour: route risk" : undefined}
                    action={<>
                      {mode !== "goods" && <Segmented label="Sort" value={sort} onChange={setSort} options={[{ value: "tier", label: "By tier" }, { value: "risk", label: "By route risk" }]} />}
                      <Segmented label="Show" value={mode} onChange={setMode} options={[
                        { value: "heatmap", label: "Heatmap", icon: <GridFourIcon className="size-4" /> },
                        { value: "goods", label: "Items", icon: <SquaresFourIcon className="size-4" /> },
                        { value: "table", label: "Table", icon: <TableIcon className="size-4" /> },
                        { value: "3d", label: "3D", icon: <CubeIcon className="size-4" /> },
                      ]} />
                    </>}>
                    {mode === "goods" ? (
                      <Catalogue rows={ready.rows} tiers={tiers} shown={shown} onPick={pick} />
                    ) : mode === "table" ? (
                      <CorridorTable rows={matrix.rows} shown={shown} year={ready.years.at(-1)} ytdName={ytdName}
                        onAssess={assess} onPrefetch={prefetch} />
                    ) : mode === "3d" ? (
                      <Skyline3D data={matrix.data} rows={matrix.rows} byTier={sort === "tier"} on={on} onHover={setHover} onAssess={assess} />
                    ) : (
                      <>
                        <Heatmap rows={matrix.rows} partners={matrix.data.partners} on={on} onHover={setHover} onAssess={assess} onPrefetch={prefetch} />
                        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground">
                          Route risk 0
                          <span className="h-2.5 w-40" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--heat) 4%, var(--card)), color-mix(in srgb, var(--heat) 60%, var(--card)))" }} />
                          100
                          {on && <span className="ml-3">Pale: outside filters</span>}
                        </div>
                      </>
                    )}
                  </Panel>

                  {(mode === "heatmap" || mode === "3d") && (
                    <div className="xl:sticky xl:top-header xl:self-start xl:border-l xl:border-border xl:pl-4">
                      {/* On wide screens a plain side column, like the filters, not a card that ends short of the heatmap */}
                      <Panel title="Selected route" className="xl:border-0 xl:bg-transparent" headerClassName="xl:px-0 xl:pt-0" bodyClassName="xl:px-0">
                        {detail && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <ProductArt hs={detail.hs} size={56} />
                              <div>
                                <div className="text-lg font-bold">HS {hsCode(detail.hs)}</div>
                                <div className="text-sm text-muted-foreground">{detail.description}</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-base font-bold">
                              <Flag code={exporter} /> {ready.exporter_name} <To /> <Flag code={detail.partner} /> {regionName(detail.partner)}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge tone={bandTone[detail.band]}>{detail.band}</StatusBadge>
                              <span className="text-2xl font-bold">{detail.score}</span>
                              <span className="text-muted-foreground">/ 100</span>
                            </div>
                            <dl className="grid grid-cols-2 gap-2 text-sm">
                              <dt className="text-muted-foreground">Exports vs pre-war</dt>
                              <dd className="text-right font-bold">{detail.multiplier !== null ? times(detail.multiplier) : detail.emergent ? "New flow" : NONE}</dd>
                              <dt className="text-muted-foreground">{ready.years.at(-1)} exports</dt>
                              <dd className="text-right font-bold">{money(detail.latest)}</dd>
                              <dt className="text-muted-foreground">{ytdName ?? "Year so far vs 2021"}</dt>
                              <dd className="text-right font-bold">{change(detail.ytd)}</dd>
                              <dt className="text-muted-foreground">Direct exports to Russia fell</dt>
                              <dd className="text-right font-bold">{detail.diversion ? "Yes" : "No"}</dd>
                            </dl>
                            <div>
                              <div className="mb-1 text-sm text-muted-foreground">Exports per year (grey: pre-war)</div>
                              <YearBars values={detail.spark} years={ready.years} />
                            </div>
                            <Button className="w-full" onClick={() => assess(detail.hs, detail.partner)} {...topIntent.on(() => prefetch(detail.hs, detail.partner))}>
                              <CrosshairIcon /> Assess route
                            </Button>
                          </div>
                        )}
                      </Panel>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
