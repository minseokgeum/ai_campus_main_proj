"""라이브 묶음: 모델이 이미 만든 결과 파일을 읽어 화면용 묶음을 만든다. 계산은 하지 않는다.

읽는 곳
- DATA_ROOT(기본 overnight_briefing/app/data): 아침·장 마감 작업(model/run_day.sh)이 매일 갱신하는 날짜 파일(카드·계좌 범위·야간선물 1분봉·미국 기사 연결)
- OVERNIGHT_RESEARCH(기본 overnight_briefing/model): 카드·채점·규칙 확정 뒤 기록
읽기 함수는 Streamlit 앱(overnight_briefing/app/core/data.py)의 것을 그대로 빌려 쓴다(같은 파일, 같은 숫자).
pandas가 필요하므로 이 모듈은 로컬(라이브)에서만 쓴다. 배포판은 build_snapshot.py가 이 결과를 JSON으로 굳혀 쓴다.
"""
from __future__ import annotations
from core.trust08 import t08 as _t08

import hashlib
import importlib.util
import json
import logging
import math
import os
from functools import lru_cache
from pathlib import Path

import pandas as pd

from . import news as N

SERVICE = Path(__file__).resolve().parents[1]
OB = SERVICE.parent                                     # overnight_briefing/
REPO = OB.parent                                        # 저장소 루트
DATA_ROOT = Path(os.environ.get("DATA_ROOT") or OB / "app/data").expanduser()   # 화면 자료 폴더(맥은 local.conf로 지정)

os.environ.setdefault("STREAMLIT_LOGGER_LEVEL", "error")    # 화면 없이 읽기 함수만 빌려 쓰므로 '실행 환경 없음' 안내는 끈다
_spec = importlib.util.spec_from_file_location("ob_app_data", OB / "app/core/data.py")
D = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(D)
D.DATA = DATA_ROOT                                      # 앱 저장소 사본에는 데이터가 없으니, 매일 갱신되는 실제 자료를 가리킨다
import streamlit.runtime.caching.cache_data_api  # noqa: E402,F401  (아래에서 이 기록기까지 조용히 하려고 미리 불러 둠)
for _n in list(logging.root.manager.loggerDict):        # 화면 없이 읽기 함수만 빌려 쓰므로 Streamlit의 '실행 환경 없음' 안내는 끈다
    if _n.startswith("streamlit"):
        logging.getLogger(_n).setLevel(logging.ERROR)

WD = "월화수목금토일"
BUY_DATES = ["20260105", "20260210", "20260316", "20260420", "20260518"]   # 예시 계좌 평균단가로 쓰는 실제 과거 종가의 날짜
DAY_CAUTION = {"mon": ("월요일 아침이에요", "주말 동안 쌓인 소식이 한꺼번에 반영돼서, 과거 월요일엔 시가가 예상 범위를 벗어난 날이 더 많았어요. "
                       "다른 요일은 10번 중 2번, 월요일은 10번 중 2.6번꼴이에요.")}
STOCK_CAUTION = {"e_earn": ("어제 실적 공시", "어제 실적 공시가 나온 종목이에요. 공시 다음 날 아침엔 시가가 예상 범위를 벗어난 경우가 절반 정도였어요(평소엔 10번 중 2번).")}
SAMPLES = json.loads((Path(__file__).with_name("accounts.json")).read_text(encoding="utf-8"))


def _f(v, nd=6):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) or math.isinf(v) else round(v, nd)


def _h(s: str) -> int:
    return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16)


def label(T: str) -> str:
    d = pd.Timestamp(T)
    return f"{d.month}월 {d.day}일 ({WD[d.weekday()]})"


def _kind(src: dict, card: dict) -> str:
    return src.get("kind") or "replay"


# ---------- 종목 목록(검색용) ----------
@lru_cache(maxsize=1)
def catalog() -> list[dict]:
    """검색에 쓰는 종목 목록 = 그래프 대상 기업(1,067) ∪ 모델 유니버스(200). in_model은 노란띠가 있는 종목."""
    days = D.available_days()
    uni = {}
    if days:
        d = D.day(days[0])
        c = d.get("card_0811") or d["card_0730"]
        uni = {s["code"]: s["name"] for s in c["stocks"]}
    out = {}
    tp = REPO / "graph_db/source/targets.csv"
    if tp.exists():
        t = pd.read_csv(tp, dtype={"stock_code": str}, encoding="utf-8-sig")
        for r in t.itertuples():
            out[r.stock_code] = dict(code=r.stock_code, name=r.name, market=r.market, sector=r.wi26_sector if isinstance(r.wi26_sector, str) else "")
    for code, name in uni.items():
        out.setdefault(code, dict(code=code, name=name, market="", sector=""))
    for code, row in out.items():
        row["in_model"] = code in uni
    return sorted(out.values(), key=lambda r: (not r["in_model"], r["name"]))


