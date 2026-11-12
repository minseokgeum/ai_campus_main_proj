"""앱이 읽는 자료. 앱은 아래 파일만 읽고, 모델 계산·수집은 pipeline/ 이 따로 맡는다.

data/model/days/<T>.json    아침 카드(07:30·08:11)와 계좌 범위 후보(AS1)  ← build_model_data.py
data/model/track_*.csv       전 기간 과거 재생의 예측과 개장 뒤 결과         ← build_model_data.py
data/night/<T>.csv           전날 밤 야간선물 1분봉                         ← build_night_news.py
data/news/<T>.json           사건 묶음·관계 경로·시장 반응·AI 문장           ← build_night_news.py

운영으로 넘어가면 같은 이름·같은 칸의 파일을 실시간 경로가 채운다(README '운영 연결').
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd
import streamlit as st

DATA = Path(__file__).resolve().parents[1] / "data"
RESEARCH = Path(os.environ.get("OVERNIGHT_RESEARCH", str(Path.home() / "4Digit/research/overnight_backtest")))   # 다른 위치면 환경변수로
WEEKDAY = "월화수목금토일"


def day_label(T: str) -> str:
    d = pd.Timestamp(T)
    return f"{d.year}년 {d.month}월 {d.day}일({WEEKDAY[d.weekday()]})"


def short_label(T: str) -> str:
    d = pd.Timestamp(T)
    return f"{d.month}/{d.day}({WEEKDAY[d.weekday()]})"


@st.cache_data(ttl=120)
def manifest() -> dict:
    p = DATA / "model/manifest.json"
    return json.loads(p.read_text()) if p.exists() else {}


@st.cache_data(ttl=120)   # 아침 봉인·장 마감 갱신으로 날짜 파일이 생기거나 바뀐다
def available_days() -> list[str]:
    return sorted((p.stem for p in (DATA / "model/days").glob("*.json")), reverse=True)


@st.cache_data(ttl=120)
def day(T: str) -> dict:
    d = json.loads((DATA / "model/days" / f"{T}.json").read_text())
    for k in ("card_0811", "card_0730"):
        if k in d:
            _add_extra_accounts(d[k])
    return d


def _extra_accounts() -> dict:
    p = DATA / "model/extra_accounts.json"
    return json.loads(p.read_text())["accounts"] if p.exists() else {}


def _add_extra_accounts(card: dict) -> None:
    """앱 시연용 추가 계좌(F~J, pipeline/build_extra_accounts.py)를 카드의 200종목 값으로 계산해 붙인다. 계좌 범위 후보(AS1)는 없다."""
    by = {s["code"]: s for s in card.get("stocks", [])}
    have = {a["name"] for a in card.get("accounts", [])}
    for name, a in _extra_accounts().items():
        if name in have:
            continue
        hold, excl = [], []
        for code, q in a["hold"].items():
            s = by.get(code)
            if s is None:
                excl.append(dict(code=code, q=q, reason="이날 카드에 없음(자료 부족)"))
                continue
            v = q * s["base_close"]["value"]
            hold.append(dict(code=code, q=q, value=v, H_amount=v * s["H"], band80_amount=[v * s["band80"][0], v * s["band80"][1]]))
        sv = sum(h["value"] for h in hold)
        card.setdefault("accounts", []).append(dict(
            name=name, cash=a["cash"], holdings=hold, excluded=excl, stock_value=sv, H_sum_amount=sum(h["H_amount"] for h in hold),
            summary_scope="supported_holdings_only", extra=True,
            account_band=dict(status="앱 시연 계좌 · 계좌 범위 후보 계산 안 함", value=None, note="종목 띠 금액을 더한 값은 계좌 범위가 아니다")))


@st.cache_data(ttl=120)   # 아침 봉인 뒤 몇 초 늦게 생기는 파일이라, 먼저 연 화면의 "없음"이 굳지 않게
def night(T: str) -> pd.DataFrame | None:
    p = DATA / "night" / f"{T}.csv"
    if not p.exists():
        return None
    d = pd.read_csv(p, parse_dates=["kst"])
    d["ret"] = d.price / d.day_close - 1
    return d


@st.cache_data(ttl=120)
def news_us(T: str) -> dict | None:
    """밤 차트에 겹칠 미국 뉴스(보도량 15분 묶음 + 관계표·AI 판정 연결 기사). build_night_news.py가 만든다."""
    p = DATA / "news_us" / f"{T}.json"
    return json.loads(p.read_text()) if p.exists() else None


@st.cache_data
def news(T: str) -> dict | None:
    p = DATA / "news" / f"{T}.json"
    return json.loads(p.read_text()) if p.exists() else None


@st.cache_data(ttl=120)
def track_stocks() -> pd.DataFrame:
    return pd.read_csv(DATA / "model/track_stocks.csv.gz", dtype={"T": str, "code": str})


@st.cache_data(ttl=120)
def track_accounts() -> pd.DataFrame:
    return pd.read_csv(DATA / "model/track_accounts.csv", dtype={"T": str})


@st.cache_data(ttl=120)
def track_days() -> pd.DataFrame:
    return pd.read_csv(DATA / "model/track_days.csv", dtype={"T": str, "D": str})


@st.cache_data
def forward_log() -> pd.DataFrame | None:
    p = RESEARCH / "results/forward_log.csv"
    if not p.exists():
        return None
    return pd.read_csv(p, dtype={"T": str, "D": str, "target": str})


def account_names(T: str) -> list[str]:
    return [a["name"] for a in day(T)["card_0811"]["accounts"]]


# 뉴스 원자료(단독 검증판)의 계좌 이름은 'A 반도체 집중'에서 앞 글자를 뺀 '반도체 집중'
def news_account_key(name: str) -> str:
    return name.split(" ", 1)[1] if " " in name else name


# ---------- 다가오는 일정 (11/4 강사님 의견: 보유 종목 관련 일정을 미리) ----------
WEEKDAY_FULL = "월화수목금토일"


def _second_thursday(year: int, month: int) -> pd.Timestamp:
    first = pd.Timestamp(year=year, month=month, day=1)
    offset = (3 - first.weekday()) % 7          # 첫 목요일
    return first + pd.Timedelta(days=offset + 7)


@st.cache_data
def upcoming_events(T: str, days: int = 7) -> list[dict]:
    """T일 아침 기준 앞으로 days일 안의 일정. 미국 일정은 그 결과가 반영되는 한국 아침 날짜로 옮긴다.

    - FOMC: 미국 D일 오후 결정 → 한국 D+1일 새벽 발표 → D+1일 아침에 반영(research data/fomc_dates.csv)
    - CPI·고용지표: 미국 D일 08:30 발표 → 한국 D일 밤 → D+1일 아침에 반영(data/fred_release_dates.csv)
    - 국내 선물·옵션 만기일: 매월 둘째 목요일(3·6·9·12월은 선물 동시 만기). 휴장이면 앞당겨지므로 확인 필요.
    """
    start = pd.Timestamp(T)
    end = start + pd.Timedelta(days=days)
    out = []
    try:
        f = pd.read_csv(RESEARCH / "data/fomc_dates.csv", dtype={"us_date": str})
        for d in pd.to_datetime(f.us_date):
            k = d + pd.Timedelta(days=1)
            if start < k <= end:
                out.append(dict(date=k, title="미국 FOMC 금리 결정", note=f"한국 시각 {k.month}/{k.day} 새벽 발표 → 그날 아침에 반영"))
        r = pd.read_csv(RESEARCH / "data/fred_release_dates.csv", dtype={"us_date": str}).drop_duplicates()
        names = {"CPI": "미국 소비자물가(CPI) 발표", "NFP": "미국 고용지표 발표"}
        for kind, d in zip(r.kind, pd.to_datetime(r.us_date)):
            k = d + pd.Timedelta(days=1)
            if start < k <= end:
                out.append(dict(date=k, title=names.get(kind, kind), note=f"한국 시각 {d.month}/{d.day} 밤 발표 → 다음 날 아침에 반영"))
    except FileNotFoundError:
        pass
    for y, m in {(start.year, start.month), (end.year, end.month)}:
        x = _second_thursday(y, m)
        if start < x <= end:
            quarter = m in (3, 6, 9, 12)
            out.append(dict(date=x, title="국내 선물·옵션 동시 만기일" if quarter else "국내 옵션 만기일",
                            note="국내 파생상품 만기일이에요(휴장이면 날짜가 앞당겨져요)"))
    out.sort(key=lambda e: e["date"])
    for e in out:
        e["dday"] = (e["date"] - start).days
        e["label"] = f"{e['date'].month}/{e['date'].day}({WEEKDAY_FULL[e['date'].weekday()]})"
    return out


# ---------- 09:00 개장 후: 그날까지 쌓인 결과 ----------
FWD_FIRST, FREEZE_T = "20261027", "20261103"


@st.cache_data(ttl=120)
def track_all() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """과거 재생(~10/26) + 확정 코드 전방 기록(10/27~, E100)을 같은 형식으로 잇는다."""
    s, d, a = track_stocks(), track_days(), track_accounts()
    fw = forward_record()
    if not fw:
        return s, d, a
    fs = fw[1].rename(columns={"dir_match": "nxt_dir_match"})
    s = pd.concat([s[s["T"] < FWD_FIRST], fs[[c for c in s.columns if c in fs.columns]]], ignore_index=True)
    fd = fs.groupby("T", as_index=False).x.first().assign(status="ok")
    fd["monday"] = pd.to_datetime(fd["T"]).dt.weekday.eq(0)
    d = pd.concat([d[d["T"] < FWD_FIRST], fd], ignore_index=True)
    fa = RESEARCH / "workbench/runs/claude_forward_r1/e100_accounts.csv"
    if fa.exists():
        fa = pd.read_csv(fa, dtype={"T": str}).rename(columns={"as1_lo": "L80", "as1_hi": "U80"})
        a = pd.concat([a[a["T"] < FWD_FIRST], fa[["T", "account", "stock_value", "L80", "U80", "y_P"]]], ignore_index=True)
    return s, d, a


def track_window(T: str, codes: tuple[str, ...], account: str, n: int = 20) -> dict:
    """T일을 포함한 최근 n거래일 결과. 10/26까지는 과거 재생, 10/27부터는 확정 코드 전방 기록."""
    s, days, acc = track_all()
    ok = days[(days.status == "ok") & (days["T"] <= T)].sort_values("T")
    win = list(ok["T"].tail(n))
    w = s[s["T"].isin(win) & s.y.notna()].merge(days[["T", "x"]], on="T", how="left")
    mine = w[w.code.isin(codes)]
    hi = mine[(mine.grade == "높음") & mine.nxt_dir_match.notna()]
    daily = (mine.assign(c=mine.in80.astype(bool)).groupby("T").c.mean().reindex(win) * 100).round(1)
    a = acc[(acc.account == account) & acc["T"].isin(win) & acc.y_P.notna()]
    return dict(
        days=len(win), first=win[0] if win else None, n_rows=len(mine),
        n_fwd=sum(t >= FWD_FIRST for t in win), n_after=sum(t >= FREEZE_T for t in win),
        cov_mine=float(mine.in80.astype(bool).mean() * 100) if len(mine) else None,
        cov_all=float(w.in80.astype(bool).mean() * 100) if len(w) else None,
        err_H=float((mine.y - mine.H).abs().mean() * 100) if len(mine) else None,
        err_x=float((mine.y - mine.x).abs().mean() * 100) if len(mine) else None,
        hi_match=float(hi.nxt_dir_match.astype(bool).mean() * 100) if len(hi) else None, hi_n=len(hi),
        acct_in=int(((a.y_P >= a.L80) & (a.y_P <= a.U80)).sum()), acct_n=len(a),
        daily=daily.reset_index().rename(columns={"c": "cov"}).to_dict("records"))


# ---------- 전방 기록(E100): 규칙 확정 뒤 처음 보는 날 ----------
LIVE_RUN = RESEARCH / "workbench/runs/claude_live_r1"


def _open_rows(after_T: str) -> pd.DataFrame:
    """E100(장 마감 뒤 계산)에 아직 없는 날을 개장 직후 시가로 먼저 채점한 임시 줄(11/11 추가).
    아침 카드(card_T_0811, 없으면 0730)의 H·노란띠·08:11 등급 + check_open이 받은 그날 시가. E100 줄과 같은 칸·같은 정의.
    16:05 장 마감 작업이 E100을 다시 돌리면 그 날은 E100 줄로 바뀐다(이 함수는 E100 마지막 날 뒤만 본다)."""
    rows = []
    days = sorted({p.name.split("_")[1] for p in LIVE_RUN.glob("check_*_*.json")})
    for T in (t for t in days if t > after_T):
        slot = next((s for s in ("0811", "0730") if (LIVE_RUN / f"check_{T}_{s}.json").exists() and (LIVE_RUN / f"card_{T}_{s}.json").exists()), None)
        if not slot:
            continue
        card = json.loads((LIVE_RUN / f"card_{T}_{slot}.json").read_text())
        ys = {r["code"]: r["y"] for r in json.loads((LIVE_RUN / f"check_{T}_{slot}.json").read_text())["rows"] if r.get("y") is not None}
        x = card["market"]["x"]
        for s in card["stocks"]:
            y = ys.get(s["code"])
            if y is None:
                continue
            lo, hi = s["band80"]
            g = s.get("grade_0811") or {}
            ng = g.get("nxt_g")
            rows.append(dict(T=T, code=s["code"], name=s["name"], x=x, H=s["H"], L80=lo, U80=hi, y=y, in80=lo <= y <= hi, up=y > hi, down=y < lo,
                             grade=g.get("level"), p=g.get("p"), nxt_g=ng,
                             dir_match=None if ng is None or ng == 0 or y == 0 else (ng > 0) == (y > 0),
                             cautions="|".join(c["kind"] for c in s.get("cautions", [])), prov=True,
                             issued_at=card.get("issued_at", "")))
    return pd.DataFrame(rows)


def _fw_summary(s: pd.DataFrame) -> dict:
    """e100_forward.summary와 같은 계산(날짜별 평균의 평균). 계좌 범위는 넣지 않는다."""
    if s.empty:
        return {}
    g = s[s.grade.notna() & s.dir_match.notna()]
    by = s.groupby("T")
    out = dict(days=int(s["T"].nunique()), stock_days=len(s),
               in80=round(float(by.in80.mean().mean() * 100), 1), above=round(float(by.up.mean().mean() * 100), 1),
               below=round(float(by.down.mean().mean() * 100), 1),
               mae_H=round(float((s.y - s.H).abs().groupby(s["T"]).mean().mean() * 100), 3),
               mae_x=round(float((s.y - s.x).abs().groupby(s["T"]).mean().mean() * 100), 3))
    for lv in ("높음", "보통", "낮음"):
        q = g[g.grade == lv]
        out[f"dir_{lv}"] = None if q.empty else dict(rate=round(float(q.dir_match.astype(bool).mean() * 100), 1), n=len(q))
    return out


def _fw_day(T: str, s: pd.DataFrame, prov: bool) -> dict:
    hi = s[s.grade == "높음"].dir_match.dropna()
    return dict(T=T, group=("확정 후" if T >= FREEZE_T else "확정 전") + (" · 개장 직후(임시)" if prov else ""), x=round(float(s.x.iloc[0]) * 100, 2),
                in80=round(float(s.in80.mean() * 100), 1), above=round(float(s.up.mean() * 100), 1), below=round(float(s.down.mean() * 100), 1),
                mae_H=round(float((s.y - s.H).abs().mean() * 100), 3), mae_x=round(float((s.y - s.x).abs().mean() * 100), 3),
                hi_dir=None if hi.empty else round(float(hi.astype(bool).mean() * 100), 1),
                mean_H=round(float(s.H.mean() * 100), 2), mean_y=round(float(s.y.mean() * 100), 2))


@st.cache_data(ttl=120)
def forward_record() -> tuple[dict, pd.DataFrame] | None:
    """E100 전방 기록 + (장 마감 전이면) 그날 개장 직후 임시 줄. res['prov_days']에 임시 날짜, 요약은 임시 줄까지 넣어 다시 계산."""
    d = RESEARCH / "workbench/runs/claude_forward_r1"
    if not (d / "e100.json").exists():
        return None
    res = json.loads((d / "e100.json").read_text())
    fs = pd.read_csv(d / "e100_stocks.csv", dtype={"T": str, "code": str}).assign(prov=False)
    extra = _open_rows(fs["T"].max())
    res["prov_days"] = sorted(extra["T"].unique()) if not extra.empty else []
    if extra.empty:
        return res, fs
    res["prov_issued"] = {T: q.issued_at.iloc[0] for T, q in extra.groupby("T")}
    fs = pd.concat([fs, extra.drop(columns="issued_at")], ignore_index=True)
    res["per_day"] = res["per_day"] + [_fw_day(T, q, True) for T, q in extra.groupby("T")]
    for key, m in (("after_freeze", fs["T"] >= FREEZE_T), ("from_1102", fs["T"] >= "20261102"), ("all", fs["T"] >= "0")):
        acct = (res.get(key) or {}).get("account_as1_in")
        res[key] = _fw_summary(fs[m]) | ({"account_as1_in": acct} if acct else {})
    return res, fs


@st.cache_data
def intime_check() -> dict | None:
    p = RESEARCH / "workbench/runs/claude_intime_r1/e101.json"
    return json.loads(p.read_text()) if p.exists() else None


# ---------- 빗나간 종목 해부(E104)·국내 기사 원장·DART ----------
@st.cache_data(ttl=120)
def miss_anatomy() -> tuple[dict, pd.DataFrame] | None:
    d = RESEARCH / "workbench/runs/claude_miss_r2"          # 11/10 v2: 사업보고서 기준 업종 + 11/10 포함
    if not (d / "e104.json").exists():
        d = RESEARCH / "workbench/runs/claude_miss_r1"
    if not (d / "e104.json").exists():
        return None
    return json.loads((d / "e104.json").read_text()), pd.read_csv(d / "e104_stocks.csv", dtype={"T": str, "code": str})


@st.cache_data(ttl=120)
def news_kr() -> pd.DataFrame | None:
    """국내 기사 원장(네이버 검색·구글 날짜 검색으로 되채움). 빗나간 날 복기용이며 관계표 경로의 입력이 아니다."""
    p = RESEARCH / "workbench/live/news_kr_20261110/articles.csv"
    if not p.exists():
        return None
    return pd.read_csv(p, dtype={"code": str})


@st.cache_data
def dart_filings() -> pd.DataFrame | None:
    p = RESEARCH / "workbench/live/20261109/dart_filings.csv"
    return pd.read_csv(p, dtype=str) if p.exists() else None


def overnight_window(T: str) -> tuple[str, str]:
    """직전 거래일 15:30 ~ 그날 09:00(KST) 문자열. 직전 거래일은 연구 달력(코스피200 일봉)에서 찾는다."""
    cal = _calendar()
    prev = max((c for c in cal if c < T), default=T)
    return f"{prev[:4]}-{prev[4:6]}-{prev[6:]} 15:30", f"{T[:4]}-{T[4:6]}-{T[6:]} 09:00"


@st.cache_data
def _calendar() -> list[str]:
    p = RESEARCH / "workbench/live/20261109/data/kr_daily.csv"
    k = pd.read_csv(p, dtype={"date": str, "code": str})
    return sorted(k[k.code == "KS200"].date)


@st.cache_data(ttl=120)
def signals_record() -> dict | None:
    """E103 r2: 장 전 신호가 노란띠 이탈을 미리 가려내나."""
    p = RESEARCH / "workbench/runs/claude_signals_r2/e103.json"
    return json.loads(p.read_text()) if p.exists() else None


# ---------- 미국 뉴스 연결(알파카 + 관계표 규칙 + OpenAI 판정·방향) ----------
US_NOTE = ("미국 뉴스는 밤사이(직전 거래일 15:30 ~ 그날 07:30) 알파카(Benzinga) 기사를 관계표 줄로 이은 것이에요. "
           "'규칙 확인'은 티커·회사명·검색어가 제목에 그대로 있는 연결, 'AI 판정'은 OpenAI 모델이 관계표 경로를 골라 판정하고 코드가 근거 구절을 원문과 대조한 연결이에요. "
           "'업종 핵심어(판정 전)'은 사업 기준 업종마다 정한 거시·업황 단어가 제목에 나온 기사로, 관련성을 판정하지 않았어요. "
           "방향(수요 증가 쪽/감소 쪽)은 기사 내용의 방향이지 주가 예측이 아니고, 이 뉴스가 시가를 움직였다는 뜻도 아니에요.")


@st.cache_data(ttl=120)
def us_news() -> pd.DataFrame | None:
    """관계표 연결(규칙 확인 + AI 판정)과 업종 핵심어 연결(판정 전)을 함께. tier로 구분한다."""
    run = RESEARCH / "workbench/runs/claude_uslink_r1"
    parts = [pd.read_csv(run / f, dtype={"T": str, "kr_code": str}).fillna("") for f in ("us_news_by_stock.csv", "us_news_segment.csv") if (run / f).exists()]
    return pd.concat(parts, ignore_index=True) if parts else None


SEG_TIER = "업종 핵심어(판정 전)"


@st.cache_data(ttl=120)
def us_macro() -> pd.DataFrame | None:
    p = RESEARCH / "workbench/runs/claude_uslink_r1/macro.csv"
    return pd.read_csv(p, dtype={"T": str}).fillna("") if p.exists() else None


@st.cache_data(ttl=600)
def segments() -> pd.DataFrame | None:
    """사업보고서 기준 세부 업종(E105 1단계, segments_final.csv)."""
    p = RESEARCH / "workbench/runs/claude_segments_r1/segments_final.csv"
    if not p.exists():
        return None
    s = pd.read_csv(p, dtype={"code": str})
    return s[["code", "final"]].rename(columns={"final": "업종"})


# ---------- 아침 뉴스 연결 기록(봉인) ----------
LIVE_RUN = RESEARCH / "workbench/runs/claude_live_r1"


@st.cache_data(ttl=120)
def news_record(T: str) -> dict | None:
    """그날 미국 뉴스 연결을 고정해 둔 기록(news_T/manifest.json). 처음 남긴 것만 본다(재계산본은 news_T_재계산_*)."""
    p = LIVE_RUN / f"news_{T}/manifest.json"
    if not p.exists():
        return None
    m = json.loads(p.read_text())
    sha = LIVE_RUN / f"news_{T}/manifest.json.sha256"
    m["manifest_sha256"] = sha.read_text().split()[0] if sha.exists() else ""
    return m


def news_record_line(T: str) -> str:
    m = news_record(T)
    if m is None:
        return "이 날 뉴스 연결은 따로 고정해 두지 않았어요(11/10 전 날짜는 나중에 같은 규칙으로 만든 연결이에요)."
    when = m["issued_at"][11:16]
    if m["before_open"]:
        return f"장 전 고정 기록: 이 날 {when}(개장 전)에 연결 결과를 고정했어요 · 고정 표시(해시) {m['manifest_sha256'][:12]}… · 밤사이 기사 {m['counts']['articles']:,}건을 봤어요."
    return f"이 날 연결은 개장 뒤 {when}에 만든 기록이에요(장 전 기록 아님) · 밤사이 기사 {m['counts']['articles']:,}건을 봤어요."


# ---------- 관계표(그래프 v0 · E105 업종 사이 관계) ----------
@st.cache_data(ttl=600)
def graph() -> tuple[pd.DataFrame, pd.DataFrame] | None:
    g = RESEARCH / "workbench/runs/claude_graph_v0"
    if not (g / "edges.csv").exists():
        return None
    e = pd.read_csv(g / "edges.csv", dtype=str).fillna("")
    n = pd.read_csv(g / "nodes.csv", dtype=str).fillna("")
    return n, e


@st.cache_data(ttl=600)
def e105() -> tuple[dict, pd.DataFrame, pd.DataFrame] | None:
    r = RESEARCH / "workbench/runs/claude_e105_r1"
    if not (r / "summary.json").exists():
        return None
    return json.loads((r / "summary.json").read_text()), pd.read_csv(r / "node_edges.csv"), pd.read_csv(r / "driver_edges.csv")


@st.cache_data(ttl=600)
def segment_table() -> pd.DataFrame | None:
    """종목별 세부 업종·상위 묶음과 E105 노드(같은 세부 업종이 2종목 이상이면 세부 업종, 아니면 상위 묶음)."""
    p = RESEARCH / "workbench/runs/claude_segments_r1/segments_final.csv"
    if not p.exists():
        return None
    s = pd.read_csv(p, dtype={"code": str})
    cnt = s.final.value_counts()
    s["node"] = s.final.where(s.final.map(cnt) >= 2, s.final_parent)
    return s[["code", "name", "final", "final_parent", "node", "price_label", "price_corr", "price_strength", "agree"]]
