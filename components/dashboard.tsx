"use client";

import { CubeIcon, GlobeHemisphereEastIcon, ImageIcon, MapTrifoldIcon, PauseIcon, PlayIcon, SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { lazy3D, Loading3D, VIEW_H } from "@/components/three/lazy";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader, type View } from "@/components/app-header";
import { AssessmentSummary, type Section, SectionTabs } from "@/components/assessment-summary";
import type { BatchState } from "@/components/batch-view";
import { CorridorPanel, Segmented } from "@/components/corridor-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyFindings, MemoPanel } from "@/components/memo-panel";
import { More } from "@/components/more";
import { Panel } from "@/components/panel";
import { PRESETS, QueryPanel, toRequest, type FormState } from "@/components/query-panel";
import { EntityPanel, LegalPanel, type OnReview } from "@/components/result-panels";
import { RouteScene } from "@/components/route-scene";
import { Tour } from "@/components/tour";
import { api, ApiUnavailable, InvalidInput } from "@/lib/api";
import { hsCode, monthLabel } from "@/lib/format";
import { INTERMEDIARY_CODES } from "@/lib/corridors";
import { usePersisted, usePersistedText } from "@/lib/persisted";
import type { Assessment, BatchRowOut, Memo, Reference, Review, Weights } from "@/lib/types";
import { decisionsParam, MAX_DECISIONS, readUrl, writeUrl } from "@/lib/url-state";
import { useReconnect } from "@/lib/use-reconnect";
import { cn } from "@/lib/utils";
import { ViewBoundary } from "@/components/view-boundary";
import { scrollMode, useReducedMotion } from "@/lib/use-reduced-motion";

// The loaders hold the space of the view they stand in for (h-120 = 480px)
const LOADER_H = "h-120";
// The one-column layout, below Tailwind's lg breakpoint (the same range as max-lg)
const BELOW_LG = "(width < 64rem)";
const Item3D = lazy3D(() => import("@/components/three/item-3d").then((m) => m.Item3D), "3D model", VIEW_H.item);
// The chart library is only needed on the Route tab and in the calculator
const RouteSection = dynamic(() => import("@/components/route-section").then((m) => m.RouteSection), {
  ssr: false, loading: () => <Loading3D className={LOADER_H} label="Loading charts…" />,
});
// Radar and Batch are separate views: keep them out of the assessment's first load
const RadarView = dynamic(() => import("@/components/radar-view").then((m) => m.RadarView), {
  ssr: false, loading: () => <Loading3D className={LOADER_H} label="Loading radar…" />,
});
const BatchView = dynamic(() => import("@/components/batch-view").then((m) => m.BatchView), {
  ssr: false, loading: () => <Loading3D className={LOADER_H} label="Loading batch screening…" />,
});
const CalculatorView = dynamic(() => import("@/components/calculator-view").then((m) => m.CalculatorView), {
  ssr: false, loading: () => <Loading3D className={LOADER_H} label="Loading calculator…" />,
});

const Network3D = lazy3D(() => import("@/components/three/network-3d").then((m) => m.Network3D), "Connections", VIEW_H.network);

const FIELD_LABEL = { company: "buyer name", hs: "HS code", via: "transit country" } as const;

/** One of the built-in examples, rather than a buyer someone is actually screening. */
function isExample(a: Assessment) {
  return PRESETS.some((p) => p.form.company === a.query.company && p.form.hs === a.query.hs
    && p.form.intermediary === a.query.intermediary && p.form.exporter === a.query.exporter
    && p.form.jurisdiction === (a.query.jurisdiction ?? "") && a.query.ubos.length === 0);
}

/** The buyer is one of the built-in examples' (no owners added), not one someone entered. */
function exampleBuyer(f: FormState) {
  return !f.ubos.trim() && PRESETS.some((p) => p.form.company === f.company && p.form.jurisdiction === f.jurisdiction);
}

/** Decisions on matches hold only for the same names and buyer country: the country changes what matches. */
function sameScreening(a: FormState, b: FormState) {
  const names = (f: FormState) => [f.company.trim(), ...f.ubos.split(/\n|;/).map((s) => s.trim()).filter(Boolean)].join("\n");
  return names(a) === names(b) && a.jurisdiction === b.jurisdiction;
}

