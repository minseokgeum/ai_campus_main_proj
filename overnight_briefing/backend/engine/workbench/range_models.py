"""E39 fixed historical reanalysis: same-row interval comparisons.

Strict comparison: expanding fit dates, latest 20 earlier dates reserved solely
for calibration, >=60 fitting dates. Log absolute standardized residuals use
fixed Huber IRLS (1.35, 8 iterations), train-only 1/99 feature winsorization.
Calibration is date-balanced empirical 80% coverage, not an IID conformal claim.
Original-style OLS/in-sample calibration replication is reported separately.
"""
from __future__ import annotations
import argparse, hashlib, json, sys, time
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'workbench' / 'runs' / 'round1'
SEED = 20261029
ALPHA = .2
SPLIT = '20260430'
Z06 = ['mon','hol','exp','fomc','cpi','nfp','vix','dvix','mreg','lsd','nvz','x_pre','x_post','ax','r2','kq','tv','flow']
FEATURES = {'ewma': [], 'rng': ['rng'], 'dis': ['dis'], 'rng_dis': ['rng','dis'], 'full': Z06+['zv','rng','drift','dis','idio']}


def interval_score(y, center, halfwidth, alpha=ALPHA):
    if not 0 < alpha < 1: raise ValueError('alpha must lie between zero and one')
    y, center, h = np.asarray(y), np.asarray(center), np.asarray(halfwidth)
    if np.any(h < 0): raise ValueError('halfwidth must be nonnegative')
    return 2*h + (2/alpha)*np.maximum(np.abs(y-center)-h, 0)


def require_availability(cutoff):
    parts = [int(x) for x in cutoff.split(':')]
    parts += [0]*(3-len(parts))
    if tuple(parts) < (8,11,0):
        raise ValueError('08:10 start-labelled NXT bar is available from 08:11:00')


def split_history(frame, day, calibration_days=20, minimum_train_days=60):
    days = sorted(frame.loc[frame['T'] < day, 'T'].unique())
    if len(days) < calibration_days + minimum_train_days: return None
    train_days, cal_days = days[:-calibration_days], days[-calibration_days:]
    train = frame[frame['T'].isin(train_days)]
    cal = frame[frame['T'].isin(cal_days)]
    assert set(train['T']).isdisjoint(set(cal['T']))
    assert max(train_days) < min(cal_days) < day
    return train, cal


def day_weights(frame):
    w = 1 / frame.groupby('T')['T'].transform('size').to_numpy(float)
    return w / np.mean(w)


def weighted_quantile(values, weights, q):
    v, w = np.asarray(values,float), np.asarray(weights,float)
    ok=np.isfinite(v)&np.isfinite(w)&(w>0)
    if not np.any(ok): raise ValueError('no finite calibration values')
    v,w=v[ok],w[ok]; o=np.argsort(v);v,w=v[o],w[o]
    return float(v[min(np.searchsorted(np.cumsum(w)/w.sum(),q,side='left'),len(v)-1)])


def make_scale_model(train, columns, robust=True, date_weights=True):
    """No calibration targets or features are accessed here."""
    if not columns:
        return lambda d: d.sd08.to_numpy(float)
    X=train[columns].replace([np.inf,-np.inf],np.nan)
    lo,hi=X.quantile(.01),X.quantile(.99)
    X=X.clip(lo,hi,axis=1)
    mu,sd=X.mean(),X.std().replace(0,1).fillna(1)
    def design(d):
        z=((d[columns].replace([np.inf,-np.inf],np.nan).clip(lo,hi,axis=1)-mu)/sd).fillna(0).to_numpy(float)
        return np.column_stack([np.ones(len(d)),z])
    A=design(train)
    target=np.log(np.abs(train.y.to_numpy()-train.g.to_numpy())/train.sd08.to_numpy()+1e-3)
    base=day_weights(train) if date_weights else np.ones(len(train))
    weights=base.copy(); beta=np.zeros(A.shape[1])
    for _ in range(8 if robust else 1):
        root=np.sqrt(weights)
        beta=np.linalg.lstsq(A*root[:,None],target*root,rcond=None)[0]
        if robust:
            err=target-A@beta
            scale=max(float(np.median(np.abs(err-np.median(err)))/.67448975),1e-6)
            weights=base*np.minimum(1,1.35*scale/np.maximum(np.abs(err),1e-12))
    return lambda d: d.sd08.to_numpy(float)*np.exp(np.clip(design(d)@beta,-8,8))


