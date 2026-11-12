"""E40/E43: fixed-cohort clock diagnostics and strictly past-trained path tests.

Historical reanalysis, never an untouched holdout. Run from project root:
    python -m workbench.time_patterns
Original src/, data/, and results/ are read only. An existing output is never replaced.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "workbench/runs/round1"
SEED = 20261029
SPLIT = "20260430"


def write_json(name, obj):
    with (OUT / name).open("x", encoding="utf-8") as stream:
        json.dump(obj, stream, ensure_ascii=False, indent=2, allow_nan=False)


def matching_breaks(first, second, tolerance=10):
    """Maximum-cardinality, then minimum-distance one-to-one boundary match.

Return positions in the original arrays, not time labels. Dummy assignments allow
unmatched boundaries; unlike the old first-hit loop, no point is reused.
"""
    a, b = np.asarray(first, float), np.asarray(second, float)
    if tolerance < 0 or not np.isfinite(a).all() or not np.isfinite(b).all():
        raise ValueError("Finite times and a nonnegative tolerance are required")
    n, m = len(a), len(b)
    if not n or not m:
        return []
    unmatched = (tolerance + 1) * (n + m + 1)
    cost = np.zeros((n + m, n + m))
    dist = np.abs(a[:, None] - b[None, :])
    cost[:n, :m] = np.where(dist <= tolerance, dist, unmatched * 10)
    cost[:n, m:] = unmatched
    cost[n:, :m] = unmatched
    rows, cols = linear_sum_assignment(cost)
    return [(int(i), int(j)) for i, j in zip(rows, cols)
            if i < n and j < m and dist[i, j] <= tolerance]


def fixed_cohort(values):
    """Mask valid across every compared minute; never fill from a later minute."""
    return np.isfinite(np.asarray(values, float)).all(axis=1)


def block_summary(values, reps=1000, block=5, seed=SEED):
    """Circular moving-date-block bootstrap, one contribution per market date."""
    a = np.asarray(values, float)
    a = a[np.isfinite(a)]
    if len(a) < 20:
        return {"n_days": len(a), "mean": float(a.mean()) if len(a) else None,
                "ci95": None, "p_centered_two_sided": None,
                "status": "insufficient_data"}
    rng = np.random.default_rng(seed)
    starts = rng.integers(0, len(a), (reps, int(np.ceil(len(a) / block))))
    ix = ((starts[:, :, None] + np.arange(block)) % len(a)).reshape(reps, -1)[:, :len(a)]
    means = a[ix].mean(axis=1)
    centered = means - a.mean()
    p = (1 + np.sum(np.abs(centered) >= abs(a.mean()))) / (reps + 1)
    return {"n_days": len(a), "mean": float(a.mean()),
            "ci95": np.quantile(means, [.025, .975]).tolist(),
            "p_centered_two_sided": float(p), "status": "historical_reanalysis"}


def holm(values):
    p = np.asarray(values, float)
    order = np.argsort(p)
    result = np.empty(len(p))
    result[order] = np.minimum(1, np.maximum.accumulate(p[order] * np.arange(len(p), 0, -1)))
    return result.tolist()


def load_minutes():
    dtypes = {"day": str, "date": str, "code": str, "hhmmss": str}
    a = pd.read_csv(ROOT / "data/nxt_premarket.csv", dtype=dtypes)
    a = a[a.date == a.day][["day", "code", "hhmmss", "price", "volume"]]
    b = pd.read_csv(ROOT / "data/universe_premarket.csv", dtype=dtypes)
    b = b[~b.code.isin(a.code.unique())]
    pm = pd.concat([a, b], ignore_index=True)
    pm = pm[(pm.hhmmss >= "080000") & (pm.hhmmss <= "084900") & (pm.price > 0)]
    pm = pm.sort_values(["day", "code", "hhmmss"])
    columns = [f"08{i:02d}00" for i in range(50)]
    wide = pm.pivot_table(index=["day", "code"], columns="hhmmss", values="price", aggfunc="last")
    wide = wide.reindex(columns=columns).ffill(axis=1)
    wide.index.names = ["T", "code"]
    return wide


def daily_reference():
    ud = pd.read_csv(ROOT / "data/universe_daily.csv", dtype={"date": str, "code": str})
    ud = ud.sort_values(["code", "date"])
    dates = sorted(ud.date.unique())
    prior_market_day = dict(zip(dates[1:], dates[:-1]))
    ud["prior_date"] = ud.groupby("code").date.shift(1)
    ud["pc"] = ud.groupby("code").Close.shift(1)
    ud["y"] = ud.Open / ud.pc - 1
    # Validate price/calendar integrity, never select rows by realized gap size.
    # Normal +/-30% prices can produce abs(y)=0.30000000000000004.
    ud["valid"] = ((ud.Open > 0) & (ud.pc > 0) &
                   np.isfinite(ud.Open) & np.isfinite(ud.pc) & np.isfinite(ud.y) &
                   (ud.prior_date == ud.date.map(prior_market_day)))
    ud.loc[~ud.valid, ["pc", "y"]] = np.nan
    return ud.rename(columns={"date": "T"}).set_index(["T", "code"])[["pc", "y"]]


def slices(days):
    days = np.asarray(days, str)
    return {"all": np.ones(len(days), bool), "early": days <= SPLIT, "late": days > SPLIT,
            "without_jul14_jul29": ~np.isin(days, ["20260714", "20260729"]),
            "before_aug12": days < "20260812",
            "aug12_to_sep11": (days >= "20260812") & (days <= "20260911"),
            "from_sep14": days >= "20260914"}


def boundary_sensitivity(curve):
    """Fitted approximations only: zero-break baseline is explicitly retained."""
    import ruptures as rpt
    y = np.asarray(curve, float)
    x = np.arange(len(y))
    coef = np.polyfit(x, y, 1)
    rows = [{"n_requested": 0, "jump": 1, "boundary_start_minutes": [],
             "linear_sse": float(np.sum((y - np.polyval(coef, x)) ** 2)),
             "meaning": "no-break descriptive baseline"}]
    for jump in [1, 5]:
        for n in [1, 2, 3]:
            breaks = rpt.Binseg(model="clinear", jump=jump).fit(y[:, None]).predict(n_bkps=n)[:-1]
            rows.append({"n_requested": n, "jump": jump,
                         "boundary_start_minutes": [int(i) for i in breaks],
                         "meaning": "conditional approximation; not evidence that breaks exist"})
    return rows


def run_time(wide, ref):
    aligned = ref.reindex(wide.index)
    gaps = wide.to_numpy() / aligned.pc.to_numpy()[:, None] - 1
    y = aligned.y.to_numpy()
    # All three 10-minute transition comparisons use exactly the same stock-days.
    valid = fixed_cohort(gaps[:, 30:50]) & np.isfinite(y)
    g, y = gaps[valid], y[valid]
    keys = wide.index[valid]
    days = keys.get_level_values("T").to_numpy()
    err = np.abs(g - y[:, None]) * 100
    # Five equally spaced minute-close observations; positive slope means MAE improves.
    slope_weights = (np.arange(5) - 2) / 10
    rows = pd.DataFrame({"T": days, "code": keys.get_level_values("code")})
    for boundary in [35, 40, 45]:
        before = err[:, boundary - 5:boundary]
        after = err[:, boundary:boundary + 5]
        pre_gain = -before @ slope_weights
        post_gain = -after @ slope_weights
        rows[f"accel_{boundary}"] = post_gain - pre_gain
        rows[f"pre_gain_{boundary}"] = pre_gain
        rows[f"post_gain_{boundary}"] = post_gain
        rows[f"level_gain_{boundary}"] = (before.mean(axis=1) - after.mean(axis=1)) / 5
        move = g[:, boundary + 4] - g[:, boundary - 5]
        remaining = y - g[:, boundary - 5]
        rows[f"aligned_revision_{boundary}"] = np.sign(remaining) * move * 100
        rows[f"closer_share_{boundary}"] = (after[:, -1] < before[:, 0]).astype(float)
    rows["excess_accel_vs35"] = rows.accel_45 - rows.accel_35
    rows["excess_accel_vs40"] = rows.accel_45 - rows.accel_40
    daily = rows.drop(columns="code").groupby("T").mean().sort_index()
    records = []
    primary = ["accel_45", "excess_accel_vs35", "excess_accel_vs40"]
    for label, mask in slices(daily.index).items():
        for metric in daily.columns:
            for block in [5, 10]:
                result = block_summary(daily.loc[mask, metric], block=block)
                records.append({"slice": label, "metric": metric, "block_days": block, **result})
    for block in [5, 10]:
        chosen = [r for r in records if r['slice'] == 'all' and r['block_days'] == block and r['metric'] in primary]
        for r, p in zip(chosen, holm([r['p_centered_two_sided'] for r in chosen])):
            r['holm_p_three_primary'] = p
    # Whole 08:00-08:49 cohort for descriptive curve, separate from transition sample.
    all_fixed = fixed_cohort(gaps) & np.isfinite(aligned.y.to_numpy())
    full_err = np.abs(gaps[all_fixed] - aligned.y.to_numpy()[all_fixed, None]) * 100
    all_days = wide.index[all_fixed].get_level_values('T').to_numpy()
    curves, boundaries = [], {}
    for label, mask in {k:v for k,v in slices(all_days).items() if k in ['all','early','late']}.items():
        curve = full_err[mask].mean(axis=0)
        boundaries[label] = boundary_sensitivity(curve)
        for minute, value in enumerate(curve):
            curves.append({'slice':label,'bar_start':f'08:{minute:02d}',
                           'available_no_earlier_than':f'08:{minute+1:02d}:00',
                           'n_stock_days':int(mask.sum()),'mae_pp':float(value)})
    rows.to_csv(OUT/'time_stockday_metrics.csv.gz',index=False,mode='x',compression='gzip')
    daily.to_csv(OUT/'time_daily_metrics.csv.gz',mode='x',compression='gzip')
    pd.DataFrame(curves).to_csv(OUT/'time_fixed_curves.csv',index=False,mode='x')
    write_json('time_summary.json',{
        'experiment':'E40','classification':'historical_reanalysis_not_untouched_holdout',
        'fixed_transition_stock_days':len(rows),'fixed_transition_days':len(daily),
        'fixed_whole_curve_stock_days':int(all_fixed.sum()),
        'primary_definition':'MAE improvement slope after minus before boundary; compare 08:45 with 08:35/08:40',
        'units':'MAE slopes and acceleration: percentage points per minute; aligned_revision: percentage points',
        'bar_time_rule':'08:45 bar includes trades through 08:45:59 and is usable no earlier than 08:46:00',
        'contemporaneous_futures':'not used; causal attribution not tested',
        'primary_family':primary,'metrics':records,'conditional_boundary_sensitivity':boundaries,
        'boundary_warning':'1/2/3-break approximations do not select existence; zero-break baseline retained; no service timing optimization tested'})


def path_features(prices, prior_close):
    """Only bars 08:00 through 08:10; available at 08:11, never 08:10:00."""
    x = np.asarray(prices, float)
    pc = np.asarray(prior_close, float)
    if x.shape[1] != 11:
        raise ValueError('Expected exactly 11 completed one-minute bars')
    changes = np.diff(x, axis=1)
    net = (x[:, -1] - x[:, 0]) / pc
    travel = np.abs(changes).sum(axis=1)
    efficiency = np.divide(np.abs(x[:,-1]-x[:,0]), travel, out=np.zeros(len(x)), where=travel>0)
    reversals = []
    for row in changes:
        signs=np.sign(row[row != 0])
        reversals.append(float(np.mean(signs[1:] != signs[:-1])) if len(signs)>1 else 0.0)
    return pd.DataFrame({'path_net':net,'path_efficiency':efficiency,'path_reversals':reversals})


def temporal_path_predictions(panel, target):
    """Fixed alpha=10, expanding past dates, refit every five evaluation days.

    Target is a future residual; all scaling is fitted on training rows only.
    Date weights give each training date equal total weight.
    """
    base_cols=['g','rng','dis']
    full_cols=base_cols+['path_net','path_efficiency','path_reversals']
    days=sorted(panel.T_date.unique())
    answer=[]
    for start in range(60,len(days),5):
        evaluation=days[start:start+5]
        train=panel[panel.T_date < evaluation[0]]
        test=panel[panel.T_date.isin(evaluation)]
        assert train.T_date.max() < test.T_date.min()
        counts=train.groupby('T_date').T_date.transform('size')
        weight=(1/counts).to_numpy(copy=True);weight*=len(weight)/weight.sum()
        prediction={}
        for model,cols in [('base',base_cols),('path',full_cols)]:
            fit=make_pipeline(StandardScaler(),Ridge(alpha=10))
            fit.fit(train[cols],train[target],ridge__sample_weight=weight)
            prediction[model]=fit.predict(test[cols])
        result=test[['T_date','code','g','rng','dis','path_net','path_efficiency','path_reversals',target]].copy()
        result['baseline_residual']=prediction['base']; result['path_residual']=prediction['path']
        result['train_last_date']=train.T_date.max();result['train_days']=train.T_date.nunique()
        # Conditional diagnostics use numerical bins fixed before results, not global quantiles.
        result['gap_band']=pd.cut(result.g.abs(),[-np.inf,.005,.015,np.inf],labels=['lt0.5pct','0.5to1.5pct','ge1.5pct']).astype(str)
        answer.append(result)
    return pd.concat(answer,ignore_index=True)


def run_paths(wide, ref):
    from workbench.core import load_panel
    base=load_panel()
    if isinstance(base,tuple):base=base[0]
    if 'T' not in base.columns:base=base.reset_index()
    base=base.copy();base['T']=base['T'].astype(str);base['code']=base['code'].astype(str)
    aligned=ref.reindex(wide.index)
    prices=wide.iloc[:,:11].to_numpy();pc=aligned.pc.to_numpy()
    valid=fixed_cohort(prices)&np.isfinite(pc)
    features=path_features(prices[valid],pc[valid])
    keys=wide.index[valid];features['T']=keys.get_level_values('T');features['code']=keys.get_level_values('code')
    features['g49']=wide.iloc[valid,49].to_numpy()/pc[valid]-1
    merged=base.merge(features,on=['T','code'],how='inner',validate='one_to_one')
    merged['T_date']=merged['T']
    merged['open_residual']=merged.y-merged.g
    merged['revision_0849']=merged.g49-merged.g
    summaries=[];outcomes=[]
    for target in ['open_residual','revision_0849']:
        needed=['g','rng','dis','path_net','path_efficiency','path_reversals',target]
        panel=merged.replace([np.inf,-np.inf],np.nan).dropna(subset=needed)
        pred=temporal_path_predictions(panel,target)
        pred['target_name']=target
        pred['error_base']=abs(pred[target]-pred.baseline_residual)*100
        pred['error_path']=abs(pred[target]-pred.path_residual)*100
        pred['error_no_correction']=abs(pred[target])*100
        pred['improvement']=pred.error_base-pred.error_path
        daily=pred.groupby('T_date')[['error_base','error_path','improvement','error_no_correction']].mean().sort_index()
        parts={**slices(daily.index)}
        records=[]
        for label,mask in parts.items():
            for block in [5,10]:
                records.append({'slice':label,'block_days':block,
                    'mae_no_correction_pp':float(daily.loc[mask,'error_no_correction'].mean()) if mask.any() else None,
                    'mae_base_pp':float(daily.loc[mask,'error_base'].mean()) if mask.any() else None,
                    'mae_path_pp':float(daily.loc[mask,'error_path'].mean()) if mask.any() else None,
                    **block_summary(daily.loc[mask,'improvement'],block=block)})
        conditional=[]
        for band,g in pred.groupby('gap_band'):
            d=g.groupby('T_date')[['error_no_correction','error_base','error_path','improvement']].mean()
            conditional.append({'gap_band':band,'n_rows':len(g),'n_days':len(d),
                'mae_no_correction_pp':float(d.error_no_correction.mean()),
                'mae_base_pp':float(d.error_base.mean()),'mae_path_pp':float(d.error_path.mean()),
                **block_summary(d.improvement,block=5)})
        summaries.append({'target':target,'rows':len(pred),'days':len(daily),
            'first_evaluation':daily.index.min(),'last_evaluation':daily.index.max(),
            'metrics':records,'predeclared_gap_band_diagnostics':conditional})
        outcomes.append(pred)
    for block in [5,10]:
        allrows=[r for s in summaries for r in s['metrics'] if r['slice']=='all' and r['block_days']==block]
        for r,p in zip(allrows,holm([r['p_centered_two_sided'] for r in allrows])):r['holm_p_two_targets']=p
    pd.concat(outcomes,ignore_index=True).to_csv(OUT/'paths_predictions.csv.gz',index=False,mode='x',compression='gzip')
    write_json('paths_summary.json',{'experiment':'E43','classification':'historical_reanalysis_not_untouched_holdout',
        'cutoff':'08:11:00 KST; bars through 08:10:59',
        'features':'first-to-last net move, absolute net/travel efficiency, nonzero change sign reversal fraction',
        'baseline_features':['g','rng','dis'],'model':'StandardScaler training only + Ridge(alpha=10), residual target, expanding dates, min60 days, refit every5 days, equal-date training weights',
        'thresholds':'absolute gap bands 0.5% and 1.5%, fixed before results',
        'outcomes':summaries,'warnings':['History already inspected. This is chronological reanalysis, not new untouched evidence.',
        'All candidate additions are tested jointly as one path block; a null does not establish absence of nonlinear path information.',
        '08:49 is an outcome label only and never an input. No causal claim.']})


def validate_saved_outputs():
    """Baseline and reporting audit of saved predictions; never retrain or overwrite.

    The first summary mixed row-weighted conditional MAE with date-weighted CIs.
    This audit retains it and supplies consistent equal-date conditional metrics.
    No feature definition, threshold, prediction, or primary p-value is changed.
    """
    saved=OUT/'paths_predictions.csv.gz'
    pred=pd.read_csv(saved,dtype={'T_date':str,'code':str,'train_last_date':str})
    records=[]
    for target,p in pred.groupby('target_name'):
        assert not p.duplicated(['T_date','code']).any()
        assert (p.train_last_date < p.T_date).all()
        daily=p.groupby('T_date')[['error_no_correction','error_base','error_path']].mean().sort_index()
        comparisons={'raw_minus_base':daily.error_no_correction-daily.error_base,
                     'raw_minus_path':daily.error_no_correction-daily.error_path,
                     'base_minus_path':daily.error_base-daily.error_path}
        metrics=[]
        for label,mask in slices(daily.index).items():
            for block in [5,10]:
                for name,series in comparisons.items():
                    metrics.append({'slice':label,'block_days':block,'comparison':name,
                        'mae_raw_pp':float(daily.loc[mask,'error_no_correction'].mean()),
                        'mae_base_pp':float(daily.loc[mask,'error_base'].mean()),
                        'mae_path_pp':float(daily.loc[mask,'error_path'].mean()),
                        **block_summary(series.loc[mask],block=block)})
        bands=[]
        for band,b in p.groupby('gap_band'):
            d=b.groupby('T_date')[['error_no_correction','error_base','error_path','improvement']].mean().sort_index()
            bands.append({'gap_band':band,'rows':len(b),'days':len(d),
                'mae_raw_pp':float(d.error_no_correction.mean()),
                'mae_base_pp':float(d.error_base.mean()),'mae_path_pp':float(d.error_path.mean()),
                'path_increment_over_base':block_summary(d.improvement,block=5),
                'path_increment_over_raw':block_summary(d.error_no_correction-d.error_path,block=5)})
        records.append({'target':target,'rows':len(p),'days':len(daily),'metrics':metrics,
                        'equal_date_gap_band_diagnostics':bands})
    write_json('paths_validation.json',{
        'experiment':'E43','created_at':datetime.now(timezone.utc).isoformat(),
        'purpose':'same-row/date-weighted no-correction baseline and reporting correction',
        'prediction_sha256':hashlib.sha256(saved.read_bytes()).hexdigest(),
        'code_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'changes':'predictions unchanged; conditional displayed MAEs corrected to equal-date weights; raw benchmark exposed',
        'evaluation_unit':'mean over stocks within date, then mean over dates',
        'raw_definition':{'open_residual':'predict actual opening gap with observed 08:10 minute close gap',
                          'revision_0849':'predict zero subsequent change'},
        'chronological_order_verified':True,'unique_stockday_per_target_verified':True,
        'outcomes':records,
        'interpretation':{'open_residual':'small historical increment only; latest 27-day slice does not support persistence',
                          'revision_0849':'not supported against zero-change baseline despite gain over fitted three-variable baseline'},
        'warnings':['Original paths_summary.json kept unchanged; its conditional MAE display was row-weighted while CIs were date-weighted. Use this file for conditional metrics.',
                    'Only stocks observed by 08:00 are eligible for complete 08:00-08:10 path features.',
                    'No comparison here is untouched future validation; post-Sep14 change cannot establish an institutional cause.',
                    'Added raw comparisons are benchmark audit sensitivities, not additional preregistered discoveries.']})
    ts=json.loads((OUT/'time_summary.json').read_text())
    curve=ts['conditional_boundary_sensitivity']
    matches=[]
    for jump in [1,5]:
        for n in [1,2,3]:
            early=next(r['boundary_start_minutes'] for r in curve['early'] if r['jump']==jump and r['n_requested']==n)
            late=next(r['boundary_start_minutes'] for r in curve['late'] if r['jump']==jump and r['n_requested']==n)
            pairs=matching_breaks(early,late,tolerance=10)
            matches.append({'jump':jump,'n_requested':n,'early':early,'late':late,
                'pairs':[[early[i],late[j]] for i,j in pairs],
                'unique_early':len({i for i,j in pairs})==len(pairs),
                'unique_late':len({j for i,j in pairs})==len(pairs)})
    write_json('time_matching_validation.json',{'tolerance_minutes':10,
        'method':'Hungarian maximum cardinality then minimum total distance, each boundary used once',
        'conditional_fitted_boundaries_only':True,'results':matches})


def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--phase',choices=['all','time','paths','validation'],default='all')
    phase=parser.parse_args().phase
    OUT.mkdir(parents=True,exist_ok=True)
    if phase=='validation':
        validate_saved_outputs()
        print('Saved-output audits completed:',OUT)
        return
    declaration={'registered_at':datetime.now(timezone.utc).isoformat(),
        'code_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'experiments':['E40','E43'],'seed':SEED,'bootstrap_reps':1000,'blocks':[5,10],
        'time_comparisons':'08:45 acceleration vs zero and vs 08:35/08:40 equal five-minute slopes; common08:30-49 cohort; three primary Holm',
        'time_slices':['all','early<=20260430','late','without20260714/20260729','before20260812','20260812-20260911','from20260914'],
        'paths':['net first-last','abs net / cumulative absolute change','nonzero sign reversal fraction'],
        'path_baseline':['g','rng','dis'],'targets':['09:00 opening residual','08:49 residual revision'],
        'model':'fixed Ridgealpha10; min60 prior dates; refit every5 days; equaldate weights; train-only standardization',
        'gap_bands':[.005,.015],'claims':'historical candidates only; no cause or optimal publication time established'}
    if phase!='paths':
        write_json('time_paths_declaration.json',declaration)
    elif not (OUT/'time_paths_declaration.json').exists():
        raise RuntimeError('Register and run time phase before paths phase')
    wide=load_minutes();ref=daily_reference()
    if phase in ['all','time']:run_time(wide,ref)
    if phase in ['all','paths']:run_paths(wide,ref)
    print('E40/E43 outputs completed:',OUT)


if __name__=='__main__':main()
