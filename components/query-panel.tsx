"use client";

import { CrosshairIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/panel";
import { Flag } from "@/components/visuals";
import { useIntent } from "@/lib/use-intent";
import { cn } from "@/lib/utils";
import type { AssessRequest, Reference, Weights } from "@/lib/types";

export interface FormState {
  company: string;
  jurisdiction: string;
  ubos: string;
  hs: string;
  exporter: string;
  intermediary: string;
  live: boolean;
}

/** Fictional buyers (Northwind, Contoso, Fabrikam are well-known sample names) plus one real listed entity. */
export const PRESETS: { label: string; note: string; form: FormState }[] = [
  {
    label: "Bearings → Kazakhstan",
    note: "Clean buyer, critical route",
    form: { company: "Northwind Components LLP", jurisdiction: "KZ", ubos: "", hs: "848210",
      exporter: "DE", intermediary: "KZ", live: false },
  },
  {
    label: "Chips → Kyrgyzstan",
    note: "Surge through the EAEU",
    form: { company: "Contoso Electronics LLC", jurisdiction: "KG", ubos: "", hs: "854239",
      exporter: "DE", intermediary: "KG", live: false },
  },
  {
    label: "Listed buyer",
    note: "Russian buyer on the US list",
    form: { company: "OOO Радиоавтоматика", jurisdiction: "RU", ubos: "", hs: "854231",
      exporter: "DE", intermediary: "AM", live: false },
  },
  {
    label: "Control: UAE",
    note: "Low route risk",
    form: { company: "Fabrikam Trading FZE", jurisdiction: "AE", ubos: "", hs: "854231",
      exporter: "DE", intermediary: "AE", live: false },
  },
];

export function toRequest(f: FormState, weights: Weights | null = null): AssessRequest {
  return {
    company: f.company,
    jurisdiction: f.jurisdiction || null,
    ubos: f.ubos.split(/\n|;/).map((s) => s.trim()).filter(Boolean),
    hs: f.hs,
    exporter: f.exporter,
    intermediary: f.intermediary,
    live: f.live,
    weights,
  };
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[17px] font-semibold text-foreground">{label}</Label>
      {children}
      {hint && <div className="text-[14px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function QueryPanel({ reference, form, setForm, onRun, onPrefetch, loading, active, upToDate }: {
  reference: Reference | null;
  form: FormState;
  setForm: (f: FormState) => void;
  onRun: (f: FormState) => void;
  /** Starts an example's assessment while the pointer rests on it. */
  onPrefetch?: (f: FormState) => void;
  loading: boolean;
  active: number | null;
  /** The result on screen is for this exact form: Run steps back so it doesn't compete with the verdict. */
  upToDate?: boolean;
}) {
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const intent = useIntent();
  const hsInfo = reference?.hs_codes.find((h) => h.hs === form.hs);
  const sixDigits = /^\d{6}$/.test(form.hs);
  // HS chapters run from 01 to 97 (77 is reserved); 98/99 are national or "not specified" codes
  const realChapter = sixDigits && Number(form.hs.slice(0, 2)) >= 1 && Number(form.hs.slice(0, 2)) <= 97 && !form.hs.startsWith("77");
  const hsValid = sixDigits && realChapter;
  const blocked = form.company.trim().length < 2 ? "Enter a name of at least 2 characters."
    : !sixDigits ? "Enter a six-digit HS code." : !hsValid ? "Enter a valid HS code." : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.company.trim().length >= 2 && hsValid) onRun(form);
  };

  // On desktop the form is a plain column beside the results (the sidebar carries the rule), not a card
  return (
    <Panel title="New assessment" className="overflow-visible lg:border-0 lg:bg-transparent"
      headerClassName="lg:px-0 lg:pt-0" bodyClassName="space-y-4 lg:px-0">
      <div>
        <h3 className="mb-1.5 text-[17px] font-bold">Examples</h3>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
          {PRESETS.map((p, i) => (
            <button key={p.label} type="button" onClick={() => { setForm(p.form); onRun(p.form); }} aria-pressed={active === i}
              {...intent.on(() => onPrefetch?.(p.form))}
              className={cn(
                "flex items-center gap-2.5 border px-2.5 py-1.5 text-left transition-colors hover:border-ring",
                active === i ? "border-ring bg-ring/10" : "border-border",
              )}>
              <Flag code={p.form.intermediary} size={18} />
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold leading-tight">{p.label}</span>
                <span className="block text-[14px] leading-tight text-muted-foreground">{p.note}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <h3 className="border-t border-border pt-4 text-[17px] font-bold">Buyer</h3>
        <Field label="Name" htmlFor="company">
          <Input id="company" value={form.company} onChange={(e) => set({ company: e.target.value })}
            placeholder="Any script" autoComplete="off" />
        </Field>
        <Field label="Country" htmlFor="jurisdiction">
          <Select value={form.jurisdiction || "none"} onValueChange={(v) => set({ jurisdiction: v === "none" ? "" : v })}>
            <SelectTrigger id="jurisdiction" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              {reference?.jurisdictions.map((j) => (
                <SelectItem key={j.iso2} value={j.iso2}><Flag code={j.iso2} /> {j.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Owners and directors" htmlFor="ubos" hint="One name per line">
          <textarea id="ubos" rows={2} value={form.ubos} onChange={(e) => set({ ubos: e.target.value })}
            className="w-full resize-y border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Optional" />
        </Field>

        <h3 className="border-t border-border pt-4 text-[17px] font-bold">Shipment</h3>
        <Field label="HS code" htmlFor="hs"
          hint={hsInfo ? <>Tier {hsInfo.tier} · {hsInfo.description}</> : !sixDigits ? "Six digits"
            : !realChapter ? <span className="text-destructive">Not a valid HS code. The first two digits must be 01–97, not 77.</span>
            : "Not on item list"}>
          <Input id="hs" list="hs-list" inputMode="numeric" value={form.hs} maxLength={6}
            onChange={(e) => set({ hs: e.target.value.replace(/\D/g, "").slice(0, 6) })} aria-invalid={!hsValid} />
          <datalist id="hs-list">
            {reference?.hs_codes.map((h) => (
              <option key={h.hs} value={h.hs}>{`Tier ${h.tier} · ${h.description}`}</option>
            ))}
          </datalist>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Field label="Exporter" htmlFor="exporter">
            <Select value={form.exporter} onValueChange={(v) => set({ exporter: v })}>
              <SelectTrigger id="exporter" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {reference?.exporters.map((x) => (
                  <SelectItem key={x.code} value={x.code}>
                    <Flag code={x.code} /> {x.name}{!x.bundled && <span className="text-faint"> · live</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Transit country" htmlFor="via">
            <Select value={form.intermediary} onValueChange={(v) => set({ intermediary: v })}>
              <SelectTrigger id="via" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {reference?.intermediaries.map((x) => (
                  <SelectItem key={x.code} value={x.code}><Flag code={x.code} /> {x.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 border border-border px-3 py-2">
          <span>
            <span className="block text-[17px] font-semibold">Live data</span>
            <span className="block text-[14px] text-muted-foreground">
              {form.live ? "Eurostat · a few seconds" : "Snapshot · instant"}
            </span>
          </span>
          <Switch checked={form.live} onCheckedChange={(v) => set({ live: v })} aria-label="Live data" />
        </label>

        {/* Sticks to the bottom of the sidebar (desktop) or the screen (phone), so Run is always in reach */}
        <div className="sticky bottom-0 -mx-4 -mb-4 space-y-1.5 border-t border-border bg-card px-4 pb-4 pt-3 lg:mx-0 lg:bg-background lg:px-0">
          <Button type="submit" className="w-full" size="lg" variant={upToDate && !loading ? "outline" : "default"} disabled={loading || blocked !== null}
            aria-describedby={blocked ? "run-blocked" : undefined}>
            {loading ? <SpinnerGapIcon className="animate-spin" /> : <CrosshairIcon />}
            {loading ? "Running assessment…" : upToDate ? "Run again" : "Run assessment"}
          </Button>
          {blocked && !loading && <p id="run-blocked" className="text-[14px] text-muted-foreground">{blocked}</p>}
        </div>
      </form>
    </Panel>
  );
}
