"""Starting 1RM estimates for a user with no logged data.

Data: pre-training group-mean 1RMs from Pelland et al. and Steele et al.
(strength_rows.py). Per exercise, extreme values are removed (|log rel −
median| > 3 MAD; mostly unit errors such as lb entered as kg). Model:

    log(1RM / body mass) − gap_region·share_male = a_exercise + β_trained·trained
                                                   + β_age·(age − 25)/10 + e

The sex gap is not estimable from group-level %male (ecological confounding;
the free coefficient was 0.17, 95% CI −0.16 to 0.41), so it is taken from
OpenPowerlifting: the male−female difference in median log(lift/bodyweight)
for bench (upper-body exercises) and squat (lower-body exercises).

fitted by n-weighted least squares, study-clustered bootstrap for intervals.
Predictive 1σ for an individual = sqrt(residual between-group variance +
median within-group CV² for that exercise).

Deadlift has 2 trial measurements, so it is also estimated from squat using
the OpenPowerlifting median deadlift/squat ratio by sex (raw, drug-tested).
"""
import json, sys, zipfile
import numpy as np, pandas as pd
sys.path.insert(0, 'scripts')
from common import RNG, summary
from strength_rows import all_rows

def clean(r):
    keep = []
    for ex, g in r.groupby('exercise'):
        lr = np.log(g['rel']); med = lr.median(); mad = 1.4826 * np.median(np.abs(lr - med))
        keep.append(g[np.abs(lr - med) <= 3 * max(mad, 0.05)])
    r = pd.concat(keep)
    r = r.assign(age=r['age'].fillna(r['age'].median()))
    return r

UPPER = {'barbell_bench_press', 'biceps_curl', 'cable_row', 'chest_press_machine', 'dumbbell_shoulder_press', 'lat_pulldown',
         'lateral_raise', 'shoulder_press_machine', 'triceps_pushdown'}
GAP = {}

def design(r, exercises):
    X = np.column_stack([(r['exercise'] == e).astype(float) for e in exercises] + [r['trained'], (r['age'] - 25) / 10])
    return X

def offset(r):
    return r['male'] * np.where(r['exercise'].isin(UPPER), GAP['upper'], GAP['lower'])

def fit(r, exercises):
    X = design(r, exercises); y = np.log(r['rel'].to_numpy()) - offset(r).to_numpy(); w = r['n'].fillna(10).to_numpy()
    sw = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(X * sw[:, None], y * sw, rcond=None)
    resid = y - X @ beta
    between_sd = float(np.sqrt(np.average(resid**2, weights=w)))
    return beta, between_sd

def opl():
    with zipfile.ZipFile('data/openipf-latest.zip') as z:
        name = next(n for n in z.namelist() if n.endswith('.csv'))
        with z.open(name) as f:
            o = pd.read_csv(f, usecols=['Sex', 'Event', 'Equipment', 'BodyweightKg', 'Best3SquatKg', 'Best3BenchKg', 'Best3DeadliftKg'], low_memory=False)
    return o[(o['Event'] == 'SBD') & (o['Equipment'] == 'Raw') & (o['Best3SquatKg'] > 0) & (o['Best3DeadliftKg'] > 0)
             & (o['Best3BenchKg'] > 0) & (o['BodyweightKg'] > 0)]

if __name__ == '__main__':
    o = opl()
    med = lambda col, sex: float(np.log(o.loc[o['Sex'] == sex, col] / o.loc[o['Sex'] == sex, 'BodyweightKg']).median())
    GAP['upper'] = med('Best3BenchKg', 'M') - med('Best3BenchKg', 'F')
    GAP['lower'] = med('Best3SquatKg', 'M') - med('Best3SquatKg', 'F')
    r = clean(all_rows())
    counts = r['exercise'].value_counts()
    exercises = sorted(counts.index)
    beta, between_sd = fit(r, exercises)
    studies = r['study'].unique(); boot = []
    for _ in range(500):
        pick = RNG.choice(studies, len(studies))
        b = pd.concat([r[r['study'] == s] for s in pick])
        if set(b['exercise']) >= set(exercises):
            boot.append(np.append(*fit(b, exercises)))
    boot = np.array(boot)
    cv = r.assign(cv=r['sd'] / r['one_rm']).groupby('exercise')['cv'].median()
    out = {'source': 'Pelland et al. (OSF 6z3xu) and Steele et al. 2023 pre-training 1RMs; log(1RM/body mass) regression',
           'n_groups': int(len(r)), 'between_group_sd': between_sd,
           'sex_gap_log': {'upper': GAP['upper'], 'lower': GAP['lower'], 'source': 'OpenPowerlifting raw SBD: male−female median log(lift/bodyweight), bench and squat'},
           'beta_trained': summary(boot[:, len(exercises)]) | {'point': float(beta[len(exercises)])},
           'beta_age_per_decade': summary(boot[:, len(exercises) + 1]) | {'point': float(beta[len(exercises) + 1])},
           'exercises': {}}
    for i, e in enumerate(exercises):
        within = float(cv.get(e, np.nan))
        out['exercises'][e] = {'n_groups': int(counts[e]), 'log_rel_intercept': float(beta[i]),
                               'intercept_se': float(np.std(boot[:, i])), 'within_group_cv': within,
                               'predictive_sd': float(np.sqrt(between_sd**2 + within**2 + np.var(boot[:, i])))}
    lr = np.log(o['Best3DeadliftKg'] / o['Best3SquatKg'])
    out['opl_deadlift_to_squat'] = {sex: {'median_ratio': float(np.exp(lr[o['Sex'] == sex].median())),
                                          'log_sd': float(lr[o['Sex'] == sex].std()), 'n': int((o['Sex'] == sex).sum())} for sex in ('M', 'F')}
    json.dump(out, open('output/strength_levels.json', 'w'), indent=2)
    print(f"groups={out['n_groups']} between-group sd={between_sd:.3f}  sex gap upper={GAP['upper']:.2f} lower={GAP['lower']:.2f}  "
          f"trained={out['beta_trained']['point']:.2f} [{out['beta_trained']['low95']:.2f},{out['beta_trained']['high95']:.2f}]  "
          f"age/decade={out['beta_age_per_decade']['point']:.3f} [{out['beta_age_per_decade']['low95']:.3f},{out['beta_age_per_decade']['high95']:.3f}]")
    for e, f in out['exercises'].items():
        male_untr = np.exp(f['log_rel_intercept'] + (GAP['upper'] if e in UPPER else GAP['lower'])) * 90.6
        print(f"  {e:24s} groups={f['n_groups']:3d}  untrained 25y man @90.6kg: {male_untr:6.1f} kg  1σ(log)={f['predictive_sd']:.2f}  within CV={f['within_group_cv']:.2f}")
    print('OPL deadlift/squat', out['opl_deadlift_to_squat'])
