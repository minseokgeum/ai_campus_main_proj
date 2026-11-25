"""E46: review-gated, nonoverlapping futures-to-NXT lead/lag experiment.

Default CLI operation is read-only coverage. Historical performance must not run
until a reviewer approves the exact protocol, module and helper hashes. No model
is fitted on real data during development/schema checks. Synthetic tests are safe.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from workbench import time_patterns

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / 'workbench/runs'
PROTOCOL_PATH = ROOT / 'workbench/protocol_e46.json'
HELPER_PATH = Path(time_patterns.__file__).resolve()
TEST_PATH = ROOT / 'workbench/tests/test_e46.py'
ALL_MINUTES = [f'08{m:02d}00' for m in range(50)]
MODELS = {
    'zero': [],
    'raw_future': ['future_return_pp'],
    'controls': ['own_return_pp', 'market_return_pp', 'log1p_age'],
    'controls_plus_future': ['own_return_pp', 'market_return_pp', 'log1p_age', 'future_return_pp'],
}
DIAGNOSTIC_MODELS = {
    'controls_alt': ['own_return_pp', 'market_trimmed_return_pp', 'log1p_age'],
    'controls_alt_plus_future': ['own_return_pp', 'market_trimmed_return_pp', 'log1p_age', 'future_return_pp'],
}
ALL_MODELS = {**MODELS, **DIAGNOSTIC_MODELS}
ALT_TRIM = 0.10
ALT_MIN_FRESH_STOCKS = 10
BOOTSTRAP = {'reps': 1000, 'seed': 20261029, 'blocks': [5, 10]}
KNOWN_CALENDAR_ABSENCES = ['20251113', '20260102']
TARGETS = ('primary_0846_0849', 'buffer_0847_0849')
COMPARISONS = (
    ('raw_future', 'zero'),
    ('controls_plus_future', 'zero'),
    ('controls_plus_future', 'controls'),
)
SOURCE_PATHS = (
    ROOT / 'data/nxt_premarket.csv',
    ROOT / 'data/universe_premarket.csv',
    RUNS / 'round1/futures_context.csv',
)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, content):
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(content, stream, ensure_ascii=False, indent=2, allow_nan=False)


def validate_protocol(protocol):
    """Fail before any fitting if an executable declaration drifts from the code."""
    expected = {
        'models': MODELS, 'diagnostic_models': DIAGNOSTIC_MODELS,
        'training': {'ridge_alpha': 1.0, 'min_train_dates': 60, 'max_train_dates': 120, 'refit_every_dates': 1},
        'inference': {'targets': list(TARGETS), 'bootstrap_config': BOOTSTRAP,
                      'test_alpha': .05, 'minimum_stratum_unique_dates': 20,
                      'comparisons_per_target': [{'candidate': c, 'comparator': b} for c, b in COMPARISONS]},
        'alternative_control': {'tail_fraction': ALT_TRIM, 'minimum_fresh_stocks': ALT_MIN_FRESH_STOCKS,
                                'fresh_endpoint_labels': ['084500', '084600']},
        'timing': {'publication_kst': '08:47:00', 'feature_last_bar': '08:46',
                   'primary_target_interval_kst': ['08:47:00', '08:50:00'],
                   'buffer_target_interval_kst': ['08:48:00', '08:50:00']},
    }
    for section, fields in expected.items():
        if section in ('models', 'diagnostic_models'):
            if protocol.get(section) != fields:
                raise ValueError('Protocol/code declaration mismatch: ' + section)
        else:
            for key, value in fields.items():
                if protocol.get(section, {}).get(key) != value:
                    raise ValueError('Protocol/code declaration mismatch: ' + section + '.' + key)


def timing_fields(day, target):
    if target not in TARGETS:
        raise ValueError('Unknown predeclared target')
    stamp = pd.Timestamp(str(day), tz='Asia/Seoul')
    publication = stamp + pd.Timedelta(hours=8, minutes=47)
    start = publication + pd.Timedelta(minutes=int(target == TARGETS[1]))
    end = stamp + pd.Timedelta(hours=8, minutes=50)
    assert publication <= start < end
    return {
        'publication_at': publication.isoformat(),
        'feature_available_at': publication.isoformat(),
        'target_interval_start': start.isoformat(),
        'target_available_at': end.isoformat(),
    }


@dataclass(frozen=True)
class TradedSnapshots:
    prices: pd.DataFrame
    observed: pd.DataFrame
    traded: pd.DataFrame
    ffilled: pd.DataFrame
    age_minutes: pd.DataFrame
    diagnostics: dict


def clean_trade_snapshots(source):
    """One price/provenance path: only finite positive-price, positive-volume trades.

    Nontraded raw prices, including changing volume-zero prices, never update the
    observed trade snapshot. Missing later trades preserve the last same-day trade.
    """
    source = source.rename(columns={'day': 'T'}).copy()
    source_dates = set(source['T'].unique())
    source_days = len(source_dates)
    source = source[source.hhmmss.isin(ALL_MINUTES)]
    if source.duplicated(['T', 'code', 'hhmmss']).any():
        raise ValueError('Duplicate stock-day-minute records require source audit')
    raw = source.pivot(index=['T', 'code'], columns='hhmmss', values='price').reindex(columns=ALL_MINUTES)
    volume = source.pivot(index=['T', 'code'], columns='hhmmss', values='volume').reindex(columns=ALL_MINUTES)
    observed = source.assign(present=True).pivot(index=['T', 'code'], columns='hhmmss', values='present')
    observed = observed.reindex(index=raw.index, columns=ALL_MINUTES).fillna(False).astype(bool)
    finite_price = np.isfinite(raw) & raw.gt(0)
    finite_volume = np.isfinite(volume) & volume.gt(0)
    traded = observed & finite_price & finite_volume
    trade_prices = raw.where(traded)
    prices = trade_prices.ffill(axis=1)
    ffilled = prices.notna() & ~traded
    last = np.maximum.accumulate(np.where(traded.to_numpy(), np.arange(50), -1), axis=1)
    ages = np.where(last >= 0, np.arange(50) - last, np.nan)
    age = pd.DataFrame(ages, index=raw.index, columns=ALL_MINUTES)
    prior_trade = prices.shift(1, axis=1)
    zero_volume_changed = observed & finite_price & volume.eq(0) & prior_trade.notna() & raw.ne(prior_trade)
    diagnostics = {
        'source_dates_all': source_days, 'raw_observed_bars': int(observed.to_numpy().sum()),
        'observed_source_dates_without_0800_0849_rows': sorted(source_dates - set(source['T'].unique())),
        'valid_trade_bars': int(traded.to_numpy().sum()),
        'raw_invalid_price_bars': int((observed & ~finite_price).to_numpy().sum()),
        'raw_zero_volume_bars': int((observed & volume.eq(0)).to_numpy().sum()),
        'raw_invalid_volume_bars': int((observed & (~np.isfinite(volume) | volume.lt(0))).to_numpy().sum()),
        'zero_volume_price_differs_from_prior_trade_bars': int(zero_volume_changed.to_numpy().sum()),
        'carry_interpretation': 'Last observed valid trade; absent trades and missing feed observations cannot be distinguished.',
    }
    return TradedSnapshots(prices, observed, traded, ffilled, age, diagnostics)


def combine_nxt_sources(development, universe):
    """Exact minute-key priority; future-only codes never delete past universe rows."""
    a = development[development.date == development.day][['day', 'code', 'hhmmss', 'price', 'volume']].copy()
    b = universe[['day', 'code', 'hhmmss', 'price', 'volume']].copy()
    keys = ['day', 'code', 'hhmmss']
    for source in (a, b):
        if source[source.hhmmss.isin(ALL_MINUTES)].duplicated(keys).any():
            raise ValueError('Duplicate minute within an input source')
    return pd.concat([a, b], ignore_index=True).drop_duplicates(keys, keep='first')


def load_local_prices():
    """Single source for prices, activity and age; no core or helper price loader."""
    types = {'day': str, 'date': str, 'code': str, 'hhmmss': str}
    a = pd.read_csv(SOURCE_PATHS[0], dtype=types)
    b = pd.read_csv(SOURCE_PATHS[1], dtype=types)
    nxt = clean_trade_snapshots(combine_nxt_sources(a, b))
    f = pd.read_csv(SOURCE_PATHS[2], dtype={'day': str, 'code': str, 'hhmmss': str})
    if f.duplicated(['day', 'code', 'hhmmss']).any() or (f.groupby('day').code.nunique() > 1).any():
        raise ValueError('Futures duplicate timestamps or mixed contracts within a day')
    future = clean_trade_snapshots(f)
    return nxt, future


def fresh_trimmed_mean(values):
    """Fixed 10% from each tail, floor(n*0.1); requires ten fresh return pairs."""
    values = np.sort(np.asarray(values, float))
    if len(values) < ALT_MIN_FRESH_STOCKS:
        return np.nan
    trim = int(np.floor(len(values) * ALT_TRIM))
    return float(values[trim:len(values)-trim].mean())


def build_features(nxt, future):
    """Cutoff-only features: post-08:46 price values/missingness are never read."""
    prices = nxt.prices
    if prices.index.names != ['T', 'code'] or prices.index.has_duplicates:
        raise ValueError('Expected unique (T, code) NXT price index')
    if not {'084500', '084600'}.issubset(prices.columns):
        raise ValueError('Missing NXT predictor endpoint columns')
    if future.prices.index.get_level_values('T').has_duplicates:
        raise ValueError('Expected one futures contract per date')
    endpoints = prices[['084500', '084600']].to_numpy(float)
    ages = nxt.age_minutes['084600'].to_numpy(float)
    valid = np.isfinite(endpoints).all(axis=1) & (endpoints > 0).all(axis=1) & np.isfinite(ages)
    selected = prices.index[valid]
    x = pd.DataFrame({
        'T': selected.get_level_values('T'), 'code': selected.get_level_values('code'),
        'price_0845': endpoints[valid, 0], 'price_0846': endpoints[valid, 1],
        'own_return_pp': (endpoints[valid, 1] / endpoints[valid, 0] - 1) * 100,
        'age_minutes': ages[valid],
    })
    for minute in ('084500', '084600'):
        for label, attribute in [('raw_observed', 'observed'), ('traded', 'traded'),
                                 ('ffilled', 'ffilled'), ('age_minutes', 'age_minutes')]:
            x[f'nxt_{minute[:4]}_{label}'] = getattr(nxt, attribute).loc[selected, minute].to_numpy()
    # A new futures shock requires actual valid trades at both known endpoints.
    # No volume-zero futures print is converted into an observed zero shock.
    good = future.traded[['084500', '084600']].all(axis=1)
    f = future.prices.loc[good, ['084500', '084600']].copy()
    for minute in ('084500', '084600'):
        for label, attribute in [('raw_observed', 'observed'), ('traded', 'traded'),
                                 ('ffilled', 'ffilled'), ('age_minutes', 'age_minutes')]:
            f[f'future_{minute[:4]}_{label}'] = getattr(future, attribute).loc[good, minute]
    f['future_return_pp'] = (f['084600'] / f['084500'] - 1) * 100
    f = f.reset_index().rename(columns={'code': 'future_contract'}).drop(columns=['084500', '084600'])
    x = x.merge(f, on='T', how='inner', validate='many_to_one')
    # Compute before future target endpoints are attached or rows selected by them.
    x['market_return_pp'] = x.groupby('T').own_return_pp.transform('median')
    x['market_feature_n_stocks'] = x.groupby('T').code.transform('size')
    fresh_pair = x.nxt_0845_traded & x.nxt_0846_traded
    fresh = x.loc[fresh_pair].groupby('T').own_return_pp
    x['market_trimmed_return_pp'] = x['T'].map(fresh.agg(fresh_trimmed_mean))
    x['market_alt_n_fresh_stocks'] = x['T'].map(fresh.size()).fillna(0).astype(int)
    x['log1p_age'] = np.log1p(x.age_minutes)
    x['stale_at_cutoff'] = x.age_minutes > 0
    if not np.isfinite(x[MODELS['controls_plus_future']].to_numpy()).all():
        raise ValueError('Nonfinite cutoff feature')
    return x.sort_values(['T', 'code']).reset_index(drop=True)


def attach_targets(features, nxt):
    """Last-observed trade snapshots, retaining the whole cutoff-defined cohort."""
    keys = pd.MultiIndex.from_frame(features[['T', 'code']])
    end = nxt.prices.reindex(keys)['084900'].to_numpy(float)
    answer = {}
    for name in TARGETS:
        start = (features.price_0846.to_numpy(float) if name == TARGETS[0]
                 else nxt.prices.reindex(keys)['084700'].to_numpy(float))
        valid = np.isfinite(start) & np.isfinite(end) & (start > 0) & (end > 0)
        if not valid.all():
            raise AssertionError('Cutoff trade must carry forward; do not select by future activity')
        target = (end / start - 1) * 100
        if not np.isfinite(target).all():
            raise ValueError('Nonfinite snapshot return requires data audit, not outcome selection')
        frame = features.copy()
        frame['actual_pp'] = target
        frame['target'] = name
        first_label = '084600' if name == TARGETS[0] else '084700'
        for endpoint, minute in [('start', first_label), ('end', '084900')]:
            for label, attribute in [('raw_observed', 'observed'), ('traded', 'traded'),
                                     ('ffilled', 'ffilled'), ('age_minutes', 'age_minutes')]:
                frame[f'target_{endpoint}_{label}'] = getattr(nxt, attribute).reindex(keys)[minute].to_numpy()
        window = ['084700', '084800', '084900'] if name == TARGETS[0] else ['084800', '084900']
        frame['target_interval_has_trade'] = nxt.traded.reindex(keys)[window].any(axis=1).to_numpy()
        frame['target_interval_no_observed_trade'] = ~frame.target_interval_has_trade
        times = {day: timing_fields(day, name) for day in frame['T'].unique()}
        for key in ('publication_at', 'feature_available_at', 'target_interval_start', 'target_available_at'):
            frame[key] = frame['T'].map(lambda day: times[day][key])
        answer[name] = frame.reset_index(drop=True)
    return answer


def coverage_report(nxt, future, features):
    """Only schema/availability counts. Never calculate labels or performance."""
    keys = pd.MultiIndex.from_frame(features[['T', 'code']])
    future_prices = nxt.prices.reindex(keys)[['084700', '084900']].to_numpy(float)
    eligible = np.isfinite(future_prices) & (future_prices > 0)
    dates = features.groupby('T').size()
    return {
        'mode': 'read_only_coverage_no_target_returns_no_fitting',
        'n_feature_rows': len(features), 'n_feature_dates': int(features['T'].nunique()),
        'n_stocks': int(features.code.nunique()),
        'fresh_feature_rows': int((~features.stale_at_cutoff).sum()),
        'stale_feature_rows': int(features.stale_at_cutoff.sum()),
        'stale_unique_dates': int(features.loc[features.stale_at_cutoff, 'T'].nunique()),
        'alt_control_available_dates': int(features.loc[features.market_trimmed_return_pp.notna(), 'T'].nunique()),
        'alt_control_fresh_stocks_min': int(features.market_alt_n_fresh_stocks.min()) if len(features) else None,
        'primary_endpoint_available_rows': int(eligible[:, 1].sum()),
        'buffer_both_endpoints_available_rows': int(eligible.all(axis=1).sum()),
        'stocks_per_date_min_median_max': [float(dates.min()), float(dates.median()), float(dates.max())] if len(dates) else [],
        'available_futures_dates': int(future.prices.index.get_level_values('T').nunique()),
        'futures_known_endpoint_nontrade_excluded_dates': int((~future.traded[['084500', '084600']].all(axis=1)).sum()),
        'primary_interval_no_observed_trade_rows': int((~nxt.traded.reindex(keys)[['084700', '084800', '084900']].any(axis=1)).sum()),
        'buffer_interval_no_observed_trade_rows': int((~nxt.traded.reindex(keys)[['084800', '084900']].any(axis=1)).sum()),
        'endpoint_provenance': {m[:4]: {
            'raw_observed_rows': int(nxt.observed.reindex(keys)[m].sum()),
            'traded_rows': int(nxt.traded.reindex(keys)[m].sum()),
            'ffilled_rows': int(nxt.ffilled.reindex(keys)[m].sum()),
            'age_median_minutes': float(nxt.age_minutes.reindex(keys)[m].median()) if len(keys) else None,
            'age_max_minutes': float(nxt.age_minutes.reindex(keys)[m].max()) if len(keys) else None,
        } for m in ('084500', '084600', '084700', '084900')},
        'nxt_raw_diagnostics': nxt.diagnostics, 'futures_raw_diagnostics': future.diagnostics,
        'known_calendar_absence_observations': [
            {'date': day, 'morning_rows_absent': day not in set(future.prices.index.get_level_values('T')),
             'source_date_without_morning_rows': day in future.diagnostics['observed_source_dates_without_0800_0849_rows']}
            for day in KNOWN_CALENDAR_ABSENCES],
        'target_interpretation': 'Last-observed traded-price snapshot return; no later observed trade is retained as carried-price change, not asserted market nonmovement.',
        'protocol_sha256': sha256(PROTOCOL_PATH), 'code_sha256': sha256(__file__),
        'helper_sha256': sha256(HELPER_PATH), 'tests_sha256': sha256(TEST_PATH),
        'timing_assumption': 'Conservative bar completion +1 minute, receipt latency unknown',
    }


def equal_date_weights(frame):
    counts = frame.groupby('T')['T'].transform('size')
    return (1.0 / counts).to_numpy(copy=True)


def predict_chronologically(frame, training):
    """Pure computation; call on real data only through the reviewed execution gate."""
    if frame.duplicated(['T', 'code']).any():
        raise ValueError('Duplicate training/evaluation stock-days')
    days = sorted(frame['T'].unique())
    minimum, maximum = training['min_train_dates'], training['max_train_dates']
    if minimum < 1 or maximum < minimum or len(days) <= minimum:
        raise ValueError('Insufficient dates or invalid predeclared training window')
    predictions, fit_rows = [], []
    for index in range(minimum, len(days)):
        day = days[index]
        train_days = days[max(0, index - maximum):index]
        train = frame[frame['T'].isin(train_days)]
        test = frame[frame['T'] == day]
        if not train['T'].max() < day:
            raise AssertionError('Training date must precede evaluation date')
        train_available = pd.to_datetime(train.target_available_at).max()
        test_publication = pd.to_datetime(test.publication_at).min()
        if not train_available < test_publication:
            raise AssertionError('Training labels unavailable at evaluation cutoff')
        output = test.copy()
        output['train_first_date'] = train['T'].min()
        output['train_last_date'] = train['T'].max()
        output['train_unique_dates'] = len(train_days)
        output['train_last_target_available_at'] = train_available.isoformat()
        for name, cols in ALL_MODELS.items():
            if name == 'zero':
                output['pred_' + name] = 0.0
                continue
            model_train = train.dropna(subset=cols)
            model_test = test.dropna(subset=cols)
            output['pred_' + name] = np.nan
            # Alternative-control availability never removes a primary row or
            # extends its training window to older dates.
            if model_train['T'].nunique() < minimum or model_test.empty:
                if name not in DIAGNOSTIC_MODELS:
                    raise ValueError('A primary model lost cutoff-eligible data')
                fit_rows.append({'target': test.target.iloc[0], 'evaluation_date': day,
                    'model': name, 'fit_status': 'diagnostic_unavailable',
                    'train_unique_dates': int(model_train['T'].nunique()), 'test_rows': len(model_test)})
                continue
            weights = equal_date_weights(model_train)
            scaler = StandardScaler().fit(model_train[cols], sample_weight=weights)
            model = Ridge(alpha=training['ridge_alpha'])
            model.fit(scaler.transform(model_train[cols]), model_train.actual_pp, sample_weight=weights)
            output.loc[model_test.index, 'pred_' + name] = model.predict(scaler.transform(model_test[cols]))
            fit_rows.append({
                'target': test.target.iloc[0], 'evaluation_date': day, 'model': name, 'fit_status': 'fitted',
                'train_first_date': model_train['T'].min(), 'train_last_date': model_train['T'].max(),
                'train_unique_dates': int(model_train['T'].nunique()), 'train_rows': len(model_train),
                'train_total_weight': float(weights.sum()), 'test_rows': len(model_test),
                'features': json.dumps(cols), 'scaler_mean': json.dumps(scaler.mean_.tolist()),
                'scaler_scale': json.dumps(scaler.scale_.tolist()),
                'standardized_coefficients': json.dumps(model.coef_.tolist()),
                'intercept_pp': float(model.intercept_),
            })
        if not np.isfinite(output[['pred_' + m for m in MODELS]].to_numpy()).all():
            raise ValueError('Nonfinite prediction')
        predictions.append(output)
    return pd.concat(predictions, ignore_index=True), pd.DataFrame(fit_rows)


def stratum_masks(frame):
    return {
        'all': np.ones(len(frame), bool), 'early': frame['T'] <= '20260430',
        'late': frame['T'] > '20260430', 'fresh_at_cutoff': ~frame.stale_at_cutoff,
        'stale_at_cutoff': frame.stale_at_cutoff,
        'before_aug12': frame['T'] < '20260812',
        'aug12_to_sep11': (frame['T'] >= '20260812') & (frame['T'] <= '20260911'),
        'from_sep14': frame['T'] >= '20260914',
    }


def block_with_mde(values, block, descriptive=False):
    result = time_patterns.block_summary(values, reps=BOOTSTRAP['reps'], block=block, seed=BOOTSTRAP['seed'])
    a = np.asarray(values, float)
    a = a[np.isfinite(a)]
    se = None
    if len(a) >= 20:
        rng = np.random.default_rng(BOOTSTRAP['seed'])
        starts = rng.integers(0, len(a), (BOOTSTRAP['reps'], int(np.ceil(len(a) / block))))
        ix = ((starts[:, :, None] + np.arange(block)) % len(a)).reshape(BOOTSTRAP['reps'], -1)[:, :len(a)]
        se = float(a[ix].mean(axis=1).std(ddof=1))
    result.update(bootstrap_se=se, approximate_mde_2_8se=2.8 * se if se is not None else None)
    if descriptive:
        result.pop('p_centered_two_sided', None)
        result['interpretation'] = 'descriptive only; no acceptance path or extra discovery'
    return result


def paired_record(target, stratum, subset, candidate, comparator, diagnostic=False):
    paired = subset.dropna(subset=['pred_' + candidate, 'pred_' + comparator])
    cols = [kind + name for kind in ('error_', 'squared_error_') for name in (candidate, comparator)]
    d = paired.groupby('T')[cols].mean().sort_index()
    delta = d['error_' + comparator] - d['error_' + candidate]
    delta_mse = d['squared_error_' + comparator] - d['squared_error_' + candidate]
    base_mae = float(d['error_' + comparator].mean()) if len(d) else None
    mean = float(delta.mean()) if len(d) else None
    record = {'target': target, 'stratum': stratum, 'candidate': candidate, 'comparator': comparator,
        'comparison_role': 'diagnostic_only' if diagnostic else 'primary_family',
        'n_rows': len(paired), 'n_dates': len(d), 'mean_improvement_pp': mean,
        'relative_improvement_percent': 100 * mean / base_mae if base_mae else None,
        'blocks': {str(b): block_with_mde(delta, b, descriptive=diagnostic) for b in BOOTSTRAP['blocks']},
        'mse_diagnostic': {'units': 'percentage_points_squared',
            'mean_improvement_pp2': float(delta_mse.mean()) if len(d) else None,
            'blocks': {str(b): block_with_mde(delta_mse, b, descriptive=True) for b in BOOTSTRAP['blocks']}}}
    mdes = [record['blocks'][str(b)]['approximate_mde_2_8se'] for b in BOOTSTRAP['blocks']]
    record['conservative_approximate_mde_pp'] = max(mdes) if all(v is not None for v in mdes) else None
    if not diagnostic:
        pvalues = [record['blocks'][str(b)]['p_centered_two_sided'] for b in BOOTSTRAP['blocks']]
        record['max_block_p'] = max(pvalues) if all(p is not None for p in pvalues) else None
    else:
        # Both nested comparisons on identical diagnostic support; no new test.
        same = paired.groupby('T')[['error_controls', 'error_controls_plus_future',
            'squared_error_controls', 'squared_error_controls_plus_future']].mean()
        record['primary_increment_on_same_support_pp'] = float((same.error_controls - same.error_controls_plus_future).mean()) if len(same) else None
        record['primary_mse_increment_on_same_support_pp2'] = float((same.squared_error_controls - same.squared_error_controls_plus_future).mean()) if len(same) else None
    return record


def summarize(predictions):
    records, metrics, daily_tables = [], [], []
    for target, frame in predictions.items():
        data = frame.copy()
        for name in ALL_MODELS:
            data['error_' + name] = abs(data.actual_pp - data['pred_' + name])
            data['squared_error_' + name] = (data.actual_pp - data['pred_' + name]) ** 2
        errors = [kind + name for kind in ('error_', 'squared_error_') for name in ALL_MODELS]
        daily = data.groupby('T')[errors].mean().sort_index().reset_index()
        daily['target'] = target
        daily['n_stocks'] = daily['T'].map(data.groupby('T').size())
        for flag in ('target_interval_no_observed_trade', 'target_end_ffilled'):
            if flag in data:
                daily[flag + '_share'] = daily['T'].map(data.groupby('T')[flag].mean())
        daily_tables.append(daily)
        for stratum, mask in stratum_masks(data).items():
            subset = data.loc[mask]
            for model in ALL_MODELS:
                available = subset[subset['pred_' + model].notna()]
                d = available.groupby('T')[['error_' + model, 'squared_error_' + model]].mean().sort_index()
                metrics.append({'target': target, 'stratum': stratum, 'model': model,
                    'n_rows': len(available), 'n_dates': len(d),
                    'mae_pp': float(d['error_' + model].mean()) if len(d) else None,
                    'mse_pp2': float(d['squared_error_' + model].mean()) if len(d) else None,
                    'no_observed_future_trade_share': float(available.target_interval_no_observed_trade.mean())
                        if len(available) and 'target_interval_no_observed_trade' in available else None})
            for candidate, comparator in COMPARISONS:
                records.append(paired_record(target, stratum, subset, candidate, comparator))
            records.append(paired_record(target, stratum, subset, 'controls_alt_plus_future', 'controls_alt', diagnostic=True))
    family = [r for r in records if r['stratum'] == 'all' and r['comparison_role'] == 'primary_family']
    if len(family) != 6:
        raise AssertionError('Predeclared six-comparison family changed')
    adjusted = time_patterns.holm([r['max_block_p'] if r['max_block_p'] is not None else 1.0 for r in family])
    for row, p in zip(family, adjusted):
        row['holm_max_block_p_six'] = p if row['max_block_p'] is not None else None
    decisions = {}
    for target in TARGETS:
        requirements = []
        for comparator in ('zero', 'controls'):
            row = next(r for r in family if r['target'] == target and r['candidate'] == 'controls_plus_future' and r['comparator'] == comparator)
            era_rows = [r for r in records if r['target'] == target and r['candidate'] == 'controls_plus_future' and
                        r['comparator'] == comparator and r['stratum'] in ('early', 'late')]
            sufficient = row['n_dates'] >= 20 and all(r['n_dates'] >= 20 for r in era_rows)
            passes = (sufficient and row['holm_max_block_p_six'] is not None and row['holm_max_block_p_six'] <= .05 and
                      all(row['blocks'][str(b)]['ci95'][0] > 0 for b in (5, 10)) and
                      all(r['mean_improvement_pp'] > 0 for r in era_rows))
            requirements.append({'comparator': comparator, 'sufficient_dates': sufficient, 'passes': bool(passes)})
        decisions[target] = {'requirements': requirements,
            'meets_historical_candidate_rule': all(r['passes'] for r in requirements)}
    decisions['primary_historical_candidate'] = decisions[TARGETS[0]]['meets_historical_candidate_rule']
    decisions['latency_robust_historical_candidate'] = all(decisions[t]['meets_historical_candidate_rule'] for t in TARGETS)
    decisions['market_measurement_diagnostics'] = {}
    for target in TARGETS:
        alt = next(r for r in records if r['target'] == target and r['stratum'] == 'all' and r['comparison_role'] == 'diagnostic_only')
        if alt['n_dates'] < 20:
            interpretation = 'insufficient alternative-control dates; no mechanism inference'
        elif alt['primary_increment_on_same_support_pp'] > 0 and alt['mean_improvement_pp'] <= 0:
            interpretation = 'measurement-sensitive increment; downgrade propagation interpretation, not a causal proof of measurement error'
        elif alt['mean_improvement_pp'] > 0 and not all(alt['blocks'][str(b)]['ci95'][0] > 0 for b in (5, 10)):
            interpretation = 'positive alternative-control estimate remains uncertain; no robust propagation claim'
        else:
            interpretation = 'descriptive alternative-control result; does not create an acceptance path or prove causation'
        decisions['market_measurement_diagnostics'][target] = interpretation
    return records, pd.DataFrame(metrics), pd.concat(daily_tables, ignore_index=True), decisions


def verify_approval(path, protocol_path=PROTOCOL_PATH, code_path=None, helper_path=HELPER_PATH, tests_path=TEST_PATH):
    approval = json.loads(Path(path).read_text())
    expected = {'protocol_sha256': sha256(protocol_path), 'code_sha256': sha256(code_path or __file__),
                'helper_sha256': sha256(helper_path), 'tests_sha256': sha256(tests_path)}
    if approval.get('experiment') != 'E46' or approval.get('approved_for_execution') is not True:
        raise PermissionError('E46 performance execution has not been approved')
    if not isinstance(approval.get('reviewer'), str) or not approval['reviewer'].strip():
        raise PermissionError('Approval must identify the reviewer')
    for key, value in expected.items():
        if approval.get(key) != value:
            raise PermissionError('Reviewed artifact changed: ' + key)
    return {'experiment': 'E46', 'approved_for_execution': True, 'reviewer': approval['reviewer'], **expected}


def create_fresh_run(path, runs_root=RUNS):
    requested = Path(path).absolute()
    root = Path(runs_root).resolve()
    if requested.is_symlink() or requested.resolve().parent != root or requested.exists():
        raise FileExistsError('Run directory must be a new direct child of workbench/runs')
    requested.mkdir(exist_ok=False)
    return requested


def execute(approval_path, run_path):
    approval = verify_approval(approval_path)
    protocol = json.loads(PROTOCOL_PATH.read_text())
    validate_protocol(protocol)
    run = create_fresh_run(run_path)
    sources = {str(path.relative_to(ROOT)): {'sha256': sha256(path), 'bytes': path.stat().st_size} for path in SOURCE_PATHS}
    write_json(run / 'protocol.json', protocol)
    snapshot = run / 'source_snapshot'; snapshot.mkdir()
    for path in (Path(__file__), HELPER_PATH, TEST_PATH):
        with (snapshot / path.name).open('xb') as stream:
            stream.write(path.read_bytes())
    manifest = {
        'experiment': 'E46', 'started_at_utc': datetime.now(timezone.utc).isoformat(),
        'classification': 'reused_historical_exploration_not_untouched_validation',
        'approval': approval, 'sources': sources,
        'packages': {name: importlib.metadata.version(name) for name in ('numpy', 'pandas', 'scikit-learn', 'scipy')},
        'python': sys.version, 'security_disposition': protocol['security_disposition'],
        'no_network_requests': True, 'fresh_run_directory': str(run),
    }
    write_json(run / 'manifest.json', manifest)
    nxt, future = load_local_prices()
    features = build_features(nxt, future)
    datasets = attach_targets(features, nxt)
    predictions, fits = {}, []
    for target, data in datasets.items():
        predictions[target], fit = predict_chronologically(data, protocol['training'])
        fits.append(fit)
    comparisons, model_metrics, daily, decisions = summarize(predictions)
    pd.concat(predictions.values(), ignore_index=True).to_csv(run / 'predictions.csv.gz', index=False, compression='gzip', mode='x')
    pd.concat(fits, ignore_index=True).to_csv(run / 'fit_metadata.csv.gz', index=False, compression='gzip', mode='x')
    daily.to_csv(run / 'daily_metrics.csv.gz', index=False, compression='gzip', mode='x')
    model_metrics.to_csv(run / 'model_metrics.csv', index=False, mode='x')
    write_json(run / 'comparisons.json', {'family': protocol['inference']['holm_family'], 'comparisons': comparisons})
    write_json(run / 'summary.json', {
        'experiment': 'E46', 'classification': protocol['classification'], 'decisions': decisions,
        'coverage': coverage_report(nxt, future, features),
        'evaluation_counts': {name: {'rows': len(p), 'dates': int(p['T'].nunique()),
                                     'first_date': p['T'].min(), 'last_date': p['T'].max(),
                                     'no_observed_future_trade_rows': int(p.target_interval_no_observed_trade.sum()),
                                     'no_observed_future_trade_share': float(p.target_interval_no_observed_trade.mean()),
                                     'target_endpoint_ffilled_share': float(p.target_end_ffilled.mean())}
                              for name, p in predictions.items()},
        'limits': [protocol['timing']['assumption'], protocol['decision_rules']['staleness'],
                   protocol['decision_rules']['null'],
                   'Fresh/stale classifications use only information available at 08:47.',
                   'Ridge fits a conditional mean under L2 loss; failure to beat zero under MAE does not establish absent conditional-mean signal. MSE is descriptive only.',
                   'E40 contemporaneous association and E46 nonoverlapping prediction answer different questions; E46 non-support does not contradict E40.',
                   'Targets are last-observed traded-price snapshot changes; no future observed trade and missing feed observations cannot be distinguished. A carried zero is not asserted actual market nonmovement.',
                   'No causal, information-efficiency, tradability, live-receipt or untouched-validation claim.'],
    })
    for path in SOURCE_PATHS:
        if sha256(path) != sources[str(path.relative_to(ROOT))]['sha256']:
            raise RuntimeError('Input changed during execution; no completed marker written')
    verify_approval(approval_path)
    output_hashes = {str(p.relative_to(run)): sha256(p) for p in run.rglob('*') if p.is_file()}
    write_json(run / 'completed.json', {'experiment': 'E46', 'completed_at_utc': datetime.now(timezone.utc).isoformat(),
                                      'source_integrity_verified': True, 'output_sha256': output_hashes})
    return run


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-reviewed-plan', action='store_true')
    parser.add_argument('--approval-file', type=Path)
    parser.add_argument('--run-dir', type=Path)
    args = parser.parse_args()
    validate_protocol(json.loads(PROTOCOL_PATH.read_text()))
    if args.execute_reviewed_plan:
        if args.approval_file is None or args.run_dir is None:
            parser.error('Performance execution requires --approval-file and a fresh --run-dir')
        print(execute(args.approval_file, args.run_dir))
    else:
        if args.approval_file is not None or args.run_dir is not None:
            parser.error('Run/approval arguments require explicit --execute-reviewed-plan')
        nxt, future = load_local_prices()
        features = build_features(nxt, future)
        print(json.dumps(coverage_report(nxt, future, features), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
