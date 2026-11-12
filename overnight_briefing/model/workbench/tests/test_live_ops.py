"""운영 보완(11/4): 휴장일 판정, NXT 받을 날짜, 이어받을 폴더, 신호 없는 날 카드, 덮어쓰지 않는 저장 경로. 네트워크를 쓰지 않는다."""
import json

import numpy as np
import pandas as pd
import pytest

from workbench import live_refresh as lr
from workbench import morning_card as mc

KST = "Asia/Seoul"


def test_parse_open_reads_only_the_asked_day():
    res = {"output": [{"bass_dt": "20261009", "opnd_yn": "N"}, {"bass_dt": "20261012", "opnd_yn": "Y"}]}
    assert lr.parse_open(res, "20261009") is False
    assert lr.parse_open(res, "20261012") is True
    assert lr.parse_open(res, "20261013") is None
    assert lr.parse_open({}, "20261009") is None


def test_trading_day_falls_back_to_weekend_only(monkeypatch):
    monkeypatch.setattr(lr, "kis_get", lambda *a, **k: {})
    assert lr.trading_day(None, "20261107") == (False, "휴장일 조회 실패(주말만 확인)")  # 토요일
    assert lr.trading_day(None, "20261106")[0] is True


def test_premarket_todo_skips_have_future_and_not_ready():
    df = pd.DataFrame({"day": ["20261103"], "code": ["005930"], "hhmmss": ["081000"], "price": [1.0], "volume": [1.0]})
    before = pd.Timestamp("2026-11-04 08:05", tz=KST)
    after = pd.Timestamp("2026-11-04 08:12", tz=KST)
    asked = ["20261102", "20261103", "20261104", "20261105"]
    assert lr.premarket_todo(df, asked, before) == ["20261102"]
    assert lr.premarket_todo(df, asked, after) == ["20261102", "20261104"]


def test_pick_base(tmp_path):
    live = tmp_path / "live"
    for name in ("20261102", "20261103"):
        (live / name / "data").mkdir(parents=True)
        (live / name / "refresh_manifest.json").write_text("{}")
        (live / name / "data/futures_daily.csv").write_text("x")
    (live / "20261104").mkdir()
    (live / "20261104/refresh_manifest.json").write_text(json.dumps({"skipped": "휴장일"}))
    assert lr.pick_base(live, "20261105", "auto").name == "20261103"
    assert lr.pick_base(live, "20261103", "auto").name == "20261103"
    assert lr.pick_base(live, "20261104", "auto").name == "20261103"  # 휴장일 manifest만 있고 자료가 없으면 앞 폴더
    assert lr.pick_base(live, "20261105", "none") is None
    assert lr.pick_base(tmp_path / "nothing", "20261105", "auto") is None


def test_no_signal_day_returns_status_card_not_error():
    z = pd.DataFrame({"T": ["20261103"], "code": ["005930"]})
    card = mc.build_card(z, z, [], ["005930"], "20261111", signal={"valid": False, "reason": "missing_night", "D": "20261110", "x": None})
    assert card["status"] == "no_signal" and card["reason"] == "missing_night" and card["stocks"] == []
    assert "만기일" in card["reason_text"]
    card2 = mc.build_card(z, z, [], ["005930"], "20261111")
    assert card2["status"] == "no_signal" and card2["reason"] == "not_in_calendar"
    json.dumps(card, allow_nan=False)


def test_short_history_message_is_specific():
    z = pd.DataFrame({"T": ["20261103", "20261104"], "code": ["005930"] * 2, "y": [0.01, np.nan], "g": [0.0, 0.0],
                      "sd08": [0.01, 0.01], "x": [0.0, 0.0], "ax": [0.0, 0.0]})
    with pytest.raises(SystemExit, match="60거래일"):
        mc.build_card(z, z, [], ["005930"], "20261104")


def test_card_path_never_overwrites(tmp_path):
    p = mc.card_path(None, tmp_path, "20261104", "0730")
    assert p.name == "card_20261104_0730.json"
    p.write_text("a")
    p2 = mc.card_path(None, tmp_path, "20261104", "0730")
    assert p2.name == "card_20261104_0730_v2.json"
    p2.write_text("b")
    assert mc.card_path(None, tmp_path, "20261104", "0730").name == "card_20261104_0730_v3.json"
    explicit = tmp_path / "x.json"
    explicit.write_text("c")
    assert mc.card_path(str(explicit), tmp_path, "20261104", "0811").name == "x_v2.json"


def test_refresh_functions_keep_table_when_nothing_new():
    class K:
        def daily(self, *a):
            return []
    fut = pd.DataFrame({"date": ["20261103"], "session": ["night"], "code": ["A01612"], "open": [1.0], "high": [1.0], "low": [1.0], "close": [1.0], "volume": [1.0]})
    now = pd.Timestamp("2026-11-04 07:00", tz=KST)
    assert lr.refresh_futures(K(), fut, "20261104", "20261104", now) is fut
    ud = pd.DataFrame({"date": ["20261103"], "Open": [1.0], "Close": [1.0], "code": ["005930"]})
    orig = lr.kis_get
    try:
        lr.kis_get = lambda *a, **k: {}
        assert lr.refresh_stocks(None, ud, ["005930"], "20261104", "20261104") is ud
        pm = pd.DataFrame(columns=["day", "code", "hhmmss", "price", "volume"])
        assert lr.refresh_premarket(None, pm, ["005930"], ["20261104"])[1] == 0
    finally:
        lr.kis_get = orig


def test_night_minutes_only_finished_new_nights(monkeypatch):
    """야간선물 1분봉(11/10 추가): 이미 있는 밤·안 끝난 밤은 받지 않고, 야간 일봉이 있는 밤만 받는다."""
    import pandas as pd
    from workbench import live_refresh as lr
    asked = []

    def fake(kis, d, code):
        asked.append(d)
        return pd.DataFrame([(d, code, "180000", 1.0, 1), (d, code, "300000", 2.0, 1)], columns=["date", "code", "hhmmss", "price", "volume"])
    monkeypatch.setattr(lr, "night_minutes", fake)
    nm = pd.DataFrame([("20261030", "A01612", "300000", 1.0, 1)], columns=["date", "code", "hhmmss", "price", "volume"])
    fut = pd.DataFrame([dict(date=d, session=s, code="A01612") for d in ("20261030", "20261102", "20261103") for s in ("day", "night")])
    now = pd.Timestamp("2026-11-04 05:00", tz="Asia/Seoul")      # 11/3 밤은 11/4 06:05 전이라 아직 안 끝남
    out, got = lr.refresh_night_minutes(None, nm, fut, "20261104", now)
    assert asked == ["20261102"] and list(got) == ["20261102"]
    assert sorted(out.date.unique()) == ["20261030", "20261102"]
