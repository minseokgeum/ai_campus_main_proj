"""실제 날짜용 자료 폴더를 만든다(읽기 전용 시세·공시 조회). 연구 data/와 연구 공시 목록은 바꾸지 않는다.

workbench/live/<name>/data/에 연구 입력 파일을 복사하고, 연구 자료 끝 뒤의 날짜를 이어 붙인다.
- futures_daily: 한국투자증권 일봉(F 주간·CM 야간), 그 날짜의 근월물(common.FRONTS)
- universe_daily: 한국투자증권 일봉(FHKST03010100, J)의 시가·종가 200종목. 종가가 확정되지 않은 날(16:00 전 오늘)은 넣지 않는다
- kr_daily: KS200 행만 FinanceDataReader로 이어 붙인다(이 파일의 다른 행은 S1·D08 계산에 쓰이지 않는다)
- universe_premarket: 한국투자증권 NXT 1분봉(FHKST03010230, NX) 08:00~08:10, 200종목, --premarket-days 날짜
- night_minutes: data/night_minutes_20261030.csv에서 시작(원본 night_minutes.csv는 해시 고정이라 그대로). 11/10부터 끝난 밤을 한국투자증권 1분봉(FHKIF03020200, CM)으로
  이어 받는다(화면 차트용, S1·D08에는 안 씀). 아침 봉인은 --no-night로 카드 먼저, 봉인 뒤 --night-only로 받는다
- 공시: 연구 공시 목록 + 그 뒤 날짜를 DART 일자별 목록에서 200종목만 골라 이어 붙인다
- 나머지(us_hourly·vix·투자자·FRED·FOMC·ks200_long)는 복사만 한다. S1 띠와 08시 등급 계산에는 쓰이지 않는다
키는 --env 파일에서 읽고 출력하지 않는다.
11/4 보완:
- 휴장일 확인: 한국투자증권 국내휴장일조회(CTCA0903R)의 개장일 여부로 --until 날짜를 확인한다. 휴장일이면 받지 않고 manifest에 사유만 남긴다.
  조회가 실패하면 주말만 막고, manifest에 '휴장일 조회 실패(주말만 확인)'를 남긴다.
- 증분 갱신: --base(기본 auto)로 직전 자료 폴더를 이어받아, 그 폴더의 마지막 날짜 뒤만 받는다. 같은 이름 폴더가 이미 있으면 그 폴더 위에 잇는다.
  --base none이면 예전처럼 연구 data/ 사본에서 시작한다.
- NXT 분봉은 이미 받은 지난 날짜는 다시 받지 않고, 오늘 날짜는 08:11 뒤에만 받는다.
사용: PYTHONPATH=.:src .venv/bin/python -m workbench.live_refresh --name 20261103 --env ~/4Digit-solo/.env --until 20261103 --premarket-days 20261027,20261028
"""
from __future__ import annotations

import argparse
import json
import shutil
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

from workbench import live_panel as lp

R = lp.RESEARCH
EVENTS = R / "workbench/runs/claude_events_r1/dart_filings.csv"


def kis_get(kis, path, tr, params):
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{kis.base}{path}?{q}", headers={"content-type": "application/json", "authorization": "Bearer " + kis.token,
                                                                  "appkey": kis.key, "appsecret": kis.secret, "tr_id": tr, "custtype": "P"})
    for _ in range(5):
        try:
            res = json.loads(urllib.request.urlopen(req, timeout=30).read())
        except Exception:
            time.sleep(2); continue
        if res.get("msg_cd") != "EGW00201":
            time.sleep(0.12)
            return res
        time.sleep(1)
    return {}


def front(day):
    from common import FRONTS
    return next(c for c, a, b in FRONTS if a <= day <= b)


def parse_open(res, day):
    """국내휴장일조회 응답에서 day의 개장일 여부. 찾지 못하면 None."""
    for r in res.get("output") or []:
        if r.get("bass_dt") == day and r.get("opnd_yn") in ("Y", "N"):
            return r["opnd_yn"] == "Y"
    return None


