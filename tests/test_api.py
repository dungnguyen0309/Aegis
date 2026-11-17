import re

import pytest
from fastapi.testclient import TestClient

from _lib import anomaly, hs_codes, memo
from _lib.names import normalize
from index import app

client = TestClient(app)

BASE = {"exporter": "DE", "live": False}


def assess(**kw):
    resp = client.post("/api/assess", json={**BASE, **kw})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_health_and_reference():
    assert client.get("/api/health").json()["status"] == "ok"
    ref = client.get("/api/reference").json()
    assert len(ref["hs_codes"]) == 50
    assert sum(ref["weights"].values()) == 100


@pytest.mark.parametrize("raw, expected", [
    ("OOO Радиоавтоматика", "radioavtomatika"),
    ("ALLIANCE FIRST TRADING L.L.C", "alliance first trading"),
    ("JSC Kalashnikov Concern", "kalashnikov concern"),
])
def test_normalize(raw, expected):
    assert normalize(raw) == expected


def test_hs_classification():
    chip = client.get("/api/hs/8542.31").json()
    assert chip["chpl"] and chip["tier"] == "1"
    assert any("12g" in o for o in chip["obligations"])
    toys = hs_codes.classify("950300")
    assert not toys["chpl"] and toys["status"] == "NOT LISTED"
    assert client.get("/api/hs/12").status_code == 422


def test_clean_buyer_on_critical_route_is_red_flag():
    a = assess(company="Northwind Components LLP", jurisdiction="KZ", ubos=["John Doe"],
               hs="848210", intermediary="KZ")
    assert a["entity"]["status"] == "CLEAN"
    assert a["route"]["band"] == "CRITICAL"
    assert a["route"]["diversion_pattern"]
    assert a["verdict"]["code"] == "RED FLAG"
    assert a["series"]["mode"] == "demo" and a["series"]["unit"] == "EUR"
    # "Mandatory" comes with its first steps in the action box: hold, end-use statement, (12g clause), corporate DD
    steps = a["verdict"]["actions"]
    assert steps[0].startswith("Do not ship") and "end-use statement" in steps[1] and "corporate due diligence" in steps[-1]
    assert len(steps) == (4 if a["classification"]["chpl"] else 3)
    assert any("12g" in s for s in steps) == a["classification"]["chpl"]


def test_elevated_lists_the_first_steps_without_a_hold():
    v = memo.decide({"status": "CLEAN"}, {"band": "HIGH"}, {"chpl": False})
    assert v["code"] == "ELEVATED" and len(v["actions"]) == 2
    assert v["notes"][0].startswith("A clean sanctions screening does not offset route risk")
    assert not any(s.startswith("Do not ship") for s in v["actions"])
    assert memo.decide({"status": "CLEAN"}, {"band": "LOW"}, {"chpl": False})["actions"] == []
    assert v["required"] == []


def test_elevated_marks_the_12g_clause_as_required():
    # Phones fold Elevated steps after the first; a step the law requires must stay marked so it never folds
    v = memo.decide({"status": "CLEAN"}, {"band": "HIGH"}, {"chpl": True})
    assert v["code"] == "ELEVATED" and len(v["actions"]) == 3
    assert v["required"] == [s for s in v["actions"] if "12g" in s] and len(v["required"]) == 1


def test_listed_entity_stops_the_deal():
    a = assess(company="OOO Радиоавтоматика", jurisdiction="RU", hs="854231", intermediary="AM")
    assert a["entity"]["status"] == "MATCH"
    assert a["verdict"]["code"] == "STOP"
    # No contract goes ahead on a Stop, so the 12g clause note is noise there
    assert not any("12g" in n for n in a["verdict"]["notes"])
    assert any("12g" in n for n in memo.decide({"status": "CLEAN"}, {"band": "LOW"}, {"chpl": True})["notes"])
    # Stop now, check the match, escalate, record: the hit is not yet confirmed by an officer
    assert len(a["verdict"]["actions"]) == 4 and a["verdict"]["title"].startswith("Likely")
    m = client.post("/api/memo", json={**BASE, "company": "OOO Радиоавтоматика", "jurisdiction": "RU",
                                       "hs": "854231", "intermediary": "AM"}).json()
    assert m["edd"] == a["verdict"]["actions"]  # a Stop briefing lists only the stop steps
    assert "## Required actions" in m["markdown"] and "end-use statement" not in m["markdown"]
    # The German job title stays out of the steps and appears once, under Legal exposure
    assert not any("Ausfuhr" in s for s in m["edd"]) and any("Ausfuhrverantwortliche" in x for x in m["legal"])


