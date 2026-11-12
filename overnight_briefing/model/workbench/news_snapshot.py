"""그날 아침(T) 미국 뉴스 연결을 따로 떼어 고정한다(봉인). 카드 봉인과 같은 자리(runs/claude_live_r1/news_T/)에 남기고 해시를 seal_log에 붙인다.

남기는 것
  articles.csv     밤사이 창(직전 거래일 15:30 ~ T 07:30 KST) 알파카 기사 전부(본 것 전체)
  links.csv        규칙 확인·후보 연결
  candidates.csv   간접 후보(판정 대상)
  judged.csv       OpenAI 두 단계 판정(연결·무관·검사 실패)
  by_stock.csv     종목별 연결(규칙 확인 + AI 판정·방향)
  segment.csv      업종 핵심어 연결(판정 전)
  macro.csv        시장 전체 단어 기사
  manifest.json    발행 시각, 장 전 여부, 창, 건수, 관계표·업종표 해시, 파일별 sha256
한 번 남긴 날은 덮지 않는다(장 전 기록 보존). 다시 만들면 news_T_재계산_HHMM/에 따로 둔다.
실행: ~/4Digit/.venv/bin/python workbench/news_snapshot.py --date 20261111
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

import pandas as pd

from news_days import prev_trading_day, window

W = Path(__file__).parent
RUN = W / "runs/claude_uslink_r1"
LIVE = W / "runs/claude_live_r1"
SOLO = Path.home() / "4Digit-solo"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    T = ap.parse_args().date
    now = pd.Timestamp.now(tz="Asia/Seoul")
    out = LIVE / f"news_{T}"
    if out.exists():
        out = LIVE / f"news_{T}_재계산_{now:%H%M}"
    out.mkdir(parents=True)
    prev = prev_trading_day([T])
    lo, hi = window(T, prev)
    con = sqlite3.connect(f"file:{SOLO / 'data/night.db'}?mode=ro", uri=True)
    A = pd.read_sql("select item_id, headline, symbols, created_at_utc, url from news_items where source='alpaca'", con)
    A["t"] = pd.to_datetime(A.created_at_utc, utc=True).dt.tz_convert("Asia/Seoul")
    A = A[(A.t >= lo) & (A.t < hi)].sort_values("t")
    A.assign(time=A.t.dt.strftime("%m/%d %H:%M"))[["item_id", "time", "headline", "symbols", "url"]].to_csv(out / "articles.csv", index=False)
    counts = {"articles": len(A)}
    for src, dst in [("links.csv", "links.csv"), ("candidates.csv", "candidates.csv"), ("judged_openai.csv", "judged.csv"),
                     ("us_news_by_stock.csv", "by_stock.csv"), ("us_news_segment.csv", "segment.csv"), ("macro.csv", "macro.csv")]:
        d = pd.read_csv(RUN / src, dtype=str)
        d = d[d["T"] == T]
        d.to_csv(out / dst, index=False)
        counts[dst.removesuffix(".csv")] = len(d)
    j = pd.read_csv(out / "judged.csv", dtype=str)
    counts["judged_연결"] = int((j.verdict == "연결").sum()) if len(j) else 0
    files = {p.name: sha(p) for p in sorted(out.glob("*.csv"))}
    man = dict(T=T, issued_at=now.isoformat(timespec="seconds"), before_open=bool(now < pd.Timestamp(f"{T} 09:00", tz="Asia/Seoul")),
               window=[lo.isoformat(), hi.isoformat()], counts=counts,
               relation_table=dict(path="~/4Digit-solo/ref/relation_edges_v0.csv", sha256=sha(SOLO / "ref/relation_edges_v0.csv")),
               segment_table=dict(path="workbench/runs/claude_segments_r1/segments_final.csv", sha256=sha(W / "runs/claude_segments_r1/segments_final.csv")),
               models=dict(stage1="gpt-5.4-mini", stage2="gpt-6.1-sol", sign="gpt-6.1-sol"), files=files)
    (out / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
    digest = sha(out / "manifest.json")
    (out / "manifest.json.sha256").write_text(f"{digest}  {out.name}/manifest.json\n")
    line = f"{now:%Y-%m-%dT%H:%M:%S%z} {T} news {digest}  {out.name}/manifest.json"
    with open(LIVE / "seal_log.txt", "a") as f:
        f.write(line + "\n")
    print(out.name, "장 전" if man["before_open"] else "개장 뒤", counts)
    print(line)


if __name__ == "__main__":
    main()