export function Dashboard() {
  const [view, setView] = useState<View>("assess");
  const [section, setSection] = useState<Section>("overview");
  const [sceneView, setSceneView] = usePersisted<"3d" | "flat">("aegis-scene-view", "3d", ["3d", "flat"]);
  const [mapView, setMapView] = usePersisted<"globe" | "flat">("aegis-corridor-view", "flat", ["globe", "flat"]);
  const [motion, setMotion] = usePersisted<"play" | "pause">("aegis-motion", "play", ["play", "pause"]);
  const reduceMotion = useReducedMotion();
  // Looping vehicles in the map and the illustration can be paused; reduced motion stills them already
  const motionSwitch = !reduceMotion && <Segmented value={motion} onChange={setMotion} options={[
    { value: "play", label: "Play", icon: <PlayIcon weight="fill" className="size-3.5" /> },
    { value: "pause", label: "Pause", icon: <PauseIcon weight="fill" className="size-3.5" /> },
  ]} />;
  const [touring, setTouring] = useState(false);
  // Phones: the form opens above the result on demand instead of sitting thousands of pixels below it
  const [formOpen, setFormOpen] = useState(false);
  // A field to focus once the form has rendered (a handoff from Radar or Batch that still needs an input)
  const focusField = useRef<string | null>(null);
  useEffect(() => {
    const field = focusField.current;
    if (!field || !formOpen) return;
    focusField.current = null;
    document.querySelector('[data-tour="query"]')?.scrollIntoView({ behavior: scrollMode(), block: "start" });
    document.getElementById(field)?.focus({ preventScroll: true });
  });
  // Who records match decisions (kept on this device), and the decisions last downloaded or printed in a briefing
  const [reviewer, setReviewer] = usePersistedText("aegis-reviewer");
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [form, setForm] = useState<FormState>(PRESETS[0].form);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [offline, setOffline] = useState(false);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [pending, setPending] = useState("");
  const [batch, setBatch] = useState<BatchState>({ text: "", result: null });
  // The form a Radar click ran with the buyer kept from the previous assessment, so the result can say so
  const [keptBuyer, setKeptBuyer] = useState<FormState | null>(null);
  const lastRun = useRef<FormState>(PRESETS[0].form);
  // The officer's decisions on listed matches. They belong to the names screened and the buyer's country
  // (which the matching uses), and are dropped when any of those change.
  const reviews = useRef<Review[]>([]);
  const reviewsFor = (f: FormState) => (sameScreening(f, lastRun.current) ? reviews.current : []);
  // The decisions before the latest one, put back if the re-run that records it is refused
  const undoReview = useRef<{ id: number; prev: Review[] } | null>(null);
  // The same form as state, so the Run button can tell during render whether the result on screen is for it
  const [ranForm, setRanForm] = useState<FormState>(PRESETS[0].form);
  // The form last sent; it differs from ranForm while a run is pending or after one failed
  const [requested, setRequested] = useState<FormState>(PRESETS[0].form);
  // The address the page was opened with (read once) and whether its state has been applied yet
  const initialUrl = useRef<string | null>(null);
  const urlApplied = useRef(false);
  // The first address written after load replaces the opened one; later changes add history entries
  const urlPushes = useRef(false);
  const seq = useRef(0);
  const scrollToTabs = useRef(false);

  // The briefing comes with every result: Overview opens on its key findings. Answers for an older run are dropped.
  const fetchMemo = useCallback(async (f: FormState, w: Weights | null, id: number) => {
    setMemoLoading(true);
    setMemoError(null);
    try {
      const m = await api.memo(toRequest(f, w, reviews.current));
      if (id === seq.current) setMemo(m);
    } catch (e) {
      if (id !== seq.current) return;
      if (e instanceof ApiUnavailable) setOffline(true);
      setMemoError(e instanceof Error ? e.message : "The briefing could not be drafted.");
    } finally {
      if (id === seq.current) setMemoLoading(false);
    }
  }, []);

  const load = useCallback(async (f: FormState, id: number, w: Weights | null, reveal = false) => {
    try {
      const a = await api.assess(toRequest(f, w, reviews.current));
      if (id !== seq.current) return;
      if (undoReview.current?.id === id) undoReview.current = null;
      setAssessment(a);
      setRanForm(f);
      setOffline(false);
      setMemo(null);
      void fetchMemo(f, w, id);
      // A new assessment opens at the top of its result: below the form on narrow screens, the page top on wide ones
      if (reveal) {
        requestAnimationFrame(() => window.matchMedia(BELOW_LG).matches
          ? document.querySelector('[data-tour="verdict"]')?.scrollIntoView({ behavior: scrollMode(), block: "start" })
          : window.scrollTo({ top: 0, behavior: scrollMode() }));
      }
    } catch (e) {
      if (id !== seq.current) return;
      // A refused decision must not ride along with every later run
      if (undoReview.current?.id === id) {
        reviews.current = undoReview.current.prev;
        undoReview.current = null;
        // The re-run dropped the briefing request for the result still on screen: ask again
        void fetchMemo(f, w, id);
      }
      if (e instanceof ApiUnavailable) setOffline(true);
      else setError(e instanceof Error ? e : new Error("The assessment could not be run."));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [fetchMemo]);

  // `decisions` replaces the recorded match decisions (a link or Back); otherwise they are kept while the names stay the same
  const run = useCallback((f: FormState, w: Weights | null = weights, reveal = false, decisions?: Review[]) => {
    const id = ++seq.current;
    if (decisions) reviews.current = decisions;
    else if (!sameScreening(f, lastRun.current)) reviews.current = [];
    lastRun.current = f;
    setRequested(f);
    setPending(f.company);
    setLoading(true);
    setError(null);
    void load(f, id, w, reveal);
  }, [load, weights]);

  const rerun = (patch: Partial<FormState>) => {
    const f = { ...lastRun.current, ...patch };
    setForm(f);
    run(f);
    return f;
  };

  // A handoff that lacks a field opens the form at it instead of running with a value the user never gave
  const openAt = (patch: Partial<FormState>, field: string) => {
    setForm({ ...lastRun.current, ...patch });
    setFormOpen(true);
    focusField.current = field;
  };

  // Hovering something that opens an assessment asks for it ahead of the click (the same request `rerun` sends)
  const prefetch = useCallback((patch: Partial<FormState>) => {
    const f = { ...lastRun.current, ...patch };
    api.prefetchAssess(toRequest(f, weights, sameScreening(f, lastRun.current) ? reviews.current : []));
  }, [weights]);
  // Radar changes only the route: the buyer, its country and the recorded decisions stay
  const radarPatch = (hs: string, partner: string, exporter: string): Partial<FormState> =>
    ({ hs, intermediary: partner, exporter, live: false });
  // A batch row is a whole case: nothing comes from the previous run (the batch always ships from its own exporter)
  const batchPatch = (r: BatchRowOut): Partial<FormState> => ({
    company: r.company, jurisdiction: r.country ?? "", ubos: "", hs: r.hs ?? "", live: false,
    exporter: batch.result?.exporter ?? "DE",
    intermediary: r.intermediary ?? (r.country && INTERMEDIARY_CODES.includes(r.country) ? r.country : ""),
  });
  const prefetchFromRadar = useCallback((hs: string, partner: string, exporter: string) => {
    if (!exampleBuyer(lastRun.current)) prefetch(radarPatch(hs, partner, exporter));
  }, [prefetch]);
  const assessFromRadar = (hs: string, partner: string, exporter: string) => {
    setView("assess");
    // No buyer of the user's own yet: ask for one rather than screen an example buyer on this route
    if (exampleBuyer(lastRun.current)) openAt({ ...radarPatch(hs, partner, exporter), company: "", jurisdiction: "", ubos: "" }, "company");
    else {
      setSection("overview");
      setKeptBuyer(rerun(radarPatch(hs, partner, exporter)));
      window.scrollTo({ top: 0, behavior: scrollMode() });
    }
  };

  const assessFromBatch = (r: BatchRowOut) => {
    setView("assess");
    const patch = batchPatch(r);
    const missing = !patch.hs ? "hs" : !patch.intermediary ? "via" : null;
    if (missing) openAt(patch, missing);
    else {
      setSection("overview");
      rerun(patch);
      window.scrollTo({ top: 0, behavior: scrollMode() });
    }
  };
  const prefetchFromBatch = (r: BatchRowOut) => {
    const patch = batchPatch(r);
    if (patch.hs && patch.intermediary) prefetch(patch);
  };

  const reweigh = (w: Weights | null) => {
    setWeights(w);
    run(lastRun.current, w);
  };

  const generateMemo = () => void fetchMemo(lastRun.current, weights, seq.current);

  // A decision re-runs the assessment: the server recomputes the screening status, the verdict and the briefing
  const review: OnReview = (subject, matchIds, decision, reason = "") => {
    const prev = reviews.current;
    const at = new Date().toISOString();
    const by = reviewer.trim() || null;
    reviews.current = [
      ...prev.filter((r) => !(r.subject === subject && matchIds.includes(r.match_id))),
      ...(decision ? matchIds.map((id) => ({ subject, match_id: id, decision, reason, at, by })) : []),
    ].slice(0, MAX_DECISIONS);
    run(lastRun.current);
    undoReview.current = { id: seq.current, prev };
  };

  const startTour = () => {
    setView("assess");
    setSection("overview");
    setFormOpen(true);
    setTouring(true);
  };

  const onFailure = (e: Error) => (e instanceof ApiUnavailable ? setOffline(true) : setError(e));

  useEffect(() => {
    initialUrl.current ??= window.location.search;
    const url = readUrl(initialUrl.current);
    api.reference().then(setReference).catch(onFailure);
    // A cut-off or hand-edited case link: open the form with what it held and say what to fix, rather than run an example
    if (url.incomplete) {
      const { form: held, fields } = url.incomplete;
      const named = fields.map((f) => FIELD_LABEL[f]);
      const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : named[0];
      // Empty fields make a link incomplete; filled-in ones that fail a check make it invalid
      const params = new URLSearchParams(initialUrl.current);
      const empty = fields.filter((f) => !params.get(f)?.trim()).length;
      const message = empty === fields.length ? `This link is incomplete: add the ${list}, then run.`
        : `This link has ${empty ? "a missing or invalid" : "an invalid"} ${list}. Fix it in the form, then run.`;
      lastRun.current = held;
      queueMicrotask(() => {
        setForm(held);
        setFormOpen(true);
        if (url.view) setView(url.view);
        setError(new InvalidInput(message, fields[0]));
        setLoading(false);
        urlApplied.current = true;
      });
      return;
    }
    const start = url.form ?? PRESETS[0].form;
    lastRun.current = start;
    reviews.current = url.reviews ?? [];
    // The static page always renders the defaults; apply a shared link's form, view and tab after mount
    queueMicrotask(() => {
      if (url.form) {
        setForm(url.form);
      }
      if (url.view) setView(url.view);
      if (url.section) setSection(url.section);
      urlApplied.current = true;
    });
    const id = ++seq.current;
    api.assess(toRequest(start, null, reviews.current))
      .then((a) => {
        if (id !== seq.current) return;
        setAssessment(a);
        setRanForm(start);
        setRequested(start);
        // A link to a tab opens at that tab on phones, not at the top of the verdict (scrolled once it renders)
        // Not for Stop, Hold or Red flag: the verdict above the tabs would be scrolled out of sight
        if (url.section && !["STOP", "HOLD", "RED FLAG"].includes(a.verdict.code) && window.matchMedia(BELOW_LG).matches) scrollToTabs.current = true;
        void fetchMemo(start, null, id);
      })
      .catch((e: Error) => { if (id === seq.current) onFailure(e); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  }, [fetchMemo]); // fetchMemo never changes, so this still runs once

  // Keep the address bar in step with the result on screen, so the link can be shared or bookmarked.
  // Nothing is written while a result loads (history never pairs the old company with a new tab) or before the first one.
  useEffect(() => {
    if (!urlApplied.current || loading || !assessment) return;
    writeUrl(assessment, view, section, urlPushes.current, !!assessment && !isExample(assessment));
    urlPushes.current = true;
  }, [assessment, view, section, loading]);

  // Back and Forward restore the view, tab and assessment of that history entry
  useEffect(() => {
    const onPop = () => {
      const url = readUrl(window.location.search);
      setView(url.view ?? "assess");
      setSection(url.section ?? "overview");
      const held = (window.history.state as { decisions?: Review[] } | null)?.decisions;
      const decisions = url.reviews ?? held ?? [];
      if (url.form && (JSON.stringify(url.form) !== JSON.stringify(lastRun.current)
        || JSON.stringify(decisions) !== JSON.stringify(reviews.current))) {
        setForm(url.form);
        run(url.form, weights, false, decisions);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [run, weights]);

  // When the backend comes back, reload the reference data and re-run the last assessment
  useReconnect(offline, () => {
    setOffline(false);
    if (!reference) api.reference().then(setReference).catch(onFailure);
    run(lastRun.current);
  });

  const a = assessment;
  // Decisions on screen that no downloaded or printed briefing holds yet: closing the page would lose them
  const decisionsKey = JSON.stringify(a?.query.reviews ?? []);
  const unsaved = !!a?.query.reviews?.length && exportedKey !== decisionsKey;

  useEffect(() => {
    if (!assessment || !scrollToTabs.current) return;
    scrollToTabs.current = false;
    document.querySelector('[data-tour="sections"]')?.scrollIntoView({ block: "start" });
  }, [assessment]);

  // Decisions live in the link until a briefing is downloaded or printed: ask before the page closes
  useEffect(() => {
    if (!unsaved) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  // An example is highlighted only while the form and the result on screen are exactly that example
  const active = JSON.stringify(form) === JSON.stringify(ranForm)
    ? PRESETS.findIndex((p) => JSON.stringify(p.form) === JSON.stringify(ranForm)) : null;
  // The form was edited after the result on screen was run: the result no longer answers it
  const stale = !!a && JSON.stringify(form) !== JSON.stringify(ranForm);
  const dimStale = stale && !loading && "opacity-60";
  const partner = a?.query.intermediary_name ?? "";
  const exporterName = a?.query.exporter_name ?? "";
  // No cartoon of the shipment beside a Stop or Hold: the deal must not go ahead
  const scene = a?.verdict.code !== "STOP" && a?.verdict.code !== "HOLD";

  return (
    <div className="flex min-h-screen flex-col">
      {/* Focus moves directly: a #content fragment would add a history entry and fire popstate, which restores views */}
      <a href="#content" onClick={(e) => { e.preventDefault(); document.getElementById("content")?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-sm">Skip to content</a>
      <AppHeader reference={reference} view={view} onView={setView} onTour={startTour} />

      {view !== "assess" && (
        <main id="content" tabIndex={-1} className="mx-auto w-full max-w-app flex-1 px-4 py-5 outline-none sm:px-6">
          {view === "radar" ? <ViewBoundary key={view} label="Radar"><RadarView onAssess={assessFromRadar} onPrefetch={prefetchFromRadar} tiers={reference?.tiers} /></ViewBoundary>
            : view === "calc" ? <ViewBoundary key={view} label="Calculator"><CalculatorView reference={reference} from={assessment} example={!!assessment && isExample(assessment)} /></ViewBoundary>
            : <ViewBoundary key={view} label="Batch screening"><BatchView state={batch} onState={setBatch} onAssess={assessFromBatch} onPrefetch={prefetchFromBatch} /></ViewBoundary>}
        </main>
      )}

      {view === "assess" && (
        <main className="mx-auto grid w-full max-w-app flex-1 grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* First in the page order too, so keyboard users reach the form before the result */}
          {/* Height cap = viewport minus the sticky header and page padding, so the sticky Run footer is on screen from the start */}
          <aside className={cn("max-lg:-scroll-mt-tabs lg:self-start lg:border-r lg:border-border lg:pr-5",
            !formOpen && assessment && "max-lg:hidden")} data-tour="query">
            {/* Typing keeps the form open on phones, even if the first result arrives meanwhile */}
            <QueryPanel reference={reference} form={form} setForm={(f) => { setForm(f); setFormOpen(true); }}
              onRun={(f) => {
                setFormOpen(false);
                // A new assessment or example opens on Overview, not on the tab the last one was left at
                setSection("overview");
                run(f, weights, true);
                // On phones the form (and the focused Run button) is hidden: give focus to the result
                if (window.matchMedia(BELOW_LG).matches) document.getElementById("content")?.focus({ preventScroll: true });
              }} onPrefetch={(f) => api.prefetchAssess(toRequest(f, weights, reviewsFor(f)))}
              loading={loading} active={active} upToDate={!!a && !stale} />
          </aside>

          <div id="content" tabIndex={-1} className={cn("min-w-0 space-y-4 outline-none transition-opacity", loading && a && "opacity-60")}>
            {offline ? (
              <div className="flex items-center gap-2 callout-warning border px-4 py-2 text-sm">
                <SpinnerGapIcon className="size-4 shrink-0 animate-spin text-warning-ink" aria-hidden /> <span role="status">{/* The page retries on its own, so drop the message's "try again" advice */}{new ApiUnavailable().message.replace(/,? then try again\.| Try again in a moment\./, ".")} Reconnecting…</span>
              </div>
            ) : error && (
              <div className="flex flex-wrap items-center gap-2 border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm" role="alert">
                <WarningIcon className="size-4 shrink-0 text-destructive" /> <span className="flex-1">{error.message}</span>
                {error instanceof InvalidInput ? (
                  // Resending the same input cannot help: open the form at the field to fix
                  <Button size="xs" variant="outline" onClick={() => {
                    setFormOpen(true);
                    requestAnimationFrame(() => (document.getElementById(error.field ?? "") ?? document.getElementById("company"))?.focus());
                  }}>Fix in form</Button>
                ) : <Button size="xs" variant="outline" onClick={() => run(lastRun.current)}>Try again</Button>}
              </div>
            )}

            {/* Always mounted, so screen readers announce the text when a rerun starts */}
            <p role="status" className={loading && a ? "flex items-center gap-2 border border-border bg-card px-4 py-2 text-sm" : "sr-only"}>
              {loading && a && <>
                <SpinnerGapIcon className="size-4 shrink-0 animate-spin" aria-hidden />
                Running assessment for {pending}.{pending !== a.query.company && ` On screen: ${a.query.company}.`}
              </>}
            </p>

            {!a ? (
              loading && !offline ? (
                <div className="space-y-4">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <SpinnerGapIcon className="size-4 animate-spin" aria-hidden /> Running assessment…
                  </p>
                  <Skeleton className="h-59 border border-border" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-105 border border-border" />
                </div>
              ) : (
                <div className="grid h-96 place-items-center border border-border bg-card text-sm text-muted-foreground">
                  {offline ? "Waiting for the analysis service…" : "No assessment yet. Fill in the form and choose Run assessment."}
                </div>
              )
            ) : (
              <>
                {/* Always mounted, so screen readers announce it when the form first changes; not dimmed itself */}
                <p role="status" className={stale && !loading ? "flex items-center gap-2 callout-warning border px-4 py-2 text-sm" : "sr-only"}>
                  {stale && !loading && <>
                    <WarningIcon className="size-4 shrink-0 text-warning-ink" aria-hidden />
                    Form changed. This result is for {a.query.company}, HS {hsCode(a.classification.hs)}, {exporterName} to {partner}. Run assessment to update.
                  </>}
                </p>
                <div className={cn("transition-opacity", dimStale)}>
                  <AssessmentSummary a={a} onSection={setSection} editing={formOpen} onEdit={() => setFormOpen((o) => !o)}
                    example={isExample(a)} keptBuyer={!!keptBuyer && JSON.stringify(keptBuyer) === JSON.stringify(ranForm)} />
                </div>
                <SectionTabs value={section} onChange={setSection} a={a} />
                <div id="section-panel" role="tabpanel" aria-labelledby={`tab-${section}`} className={cn("space-y-4 transition-opacity", dimStale)}>

                {section === "overview" && (
                  <ViewBoundary label="Overview" resetKey={a.generated_at}>
                    <KeyFindings memo={loading ? null : memo} loading={memoLoading || loading} error={memoError}
                      onRetry={generateMemo} onSection={setSection} />
                  </ViewBoundary>
                )}

                {section === "counterparty" && (
                  <ViewBoundary label="Buyer" resetKey={a.generated_at}>
                    <EntityPanel e={a.entity} company={a.query.company} jurisdiction={a.query.jurisdiction}
                      // After a failed run the screen shows an older buyer than the last request: no decisions until it matches
                      onReview={review} busy={loading || ranForm !== requested}
                      linkFull={!!a.query.reviews?.length && decisionsParam(a.query.reviews) === null}
                      reviewer={reviewer} onReviewer={setReviewer} exported={!unsaved} />
                    <More label="Show connections" holds="network">
                      <Panel title="Connections" tour="network">
                        <Network3D e={a.entity} company={a.query.company} jurisdiction={a.query.jurisdiction} />
                      </Panel>
                    </More>
                  </ViewBoundary>
                )}

                {section === "goods" && (
                  <ViewBoundary label="Item" resetKey={a.generated_at}>
                    <LegalPanel c={a.classification} />
                    <More label="Show 3D model" holds="item3d">
                      <Panel title="3D model" tour="item3d">
                        <Item3D hs={a.classification.hs} description={a.classification.description} />
                      </Panel>
                    </More>
                  </ViewBoundary>
                )}

                {section === "route" && (
                  <ViewBoundary label="Route" resetKey={a.generated_at}>
                    <RouteSection a={a} reference={reference} onWeights={reweigh}
                      onCalculator={() => { setView("calc"); window.scrollTo({ top: 0 }); }} />
                    {/* Context for the route, after the evidence and folded away: Overview keeps to the findings */}
                    <More label={scene ? "Show freight corridors and shipment illustration" : "Show freight corridors"} holds={scene ? "map scene" : "map"}>
                    <Panel title="Freight corridors" tour="map"
                      action={<>{motionSwitch}<Segmented value={mapView} onChange={setMapView} options={[
                        { value: "globe", label: "Globe", icon: <GlobeHemisphereEastIcon className="size-4" /> },
                        { value: "flat", label: "Flat", icon: <MapTrifoldIcon className="size-4" /> },
                      ]} /></>}>
                      <CorridorPanel view={mapView} playing={motion === "play"} exporter={a.query.exporter} exporterName={exporterName} flows={a.flows}
                        intermediary={a.query.intermediary} intermediaryName={partner} onSelect={(code) => rerun({ intermediary: code })} />
                    </Panel>
                    {scene && <Panel title="Shipment illustration"
                      bodyClassName="px-2 pb-4 pt-3 sm:px-4" tour="scene"
                      action={<>{motionSwitch}<Segmented value={sceneView} onChange={setSceneView} options={[
                        { value: "3d", label: "3D", icon: <CubeIcon className="size-4" /> },
                        { value: "flat", label: "Flat", icon: <ImageIcon className="size-4" /> },
                      ]} /></>}>
                      <RouteScene a={a} view={sceneView} playing={motion === "play"} />
                    </Panel>}
                    </More>
                  </ViewBoundary>
                )}

                {section === "briefing" && (
                  <ViewBoundary label="Briefing" resetKey={a.generated_at}>
                    <div data-tour="memo">
                      <MemoPanel memo={memo} loading={memoLoading} error={memoError} onGenerate={generateMemo} stale={loading}
                        onExport={() => setExportedKey(decisionsKey)} />
                    </div>
                  </ViewBoundary>
                )}
                </div>
              </>
            )}
          </div>

        </main>
      )}

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-app flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 text-sm text-muted-foreground sm:px-6">
          <span>
            Data: Eurostat Comext{reference?.monthly.months && ` (to ${monthLabel(reference.monthly.months[1])})`} · EU, US and UN
            sanctions lists{reference && ` (${reference.sanctions.retrieved})`} · EU battlefield item list{reference && ` (${reference.chpl_version})`} · UN Comtrade · GLEIF
          </span>
          <span>Not legal advice · Built by Tuan Dung Nguyen</span>
        </div>
      </footer>

      {touring && <Tour onClose={() => setTouring(false)} onSection={setSection} />}
    </div>
  );
}
