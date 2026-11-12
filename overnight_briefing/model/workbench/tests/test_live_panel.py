"""실제 날짜용 입력 연결이 연구 패널과 같은 값을 내는지, 새 밤 표시 규칙이 기존 표와 같은지, 오늘 빈 줄 처리가 맞는지.
연구 패널을 읽어 쓴다(약 2분).
"""
import numpy as np
import pandas as pd
import pytest

from workbench import e62_band as e
from workbench import i24_panel as ip
from workbench import live_panel as lp


def test_flag_rule_reproduces_existing_table():
    fut = pd.read_csv(lp.RESEARCH / "data/futures_daily.csv", dtype=lp.TYPES)
    base = pd.read_csv(lp.RESEARCH / "workbench/corrected_data_v2/night_signal_flags.csv", dtype=lp.TYPES)
    rebuilt = lp.night_flags(fut, base.iloc[0:0]).set_index("D")
    old = base.set_index("D")
    for col in ("no_trade_signal", "zero_move_traded"):
        assert (rebuilt.loc[old.index, col].astype(bool) == old[col].astype(str).eq("True")).all()


def test_add_today_builds_x_from_previous_night():
    fut = pd.read_csv(lp.RESEARCH / "data/futures_daily.csv", dtype=lp.TYPES)
    last = fut[fut.session == "day"].date.max()
    T = "29991231"
    f2 = lp.add_today(fut, T)
    base = pd.read_csv(lp.RESEARCH / "workbench/corrected_data_v2/night_signal_flags.csv", dtype=lp.TYPES)
    flags = lp.night_flags(f2, base)
    for col in ("no_trade_signal", "zero_move_traded"):
        flags[col] = flags[col].astype(str).eq("True")
    c = ip.make_calendar(f2, flags)
    day, night = fut[fut.session == "day"].set_index("date"), fut[fut.session == "night"].set_index("date")
    assert c.loc[T, "D"] == last
    if last in night.index:
        assert np.isclose(c.loc[T, "x"], night.close[last] / day.close[last] - 1)
    assert lp.add_today(fut, last) is fut


@pytest.fixture(scope="module")
def research_frames():
    return e.load_frames()


def test_same_frames_as_research(research_frames):
    z0, n0, dev0, codes0 = research_frames
    (z1, n1, dev1, codes1), manifest = lp.frames(lp.RESEARCH, e.EVENTS)
    assert manifest["panel_06"]["flag_rule_nights"] == []
    assert dev0 == dev1 and codes0 == codes1
    cols = ["T", "code", "x", "H", "y", "sd08", "raw80", "ax", "mon", "e_earn", "pc"]
    pd.testing.assert_frame_equal(z0[cols].reset_index(drop=True), z1[cols].reset_index(drop=True))
    cols8 = ["T", "code", "g", "y", "size", "lsd", "r2"]
    pd.testing.assert_frame_equal(n0[cols8].reset_index(drop=True), n1[cols8].reset_index(drop=True))
