"""I24 standalone feature adapter. No performance fitting, output writes or core mutation.

The calendar, cutoff cohort and historical residuals have independent masters.
Only the final optional target attachment exposes current realized opening gaps.
"""
from __future__ import annotations

from pathlib import Path
import hashlib
import json
import sys
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROTOCOL = ROOT / 'workbench/protocol_i24_features.json'
CORRECTED = ROOT / 'workbench/corrected_data_v2'
NXT_LATER = ['g', 'g00', 'hi', 'lo', 'zv', 'mkt_g', 'rng', 'drift', 'dis', 'idio', 'sd08', 'nq']


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def positive(values):
    return np.isfinite(values) & (values > 0)


def validate_sources(root=ROOT):
    """Fail closed on an unreviewed helper, manifest or correction artifact."""
    plan = json.loads((root / 'workbench/protocol_i24_features.json').read_text())
    frozen = {**plan['frozen_dependencies_sha256'], **plan['frozen_inputs_sha256']}
    for name, expected in frozen.items():
        if sha256(root / name) != expected:
            raise RuntimeError('Frozen I24 dependency changed: ' + name)
    manifest = json.loads((root / 'workbench/corrected_data_v2/manifest.json').read_text())
    for name, expected in manifest['files_sha256'].items():
        if sha256(root / 'workbench/corrected_data_v2' / name) != expected:
            raise RuntimeError('Corrected I24 artifact changed: ' + name)
    completed = root / manifest['source_run'] / 'completed.json'
    if sha256(completed) != manifest['source_completed_sha256']:
        raise RuntimeError('E48 completion evidence changed')
    return plan


def make_calendar(futures, flags):
    """Preserve consecutive KR dates, including no-signal and contract-roll dates."""
    day = futures[futures.session == 'day'].sort_values('date').set_index('date')
    night = futures[futures.session == 'night'].set_index('date')
    flags = flags.set_index('D') if 'D' in flags else flags.copy()
    if not day.index.is_unique or not night.index.is_unique or not flags.index.is_unique:
        raise ValueError('Duplicate daily futures/flag key')
    for col in ('no_trade_signal', 'zero_move_traded'):
        if not flags[col].isin([True, False]).all():
            raise ValueError('Flags must be booleans: ' + col)
    dates = list(day.index)
    c = pd.DataFrame({'D': dates[:-1], 'T': dates[1:]}).set_index('T')
    c['day_close'] = c.D.map(day.close)
    c['night_close'] = c.D.map(night.close)
    c['night_volume_raw'] = c.D.map(night.volume)
    c['contract'] = c.D.map(day.code)
    c['same_contract'] = c.contract.eq(c.D.map(night.code)) & c.contract.eq(day.code.reindex(c.index))
    c['night_present'] = c.D.isin(night.index)
    c['flag_known'] = c.D.isin(flags.index)
    c['no_trade_signal'] = c.D.map(flags.no_trade_signal).fillna(False).astype(bool)
    c['zero_move_traded'] = c.D.map(flags.zero_move_traded).fillna(False).astype(bool)
    # This flag records legacy calendar membership only, not a cohort restriction.
    old_base = c.night_present & c.same_contract
    c['legacy_window'] = old_base & (old_base.cumsum() > 200)
    c['signal_valid'] = (old_base & c.flag_known & ~c.no_trade_signal &
                         positive(c.day_close) & positive(c.night_close) & positive(c.night_volume_raw))
    c['signal_reason'] = np.select(
        [~c.night_present, ~c.same_contract, ~c.flag_known, c.no_trade_signal, ~c.signal_valid],
        ['missing_night', 'contract_mismatch', 'unknown_flag', 'official_no_trade', 'invalid_price_or_volume'],
        default='valid')
    c['x'] = (c.night_close / c.day_close - 1).where(c.signal_valid)
    c['ax'] = c.x.abs()
    c['night_volume'] = c.night_volume_raw.where(c.signal_valid)
    c['night_range'] = ((c.D.map(night.high) - c.D.map(night.low)) / c.day_close).where(c.signal_valid)
    c['hol'] = [float(np.busday_count(pd.Timestamp(d).date(), pd.Timestamp(t).date()) > 1)
                for d, t in zip(c.D, c.index)]
    c['mon'] = (pd.to_datetime(c.index).weekday == 0).astype(float)
    return c