def trading_day(kis, day):
    """(개장일 여부, 확인 방법). 조회 실패 시 주말만 막는다."""
    res = kis_get(kis, "/uapi/domestic-stock/v1/quotations/chk-holiday", "CTCA0903R", {"BASS_DT": day, "CTX_AREA_NK": "", "CTX_AREA_FK": ""})
    ok = parse_open(res, day)
    if ok is not None:
        return ok, "국내휴장일조회 CTCA0903R"
    return pd.Timestamp(day).weekday() < 5, "휴장일 조회 실패(주말만 확인)"


def premarket_todo(df, days, now):
    """받을 NXT 날짜. 이미 있는 지난 날짜는 빼고, 오늘은 08:11 뒤에만, 미래 날짜는 뺀다."""
    have = set(df["day"]) if len(df) else set()
    today = now.strftime("%Y%m%d")
    out = []
    for d in days:
        if d > today or (d == today and now < pd.Timestamp(d + " 08:11", tz="Asia/Seoul")):
            continue
        if d < today and d in have:
            continue
        out.append(d)
    return out


def pick_base(live_dir, name, base):
    """이어받을 폴더. 같은 이름 폴더에 manifest가 있으면 그 폴더, auto면 이름이 더 앞인 가장 최근 폴더, none이면 None."""
    if base == "none":
        return None
    if base != "auto":
        return live_dir / base
    if (live_dir / name / "refresh_manifest.json").exists() and (live_dir / name / "data/futures_daily.csv").exists():
        return live_dir / name
    prev = sorted(p for p in live_dir.iterdir() if p.is_dir() and p.name < name and (p / "refresh_manifest.json").exists() and (p / "data/futures_daily.csv").exists()) if live_dir.exists() else []
    return prev[-1] if prev else None


def finished(session, d, now):
    """끝난 장만 넣는다. 주간장은 그날 15:50 뒤, 야간장(D 18:00~D+1 06:00)은 D+1 06:05 뒤."""
    if session == "day":
        return pd.Timestamp(d + " 15:50", tz="Asia/Seoul") <= now
    return pd.Timestamp(d + " 06:05", tz="Asia/Seoul") + pd.Timedelta(days=1) <= now


def refresh_futures(kis, df, start, until, now):
    rows = []
    for code in sorted({front(d) for d in pd.date_range(start, until).strftime("%Y%m%d")}):
        for market, session in (("F", "day"), ("CM", "night")):
            for r in kis.daily(market, code, start, until):
                d = r.get("stck_bsop_date")
                if d and start <= d <= until and front(d) == code and finished(session, d, now):
                    rows.append(dict(date=d, session=session, code=code, open=float(r["futs_oprc"]), high=float(r["futs_hgpr"]),
                                     low=float(r["futs_lwpr"]), close=float(r["futs_prpr"]), volume=float(r.get("acml_vol") or 0)))
    new = pd.DataFrame(rows, columns=["date", "session", "code", "open", "high", "low", "close", "volume"])
    if new.empty:
        return df
    return pd.concat([df, new[~new.set_index(["date", "session"]).index.isin(df.set_index(["date", "session"]).index)]], ignore_index=True).sort_values(["date", "session"])


def night_minutes(kis, d, code):
    """야간선물 1분봉 한 밤(D 18:00~D+1 06:00, 시각은 30:00식). runs/claude_night_minutes_r1/fill.py와 같은 조회(FHKIF03020200, CM)."""
    bars, hour = {}, "300000"
    for _ in range(12):
        res = kis_get(kis, "/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice", "FHKIF03020200",
                      {"FID_COND_MRKT_DIV_CODE": "CM", "FID_INPUT_ISCD": code, "FID_HOUR_CLS_CODE": "60", "FID_PW_DATA_INCU_YN": "Y",
                       "FID_FAKE_TICK_INCU_YN": "N", "FID_INPUT_DATE_1": d, "FID_INPUT_HOUR_1": hour})
        rows = [r for r in (res.get("output2") or []) if r.get("stck_bsop_date") == d]
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
    return pd.DataFrame([(d, code, k, p, v) for k, (p, v) in sorted(bars.items())], columns=["date", "code", "hhmmss", "price", "volume"])


