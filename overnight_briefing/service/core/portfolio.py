"""계좌(예시 계좌 또는 사용자가 넣은 잔고) 하나에 맞춰 그날 묶음을 고른다. 표준 라이브러리만 쓴다(배포판에서도 그대로 돈다).

새로 계산하는 모델 값은 없다. 이미 만든 띠·기록·관계에서 이 계좌 종목만 골라 내고, 지난 기록은 평균·비율만 낸다.
"""
from __future__ import annotations

from statistics import mean

MAX_HOLDINGS = 30


def _window(track: dict, T: str, codes: set[str], n: int = 20) -> tuple[list[str], list[dict]]:
    days = [t for t in track["days"] if t <= T][-n:]
    cols = track["cols"]
    keep = set(days)
    rows = [dict(zip(cols, r)) for r in track["rows"] if r[0] in keep and r[1] in codes]
    return days, rows


def _track_summary(track: dict, T: str, codes: set[str]) -> dict:
    """overnight_briefing/app/core/data.py의 track_window와 같은 값(계좌 범위 행은 빼고)."""
    days, mine = _window(track, T, codes)
    x = track.get("x") or {}
    hi = [r for r in mine if r["grade"] == "높음" and r["dm"] is not None]
    daily = []
    for t in days:
        rs = [r for r in mine if r["T"] == t]
        daily.append(dict(T=t, cov=round(100 * sum(r["inb"] for r in rs) / len(rs), 1) if rs else None))
    ex = [abs(r["y"] - x[r["T"]]) for r in mine if x.get(r["T"]) is not None]
    return dict(days=len(days), first=days[0] if days else None, n_rows=len(mine),
                n_fwd=sum(t >= track["fwd_first"] for t in days), n_after=sum(t >= track["freeze_t"] for t in days),
                cov_mine=round(100 * mean(r["inb"] for r in mine), 3) if mine else None,
                err_H=round(100 * mean(abs(r["y"] - r["H"]) for r in mine), 3) if mine else None,
                err_x=round(100 * mean(ex), 3) if ex else None,
                hi_match=round(100 * mean(r["dm"] for r in hi), 3) if hi else None, hi_n=len(hi), daily=daily)


def _cases(track: dict, T: str, held: list[dict], uni: dict) -> list[dict]:
    """사후 복기 재료(11/17): 규칙을 고정한 뒤의 날마다, 지금 보유 금액 비중으로 본 계좌 예상(Σw·H)·실제 시가(Σw·y)·야간선물(x).
    계좌 범위(띠)는 내지 않는다(계좌 띠 숫자는 보류). 보유 종목이 모두 채점된 날만 넣는다."""
    val = {h["code"]: h["q"] * (uni[h["code"]].get("pc") or 0) for h in held if h["q"] > 0}
    tot = sum(val.values())
    if not tot:
        return []
    cols, x = track["cols"], track.get("x") or {}
    by: dict[str, list] = {}
    for r in track["rows"]:
        if r[1] in val and track["freeze_t"] <= r[0] <= T:
            by.setdefault(r[0], []).append(dict(zip(cols, r)))
    out = []
    for t, rs in sorted(by.items()):
        rs = [r for r in rs if r["y"] is not None and r["H"] is not None]
        if len(rs) < len(val) or x.get(t) is None:
            continue
        out.append(dict(T=t, x=x[t], exp=round(sum(val[r["code"]] * r["H"] for r in rs) / tot, 6),
                        act=round(sum(val[r["code"]] * r["y"] for r in rs) / tot, 6), n=len(rs), n_in=sum(1 for r in rs if r["inb"]), value=tot))
    return out


def _hist(track: dict, T: str, codes: set[str]) -> dict:
    _, rows = _window(track, T, codes)
    out: dict[str, list] = {}
    for r in sorted(rows, key=lambda r: r["T"]):
        out.setdefault(r["code"], []).append(dict(T=r["T"], H=r["H"], lo=r["lo"], hi=r["hi"], y=r["y"], inb=r["inb"]))
    return out


def _graph(graph: dict, codes: set[str]) -> dict:
    edges = [e for e in graph["edges"] if e["dst"] in codes]
    ids = set(e["src"] for e in edges)
    return dict(nodes=[n for n in graph["nodes"] if n["id"] in ids], edges=edges)


def build(day: dict, track: dict, graph: dict, catalog: dict[str, dict], account: dict) -> dict:
    """account = {id, name, holdings:[{code,q,avg?}], cash?, no?, sample?}
    반환: 화면이 쓰는 계좌 묶음(모델 범위 안 종목은 띠, 밖은 '모델 범위 밖' 목록)."""
    uni = day["stocks"]
    held, out = [], []
    for h in account["holdings"][:MAX_HOLDINGS]:
        code, q = str(h["code"]), int(h["q"])
        avg = h.get("avg")
        c = catalog.get(code) or {}
        if code in uni:
            held.append(dict(code=code, q=q, avg=avg if avg else None))
        else:
            out.append(dict(code=code, q=q, avg=avg, name=c.get("name", code), known=bool(c)))
    codes = {h["code"] for h in held}
    brief = day.get("brief") or {}
    bstocks = brief.get("stocks") or {}
    all_codes = codes | {o["code"] for o in out}
    return dict(
        account=dict(id=account.get("id", "U"), name=account.get("name", "내 잔고"), full=account.get("full") or account.get("name", "내 잔고"),
                     no=account.get("no", ""), cash=account.get("cash", 0), holdings=held, excluded=out, sample=bool(account.get("sample"))),
        stocks={c: uni[c] for c in codes},
        segnews={c: v for c, v in (day.get("segnews") or {}).items() if c in codes},
        hist=_hist(track, day["T"], codes), graph=_graph(graph, codes),
        track=dict(_track_summary(track, day["T"], codes), cases=_cases(track, day["T"], held, uni)),
        brief=dict({k: v for k, v in brief.items() if k != "stocks"}, stocks={c: v for c, v in bstocks.items() if c in all_codes}) if brief else None)
