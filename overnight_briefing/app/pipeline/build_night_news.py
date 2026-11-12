"""밤사이 차트(야간선물 1분봉)와 뉴스 묶음을 앱용 파일로 옮긴다.

실행: ~/4Digit/.venv/bin/python ~/4Digit/src/app/pipeline/build_night_news.py [T ...]
      (T를 주지 않으면 data/model/days/ 에 있는 날짜 전부)

- 야간선물: research/overnight_backtest/data/night_minutes*.csv (KIS 과거 1분봉, 시각은 봉 시작 기준)
  + 가장 최근 실제 날짜 자료 폴더(workbench/live/*/data/night_minutes.csv, live_refresh가 매일 이어 받음, 11/10 추가)
  + futures_daily.csv 의 전일 주간 종가(15:45, 연구 자료 + 최근 실제 날짜 폴더). 원자료는 바꾸지 않고 그날 밤만 잘라 저장한다.
- 뉴스: 단독 검증판(~/4Digit-solo) 재생 실행 결과(runs/<T>T0730KST_base)와 기사 원장(data/night.db).
  사건 묶음·관계 경로·시장 반응·AI 문장(검사 통과분)을 그대로 옮기고 새로 만들지 않는다.
  재생 실행이 없는 날은 뉴스 파일을 만들지 않는다(앱에서 '연결 전'으로 표시).
- 미국 뉴스 겹치기(11/10 추가, data/news_us/<T>.json): 밤 차트 위에 놓을 것만 옮긴다(새로 판정하지 않음).
  보도량 = 4Digit-solo night.db의 알파카(벤징가) 기사 등록 시각 15분 묶음(뉴스 창 D 15:30 ~ T 07:30 KST 전체),
  연결 기사 = workbench/runs/claude_uslink_r1/us_news_by_stock.csv의 그날 행 중 관계표 규칙 확인·AI 판정(업종 핵심어 판정 전은 뺌).
"""
from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path

import pandas as pd

APP = Path(__file__).resolve().parents[1]
RESEARCH = Path.home() / "4Digit/research/overnight_backtest"
SOLO = Path.home() / "4Digit-solo"
LIVE = RESEARCH / "workbench/live"


def latest_live(name: str) -> list[Path]:
    """실제 날짜 폴더 가운데 data/<name>의 마지막 날짜가 가장 늦은 것 하나(같으면 나중에 고친 것). 없으면 빈 목록."""
    def last_date(p: Path) -> str:
        with open(p, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 4096))
            tail = f.read().decode("utf-8", "ignore").strip().splitlines()
        return max((ln.split(",")[0] for ln in tail[1:] if ln[:8].isdigit()), default="")
    c = list(LIVE.glob(f"*/data/{name}"))
    return [max(c, key=lambda p: (last_date(p), p.stat().st_mtime))] if c else []


NIGHT_FILES = [RESEARCH / "data/night_minutes_20261030.csv", RESEARCH / "data/night_minutes.csv"] + latest_live("night_minutes.csv")
FUT_FILES = [RESEARCH / "data/futures_daily.csv"] + latest_live("futures_daily.csv")
# 단독 검증판 문장 가운데, 이 앱이 다른 경로로 야간선물을 붙이면서 사실이 아니게 된 문장
STALE = "코스피200 야간선물 자료는 확보하지 못해 반응에 넣지 않았어요."


