import type { ReactNode } from "react";
import { COMPONENT_RULE, componentLabel, NONE } from "@/lib/format";
import type { Reference } from "@/lib/types";

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-1.5 text-base font-bold">{children}</h3>;
}

/** The methodology text, loaded only when the dialog opens. */
export function MethodologyBody({ reference }: { reference: Reference | null }) {
  const [b0, b1] = reference?.baseline_years ?? [2017, 2021];
  return (
    <div className="text-sm leading-relaxed text-foreground">
      <H>Route risk vs sanctions screening</H>
      <p>
        The two scores answer different questions and are never blended. <b>Route risk</b>: are exports of this HS
        code from the EU exporter to this transit country unusual since 2022? <b>Sanctions screening</b>: do the buyer
        or its owners resemble a listed name? A country-level rise shows that a route is in use, not that a given
        buyer is involved; reading it as proof about one buyer would be an ecological fallacy. No free customs
        microdata (bills of lading) exists, so open data cannot close this gap.
      </p>
      <p className="mt-2">
        The action therefore escalates on either score: a sanctions match stops the deal; a critical route triggers
        mandatory enhanced due diligence <i>even with no sanctions match</i>, because new shell companies are rarely
        listed.
      </p>

      <H>Unusual years</H>
      <p>
        Baseline = annual exports in {b0}–{b1}, before the full-scale invasion. For each later year:
      </p>
      <pre className="my-2 bg-muted px-3 py-2 text-sm">Z = (X − μ) / σ      unusual if Z &gt; {reference?.z_threshold ?? 2}</pre>
      <p>
        μ and σ are the baseline mean and sample standard deviation; X is the year&apos;s export value. With only
        five baseline points σ is imprecise, and near-zero baselines produce very large Z values; the score
        therefore caps the Z contribution and adds exports vs pre-war and the excess value. 2020 (COVID) widens
        σ and makes the test conservative. HS 2022 subheadings with no HS 2017 equivalent have no comparable
        baseline and are scored without statistical components.
      </p>

      <H>Route risk (0–100)</H>
      <table className="w-full text-sm">
        <tbody>
          {Object.entries(reference?.weights ?? {}).map(([k, w]) => (
            <tr key={k} className="border-b border-border align-top">
              <td className="py-1.5 pr-3 text-muted-foreground">{componentLabel[k] ?? k}</td>
              <td className="py-1.5 pr-3 text-right">{w}</td>
              <td className="py-1.5">{COMPONENT_RULE[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2">Bands: 0–24 low · 25–49 moderate · 50–74 high · 75–100 critical.</p>
      <p className="mt-2">
        The weights are a modelling choice: <i>Adjust weights</i> re-scores the route with yours (rescaled to 100),
        and every result also reports route risk with all six components weighted equally.{reference && <> Across
        the {reference.robustness.corridors} {reference.robustness.exporter} routes in the snapshot, the band is the
        same under equal weights in{" "}
        {Math.round((100 * reference.robustness.band_unchanged) / reference.robustness.corridors)}% of cases;</>}{" "}
        where it differs, the panel says so.
      </p>
      <p className="mt-2">
        The transit country component uses no analyst ratings: EAEU membership and a land border with Russia are
        verifiable facts, and the designation count comes from the EU and US lists in the snapshot (organisations
        with an address in the country, designated under Russia or Belarus programmes).
      </p>

      <H>More signals</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b>Monthly exports:</b> Eurostat, since January 2019. Standard deviations from the pre-war months (to January
          2022), and the current year so far vs the same months of 2021. Months also move with seasons and single
          large orders.
        </li>
        <li>
          <b>Price per kg:</b> export value ÷ net mass, pooled for the pre-war years and since 2022. A shift of 2× or
          more is shown as a finding: it can point to misdeclared goods, or simply a different item mix.
        </li>
        <li>
          <b>Mirror check:</b> the transit country&apos;s own UN Comtrade reports (imports from Germany, exports of
          the same item to Russia) next to Germany&apos;s reported exports. Gaps also arise from valuation (CIF/FOB),
          timing and origin rules, so treat them as prompts for questions.
        </li>
        <li>
          <b>LEI register:</b> the buyer is looked up in GLEIF (CC0). Incorporation after 24 February 2022, a lapsed
          record or a parent in Russia or Belarus is flagged; many small traders have no LEI at all.
        </li>
        <li>
          <b>Radar and batch:</b> the same rules for all 600 item × transit country routes, and for up to 200
          buyers at once.
        </li>
        <li>
          <b>Calculator:</b> the same scoring code run on figures you enter, to see which inputs drive a result.
        </li>
        <li>
          <b>3D views:</b> the globe, skyline, monthly landscape, batch cube and connections show the same numbers as
          the flat charts and tables. Heights and positions are linear; perspective shrinks far marks, so read exact
          values from tooltips or tables. The shipment and item models are generic illustrations.
        </li>
      </ul>

      <H>Data</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b>Trade:</b> Eurostat Comext (dataset DS-045409, EUR), exports <i>reported by the EU exporter</i>. EU
          customs data is timely and reliable; transit countries tend to under-report onward flows to Russia (the
          mirror-statistics problem). Annual data lags 6–12 months. Snapshot: Germany and the EU-27
          ({reference?.trade.retrieved ?? NONE}, {reference?.trade.years[0]}–{reference?.trade.years.at(-1)}). Live
          data: Eurostat directly, with UN Comtrade (USD) as fallback.
        </li>
        <li>
          <b>Sanctions:</b> the official publications: EU Consolidated Financial Sanctions List, US OFAC SDN
          List and UN Security Council Consolidated List ({reference?.sanctions.entities.toLocaleString("en-US") ?? NONE}{" "}
          persons and organisations, snapshot {reference?.sanctions.retrieved ?? NONE}). Names are transliterated from Cyrillic, stripped of legal forms
          (OOO, LLC, FZE…) and compared with Levenshtein similarity: a match from 93%, a possible match from 80%; names from 70% are listed for review.
          Shared generic words (&quot;trading&quot;, &quot;electronics&quot;) cannot carry a match on their own.
        </li>
        <li>
          <b>Items:</b> EU List of Common High Priority Items, CHPL ({reference?.chpl_version ?? "Feb 2024"}), Annex XL to
          Reg. (EU) 833/2014. Annex I entries of Reg. 2021/821 are indicative: HS codes and control-list entries do
          not map one-to-one.
        </li>
      </ul>

      <H>Limitations</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>Annual, country-level data cannot see individual shipments, routing or end users.</li>
        <li>Legitimate demand also grew since 2022 (e.g. EU firms relocating to Central Asia).</li>
        <li>Designation counts reflect where enforcement has looked so far, not only where evasion happens.</li>
        <li>Sanctions screening misses unlisted shells and nominee owners; a clean result is not clearance.</li>
        <li>
          The shipment illustration and the freight corridor map show typical modes and main corridors, not
          observed shipments. Company marks are generated monograms, not real logos.
        </li>
        <li>Built on open data; this is not legal advice.</li>
      </ul>
    </div>
  );
}