def test_missing_baseline_is_not_reported_as_low_risk():
    years = list(range(2017, 2026))
    series = {"years": years, "values": [0.0] * len(years), "russia": [0.0] * len(years), "unit": "EUR"}
    c = hs_codes.classify("848210")
    r = anomaly.analyse(series, c, "KZ")
    assert r["no_baseline"]
    from _lib import memo
    v = memo.decide({"status": "CLEAN"}, r, c)
    assert any("No pre-war trade" in n for n in v["notes"])


def test_validation():
    r = client.post("/api/assess", json={**BASE, "company": "X Co", "hs": "85A", "intermediary": "KZ"})
    assert r.status_code == 422
    r = client.post("/api/assess", json={**BASE, "company": "X Co", "hs": "854231", "intermediary": "RU"})
    assert r.status_code == 422  # Russia is a reference series, not an intermediary
    for code in ("999999", "980000", "770000", "000000"):  # outside HS chapters 01-97 (77 reserved)
        r = client.post("/api/assess", json={**BASE, "company": "X Co", "hs": code, "intermediary": "KZ"})
        assert r.status_code == 422, code
        assert f"{code[:2]} is not an HS chapter" in r.text and r.json()["detail"][0]["loc"][-1] == "hs"


def test_memo_sections():
    m = client.post("/api/memo", json={**BASE, "company": "Contoso Electronics LLC", "jurisdiction": "KG",
                                       "hs": "854239", "intermediary": "KG"}).json()
    assert m["engine"] == "rules"
    assert m["findings"] and m["legal"] and m["edd"]
    # A clean buyer reads as neither a match nor a possible match
    assert any(f["text"].startswith("No match and no possible match") and "for the 1 name screened" in f["text"]
               for f in m["findings"]), m["findings"]
    assert "Art. 12g" in m["markdown"] and "§ 18 AWG" in m["markdown"]
    # The peak year reads in plain words; the Z-score stays in the Route tab
    peak = next(f["text"] for f in m["findings"] if "Peak year" in f["text"])
    assert re.search(r"Peak year \d{4}: (far above|within) the pre-war range\.", peak), peak


def test_zscore_maths():
    series = {"years": list(range(2017, 2025)),
              "values": [100, 110, 90, 100, 100, 400, 100, 100],
              "russia": [50] * 5 + [0] * 3}
    a = anomaly.analyse(series, hs_codes.classify("854231"), "KZ")
    z2022 = next(p for p in a["points"] if p["year"] == 2022)["z"]
    assert a["baseline"]["mean"] == pytest.approx(100)
    assert z2022 == pytest.approx(300 / a["baseline"]["std"])
    assert a["flagged_years"] == [2022]


def test_hs2022_code_has_no_fake_baseline():
    series = {"years": list(range(2017, 2025)), "values": [0] * 5 + [500_000] * 3, "russia": [0] * 8}
    a = anomaly.analyse(series, hs_codes.classify("880730"), "KZ")
    assert not a["emergent"] and a["z_max"] is None
    assert a["components"][0]["points"] is None


