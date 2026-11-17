"""Module 3: decision matrix and the export compliance briefing.

The briefing is assembled by rules from Modules 1 and 2, so every legal citation
is fixed text rather than generated. If an OpenAI-compatible LLM endpoint is
configured, it only adds a short analyst narrative grounded in the same facts.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json

import httpx

from . import config

LEVELS = {
    "STOP": {"level": 4, "title": "Sanctions match: do not proceed"},
    "HOLD": {"level": 3, "title": "Possible sanctions match: hold for manual review"},
    "RED FLAG": {"level": 3, "title": "Enhanced due diligence mandatory"},
    "ELEVATED": {"level": 2, "title": "Enhanced due diligence recommended"},
    "NAME ONLY": {"level": 2, "title": "Route not checked: only the name was screened"},
    "STANDARD": {"level": 1, "title": "Standard due diligence"},
}
# A sanctions match ends the transaction: these steps replace the due-diligence list
STOP_ACTIONS = [
    "Stop the shipment and any payment now.",
    "Escalate to the export control officer and legal counsel with the listed name.",
    "Record the outcome, the match and the lists checked in the compliance file.",
]
EDD_HOLD = "Do not ship until enhanced due diligence is complete."


# Required by law for battlefield items (Art. 12g Reg. 833/2014), not a judgement call
NO_RUSSIA_ACTION = "Check the contract has the Art. 12g No-Russia clause with enforceable remedies."


def _short_edd(chpl: bool) -> list[str]:
    """The first due-diligence steps in one line each, for the action box; the briefing has the full list."""
    return (["Get a signed end-use statement naming the final consignee, end use and location."]
            + ([NO_RUSSIA_ACTION] if chpl else [])
            + ["Run corporate due diligence on the buyer, its owners and directors."])
REVIEW_ACTION = "Check each listed match on the Buyer tab and record whether it is the same entity, with the reason."
ENTITY_LABEL = {"CLEAN": "No match", "PARTIAL": "Possible match", "MATCH": "Match"}
ROLE = {"Company": "Buyer", "UBO / director": "Owner or director"}  # the app's words for the screening roles
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SOURCES = [
    {"label": "EU List of Common High Priority Items (Feb 2024)",
     "url": "https://finance.ec.europa.eu/document/download/5a2494db-d874-4e2b-bf2a-ec5a191d2dc0_en"},
    {"label": "Council Regulation (EU) No 833/2014 (consolidated)", "url": "https://eur-lex.europa.eu/eli/reg/2014/833/oj"},
    {"label": "Regulation (EU) 2021/821 (Dual-Use Regulation)", "url": "https://eur-lex.europa.eu/eli/reg/2021/821/oj"},
    {"label": "Außenwirtschaftsgesetz (AWG)", "url": "https://www.gesetze-im-internet.de/awg_2013/"},
    {"label": "BAFA: Export control", "url": "https://www.bafa.de/EN/Foreign_Trade/Export_Control/export_control_node.html"},
    {"label": "Eurostat Comext (DS-045409)", "url": "https://ec.europa.eu/eurostat/web/international-trade-in-goods/database"},
    {"label": "UN Comtrade", "url": "https://comtradeplus.un.org/"},
    {"label": "EU Consolidated Financial Sanctions List",
     "url": "https://data.europa.eu/data/datasets/consolidated-list-of-persons-groups-and-entities-subject-to-eu-financial-sanctions"},
    {"label": "US OFAC SDN List", "url": "https://sanctionssearch.ofac.treas.gov/"},
    {"label": "UN Security Council Consolidated List", "url": "https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list"},
]

SYSTEM_PROMPT = """You are a senior export-control analyst writing for a German exporter's compliance board.
Write the 'Analyst assessment' paragraph of a compliance briefing on a proposed export.

