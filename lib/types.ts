export type Band = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type Unit = "EUR" | "USD";
export type Weights = Record<string, number>;
export type EntityStatus = "CLEAN" | "PARTIAL" | "MATCH";
/** "NAME ONLY": the route was not checked (a batch row without one, or no trade data at all), so a clean name is not a clean result. */
export type VerdictCode = "STOP" | "HOLD" | "RED FLAG" | "ELEVATED" | "NAME ONLY" | "STANDARD";

export interface Reference {
  exporters: { code: string; name: string; bundled: boolean }[];
  intermediaries: { code: string; name: string; exposure: number }[];
  jurisdictions: { iso2: string; name: string }[];
  hs_codes: { hs: string; tier: string; description: string }[];
  tiers: Record<string, string>;
  chpl_version: string;
  trade: { years: number[]; retrieved: string; source: string; unit: Unit };
  sanctions: { retrieved: string; entities: number };
  baseline_years: [number, number];
  z_threshold: number;
  weights: Record<string, number>;
  robustness: { exporter: string; corridors: number; band_unchanged: number };
  monthly: { months: [string, string] | null };
  mirror: { years: number[]; retrieved: string; source: string } | null;
}

export interface AssessRequest {
  company: string;
  jurisdiction: string | null;
  ubos: string[];
  hs: string;
  exporter: string;
  intermediary: string;
  live: boolean;
  weights?: Weights | null;
  reviews?: Review[];
}

/** An officer's decision on one listed match for one screened name; it travels with every request. */
export interface Review {
  subject: string;
  match_id: string;
  decision: "same" | "different";
  reason: string;
  /** When it was recorded (ISO 8601). */
  at?: string | null;
  /** Who recorded it, as typed on the Buyer tab. */
  by?: string | null;
}

export interface Classification {
  hs: string;
  description: string | null;
  chpl: boolean;
  tier: string | null;
  tier_label: string | null;
  criticality_points: number;
  annex_i_indicative: string[];
  status: string;
  obligations: string[];
  source: string;
}

export interface Match {
  id: string;
  name: string;
  matched_on: string | null;
  score: number;
  kind: "P" | "O";
  countries: string[];
  lists: string[];
  program: string;
  listed_since: string;
  jurisdiction_match: boolean;
  url: string;
  review: { decision: Review["decision"]; reason: string; at?: string | null; by?: string | null } | null;
}

export interface Entity {
  status: EntityStatus;
  best_score: number;
  score: number;
  /** `confirmed`: the officer marked one of its matches as the same entity. */
  subjects: { name: string; role: string; status: EntityStatus; best_score: number; confirmed: boolean; matches: Match[] }[];
  source: string;
  lists: string[];
  warning: string | null;
  /** Names with a match or possible match that nobody has confirmed yet. */
  unreviewed: number;
}

interface Series {
  years: number[];
  values: number[];
  russia: number[];
  unit: Unit;
  source: string;
  retrieved: string | null;
  mode: "demo" | "live" | "cached" | "fallback" | "unavailable";
  warning?: string;
}

interface Point {
  year: number;
  value: number;
  russia: number | null;
  yoy: number | null;
  z: number | null;
  p_value: number | null;
  period: "baseline" | "post" | "other";
  flagged: boolean;
}

export interface Route {
  points: Point[];
  baseline: { years: number[]; mean: number; std: number; upper: number };
  post_mean: number;
  multiplier: number | null;
  z_max: number | null;
  z_max_year: number | null;
  flagged_years: number[];
  emergent: boolean;
  russia_ratio: number | null;
  diversion_pattern: boolean;
  score: number;
  band: Band;
  components: { key: string; weight: number; default_weight: number; share: number | null; points: number | null }[];
  custom_weights: boolean;
  sensitivity: { default: { score: number; band: Band }; equal: { score: number; band: Band } };
  jurisdiction_profile: {
    iso2: string;
    name: string;
    exposure: number;
    max: number;
    rationale: string;
    as_of: string;
    factors: { key: string; label: string; points: number; max: number; detail: string }[];
  } | null;
  note: string | null;
  /** True when there is no usable pre-war series and no new flow: the score lacks its statistical parts. */
  no_baseline: boolean;
  no_data: boolean;
  threshold: number;
}

interface Verdict {
  code: VerdictCode;
  level: number;
  title: string;
  notes: string[];
  /** Steps for a sanctions match or possible match (stop, check the match, escalate, record); empty otherwise. */
  actions: string[];
  /** The steps among `actions` that the law requires (the Art. 12g clause); these never fold away on phones. */
  required?: string[];
}