def test_llm_narrative_is_optional(monkeypatch):
    import httpx
    from _lib import config

    req = {**BASE, "company": "Contoso Electronics LLC", "jurisdiction": "KG", "hs": "854239", "intermediary": "KG"}
    monkeypatch.setattr(config, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(config, "LLM_BASE_URL", "https://llm.invalid/v1")
    monkeypatch.setattr(config, "LLM_MODEL", "any-model")

    async def ok_post(self, url, **kw):
        assert url.endswith("/chat/completions") and kw["json"]["messages"][0]["role"] == "system"
        return httpx.Response(200, json={"choices": [{"message": {"content": "Grounded narrative."}}]},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", ok_post)
    m = client.post("/api/memo", json=req).json()
    assert m["engine"] == "rules+llm" and m["narrative"] == "Grounded narrative."

    async def failing_post(self, url, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx.AsyncClient, "post", failing_post)
    m = client.post("/api/memo", json=req).json()
    assert m["engine"] == "rules" and m["narrative"] is None


def test_weights_and_sensitivity():
    req = dict(company="Contoso Electronics LLC", jurisdiction="KG", hs="854239", intermediary="KG")
    base = assess(**req)["route"]
    assert not base["custom_weights"] and base["sensitivity"]["default"]["score"] == base["score"]
    only_item = assess(**req, weights={"anomaly": 0, "surge": 0, "materiality": 0, "criticality": 100,
                                       "jurisdiction": 0, "displacement": 0})["route"]
    assert only_item["custom_weights"] and only_item["score"] == 100  # Tier 1 item = full criticality
    bad = client.post("/api/assess", json={**BASE, **req, "weights": {"vibes": 50}})
    assert bad.status_code == 422


def test_exposure_is_data_driven():
    from _lib import jurisdiction
    kz, ae = jurisdiction.profile("KZ"), jurisdiction.profile("AE")
    assert kz["factors"][0]["points"] == 5 and ae["factors"][0]["points"] == 0  # EAEU membership
    assert 0 < ae["factors"][2]["points"] <= 7  # Russia-related designations based in the UAE
    assert kz["exposure"] == sum(f["points"] for f in kz["factors"])
    assert kz["rationale"].startswith("EAEU customs union with Russia")


def test_eurostat_jsonstat_parser():
    from _lib import eurostat
    body = {"id": ["reporter", "partner", "product", "time"], "size": [1, 2, 1, 3],
            "dimension": {"reporter": {"category": {"index": {"DE": 0}}},
                          "partner": {"category": {"index": {"XS": 0, "RU": 1}}},
                          "product": {"category": {"index": {"848210": 0}}},
                          "time": {"category": {"index": {"2017": 0, "2018": 1, "2019": 2}}}},
            "value": {"0": 5, "1": 7, "4": 9}}
    cells, periods = eurostat._parse(body)
    v = eurostat.VALUE
    assert cells[(v, "RS", "848210", "2017")] == 5 and cells[(v, "RS", "848210", "2018")] == 7
    assert cells[(v, "RU", "848210", "2018")] == 9
    assert periods == ["2017", "2018"]


def test_assessment_includes_new_signals():
    a = assess(company="Northwind Components LLP", jurisdiction="KZ", hs="848210", intermediary="KZ")
    m = a["monthly"]
    assert m and m["months"][0] == "2019-01" and len(m["values"]) == len(m["months"])
    assert m["ytd"]["reference_year"] == 2021 and m["ytd"]["ratio"] is not None
    assert a["unit_values"] and len(a["unit_values"]["per_kg"]) == len(a["series"]["years"])
    assert a["mirror"] and a["mirror"]["unit"] == "USD" and len(a["mirror"]["de_exports"]) == len(a["mirror"]["years"])
    assert "RU" in a["flows"]["partners"] and len(a["flows"]["partners"]) == 13
    assert a["sankey"] and len(a["sankey"]["links"]) == 12


def test_monthly_finding_reads_as_change():
    m = client.post("/api/memo", json={**BASE, "company": "Northwind Components LLP", "jurisdiction": "KZ",
                                       "hs": "848210", "intermediary": "KZ"}).json()
    text = next(f["text"] for f in m["findings"] if f["area"] == "Monthly exports")
    # Same wording as the app's KPI and radar, naming the flow: "Exports to Kazakhstan, 2026 Jan–Aug vs 2021: -88%"
    assert re.match(r"Exports to Kazakhstan, \d{4} Jan(–[A-Z][a-z]{2})? vs 2021: [+-]\d+%\.", text), text


def test_memo_writes_hs_as_the_app_does():
    m = client.post("/api/memo", json={**BASE, "company": "Northwind Components LLP", "jurisdiction": "KZ",
                                       "hs": "848210", "intermediary": "KZ"}).json()
    assert "HS 8482.10" in m["subject"]
    texts = " ".join(f["text"] for f in m["findings"]) + m["subject"]
    assert "848210" not in texts and "HS 8482.10" in texts


def test_monthly_stats_maths():
    months = [f"{y}-{m:02d}" for y in (2021, 2022, 2023) for m in range(1, 13)] + ["2024-01", "2024-02"]
    values = [100] * 12 + [100] + [100] * 11 + [100] * 12 + [400, 200]
    st = anomaly.monthly_stats({"months": months, "values": values})
    assert st["latest"] == "2024-02" and st["ytd"]["through_month"] == 2
    assert st["ytd"]["ratio"] == pytest.approx(600 / 200)
    assert st["flagged"] == []  # no variance in the baseline, so no Z-scores


def test_unit_values_flag_large_price_shift():
    series = {"years": list(range(2017, 2025)), "values": [1000] * 5 + [9000] * 3, "kg": [100] * 8}
    u = anomaly.unit_values(series)
    assert u["baseline"] == pytest.approx(10) and u["post"] == pytest.approx(90)
    assert u["flag"] is True


def test_radar_matrix():
    r = client.get("/api/radar?exporter=DE").json()
    assert len(r["rows"]) == 50 and len(r["partners"]) == 12
    assert sum(r["counts"].values()) == 600
    assert r["top"][0]["score"] >= r["top"][-1]["score"]
    assert client.get("/api/radar?exporter=FR").status_code == 404


def test_batch_screening():
    rows = [{"company": "OOO Радиоавтоматика", "country": "RU"},
            {"company": "Northwind Components LLP", "country": "KZ", "hs": "848210", "intermediary": "KZ"},
            {"company": "Tailspin Toys GmbH", "country": "DE", "hs": "950300"}]
    out = client.post("/api/batch", json={"rows": rows}).json()
    by = {r["company"]: r for r in out["rows"]}
    assert by["OOO Радиоавтоматика"]["verdict"] == "STOP"
    assert by["Northwind Components LLP"]["verdict"] == "RED FLAG" and by["Northwind Components LLP"]["route_band"] == "CRITICAL"
    # no covered transit country: only the name was screened, never a green Standard
    assert by["Tailspin Toys GmbH"]["chpl_tier"] is None and by["Tailspin Toys GmbH"]["verdict"] == "NAME ONLY"
    issue = by["Tailspin Toys GmbH"]["issues"][0]
    assert issue.startswith("Germany is not a covered transit country") and "intermediary column (KZ," in issue
    assert by["Northwind Components LLP"]["issues"] == []
    assert out["rows"][0]["verdict"] == "STOP"  # sorted by severity


def test_batch_flags_bad_rows():
    bad = client.post("/api/batch", json={"rows": [{"company": "Acme", "country": "ZZ", "hs": "12", "intermediary": "KZ"}]}).json()
    row = bad["rows"][0]
    assert row["verdict"] == "NAME ONLY" and row["country"] is None and row["hs"] is None
    assert len(row["issues"]) == 2 and "ZZ" in row["issues"][0] and "six digits" in row["issues"][1]
    # a name with nothing else is screened by name only, and says why
    plain = client.post("/api/batch", json={"rows": [{"company": "Plain Trading Co", "country": "DE"}]}).json()["rows"][0]
    assert plain["verdict"] == "NAME ONLY" and plain["issues"] == ["No HS code; item and route not checked."]


def test_registry_flags_new_shell(monkeypatch):
    import httpx
    from _lib import cache

    monkeypatch.setattr(cache, "_memory", {})
    record = {"attributes": {"lei": "TEST00000000000000LEI", "registration": {"status": "ISSUED", "initialRegistrationDate": "2023-05-01T00:00:00Z"},
                             "entity": {"legalName": {"name": "Silk Road Components LLP"}, "otherNames": [],
                                        "legalAddress": {"country": "KZ", "city": "Almaty"},
                                        "creationDate": "2023-04-02T00:00:00Z", "status": "ACTIVE"}}}

    async def fake_get(self, url, **kw):
        req = httpx.Request("GET", url)
        if url.endswith("/ultimate-parent"):
            return httpx.Response(404, json={}, request=req)
        return httpx.Response(200, json={"data": [record]}, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    d = client.get("/api/company?name=Silk Road Components LLP&country=KZ").json()
    assert d["results"][0]["created"] == "2023-04-02"
    assert any("after Russia's full-scale invasion" in f["text"] for f in d["flags"])


def test_unlisted_item_has_no_bundled_mirror_or_flows():
    # The bundles hold the 50 listed items only; unlisted codes must not raise (regression: KeyError -> 500)
    from _lib import mirror, trade
    assert mirror.get("DE", "KZ", "950300") is None
    assert mirror.sankey("DE", "950300") is None
    assert trade.flows("DE", "950300") is None
    assert mirror.get("DE", "KZ", "848210") is not None


@pytest.mark.parametrize("name", ["Firm", "Trading Firm", "Global Parts Distribution LLC"])
def test_generic_words_alone_do_not_match(name):
    from _lib import sanctions
    assert all(m["score"] < 80 for m in sanctions._local_match(name, "O", None))


def test_calculator_matches_engine_and_validates():
    years = list(range(2017, 2026))
    body = {"hs": "848210", "intermediary": "KZ", "years": years,
            "values": [9e5, 1e6, 1.1e6, 9.5e5, 1.05e6, 2.5e6, 4e6, 4.8e6, 5.2e6],
            "russia": [3e6, 3.2e6, 3.4e6, 3.1e6, 3.3e6, 9e5, 3e5, 2e5, 1.5e5]}
    out = client.post("/api/calculate", json=body).json()
    assert out["route"]["band"] == "CRITICAL" and out["verdict"]["code"] == "RED FLAG"
    assert abs(out["route"]["score"] - sum(c["points"] or 0 for c in out["route"]["components"])) <= 1
    assert client.post("/api/calculate", json={**body, "screening": "MATCH"}).json()["verdict"]["code"] == "STOP"
    flat = client.post("/api/calculate", json={**body, "values": [1e6] * 9, "russia": [3e6] * 9}).json()
    assert flat["route"]["band"] in ("LOW", "MODERATE") and flat["route"]["multiplier"] == 1
    assert client.post("/api/calculate", json={**body, "values": [1.0, 2.0]}).status_code == 422
    assert client.post("/api/calculate", json={**body, "values": [-1.0] * 9}).status_code == 422


@pytest.mark.parametrize("name", ["华为技术有限公司", "شركة النور", "!!!", "  a"])
def test_names_that_cannot_be_screened_are_rejected(name):
    # a name with no Latin letters normalises to nothing and would screen as a clean "No match"
    r = client.post("/api/assess", json={**BASE, "company": name, "hs": "854231", "intermediary": "KG"})
    assert r.status_code == 422, name
    r = client.post("/api/assess", json={**BASE, "company": "Acme GmbH", "ubos": [name], "hs": "854231", "intermediary": "KG"})
    assert r.status_code == 422, name
    assert client.post("/api/batch", json={"rows": [{"company": name}]}).status_code == 422


def test_listed_company_as_owner_is_matched():
    a = assess(company="Acme Trading GmbH", ubos=["Sberbank"], hs="854231", intermediary="KG")
    owner = next(s for s in a["entity"]["subjects"] if s["name"] == "Sberbank")
    assert owner["status"] == "MATCH" and a["verdict"]["code"] == "STOP"


def test_route_without_any_trade_data_is_not_standard(monkeypatch):
    from _lib import trade

    async def unavailable(*_args):
        return {"years": [], "values": [], "russia": [], "unit": "EUR", "mode": "unavailable",
                "source": "Eurostat / UN Comtrade", "retrieved": None, "warning": "No trade data."}

    async def no_monthly(*_args):
        return None

    monkeypatch.setattr(trade, "get_series", unavailable)
    monkeypatch.setattr(trade, "get_monthly", no_monthly)
    a = assess(company="Plain Trading Co", hs="950300", intermediary="KZ")
    assert a["route"]["no_data"] and a["verdict"]["code"] == "NAME ONLY"
    assert not any("No pre-war trade" in n for n in a["verdict"]["notes"])
    m = client.post("/api/memo", json={**BASE, "company": "Plain Trading Co", "hs": "950300", "intermediary": "KZ"})
    assert m.status_code == 200 and m.json()["verdict"]["code"] == "NAME ONLY"


def test_officer_decisions_clear_or_confirm_a_match():
    req = {**BASE, "company": "Acme Trading GmbH", "ubos": ["Sberbank"], "hs": "854231", "intermediary": "KG"}
    a = assess(**req)
    owner = next(s for s in a["entity"]["subjects"] if s["name"] == "Sberbank")
    assert a["verdict"]["code"] == "STOP" and a["entity"]["unreviewed"] == 1
    hits = [m for m in owner["matches"] if m["score"] >= 80]

    def review(decision, matches, reason="Different registration number"):
        return [{"subject": "Sberbank", "match_id": m["id"], "decision": decision, "reason": reason} for m in matches]

    # Every hit cleared: the owner is clean again, the stop lifts and the briefing keeps the reasons
    cleared = {**req, "reviews": review("different", hits)}
    b = assess(**cleared)
    assert b["verdict"]["code"] != "STOP" and b["entity"]["unreviewed"] == 0
    assert any("cleared" in n for n in b["verdict"]["notes"])
    memo = client.post("/api/memo", json=cleared).json()
    assert len(memo["reviews"]) == len(hits) and "## Match decisions" in memo["markdown"]

    # The top hit confirmed: the title says so and the review step is gone
    c = assess(**req, reviews=review("same", hits[:1]))
    assert c["verdict"]["title"] == "Sanctions match confirmed: do not proceed"
    assert len(c["verdict"]["actions"]) == 3

    # The buyer confirmed while another name still has an open possible match: the title follows the
    # confirmed match, and the review step stays for the open one
    mixed = assess(**{**req, "company": "Sberbank", "ubos": ["Sberbank CIB"]})
    buyer = mixed["entity"]["subjects"][0]
    m = assess(**{**req, "company": "Sberbank", "ubos": ["Sberbank CIB"], "reviews": [
        {"subject": "Sberbank", "match_id": buyer["matches"][0]["id"], "decision": "same", "reason": "Same bank, same register"}]})
    assert m["entity"]["unreviewed"] == 1
    assert m["verdict"]["title"] == "Sanctions match confirmed: do not proceed"
    assert any("Buyer tab" in s for s in m["verdict"]["actions"])

    # A decision needs a reason
    blank = client.post("/api/assess", json={**req, "reviews": review("different", hits[:1], reason="  ")})
    assert blank.status_code == 422


def test_decision_time_reaches_the_briefing_and_no_country_is_not_unknown():
    req = {**BASE, "company": "Acme Trading GmbH", "ubos": ["Sberbank"], "hs": "854231", "intermediary": "KG"}
    hit = next(m for s in assess(**req)["entity"]["subjects"] if s["name"] == "Sberbank" for m in s["matches"])
    reviews = [{"subject": "Sberbank", "match_id": hit["id"], "decision": "different",
                "reason": "Private person", "at": "2026-11-16T09:30:00Z", "by": "J. Doe"}]
    memo = client.post("/api/memo", json={**req, "reviews": reviews}).json()
    assert memo["reviews"][0]["at"] == "2026-11-16T09:30:00Z"
    assert "recorded 2026-11-16 09:30 UTC by J. Doe" in memo["markdown"]
    assert memo["reviews"][0]["by"] == "J. Doe"
    short = client.post("/api/assess", json={**req, "reviews": [{**reviews[0], "reason": "too short"}]})
    assert short.status_code == 422  # under 10 characters
    assert "unknown" not in memo["subject"] and "not given" not in memo["subject"]


def test_briefing_names_the_confirmed_match_not_the_top_hit():
    req = {**BASE, "company": "Sberbank", "hs": "854231", "intermediary": "KG"}
    hits = assess(**req)["entity"]["subjects"][0]["matches"]
    second = hits[1]  # confirm a match that is not the highest-scoring one
    memo = client.post("/api/memo", json={**req, "reviews": [{"subject": "Sberbank", "match_id": second["id"],
                                                              "decision": "same", "reason": "Same SWIFT code and register"}]}).json()
    buyer = next(f["text"] for f in memo["findings"] if f["area"] == "Buyer")
    assert "confirmed by the officer" in buyer and second["name"] in buyer