Ground rules:
- Use ONLY the facts in the JSON you are given. Do not invent figures, entities, dates or listings.
- The legal frame is the German Foreign Trade and Payments Act (AWG) and Ordinance (AWV), BAFA practice,
  Council Regulation (EU) No 833/2014 (incl. Art. 12 anti-circumvention and Art. 12g 'No-Russia clause' for
  Annex XL Common High Priority Items) and Regulation (EU) 2021/821. Cite only these, and only where the facts support it.
- Keep route risk (country-level trade anomaly) separate from entity risk (sanctions screening). A country-level surge
  shows that a route is unusual, not that this buyer is involved.
- No sanctions match on a critical route is NOT reassurance: shell companies are often unlisted.
- Plain, precise English. 120-180 words. One paragraph, no headings, no bullet points, no preamble."""


def decide(entity: dict, route: dict, classification: dict) -> dict:
    notes = []
    if entity["status"] == "MATCH":
        code = "STOP"
    elif entity["status"] == "PARTIAL":
        code = "HOLD"
    elif route.get("no_data"):
        code = "NAME ONLY"  # a clean name is not a clean shipment when the route was never checked
    elif route["band"] == "CRITICAL":
        code = "RED FLAG"
    elif route["band"] == "HIGH":
        code = "ELEVATED"
    else:
        code = "STANDARD"
    if entity["status"] == "CLEAN" and route["band"] in ("CRITICAL", "HIGH"):
        notes.append("A clean sanctions screening does not offset route risk: shell companies are often unlisted.")
    if route.get("no_data"):
        notes.append("No trade data could be fetched for this item and route. Run the assessment again later.")
    elif route.get("no_baseline"):
        notes.append("No pre-war trade to compare with: the statistical parts of route risk are missing.")
    if classification["chpl"] and code not in ("RED FLAG", "ELEVATED", "STOP"):  # a step there, moot on a Stop
        notes.append("Art. 12g No-Russia clause is mandatory for this item at any risk level.")
    cleared = sum((m.get("review") or {}).get("decision") == "different"
                  for s in entity.get("subjects", []) for m in s["matches"])
    if cleared:
        notes.append(f"{cleared} listed match{'es' if cleared > 1 else ''} cleared as a different entity; reasons are in the briefing.")
    level = dict(LEVELS[code])
    edd = _short_edd(classification["chpl"])
    actions = {"STOP": list(STOP_ACTIONS), "RED FLAG": [EDD_HOLD] + edd, "ELEVATED": edd}.get(code, [])
    if entity.get("unreviewed") and code in ("STOP", "HOLD"):
        # A name hit is not yet an identification: the officer confirms or clears it (after stopping, for a match)
        actions.insert(1 if code == "STOP" else 0, REVIEW_ACTION)
    if code == "STOP" and entity.get("subjects"):
        # The title follows the match behind the stop, not open hits on other names
        confirmed = any(s.get("confirmed") and s["status"] == "MATCH" for s in entity["subjects"])
        level["title"] = "Sanctions match confirmed: do not proceed" if confirmed else "Likely sanctions match: do not proceed"
    # `required`: steps the law requires, which the action box never folds away
    return {"code": code, **level, "notes": notes, "actions": actions,
            "required": [s for s in actions if s == NO_RUSSIA_ACTION]}


def _standing(subj: dict) -> list[dict]:
    """Matches the officer has not cleared as a different entity; a confirmed one first, since it is the finding."""
    standing = [m for m in subj["matches"] if (m.get("review") or {}).get("decision") != "different"]
    return sorted(standing, key=lambda m: (m.get("review") or {}).get("decision") != "same")


def _money(v: float, unit: str = "EUR") -> str:
    sym = "€" if unit == "EUR" else "$"
    a = abs(v)
    # The app's format: "€1.2B", "€3.4M", "€84K", "€4.3K", "€950", "€3.45"
    if a >= 1e9:
        return f"{sym}{v / 1e9:.1f}B"
    if a >= 1e6:
        return f"{sym}{v / 1e6:.1f}M"
    if a >= 1e3:
        return f"{sym}{v / 1e3:.1f}K" if a < 1e4 and v % 1e3 else f"{sym}{v / 1e3:.0f}K"
    return f"{sym}{v:,.0f}" if a >= 10 else f"{sym}{v:.2f}"


def _hs(code: str) -> str:
    """The app's HS format: 8542.31."""
    return f"{code[:4]}.{code[4:]}"