def stock_labels(calendar, prices, label_policy='legacy_close_valid'):
    """Label validity may read current O/C; exact-D previous close never does."""
    prices = prices.sort_values('date').set_index('date')
    if not prices.index.is_unique:
        raise ValueError('Duplicate stock date')
    pc = calendar.D.map(prices.Close.where(positive(prices.Close)))
    if label_policy == 'open_exact_prior_close':
        opening = prices.Open.reindex(calendar.index)
        y = opening/pc-1
        valid = positive(opening) & positive(pc) & np.isfinite(y)
        return pd.DataFrame({'pc':pc, 'y':y.where(valid), 'target_observed':valid,
                             'previous_valid_stock_date':calendar.D.where(positive(pc))},index=calendar.index)
    if label_policy != 'legacy_close_valid':
        raise ValueError('Unknown label policy: '+label_policy)
    good = prices[positive(prices.Open) & positive(prices.Close)]
    previous = pd.Series(good.index, index=good.index).shift(1).reindex(calendar.index)
    y = (good.Open / good.Close.shift(1) - 1).reindex(calendar.index)
    valid = previous.eq(calendar.D) & np.isfinite(y)
    return pd.DataFrame({'pc': pc, 'y': y.where(valid), 'target_observed': valid,
                         'previous_valid_stock_date': previous}, index=calendar.index)


def prior_ewma(values, dates, minimum, window=250, lam=.94):
    """Last window *valid* observations strictly before each calendar row."""
    values = np.asarray(values, float)
    dates = np.asarray(dates)
    out, counts, first, last = [], [], [], []
    history, history_dates = [], []
    for t, value in zip(dates, values):
        h = np.asarray(history[-window:], float)
        hd = history_dates[-window:]
        counts.append(len(h)); first.append(hd[0] if hd else None); last.append(hd[-1] if hd else None)
        weights = lam ** np.arange(len(h))[::-1]
        out.append(float(np.sqrt(np.dot(weights, h*h) / weights.sum())) if len(h) >= minimum else np.nan)
        if np.isfinite(value):
            history.append(value); history_dates.append(t)
    return pd.DataFrame({'value': out, 'count': counts, 'first': first, 'last': last}, index=dates)


def prior_point_models(calendar, labels, window=250, minimum=120):
    """Past sufficient statistics independent of current target availability."""
    valid = calendar.signal_valid & np.isfinite(calendar.x) & np.isfinite(labels.y)
    x, y = calendar.loc[valid, 'x'].to_numpy(), labels.loc[valid, 'y'].to_numpy()
    history_dates = calendar.index[valid].to_numpy()
    end = np.searchsorted(history_dates, calendar.index.to_numpy(), side='left')
    start = np.maximum(0, end-window); n = end-start
    columns = np.column_stack([x, y, x*x, y*y, x*y])
    cs = np.vstack([np.zeros(5), columns.cumsum(axis=0)])
    sx, sy, sxx, syy, sxy = (cs[end] - cs[start]).T
    with np.errstate(divide='ignore', invalid='ignore'):
        xx, yy, xy = sxx-sx*sx/n, syy-sy*sy/n, sxy-sx*sy/n
        beta = xy/xx
        intercept = (sy-beta*sx)/n
        r2 = xy*xy/(xx*yy)
        current_x = calendar.x.where(calendar.signal_valid).to_numpy()
        f2 = (sxy/sxx+1)/2*current_x
        m1 = intercept+beta*current_x
    usable = (n >= minimum) & (xx > 0) & (yy > 0) & (sxx > 0)
    # r2 describes the past fit; no current x is necessary for its availability.
    out = pd.DataFrame({'M1': np.where(usable, m1, np.nan), 'F2': np.where(usable, f2, np.nan),
                        'r2': np.where(usable, r2, np.nan), 'point_count': n}, index=calendar.index)
    out['H'] = np.where(out.r2 < .3, out.M1, out.F2)
    out['point_first'] = [history_dates[s] if e>s else None for s,e in zip(start,end)]
    out['point_last'] = [history_dates[e-1] if e>s else None for s,e in zip(start,end)]
    return out


