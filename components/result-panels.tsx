"use client";

import { ArrowSquareOutIcon, BuildingsIcon, SlidersHorizontalIcon, UserCircleIcon, UserIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/components/panel";
import { StatusBadge, ToneIcon, sentenceCase } from "@/components/status";
import { CompanyMark, Flag, Name, regionName } from "@/components/visuals";
import { ProductArt } from "@/components/product-art";
import { RegistryLookup } from "@/components/registry-lookup";
import { COMPONENT_RULE, componentLabel, entityTone, entityLabel, itemTone, NONE, REASON_MIN, SCREENING_RULE, routeStatus, toneVar } from "@/lib/format";
import type { Classification, Entity, Match, Review, Route, Weights } from "@/lib/types";

export function LegalPanel({ c }: { c: Classification }) {
  const tone = itemTone(c);
  return (
    <Panel title="Export control classification" tour="legal" className="h-full">
      <div className="flex items-start justify-between gap-3">
        <ProductArt hs={c.hs} size={64} />
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold">{c.hs.slice(0, 4)}.{c.hs.slice(4)}</div>
          {c.description && <p className="mt-1 text-sm leading-snug text-foreground">{c.description}</p>}
        </div>
        <StatusBadge tone={tone}>{c.chpl ? `Tier ${c.tier}` : c.status === "NOT LISTED" ? "Not on item list" : sentenceCase(c.status)}</StatusBadge>
      </div>
      {c.tier_label && <p className="mt-2 text-sm text-muted-foreground">{c.tier_label}</p>}
      {c.annex_i_indicative.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Annex I entries (possible)</span>
          {c.annex_i_indicative.map((x) => (
            <Badge key={x} variant="outline" className="text-sm">{x}</Badge>
          ))}
        </div>
      )}
      <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm leading-snug text-foreground">
        {c.obligations.map((o) => (
          <li key={o} className="flex gap-2">
            <span aria-hidden className="mt-[0.55em] size-1 shrink-0 bg-faint" />
            <span>{o}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Name similarity with a bar: red at a match (93%+), orange for a possible match (80%+), grey below. */
function SimilarityBar({ score }: { score: number }) {
  const tone = score >= 93 ? toneVar.critical : score >= 80 ? toneVar.serious : "var(--chart-baseline)";
  return (
    <div className="flex items-center justify-end gap-2" title={score >= 93 ? "Match" : score >= 80 ? "Possible match" : "Review"}>
      <div className="h-1.5 min-w-4 basis-16 rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.max(4, score)}%`, background: tone }} />
      </div>
      <span className="w-9 text-right font-semibold">{score.toFixed(0)}%</span>
    </div>
  );
}

/** Display names for the screening roles the API sends. */
const ROLE: Record<string, string> = { Company: "Buyer", "UBO / director": "Owner or director" };

/** Records the officer's decision (or, with `null`, undoes it) on one or more hits of one screened name. */
export type OnReview = (subject: string, matchIds: string[], decision: Review["decision"] | null, reason?: string) => void;

/** The match whose decision was just saved or undone: its controls take focus again once the re-run returns
 *  (the old ones were disabled, then replaced, which would drop keyboard users at the top of the page).
 *  It lapses after 15 s, so a re-run that lands while the Buyer tab is closed cannot steal focus later. */
let refocus: { key: string; until: number } | null = null;

/** Phones get one card per hit instead of the table; only one layout is mounted, so each decision exists once. */
const NARROW = "(max-width: 639px)";
function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const q = window.matchMedia(NARROW);
      q.addEventListener("change", onChange);
      return () => q.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}

const when = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Who records the decisions: the "Reviewed by" value and its setter, shared by every reason form. */
type Reviewer = { reviewer: string; onReviewer?: (name: string) => void };

/** The reason a decision needs, with its rule in view; Escape cancels. With no reviewer name yet, the form asks
 *  for it too, so the officer never has to scroll back to "Reviewed by" (far up the page on a phone). */
function ReasonForm({ label, placeholder, save, busy, reviewer, onReviewer, onSave, onCancel }: Reviewer & {
  label: string; placeholder: string; save: string; busy: boolean; onSave: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const id = useId();
  const noName = !!onReviewer && !reviewer.trim();
  // Latched, so the name field does not vanish on the first keystroke
  const [askName, setAskName] = useState(noName);
  if (noName && !askName) setAskName(true);
  const length = [...reason.trim()].length; // characters, as the server counts them (an emoji is one)
  const ok = length >= REASON_MIN && !noName;
  return (
    <form className="space-y-1.5" onSubmit={(ev) => { ev.preventDefault(); if (ok) onSave(reason.trim()); }}
      onKeyDown={(ev) => { if (ev.key === "Escape") { ev.preventDefault(); onCancel(); } }}>
      {askName && onReviewer && (
        <>
          {/* Same wording as the Reviewed by field at the top of the panel */}
          <p className="text-sm">
            <label htmlFor={`${id}-name`} className="font-semibold">Reviewed by</label>{" "}
            <span id={`${id}-name-hint`} className="text-muted-foreground">Saved with each decision</span>
          </p>
          <Input id={`${id}-name`} value={reviewer} onChange={(ev) => onReviewer(ev.target.value)} maxLength={80} autoFocus
            autoComplete="name" placeholder="Your name" aria-describedby={`${id}-name-hint`} className="bg-background px-2 dark:bg-background" />
        </>
      )}
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <Input id={id} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={200} autoFocus={!askName}
        placeholder={placeholder} aria-describedby={`${id}-rule`}
        className="bg-background px-2 dark:bg-background" />
      <p id={`${id}-rule`} className="text-sm text-muted-foreground">
        {noName ? <span className="text-warning-ink">Enter your name first. </span> : null}
        At least {REASON_MIN} characters{length && length < REASON_MIN ? ` (${REASON_MIN - length} to go)` : ""}. Esc cancels.
      </p>
      <div className="flex gap-1.5">
        <Button size="xs" type="submit" disabled={!ok || busy}>{save}</Button>
        <Button size="xs" type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/** The officer's call on one listed match: same entity (confirms the stop) or not (clears it), always with a reason. */
function MatchDecision({ subject, m, onReview, busy, reviewer, onReviewer }: Reviewer & { subject: string; m: Match; onReview: OnReview; busy: boolean }) {
  const [open, setOpen] = useState<Review["decision"] | null>(null);
  // Set while the re-run that records (or undoes) this decision is on its way; cleared when any run ends
  const [saving, setSaving] = useState(false);
  const [wasBusy, setWasBusy] = useState(busy);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (!busy) setSaving(false);
  }
  const box = useRef<HTMLDivElement>(null);
  const me = `${m.id}::${subject}`;
  useEffect(() => {
    if (refocus?.key === me && !busy) {
      if (Date.now() < refocus.until) box.current?.focus();
      refocus = null;
    }
  });
  const decide = (decision: Review["decision"] | null, why?: string) => {
    refocus = { key: me, until: Date.now() + 15_000 };
    setSaving(true);
    onReview(subject, [m.id], decision, why);
  };
  return (
    <div ref={box} tabIndex={-1} className="mt-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {saving && busy ? (
        <p className="text-sm text-muted-foreground" role="status">Saving the decision…</p>
      ) : m.review ? (
        <div className="text-sm">
          <span className={m.review.decision === "same" ? "font-semibold text-destructive" : "font-semibold text-foreground"}>
            {m.review.decision === "same" ? "Same entity" : "Not the same entity"}
          </span>
          <span className="text-muted-foreground">: {m.review.reason}</span>
          {(m.review.at || m.review.by) && (
            <span className="text-faint"> · {m.review.at ? `recorded ${when(m.review.at)}` : "recorded"}{m.review.by ? ` by ${m.review.by}` : ""}</span>
          )}{" "}
          <button type="button" disabled={busy} onClick={() => decide(null)}
            aria-label={`Undo the decision on ${m.name}`}
            className="font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50 pointer-coarse:inline-block pointer-coarse:py-3">
            Undo
          </button>
        </div>
      ) : !open ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" data-choice="same" onClick={() => setOpen("same")} aria-label={`Same entity: ${m.name}`}
            className="border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive dark:bg-transparent dark:hover:bg-destructive/10">Same entity</Button>
          <Button size="xs" variant="outline" data-choice="different" onClick={() => setOpen("different")} aria-label={`Not the same: ${m.name}`}>Not the same</Button>
        </div>
      ) : (
        <ReasonForm busy={busy} reviewer={reviewer} onReviewer={onReviewer} save="Save decision"
          label={open === "same" ? "Why is it the same entity?" : "Why is it not the same entity?"}
          placeholder={open === "same" ? "e.g. same registration number" : "e.g. different country and founding date"}
          onSave={(why) => { decide(open, why); setOpen(null); }} onCancel={() => {
            // The form held focus; hand it back to the button that opened it rather than drop it to the page
            setOpen(null);
            requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-choice="${open}"]`)?.focus());
          }} />
      )}
    </div>
  );
}

/** One reason for every open hit of a name, when none of them is the buyer (common for a bank's many subsidiaries). */
function ClearAll({ subject, ids, onReview, onBulk, busy, reviewer, onReviewer }: Reviewer & {
  subject: string; ids: string[]; onReview: OnReview; onBulk: (ids: string[]) => void; busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return open ? (
    <div className="mt-2 border border-border p-3">
      <ReasonForm busy={busy} reviewer={reviewer} onReviewer={onReviewer} save={`Save for all ${ids.length}`} label={`Why is none of the ${ids.length} possible matches the same entity?`}
        placeholder="e.g. none shares the buyer's country or registration number"
        onSave={(why) => {
          refocus = { key: `${ids[0]}::${subject}`, until: Date.now() + 15_000 };
          onReview(subject, ids, "different", why);
          onBulk(ids);
          setOpen(false);
        }} onCancel={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }} />
    </div>
  ) : (
    <Button ref={trigger} size="xs" variant="outline" className="mt-2 h-auto min-h-6 whitespace-normal py-1 text-left" disabled={busy} onClick={() => setOpen(true)}>
      Mark the {ids.length} possible matches as not the same
    </Button>
  );
}

function ListedName({ m }: { m: Match }) {
  const Icon = m.kind === "O" ? BuildingsIcon : UserIcon;
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={m.kind === "O" ? "Organisation" : "Person"} />
      <div className="min-w-0 wrap-anywhere">
        <a href={m.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-series-1 hover:underline pointer-coarse:py-3">
          <Name>{m.name}</Name> <ArrowSquareOutIcon className="size-3 shrink-0 text-faint" />
        </a>
        {m.matched_on && <div className="text-sm text-faint">Matched on {m.matched_on}</div>}
      </div>
    </div>
  );
}

function Lists({ m }: { m: Match }) {
  return (
    <div className="flex flex-wrap gap-1">
      {m.lists.map((l) => <Badge key={l} variant="outline" className="text-sm">{l}</Badge>)}
    </div>
  );
}

/** Flags with their codes beside them, so the countries read without hovering. */
function Countries({ m }: { m: Match }) {
  if (m.countries.length === 0) return <span className="text-faint">{NONE}</span>;
  const shown = m.countries.slice(0, 3);
  return (
    <div className="flex flex-wrap items-center gap-1" title={shown.map((c) => regionName(c)).join(", ")}>
      {shown.map((c) => <Flag key={c} code={c} size={18} />)}
      <span className="text-sm uppercase text-muted-foreground">{shown.join(" ")}</span>
    </div>
  );
}

export function EntityPanel({ e, company, jurisdiction, onReview, busy = false, linkFull = false, reviewer = "", onReviewer, exported = false }: {
  e: Entity; company: string; jurisdiction: string | null; onReview?: OnReview; busy?: boolean;
  /** Too many decisions to fit in the address: they are on screen and in the briefing, but not in a copied link. */
  linkFull?: boolean;
  /** Who is recording the decisions (kept on this device) and whether the briefing with them was downloaded or printed. */
  reviewer?: string; onReviewer?: (name: string) => void; exported?: boolean;
}) {
  const narrow = useNarrow();
  useEffect(() => () => { refocus = null; }, []);
  const decisions = e.subjects.some((s) => s.matches.some((m) => m.review));
  // The last bulk clear, so one button undoes all of it; any other decision on that name drops it
  const [bulk, setBulk] = useState<{ subject: string; ids: string[] } | null>(null);
  const review: OnReview | undefined = onReview && ((subject, ids, decision, why) => {
    if (bulk?.subject === subject) setBulk(null);
    onReview(subject, ids, decision, why);
  });
  return (
    <Panel title="Sanctions screening" subtitle={SCREENING_RULE} tour="entity"
      action={<span className="text-sm text-faint">{e.source}</span>}>
      <div className="space-y-4">
        {onReview && onReviewer && (
          <div className="space-y-1.5 border-b border-border pb-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <label htmlFor="reviewer" className="font-semibold">Reviewed by</label>
              <Input id="reviewer" value={reviewer} onChange={(ev) => onReviewer(ev.target.value)} maxLength={80}
                placeholder="Your name" autoComplete="name"
                className="w-56 max-w-full bg-background px-2 dark:bg-background" />
              <span className="text-muted-foreground">Saved with each decision</span>
            </div>
            {decisions && (
              <p className={exported ? "text-sm text-muted-foreground" : "text-sm text-warning-ink"} role="status">
                {exported
                  ? "The briefing with these decisions has been downloaded."
                  : "Decisions are kept in this page's link only. Download the briefing to keep the record."}
              </p>
            )}
          </div>
        )}
        {e.subjects.map((s) => {
          // Hits that drive the verdict (80%+) need a decision; decided ones keep their undo. Once one of a name's
          // hits is confirmed, its other open hits no longer need one.
          const needs = (m: Match) => !!m.review || (!s.confirmed && m.score >= 80);
          const due = s.matches.filter(needs);
          const decided = due.filter((m) => m.review).length;
          // Bulk clearing covers possible matches only: a 93%+ hit always gets its own decision
          const openIds = due.filter((m) => !m.review && m.score < 93).map((m) => m.id);
          // Shown while every hit of the bulk clear is still marked not the same (a re-run or single undo ends it)
          const undoAll = bulk?.subject === s.name
            && bulk.ids.every((id) => s.matches.some((m) => m.id === id && m.review?.decision === "different")) ? bulk.ids : null;
          const decision = (m: Match) => review && (needs(m) ? (
            <MatchDecision key={m.review?.decision ?? "open"} subject={s.name} m={m} onReview={review} busy={busy} reviewer={reviewer} onReviewer={onReviewer} />
          ) : m.score < 80 && <p className="mt-1.5 text-sm text-faint">Below 80%: no decision needed</p>);
          return (
            <div key={s.role + s.name}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {s.role === "Company" ? <CompanyMark name={s.name} size={30} flagged={s.status !== "CLEAN"} />
                    : <UserCircleIcon weight="duotone" className="size-7.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <div className="text-sm text-faint">{ROLE[s.role] ?? s.role}</div>
                    <div className="truncate text-sm font-bold"><Name>{s.name}</Name></div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {due.length > 0 && (
                    <span className="text-sm text-muted-foreground">{decided} of {due.length} reviewed</span>
                  )}
                  {review && undoAll && (
                    <Button size="xs" variant="outline" disabled={busy} onClick={() => {
                      refocus = { key: `${undoAll[0]}::${s.name}`, until: Date.now() + 15_000 };
                      review(s.name, undoAll, null);
                    }}>Undo all {undoAll.length}</Button>
                  )}
                  <StatusBadge tone={entityTone[s.status]}>
                    {entityLabel[s.status]}{s.confirmed ? " · confirmed" : s.status !== "CLEAN" && ` · ${s.best_score.toFixed(0)}%`}
                  </StatusBadge>
                </div>
              </div>
              {review && openIds.length >= 2 && (
                <ClearAll subject={s.name} ids={openIds} onReview={review} onBulk={(ids) => setBulk({ subject: s.name, ids })}
                  busy={busy} reviewer={reviewer} onReviewer={onReviewer} />
              )}
              {s.matches.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">No names reached 70% similarity.</p>
              ) : (
                <>
                  {/* Phones: one card per hit, so lists, country and similarity sit next to the decision */}
                  {narrow ? (
                  <ul className="mt-2 divide-y divide-border border-y border-border">
                    {s.matches.map((m) => (
                      <li key={m.id} className="py-2.5 text-sm">
                        <ListedName m={m} />
                        {/* Indented to the name, past the icon, so each card has one left edge */}
                        <div className="pl-6">
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <Lists m={m} />
                            <Countries m={m} />
                            <span className="text-faint">{m.listed_since ? `Listed ${m.listed_since}` : "Listing date not given"}</span>
                          </div>
                          <div className="mt-1.5 flex justify-start"><SimilarityBar score={m.score} /></div>
                          {decision(m)}
                        </div>
                      </li>
                    ))}
                  </ul>
                  ) : (
                  <Table className="mt-2 min-w-160 table-fixed text-sm">
                    {/* Fixed columns sized to their content (a date needs ~6rem), so every name's table lines up */}
                    <colgroup>
                      <col /><col className="w-22" /><col className="w-28" /><col className="w-26" /><col className="w-32" />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Listed name</TableHead>
                        <TableHead>Lists</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Listed since</TableHead>
                        <TableHead className="text-right">Similarity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.matches.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-normal">
                            <ListedName m={m} />
                            {decision(m)}
                          </TableCell>
                          <TableCell><Lists m={m} /></TableCell>
                          <TableCell><Countries m={m} /></TableCell>
                          <TableCell>{m.listed_since || NONE}</TableCell>
                          <TableCell><SimilarityBar score={m.score} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}
                </>
              )}
            </div>
          );
        })}
        {linkFull && (
          <p className="text-sm text-warning-ink">
            Too many decisions to fit in the page address: a copied link opens without them. Download the briefing to keep the record.
          </p>
        )}
        {e.warning && <p className="text-sm text-warning-ink">{e.warning}</p>}
        <RegistryLookup name={company} country={jurisdiction} />
      </div>
    </Panel>
  );
}

export function ScoreBreakdown({ r, defaults, onWeights }: {
  r: Route;
  defaults: Weights;
  onWeights: (w: Weights | null) => void;
}) {
  const [adjust, setAdjust] = useState(false);
  const [draft, setDraft] = useState<Weights>(() =>
    Object.fromEntries(r.components.map((c) => [c.key, c.weight])));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const change = (key: string, value: number) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onWeights(next), 250);
  };
  const reset = () => {
    setDraft({ ...defaults });
    onWeights(null);
  };
  const { sensitivity: sens, jurisdiction_profile: jp } = r;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {r.custom_weights ? "Custom weights" : "Default weights"} · Route risk {r.score}
        </p>
        <div className="flex gap-1.5">
          {r.custom_weights && <Button size="xs" variant="ghost" onClick={reset}>Reset weights</Button>}
          <Button size="xs" variant={adjust ? "secondary" : "outline"} onClick={() => setAdjust(!adjust)} aria-expanded={adjust}>
            <SlidersHorizontalIcon /> {adjust ? "Done" : "Adjust weights"}
          </Button>
        </div>
      </div>

      {r.components.map((c) => {
        const na = c.points === null;
        const share = na ? 0 : (c.points! / c.weight) * 100;
        return (
          <div key={c.key}>
            <div className="mb-1 flex flex-wrap justify-between gap-3 text-sm">
              <span className={na ? "text-faint" : "text-muted-foreground"}>
                {componentLabel[c.key] ?? c.key}
                {COMPONENT_RULE[c.key] && <span className="block text-faint">{COMPONENT_RULE[c.key]}</span>}
              </span>
              <span className="shrink-0 self-end">
                {na ? <span className="text-faint">n/a</span> : <span className="text-foreground">{c.points!.toFixed(1)}</span>}
                <span className="text-faint"> / {c.weight.toFixed(0)}</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full" style={{ background: "color-mix(in srgb, var(--series-1) 14%, transparent)" }}>
              <div className="h-full w-full origin-left rounded-full transition-transform duration-500" style={{ transform: `scaleX(${share / 100})`, background: "var(--series-1)" }} />
            </div>
            {adjust && (
              <input type="range" min={0} max={50} step={1} value={Math.round(draft[c.key] ?? c.weight)}
                onChange={(e) => change(c.key, Number(e.target.value))}
                aria-label={`Weight for ${componentLabel[c.key] ?? c.key}`}
                className="mt-1.5 h-1 w-full cursor-pointer accent-series-1 pointer-coarse:h-11" />
            )}
          </div>
        );
      })}

      <div className="space-y-1 border-t border-border pt-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">With equal weights</span>
          <span className="inline-flex items-center gap-1.5">
            <ToneIcon tone={routeStatus(sens.equal.band, r.no_baseline).tone} className="size-3.5" />
            {sens.equal.score} {sentenceCase(routeStatus(sens.equal.band, r.no_baseline).label)}
          </span>
        </div>
        {r.custom_weights && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Default weights</span>
            <span className="inline-flex items-center gap-1.5">
              <ToneIcon tone={routeStatus(sens.default.band, r.no_baseline).tone} className="size-3.5" />
              {sens.default.score} {sentenceCase(routeStatus(sens.default.band, r.no_baseline).label)}
            </span>
          </div>
        )}
        {/* Only the exception needs saying: the equal-weights band is shown just above */}
        {sens.equal.band !== r.band && <p className="text-sm text-faint">Band changes with equal weights; read with care.</p>}
      </div>

      {jp && (
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="flex items-center gap-1.5 font-bold"><Flag code={jp.iso2} /> {jp.name} exposure</span>
            <span>{jp.exposure.toFixed(1)} / {jp.max}</span>
          </div>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {jp.factors.map((f) => (
              <li key={f.key} className="flex flex-wrap justify-between gap-3">
                <span>{f.label} <span className="text-faint">({f.detail})</span></span>
                <span className="shrink-0 whitespace-nowrap">{f.points.toFixed(1)} / {f.max}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