def night_bars(T: str, D: str) -> pd.DataFrame | None:
    frames = []
    for f in NIGHT_FILES:
        if f.exists():
            d = pd.read_csv(f, dtype={"date": str, "code": str, "hhmmss": str})
            frames.append(d[d.date == D])
    if not frames:
        return None
    d = pd.concat(frames).drop_duplicates(["date", "code", "hhmmss"])
    if d.empty:
        return None
    code = d.groupby("code").volume.sum().idxmax()          # 그날 밤 거래가 가장 많은 계약(근월물)
    d = d[d.code == code].copy()
    hh = d.hhmmss.str.zfill(6)
    base = pd.Timestamp(D)
    d["kst"] = base + pd.to_timedelta(hh.str[:2].astype(int), unit="h") + pd.to_timedelta(hh.str[2:4].astype(int), unit="m")
    fut = pd.concat([pd.read_csv(f, dtype={"date": str, "code": str}) for f in FUT_FILES]).drop_duplicates(["date", "session", "code"], keep="last")
    day = fut[(fut.date == D) & (fut.session == "day")]
    ref = day[day.code == code] if (day.code == code).any() else day
    d["day_close"] = float(ref.close.iloc[0]) if len(ref) else float("nan")
    d["contract"] = code
    return d[["kst", "price", "volume", "day_close", "contract"]].sort_values("kst")


def utc_to_kst(s: str | None) -> str | None:
    if not s:
        return None
    return pd.Timestamp(s).tz_convert("Asia/Seoul").strftime("%Y-%m-%d %H:%M")


def news(T: str) -> dict | None:
    run = SOLO / "runs" / f"{T}T0730KST_base"
    if not run.exists():
        return None
    events = json.loads((run / "events.json").read_text())
    cards = json.loads((run / "cards.json").read_text())
    hot = json.loads((run / "hot_issues.json").read_text())
    links = list(csv.DictReader(open(run / "links.csv")))
    con = sqlite3.connect(SOLO / "data/night.db")
    item = {r[0]: dict(created_utc=r[1], headline=r[2], domain=r[3], url=r[4])
            for r in con.execute("select item_id, created_at_utc, headline, domain, url from news_items")}

    card_by_event = {}
    for a in cards["accounts"]:
        for c in a["cards"]:
            card_by_event.setdefault(c["event_id"], c)
    hot_rank = {h["event_id"]: i for i, h in enumerate(hot)}
    topics = []
    for ev in events:
        items = sorted((dict(kst=utc_to_kst(item[i]["created_utc"]), **{k: item[i][k] for k in ("headline", "domain", "url")})
                        for i in ev["item_ids"] if i in item and item[i]["created_utc"]), key=lambda r: r["kst"])
        c = card_by_event.get(ev["event_id"])
        text = dict(c["text"]) if c else None
        if text and STALE in text.get("unknown", ""):
            text["unknown"] = text["unknown"].replace(STALE, "").strip()
        topics.append(dict(
            event_id=ev["event_id"], rank=hot_rank.get(ev["event_id"]), title=c["title"] if c else None,
            headline=ev["headlines"][0] if ev["headlines"] else None, primary=ev["primary_entity"],
            event_type=ev["event_type"], sub_type=ev["sub_type"], novelty=ev["novelty"], novelty_reason=ev.get("novelty_reason"),
            first_kst=utc_to_kst(ev["first_seen_utc"]), prior_first_kst=utc_to_kst(ev.get("prior_first_seen_utc")),
            cluster_size=ev["cluster_size"], preview_count=ev.get("preview_count", 0), publishers=len({r["domain"] for r in items}) or None,
            items=items, key_fields=ev.get("key_fields", [])[:6],
            text=text, text_source=c.get("text_source") if c else None, checks=c.get("checks") if c else None,
            paths=c.get("paths", []) if c else [], reactions=c.get("reactions", []) if c else [],
            to_check=c.get("to_check_before_open", []) if c else [],
            unknowns=[u for u in (c.get("unknowns", []) if c else []) if u != STALE],
            sources=c.get("sources", []) if c else []))
    topics.sort(key=lambda t: (t["rank"] is None, t["rank"] if t["rank"] is not None else 0, -t["cluster_size"]))
    accounts = {a["label"]: dict(summary=a["summary"], cards=[c["event_id"] for c in a["cards"]],
                                 alerts=a.get("alerts", {}).get("alerts", []))
                for a in cards["accounts"]}
    filings = {}
    for a in cards["accounts"]:
        for al in a.get("alerts", {}).get("alerts", []):
            if al["kind"] == "공시":
                filings[al["ref"]] = dict(kst=utc_to_kst(al["ts_utc"]), title=al["title"])
    return dict(T=T, filings=sorted(filings.values(), key=lambda f: f["kst"]), source=f"4Digit-solo runs/{run.name} (engine {cards['engine']})", window=cards["window"],
                market_band=cards["market_band"], topics=topics, accounts=accounts,
                links=[{k: r[k] for k in ("event_id", "account_id", "kr_code", "relation_type", "confidence")} for r in links])