def refresh_night_minutes(kis, nm, fut, until, now):
    """끝난 밤만, 이미 있는 밤 뒤만. 받을 밤 = futures_daily에 야간 일봉이 있는 날(휴장·주말 밤을 헛조회하지 않음)."""
    have = set(nm.date)
    nights = sorted(d for d in fut[(fut.session == "night")].date.unique() if d > nm.date.max() and d <= until and finished("night", d, now) and d not in have)
    got, new = {}, []
    for d in nights:
        code = fut[(fut.session == "night") & (fut.date == d)].code.iloc[0]
        df = night_minutes(kis, d, code)
        got[d] = dict(code=code, bars=int(len(df)), first=df.hhmmss.min() if len(df) else None, last=df.hhmmss.max() if len(df) else None)
        if len(df):
            new.append(df)
    if new:
        nm = pd.concat([nm] + new, ignore_index=True).sort_values(["date", "hhmmss"], kind="stable")
    return nm, got


def refresh_stocks(kis, df, codes, start, last_close_day):
    rows = []
    for code in codes:
        res = kis_get(kis, "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice", "FHKST03010100",
                      {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code, "FID_INPUT_DATE_1": start, "FID_INPUT_DATE_2": last_close_day,
                       "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0"})
        for r in res.get("output2") or []:
            d = r.get("stck_bsop_date")
            if d and start <= d <= last_close_day and float(r["stck_oprc"]) > 0:
                rows.append(dict(date=d, Open=float(r["stck_oprc"]), Close=float(r["stck_clpr"]), code=code))
    new = pd.DataFrame(rows, columns=["date", "Open", "Close", "code"])
    if new.empty:
        return df
    old = df.set_index(["date", "code"]).index
    return pd.concat([df, new[~new.set_index(["date", "code"]).index.isin(old)]], ignore_index=True).sort_values(["code", "date"])


def refresh_premarket(kis, df, codes, days):
    rows = []
    for day in days:
        for code in codes:
            res = kis_get(kis, "/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice", "FHKST03010230",
                          {"FID_COND_MRKT_DIV_CODE": "NX", "FID_INPUT_ISCD": code, "FID_INPUT_HOUR_1": "081000", "FID_INPUT_DATE_1": day,
                           "FID_PW_DATA_INCU_YN": "N", "FID_FAKE_TICK_INCU_YN": ""})
            for r in res.get("output2") or []:
                if r.get("stck_bsop_date") == day and "080000" <= r["stck_cntg_hour"] <= "081000":
                    rows.append(dict(day=day, code=code, hhmmss=r["stck_cntg_hour"], price=float(r["stck_prpr"]), volume=float(r["cntg_vol"])))
    new = pd.DataFrame(rows, columns=["day", "code", "hhmmss", "price", "volume"])
    keys = ["day", "code", "hhmmss"]
    new = new.drop_duplicates(keys)
    if new.empty:
        return df, 0
    return pd.concat([df, new[~new.set_index(keys).index.isin(df.set_index(keys).index)]], ignore_index=True), len(new)


def refresh_ks200(df, start, until):
    import FinanceDataReader as fdr
    k = fdr.DataReader("KS200", pd.Timestamp(start).strftime("%Y-%m-%d"), pd.Timestamp(until).strftime("%Y-%m-%d")).reset_index()
    k["date"] = k.iloc[:, 0].dt.strftime("%Y%m%d")
    k = k[k.date > df[df.code == "KS200"].date.max()]
    if k.empty:
        return df
    add = pd.DataFrame(dict(date=k.date, Open=k.Open, High=k.High, Low=k.Low, Close=k.Close, Volume=k.Volume, code="KS200", name="코스피200 지수"))
    return pd.concat([df, add], ignore_index=True)


