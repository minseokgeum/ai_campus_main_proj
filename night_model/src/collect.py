"""데이터 수집. 결과는 data/*.csv로 저장해서, 키가 없는 팀원도 같은 데이터로 다시 돌릴 수 있게 한다.

    python src/collect.py --env /path/to/.env      # KIS 키가 든 .env (값은 출력하지 않는다)
    python src/collect.py --skip-kis               # 야간선물은 이미 받은 data/futures_daily.csv를 그대로 쓴다

1) 코스피200 선물 일봉(주간·야간), 근월물 이어 붙이기 — 한국투자증권 Open API (FHKIF03020100)
2) 국내 종목·코스피200 지수 일봉 — FinanceDataReader
3) 미국 일봉(SOX, 나스닥·S&P 선물, EWY, 원/달러) — yfinance
4) 미국 선물·환율 시간봉(06:00 이후 움직임용) — yfinance (최근 730일까지만 제공)
"""
import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime

import pandas as pd

from common import DATA, FRONTS, INDEX, STOCKS, US_DAILY, US_HOURLY, US_PEERS


# ── 1) 한국투자증권 선물 일봉 ──
class KIS:
    def __init__(self, env_path: str):
        env = {}
        for line in open(env_path, encoding="utf-8"):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v.strip().strip('"')
        self.key, self.secret = env["KIS_APP_KEY"], env["KIS_APP_SECRET"]
        real = env.get("KIS_ENV", "real").lower() not in ("vts", "mock", "paper", "demo")
        self.base = "https://openapi.koreainvestment.com:9443" if real else "https://openapivts.koreainvestment.com:29443"
        self.tok_path = DATA / ".secrets" / "kis_token.json"
        self.token = self._token()

    def _token(self) -> str:
        if self.tok_path.exists():
            t = json.loads(self.tok_path.read_text())
            if datetime.strptime(t["expires"][:19], "%Y-%m-%d %H:%M:%S") > datetime.now():
                return t["access_token"]
        req = urllib.request.Request(self.base + "/oauth2/tokenP", headers={"content-type": "application/json"},
                                     data=json.dumps({"grant_type": "client_credentials", "appkey": self.key, "appsecret": self.secret}).encode())
        d = json.loads(urllib.request.urlopen(req, timeout=30).read())
        self.tok_path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.tok_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump({"access_token": d["access_token"], "expires": d["access_token_token_expired"]}, f)
        return d["access_token"]

    def daily(self, market: str, code: str, d1: str, d2: str) -> list[dict]:
        """market: F = 주간, CM = 야간. 야간 봉의 날짜는 그 야간장이 '시작한' 날(D일 18:00 ~ D+1일 06:00)."""
        q = urllib.parse.urlencode({"FID_COND_MRKT_DIV_CODE": market, "FID_INPUT_ISCD": code, "FID_INPUT_DATE_1": d1,
                                    "FID_INPUT_DATE_2": d2, "FID_PERIOD_DIV_CODE": "D"})
        req = urllib.request.Request(f"{self.base}/uapi/domestic-futureoption/v1/quotations/inquire-daily-fuopchartprice?{q}", headers={
            "content-type": "application/json", "authorization": "Bearer " + self.token, "appkey": self.key,
            "appsecret": self.secret, "tr_id": "FHKIF03020100", "custtype": "P"})
        d = json.loads(urllib.request.urlopen(req, timeout=30).read())
        time.sleep(0.4)
        return d.get("output2") or []