USLINK = RESEARCH / "workbench/runs/claude_uslink_r1"
SEG_TIER = "업종 핵심어(판정 전)"


def us_overlay(T: str, D: str) -> dict | None:
    start, end = pd.Timestamp(D + " 15:30", tz="Asia/Seoul"), pd.Timestamp(T + " 07:30", tz="Asia/Seoul")
    con = sqlite3.connect(SOLO / "data/night.db")
    q = "select created_at_utc from news_items where source='alpaca' and created_at_utc >= ? and created_at_utc < ?"
    utc = lambda t: t.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
    ts = pd.to_datetime([r[0] for r in con.execute(q, (utc(start), utc(end)))], utc=True).tz_convert("Asia/Seoul").tz_localize(None)
    cnt = pd.Series(1, index=ts).resample("15min").count() if len(ts) else pd.Series(dtype=int)
    p = USLINK / "us_news_by_stock.csv"
    b = pd.read_csv(p, dtype={"T": str, "kr_code": str}).fillna("") if p.exists() else pd.DataFrame(columns=["T"])
    b = b[(b["T"] == T) & (b.get("tier", "") != SEG_TIER)] if len(b) else b
    links = []
    for (tm, head), g in b.groupby(["time", "headline"], sort=False):
        mm = int(tm[:2])
        year = int(T[:4]) - (1 if mm > int(T[4:6]) else 0)      # 12월 밤 기사가 1월 아침 카드에 붙는 경우
        links.append(dict(kst=f"{year}-{tm[:2]}-{tm[3:5]} {tm[6:]}", headline=head, us=g.us.iloc[0],
                          tier="규칙 확인" if (g.tier == "규칙 확인").any() else g.tier.iloc[0],
                          stocks=list(dict.fromkeys(g.kr_name)), path=g.path.iloc[0]))
    if not len(ts) and not links:
        return None
    return dict(T=T, window=[str(start), str(end)], articles=int(len(ts)),
                counts=[dict(kst=k.strftime("%Y-%m-%d %H:%M"), n=int(v)) for k, v in cnt.items() if v],
                links=sorted(links, key=lambda r: r["kst"]),
                source="알파카(벤징가) 기사 등록 시각 · 관계표 규칙 확인 + AI 판정(claude_uslink_r1/us_news_by_stock.csv)")


def main(days: list[str]) -> None:
    (APP / "data/night").mkdir(parents=True, exist_ok=True)
    (APP / "data/news").mkdir(parents=True, exist_ok=True)
    (APP / "data/news_us").mkdir(parents=True, exist_ok=True)
    for T in days:
        card = json.loads((APP / "data/model/days" / f"{T}.json").read_text())["card_0811"]
        bars = night_bars(T, card["D"])
        if bars is not None:
            bars.to_csv(APP / "data/night" / f"{T}.csv", index=False)
        n = news(T)
        if n is not None:
            (APP / "data/news" / f"{T}.json").write_text(json.dumps(n, ensure_ascii=False))
        u = us_overlay(T, card["D"])
        if u is not None:
            (APP / "data/news_us" / f"{T}.json").write_text(json.dumps(u, ensure_ascii=False))
        print(T, "D", card["D"], "night", 0 if bars is None else len(bars), "topics", 0 if n is None else len(n["topics"]),
              "us", 0 if u is None else f'{u["articles"]}건/연결 {len(u["links"])}')


if __name__ == "__main__":
    args = sys.argv[1:] or sorted(p.stem for p in (APP / "data/model/days").glob("*.json"))
    main(args)
