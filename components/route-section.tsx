"use client";

/* The Route tab: charts and statistics. Loaded on demand, together with the chart library. */
import { CalculatorIcon, ChartBarIcon, CubeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { lazy3D } from "@/components/three/lazy";
import { Segmented } from "@/components/corridor-panel";
import { MirrorPanel, MonthlyPanel, PricePanel } from "@/components/analysis-panels";
import { FlowDiagram } from "@/components/flow-diagram";
import { Panel } from "@/components/panel";
import { ScoreBreakdown } from "@/components/result-panels";
import { AnomalyChart, DisplacementChart, SeriesTable } from "@/components/trade-charts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { monthLabel, pct, times } from "@/lib/format";
import type { Assessment, Reference, Weights } from "@/lib/types";

const Terrain3D = lazy3D(() => import("@/components/three/terrain-3d").then((m) => m.Terrain3D), "3D monthly chart", "h-[340px] sm:h-[400px]");

const MODE_LABEL: Record<string, string> = {
  demo: "snapshot",
  cached: "live data (cached)",
  live: "live data",
  fallback: "snapshot (live fetch failed)",
  unavailable: "no data",
};

export function RouteSection({ a, reference, onWeights, onCalculator }: {
  a: Assessment;
  reference: Reference | null;
  onWeights: (w: Weights | null) => void;
  onCalculator: () => void;
}) {
  const partner = a.query.intermediary_name;
  const exporterName = a.query.exporter_name;
  const [monthlyView, setMonthlyView] = useState<"chart" | "3d">("chart");
  return (
    <>
      <Panel title="Annual exports" tour="exports"
        subtitle={`${a.series.unit} · ${a.series.source} ${MODE_LABEL[a.series.mode] ?? a.series.mode}`}>
        {a.series.warning && <p className="mb-3 text-[15px] text-warning-ink">{a.series.warning}</p>}
        {a.route.points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No trade data for this combination.</p>
        ) : (
          <Tabs defaultValue="chart">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] tabular">
                <span><span className="text-muted-foreground">Exports vs pre-war </span>
                  <b>{a.route.multiplier !== null ? times(a.route.multiplier) : a.route.emergent ? "New flow" : "—"}</b></span>
                <span><span className="text-muted-foreground">Unusual years </span><b>{a.route.flagged_years.join(", ") || "none"}</b></span>
                <span><span className="text-muted-foreground">Direct exports to Russia </span>
                  <b>{a.route.russia_ratio !== null ? pct(a.route.russia_ratio - 1) : "—"}</b></span>
              </div>
              <TabsList className="h-7">
                <TabsTrigger value="chart" className="px-2.5 text-[14px]">Chart</TabsTrigger>
                <TabsTrigger value="table" className="px-2.5 text-[14px]">Table</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chart"><AnomalyChart route={a.route} partner={partner} unit={a.series.unit} /></TabsContent>
            <TabsContent value="table"><SeriesTable route={a.route} unit={a.series.unit} /></TabsContent>
          </Tabs>
        )}
        {a.route.note && <p className="mt-3 text-[15px] text-muted-foreground">{a.route.note}</p>}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel title="Route risk breakdown" tour="score">
          <ScoreBreakdown r={a.route} defaults={reference?.weights ?? {}} onWeights={onWeights} />
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onCalculator}>
            <CalculatorIcon /> Open in calculator
          </Button>
        </Panel>
        <Panel title={`Direct exports to Russia vs ${partner}`}>
          <DisplacementChart route={a.route} partner={partner} partnerCode={a.query.intermediary} unit={a.series.unit} />
          {a.route.diversion_pattern && (
            <p className="mt-2 text-[15px] text-muted-foreground">
              Direct exports to Russia fell while exports to {partner} rose: consistent with diversion.
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Monthly exports" tour="monthly"
        subtitle={a.monthly ? `${a.monthly.unit} · ${monthLabel(a.monthly.months[0])}–${monthLabel(a.monthly.latest)}${monthlyView === "3d" ? " · Above the yellow plane: unusual month" : ""}` : undefined}
        action={a.monthly && <Segmented value={monthlyView} onChange={setMonthlyView} options={[
          { value: "chart", label: "Chart", icon: <ChartBarIcon className="size-4" /> },
          { value: "3d", label: "3D", icon: <CubeIcon className="size-4" /> },
        ]} />}>
        {monthlyView === "3d" && a.monthly ? <Terrain3D m={a.monthly} partner={partner} /> : <MonthlyPanel m={a.monthly} />}
      </Panel>

      <Panel title="Cross-checks" tour="mirror">
        <Tabs defaultValue="mirror">
          <TabsList className="mb-3 h-auto flex-wrap justify-start">
            <TabsTrigger value="mirror" className="px-2.5 text-[15px]">Mirror check</TabsTrigger>
            <TabsTrigger value="price" className="px-2.5 text-[15px]">Price per kg</TabsTrigger>
            {a.sankey && <TabsTrigger value="flows" className="px-2.5 text-[15px]">All transit countries</TabsTrigger>}
          </TabsList>
          <TabsContent value="mirror">
            <MirrorPanel m={a.mirror} partner={partner} partnerCode={a.query.intermediary} />
          </TabsContent>
          <TabsContent value="price">
            <PricePanel u={a.unit_values} unit={a.series.unit} />
          </TabsContent>
          {a.sankey && (
            <TabsContent value="flows">
              <FlowDiagram s={a.sankey} exporterName={exporterName} hs={a.classification.hs} highlight={a.query.intermediary} />
            </TabsContent>
          )}
        </Tabs>
      </Panel>
    </>
  );
}