def _findings(ctx: dict) -> list[dict]:
    a, e, c, q = ctx["route"], ctx["entity"], ctx["classification"], ctx["query"]
    partner, hs, unit = q["intermediary_name"], _hs(c["hs"]), ctx["series"].get("unit", "EUR")
    exporter = q["exporter_name"]
    out = []

    def add(severity: str, area: str, text: str) -> None:
        out.append({"severity": severity, "area": area, "text": text})

    for subj in e["subjects"]:
        standing = _standing(subj)
        if subj["status"] != "CLEAN" and standing:
            m = standing[0]
            since = f"; listed since {m['listed_since']}" if m.get("listed_since") else ""
            how = "is confirmed by the officer as" if subj.get("confirmed") else "resembles"
            add("critical" if subj["status"] == "MATCH" else "high", "Buyer",
                f"{ROLE.get(subj['role'], subj['role'])} '{subj['name']}' {how} '{m['name']}' ({', '.join(m['lists'])}) at "
                f"{m['score']:.0f}% similarity{since}.")
    if e["status"] == "CLEAN":
        add("info", "Buyer", f"No match and no possible match (80% similarity or more) on the EU, US and UN lists "
                             f"for the {len(e['subjects'])} name{'s' if len(e['subjects']) > 1 else ''} screened ({e['source']}).")

    if c["chpl"]:
        add("high", "Item", f"HS {hs} ({c['description'].lower()}) is a Tier {c['tier']} Common High Priority Item (EU battlefield item list).")

    if a["emergent"]:
        peak = max(a["points"], key=lambda p: p["value"])
        add("high", "Route", f"New flow: no {exporter} exports of HS {hs} to {partner} in 2017–21, "
                             f"then {_money(peak['value'], unit)} in {peak['year']}.")
    elif a["multiplier"] is not None:
        txt = (f"Exports vs pre-war: {a['multiplier']:.1f}× ({_money(a['post_mean'], unit)} a year since 2022 "
               f"vs {_money(a['baseline']['mean'], unit)} a year in 2017–21).")
        if a["z_max"] is not None:
            where = "far above" if a["z_max"] > a["threshold"] else "within"
            txt += f" Peak year {a['z_max_year']}: {where} the pre-war range."
        add({"CRITICAL": "high", "HIGH": "high", "MODERATE": "medium"}.get(a["band"], "info"), "Route", txt)
    if a["note"]:
        add("info", "Route", a["note"])

    if a["russia_ratio"] is not None:
        drop = (1 - a["russia_ratio"]) * 100
        if a["diversion_pattern"]:
            add("high", "Route", f"Direct exports of HS {hs} to Russia fell {drop:.0f}% over the same years while exports to {partner} rose: "
                                 "a typical diversion pattern.")
        elif drop > 50:
            add("info", "Route", f"Direct exports to Russia fell {drop:.0f}%, with no matching rise to {partner}.")

    mo = ctx.get("monthly")
    if mo and mo["ytd"]["ratio"] is not None and mo["ytd"]["value"] > 0:
        y, r = mo["ytd"], mo["ytd"]["ratio"]
        span = MONTHS[0] + (f"–{MONTHS[y['through_month'] - 1]}" if y["through_month"] > 1 else "")
        # Same wording as the app: "2026 Jan–Aug vs 2021: -88%", with the flow it measures
        add("high" if r >= 2 else "info", "Monthly exports",
            f"Exports to {partner}, {y['year']} {span} vs {y['reference_year']}: {(r - 1) * 100:+.0f}%." + (" Still elevated." if r >= 2 else ""))

    uv = ctx.get("unit_values")
    if uv and uv["flag"]:
        add("medium", "Price", f"Price per kg since 2022: {uv['change']:.1f}× pre-war "
                               f"({_money(uv['post'], unit)}/kg vs {_money(uv['baseline'], unit)}/kg). "
                               "Ask exactly what is being shipped.")

    mi = ctx.get("mirror")
    if mi:
        if mi.get("gap") is not None and mi["gap"] >= 0.3:
            add("medium", "Partner's figures", f"{mi['gap_year']}: {partner} reported receiving {mi['gap'] * 100:.0f}% less than "
                                    "Germany reported shipping. Possible re-routing or misdeclaration in transit.")
        if mi.get("onward_multiplier") is not None and mi["onward_multiplier"] >= 2:
            add("high", "Partner's figures", f"{partner}'s own exports of HS {hs} to Russia since 2022: {mi['onward_multiplier']:.1f}× pre-war.")

    prof = a.get("jurisdiction_profile")
    if prof:
        add("medium" if prof["exposure"] >= 9 else "info", "Transit country", f"{partner}: {prof['rationale']}")
    sens = a["sensitivity"]
    if a["custom_weights"]:
        add("info", "Method", f"Custom weights: route risk {a['score']} {a['band'].capitalize()}; default weights "
                              f"give {sens['default']['score']} {sens['default']['band'].capitalize()}.")
    elif sens["equal"]["band"] != a["band"]:
        add("info", "Method", f"Equal weights change the band: route risk "
                              f"{sens['equal']['score']} {sens['equal']['band'].capitalize()}.")
    order = {"critical": 0, "high": 1, "medium": 2, "info": 3}
    return sorted(out, key=lambda f: order[f["severity"]])


