"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status";
import { Flag } from "@/components/visuals";
import { change, monthLabel, money, times, moneyTick, niceTicks, NONE } from "@/lib/format";
import type { Mirror, Monthly, UnitValues, Unit } from "@/lib/types";

const TICK = { fill: "var(--muted-foreground)", fontSize: 13, fontFamily: "var(--font-sans)" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {tone && <span className="size-2 shrink-0 rounded-full" style={{ background: tone }} aria-hidden />}{label}
      </div>
      <div className="text-xl font-bold leading-tight">{value}</div>
      {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}

function TipBox({ children }: { children: ReactNode }) {
  return <div className="min-w-40 border border-border bg-popover px-3 py-2 text-sm shadow-lg">{children}</div>;
}

const ratioTone = (r: number | null) =>
  r === null ? undefined : r >= 3 ? "var(--status-serious)" : r >= 1.5 ? "var(--warning-ink)" : "var(--status-good)";

/* ---------------- monthly exports ---------------- */

export function MonthlyPanel({ m }: { m: Monthly | null }) {
  if (!m) return <p className="py-8 text-center text-sm text-muted-foreground">No monthly data for this item and route.</p>;
  const flagged = new Set(m.flagged);
  const data = m.months.map((mo, i) => ({ mo, value: m.values[i], z: m.z[i], flagged: flagged.has(mo), pre: mo <= m.baseline.to }));
  const ticks = niceTicks(Math.max(...m.values, m.baseline.upper, 1) * 1.05);
  const { ytd, last12 } = m;
  const yearTicks = data.filter((d) => d.mo.endsWith("-01")).map((d) => d.mo);
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`${ytd.year} so far (Jan–${MONTHS[ytd.through_month - 1]})`} value={money(ytd.value, m.unit)}
          sub={ytd.ratio !== null ? `${change(ytd.ratio)} vs ${ytd.reference_year}` : `No ${ytd.reference_year} data`}
          tone={ratioTone(ytd.ratio)} />
        <Stat label="Last 12 months" value={money(last12.value, m.unit)}
          sub={last12.ratio !== null ? `${change(last12.ratio)} vs all of ${ytd.reference_year}` : NONE} tone={ratioTone(last12.ratio)} />
        <Stat label="Unusual months" value={m.flagged.length} sub="since March 2022"
          tone={m.flagged.length ? "var(--status-serious)" : undefined} />
        <Stat label="Latest month" value={monthLabel(m.latest)} sub={money(m.values.at(-1) ?? 0, m.unit)} />
      </div>
      <div className="h-55">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap={1}
            title={`Monthly exports, ${monthLabel(m.months[0])} to ${monthLabel(m.latest)}`}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <ReferenceArea x1={data[0].mo} x2={m.baseline.to} fill="var(--foreground)" fillOpacity={0.035} />
            <XAxis dataKey="mo" ticks={yearTicks} tickFormatter={(v: string) => v.slice(0, 4)} tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }} tick={TICK} />
            <YAxis tickFormatter={(v: number) => moneyTick(v, m.unit)} width={56} tickLine={false} axisLine={false} tick={TICK}
              domain={[0, ticks.at(-1)!]} ticks={ticks} />
            <ReferenceLine y={m.baseline.mean} stroke="var(--muted-foreground)" />
            <ReferenceLine y={m.baseline.upper} stroke="var(--status-warning)" />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={({ active, payload }: TipProps) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TipBox>
                  <div className="font-bold">{monthLabel(d.mo)}</div>
                  <div>{money(d.value, m.unit, 2)}</div>
                  {d.z !== null && <div className="text-muted-foreground">{d.z.toFixed(1)} SD from pre-war months</div>}
                </TipBox>
              );
            }} />
            <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.mo} fill={d.flagged ? "var(--foreground)" : d.pre ? "var(--chart-baseline)" : "var(--series-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Grey: pre-war ({monthLabel(m.baseline.from)}–{monthLabel(m.baseline.to)}). Blue: since the war. Text colour: unusual month, far above the pre-war months.
        Seasons and large single orders also move monthly figures.
      </p>
    </div>
  );
}

/* ---------------- price per kg ---------------- */