def collect_futures(env_path: str, end: str) -> pd.DataFrame:
    kis = KIS(env_path)
    rows = []
    for code, a, b in FRONTS:
        b = min(b, end)
        for market, session in (("F", "day"), ("CM", "night")):
            for r in kis.daily(market, code, a, b):
                if not r.get("stck_bsop_date"):
                    continue
                rows.append({"date": r["stck_bsop_date"], "session": session, "code": code,
                             "open": float(r["futs_oprc"]), "high": float(r["futs_hgpr"]), "low": float(r["futs_lwpr"]),
                             "close": float(r["futs_prpr"]), "volume": float(r.get("acml_vol") or 0)})
        print(f"  {code} {a}~{b}: 주간 {sum(1 for x in rows if x['code'] == code and x['session'] == 'day')}일 · "
              f"야간 {sum(1 for x in rows if x['code'] == code and x['session'] == 'night')}밤", flush=True)
    df = pd.DataFrame(rows)
    # 근월물 구간 밖 날짜는 버린다(같은 날짜에 두 계약이 겹치지 않게)
    keep = []
    for code, a, b in FRONTS:
        keep.append(df[(df["code"] == code) & (df["date"] >= a) & (df["date"] <= b)])
    df = pd.concat(keep).drop_duplicates(["date", "session"]).sort_values(["date", "session"])
    return df


# ── 2) 국내 일봉 ──
def collect_kr(start: str, end: str) -> pd.DataFrame:
    import FinanceDataReader as fdr
    out = []
    for code, name in {**STOCKS, **INDEX}.items():
        d = fdr.DataReader(code, start, end)[["Open", "High", "Low", "Close", "Volume"]].copy()
        d.index = pd.to_datetime(d.index).strftime("%Y%m%d")
        d["code"], d["name"] = code, name
        out.append(d.rename_axis("date").reset_index())
        print(f"  {name}: {len(d)}일", flush=True)
    return pd.concat(out, ignore_index=True)


# ── 3·4) 미국 ──
def collect_us_daily(start: str, end: str) -> pd.DataFrame:
    import yfinance as yf
    out = []
    for sym, name in US_DAILY.items():
        d = yf.download(sym, start=start, end=end, progress=False, auto_adjust=False)
        d.columns = [c[0] if isinstance(c, tuple) else c for c in d.columns]
        d = d[["Open", "Close"]].copy()
        d.index = pd.to_datetime(d.index).strftime("%Y%m%d")
        d["symbol"] = name
        out.append(d.rename_axis("us_date").reset_index())
        print(f"  {name}: {len(d)}일", flush=True)
    return pd.concat(out, ignore_index=True)


def collect_us_hourly() -> pd.DataFrame:
    import yfinance as yf
    out = []
    for sym, name in US_HOURLY.items():
        d = yf.download(sym, period="730d", interval="60m", prepost=True, progress=False, auto_adjust=False)
        d.columns = [c[0] if isinstance(c, tuple) else c for c in d.columns]
        d = d[["Close"]].copy()
        idx = pd.to_datetime(d.index)
        idx = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
        d.index = idx + pd.Timedelta(hours=1)          # yfinance 시각은 봉의 시작 → 봉이 끝난 시각(=그 시각의 가격)으로 바꾼다
        d["symbol"] = name
        out.append(d.rename_axis("bar_end_utc").reset_index())
        print(f"  {name} 시간봉: {len(d)}개 ({d.index.min():%Y-%m-%d} ~ {d.index.max():%Y-%m-%d})", flush=True)
    return pd.concat(out, ignore_index=True)