def _legal(ctx: dict) -> list[str]:
    e, c, v = ctx["entity"], ctx["classification"], ctx["verdict"]
    lists = {li for s in e["subjects"] for m in _standing(s)[:1] if s["status"] != "CLEAN" for li in m["lists"]}
    out = []
    if lists & {"EU", "UN"}:
        out.append("EU/UN listing: making goods or funds available is prohibited (asset freeze, e.g. Art. 2 Reg. "
                   "(EU) 269/2014). Freeze, escalate and report: BAFA for economic resources, Deutsche Bundesbank for funds.")
    elif "OFAC" in lists:
        out.append("US OFAC SDN listing only: EU law may not bar the sale, but US secondary-sanctions exposure "
                   "(E.O. 14024 as amended by E.O. 14114) is significant and EU banks are likely to refuse payment.")
    if c["chpl"]:
        out.append("Art. 12g Reg. 833/2014: the contract must prohibit re-export to Russia and for use in Russia, "
                   "with adequate remedies; a breach by the buyer must be reported to the competent authority (BAFA).")
    out.append("Art. 12 Reg. 833/2014: knowingly and intentionally participating in activities that circumvent the "
               "export bans is itself prohibited; ignoring clear red flags can establish knowledge.")
    if c["annex_i_indicative"]:
        out.append("If the item meets Annex I parameters (indicatively " + ", ".join(c["annex_i_indicative"])
                   + "), a BAFA licence is required for export to any third country (Art. 3 Reg. 2021/821).")
    out.append("§ 18 AWG: intentional breaches of EU export bans are criminal offences (imprisonment). § 19 AWG: "
               "negligent breaches are administrative offences punishable by fines, and the company itself can be "
               "fined under § 30 OWiG.")
    if v["level"] >= 3:
        out.append("Directive (EU) 2024/1226 harmonises criminal penalties for sanctions violations across the EU, "
                   "including for companies; check the current AWG text when assessing exposure.")
    if v["code"] == "STOP":
        out.append("Escalation goes to the export control officer (Ausfuhrverantwortliche/r), the board member "
                   "personally responsible for export compliance under BAFA practice.")
    return out


