"""고객 화면(front)이 읽는 하루치 묶음을 만든다. 계산은 하지 않고, Streamlit 앱과 같은 파일·같은 읽기 함수(src/app/core/data.py)를 그대로 쓴다.

화면이 쓰는 값은 모두 여기서 한 번에 내려 주고, 수량을 바꿔 보는 금액 계산(수량 × 전일 종가 × 등락률)만 브라우저가 한다.
예시 계좌의 계좌번호·평균단가는 시연용 가정이다(평균단가 = 그 종목의 실제 과거 종가 하나, 아래 BUY_DATES).
"""
from __future__ import annotations

import hashlib
import logging
import math
import sys
from functools import lru_cache
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from core import data as D  # noqa: E402

for _n in list(logging.root.manager.loggerDict):      # 화면 없이 읽기 함수만 빌려 쓰므로 Streamlit의 '실행 환경 없음' 안내는 끈다
    if _n.startswith("streamlit"):
        logging.getLogger(_n).setLevel(logging.ERROR)

WD = "월화수목금토일"
BUY_DATES = ["20260105", "20260210", "20260316", "20260420", "20260518"]   # 예시 계좌 평균단가로 쓰는 실제 과거 종가의 날짜
DAY_CAUTION = {"mon": ("월요일 아침이에요", "주말 동안 쌓인 소식이 한꺼번에 반영돼서, 과거 월요일엔 시가가 예상 범위를 벗어난 날이 더 많았어요. "
                       "다른 요일은 10번 중 2번, 월요일은 10번 중 2.6번꼴이에요.")}
STOCK_CAUTION = {"e_earn": ("어제 실적 공시", "어제 실적 공시가 나온 종목이에요. 공시 다음 날 아침엔 시가가 예상 범위를 벗어난 경우가 절반 정도였어요(평소엔 10번 중 2번).")}


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


@lru_cache(maxsize=1)
def _closes() -> pd.DataFrame:
    live = sorted((D.RESEARCH / "workbench/live").glob("*/data/universe_daily.csv"))
    k = pd.read_csv(live[-1], dtype={"date": str, "code": str})
    return k.pivot_table(index="date", columns="code", values="Close", aggfunc="last").sort_index()


def avg_price(account: str, code: str, fallback: float) -> float:
    c = _closes()
    d = BUY_DATES[_h(account + code) % len(BUY_DATES)]
    if code in c.columns:
        s = c[code].loc[:d].dropna()
        if len(s):
            return float(s.iloc[-1])
    return float(fallback)


def _kind(src: dict, card: dict) -> str:
    return src.get("kind") or ("replay" if card.get("mode") == "historical_replay" else "replay")


def meta() -> dict:
    days = []
    for T in D.available_days():
        d = D.day(T)
        c = d.get("card_0811") or d["card_0730"]
        src = d.get("source") or {}
        days.append(dict(T=T, label=label(T), kind=_kind(src, c), x=_f(c["market"]["x"]), has_open=bool(c.get("after_open")),
                         news=bool(D.news_us(T)) or bool(D.news(T))))
    return dict(days=days, default=days[0]["T"] if days else None)


def _news_ts(T: str, tm: str) -> str:
    """'11/10 22:38' → '2026-11-10 22:38' (해 넘김 처리)."""
    mo, rest = tm.split("/", 1)
    y = int(T[:4]) - (1 if int(mo) - int(T[4:6]) > 6 else 0)
    return f"{y}-{int(mo):02d}-{rest[:2]} {rest[3:]}"


def _news(T: str, held: set[str]) -> tuple[list[dict], dict]:
    un = D.us_news()
    out, seg = [], {}
    if un is None:
        return out, seg
    q = un[un["T"] == T]
    rel = q[q.tier != D.SEG_TIER]
    for i, ((tm, head), g) in enumerate(rel.groupby(["time", "headline"], sort=False)):
        stocks = [dict(code=r.kr_code, name=r.kr_name, relation=r.relation, effect=r.effect, strength=r.strength, mine=r.kr_code in held)
                  for r in g.drop_duplicates("kr_code").itertuples()]
        r0 = g.iloc[0]
        out.append(dict(id=f"n{i}", ts=_news_ts(T, tm), time=tm, headline=head, us=r0.us, tier="규칙 확인" if (g.tier == "규칙 확인").any() else "AI 판정",
                        tier_raw=r0.tier, relation=r0.relation, effect=r0.effect, strength=r0.strength, why=r0.why, path=r0.path, stocks=stocks))
    out.sort(key=lambda n: n["ts"])
    sg = q[(q.tier == D.SEG_TIER) & q.kr_code.isin(held)]
    for code, g in sg.groupby("kr_code"):
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


def _graph(codes: set[str]) -> dict:
    g = D.graph()
    if not g:
        return dict(nodes=[], edges=[])
    n, e = g
    name = dict(zip(n.id, n.name))
    kr = {f"KR:{c}" for c in codes}
    us = e[(e.kind == "미국 관계") & e.dst.isin(kr)]
    edges = [dict(src=r.src, dst=r.dst[3:], relation=r.note, sign=r.sign, strength=r.strength, evidence=r.evidence,
                  source=r.source.split(" · ", 1)[-1] if " · " in r.source else r.source, trigger=r.trigger_ko) for r in us.itertuples()]
    nodes = [dict(id=i, name=name.get(i, i)) for i in dict.fromkeys(us.src)]
    return dict(nodes=nodes, edges=edges)


