"""자료 출처 고르기: 라이브(로컬, 매일 갱신되는 실제 자료를 바로 읽음) 또는 스냅샷(service/data/*.json, 배포판).

- 라이브: DATA_ROOT가 있고 pandas를 쓸 수 있으면 기본. 묶음은 60초만 기억한다(아침 봉인·개장 직후·장 마감 뒤 갱신이 곧 보이게).
- 스냅샷: SERVICE_MODE=snapshot 이거나 라이브 조건이 안 맞으면. build_snapshot.py가 같은 함수 결과를 그대로 굳혀 둔 것이다.
두 경우 모두 같은 모양을 돌려준다.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
SNAP = Path(os.environ.get("SNAPSHOT_DIR", str(SERVICE / "data")))
TTL = 60
_cache: dict[str, tuple[float, object]] = {}
_lock = threading.Lock()


def _live_ok() -> bool:
    if os.environ.get("SERVICE_MODE") == "snapshot":
        return False
    root = Path(os.environ.get("DATA_ROOT", str(Path.home() / "4Digit/src/app/data"))).expanduser()
    if not (root / "model/days").is_dir():
        return False
    try:
        import pandas  # noqa: F401
    except ImportError:
        return False
    return True


MODE = "live" if _live_ok() else "snapshot"
if MODE == "live":
    from . import bundle as B


def _cached(key: str, make):
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < TTL:
            return hit[1]
    v = make()
    with _lock:
        _cache[key] = (time.time(), v)
    return v


def _read(rel: str):
    p = SNAP / rel
    if not p.exists():
        raise FileNotFoundError(rel)
    return _cached("f:" + rel, lambda: json.loads(p.read_text(encoding="utf-8")))


def meta() -> dict:
    m = _cached("meta", B.meta) if MODE == "live" else _read("meta.json")
    return dict(m, mode=MODE)


def day(T: str) -> dict:
    if MODE == "live":
        return _cached("day:" + T, lambda: B.day(T))
    return _read(f"day/{T}.json")


def track() -> dict:
    return _cached("track", B.track) if MODE == "live" else _read("track.json")


def graph() -> dict:
    return _cached("graph", B.graph_all) if MODE == "live" else _read("graph.json")


def stocks() -> list[dict]:
    return _cached("stocks", B.catalog) if MODE == "live" else _read("stocks.json")


def accounts() -> list[dict]:
    return _cached("accounts", B.sample_accounts) if MODE == "live" else _read("accounts.json")