def collect_night_minutes(env_path: str, end: str) -> pd.DataFrame:
    """야간선물 1분봉(18:00~06:00), 근월물. 한국투자증권 FHKIF03020200, 2025-06(KRX 자체 야간시장) 이후만 있음.
    시각은 KIS 표기 그대로(자정 뒤는 24:00~30:00 = 다음 날 00:00~06:00)."""
    kis = KIS(env_path)
    fut = pd.read_csv(DATA / "futures_daily.csv", dtype={"date": str, "code": str})
    nights = fut[(fut.session == "night") & (fut.date >= "20250609") & (fut.date <= end)][["date", "code"]].values
    path = DATA / "night_minutes.csv"
    done = set(pd.read_csv(path, dtype={"date": str})["date"]) if path.exists() else set()
    for d, code in nights:
        if d in done:
            continue
        bars, hour = {}, "300000"
        for _ in range(12):
            q = urllib.parse.urlencode({"FID_COND_MRKT_DIV_CODE": "CM", "FID_INPUT_ISCD": code, "FID_HOUR_CLS_CODE": "60",
                                        "FID_PW_DATA_INCU_YN": "Y", "FID_FAKE_TICK_INCU_YN": "N", "FID_INPUT_DATE_1": d, "FID_INPUT_HOUR_1": hour})
            req = urllib.request.Request(f"{kis.base}/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice?{q}", headers={
                "content-type": "application/json", "authorization": "Bearer " + kis.token, "appkey": kis.key,
                "appsecret": kis.secret, "tr_id": "FHKIF03020200", "custtype": "P"})
            try:
                rows = json.loads(urllib.request.urlopen(req, timeout=30).read()).get("output2") or []
            except Exception as e:
                print(d, "오류", type(e).__name__); time.sleep(2); continue
            time.sleep(0.12)
            rows = [r for r in rows if r.get("stck_bsop_date") == d]
            if not rows:
                break
            for r in rows:
                bars[r["stck_cntg_hour"]] = (float(r["futs_prpr"]), int(r["cntg_vol"]))
            last = min(r["stck_cntg_hour"] for r in rows)
            if last <= "180000":
                break
            h, m = int(last[:2]), int(last[2:4]) - 1
            if m < 0:
                h, m = h - 1, 59
            hour = f"{h:02d}{m:02d}00"
        df = pd.DataFrame([(d, code, k, p, v) for k, (p, v) in sorted(bars.items())], columns=["date", "code", "hhmmss", "price", "volume"])
        df.to_csv(path, mode="a", header=not path.exists(), index=False)
        print(f"  {d} {code}: {len(df)}분", flush=True)
    return pd.read_csv(path, dtype={"date": str, "hhmmss": str})


def collect_nxt_daily(env_path: str, start: str, end: str) -> pd.DataFrame:
    """NXT 일봉(시장 코드 NX). 시가 = 08:00 프리마켓 첫 체결, 종가 = 20:00까지 마지막 체결. 2025-03-04 출범 이후만."""
    kis = KIS(env_path)
    out = []
    for code, name in STOCKS.items():
        rows, d2 = [], end
        while d2 >= start:
            q = urllib.parse.urlencode({"FID_COND_MRKT_DIV_CODE": "NX", "FID_INPUT_ISCD": code, "FID_INPUT_DATE_1": start,
                                        "FID_INPUT_DATE_2": d2, "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0"})
            req = urllib.request.Request(f"{kis.base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?{q}", headers={
                "content-type": "application/json", "authorization": "Bearer " + kis.token, "appkey": kis.key,
                "appsecret": kis.secret, "tr_id": "FHKST03010100", "custtype": "P"})
            got = [r for r in (json.loads(urllib.request.urlopen(req, timeout=30).read()).get("output2") or []) if r.get("stck_bsop_date")]
            time.sleep(0.3)
            if not got:
                break
            rows += got
            first = min(r["stck_bsop_date"] for r in got)
            if first <= start or len(got) < 90:
                break
            d2 = (pd.Timestamp(first) - pd.Timedelta(days=1)).strftime("%Y%m%d")
        for r in rows:
            out.append({"date": r["stck_bsop_date"], "code": code, "name": name, "open": float(r["stck_oprc"]),
                        "high": float(r["stck_hgpr"]), "low": float(r["stck_lwpr"]), "close": float(r["stck_clpr"]), "volume": float(r["acml_vol"])})
        print(f"  {name}: NXT {len(rows)}일", flush=True)
    return pd.DataFrame(out).drop_duplicates(["date", "code"]).sort_values(["code", "date"])