def traded_nxt(development, universe, cutoff='08:11'):
    """Reviewed E46 source and trade rules, with origin/source provenance."""
    from workbench.e46_leadlag import combine_nxt_sources, clean_trade_snapshots
    if cutoff != '08:11':
        raise ValueError('NXT feature cutoff is fixed at08:11')
    # Even a malformed/duplicated future bar cannot alter cutoff eligibility.
    development = development[development.hhmmss.between('080000','081000')]
    universe = universe[universe.hhmmss.between('080000','081000')]
    combined = combine_nxt_sources(development, universe)
    combined = combined[combined.hhmmss.between('080000', '081000')].copy()
    # Concatenating an empty synthetic/real source can otherwise produce object dtype.
    combined[['price','volume']] = combined[['price','volume']].astype(float)
    snapshots = clean_trade_snapshots(combined)
    a = development[development.date == development.day]
    ka = set(map(tuple, a[['day','code','hhmmss']].to_numpy()))
    kb = set(map(tuple, universe[['day','code','hhmmss']].to_numpy()))
    keys = list(map(tuple, combined[['day','code','hhmmss']].to_numpy()))
    combined['source_file'] = ['data/nxt_premarket.csv' if k in ka else 'data/universe_premarket.csv' for k in keys]
    combined['duplicate_decision'] = ['development_wins_same_minute' if k in ka and k in kb else 'unique_minute' for k in keys]
    actual = combined[positive(combined.price) & positive(combined.volume)].sort_values(['day','code','hhmmss'])
    rows = []
    for (t, code), g in actual.groupby(['day','code'], sort=False):
        last = g.iloc[-1]; first = g.iloc[0]
        available = pd.Timestamp(t+' '+last.hhmmss, tz='Asia/Seoul')+pd.Timedelta(minutes=1)
        cut = pd.Timestamp(t+' 08:11', tz='Asia/Seoul')
        age = int((cut-available).total_seconds()/60)
        rows.append({'T': t, 'code': code, 'p10': last.price, 'p00': first.price,
                     'hi': g.price.max(), 'lo': g.price.min(), 'nv': float((g.price*g.volume).sum()),
                     'nxt_source_file': last.source_file, 'nxt_origin_minute': last.hhmmss,
                     'nxt_available_at': available.isoformat(), 'nxt_cutoff': cut.isoformat(),
                     'nxt_age_minutes': age, 'nxt_carried': bool(age>0), 'nxt_origin_volume': last.volume,
                     'nxt_duplicate_decision': last.duplicate_decision,
                     'nxt_observed_0810': bool(snapshots.observed.loc[(t,code), '081000']),
                     'nxt_traded_0810': bool(snapshots.traded.loc[(t,code), '081000'])})
    columns = ['T','code','p10','p00','hi','lo','nv','nxt_source_file','nxt_origin_minute',
               'nxt_available_at','nxt_cutoff','nxt_age_minutes','nxt_carried','nxt_origin_volume',
               'nxt_duplicate_decision','nxt_observed_0810','nxt_traded_0810']
    result = pd.DataFrame(rows, columns=columns)
    for col in ('p10','p00','hi','lo','nv','nxt_age_minutes','nxt_origin_volume'):
        result[col] = result[col].astype(float)
    return result


