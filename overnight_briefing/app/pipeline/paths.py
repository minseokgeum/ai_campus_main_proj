"""화면 자료 만들기(app/pipeline)가 함께 쓰는 경로. 모두 환경변수로 바꿀 수 있고, 기본값은 저장소 안 위치다.

  OVERNIGHT_RESEARCH  노란띠 엔진 폴더(기본: overnight_briefing/model). 카드·채점·기록과 날짜별 자료가 여기 있다
  DATA_ROOT           화면 자료 폴더(기본: overnight_briefing/app/data). 화면(app, service)이 읽는 곳
  SOLO                (1차 데모 임시) 알파카 기사 원장이 있는 폴더. 없으면 미국 기사 겹치기는 건너뛴다
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path

OB = Path(__file__).resolve().parents[2]
ENGINE = Path(os.environ.get("OVERNIGHT_RESEARCH") or OB / "model").expanduser()
DATA = Path(os.environ.get("DATA_ROOT") or OB / "app" / "data").expanduser()
CARDS = ENGINE / "workbench/runs/claude_live_r1"
SOLO = Path(os.environ["SOLO"]).expanduser() if os.environ.get("SOLO") else None

_spec = importlib.util.spec_from_file_location("special_days", OB / "model/market_calendar/special_days.py")
CAL = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(CAL)


def open_time(T: str) -> str:
    """T의 정규장 개장 시각(HH:MM). 특별한 날 달력(model/market_calendar)에서 읽는다."""
    return CAL.day_info(T)["open"] or "09:00"
