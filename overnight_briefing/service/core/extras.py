"""하루 묶음에 더하는 것(11/17, 데모 피드백 반영): 거래소 특별일, 이어진 미국 기업 실적 발표일, 밤사이 수집·처리 상태, 방금 들어온 기사.

- 특별일: 수능일처럼 장 시간이 바뀌는 날. 공식 공지로 확인한 것만 손으로 적는다.
- 미국 실적 발표일: Finnhub 실적 달력(무료). 관계 그림에 이어진 미국 기업(티커가 있는 것)만, 하루 한 번 받아 캐시한다.
  미국 장 마감 뒤(amc)든 장 전(bmo)이든 한국에는 다음 날 아침에 반영되므로 '미국 날짜 + 1일'을 반영일로 쓴다.
- 수집·처리 상태와 방금 들어온 기사: 민석 수집기(news_search/source/nightly/<보고 날짜>/)의 파일을 읽기만 한다.
외부 요청은 Finnhub 한 곳뿐이고, 실패하면 조용히 빈 목록을 돌려준다.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
NIGHTLY = REPO / "news_search/source/nightly"
CACHE = SERVICE / "data_cache"
WEEK = "월화수목금토일"

# 장 시간이 바뀌는 날(공식 공지 확인분). note는 화면에 그대로 나간다.
SPECIAL = {
    "20261119": dict(title="수능일: 정규장 10:00 개장", open="10:00", premarket=False,
                     note="장전 거래(NXT 프리마켓)가 없어 08:11 등급은 나오지 않아요. 시가는 10:00 기준이에요(정규장 10:00~16:30)."),
}
# 관계표 미국 노드 id → 티커(실적 달력 조회용)
TICKERS = {"US:NVDA": "NVDA", "US:AMD": "AMD", "US:MU": "MU", "US:TSM": "TSM", "US:LRCX": "LRCX", "US:AMZN": "AMZN",
           "US:GOOGL": "GOOGL", "US:INTC": "INTC", "US:AAPL": "AAPL", "US:QCOM": "QCOM"}


def _label(d: dt.date) -> str:
    return f"{d.month}/{d.day}({WEEK[d.weekday()]})"


def special_events(T: str, days: int = 7) -> list[dict]:
    start = dt.datetime.strptime(T, "%Y%m%d").date()
    out = []
    for k, v in SPECIAL.items():
        d = dt.datetime.strptime(k, "%Y%m%d").date()
        if start <= d <= start + dt.timedelta(days=days):
            out.append(dict(dday=(d - start).days, label=_label(d), title=v["title"], note=v["note"], kind="special", codes=[]))
    return out


def _finnhub_key() -> str | None:
    p = Path(os.environ.get("NIGHTLY_ENV_FILE", str(Path.home() / "4Digit-solo/.env")))
    if not p.exists():
        return None
    for line in p.read_text().splitlines():
        if line.startswith("FINNHUB_API_KEY="):
            return line.split("=", 1)[1].strip().strip("'\"") or None
    return None


def _earnings_raw(frm: dt.date, to: dt.date) -> list[dict]:
    CACHE.mkdir(exist_ok=True)
    f = CACHE / f"earnings_{frm:%Y%m%d}_{to:%Y%m%d}.json"
    if f.exists():
        return json.loads(f.read_text())
    key = _finnhub_key()
    if not key:
        return []
    rows: list[dict] = []
    for sym in sorted(set(TICKERS.values())):
        url = f"https://finnhub.io/api/v1/calendar/earnings?from={frm}&to={to}&symbol={sym}&token={key}"
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                rows += json.loads(r.read().decode()).get("earningsCalendar") or []
        except Exception:                                   # 달력이 없어도 화면은 그대로
            continue
    f.write_text(json.dumps(rows))
    return rows


def earnings_events(T: str, graph: dict, names: dict[str, str], days: int = 7) -> list[dict]:
    """관계 그림에서 미국 기업 → 이어진 국내 종목. 그 기업의 실적 발표가 days일 안에 한국 아침에 반영되면 일정으로."""
    start = dt.datetime.strptime(T, "%Y%m%d").date()
    nodes = {n["id"]: n["name"] for n in graph.get("nodes", [])}
    linked: dict[str, list[str]] = {}
    for e in graph.get("edges", []):
        if e["src"] in TICKERS:
            linked.setdefault(TICKERS[e["src"]], [])
            if e["dst"] not in linked[TICKERS[e["src"]]]:
                linked[TICKERS[e["src"]]].append(e["dst"])
    if not linked:
        return []
    out = []
    for r in _earnings_raw(start - dt.timedelta(days=1), start + dt.timedelta(days=days)):
        sym = r.get("symbol")
        if sym not in linked or not r.get("date"):
            continue
        us = dt.datetime.strptime(r["date"], "%Y-%m-%d").date()
        k = us + dt.timedelta(days=1)                        # 한국 아침 반영일
        who = next((nodes[i] for i, t in TICKERS.items() if t == sym and i in nodes), sym)
        codes = linked[sym]
        tail = " · 이어진 종목 " + "·".join(names.get(c, c) for c in codes[:4]) + (f" 외 {len(codes) - 4}" if len(codes) > 4 else "")
        us_close = dt.datetime(us.year, us.month, us.day, 16, tzinfo=ZoneInfo("America/New_York")).astimezone(KST)
        if k == start and r.get("hour") == "amc" and us_close.hour >= 6:
            # 11/18 추가: 미국 표준시(겨울)에는 장 마감이 한국 06:00이라, 장 마감 뒤 발표는 그날 07:30 예상 범위·밤사이 브리핑(06:00 마감)에 들어가지 않는다.
            # (서머타임엔 마감이 05:00이라 발표가 밤 창 안에 들어오므로 표시하지 않는다.) 시각 사실만 적고, 가격이 그 때문에 움직였다고는 쓰지 않는다.
            first = "개장 시가예요(이날은 장전 거래 없음)" if T in SPECIAL else "08:00 장전 거래예요(08:11 기준)"
            out.append(dict(dday=0, label=_label(k), title=f"{who} 실적 발표 · 06:00 마감 뒤",
                            note=f"미국 {us.month}/{us.day} 장 마감 뒤(한국 06:00 이후) 발표라 07:30 예상 범위와 밤사이 브리핑에는 들어가지 않았어요. "
                                 f"발표 뒤 첫 국내 가격은 {first}" + tail,
                            kind="earnings", codes=codes))
            continue
        if not (start < k <= start + dt.timedelta(days=days)):
            continue
        hour = {"amc": "장 마감 뒤", "bmo": "장 전"}.get(r.get("hour"), "")
        out.append(dict(dday=(k - start).days, label=_label(k), title=f"{who} 실적 발표",
                        note=f"미국 {us.month}/{us.day} {hour} 발표 → 한국 {k.month}/{k.day} 아침에 반영 · 이어진 종목 "
                             + "·".join(names.get(c, c) for c in codes[:4]) + (f" 외 {len(codes) - 4}" if len(codes) > 4 else ""),
                        kind="earnings", codes=codes))
    return out


def _read_csv(p: Path) -> list[dict]:
    if not p.exists():
        return []
    with p.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _kst(iso: str) -> str:
    try:
        return dt.datetime.fromisoformat(iso).astimezone(KST).strftime("%m/%d %H:%M")
    except (ValueError, TypeError):
        return ""


def _night_coverage(d: Path, bed: str, cut: str) -> dict | None:
    """11/18 추가: 취침 시각~수집 마감 사이에 검색어를 얼마나 받았는지(fetch_log.csv 그대로 센다).
    구글 뉴스 검색이 밤새 막힌 날(11/18: 끝까지 돈 회차 0)에 '이어진 기사 없음'을 '모은 기사 안에서 없음'으로 읽게 하려는 표시다."""
    log = _read_csv(d / "fetch_log.csv")
    if not log:
        return None
    b, c = dt.datetime.fromisoformat(bed), dt.datetime.fromisoformat(cut)
    total = len({r["query"] for r in _read_csv(REPO / "news_search/source/terms/test_queries.csv") if r.get("query", "").startswith('"')}) \
        or len({r["term"] for r in log})                       # 수집기는 따옴표 검색어만 쓴다(11/18 기준 183개)
    ok: set = set()
    rounds: dict[str, set] = {}
    for r in log:
        try:
            when = dt.datetime.fromisoformat(r["fetched_utc"])
        except (KeyError, ValueError):
            continue
        if not (b <= when <= c):
            continue
        got = rounds.setdefault(r.get("round", ""), set())
        if r.get("status") == "200":
            ok.add(r["term"]); got.add(r["term"])
    full = sum(1 for v in rounds.values() if total and len(v) >= 0.95 * total)
    return dict(terms_ok=len(ok), terms=total, rounds=len(rounds), full_rounds=full,
                partial=bool(total) and (len(ok) < 0.8 * total or full == 0))


def pipeline_status(T: str, brief: dict | None) -> dict:
    """그 아침 브리핑이 어떤 자료로 언제 만들어졌는지(화면의 '자료 상태' 배지)."""
    d = NIGHTLY / T
    out: dict = dict(report=T, collected=None, requests=None, cutoffs=[], processed=[], brief_at=None, model=None, window=None)
    items = _read_csv(d / "items.csv")
    if items:
        out["collected"] = sum(1 for r in items if not (r.get("drop") or "").strip())
    for f in sorted(d.glob("cutoff_*.json")):
        c = json.loads(f.read_text(encoding="utf-8"))
        lab = c.get("label") or (f"표시 {c['summary_time']}" if c.get("summary_time") else f.stem.replace("cutoff_", ""))
        out["cutoffs"].append(dict(label=lab, deadline=_kst(c.get("deadline_kst", "")), articles=c.get("articles")))
        out["requests"] = c.get("requests")
    for f in sorted(d.glob("morning_*/timing.json")) + sorted(d.glob("summary_*/timing.json")):
        t = json.loads(f.read_text(encoding="utf-8"))
        out["processed"].append(dict(tag=f.parent.name.split("_")[-1], end=_kst(t.get("end_kst", "")),
                                     seconds=round((dt.datetime.fromisoformat(t["end_kst"]) - dt.datetime.fromisoformat(t["start_kst"])).total_seconds())
                                     if t.get("end_kst") and t.get("start_kst") else None,
                                     clusters=t.get("clusters"), bodies=t.get("body_ok")))
        if t.get("bedtime_kst") and t.get("cutoff_kst"):      # 11/17: 이 브리핑이 '몇 시부터 몇 시까지 나온 기사'로 만들어졌는지(취침 시각 ~ 수집 마감)
            out["window"] = dict(start=t["bedtime_kst"][11:16], end=t["cutoff_kst"][11:16])
            out["coverage"] = _night_coverage(d, t["bedtime_kst"], t["cutoff_kst"])
    if brief and not brief.get("stub"):
        out["brief_at"] = _kst(brief.get("generated_at", ""))
        out["model"] = brief.get("model")
    return out


def live_feed(n: int = 40) -> dict:
    """가장 최근 보고 날짜 폴더(지금 모으는 밤)의 최신 기사 n개. 검색어로 걸린 그대로이고 아직 거르기 전이다."""
    if not NIGHTLY.exists():
        return dict(report=None, items=[], last_fetch=None, collected=0)
    nids = sorted(p.name for p in NIGHTLY.iterdir() if p.is_dir() and p.name.isdigit())
    if not nids:
        return dict(report=None, items=[], last_fetch=None, collected=0)
    d = NIGHTLY / nids[-1]
    # 제목에 그 종목의 직접 검색어(자기 회사·해외 상대·구체 제품·브랜드)가 들어간 기사만(넓은 매체 검색이 끌어온 잡음을 뺀다)
    terms = {r["query"]: (r["company"], r.get("kind", ""), r["term"]) for r in _read_csv(REPO / "news_search/source/terms/test_queries.csv")}
    direct = {"자기 회사", "해외 상대", "구체 제품", "브랜드"}
    by_key: dict[str, set] = {}
    for h in _read_csv(d / "hits.csv"):
        t = terms.get(h.get("term", ""))
        if t and t[1] in direct:
            by_key.setdefault(h["key"], set()).add(t)
    items = []
    for r in _read_csv(d / "items.csv"):
        if (r.get("drop") or "").strip() or r.get("key") not in by_key:
            continue
        title = (r.get("title") or "").lower()
        hit = [t for t in by_key[r["key"]] if t[2].lower() in title]
        if hit:
            r["_who"] = sorted({t[0] for t in hit})
            r["_term"] = sorted({t[2] for t in hit})
            items.append(r)
    items.sort(key=lambda r: r.get("first_seen_utc") or "", reverse=True)
    log = _read_csv(d / "fetch_log.csv")
    last = max((r.get("fetched_utc") or "" for r in log), default="")
    allc = sum(1 for r in _read_csv(d / "items.csv") if not (r.get("drop") or "").strip())
    return dict(report=nids[-1], collected=allc, direct=len(items), last_fetch=_kst(last), built=dt.datetime.now(KST).strftime("%m/%d %H:%M"),
                items=[dict(title=r.get("title", ""), outlet=r.get("outlet") or r.get("domain", ""), published=_kst(r.get("published_utc", "")),
                            seen=_kst(r.get("first_seen_utc", "")), link=r.get("link", ""), stocks=r["_who"], terms=r["_term"]) for r in items[:n]])