# ---------- 예시 계좌 ----------
@lru_cache(maxsize=1)
def _closes() -> pd.DataFrame:
    live = sorted((D.RESEARCH / "workbench/live").glob("*/data/universe_daily.csv"))
    k = pd.read_csv(live[-1], dtype={"date": str, "code": str})
    return k.pivot_table(index="date", columns="code", values="Close", aggfunc="last").sort_index()


def avg_price(account: str, code: str) -> float | None:
    """예시 계좌의 평균단가(가정) = 그 종목의 실제 과거 종가 하나."""
    c = _closes()
    if code not in c.columns:
        return None
    s = c[code].loc[:BUY_DATES[_h(account + code) % len(BUY_DATES)]].dropna()
    return float(s.iloc[-1]) if len(s) else None


def sample_accounts() -> list[dict]:
    names = {r["code"]: r for r in catalog()}
    out = []
    for a in SAMPLES:
        hh = _h(a["name"])
        hs = []
        for code, q in a["holdings"]:
            hs.append(dict(code=code, q=int(q), avg=_f(avg_price(a["name"], code), 2), name=(names.get(code) or {}).get("name", code),
                           in_model=bool((names.get(code) or {}).get("in_model"))))
        out.append(dict(id=a["id"], name=a["name"], full=f'{a["id"]} {a["name"]}', no=f"{5000 + hh % 900:04d}-{1000 + (hh // 900) % 9000:04d}",
                        cash=a["cash"], holdings=hs, sample=True))
    return out


# ---------- 하루 묶음 ----------
def meta() -> dict:
    days = []
    for T in D.available_days():
        d = D.day(T)
        c = d.get("card_0811") or d["card_0730"]
        src = d.get("source") or {}
        days.append(dict(T=T, label=label(T), kind=_kind(src, c), x=_f(c["market"]["x"]), has_open=bool(c.get("after_open")),
                         news=bool(D.news_us(T)) or bool(D.news(T)), brief=N.has_brief(T),
                         slots=sorted((src.get("sealed") or {}).keys()) or [s for s in ("0730", "0811") if d.get(f"card_{s}")]))
    return dict(days=days, default=days[0]["T"] if days else None)


def _news_ts(T: str, tm: str) -> str:
    """'11/10 22:38' → '2026-11-10 22:38' (해 넘김 처리)."""
    mo, rest = tm.split("/", 1)
    y = int(T[:4]) - (1 if int(mo) - int(T[4:6]) > 6 else 0)
    return f"{y}-{int(mo):02d}-{rest[:2]} {rest[3:]}"


def _news(T: str) -> tuple[list[dict], dict]:
    """알파카(미국) 기사 중 관계표·업종 낱말로 종목과 이어진 것. seg는 업종 낱말만 겹친 기사(관련성 확인 전), 모든 종목."""
    un = D.us_news()
    out, seg = [], {}
    if un is None:
        return out, seg
    q = un[un["T"] == T]
    rel = q[q.tier != D.SEG_TIER]
    for i, ((tm, head), g) in enumerate(rel.groupby(["time", "headline"], sort=False)):
        stocks = [dict(code=r.kr_code, name=r.kr_name, relation=r.relation, effect=r.effect, strength=r.strength)
                  for r in g.drop_duplicates("kr_code").itertuples()]
        r0 = g.iloc[0]
        out.append(dict(id=f"n{i}", ts=_news_ts(T, tm), time=tm, headline=head, us=r0.us, tier="규칙 확인" if (g.tier == "규칙 확인").any() else "AI 판정",
                        tier_raw=r0.tier, relation=r0.relation, effect=r0.effect, strength=r0.strength, why=r0.why, path=r0.path, stocks=stocks))
    out.sort(key=lambda n: n["ts"])
    for code, g in q[q.tier == D.SEG_TIER].groupby("kr_code"):
        g = g.sort_values("time")
        seg[code] = dict(n=int(g.headline.nunique()), group=g.relation.iloc[-1],
                         items=[dict(time=r.time, headline=r.headline, word=r.why) for r in g.drop_duplicates("headline").tail(3).itertuples()])
    return out, seg