def build_panel(calendar, prices, universe, nxt, index_prices, development_codes=(), cutoff='08:11', include_targets=True):
    """Pure assembly API; no file writes, table-membership filters or outcome fitting."""
    if cutoff not in ('06:00', '08:11'):
        raise ValueError('Unsupported publication cutoff')
    if nxt.duplicated(['T','code']).any():
        raise ValueError('Duplicate NXT snapshot')
    index_labels = stock_labels(calendar, index_prices)
    mr = prior_ewma((index_labels.y-calendar.x).where(calendar.signal_valid), calendar.index, 60)
    panels, target_rows = [], []
    for item in universe.itertuples(index=False):
        code = item.code
        labels = stock_labels(calendar, prices[prices.code == code])
        point = prior_point_models(calendar, labels)
        sd = prior_ewma((labels.y-calendar.x).where(calendar.signal_valid), calendar.index, 60)
        p = calendar.copy().join(point)
        p['code'], p['pc'] = code, labels.pc
        p['name'], p['group'], p['etf'] = item.Name, item.group, item.etf
        p['kq'] = float(item.Market == 'KOSDAQ')
        p['dev'] = code in development_codes
        for prefix, stats in [('sd06',sd),('mreg',mr)]:
            p[prefix if prefix == 'sd06' else 'mreg_sd'] = stats.value
            for field in ('count','first','last'): p[prefix+'_'+field] = stats[field]
        p['lsd'] = np.log(p.sd06.where(p.sd06>0))
        p['mreg'] = np.log(p.mreg_sd.where(p.mreg_sd>0))
        nx = nxt[nxt.code == code].drop(columns='code').set_index('T').reindex(calendar.index)
        p = p.join(nx)
        p['g'] = p.p10/p.pc-1
        p['g00'] = p.p00/p.pc-1
        p['cohort_0811'] = positive(p.p10) & positive(p.pc) & np.isfinite(p.g)
        p['nxt'] = p.cohort_0811
        p['cohort_reason'] = np.select([~positive(p.p10), ~positive(p.pc)], ['no_trade_by_cutoff','no_valid_exact_D_close'], default='eligible')
        sd8 = prior_ewma((labels.y-p.g).where(p.cohort_0811), calendar.index, 20)
        p['sd08'] = sd8.value
        for field in ('count','first','last'): p['sd08_'+field] = sd8[field]
        valid_nv = p.nv.where(positive(p.nv)).dropna()
        med = valid_nv.shift(1).rolling(20, min_periods=10).median()
        p['zv'] = np.log((p.nv+1)/(med.reindex(p.index)+1))
        p['rng'] = (p.hi-p.lo)/p.pc/p.sd06.where(p.sd06>0)
        p['dis'] = (p.g-p.F2).abs()/p.sd06.where(p.sd06>0)
        p['drift'] = p.g-p.g00
        p['feature_ready_06'] = np.isfinite(p.H) & positive(p.sd06)
        p['feature_ready_e47'] = p.cohort_0811 & positive(p.sd06) & positive(p.sd08) & np.isfinite(p.rng) & np.isfinite(p.dis)
        p['feature_reason_e47'] = np.select([~p.cohort_0811, ~positive(p.sd06), ~positive(p.sd08), ~np.isfinite(p.F2), ~np.isfinite(p.rng) | ~np.isfinite(p.dis)],
            ['not_cutoff_cohort','insufficient_sd06','insufficient_sd08','no_current_F2','nonfinite_rng_dis'], default='eligible')
        panels.append(p.rename_axis('T').reset_index())
        target_rows.append(labels[['y','target_observed','previous_valid_stock_date']].assign(code=code).rename_axis('T').reset_index())
    panel = pd.concat(panels, ignore_index=True)
    panel['mkt_g'] = panel.g.where(panel.cohort_0811).groupby(panel['T']).transform('median')
    panel['idio'] = (panel.g-panel.mkt_g).abs()
    panel['r2_prev'] = panel.r2
    if cutoff == '06:00':
        panel[NXT_LATER] = np.nan
        # No later observations are exposed to a06:00 caller, including provenance.
        panel[[c for c in panel if c.startswith('nxt_') or c.startswith('sd08_')]+['p10','p00','nv']] = np.nan
        panel['cohort_0811'] = False; panel['nxt'] = False; panel['feature_ready_e47'] = False
        panel['cohort_reason'] = 'not_available_at_0600'; panel['feature_reason_e47'] = 'not_available_at_0600'
    if include_targets:
        panel = panel.merge(pd.concat(target_rows, ignore_index=True), on=['T','code'], how='left', validate='one_to_one')
    panel = panel.sort_values(['T','code']).reset_index(drop=True)
    panel.attrs.update(cutoff_kst=cutoff, adapter='I24-feature-v1', performance_evaluated=False,
                       master='complete KR calendar x frozen current universe', target_selection=False,
                       history='strict prior last250 VALID observations; not last250 calendar rows')
    return panel