export function PricePanel({ u, unit }: { u: UnitValues | null; unit: Unit }) {
  if (!u || u.baseline === null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No weight data for this item and route.</p>;
  }
  const data = u.years.map((y, i) => ({ year: y, perKg: u.per_kg[i] }));
  const fmt = (v: number) => (v >= 1000 ? money(v, unit, 1) : `${unit === "EUR" ? "€" : "$"}${v.toFixed(v < 10 ? 2 : 0)}`);
  const priceTicks = niceTicks(Math.max(...u.per_kg.map((v) => v ?? 0), u.baseline ?? 0) * 1.1);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pre-war" value={`${fmt(u.baseline)}/kg`} />
          <Stat label="Since 2022" value={u.post !== null ? `${fmt(u.post)}/kg` : NONE} />
          <Stat label="Change" value={u.change !== null ? `${u.change.toFixed(1)}×` : NONE}
            tone={u.flag ? "var(--status-serious)" : "var(--status-good)"} />
        </div>
        <StatusBadge tone={u.flag ? "serious" : "good"}>{u.flag ? "Price shift" : "No 2× shift"}</StatusBadge>
      </div>
      <div className="h-42.5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} title="Price per kg by year">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={TICK} />
            <YAxis tickFormatter={(v: number) => fmt(v)} width={56} tickLine={false} axisLine={false} tick={TICK}
              domain={[0, priceTicks.at(-1)!]} ticks={priceTicks} />
            <ReferenceLine y={u.baseline} stroke="var(--muted-foreground)" />
            <Tooltip content={({ active, payload }: TipProps) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return <TipBox><div className="font-bold">{d.year}</div><div>{d.perKg !== null ? `${fmt(d.perKg)}/kg` : NONE}</div></TipBox>;
            }} />
            <Line dataKey="perKg" stroke="var(--series-1)" strokeWidth={2} connectNulls isAnimationActive={false}
              dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--card)", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Grey line: pre-war. A large shift can mean misdeclared goods or a different product mix.
      </p>
    </div>
  );
}

/* ---------------- mirror statistics ---------------- */

const MIRROR = [
  { key: "de", color: "var(--series-1)", label: (c: string) => `Germany: exports to ${c}` },
  { key: "imp", color: "var(--series-3)", label: (c: string) => `${c}: imports from Germany` },
  { key: "ru", color: "var(--series-2)", label: (c: string) => `${c}: exports to Russia` },
] as const;

export function MirrorPanel({ m, partner, partnerCode }: { m: Mirror | null; partner: string; partnerCode: string }) {
  if (!m) return <p className="py-8 text-center text-sm text-muted-foreground">Partner figures cover only Germany as exporter and items on the EU battlefield item list.</p>;
  const data = m.years.map((y, i) => ({ year: y, de: m.de_exports[i], imp: m.imports_from_de[i], ru: m.exports_to_ru[i] }));
  const mirrorTicks = niceTicks(Math.max(1, ...data.flatMap((d) => MIRROR.map((x) => d[x.key] ?? 0))) * 1.05);
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label={m.gap_year ? `Reporting gap (${m.gap_year})` : "Reporting gap"}
          value={m.gap !== null ? `${(m.gap * 100).toFixed(0)}%` : NONE}
          sub={`Germany's exports not recorded by ${partner}`}
          tone={m.gap !== null && m.gap >= 0.3 ? "var(--status-serious)" : undefined} />
        <Stat label={`${partner}'s exports to Russia`}
          value={times(m.onward_multiplier)} sub="since 2022 vs pre-war"
          tone={m.onward_multiplier !== null && m.onward_multiplier >= 2 ? "var(--status-serious)" : undefined} />
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {MIRROR.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: s.color }} />
            {s.key !== "de" && <Flag code={partnerCode} size={14} />}
            {s.label(partner)}
          </span>
        ))}
      </div>
      <div className="h-50">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
            title={`Germany's exports to ${partner}, ${partner}'s imports from Germany and its exports to Russia`}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} tick={TICK} />
            <YAxis tickFormatter={(v: number) => moneyTick(v, "USD")} width={56} tickLine={false} axisLine={false} tick={TICK}
              domain={[0, mirrorTicks.at(-1)!]} ticks={mirrorTicks} />
            <Tooltip content={({ active, payload }: TipProps) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              const v = (x: number | null) => (x === null ? "not reported" : money(x, "USD", 2));
              return (
                <TipBox>
                  <div className="mb-1 font-bold">{d.year}</div>
                  {MIRROR.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-0.5 w-3" style={{ background: s.color }} />{s.label(partner)}
                      </span>
                      <span className="font-bold">{v(d[s.key])}</span>
                    </div>
                  ))}
                </TipBox>
              );
            }} />
            {MIRROR.map((s) => (
              <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} isAnimationActive={false}
                dot={{ r: 3.5, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        UN Comtrade, USD. Gaps can also come from valuation, timing and origin rules.
      </p>
    </div>
  );
}