def _hist(codes: set[str], T: str, n: int = 20) -> dict:
    s, days, _ = D.track_all()
    ok = sorted(days[(days.status == "ok") & (days["T"] <= T)]["T"])[-n:]
    w = s[s["T"].isin(ok) & s.code.isin(codes) & s.y.notna()]
    out = {}
    for code, g in w.groupby("code"):
        out[code] = [dict(T=r["T"], H=_f(r.H), lo=_f(r.L80), hi=_f(r.U80), y=_f(r.y), inb=bool(r.in80)) for _, r in g.sort_values("T").iterrows()]
    return out


def day(T: str) -> dict:
    d = D.day(T)
    c8, c7 = d.get("card_0811") or d["card_0730"], d.get("card_0730") or d["card_0811"]
    src = d.get("source") or {}
    seg = D.segment_table()
    segmap = {} if seg is None else {r.code: (r.final, r.final_parent) for r in seg.itertuples()}
    accounts = []
    held: set[str] = set()
    for a in c8["accounts"]:
        hs = []
        by = {s["code"]: s for s in c8["stocks"]}
        for h in a["holdings"]:
            held.add(h["code"])
            hs.append(dict(code=h["code"], q=int(h["q"]), avg=avg_price(a["name"], h["code"], by[h["code"]]["base_close"]["value"])))
        hh = _h(a["name"])
        accounts.append(dict(id=a["name"].split(" ", 1)[0], name=a["name"].split(" ", 1)[-1], full=a["name"],
                             no=f"{5000 + hh % 900:04d}-{1000 + (hh // 900) % 9000:04d}", cash=a["cash"], holdings=hs,
                             excluded=a.get("excluded", []), demo=bool(a.get("extra"))))
    after8 = {r["code"]: r for r in (c8.get("after_open") or {}).get("rows", [])}
    in7 = {s["code"] for s in c7["stocks"]}
    stocks = {}
    for s in c8["stocks"]:
        if s["code"] not in held:
            continue
        g = s.get("grade_0811") or {}
        a = after8.get(s["code"]) or {}
        sg = segmap.get(s["code"], ("", ""))
        stocks[s["code"]] = dict(
            code=s["code"], name=s["name"], pc=s["base_close"]["value"], pc_date=s["base_close"]["date"], H=_f(s["H"]),
            b80=[_f(v) for v in s["band80"]], b90=[_f(v) for v in s["band90"]], in0730=s["code"] in in7,
            cautions=[dict(kind=c["kind"], title=STOCK_CAUTION.get(c["kind"], ("확인할 점", c.get("text", "")))[0],
                           body=STOCK_CAUTION.get(c["kind"], ("", c.get("text", "")))[1]) for c in s.get("cautions", [])],
            grade=dict(level=g.get("level"), p=_f(g.get("p"), 3), g=_f(g.get("nxt_g"))) if g.get("level") else None,
            y=_f(a.get("y")), inb=a.get("in_band80"), dir=a.get("nxt_dir_match"), seg=sg[0], group=sg[1])
    news, segnews = _news(T, held)
    rec = D.news_record(T)
    fw = D.forward_record()
    track = {}
    for a in c8["accounts"]:
        w = D.track_window(T, tuple(h["code"] for h in a["holdings"]), a["name"])
        w["daily"] = [dict(T=r["T"], cov=_f(r["cov"], 1)) for r in w["daily"]]
        track[a["name"].split(" ", 1)[0]] = {k: (_f(v, 3) if isinstance(v, float) else v) for k, v in w.items()}
    seal = src.get("sealed") or {}
    ev = [dict(dday=int(e["dday"]), label=e["label"], title=e["title"], note=e["note"]) for e in D.upcoming_events(T)]
    ao = c8.get("after_open") or {}
    return dict(
        T=T, D=c8.get("D"), label=label(T), kind=_kind(src, c8),
        record=dict(kind=_kind(src, c8), after_freeze=bool(src.get("after_freeze")), same_as_sealed=src.get("same_as_sealed"),
                    sealed={k: dict(issued=v.get("issued_at", "")[11:16], before_open=bool(v.get("before_open")), sha=v.get("sha256", "")[:12]) for k, v in seal.items()},
                    open_at=(ao.get("opens_fetched_at") or "")[11:16], open_label=ao.get("label", "")),
        market=dict(x=_f(c8["market"]["x"]), cautions=[dict(kind=c["kind"], title=DAY_CAUTION.get(c["kind"], ("오늘 확인할 점", ""))[0],
                                                             body=DAY_CAUTION.get(c["kind"], ("", c.get("text", "")))[1]) for c in c8["market"]["cautions"]]),
        has_open=bool(ao), graded=(c8.get("grade_status") or {}).get("status") == "available",
        accounts=accounts, stocks=stocks, news=news, segnews=segnews,
        news_meta=dict(line=D.news_record_line(T), articles=(rec or {}).get("counts", {}).get("articles"),
                       before_open=(rec or {}).get("before_open"), issued=((rec or {}).get("issued_at") or "")[11:16]),
        macro=[] if D.us_macro() is None else [dict(time=r.time, headline=r.headline) for r in D.us_macro()[D.us_macro()["T"] == T].itertuples()][:40],
        night=_night(T), events=ev, track=track, hist=_hist(held, T), graph=_graph(held),
        forward=None if not fw else dict(after=fw[0].get("after_freeze"), prov=fw[0].get("prov_days", []),
                                         per_day=[p for p in fw[0]["per_day"] if p["T"] <= T][-8:]))


if __name__ == "__main__":
    import json
    m = meta()
    b = day(m["default"])
    s = json.dumps(b, ensure_ascii=False, allow_nan=False)
    print(m["default"], len(s) // 1024, "KB", "accounts", len(b["accounts"]), "stocks", len(b["stocks"]), "news", len(b["news"]),
          "night pts", len(b["night"]["pts"]) if b["night"] else 0, "graph", len(b["graph"]["nodes"]), len(b["graph"]["edges"]))
