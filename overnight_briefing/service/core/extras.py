"""하루 묶음에 더하는 것(11/17, 데모 피드백 반영): 거래소 특별일, 이어진 미국 기업 실적 발표일, 밤사이 수집·처리 상태, 방금 들어온 기사.

- 특별한 날: model/market_calendar/special_days.csv(정해진 기준으로 뽑은 달력: 휴장, 새해 첫 거래일·수능일 10시 개장, 밤사이 미국장 휴장·조기 마감·여러 번).
- 미국 실적 발표일: Finnhub 실적 달력(무료). 관계 그림에 이어진 미국 기업(티커가 있는 것)만, 하루 한 번 받아 캐시한다.
  미국 장 마감 뒤(amc)든 장 전(bmo)이든 한국에는 다음 날 아침에 반영되므로 '미국 날짜 + 1일'을 반영일로 쓴다.
- 수집·처리 상태와 방금 들어온 기사: 민석 수집기(news_search/source/nightly/<보고 날짜>/)의 파일을 읽기만 한다.
외부 요청은 Finnhub 한 곳뿐이고, 실패하면 조용히 빈 목록을 돌려준다.
"""
from __future__ import annotations

import csv
import datetime as dt
import importlib.util
import json
import os
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
OB = SERVICE.parent
NIGHTLY = REPO / "news_search/source/nightly"
CACHE = SERVICE / "data_cache"
WEEK = "월화수목금토일"

# 특별한 날 달력(model/market_calendar). 화면에 알리는 종류와 제목. note는 달력의 문장을 그대로 쓴다.
_CAL = None


def _cal():
    """달력 모듈(model/market_calendar/special_days.py)을 처음 쓸 때 불러온다. 없으면 None(평소 날로 본다)."""
    global _CAL
    if _CAL is None:
        p = OB / "model/market_calendar/special_days.py"
        if not p.exists():
            return None
        spec = importlib.util.spec_from_file_location("special_days", p)
        _CAL = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_CAL)
    return _CAL
TITLES = {"first_day": "새해 첫 거래일: 정규장 10:00 개장", "exam_day": "수능일: 정규장 10:00 개장", "krx_closed": "한국 증시 휴장",
          "us_closed": "밤사이 미국 증시 휴장", "us_early_close": "밤사이 미국 증시 조기 마감", "us_multi": "연휴 뒤 첫 거래일"}


def special(T: str) -> dict | None:
    """T 아침 화면 알림: {title, open, premarket, note}. 평소와 같은 날이면 None."""
    if _cal() is None:
        return None
    r = _cal().day_info(T)
    kinds = [k for k in r["kinds"].split() if k in TITLES]
    if not kinds:
        return None
    return dict(title=" · ".join(TITLES[k] for k in kinds), open=r["open"] or "09:00", premarket=str(r["premarket"]) == "1",
                note=r["note"], kinds=kinds)
# 관계표 미국 노드 id → 티커(실적 달력 조회용)
TICKERS = {"US:NVDA": "NVDA", "US:AMD": "AMD", "US:MU": "MU", "US:TSM": "TSM", "US:LRCX": "LRCX", "US:AMZN": "AMZN",
           "US:GOOGL": "GOOGL", "US:INTC": "INTC", "US:AAPL": "AAPL", "US:QCOM": "QCOM"}


def _label(d: dt.date) -> str:
    return f"{d.month}/{d.day}({WEEK[d.weekday()]})"


def special_events(T: str, days: int = 7) -> list[dict]:
    """다가오는 일정에 넣을 특별한 날(T부터 days일 안)."""
    start = dt.datetime.strptime(T, "%Y%m%d").date()
    out = []
    for r in (_cal().upcoming(T, days) if _cal() else []):
        d = dt.datetime.strptime(r["date"], "%Y%m%d").date()
        kinds = [k for k in r["kinds"].split() if k in TITLES]
        out.append(dict(dday=(d - start).days, label=_label(d), title=" · ".join(TITLES[k] for k in kinds),
                        note=r["note"], kind="special", codes=[]))
    return out


def _finnhub_key() -> str | None:
    p = Path(os.environ.get("ENV_FILE") or os.environ.get("NIGHTLY_ENV_FILE") or str(REPO / ".env")).expanduser()
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
            first = "개장 시가예요(이날은 장전 거래 없음)" if _cal() and str(_cal().day_info(T)["premarket"]) != "1" else "08:00 장전 거래예요(08:11 기준)"
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


# ───── 미국 시장 칩(11/19, 홈 v2): S&P 500·나스닥·다우·환율의 전날 대비 ─────
# 받기(fetch_us_market)는 배포 전 publish.sh에서 한 번만(FinanceDataReader, 약 5초). 화면 묶음(us_market)은 캐시 파일만 읽는다.
# 기준: 한국 아침 T에는 T보다 앞선 날짜의 마지막 미국 거래일 종가를 쓴다(미국 장 마감 = 한국 06:00, 장 전 자료만).
US_CACHE = CACHE / "us_market.json"
US_SYMS = [("US500", "S&P 500"), ("IXIC", "나스닥"), ("DJI", "다우"), ("USD/KRW", "환율")]


def fetch_us_market(days: int = 120) -> str:
    import FinanceDataReader as fdr                         # 로컬에서만(배포판에는 없음)
    old = {}
    try:
        old = json.loads(US_CACHE.read_text()).get("series", {})
    except (OSError, ValueError):
        pass
    start = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    series, got = {}, []
    for sym, _ in US_SYMS:
        rows = dict(old.get(sym, []))
        try:
            df = fdr.DataReader(sym, start)
            rows.update({d.strftime("%Y%m%d"): round(float(c), 4) for d, c in zip(df.index, df["Close"]) if c == c})
            got.append(sym)
        except Exception:                                   # 하나가 실패해도 나머지와 옛 값은 남긴다
            pass
        series[sym] = sorted(rows.items())
    CACHE.mkdir(exist_ok=True)
    US_CACHE.write_text(json.dumps(dict(fetched_at=dt.datetime.now(KST).isoformat(timespec="seconds"), series=series)))
    return f"미국 시장 칩 받기: {len(got)}/{len(US_SYMS)}개"


def us_market(T: str) -> dict | None:
    try:
        series = json.loads(US_CACHE.read_text())["series"]
    except (OSError, ValueError, KeyError):
        return None
    items, asof = [], None
    for sym, name in US_SYMS:
        rows = [r for r in series.get(sym, []) if r[0] < T][-2:]
        if len(rows) < 2:
            continue
        (d0, c0), (d1, c1) = rows
        items.append(dict(k=name, r=round(c1 / c0 - 1, 6), d=d1))
        if sym == "US500":
            asof = d1
    if not items:
        return None
    note = f"{int(asof[4:6])}/{int(asof[6:])} 16:00 마감 (미 동부)" if asof else ""
    return dict(asof=asof, note=note, items=items)