def refresh_dart(env, universe_codes, start, until, old_path=EVENTS):
    key = next(l.split("=", 1)[1].strip().strip('"') for l in Path(env).read_text().splitlines() if l.startswith("DART_API_KEY="))
    old = pd.read_csv(old_path, dtype=str)
    corp = dict(zip(old.code, old.corp_code))
    rows = []
    for day in pd.date_range(start, until).strftime("%Y%m%d"):
        page = 1
        while True:
            q = urllib.parse.urlencode(dict(crtfc_key=key, bgn_de=day, end_de=day, page_no=page, page_count=100))
            try:
                d = json.loads(urllib.request.urlopen("https://opendart.fss.or.kr/api/list.json?" + q, timeout=40).read())
            except Exception as e:
                raise SystemExit(f"DART 실패: {type(e).__name__}")
            if d.get("status") == "020":
                raise SystemExit("DART 호출 한도 초과")
            for f in d.get("list", []) if d.get("status") == "000" else []:
                sc = (f.get("stock_code") or "").strip()
                if sc in universe_codes:
                    rows.append(dict(code=sc, corp_code=f["corp_code"], rcept_no=f["rcept_no"], rcept_dt=f["rcept_dt"], report_nm=" ".join(f["report_nm"].split()),
                                     corp_cls=f.get("corp_cls", ""), flr_nm=f.get("flr_nm", ""), rm=f.get("rm", "")))
            if d.get("status") != "000" or page >= int(d.get("total_page", 1)):
                break
            page += 1
            time.sleep(.12)
    new = pd.DataFrame(rows, columns=old.columns)
    if new.empty:
        return old, 0
    out = pd.concat([old, new[~new.rcept_no.isin(old.rcept_no)]], ignore_index=True).sort_values(["code", "rcept_dt", "rcept_no"])
    return out, len(new)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--env", required=True)
    ap.add_argument("--until", required=True, help="이 날까지(포함) 이어 붙인다. 보통 대상일 T")
    ap.add_argument("--premarket-days", default="", help="NXT 08:00~08:10을 받을 날짜, 쉼표로")
    ap.add_argument("--base", default="auto", help="이어받을 자료 폴더 이름. auto(기본) / none(연구 data/에서 시작) / 폴더 이름")
    ap.add_argument("--no-night", action="store_true", help="야간선물 1분봉은 받지 않는다(아침 봉인: 카드 먼저, 1분봉은 봉인 뒤 --night-only로)")
    ap.add_argument("--night-only", action="store_true", help="이미 있는 폴더의 야간선물 1분봉만 이어 받는다(다른 파일·manifest 기록은 그대로)")
    a = ap.parse_args()
    from collect import KIS
    live = R / "workbench/live"
    out = live / a.name
    data = out / "data"
    kis = KIS(a.env)
    now = pd.Timestamp.now(tz="Asia/Seoul")
    log = {"started_at": now.isoformat(timespec="seconds")}
    is_open, how = trading_day(kis, a.until)
    log["trading_day"] = dict(date=a.until, open=bool(is_open), checked_by=how)
    if not is_open:
        out.mkdir(parents=True, exist_ok=True)
        log["finished_at"] = pd.Timestamp.now(tz="Asia/Seoul").isoformat(timespec="seconds")
        log["skipped"] = "휴장일이라 자료를 받지 않음"
        (out / "refresh_manifest.json").write_text(json.dumps(log, ensure_ascii=False, indent=1))
        print(json.dumps(log, ensure_ascii=False))
        return
    base = pick_base(live, a.name, a.base)
    data.mkdir(parents=True, exist_ok=True)
    if base is None:
        for n in lp.INPUTS:
            shutil.copy2(R / "data" / n, data / n)
        shutil.copy2(R / "data/night_minutes_20261030.csv", data / "night_minutes.csv")
        old_filings = EVENTS
        log["base"] = "research data/"
    elif base.resolve() == out.resolve():
        old_filings = out / "dart_filings.csv"
        log["base"] = f"live/{base.name}(같은 폴더에 이어서)"
    else:
        for n in lp.INPUTS:
            shutil.copy2(base / "data" / n, data / n)
        old_filings = base / "dart_filings.csv"
        log["base"] = f"live/{base.name}"
    read = lambda n: pd.read_csv(data / n, dtype=lp.TYPES)
    fut = read("futures_daily.csv")
    # 주간·야간 중 더 늦게 끝난 쪽에 맞추면 다른 쪽 밤이 빠진다(10/26 야간 누락, 11/3). 더 이른 쪽 다음 날부터 받는다.
    start = (pd.Timestamp(min(fut[fut.session == s].date.max() for s in ("day", "night"))) + pd.Timedelta(days=1)).strftime("%Y%m%d")
    if start <= a.until and not a.night_only:
        fut = refresh_futures(kis, fut, start, a.until, now)
        fut.to_csv(data / "futures_daily.csv", index=False)
    log["futures_last"] = {s: fut[fut.session == s].date.max() for s in ("day", "night")}
    # 야간선물 1분봉(화면의 밤사이 차트용, S1·D08 계산에는 쓰지 않음). 11/10까지는 10/30에서 멈춰 있었다(받는 단계가 없었음).
    nm = pd.read_csv(data / "night_minutes.csv", dtype={"date": str, "code": str, "hhmmss": str})
    got = {}
    if not a.no_night:
        nm, got = refresh_night_minutes(kis, nm, fut, a.until, now)
    if got:
        nm.to_csv(data / "night_minutes.csv", index=False)
    log["night_minutes"] = dict(fetched=got, last=nm.date.max(), skipped="--no-night" if a.no_night else None)
    if a.night_only:
        log["finished_at"] = pd.Timestamp.now(tz="Asia/Seoul").isoformat(timespec="seconds")
        old = json.loads((out / "refresh_manifest.json").read_text()) if (out / "refresh_manifest.json").exists() else {}
        old.setdefault("night_minutes_updates", []).append(dict(at=log["finished_at"], **log["night_minutes"], sha256=lp.sha(data / "night_minutes.csv")))
        old.setdefault("inputs_sha256", {})["night_minutes.csv"] = lp.sha(data / "night_minutes.csv")
        (out / "refresh_manifest.json").write_text(json.dumps(old, ensure_ascii=False, indent=1))
        print(json.dumps(log["night_minutes"], ensure_ascii=False))
        return
    last_close = a.until if (a.until < now.strftime("%Y%m%d") or now.hour >= 16) else (pd.Timestamp(a.until) - pd.Timedelta(days=1)).strftime("%Y%m%d")
    codes = pd.read_csv(data / "universe.csv", dtype={"Code": str}).Code.tolist()
    ud = read("universe_daily.csv")
    s2 = (pd.Timestamp(ud.date.max()) + pd.Timedelta(days=1)).strftime("%Y%m%d")
    if s2 <= last_close:
        ud = refresh_stocks(kis, ud, codes, s2, last_close)
        ud.to_csv(data / "universe_daily.csv", index=False)
    log["universe_daily_last"] = ud.date.max()
    kr = read("kr_daily.csv")
    if s2 <= last_close:
        kr = refresh_ks200(kr, s2, last_close)
        kr.to_csv(data / "kr_daily.csv", index=False)
    log["ks200_last"] = kr[kr.code == "KS200"].date.max()
    pm = read("universe_premarket.csv")
    asked = [d for d in a.premarket_days.split(",") if d]
    days = premarket_todo(pm, asked, now)
    log["premarket_days"] = dict(asked=asked, fetched=days, skipped=[d for d in asked if d not in days])
    if days:
        pm, n_new = refresh_premarket(kis, pm, codes, days)
        pm.to_csv(data / "universe_premarket.csv", index=False)
        log["premarket_new_rows"] = n_new
    ev = pd.read_csv(old_filings, dtype=str)
    d0 = (pd.Timestamp(ev.rcept_dt.max()) + pd.Timedelta(days=1)).strftime("%Y%m%d")
    filings, n_new = refresh_dart(a.env, set(codes), d0, a.until, old_filings) if d0 <= a.until else (ev, 0)
    filings.to_csv(out / "dart_filings.csv", index=False)
    log["dart_new_rows"], log["dart_last"] = n_new, filings.rcept_dt.max()
    log["inputs_sha256"] = {n: lp.sha(data / n) for n in lp.INPUTS}
    log["finished_at"] = pd.Timestamp.now(tz="Asia/Seoul").isoformat(timespec="seconds")
    (out / "refresh_manifest.json").write_text(json.dumps(log, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in log.items() if k != "inputs_sha256"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
