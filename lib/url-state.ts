/**
 * The open view and assessment in the address bar, so a link reopens the same result:
 * ?company=…&country=KZ&owners=A;B&hs=848210&via=KZ[&exporter=EU27_2020][&live=1][&tab=route][&view=radar]
 */
import type { Section } from "@/components/assessment-summary";
import type { View } from "@/components/app-header";
import type { FormState } from "@/components/query-panel";
import { INTERMEDIARY_CODES } from "./corridors";
import { REASON_MIN, realChapter } from "./format";
import type { Assessment, Review } from "./types";

const VIEWS: View[] = ["assess", "radar", "batch", "calc"];
/** The `tab` value for each section, named like its tab. The internal names still open, for older links. */
const TAB: Record<Section, string> = { overview: "overview", counterparty: "buyer", goods: "item", route: "route", briefing: "briefing" };

/** Match decisions in the address, so a reload or a shared link reopens the same record:
 *  decisions=[[subject, match id, "same"|"different", reason, recorded at], …] */
function readDecisions(raw: string | null): Review[] | undefined {
  if (!raw) return undefined;
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return undefined;
    // The server's limits, so one hand-edited row cannot get the whole assessment refused
    return rows.slice(0, MAX_DECISIONS).flatMap((r) => {
      if (!Array.isArray(r) || typeof r[0] !== "string" || typeof r[1] !== "string" || typeof r[3] !== "string") return [];
      const reason = r[3].trim().slice(0, 300).trim();
      if (r[0].length > 200 || r[1].length > 200 || (r[2] !== "same" && r[2] !== "different") || [...reason].length < REASON_MIN) return [];
      const at = typeof r[4] === "string" && r[4].length <= 40 ? r[4] : null;
      const by = typeof r[5] === "string" && r[5].trim() ? r[5].trim().slice(0, 80) : null;
      return [{ subject: r[0], match_id: r[1], decision: r[2] as Review["decision"], reason, at, by }];
    });
  } catch {
    return undefined; // a mangled link opens the case without decisions rather than failing
  }
}

/** As many as the server takes in one request (a buyer and 10 owners, up to 8 hits each). */
export const MAX_DECISIONS = 100;
/** Hosts refuse addresses past about 14 KB; decisions that would push past this stay off the link. */
const MAX_PARAM = 8000;

/** The `decisions` value, or null when there are none or they would make the address too long to open. */
export function decisionsParam(reviews: Review[]): string | null {
  if (!reviews.length) return null;
  const raw = JSON.stringify(reviews.map((r) => [r.subject, r.match_id, r.decision, r.reason, r.at ?? null, r.by ?? null]));
  return encodeURIComponent(raw).length <= MAX_PARAM ? raw : null;
}

/** `incomplete`: a link that names a case but fails a check (a cut-off or hand-edited link). It carries what
 *  the link did hold, for the form, and the fields to fix, so the page asks rather than showing another case. */
export function readUrl(search: string): {
  form?: FormState; view?: View; section?: Section; reviews?: Review[];
  incomplete?: { form: FormState; fields: ("company" | "hs" | "via")[] };
} {
  const p = new URLSearchParams(search);
  const view = VIEWS.find((v) => v === p.get("view"));
  const tab = p.get("tab");
  const section = (Object.keys(TAB) as Section[]).find((s) => TAB[s] === tab || s === tab);
  const company = p.get("company")?.trim() ?? "";
  const hs = (p.get("hs") ?? "").replace(/\D/g, "");
  const via = (p.get("via") ?? "").toUpperCase();
  const fields = ([
    company.length < 2 && "company", (hs.length !== 6 || !realChapter(hs)) && "hs", !INTERMEDIARY_CODES.includes(via) && "via",
  ] as const).filter((f) => f !== false);
  const held: FormState = {
    company: company.slice(0, 200),
    jurisdiction: (p.get("country") ?? "").toUpperCase().slice(0, 2),
    ubos: (p.get("owners") ?? "").split(";").map((s) => s.trim()).filter(Boolean).slice(0, 10).join("\n"),
    hs: hs.slice(0, 6),
    exporter: p.get("exporter") ?? "DE",
    intermediary: fields.includes("via") ? "" : via,
    live: p.get("live") === "1",
  };
  if (fields.length) {
    const named = ["company", "hs", "via"].some((k) => p.has(k));
    return { view, section, incomplete: named ? { form: held, fields } : undefined };
  }
  return { form: held, view, section, reviews: readDecisions(p.get("decisions")) };
}

/** `push` adds a history entry, so Back returns to the previous view, tab or assessment. */
/** `keepCase`: write the case on Radar, Batch and Calculator too (a real case, not an example, so a reload keeps it).
 *  The decisions also ride in the history entry's state, so Back and Forward keep them when the address cannot. */
export function writeUrl(a: Assessment | null, view: View, section: Section, push = true, keepCase = false) {
  const p = new URLSearchParams();
  if (view !== "assess") p.set("view", view);
  if (a && (view === "assess" || keepCase)) {
    const q = a.query;
    p.set("company", q.company);
    if (q.jurisdiction) p.set("country", q.jurisdiction);
    if (q.ubos.length) p.set("owners", q.ubos.join(";"));
    p.set("hs", q.hs);
    if (q.exporter !== "DE") p.set("exporter", q.exporter);
    p.set("via", q.intermediary);
    if (q.live) p.set("live", "1");
    const decisions = decisionsParam(q.reviews ?? []);
    if (decisions) p.set("decisions", decisions);
  }
  if (view === "assess" && section !== "overview") p.set("tab", TAB[section]);
  if (view === "radar") {
    const now = new URLSearchParams(window.location.search);
    for (const k of RADAR_KEYS) if (now.get(k)) p.set(k, now.get(k)!);
  }
  const next = `${window.location.pathname}${p.size ? `?${p.toString().replace(/%2C/g, ",")}` : ""}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  const state = { decisions: a?.query.reviews ?? [] };
  if (push) window.history.pushState(state, "", next);
  else window.history.replaceState(state, "", next);
}

/** Radar filters, McMaster-style: every selection is in the address, so Back undoes it and a link shares it. */
const RADAR_KEYS = ["from", "risk", "tier", "to", "signal", "item"] as const;
export type RadarKey = (typeof RADAR_KEYS)[number];
export type RadarFilters = Record<RadarKey, string[]>;

export function readRadar(search: string): RadarFilters {
  const p = new URLSearchParams(search);
  return Object.fromEntries(RADAR_KEYS.map((k) => [k, (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean)])) as RadarFilters;
}

/** Keeps every other parameter (the view and the open assessment) and adds a history entry; `state` rides along with it. */
export function writeRadar(f: RadarFilters, state: Record<string, unknown> | null = null) {
  const p = new URLSearchParams(window.location.search);
  for (const k of RADAR_KEYS) {
    if (f[k].length) p.set(k, f[k].join(","));
    else p.delete(k);
  }
  const next = `${window.location.pathname}${p.size ? `?${p.toString().replace(/%2C/g, ",")}` : ""}`;
  if (next !== `${window.location.pathname}${window.location.search}`) window.history.pushState(state, "", next);
}
