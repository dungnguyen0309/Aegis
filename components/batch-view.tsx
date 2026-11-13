"use client";

import { ArrowRightIcon, CubeIcon, DownloadSimpleIcon, ListChecksIcon, SpinnerGapIcon, TableIcon, UploadSimpleIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { lazy3D } from "@/components/three/lazy";
import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Segmented } from "@/components/corridor-panel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Panel } from "@/components/panel";
import { ProductArt } from "@/components/product-art";
import { sentenceCase, StatusBadge } from "@/components/status";
import { CompanyMark, Flag } from "@/components/visuals";
import { api } from "@/lib/api";
import { entityLabel, entityTone, verdictSolid, verdictTone, routeStatus } from "@/lib/format";
import { useIntent } from "@/lib/use-intent";
import { cn } from "@/lib/utils";
import type { BatchResult, BatchRowIn, BatchRowOut, VerdictCode } from "@/lib/types";

const RiskCube3D = lazy3D(() => import("@/components/three/risk-cube-3d").then((m) => m.RiskCube3D), "Risk cube", "h-[360px] sm:h-[440px]");

const SAMPLE = `company,country,hs,intermediary
Northwind Components LLP,KZ,848210,KZ
Contoso Electronics LLC,KG,854239,KG
OOO Радиоавтоматика,RU,854231,AM
Fabrikam Trading FZE,AE,854231,AE
Adventure Works Trading,TR,851762,TR
Wide World Importers,AM,854232,AM
Tailspin Toys GmbH,DE,950300,
Kalashnikov Concern,RU,,`;

/** What parseCsv and the /batch endpoint read from each column. */
const COLUMNS = [
  ["company", "Yes", "Buyer name, any script", "Northwind Components LLP"],
  ["country", "No", "Buyer country, two-letter code", "KZ"],
  ["hs", "No", "Six-digit HS code. Needed for route risk", "848210"],
  ["intermediary", "No", "Transit country, two-letter code. If blank, the buyer country is used", "KZ"],
];

function SanctionsCell({ r }: { r: BatchRowOut }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge tone={entityTone[r.entity_status]}>{entityLabel[r.entity_status]}</StatusBadge>
      {r.best_match && r.entity_status !== "CLEAN" && (
        <span className="text-muted-foreground">{r.best_match} · {r.best_lists.join(", ")} · {r.best_similarity?.toFixed(0)}%</span>
      )}
    </div>
  );
}

function ItemCell({ r }: { r: BatchRowOut }) {
  return r.hs ? (
    <div className="flex items-center gap-2">
      <ProductArt hs={r.hs} size={24} />
      <span className="tabular">{r.hs}</span>
      <span className="text-muted-foreground">{r.chpl_tier ? `Tier ${r.chpl_tier}` : "Not on item list"}</span>
    </div>
  ) : <span className="text-faint">—</span>;
}

/** What the server could not use from this row, so a partial result is never mistaken for a full one. */
function Issues({ r }: { r: BatchRowOut }) {
  if (!r.issues.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[15px] text-warning-ink">
      {r.issues.map((t) => <li key={t} className="flex gap-1.5"><WarningIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t}</li>)}
    </ul>
  );
}

function RouteCell({ r }: { r: BatchRowOut }) {
  return r.route_score !== null && r.route_band && r.intermediary ? (
    <div className="flex items-center gap-2">
      <Flag code={r.intermediary} size={14} />
      <StatusBadge tone={routeStatus(r.route_band, r.route_no_baseline).tone}>{`${r.route_score} ${routeStatus(r.route_band, r.route_no_baseline).label}`}</StatusBadge>
    </div>
  ) : <span className="text-faint">—</span>;
}

/** Minimal CSV parser: commas, quoted fields, optional header row. Counts the rows it leaves out. */
function parseCsv(text: string): { rows: BatchRowIn[]; short: number; extra: number } {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
      } else if ((ch === "," || ch === ";" || ch === "\t") && !quoted) {
        cells.push(cur.trim()); cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  if (!rows.length) return { rows: [], short: 0, extra: 0 };
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.includes("company");
  const idx = (name: string, fallback: number) => (hasHeader ? header.indexOf(name) : fallback);
  const [ci, co, hs, im] = [idx("company", 0), idx("country", 1), idx("hs", 2), idx("intermediary", 3)];
  const all = (hasHeader ? rows.slice(1) : rows)
    .map((r) => ({ company: r[ci] ?? "", country: co >= 0 ? r[co] : undefined, hs: hs >= 0 ? r[hs] : undefined, intermediary: im >= 0 ? r[im] : undefined }));
  const named = all.filter((r) => r.company.length >= 2);
  return { rows: named.slice(0, 200), short: all.length - named.length, extra: Math.max(0, named.length - 200) };
}