def calendar_covariates(calendar, root, cutoff):
    """Local known-at-cutoff fields; unavailable timing is never target-filled."""
    from workbench.core import asof_daily, snapshot_change
    sys.path.insert(0, str(root/'src'))
    from explore16 import option_expiries
    from explore21 import next_kr
    c = calendar.copy()
    allkr = pd.read_csv(root/'data/ks200_long.csv', dtype={'Date':str}).Date.tolist()
    fr = pd.read_csv(root/'data/fred_release_dates.csv', dtype={'us_date':str})
    fo = pd.read_csv(root/'data/fomc_dates.csv', dtype={'us_date':str})
    for kind in ('CPI','NFP'):
        c[kind.lower()] = c.index.isin(next_kr(fr.loc[fr.kind == kind,'us_date'], allkr)).astype(float)
    c['fomc'] = c.index.isin(next_kr(fo.us_date, allkr)).astype(float)
    c['exp'] = c.index.isin(option_expiries(list(c.index))).astype(float)
    v = asof_daily(pd.read_csv(root/'data/vix_daily.csv', dtype={'us_date':str}), list(c.index), cutoff)
    v['dvix'] = snapshot_change(v)
    v = v.set_index('T')
    c['vix'], c['dvix'], c['dvix_last_session'] = np.log(v.close), v.dvix, v.change
    for col in ('source_date','available_at','age_hours'): c['vix_'+col] = v[col]
    valid_vol = c.night_volume.dropna()
    med = valid_vol.shift(1).rolling(60,min_periods=20).median()
    c['nvz'] = np.log(c.night_volume/med.reindex(c.index)).where(c.signal_valid)
    nm = pd.read_csv(root/'data/night_minutes.csv', dtype={'date':str,'code':str,'hhmmss':str})
    nm = nm[positive(nm.price) & positive(nm.volume)].sort_values('hhmmss')
    paths = {}
    for (day, code), g in nm.groupby(['date','code']):
        mid = g[g.hhmmss <= '240000']
        if len(mid): paths[(day,code)] = (float(mid.price.iloc[-1]),float(g.price.iloc[-1]))
    c['x_pre'], c['x_post'] = np.nan, np.nan
    for t, r in c[c.signal_valid].iterrows():
        if (r.D,r.contract) in paths:
            mid,last = paths[(r.D,r.contract)]
            c.loc[t,['x_pre','x_post']] = [mid/r.day_close-1,last/mid-1]
    c['nq'] = np.nan
    c['nq_06_age_hours'], c['nq_08_age_hours'] = np.nan, np.nan
    if cutoff == '08:11':
        us = pd.read_csv(root/'data/us_hourly.csv', parse_dates=['bar_end_utc'])
        nq = us[us.symbol == 'NQ'].sort_values('bar_end_utc').drop_duplicates('bar_end_utc').set_index('bar_end_utc').Close
        for t in c.index:
            snapshots = []
            for hour in (6,8):
                cut = pd.Timestamp(t,tz='Asia/Seoul')+pd.Timedelta(hours=hour)
                j = nq.index.searchsorted(cut,side='right')-1
                price = nq.iloc[j] if j>=0 else np.nan
                age = (cut-nq.index[j]).total_seconds()/3600 if j>=0 else np.nan
                snapshots.append(price); c.loc[t,f'nq_{hour:02d}_age_hours'] = age
            if all(positive(np.array(snapshots))): c.loc[t,'nq'] = snapshots[1]/snapshots[0]-1
    return c


def investor_covariates(panel, investors):
    f = investors.sort_values(['code','date']).copy()
    if f.duplicated(['date','code']).any(): raise ValueError('Duplicate investor key')
    f['value'] = f.value.where(positive(f.value))
    f['tv'] = f.groupby('code').value.transform(lambda s:np.log(s/s.shift(1).rolling(20,min_periods=10).median()))
    f['flow'] = (f.frgn+f.orgn)/f.value
    return panel.merge(f[['date','code','tv','flow']].rename(columns={'date':'D'}), on=['D','code'],how='left',validate='many_to_one')


def compare_point_reference(panel, reference):
    """Numerical lineage only: no errors versus y or model-performance statistics."""
    compared = reference.merge(panel[['T','code','M1','F2','r2_prev','H']],on=['T','code'],how='left',suffixes=('_ref',''),validate='one_to_one',indicator=True)
    if not compared._merge.eq('both').all(): raise AssertionError('Reference key absent from full panel')
    differences = {name:float((compared[name]-compared[name+'_ref']).abs().max()) for name in ('M1','F2','r2_prev','H')}
    if not np.isfinite(compared[['M1','F2','r2_prev','H']]).all().all() or max(differences.values())>1e-12:
        raise AssertionError('Point-table lineage mismatch: '+str(differences))
    return {'common_rows':len(compared),'max_absolute_difference':differences,'tolerance':1e-12}


