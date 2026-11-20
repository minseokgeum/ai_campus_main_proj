"""Active audit boundary: legacy data assembly, explicit availability, immutable outputs.

The legacy panel is reused only for already lagged stock data. VIX is replaced by
the latest completed ET 16:15 observation. A daily close is an end-time proxy,
not evidence of real-time vendor delivery; live collection is a separate gate.
"""
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import sys
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "workbench" / "runs" / "round1"
PREDICTION_DIR = ROOT / "workbench" / "corrected_data"
sys.path.insert(0, str(ROOT / "src"))

def available_at(us_date, et_clock="16:15"):
    return pd.Timestamp(str(us_date) + " " + et_clock, tz="America/New_York").tz_convert("Asia/Seoul")

def completed_bar(start, cutoff, minutes=1):
    return pd.Timestamp(start) + pd.Timedelta(minutes=minutes) <= pd.Timestamp(cutoff)

def asof_daily(frame, dates, cutoff="06:00", clock="16:15"):
    """No backfill from the future. Daily change is versus actual prior US row."""
    v = frame.sort_values("us_date").copy()
    v["available_at"] = [available_at(d, clock) for d in v.us_date]
    v["change"] = v.Close.pct_change(fill_method=None)
    times = pd.DatetimeIndex(v.available_at)
    rows = []
    for day in dates:
        cut = pd.Timestamp(str(day) + " " + cutoff, tz="Asia/Seoul")
        j = times.searchsorted(cut, side="right") - 1
        if j < 0:
            rows.append(dict(T=str(day), close=np.nan, change=np.nan, source_date=None, available_at=None, age_hours=np.nan))
        else:
            r = v.iloc[j]
            rows.append(dict(T=str(day), close=r.Close, change=r.change, source_date=r.us_date,
                             available_at=r.available_at.isoformat(), age_hours=(cut-r.available_at).total_seconds()/3600))
    return pd.DataFrame(rows)

def snapshot_change(selected):
    """New information since prior Korean snapshot, not stale last-US-session return."""
    return selected.sort_values("T").close.pct_change(fill_method=None)

def corrected_legacy_panel():
    """Reuse legacy lagged features with corrected targets, never change legacy files.

    The adapter is serial-only: its module constant is restored even on failure.
    Missing or changed correction artifacts fail closed rather than reverting to
    the historical target-selected table.
    """
    import explore22
    prediction = PREDICTION_DIR / "sector_study_predictions.csv"
    declared = json.loads((PREDICTION_DIR / "target_filter_summary.json").read_text())
    if hashlib.sha256(prediction.read_bytes()).hexdigest() != declared["prediction_table_sha256"]:
        raise RuntimeError("Corrected prediction artifact does not match its declaration")
    legacy_results = explore22.RESULTS
    try:
        explore22.RESULTS = PREDICTION_DIR
        return explore22.build_panel()
    finally:
        explore22.RESULTS = legacy_results

@lru_cache(maxsize=2)
def _panel(cutoff):
    if cutoff not in ("06:00", "08:11"):
        raise ValueError("Supported publication cutoffs are 06:00 and 08:11, not 08:10 minute-start.")
    p = corrected_legacy_panel()
    old = p.groupby("T").vix.first()
    v = pd.read_csv(ROOT / "data" / "vix_daily.csv", dtype={"us_date": str})
    avail = asof_daily(v, sorted(p["T"].unique()), cutoff)
    # dvix in the legacy definition is the most recent US session return. It is
    # a permissible stale state feature, but not "new since yesterday's brief".
    # Version2 names both; main dvix now expresses newly observed information.
    avail["snapshot_change"] = snapshot_change(avail)
    p = p.drop(columns=["vix", "dvix"]).merge(
        avail.assign(vix=lambda z: np.log(z.close), dvix=lambda z:z.snapshot_change,
                     dvix_last_session=lambda z:z.change)[["T", "vix", "dvix", "dvix_last_session"]], on="T", how="left")
    m1 = pd.read_csv(PREDICTION_DIR / "sector_study_predictions.csv", dtype={"T":str,"code":str})[["T","code","M1"]]
    p = p.merge(m1, on=["T","code"], validate="one_to_one")
    p["H"] = np.where(p.r2 < .3, p.M1, p.F2)
    u = pd.read_csv(ROOT / "data" / "universe.csv", dtype={"Code":str}).rename(columns={"Code":"code"})
    p = p.merge(u[["code","group","etf"]], on="code", validate="many_to_one")
    avail["legacy_log_vix"] = avail["T"].map(old)
    avail["changed"] = ~np.isclose(np.log(avail.close), avail.legacy_log_vix, equal_nan=True)
    if cutoff == "06:00":
        # Remove accidentally usable later observations even when caller forgets.
        p.loc[:, [c for c in ["g","g00","hi","lo","zv","mkt_g","rng","drift","dis","idio","sd08","nq"] if c in p]] = np.nan
    p.attrs.update(cutoff_kst=cutoff, minute_label="bar_start; 08:10 bar available at 08:11",
                   range_definition="range of minute closes, not intraminute high-low",
                   validation_status="reused historical data; not untouched holdout",
                   availability="session end proxy; vendor delivery latency not observed",
                   dvix_definition="change since prior Korean snapshot; last US-session return retained separately",
                   target_policy="no realized-return magnitude exclusion; corrected raw-history M1/F2/r2")
    return p.sort_values(["T","code"]).reset_index(drop=True), avail

def load_panel(cutoff="08:11"):
    panel, avail = _panel(cutoff)
    path = OUT / ("availability_vix_"+cutoff.replace(":", "")+".csv")
    content = avail.to_csv(index=False)
    try:
        with path.open("x", encoding="utf-8") as stream:
            stream.write(content)
    except FileExistsError:
        if path.read_text() != content:
            raise RuntimeError("Availability evidence changed within a frozen round")
    return panel.copy()

if __name__ == "__main__":
    for clock in ("06:00", "08:11"):
        p = load_panel(clock)
        print(clock, len(p), p["T"].nunique(), p.code.nunique())