def _night(T: str) -> dict | None:
    n = D.night(T)
    if n is None or n.empty:
        return None
    t0 = n.kst.iloc[0]
    mins = ((n.kst - t0).dt.total_seconds() // 60).astype(int)
    ret = n.price / n.day_close - 1
    nu = D.news_us(T) or {}
    counts = [[int((pd.Timestamp(c["kst"]) - t0).total_seconds() // 60), int(c["n"])] for c in nu.get("counts", [])]
    return dict(t0=t0.strftime("%Y-%m-%d %H:%M"), day_close=_f(n.day_close.iloc[0], 2), contract=str(n.contract.iloc[0]) if "contract" in n else "",
                pts=[[int(m), _f(p, 2), int(v)] for m, p, v in zip(mins, n.price, n.volume)],
                last=_f(n.price.iloc[-1], 2), last_ret=_f(ret.iloc[-1]), hi_ret=_f(ret.max()), lo_ret=_f(ret.min()),
                hi_at=n.kst.iloc[int(ret.values.argmax())].strftime("%H:%M"), lo_at=n.kst.iloc[int(ret.values.argmin())].strftime("%H:%M"),
                volume=int(n.volume.sum()), counts=counts, articles=nu.get("articles"))


def _universe(c8: dict, c7: dict) -> dict:
    seg = D.segment_table()
    segmap = {} if seg is None else {r.code: (r.final, r.final_parent) for r in seg.itertuples()}
    after8 = {r["code"]: r for r in (c8.get("after_open") or {}).get("rows", [])}
    in7 = {s["code"] for s in c7["stocks"]}
    out = {}
    for s in c8["stocks"]:
        g = s.get("grade_0811") or {}
        a = after8.get(s["code"]) or {}
        sg = segmap.get(s["code"], ("", ""))
        out[s["code"]] = dict(
            code=s["code"], name=s["name"], pc=s["base_close"]["value"], pc_date=s["base_close"]["date"], H=_f(s["H"]),
            b80=[_f(v) for v in s["band80"]], b90=[_f(v) for v in s["band90"]], in0730=s["code"] in in7,
            cautions=[dict(kind=c["kind"], title=STOCK_CAUTION.get(c["kind"], ("확인할 점", c.get("text", "")))[0],
                           body=STOCK_CAUTION.get(c["kind"], ("", c.get("text", "")))[1]) for c in s.get("cautions", [])],
            grade=dict(level=g.get("level"), p=_f(g.get("p"), 3), g=_f(g.get("nxt_g"))) if g.get("level") else None,   # 방향 유지(카드 grade_0811)
            t08=_t08(s["H"], s["band80"][0], s["band80"][1], g.get("nxt_g")),                                          # 07:30 예상 믿을 정도·08:11 보정(E107)
            y=_f(a.get("y")), inb=a.get("in_band80"), dir=a.get("nxt_dir_match"), seg=sg[0], group=sg[1])
    return out


def _evening(T: str) -> dict:
    """어제 저녁 NXT 애프터마켓 마지막 거래(참고용, 띠 계산에는 쓰지 않음). workbench/evening_nxt.py가 만든 파일이 있을 때만."""
    f = DATA_ROOT / "model" / "evening" / f"{T}.json"
    try:
        return json.loads(f.read_text(encoding="utf-8")).get("rows") or {} if f.exists() else {}
    except Exception:
        return {}


def day(T: str) -> dict:
    d = D.day(T)
    c8, c7 = d.get("card_0811") or d["card_0730"], d.get("card_0730") or d["card_0811"]
    src = d.get("source") or {}
    uni = _universe(c8, c7)
    eve = _evening(T)
    for code, v in uni.items():
        e = eve.get(code)
        v["eve"] = dict(r=_f(e["r"]), at=e.get("at")) if e and e.get("r") is not None else None
    news, seg = _news(T)
    rec = D.news_record(T)
    fw = D.forward_record()
    seal = src.get("sealed") or {}
    ev = [dict(dday=int(e["dday"]), label=e["label"], title=e["title"], note=e["note"], kind="macro", codes=[]) for e in D.upcoming_events(T)]
    ao = c8.get("after_open") or {}
    names = {r["code"]: r["name"] for r in catalog()}
    from . import extras as X                               # 11/17: 장 시간이 바뀌는 날, 이어진 미국 기업 실적 발표일, 자료 상태
    ev = sorted(ev + X.special_events(T) + X.earnings_events(T, _graph_table(), names), key=lambda e: e["dday"])
    brief = N.load_brief(T, names)
    macro = D.us_macro()
    return dict(
        T=T, D=c8.get("D"), label=label(T), kind=_kind(src, c8),
        record=dict(kind=_kind(src, c8), after_freeze=bool(src.get("after_freeze")), same_as_sealed=src.get("same_as_sealed"),
                    sealed={k: dict(issued=v.get("issued_at", "")[11:16], before_open=bool(v.get("before_open")), sha=v.get("sha256", "")[:12]) for k, v in seal.items()},
                    open_at=(ao.get("opens_fetched_at") or "")[11:16], open_label=ao.get("label", "")),
        market=dict(x=_f(c8["market"]["x"]), cautions=[dict(kind=c["kind"], title=DAY_CAUTION.get(c["kind"], ("오늘 확인할 점", ""))[0],
                                                             body=DAY_CAUTION.get(c["kind"], ("", c.get("text", "")))[1]) for c in c8["market"]["cautions"]]),
        has_open=bool(ao), graded=(c8.get("grade_status") or {}).get("status") == "available",
        stocks=uni, news=news, segnews=seg,
        news_meta=dict(line=D.news_record_line(T), articles=(rec or {}).get("counts", {}).get("articles"),
                       before_open=(rec or {}).get("before_open"), issued=((rec or {}).get("issued_at") or "")[11:16]),
        macro=[] if macro is None else [dict(time=r.time, headline=r.headline) for r in macro[macro["T"] == T].itertuples()][:40],
        night=_night(T), events=ev, brief=brief, pipeline=X.pipeline_status(T, brief), special=X.special(T), us_market=X.us_market(T),
        forward=None if not fw else dict(after=fw[0].get("after_freeze"), prov=fw[0].get("prov_days", []),
                                         per_day=[p for p in fw[0]["per_day"] if p["T"] <= T][-8:]))


def track() -> dict:
    """지난 기록 재료: 최근 40거래일 × 유니버스 전 종목 결과(띠·실제 시가·등급). 계좌별 집계는 core/portfolio.py가 한다."""
    s, days, _ = D.track_all()
    ok = sorted(days[days.status == "ok"]["T"])[-40:]
    xs = dict(zip(days["T"], days["x"]))
    w = s[s["T"].isin(ok) & s.y.notna()]
    cols = [c for c in ("T", "code", "H", "L80", "U80", "y", "in80", "grade", "nxt_dir_match") if c in w.columns]
    rows = []
    for r in w[cols].itertuples(index=False):
        r = r._asdict()
        g, dm = r.get("grade"), r.get("nxt_dir_match")
        rows.append([r["T"], r["code"], _f(r["H"]), _f(r["L80"]), _f(r["U80"]), _f(r["y"]), bool(r["in80"]),
                     g if isinstance(g, str) else None, None if dm is None or pd.isna(dm) else bool(dm)])
    return dict(days=ok, x={t: _f(xs.get(t)) for t in ok}, cols=["T", "code", "H", "lo", "hi", "y", "inb", "grade", "dm"], rows=rows,
                fwd_first=str(D.FWD_FIRST), freeze_t=str(D.FREEZE_T))


def graph_all() -> dict:
    """관계 그림 자료(유니버스 전체): 손으로 정리한 관계표 + 민석 그래프 DB(graph_db/source/graph/neo4j)에서 뽑은 해외 연결.
    계좌별로 고르는 일은 core/portfolio.py가 한다. 그래프 DB 폴더가 없으면 관계표만 쓴다."""
    base = _graph_table()
    neo = REPO / "graph_db/source/graph/neo4j"
    if not neo.exists():
        return base
    from . import graph_db as G
    codes = {s["code"] for s in catalog()}
    return G.merge(base, G.build(neo, codes))


def _graph_table() -> dict:
    """11/11 관계표(미국 쪽 → 국내 종목, 촉발 사건 설명 포함)."""
    g = D.graph()
    if not g:
        return dict(nodes=[], edges=[])
    n, e = g
    name = dict(zip(n.id, n.name))
    us = e[(e.kind == "미국 관계") & e.dst.str.startswith("KR:")]
    edges = [dict(src=r.src, dst=r.dst[3:], relation=r.note, sign=r.sign, strength=r.strength, evidence=r.evidence,
                  source=r.source.split(" · ", 1)[-1] if " · " in r.source else r.source, trigger=r.trigger_ko) for r in us.itertuples()]
    return dict(nodes=[dict(id=i, name=name.get(i, i)) for i in dict.fromkeys(us.src)], edges=edges)


def stocks() -> list[dict]:
    return catalog()
