"""실제 날짜용 입력 연결. 연구 패널(i24_panel)과 같은 함수로, 지정한 자료 폴더에서 06:00·08:11 패널을 만든다.

연구 패널의 고정 검사(validate_sources)는 연구 재현용이라 여기서는 부르지 않고, 대신 읽은 입력 파일의 해시를 manifest에 남긴다.
연구 패널과 달라지는 점은 두 가지이고, 결과를 보기 전에 정했다.
1. 새 밤의 신호 표시: corrected_data_v2/night_signal_flags.csv에 없는 밤은 규칙으로 만든다.
   no_trade_signal = 거래량 0이고 시가=고가=저가=종가, zero_move_traded = 거래량>0이고 야간 종가 = 그날 주간 종가.
   기존 438밤에서 두 규칙이 기존 표와 모두 일치했다(11/3 확인). 기존 표에 있는 밤은 표 값을 그대로 쓴다.
2. 오늘 T의 주간장이 아직 없으면 futures_daily에 T 빈 줄(가격 없음)을 더해 달력에 T를 만든다.
   x는 D 주간 종가와 D 야간 종가로만 계산되므로 T 줄의 가격은 쓰이지 않는다.
같은 자료를 넣으면 연구 패널·e62_band.load_frames와 같은 값이 나와야 한다(tests/test_live_panel.py).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from workbench import e62_band as e
from workbench import i24_panel as ip

RESEARCH = Path(__file__).resolve().parents[1]
TYPES = {'date': str, 'code': str, 'day': str, 'hhmmss': str, 'D': str, 'T': str}
INPUTS = ('futures_daily.csv', 'universe_daily.csv', 'universe.csv', 'kr_daily.csv', 'nxt_premarket.csv', 'universe_premarket.csv',
          'night_minutes.csv', 'us_hourly.csv', 'vix_daily.csv', 'investor_daily.csv', 'fred_release_dates.csv', 'fomc_dates.csv', 'ks200_long.csv')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def night_flags(futures, base):
    """기존 표 + 그 뒤 밤은 규칙으로. 기존 표 값은 바꾸지 않는다."""
    day = futures[futures.session == 'day'].set_index('date')
    night = futures[futures.session == 'night'].copy()
    new = night[~night.date.isin(base.D)].copy()
    if new.empty:
        return base.copy()
    dc = new.date.map(day.close)
    new['no_trade_signal'] = (new.volume == 0) & (new.open == new.high) & (new.high == new.low) & (new.low == new.close)
    new['zero_move_traded'] = (new.volume > 0) & (new.close == dc)
    new = new.rename(columns={'date': 'D'})[list(base.columns)]
    return pd.concat([base, new], ignore_index=True)


def add_today(futures, T):
    """T 주간장이 아직 없으면 가격 없는 빈 줄을 더한다."""
    if T is None or ((futures.session == 'day') & (futures.date == T)).any():
        return futures
    last = futures[futures.session == 'day'].sort_values('date').iloc[-1]
    row = {c: np.nan for c in futures.columns}
    row.update(date=T, session='day', code=last.code)
    return pd.concat([futures, pd.DataFrame([row])], ignore_index=True)


def build(root, cutoff, T=None, include_targets=True):
    root = Path(root)
    plan = json.loads((RESEARCH / 'workbench/protocol_i24_features.json').read_text())
    read = lambda name: pd.read_csv(root / 'data' / name, dtype=TYPES)
    futures = add_today(read('futures_daily.csv'), T)
    base = pd.read_csv(RESEARCH / 'workbench/corrected_data_v2/night_signal_flags.csv', dtype=TYPES)
    flags = night_flags(futures, base)
    for col in ('no_trade_signal', 'zero_move_traded'):
        flags[col] = flags[col].map(lambda v: v if isinstance(v, (bool, np.bool_)) else str(v) == 'True').astype(bool)
    calendar = ip.make_calendar(futures, flags)
    calendar = ip.calendar_covariates(calendar, root, cutoff)
    prices, kr = read('universe_daily.csv'), read('kr_daily.csv')
    universe = pd.read_csv(root / 'data/universe.csv', dtype={'Code': str}).rename(columns={'Code': 'code'})
    nxt = ip.traded_nxt(read('nxt_premarket.csv'), read('universe_premarket.csv'))
    panel = ip.build_panel(calendar, prices, universe, nxt, kr[kr.code == 'KS200'], plan['development_codes'], cutoff, include_targets)
    panel = ip.investor_covariates(panel, read('investor_daily.csv'))
    manifest = dict(root=str(root), cutoff=cutoff, T=T, flag_rule_nights=sorted(set(flags.D) - set(base.D)),
                    inputs_sha256={n: sha(root / 'data' / n) for n in INPUTS if (root / 'data' / n).exists()})
    return panel.sort_values(['T', 'code']).reset_index(drop=True), manifest


def frames_from_panels(p6, p8, filings, dev, keep_T=None):
    """e62_band.load_frames와 같은 계산을, 주어진 패널과 공시 목록으로 한다.
    keep_T: 아직 시가가 없는 그날의 NXT 행은 등급 계산용으로 남긴다(학습에는 쓰이지 않는다)."""
    cal = p6[['T', 'D']].drop_duplicates().sort_values('T')
    ev = e.event_flags(filings, cal)
    z = p6[np.isfinite(p6.H)].sort_values(['code', 'T']).copy()
    z['g'] = z.H
    z['e'] = z.y - z.H
    z['sd08'] = z.groupby('code').e.transform(lambda v: e.prior_rms(v.to_numpy()))
    z['raw80'] = z.groupby('code').e.transform(lambda v: e.raw_band(v.to_numpy(), .8))
    z['raw90'] = z.groupby('code').e.transform(lambda v: e.raw_band(v.to_numpy(), .9))
    z['size'] = z.H.abs()
    z = z.merge(ev, on=['T', 'code'], how='left')
    z[e.FAMILIES] = z[e.FAMILIES].fillna(0.)
    n = p8[p8.nxt & np.isfinite(p8.g) & (np.isfinite(p8.y) | (p8['T'] == keep_T))].copy()
    n['size'] = n.g.abs()
    n = n.merge(ev, on=['T', 'code'], how='left')
    n[e.FAMILIES] = n[e.FAMILIES].fillna(0.)
    return z, n, dev, sorted(z.code.unique())


def frames(root, filings_path, T=None):
    p6, m6 = build(root, '06:00', T)
    p8, m8 = build(root, '08:11', T)
    dev = json.loads((RESEARCH / 'workbench/protocol_i24_features.json').read_text())['development_codes']
    out = frames_from_panels(p6, p8, pd.read_csv(filings_path, dtype=str), dev, keep_T=T)
    manifest = dict(panel_06=m6, panel_0811=m8, filings=str(filings_path), filings_sha256=sha(filings_path))
    if T is not None:
        manifest['signal_T'] = signal_of(p6, T)
    return out, manifest


def signal_of(p6, T):
    """T의 야간 신호 상태(카드가 '신호 없음'을 알리는 데 쓴다)."""
    r = p6[p6['T'] == T]
    if r.empty:
        return dict(T=T, D=None, valid=False, reason='not_in_calendar', x=None)
    r = r.iloc[0]
    x = float(r.x) if np.isfinite(r.x) else None
    return dict(T=T, D=str(r.D), valid=bool(r.signal_valid), reason=str(r.signal_reason), x=x)