function toCsv(result: BatchResult): string {
  const head = ["verdict", "company", "country", "sanctions_status", "best_match", "lists", "similarity", "hs", "chpl_tier", "intermediary", "route_score", "route_band", "route_no_baseline", "issues"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = result.rows.map((r) => [r.verdict, r.company, r.country, r.entity_status, r.best_match, r.best_lists.join(" "),
    r.best_similarity, r.hs, r.chpl_tier, r.intermediary, r.route_score, r.route_band, r.route_no_baseline, r.issues.join(" ")].map(esc).join(","));
  return [head.join(","), ...lines].join("\n");
}

/** Kept by the dashboard so results survive switching views (e.g. after opening a row's assessment). */
export interface BatchState {
  text: string;
  result: BatchResult | null;
  /** The text the result was screened from: when it differs from `text`, the result is out of date. */
  ran?: string;
}

export function BatchView({ state, onState, onAssess, onPrefetch }: {
  state: BatchState;
  onState: Dispatch<SetStateAction<BatchState>>;
  onAssess?: (r: BatchRowOut) => void;
  onPrefetch?: (r: BatchRowOut) => void;
}) {
  const intent = useIntent();
  const { text, result } = state;
  const setText = (t: string) => onState((s) => ({ ...s, text: t }));
  const setResult = (r: BatchResult | null, ran: string) => onState((s) => ({ ...s, result: r, ran }));
  const [mode, setMode] = useState<"table" | "3d">("table");
  const [only, setOnly] = useState<VerdictCode | null>(null);
  const shown = useMemo(() => (result ? result.rows.filter((r) => !only || r.verdict === only) : []), [result, only]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { rows, short, extra } = parseCsv(text);
  const stale = result !== null && state.ran !== undefined && text !== state.ran;
  const flagged = result ? result.rows.filter((r) => r.issues.length).length : 0;

  const run = async () => {
    const screened = text;
    setLoading(true);
    setError(null);
    setOnly(null);
    try {
      setResult(await api.batch(rows, "DE"), screened);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch screening failed. Try again.");
    } finally {
      setLoading(false);
    }
  };
  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([toCsv(result)], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "aegis-batch-screening.csv" }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Batch screening" description="Up to 200 buyers" />

      <Panel title="Buyers">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false}
          placeholder="Paste CSV rows: company,country,hs,intermediary" aria-label="Buyers as CSV"
          className="w-full resize-y border border-input bg-transparent px-3 py-2 text-[15px] tabular outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" />
        {(short > 0 || extra > 0) && (
          <p className="mt-2 text-[15px] text-muted-foreground" role="status">
            {extra > 0 && `First 200 rows screened; ${extra} left out. `}
            {short > 0 && `${short} row${short === 1 ? "" : "s"} skipped: name missing or under 2 characters.`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => file.current?.click()}><UploadSimpleIcon /> Upload CSV</Button>
          <Button variant="outline" onClick={() => setText(SAMPLE)}><ListChecksIcon /> Load sample</Button>
          <Button onClick={run} disabled={loading || rows.length === 0}>
            {loading ? <SpinnerGapIcon className="animate-spin" /> : <ListChecksIcon />}
            {loading ? "Screening…" : rows.length ? `Screen ${rows.length} row${rows.length === 1 ? "" : "s"}` : "Screen buyers"}
          </Button>
          {error && <span className="text-[15px] text-destructive">{error}</span>}
        </div>
      </Panel>

      {!result && (
        <Panel title="Columns" subtitle="Header row optional" bodyClassName="p-0">
          <Table className="text-[15px]">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Column</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>What to enter</TableHead>
                <TableHead className="pr-4">Example</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COLUMNS.map(([name, needed, what, example]) => (
                <TableRow key={name}>
                  <TableCell className="pl-4 font-bold">{name}</TableCell>
                  <TableCell>{needed}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{what}</TableCell>
                  <TableCell className="whitespace-normal pr-4 tabular">{example}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}

      {result && (
        <Panel title="Results" tour="cube"
          subtitle={`${result.count} buyer${result.count === 1 ? "" : "s"}, most severe first`}
          action={<>
            <Segmented value={mode} onChange={setMode} options={[
              { value: "table", label: "Table", icon: <TableIcon className="size-4" /> },
              { value: "3d", label: "3D", icon: <CubeIcon className="size-4" /> },
            ]} />
            <Button size="sm" variant="outline" onClick={download}><DownloadSimpleIcon /> Download CSV</Button>
          </>}>
          {/* Always mounted, so screen readers announce the text when the list changes */}
          <p role="status" className={stale ? "mb-3 flex items-center gap-2 border border-[color-mix(in_srgb,var(--status-warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] px-3 py-2 text-[16px]" : "sr-only"}>
            {stale && <>
              <WarningIcon className="size-4 shrink-0 text-warning-ink" aria-hidden />
              List changed since this screening.
            </>}
          </p>
          {flagged > 0 && mode === "table" && (
            <p className="mb-3 text-[16px] text-muted-foreground">
              {flagged} row{flagged === 1 ? "" : "s"} partly checked
            </p>
          )}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(Object.keys(result.summary) as VerdictCode[]).filter((k) => result.summary[k] > 0).map((k) => (
              <button key={k} type="button" onClick={() => setOnly(only === k ? null : k)} aria-pressed={only === k}
                title={only === k ? "Show all rows" : `Show only ${sentenceCase(k)}`}
                className={cn("transition-opacity", only && only !== k && "opacity-40 hover:opacity-80")}>
                <StatusBadge tone={verdictTone[k]} solid={verdictSolid(k)}>{`${result.summary[k]} ${k}`}</StatusBadge>
              </button>
            ))}
            {only && (
              <button type="button" onClick={() => setOnly(null)} className="inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground">
                <XIcon className="size-3.5" /> Show all
              </button>
            )}
          </div>
          {mode === "3d" ? (
            <>
              <RiskCube3D rows={shown} onAssess={onAssess} />
              <p className="mt-2 text-[15px] text-muted-foreground">Diamonds: sanctions match. Shaded: Stop and Hold zones.</p>
            </>
          ) : (
          <>
          <ul className="divide-y divide-border border-y border-border md:hidden">
            {shown.map((r, i) => (
              <li key={i} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <CompanyMark name={r.company} size={24} flagged={r.entity_status !== "CLEAN"} />
                    <span className="truncate font-bold">{r.company}</span>
                    {r.country && <Flag code={r.country} size={14} />}
                  </div>
                  <StatusBadge tone={verdictTone[r.verdict]} solid={verdictSolid(r.verdict)}>{r.verdict}</StatusBadge>
                </div>
                <Issues r={r} />
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[15px]">
                  <dt className="text-muted-foreground">Sanctions screening</dt><dd><SanctionsCell r={r} /></dd>
                  <dt className="text-muted-foreground">Item</dt><dd><ItemCell r={r} /></dd>
                  <dt className="text-muted-foreground">Route risk</dt><dd><RouteCell r={r} /></dd>
                </dl>
                {onAssess && (
                  <Button size="xs" variant="outline" onClick={() => onAssess(r)} aria-label={`Assess ${r.company}`}
                    {...intent.on(() => onPrefetch?.(r))}>
                    Assess <ArrowRightIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto max-md:hidden">
            <Table className="text-[15px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Sanctions screening</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Route risk</TableHead>
                  {onAssess && <TableHead className="w-24"><span className="sr-only">Assess</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell><StatusBadge tone={verdictTone[r.verdict]} solid={verdictSolid(r.verdict)}>{r.verdict}</StatusBadge></TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex items-center gap-2">
                        <CompanyMark name={r.company} size={24} flagged={r.entity_status !== "CLEAN"} />
                        <span className="font-bold">{r.company}</span>
                        {r.country && <Flag code={r.country} size={14} />}
                      </div>
                      <Issues r={r} />
                    </TableCell>
                    <TableCell className="whitespace-normal"><SanctionsCell r={r} /></TableCell>
                    <TableCell><ItemCell r={r} /></TableCell>
                    <TableCell><RouteCell r={r} /></TableCell>
                    {onAssess && (
                      <TableCell className="text-right">
                        <Button size="xs" variant="ghost" onClick={() => onAssess(r)} aria-label={`Assess ${r.company}`}
                          {...intent.on(() => onPrefetch?.(r))}>
                          Assess <ArrowRightIcon />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
          )}
        </Panel>
      )}
    </div>
  );
}