def bootstrap_mean(values, block, reps=1000, seed=SEED):
    x=np.asarray(values,float);x=x[np.isfinite(x)];n=len(x)
    if n < 20: return {'n_days':n,'mean':float(x.mean()) if n else None,'p':None,'ci_low':None,'ci_high':None}
    rng=np.random.default_rng(seed+block)
    starts=rng.integers(0,n,size=(reps,int(np.ceil(n/block))))
    indices=((starts[:,:,None]+np.arange(block))%n).reshape(reps,-1)[:,:n]
    means=x[indices].mean(axis=1); observed=x.mean()
    p=(1+np.sum(np.abs(means-observed)>=abs(observed)))/(reps+1)
    ci=np.quantile(means,[.025,.975])
    return {'n_days':n,'mean':float(observed),'p':float(p),'ci_low':float(ci[0]),'ci_high':float(ci[1])}


def holm(pvalues):
    p=np.asarray(pvalues,float);order=np.argsort(p);out=np.empty(len(p));running=0
    for rank,i in enumerate(order):
        running=max(running,min(1.,p[i]*(len(p)-rank)));out[i]=running
    return out


def compare_predictions(predictions, mode):
    records=[];conditions=[]
    for model in FEATURES:
        h=predictions[model].to_numpy();err=np.abs(predictions.y-predictions.g)
        score=interval_score(predictions.y,predictions.g,h)*100
        base=interval_score(predictions.y,predictions.g,predictions.ewma)*100
        d=pd.Series(base-score,index=predictions.index).groupby(predictions['T']).mean()
        daily_score=pd.Series(score,index=predictions.index).groupby(predictions['T']).mean()
        daily_base=pd.Series(base,index=predictions.index).groupby(predictions['T']).mean()
        row={'mode':mode,'model':model,'rows':len(predictions),'days':predictions['T'].nunique(),
             'score':daily_score.mean(),'base_score':daily_base.mean(),'relative_improvement':d.mean()/daily_base.mean(),
             'improvement':d.mean(),'early':d[d.index<=SPLIT].mean(),'late':d[d.index>SPLIT].mean(),
             'coverage':pd.Series(err.to_numpy()<=h,index=predictions.index).groupby(predictions['T']).mean().mean(),
             'width_pp':pd.Series(2*h*100,index=predictions.index).groupby(predictions['T']).mean().mean()}
        for b in [5,10]:
            for k,v in bootstrap_mean(d,b).items():row[f'block{b}_{k}']=v
        exclude=d[~d.index.isin(['20260714','20260729'])]
        row['exclude_july_improvement']=exclude.mean()
        for b in [5,10]:row[f'exclude_july_block{b}_p']=bootstrap_mean(exclude,b)['p']
        records.append(row)
        masks={'all':np.ones(len(predictions),bool),'rng_high20':predictions.feature_rng>=predictions.rng_q80,'rng_other':predictions.feature_rng<predictions.rng_q80,
               'dis_high20':predictions.feature_dis>=predictions.dis_q80,'dis_other':predictions.feature_dis<predictions.dis_q80}
        for regime in ['low','middle','high']:masks[f'regime:{regime}']=predictions.regime==regime
        for group in sorted(predictions.group.dropna().unique()):masks[f'sector:{group}']=predictions.group==group
        for label,mask in masks.items():
            q=predictions.loc[mask];ids=np.flatnonzero(np.asarray(mask));n=q['T'].nunique()
            if n<20:continue
            conditions.append({'mode':mode,'model':model,'condition':label,'rows':len(q),'days':n,
              'coverage':pd.Series((err.to_numpy()[ids]<=h[ids]).astype(float),index=q.index).groupby(q['T']).mean().mean(),
              'width_pp':pd.Series(2*h[ids]*100,index=q.index).groupby(q['T']).mean().mean(),
              'score':pd.Series(score[ids],index=q.index).groupby(q['T']).mean().mean()})
    table=pd.DataFrame(records);others=table.model!='ewma'
    # Main family contains four alternatives; use less favourable block p.
    table.loc[others,'holm_p']=holm(table.loc[others,['block5_p','block10_p']].max(axis=1).to_numpy())
    table['label']='not_supported'
    ok=(table.relative_improvement>=.01)&(table.early>0)&(table.late>0)&(table.holm_p<.05)
    table.loc[ok,'label']='historical_candidate'
    table.loc[table.model=='ewma','label']='reference'
    return table,pd.DataFrame(conditions)