export interface Assessment {
  query: AssessRequest & { exporter_name: string; intermediary_name: string; jurisdiction_name: string };
  classification: Classification;
  entity: Entity;
  series: Series;
  route: Route;
  verdict: Verdict;
  monthly: Monthly | null;
  unit_values: UnitValues | null;
  mirror: Mirror | null;
  flows: Flows | null;
  sankey: Sankey | null;
  generated_at: string;
}

export interface Monthly {
  months: string[];
  values: number[];
  russia: number[] | null;
  unit: Unit;
  source: string | null;
  baseline: { from: string; to: string; mean: number; std: number; upper: number };
  z: (number | null)[];
  flagged: string[];
  latest: string;
  ytd: { year: number; through_month: number; value: number; reference_year: number; reference_value: number; ratio: number | null };
  last12: { value: number; reference_value: number; ratio: number | null };
}

export interface UnitValues {
  years: number[];
  per_kg: (number | null)[];
  kg: number[];
  baseline: number | null;
  post: number | null;
  change: number | null;
  flag: boolean;
}

export interface Mirror {
  years: number[];
  unit: Unit;
  source: string;
  de_exports: number[];
  imports_from_de: (number | null)[];
  exports_to_ru: (number | null)[];
  reported_years: number[];
  gap: number | null;
  gap_year: number | null;
  onward_multiplier: number | null;
}

export interface Flows {
  years: number[];
  unit: Unit;
  partners: Record<string, number[]>;
}

export interface Sankey {
  year: number;
  unit: Unit;
  links: { partner: string; from_exporter: number; to_russia: number | null; reported: boolean }[];
}

export interface RadarCell {
  partner: string;
  score: number;
  band: Band;
  multiplier: number | null;
  /** Under €100k a year before the war: the ratio overstates the change. */
  small_base: boolean;
  emergent: boolean;
  diversion: boolean;
  latest: number;
  spark: number[];
  ytd: number | null;
}

export interface Radar {
  exporter: string;
  exporter_name: string;
  years: number[];
  latest_month: string | null;
  partners: { code: string; name: string }[];
  rows: { hs: string; tier: string; description: string; max: number; cells: RadarCell[] }[];
  top: (RadarCell & { hs: string; description: string; tier: string })[];
  counts: Record<Band, number>;
}

interface RegistryRecord {
  lei: string;
  name: string;
  other_names: string[];
  country: string | null;
  city: string | null;
  created: string | null;
  status: string;
  registration_status: string;
  registered: string;
  similarity: number;
  url: string;
  ultimate_parent?: { lei: string; name: string; country: string | null } | null;
}

export interface Registry {
  available: boolean;
  results: RegistryRecord[];
  flags: { severity: "critical" | "high" | "medium"; text: string }[];
  note: string | null;
  source?: string;
}

export interface BatchRowIn {
  company: string;
  country?: string;
  hs?: string;
  intermediary?: string;
}

export interface BatchRowOut {
  company: string;
  country: string | null;
  entity_status: EntityStatus;
  entity_score: number;
  best_match: string | null;
  best_lists: string[];
  best_similarity: number | null;
  hs: string | null;
  chpl_tier: string | null;
  intermediary: string | null;
  route_score: number | null;
  route_band: Band | null;
  route_no_baseline: boolean | null;
  verdict: VerdictCode;
  /** Problems with the row's input, in plain words (empty when every given column was used). */
  issues: string[];
}

export interface BatchResult {
  rows: BatchRowOut[];
  summary: Record<VerdictCode, number>;
  exporter: string;
  count: number;
}

export interface Memo {
  title: string;
  ref: string;
  date: string;
  marking: string;
  subject: string;
  verdict: Verdict;
  bluf: string;
  scores: { route: number; route_band: Band; route_no_baseline: boolean; entity: number; entity_status: EntityStatus; best_similarity: number };
  findings: { severity: "critical" | "high" | "medium" | "info"; area: string; text: string }[];
  reviews: { subject: string; listed_name: string; lists: string[]; decision: Review["decision"]; reason: string; at?: string | null; by?: string | null }[];
  legal: string[];
  edd: string[];
  limitations: string[];
  sources: { label: string; url: string }[];
  narrative: string | null;
  engine: "rules" | "rules+llm";
  markdown: string;
}

export interface CalcRequest {
  hs: string;
  intermediary: string;
  years: number[];
  values: number[];
  russia: number[];
  screening: EntityStatus;
  weights: Weights | null;
}

export interface CalcResult {
  classification: Classification;
  route: Route;
  verdict: Verdict;
}