def collect_nxt_premarket(env_path: str, days: list[str]) -> pd.DataFrame:
    """NXT 1분봉(08:49에서 거꾸로 120개 = 그날 08:00~08:49 프리마켓 + 전날 18:50~20:00 애프터마켓 끝).
    한국투자증권 FHKST03010230, 시장 코드 NX. 이어 받기 가능(data/nxt_premarket.csv)."""
    kis = KIS(env_path)
    path = DATA / "nxt_premarket.csv"
    done = set(map(tuple, pd.read_csv(path, dtype={"day": str, "code": str})[["day", "code"]].values)) if path.exists() else set()
    for code, name in STOCKS.items():
        if code == "091160":
            continue
        n = 0
        for day in days:
            if (day, code) in done:
                continue
            q = urllib.parse.urlencode({"FID_COND_MRKT_DIV_CODE": "NX", "FID_INPUT_ISCD": code, "FID_INPUT_HOUR_1": "085000",
                                        "FID_INPUT_DATE_1": day, "FID_PW_DATA_INCU_YN": "Y", "FID_FAKE_TICK_INCU_YN": ""})
            req = urllib.request.Request(f"{kis.base}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice?{q}", headers={
                "content-type": "application/json", "authorization": "Bearer " + kis.token, "appkey": kis.key,
                "appsecret": kis.secret, "tr_id": "FHKST03010230", "custtype": "P"})
            try:
                rows = json.loads(urllib.request.urlopen(req, timeout=30).read()).get("output2") or []
            except Exception as e:
                print(day, code, "오류", type(e).__name__); time.sleep(2); continue
            time.sleep(0.25)
            df = pd.DataFrame([{"day": day, "code": code, "date": r["stck_bsop_date"], "hhmmss": r["stck_cntg_hour"],
                                "price": float(r["stck_prpr"]), "volume": float(r["cntg_vol"])} for r in rows if r.get("stck_bsop_date")])
            if df.empty:
                df = pd.DataFrame([{"day": day, "code": code, "date": "", "hhmmss": "", "price": float("nan"), "volume": 0.0}])
            df.to_csv(path, mode="a", header=not path.exists(), index=False)
            n += 1
        print(f"  {name}: {n}일", flush=True)
    return pd.read_csv(path, dtype={"day": str, "code": str, "date": str, "hhmmss": str})


def collect_krx_intraday(env_path: str, days: list[str], codes: list[str]) -> None:
    """KRX 정규장 1분봉 09:00~10:30(10:30에서 거꾸로 120개). 한국투자증권 FHKST03010230, 시장 코드 J. 이어 받기(data/krx_intraday.csv)."""
    kis = KIS(env_path)
    path = DATA / "krx_intraday.csv"
    done = set(map(tuple, pd.read_csv(path, dtype={"day": str, "code": str})[["day", "code"]].values)) if path.exists() else set()
    for code in codes:
        n = 0
        for day in days:
            if (day, code) in done:
                continue
            q = urllib.parse.urlencode({"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code, "FID_INPUT_HOUR_1": "103000",
                                        "FID_INPUT_DATE_1": day, "FID_PW_DATA_INCU_YN": "Y", "FID_FAKE_TICK_INCU_YN": ""})
            req = urllib.request.Request(f"{kis.base}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice?{q}", headers={
                "content-type": "application/json", "authorization": "Bearer " + kis.token, "appkey": kis.key,
                "appsecret": kis.secret, "tr_id": "FHKST03010230", "custtype": "P"})
            try:
                rows = json.loads(urllib.request.urlopen(req, timeout=30).read()).get("output2") or []
            except Exception as e:
                print(day, code, "오류", type(e).__name__); time.sleep(2); continue
            time.sleep(0.25)
            df = pd.DataFrame([{"day": day, "code": code, "hhmmss": r["stck_cntg_hour"], "price": float(r["stck_prpr"]), "volume": float(r["cntg_vol"])}
                               for r in rows if r.get("stck_bsop_date") == day and "090000" <= r.get("stck_cntg_hour", "") <= "103000"])
            if df.empty:
                df = pd.DataFrame([{"day": day, "code": code, "hhmmss": "", "price": float("nan"), "volume": 0.0}])
            df.to_csv(path, mode="a", header=not path.exists(), index=False)
            n += 1
        print(f"  {code}: {n}일", flush=True)