def _edd(ctx: dict) -> list[str]:
    c, a, v = ctx["classification"], ctx["route"], ctx["verdict"]
    if v["code"] == "STOP":
        return list(v["actions"])
    steps = []
    if v["code"] == "HOLD":
        steps.append("Resolve the possible match first: compare dates of birth, addresses, registration numbers and "
                     "ownership against the listing before anything ships.")
    steps.append("Obtain a signed end-use statement naming the final consignee, end use and location "
                 "(BAFA end-use certificate form for listed items).")
    if c["chpl"]:
        steps.append("Verify the Art. 12g No-Russia clause is in the contract with enforceable remedies "
                     "(termination, contractual penalty, audit right).")
    steps += [
        "Corporate due diligence on the buyer: incorporation date (shells formed since 2022 are a classic warning sign), capital, "
        "real premises, web presence, staff and fit between its business and the order. Check the LEI register.",
        "Identify and screen beneficial owners and directors; look for Russian or Belarusian links and recent "
        "ownership changes.",
        "Check the logistics and payment chain: freight forwarder, final routing, payments from third parties or "
        "Russia-linked banks, unusual prepayment.",
    ]
    if a["band"] in ("CRITICAL", "HIGH") or a["emergent"]:
        steps.append("Test the order's plausibility: does the volume fit demand in the buyer country, "
                     "given the route's unusual rise since 2022?")
        steps.append("Arrange post-shipment verification (delivery proof, site visit) and repeat screening before "
                     "each delivery.")
    steps.append("Record the assessment and action in the ICP audit trail; when classification is unclear, request "
                 "an AzG (Auskunft zur Güterliste) from BAFA.")
    return steps


def _limitations(ctx: dict) -> list[str]:
    years = ctx["series"]["years"]
    return [
        "Route risk is a country × HS code indicator: it shows an unusual route, not that this buyer is involved.",
        f"Annual data lags 6–12 months (latest year: {years[-1] if years else 'n/a'}); monthly data about two months. "
        f"Exporter-reported figures ({ctx['series'].get('source', 'Eurostat')}) are used because transit countries "
        "under-report onward flows.",
        "Sanctions screening cannot catch new shells or nominee directors; a clean result is not clearance.",
        "Built on open data; not legal advice.",
    ]


