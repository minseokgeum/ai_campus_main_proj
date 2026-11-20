"""미국 뉴스 연결이 다룰 아침(T) 목록과 '직전 거래일' 달력. us_news_link·us_news_segment가 같이 쓴다.

- 날짜: 앱 날짜 파일 전부 + 11/10 + 환경변수 NEWS_DAYS(쉼표, 아침 봉인 때 그날 T).
- 달력: 가장 최근 live 폴더 두 곳의 KS200 거래일 + 위 날짜. T 자체는 live_refresh가 휴장일 조회로 개장일임을 확인한 날만 들어온다.
- 밤사이 창: 직전 거래일 15:30 ~ T 07:30 KST(07:30 카드와 같은 경계).
"""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

W = Path(__file__).parent
APP_DAYS_DIR = Path.home() / "4Digit/src/app/data/model/days"


def news_days() -> list[str]:
    app = {x.stem for x in APP_DAYS_DIR.glob("*.json")}
    extra = {d.strip() for d in os.environ.get("NEWS_DAYS", "").split(",") if d.strip()}
    return sorted(app | {"20261110"} | extra)


def prev_trading_day(days: list[str]) -> dict[str, str]:
    lives = sorted((p for p in (W / "live").glob("2026*") if (p / "data/kr_daily.csv").exists()), key=lambda p: p.stat().st_mtime)[-2:]
    cal: set[str] = set()
    for p in lives:
        k = pd.read_csv(p / "data/kr_daily.csv", dtype={"date": str}, usecols=["date", "code"])
        cal |= set(k[k.code == "KS200"].date)
    cal = sorted(cal | set(days))
    return {cal[i]: cal[i - 1] for i in range(1, len(cal))}


def window(T: str, prev: dict[str, str]) -> tuple[pd.Timestamp, pd.Timestamp]:
    return pd.Timestamp(f"{prev[T]} 15:30", tz="Asia/Seoul"), pd.Timestamp(f"{T} 07:30", tz="Asia/Seoul")
