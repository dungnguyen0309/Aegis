"""Static reference data: countries, structural facts, constants."""

from __future__ import annotations

import os
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "_data"

# Years before Russia's full-scale invasion (24 Feb 2022) form the baseline.
SANCTIONS_YEAR = 2022
BASELINE_YEARS = (2017, 2021)
Z_THRESHOLD = 2.0

# Keyed by Eurostat reporter code; m49 is the UN Comtrade code for the fallback source.
EXPORTERS: dict[str, dict] = {
    "DE": {"name": "Germany", "m49": "276"},
    "EU27_2020": {"name": "EU-27", "m49": None},
    "FR": {"name": "France", "m49": "251"},
    "IT": {"name": "Italy", "m49": "380"},
    "NL": {"name": "Netherlands", "m49": "528"},
    "PL": {"name": "Poland", "m49": "616"},
    "AT": {"name": "Austria", "m49": "40"},
    "CZ": {"name": "Czechia", "m49": "203"},
}
DEFAULT_EXPORTER = "DE"
BUNDLED_EXPORTERS = ["DE", "EU27_2020"]

# Intermediaries, keyed by ISO2, with verifiable structural facts used in the exposure score:
#   eaeu         member of the Eurasian Economic Union customs union with Russia (EAEU Treaty, 2014)
#   land_border  shares a land border with Russia
INTERMEDIARIES: dict[str, dict] = {
    "KZ": {"name": "Kazakhstan", "m49": "398", "eaeu": True, "land_border": True},
    "KG": {"name": "Kyrgyzstan", "m49": "417", "eaeu": True, "land_border": False},
    "AM": {"name": "Armenia", "m49": "51", "eaeu": True, "land_border": False},
    "GE": {"name": "Georgia", "m49": "268", "eaeu": False, "land_border": True},
    "UZ": {"name": "Uzbekistan", "m49": "860", "eaeu": False, "land_border": False},
    "TJ": {"name": "Tajikistan", "m49": "762", "eaeu": False, "land_border": False},
    "AZ": {"name": "Azerbaijan", "m49": "31", "eaeu": False, "land_border": True},
    "TR": {"name": "Türkiye", "m49": "792", "eaeu": False, "land_border": False},
    "AE": {"name": "United Arab Emirates", "m49": "784", "eaeu": False, "land_border": False},
    "CN": {"name": "China", "m49": "156", "eaeu": False, "land_border": True},
    "HK": {"name": "Hong Kong", "m49": "344", "eaeu": False, "land_border": False},
    "RS": {"name": "Serbia", "m49": "688", "eaeu": False, "land_border": False},
}

# Sanctioned destinations used as reference series (direct exports).
REFERENCE_PARTNERS: dict[str, dict] = {
    "RU": {"name": "Russia", "m49": "643"},
    "BY": {"name": "Belarus", "m49": "112"},
}
RUSSIA = "RU"

# Entity jurisdictions offered in the UI (ISO2 -> name).
JURISDICTIONS: dict[str, str] = {
    **{k: v["name"] for k, v in INTERMEDIARIES.items()},
    "RU": "Russia", "BY": "Belarus", "IR": "Iran", "KP": "North Korea",
    "DE": "Germany", "SG": "Singapore", "IN": "India", "MY": "Malaysia", "TH": "Thailand",
}

# ISO 3166-1 alpha-2 codes, plus XK (Kosovo, used by the sanctions lists): batch rows are checked against them.
ISO2 = frozenset("""
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT
MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG
UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
""".split())

# Optional services (all features fall back to bundled data when unset).
COMTRADE_API_KEY = os.getenv("COMTRADE_API_KEY", "")
OPENSANCTIONS_API_KEY = os.getenv("OPENSANCTIONS_API_KEY", "")
UPSTASH_URL = os.getenv("UPSTASH_REDIS_REST_URL", "")
UPSTASH_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "").rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "")

# Keep every outbound call well inside serverless time limits.
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "15"))
