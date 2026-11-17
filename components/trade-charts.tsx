"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToneIcon } from "@/components/status";
import { Flag } from "@/components/visuals";
import { money, pct, times, zfmt, moneyTick, niceTicks, NONE } from "@/lib/format";
import type { Route, Unit } from "@/lib/types";

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 13, fontFamily: "var(--font-sans)" };

type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-44 border border-border bg-popover px-3 py-2 text-sm shadow-lg">{children}</div>
  );
}

function Row({ k, v, line }: { k: string; v: string; line?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {line && <span className="inline-block h-0.5 w-3" style={{ background: line }} />}
        {k}
      </span>
      <span className="font-semibold text-foreground">{v}</span>
    </div>
  );
}

function LegendKey({ color, label, line, flag }: { color: string; label: string; line?: boolean; flag?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={line ? "inline-block h-0.5 w-4" : "inline-block size-2.5"} style={{ background: color }} />
      {flag && <Flag code={flag} size={14} />}
      {label}
    </span>
  );
}

/* ---------------- anomaly columns ---------------- */

export function AnomalyChart({ route, partner, unit }: { route: Route; partner: string; unit: Unit }) {
  const { baseline } = route;
  const hasBand = baseline.std > 0 && baseline.mean > 0;
  // The label rides on each datum: LabelList's index counts only rendered bars, so zero years would shift it
  const data = route.points.map((p) => ({
    ...p,
    label: p.flagged ? (baseline.mean > 0 ? times(p.value / baseline.mean) : "new") : null,
  }));
  const max = Math.max(...data.map((d) => d.value), hasBand ? baseline.upper : 0, 1);
  const ticks = niceTicks(max * 1.1); // headroom for the labels above flagged bars
  const [b0, b1] = [baseline.years[0], baseline.years[baseline.years.length - 1]];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <LegendKey color="var(--chart-baseline)" label={`Pre-war (${b0}–${String(b1).slice(2)})`} />
        {data.some((d) => d.period !== "baseline" && !d.flagged) && <LegendKey color="var(--series-1)" label="Since 2022" />}
        {data.some((d) => d.flagged) && <LegendKey color="var(--foreground)" label={baseline.mean > 0 ? "Unusual year, labelled with its multiple of the pre-war mean" : "Unusual year: far above the pre-war years"} />}
        {hasBand && <LegendKey color="var(--muted-foreground)" label="Pre-war mean" line />}
        {hasBand && <LegendKey color="var(--status-warning)" label="Pre-war range" line />}
      </div>
      <div className="h-65 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 4 }}
            title={`Annual exports to ${partner}, ${data[0]?.year} to ${data.at(-1)?.year}`}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            {b0 && <ReferenceArea x1={b0} x2={b1} fill="var(--foreground)" fillOpacity={0.035} ifOverflow="extendDomain" />}
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={AXIS_TICK} />
            <YAxis tickFormatter={(v: number) => moneyTick(v, unit)} width={58} tickLine={false} axisLine={false}
              tick={AXIS_TICK} domain={[0, ticks.at(-1)!]} ticks={ticks} />
            {hasBand && (
              <ReferenceLine y={baseline.mean} stroke="var(--muted-foreground)" strokeWidth={1} />
            )}
            {hasBand && (
              <ReferenceLine y={baseline.upper} stroke="var(--status-warning)" strokeWidth={1} />
            )}
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={({ active, payload }: TipProps) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as unknown as Route["points"][number];
                return (
                  <Tip>
                    <div className="mb-1 font-bold text-foreground">{p.year} · exports to {partner}</div>
                    <Row k="Exports" v={money(p.value, unit, 2)} />
                    <Row k="YoY" v={pct(p.yoy)} />
                    {baseline.mean > 0 && <Row k="Vs pre-war mean" v={times(p.value / baseline.mean)} />}
                    <Row k="SD above pre-war" v={zfmt(p.z)} />
                    {p.flagged && (
                      <div className="mt-1 flex items-center gap-1 text-foreground">
                        <ToneIcon tone="serious" className="size-3" /> Unusual year
                      </div>
                    )}
                  </Tip>
                );
              }}
            />
            <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.year}
                  fill={d.flagged ? "var(--foreground)" : d.period === "baseline" ? "var(--chart-baseline)" : "var(--series-1)"} />
              ))}
              <LabelList
                dataKey="label"
                content={(props) => {
                  const { x, y, width, value } = props as { x: number; y: number; width: number; value: string | null };
                  if (!value || width < 16) return null; // too narrow: tooltip and table carry it
                  return (
                    <text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize={12} fill="var(--foreground)">
                      {value}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------------- displacement: indexed lines, one log axis ---------------- */

export function DisplacementChart({ route, partner, partnerCode, unit }: {
  route: Route; partner: string; partnerCode: string; unit: Unit;
}) {
  const years = route.baseline.years;
  const pts = route.points;
  const mean = (k: "value" | "russia") => {
    const xs = pts.filter((p) => years.includes(p.year)).map((p) => p[k] ?? 0);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  const mi = mean("value");
  const mr = mean("russia");
  if (mi <= 0 || mr <= 0) {
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        {mi <= 0 ? `No pre-war exports to ${partner} to index against.` : "No pre-war direct exports to Russia to index against."}
      </p>
    );
  }
  // Zero cannot sit on a log scale: those years are left as gaps (the tooltip still shows 0)
  const idx = (v: number | null, m: number) => (v ? Math.max(1, (v / m) * 100) : null);
  const data = pts.map((p) => ({
    year: p.year,
    inter: idx(p.value, mi),
    russia: idx(p.russia, mr),
    interRaw: p.value,
    russiaRaw: p.russia ?? 0,
  }));
  const top = Math.max(...data.map((d) => Math.max(d.inter ?? 1, d.russia ?? 1)));
  const ticks = [1, 10, 100, 1000, 10000, 100000, 1000000].filter((t) => t <= top * 10);
  const last = data.length - 1;

  const endLabel = (name: string) =>
    function EndLabel(props: unknown) {
      const { x, y, index, value } = props as { x: number; y: number; index: number; value: number | null };
      if (index !== last || value == null) return null;
      return (
        <text x={x + 8} y={y + 4} fontSize={12} fill="var(--foreground)">
          {name}
        </text>
      );
    };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <LegendKey color="var(--series-1)" label={`Exports to ${partner}`} line flag={partnerCode} />
        <LegendKey color="var(--series-2)" label="Direct exports to Russia" line flag="RU" />
        <span>Index, pre-war = 100, log scale</span>
      </div>
      <div className="h-55 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 76, bottom: 0, left: 4 }}
            title={`Direct exports to Russia vs exports to ${partner}, indexed to pre-war`}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={AXIS_TICK} />
            <YAxis scale="log" domain={[1, ticks[ticks.length - 1]]} ticks={ticks} allowDataOverflow width={52}
              tickFormatter={(v: number) => v.toLocaleString("en-US")} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <ReferenceLine y={100} stroke="var(--chart-axis)" />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload }: TipProps) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <Tip>
                    <div className="mb-1 font-bold text-foreground">{d.year}</div>
                    <Row k={partner} v={`${d.inter === null ? "0" : Math.round(d.inter).toLocaleString("en-US")} · ${money(d.interRaw, unit)}`} line="var(--series-1)" />
                    <Row k="Russia" v={`${d.russia === null ? "0" : Math.round(d.russia).toLocaleString("en-US")} · ${money(d.russiaRaw, unit)}`} line="var(--series-2)" />
                  </Tip>
                );
              }}
            />
            <Line dataKey="russia" stroke="var(--series-2)" strokeWidth={2} isAnimationActive={false}
              dot={{ r: 4, fill: "var(--series-2)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}>
              <LabelList content={endLabel("Russia")} />
            </Line>
            <Line dataKey="inter" stroke="var(--series-1)" strokeWidth={2} isAnimationActive={false}
              dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}>
              <LabelList content={endLabel(partner.length > 10 ? partner.slice(0, 9) + "…" : partner)} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------------- table view (every value reachable without hover) ---------------- */

export function SeriesTable({ route, unit }: { route: Route; unit: Unit }) {
  return (
    <Table className="text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>Year</TableHead>
          <TableHead className="text-right">Exports</TableHead>
          <TableHead className="text-right">YoY</TableHead>
          <TableHead className="text-right"><abbr title="Standard deviations above the pre-war mean">SD above pre-war</abbr></TableHead>
          <TableHead className="text-right">Chance by luck</TableHead>
          <TableHead className="text-right">Direct exports to Russia</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {route.points.map((p) => (
          <TableRow key={p.year}>
            <TableCell>{p.year}{p.period === "baseline" && <span className="ml-1.5 text-faint">pre-war</span>}</TableCell>
            <TableCell className="text-right">{money(p.value, unit, 2)}</TableCell>
            <TableCell className="text-right">{pct(p.yoy)}</TableCell>
            <TableCell className="text-right">{zfmt(p.z)}</TableCell>
            <TableCell className="text-right">
              {p.p_value === null ? NONE : p.p_value < 0.001 ? "<0.001" : p.p_value.toFixed(3)}
            </TableCell>
            <TableCell className="text-right">{p.russia === null ? NONE : money(p.russia, unit, 2)}</TableCell>
            <TableCell>{p.flagged && <ToneIcon tone="serious" className="size-3.5" />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