async def _narrative(ctx: dict, findings: list[dict]) -> str | None:
    if not (config.LLM_API_KEY and config.LLM_BASE_URL and config.LLM_MODEL):
        return None
    facts = {
        "query": ctx["query"], "verdict": ctx["verdict"], "classification": ctx["classification"],
        "route_score": ctx["route"]["score"], "route_band": ctx["route"]["band"],
        "entity_status": ctx["entity"]["status"], "findings": [f["text"] for f in findings],
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{config.LLM_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
                json={"model": config.LLM_MODEL, "temperature": 0.2, "max_tokens": 600,
                      "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                                   {"role": "user", "content": json.dumps(facts, ensure_ascii=False)}]},
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"].strip()
            return text or None
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None


def _route_label(scores: dict) -> str:
    """A Low score without a pre-war baseline is missing data, not low risk (same rule as the app)."""
    if scores.get("route_no_baseline") and scores["route_band"] == "LOW":
        return "No baseline"
    return scores["route_band"].capitalize()


def _recorded(r: dict) -> str:
    """ " (recorded 2026-11-16 09:30 UTC by J. Doe)", or less when the time or the name is missing."""
    parts = ([f"recorded {r['at'][:16].replace('T', ' ')} UTC"] if r.get("at") else []) + ([f"by {r['by']}"] if r.get("by") else [])
    return f" ({' '.join(parts)})" if parts else ""


def _markdown(m: dict) -> str:
    lines = [
        f"# {m['title']}",
        f"**Ref:** {m['ref']}  |  **Date:** {m['date']}  |  **{m['marking']}**",
        "",
        f"**Subject:** {m['subject']}",
        "",
        "## Bottom line",
        m["bluf"],
        "",
        f"Route risk: **{m['scores']['route']}/100 ({_route_label(m['scores'])})**  |  "
        f"Sanctions screening: **{ENTITY_LABEL[m['scores']['entity_status']]}"
        f"{'' if m['scores']['entity_status'] == 'CLEAN' else f' (best similarity {m["scores"]["best_similarity"]:.0f}%)'}**",
        "",
    ]
    if m.get("narrative"):
        lines += ["## Analyst assessment", m["narrative"], ""]
    lines += ["## Findings"] + [f"- **{f['area']}:** {f['text']}" for f in m["findings"]] + [""]
    if m["reviews"]:
        lines += ["## Match decisions"] + [
            f"- {r['subject']} / {r['listed_name']} ({', '.join(r['lists'])}): "
            f"{'Same entity' if r['decision'] == 'same' else 'Not the same entity'}. Reason: {r['reason']}{_recorded(r)}"
            for r in m["reviews"]] + [""]
    lines += ["## Legal exposure"] + [f"- {x}" for x in m["legal"]] + [""]
    heading = "Required actions" if m["verdict"]["code"] == "STOP" else "Enhanced due diligence"
    lines += [f"## {heading}"] + [f"{i}. {x}" for i, x in enumerate(m["edd"], 1)] + [""]
    lines += ["## Limitations"] + [f"- {x}" for x in m["limitations"]] + [""]
    lines += ["## Sources"] + [f"- [{s['label']}]({s['url']})" for s in m["sources"]]
    return "\n".join(lines) + "\n"


async def build(ctx: dict) -> dict:
    q, v = ctx["query"], ctx["verdict"]
    today = dt.date.today()
    digest = hashlib.sha1(json.dumps({k: q[k] for k in ("company", "hs", "exporter", "intermediary")},
                                     sort_keys=True).encode()).hexdigest()[:4].upper()
    findings = _findings(ctx)
    subject = f"Export of HS {_hs(ctx['classification']['hs'])} from {q['exporter_name']} to {q['company']}"
    if q["jurisdiction_name"] == q["intermediary_name"]:
        subject += f", {q['intermediary_name']}"
    elif q.get("jurisdiction"):
        subject += f" ({q['jurisdiction_name']}) through {q['intermediary_name']}"
    else:
        subject += f" through {q['intermediary_name']}"  # buyer country not given: say nothing rather than "unknown"
    memo = {
        "title": "Export compliance briefing",
        "ref": f"AEG-{today:%Y%m%d}-{digest}",
        "date": today.isoformat(),
        "marking": "For compliance use · Not legal advice",
        "subject": subject,
        "verdict": v,
        # Sentence case like the app's badges: "Red flag: ...", not the API code "RED FLAG"
        "bluf": f"{v['code'].capitalize()}: {v['title']}." + (" " + " ".join(v["notes"]) if v["notes"] else ""),
        "scores": {"route": ctx["route"]["score"], "route_band": ctx["route"]["band"],
                   "route_no_baseline": bool(ctx["route"].get("no_baseline")),
                   "entity": ctx["entity"]["score"], "entity_status": ctx["entity"]["status"],
                   "best_similarity": ctx["entity"]["best_score"]},
        "findings": findings,
        # The officer's decisions on listed matches, so the briefing is the record
        "reviews": [{"subject": s["name"], "listed_name": m["name"], "lists": m["lists"], **m["review"]}
                    for s in ctx["entity"]["subjects"] for m in s["matches"] if m.get("review")],
        "legal": _legal(ctx),
        "edd": _edd(ctx),
        "limitations": _limitations(ctx),
        "sources": SOURCES,
    }
    narrative = await _narrative(ctx, findings)
    memo["narrative"] = narrative
    memo["engine"] = "rules+llm" if narrative else "rules"
    memo["markdown"] = _markdown(memo)
    return memo