def load_data():
    from workbench.core import load_panel
    P=load_panel(cutoff='08:11').copy()
    require_availability('08:11')
    S=P[P.nxt & ~P.dev].dropna(subset=['sd06','F2','g','zv','sd08']).copy()
    groups=pd.read_csv(ROOT/'results/sector_study_predictions.csv',dtype={'T':str,'code':str})[['T','code','group']]
    if 'group' not in S:S=S.merge(groups,on=['T','code'],how='left',validate='one_to_one')
    return S.sort_values(['T','code']).reset_index(drop=True)


def prediction_feature_record(test):
    keep=['T','code','y','g','sd08','rng','dis','mreg','group']
    return test[keep].rename(columns={'rng':'feature_rng','dis':'feature_dis'}).copy()


def predict(frame, strict=True):
    pieces=[]
    for day in sorted(frame['T'].unique()):
        hist=frame[frame['T']<day]
        if strict:
            split=split_history(frame,day)
            if split is None:continue
            train,cal=split
        else:
            if hist['T'].nunique()<60:continue
            train=cal=hist
        test=frame[frame['T']==day].copy()
        row=prediction_feature_record(test)
        row['rng_q80']=train.rng.quantile(.8);row['dis_q80']=train.dis.quantile(.8)
        rlo,rhi=train.mreg.quantile([1/3,2/3]).values
        row['regime']=np.where(test.mreg<rlo,'low',np.where(test.mreg>rhi,'high','middle'))
        row['train_end']=train['T'].max();row['cal_start']=cal['T'].min();row['cal_end']=cal['T'].max()
        row['train_days']=train['T'].nunique();row['cal_days']=cal['T'].nunique()
        for name,features in FEATURES.items():
            scale=make_scale_model(train,features,robust=strict,date_weights=strict)
            residual=np.abs(cal.y-cal.g).to_numpy()/scale(cal)
            multiplier=weighted_quantile(residual,day_weights(cal),1-ALPHA) if strict else float(np.quantile(residual,1-ALPHA))
            row[name]=multiplier*scale(test)
        pieces.append(row)
    if not pieces:raise ValueError('not enough dates for calibration-separated evaluation')
    return pd.concat(pieces,ignore_index=True)