AFTER_MARKET_START = "20260914"   # KRX 애프터마켓(16:00~20:00) 시작일


def official_close(kis: "KIS", code: str, start: str, end: str) -> dict:
    """한국투자증권 일봉(FHKST03010100, 시장 J)의 공식 종가(15:30 정규장). {날짜: 종가}."""
    out, d2 = {}, end
    while d2 >= start:
        q = urllib.parse.urlencode({"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code, "FID_INPUT_DATE_1": start,
                                    "FID_INPUT_DATE_2": d2, "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0"})
        req = urllib.request.Request(f"{kis.base}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?{q}", headers={
            "content-type": "application/json", "authorization": "Bearer " + kis.token, "appkey": kis.key,
            "appsecret": kis.secret, "tr_id": "FHKST03010100", "custtype": "P"})
        res = {}
        for _ in range(5):                                      # 초당 호출 한도(EGW00201)·서버 오류(HTTP 500)면 쉬었다가 다시. 빈 응답으로 넘어가면 교정이 조용히 빠진다
            try:
                res = json.loads(urllib.request.urlopen(req, timeout=30).read())
            except Exception:
                res = {}; time.sleep(2); continue
            if res.get("msg_cd") != "EGW00201":
                break
            time.sleep(1)
        got = [r for r in (res.get("output2") or []) if r.get("stck_bsop_date")]
        time.sleep(0.12)
        if not got:
            break
        out.update({r["stck_bsop_date"]: float(r["stck_clpr"]) for r in got})
        first = min(r["stck_bsop_date"] for r in got)
        if first <= start or len(got) < 90:
            break
        d2 = (pd.Timestamp(first) - pd.Timedelta(days=1)).strftime("%Y%m%d")
    return out


def fix_after_market_close(df: pd.DataFrame, kis: "KIS", code_col: str = "code") -> pd.DataFrame:
    """2026-09-14부터 FinanceDataReader의 Close가 20:00 애프터마켓 마지막 가격으로 들어온다(공식 종가·다음 날 기준가는 15:30 종가).
    그날부터의 종목 Close를 한국투자증권 공식 종가로 바꾼다. 시가는 같아서 그대로 둔다. 지수(KS200)는 해당 없음."""
    df = df.copy()
    end = df.date.max()
    for code in sorted(df[code_col].unique()):
        if not str(code)[:1].isdigit():                       # 지수(KS200)만 뺀다. 0126Z0 같은 새 영숫자 코드는 종목
            continue
        oc = official_close(kis, code, AFTER_MARKET_START, end)
        m = (df[code_col] == code) & (df.date >= AFTER_MARKET_START) & df.date.isin(oc.keys())
        df.loc[m, "Close"] = df.loc[m, "date"].map(oc)
    return df