def load_panel(cutoff='08:11', include_targets=True, root=ROOT):
    """Explicit replacement API; core.load_panel and its default data stay untouched."""
    plan = validate_sources(root)
    types = {'date':str,'code':str,'day':str,'hhmmss':str,'D':str,'T':str}
    read = lambda name:pd.read_csv(root/'data'/name,dtype=types)
    calendar = make_calendar(read('futures_daily.csv'),pd.read_csv(root/'workbench/corrected_data_v2/night_signal_flags.csv',dtype=types))
    calendar = calendar_covariates(calendar,root,cutoff)
    prices, kr = read('universe_daily.csv'),read('kr_daily.csv')
    universe = pd.read_csv(root/'data/universe.csv',dtype={'Code':str}).rename(columns={'Code':'code'})
    nxt = traded_nxt(read('nxt_premarket.csv'),read('universe_premarket.csv'))
    panel = build_panel(calendar,prices,universe,nxt,kr[kr.code == 'KS200'],plan['development_codes'],cutoff,include_targets)
    panel = investor_covariates(panel,read('investor_daily.csv'))
    ref = pd.read_csv(root/'workbench/corrected_data_v2/sector_study_predictions.csv',dtype=types)
    if 'H' not in ref: ref['H'] = np.where(ref.r2_prev<.3,ref.M1,ref.F2)
    panel.attrs['point_reference_check'] = compare_point_reference(panel,ref)
    all_dates = set(calendar.index)|set(calendar.D)
    lower, upper = min(all_dates),max(all_dates)
    calendar_diff = {}
    for name, frame in [('universe_daily',prices),('kr_daily',kr),('KS200',kr[kr.code == 'KS200'])]:
        market_dates = set(frame.loc[frame.date.between(lower,upper),'date'])
        calendar_diff[name+'_only'] = sorted(market_dates-all_dates)
        calendar_diff['futures_only_vs_'+name] = sorted(all_dates-market_dates)
    panel.attrs['calendar_differences'] = calendar_diff
    panel.attrs['source_hashes'] = {str(p.relative_to(root)):sha256(p) for p in [
        root/'data'/n for n in ('futures_daily.csv','universe_daily.csv','universe.csv','kr_daily.csv','nxt_premarket.csv','universe_premarket.csv',
                               'night_minutes.csv','us_hourly.csv','vix_daily.csv','investor_daily.csv','fred_release_dates.csv','fomc_dates.csv','ks200_long.csv')]}
    return panel.sort_values(['T','code']).reset_index(drop=True)


def load_targets(root=ROOT, label_policy='legacy_close_valid'):
    """Label-only API for attachment AFTER a consumer freezes its cutoff policy."""
    validate_sources(root)
    types = {'date':str,'code':str,'D':str}
    calendar = make_calendar(pd.read_csv(root/'data/futures_daily.csv',dtype=types),
                            pd.read_csv(root/'workbench/corrected_data_v2/night_signal_flags.csv',dtype=types))
    prices = pd.read_csv(root/'data/universe_daily.csv',dtype=types)
    universe = pd.read_csv(root/'data/universe.csv',dtype={'Code':str})
    frames = []
    for code in universe.Code:
        labels = stock_labels(calendar,prices[prices.code == code],label_policy=label_policy)
        frames.append(labels[['y','target_observed']].assign(code=code).rename_axis('T').reset_index())
    result = pd.concat(frames,ignore_index=True).sort_values(['T','code']).reset_index(drop=True)
    result.attrs['label_policy'] = label_policy
    return result


def main():
    """Read-only construction and lineage summary, never performance evaluation."""
    p = load_panel()
    summary = {key:p.attrs[key] for key in ('point_reference_check','calendar_differences')}
    summary.update(rows=len(p),dates=p['T'].nunique(),cohort_0811=int(p.cohort_0811.sum()),
                   feature_ready_e47=int(p.feature_ready_e47.sum()),
                   missing_target_in_cohort=int((p.cohort_0811 & ~p.target_observed).sum()),performance_evaluated=False)
    print(json.dumps(summary,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