def main():
    start=time.monotonic();OUT.mkdir(parents=True,exist_ok=True)
    targets=[OUT/'range_summary.csv',OUT/'range_conditional.csv',OUT/'range_metadata.json',OUT/'range_strict_predictions.csv.gz',OUT/'range_replication_predictions.csv.gz']
    if any(p.exists() for p in targets):raise FileExistsError('round1 range outputs already exist; use a new round directory')
    frame=load_data();summaries=[];conditions=[]
    for strict,mode in [(False,'original_style_replication'),(True,'strict_disjoint_calibration')]:
        pred=predict(frame,strict);name='strict' if strict else 'replication'
        pred.to_csv(OUT/f'range_{name}_predictions.csv.gz',index=False,compression='gzip')
        s,c=compare_predictions(pred,mode);summaries.append(s);conditions.append(c)
        print(mode,s[['model','score','coverage','holm_p','label']].to_json(orient='records'),flush=True)
    summary=pd.concat(summaries);conditional=pd.concat(conditions)
    summary.to_csv(targets[0],index=False);conditional.to_csv(targets[1],index=False)
    meta={'experiment':'E39','classification':'historical_reanalysis_not_untouched_holdout','future_validation_required':True,
          'cutoff':'08:11:00','alpha':ALPHA,'fit_min_days':60,'calibration_days':20,'strict_first_eligible_after_unique_dates':80,
          'bootstrap_reps':1000,'blocks':[5,10],'main_family':['rng','dis','rng_dis','full'],
          'calibration':'date-balanced empirical quantile; no conditional or finite-sample guarantee',
          'original_style_replication':'OLS, pooled in-sample quantile, corrected core data; not strict out-of-fit calibration',
          'robust_fit':'8-iteration Huber IRLS epsilon1.35 on log residual; train-only1/99 winsor; equal total weight per date',
          'runtime_seconds':time.monotonic()-start,'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'summary':json.loads(summary.to_json(orient='records'))}
    targets[2].write_text(json.dumps(meta,ensure_ascii=False,indent=2,default=float))
    print('range runtime seconds',meta['runtime_seconds'],flush=True)

def repair_saved_feature_columns():
    """Preserve initial evidence; repair output-column collision without refitting."""
    frame=load_data(); tables=[];conditions=[]; checks=[]
    features=frame[['T','code','rng','dis']].rename(columns={'rng':'feature_rng','dis':'feature_dis'})
    for name,mode in [('replication','original_style_replication'),('strict','strict_disjoint_calibration')]:
        path=OUT/f'range_{name}_predictions.csv.gz'
        pred=pd.read_csv(path,dtype={'T':str,'code':str,'train_end':str,'cal_start':str,'cal_end':str})
        repaired=pred.merge(features,on=['T','code'],how='left',validate='one_to_one')
        assert len(repaired)==len(pred) and repaired[['feature_rng','feature_dis']].notna().all().all()
        output=OUT/f'range_{name}_predictions_corrected.csv.gz'
        if output.exists(): raise FileExistsError(output)
        repaired.to_csv(output,index=False,compression='gzip')
        s,c=compare_predictions(repaired,mode);tables.append(s);conditions.append(c)
        checks.append({'mode':mode,'rows':len(pred),'prediction_values_unchanged':bool(np.allclose(pred[list(FEATURES)],repaired[list(FEATURES)]))})
    summary=pd.concat(tables);conditional=pd.concat(conditions)
    for fn,df in [('range_summary_corrected.csv',summary),('range_conditional_corrected.csv',conditional)]:
        if (OUT/fn).exists(): raise FileExistsError(fn)
        df.to_csv(OUT/fn,index=False)
    record={'correction':'initial output reused rng/dis names for model halfwidths and raw features; fitting and global scores unaffected, conditional masks invalid',
            'fix':'source uses feature_rng/feature_dis; restored features by exact T/code join; no refit or result selection',
            'supersedes':['range_conditional.csv','range_strict_predictions.csv.gz','range_replication_predictions.csv.gz'],
            'canonical_summary':'range_summary_corrected.csv','canonical_conditional':'range_conditional_corrected.csv',
            'canonical_predictions':['range_strict_predictions_corrected.csv.gz','range_replication_predictions_corrected.csv.gz'],
            'checks':checks,'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'classification':'historical_reanalysis_not_untouched_holdout'}
    (OUT/'range_correction.json').write_text(json.dumps(record,ensure_ascii=False,indent=2))
    print(json.dumps(record,ensure_ascii=False),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--repair-saved-features',action='store_true');args=parser.parse_args()
    repair_saved_feature_columns() if args.repair_saved_features else main()
