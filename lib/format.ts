import type { Band, EntityStatus, Unit, VerdictCode } from "./types";

/** Shown for a missing value in tables and stats. */
export const NONE = "n/a";

/** An HS code as the app shows it: 854231 becomes 8542.31. */
export const hsCode = (hs: string) => (hs.length === 6 ? `${hs.slice(0, 4)}.${hs.slice(4)}` : hs);

export function money(v: number, unit: Unit = "EUR", digits = 1): string {
  const sym = unit === "EUR" ? "€" : "$";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sym}${(v / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sym}${(v / 1e6).toFixed(digits)}M`;
  // Thousands keep one decimal below 10K ("€4.3K"), like the briefing; small amounts (prices per kg) keep cents
  if (a >= 1e3) return `${sym}${a < 1e4 && v % 1e3 !== 0 ? (v / 1e3).toFixed(1) : (v / 1e3).toFixed(0)}K`;
  return a < 10 && v !== 0 ? `${sym}${v.toFixed(2)}` : `${sym}${v.toFixed(0)}`;
}

/** Multiples: one decimal below 100, whole numbers above (tiny baselines make huge ratios). */
export function times(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return NONE;
  if (x === 0) return "None";
  if (x > 0 && x < 0.1) return "<0.1×"; // a real fall must not read as "0.0×", like missing data
  return x >= 100 ? `${Math.round(x).toLocaleString("en-US")}×` : `${x.toFixed(1)}×`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(m: string): string {
  return `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
}

/** "2026 Jan–Aug vs 2021": this year so far against the same months of the reference year. */
export function ytdLabel(year: number | string, throughMonth: number, reference: number | string = 2021): string {
  const span = throughMonth > 1 ? `Jan–${MONTH_NAMES[throughMonth - 1]}` : "Jan";
  return `${year} ${span} vs ${reference}`;
}

export function pct(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return NONE;
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
}

/** A ratio read as a change: 0.12 is "-88%", 4.2 is "+320%". */
export function change(ratio: number | null): string {
  return pct(ratio === null ? null : ratio - 1);
}

export function zfmt(z: number | null): string {
  if (z === null) return NONE;
  return Math.abs(z) >= 100 ? Math.round(z).toLocaleString("en-US") : z.toFixed(1);
}

export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

/** The item's tone everywhere it appears. Listed items are serious (orange): red is kept for a sanctions stop. */
export function itemTone(c: { chpl: boolean; status: string }): Tone {
  if (c.chpl) return "serious";
  return c.status === "NOT LISTED" ? "good" : "warning";
}

/** A briefing finding's severity in the same tones (high = orange, like a listed item). The API marks only a
 *  sanctions match as critical, so red here is the Match status. */
export const severityTone: Record<"critical" | "high" | "medium" | "info", Tone> = {
  critical: "critical", high: "serious", medium: "warning", info: "neutral",
};

/** A statistic never wears red (kept for Stop and Match): Critical shares the orange of High, told apart by its word. */
export const bandTone: Record<Band, Tone> = {
  LOW: "good",
  MODERATE: "warning",
  HIGH: "serious",
  CRITICAL: "serious",
};

export const entityTone: Record<EntityStatus, Tone> = {
  CLEAN: "good",
  PARTIAL: "serious",
  MATCH: "critical",
};

/** A route band as shown. A Low score with no pre-war baseline means "missing", not "safe": never a green Low. */
export function routeStatus(band: Band, noBaseline?: boolean | null): { tone: Tone; label: string } {
  return noBaseline && band === "LOW" ? { tone: "neutral", label: "No baseline" } : { tone: bandTone[band], label: band };
}

/** One wording for screening results everywhere (the API codes are CLEAN / PARTIAL / MATCH). */
export const entityLabel: Record<EntityStatus, string> = {
  CLEAN: "No match",
  PARTIAL: "Possible match",
  MATCH: "Match",
};

/** The similarity rule, stated once: the thresholds in api/_lib/sanctions.py (MATCH_AT, PARTIAL_AT, listing cut-off). */
/** Shortest reason accepted for a match decision (the server checks the same). */
export const REASON_MIN = 10;

/** HS chapters run from 01 to 97 (77 is reserved); 98/99 are national or "not specified" codes. */
export const realChapter = (hs: string) => Number(hs.slice(0, 2)) >= 1 && Number(hs.slice(0, 2)) <= 97 && !hs.startsWith("77");

export const SCREENING_RULE = "Match from 93% similarity, possible match from 80%, review from 70%.";

export const verdictTone: Record<VerdictCode, Tone> = {
  // One scale, strongest first: solid red, solid orange (Hold, Red flag: told apart by icon), yellow outline, grey.
  // Standard is grey, not green: no action reads as a clearance
  STOP: "critical",
  HOLD: "serious",
  "RED FLAG": "serious",
  ELEVATED: "warning",
  "NAME ONLY": "neutral",
  STANDARD: "neutral",
};

/** Decisions that block the shipment (Stop, Hold, Red flag: no shipping until checks are done) get a solid badge. */
export const verdictSolid = (code: VerdictCode) => code === "STOP" || code === "HOLD" || code === "RED FLAG";

export const toneVar: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "var(--muted-foreground)",
};

export const componentLabel: Record<string, string> = {
  anomaly: "Unusual years",
  surge: "Exports vs pre-war",
  materiality: "Excess value",
  criticality: "Item criticality",
  jurisdiction: "Transit country exposure",
  displacement: "Fall in direct exports to Russia",
};

/** What each route-risk component measures, in plain words, under the breakdown; the formulas are in COMPONENT_RULE. */
export const COMPONENT_HINT: Record<string, string> = {
  anomaly: "How far the most unusual year since 2022 is above the pre-war range.",
  surge: "Yearly exports since 2022 against the pre-war average.",
  materiality: "How much money the peak year adds above the pre-war level.",
  criticality: "How high the item ranks on the EU battlefield item list.",
  jurisdiction: "Customs union and border with Russia, and Russia-related designations there.",
  displacement: "Direct exports to Russia falling while exports to the transit country rise.",
};

/** How each route-risk component earns its points (shown in the methodology). */
export const COMPONENT_RULE: Record<string, string> = {
  anomaly: "Most unusual year since 2022; full points at 6 standard deviations above pre-war.",
  surge: "Average since 2022 vs the pre-war average; full points at 8 times.",
  materiality: "Peak excess over baseline: 100K = 0, 10M = full (EUR, or USD when only UN Comtrade has the figures).",
  criticality: "Tier on the EU battlefield item list: Tier 1 = 15, Tier 2 = 12, Tier 3 = 9, Tier 4 = 6.",
  jurisdiction: "EAEU customs union with Russia (5) + land border with Russia (3) + Russia-related designations of organisations based there (7, log-scaled, 200+ = full).",
  displacement: "Fall in direct exports to Russia × rise to the transit country over the same years.",
};

/** Round, evenly spaced axis ticks from 0 to just above `max` (about `count` intervals). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const n = Math.ceil(max / step - 1e-9);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
}

/** Axis label for a money tick: whole millions/billions without decimals, otherwise one decimal. */
export function moneyTick(v: number, unit: Unit = "EUR"): string {
  const a = Math.abs(v);
  const whole = a >= 1e9 ? v % 1e9 === 0 : a >= 1e6 ? v % 1e6 === 0 : true;
  return money(v, unit, whole ? 0 : 1);
}