def collect_us_peers(start: str, end: str) -> pd.DataFrame:
    """관계표 가설용 미국 짝 종목과 SPY 일봉(수정 종가)."""
    import yfinance as yf
    syms = sorted(set(US_PEERS.values()) | {"SPY"})
    out = []
    for sym in syms:
        d = yf.download(sym, start=start, end=end, progress=False, auto_adjust=True)
        d.columns = [c[0] if isinstance(c, tuple) else c for c in d.columns]
        d = d[["Close"]].copy()
        d.index = pd.to_datetime(d.index).strftime("%Y%m%d")
        d["symbol"] = sym
        out.append(d.rename_axis("us_date").reset_index())
        print(f"  {sym}: {len(d)}일", flush=True)
    return pd.concat(out, ignore_index=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--env", help="KIS_APP_KEY·KIS_APP_SECRET이 든 .env 경로")
    ap.add_argument("--skip-kis", action="store_true")
    ap.add_argument("--end", default=datetime.now().strftime("%Y%m%d"))
    ap.add_argument("--peers-only", action="store_true", help="미국 짝 종목만 받기")
    ap.add_argument("--night-minutes", action="store_true", help="야간선물 1분봉만 받기(KIS 키 필요)")
    ap.add_argument("--nxt", action="store_true", help="NXT 일봉만 받기(KIS 키 필요)")
    ap.add_argument("--nxt-premarket", action="store_true", help="표본 밖 날짜의 NXT 프리마켓 1분봉 받기(KIS 키 필요)")
    ap.add_argument("--krx-intraday", action="store_true", help="표본 밖 날짜의 KRX 09:00~10:30 1분봉 받기(KIS 키 필요)")
    ap.add_argument("--fix-close", action="store_true", help="kr_daily·universe_daily의 2026-09-14 이후 종가를 공식 종가로 고치기(원본은 *_fdr_raw.csv)")
    a = ap.parse_args()
    DATA.mkdir(exist_ok=True)
    if a.fix_close:
        kis = KIS(a.env)
        for name in ("kr_daily.csv", "universe_daily.csv"):
            path = DATA / name
            if not path.exists():
                continue
            raw = DATA / name.replace(".csv", "_fdr_raw.csv")
            df = pd.read_csv(raw if raw.exists() else path, dtype={"date": str, "code": str})
            if not raw.exists():
                df.to_csv(raw, index=False)
            fixed = fix_after_market_close(df, kis)
            n = int((fixed.Close != df.Close).sum())
            fixed.to_csv(path, index=False)
            print(f"  {name}: 종가 {n}행 고침(원본 {raw.name})", flush=True)
        raise SystemExit
    if a.krx_intraday:
        print("KRX 장 초반 1분봉")
        fut = pd.read_csv(DATA / "futures_daily.csv", dtype={"date": str})
        days = sorted(fut[(fut.session == "day") & (fut.date >= "20251029") & (fut.date <= a.end)].date.unique())
        collect_krx_intraday(a.env, days, ["069500"] + list(STOCKS))
        raise SystemExit
    if a.nxt_premarket:
        print("NXT 프리마켓 1분봉")
        fut = pd.read_csv(DATA / "futures_daily.csv", dtype={"date": str})
        days = sorted(fut[(fut.session == "day") & (fut.date >= "20251029") & (fut.date <= a.end)].date.unique())
        collect_nxt_premarket(a.env, days)
        raise SystemExit
    if a.nxt:
        print("NXT 일봉")
        collect_nxt_daily(a.env, "20250304", a.end).to_csv(DATA / "nxt_daily.csv", index=False)
        raise SystemExit
    if a.night_minutes:
        print("야간선물 1분봉")
        collect_night_minutes(a.env, a.end)
        raise SystemExit
    if a.peers_only:
        print("미국 짝 종목")
        collect_us_peers("2024-11-01", (pd.Timestamp(a.end) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")).to_csv(DATA / "us_peers_daily.csv", index=False)
        raise SystemExit
    if not a.skip_kis:
        print("1) 코스피200 선물 일봉(주간·야간)")
        collect_futures(a.env, a.end).to_csv(DATA / "futures_daily.csv", index=False)
    print("2) 국내 일봉")
    kr = collect_kr("2024-11-01", f"{a.end[:4]}-{a.end[4:6]}-{a.end[6:]}")
    if a.env:
        kr = fix_after_market_close(kr, KIS(a.env))
    kr.to_csv(DATA / "kr_daily.csv", index=False)
    print("3) 미국 일봉")
    collect_us_daily("2024-11-01", (pd.Timestamp(a.end) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")).to_csv(DATA / "us_daily.csv", index=False)
    print("4) 미국 시간봉")
    collect_us_hourly().to_csv(DATA / "us_hourly.csv", index=False)
    print("5) 미국 짝 종목")
    collect_us_peers("2024-11-01", (pd.Timestamp(a.end) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")).to_csv(DATA / "us_peers_daily.csv", index=False)
    print("완료:", ", ".join(p.name for p in sorted(DATA.glob("*.csv"))))
