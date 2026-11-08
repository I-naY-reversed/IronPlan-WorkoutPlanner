"""Within-lifter spread of log ratios between the competition lifts (OpenIPF, raw SBD).

How well does one known lift predict another for the same person? Population starting estimates
have a log-sd of about 0.5; given a lifter's own squat, their deadlift is known to the spread of
log(deadlift/squat). Also reported by experience proxy (first meet vs later) and bodyweight-adjusted
residual correlations, to check the ratio spread is not an artefact of trained lifters.
"""
import json
import zipfile

import numpy as np
import pandas as pd

with zipfile.ZipFile('data/openipf-latest.zip') as z:
    name = next(n for n in z.namelist() if n.endswith('.csv'))
    with z.open(name) as f:
        o = pd.read_csv(f, usecols=['Name', 'Sex', 'Event', 'Equipment', 'Date', 'BodyweightKg', 'Best3SquatKg', 'Best3BenchKg', 'Best3DeadliftKg'], low_memory=False)
o = o[(o['Event'] == 'SBD') & (o['Equipment'] == 'Raw') & (o['Best3SquatKg'] > 0) & (o['Best3BenchKg'] > 0) & (o['Best3DeadliftKg'] > 0) & (o['BodyweightKg'] > 0)]
o = o.sort_values('Date')
o['meet_no'] = o.groupby(['Name', 'Sex']).cumcount()
first = o[o['meet_no'] == 0]

S, B, D, W = (np.log(first[c]) for c in ['Best3SquatKg', 'Best3BenchKg', 'Best3DeadliftKg', 'BodyweightKg'])
out = {}
for sex in ['M', 'F']:
    m = first['Sex'] == sex
    r = {}
    for a, b, an, bn in [(D, S, 'deadlift', 'squat'), (B, S, 'bench', 'squat'), (B, D, 'bench', 'deadlift')]:
        lr = (a - b)[m]
        r[f'{an}/{bn}'] = {'median_ratio': float(np.exp(lr.median())), 'log_sd': float(lr.std()), 'log_mad_sd': float(1.4826 * (lr - lr.median()).abs().median())}
    # Residuals after log bodyweight: the person-level strength factor shared across lifts.
    res = {}
    for n, v in [('squat', S), ('bench', B), ('deadlift', D)]:
        y, x = v[m], W[m]
        k = np.polyfit(x, y, 1)
        res[n] = y - np.polyval(k, x)
    R = np.corrcoef([res['squat'], res['bench'], res['deadlift']])
    r['residual_sd_after_bodyweight'] = {n: float(res[n].std()) for n in res}
    r['residual_corr'] = {'squat_bench': float(R[0, 1]), 'squat_deadlift': float(R[0, 2]), 'bench_deadlift': float(R[1, 2])}
    r['n_lifters'] = int(m.sum())
    out[sex] = r
print(json.dumps(out, indent=1))
json.dump(out, open('output/cross_lift.json', 'w'), indent=1)

# Calibration check: fit the ratio on half the lifters, test ±1σ and ±2σ coverage on the other half.
rng = np.random.default_rng(0)
idx = rng.random(len(first)) < 0.5
cov = {}
for sex in ['M', 'F']:
    m = (first['Sex'] == sex).to_numpy()
    for a, b, key in [(D, S, 'deadlift_from_squat'), (B, S, 'bench_from_squat'), (S, D, 'squat_from_deadlift'), (B, D, 'bench_from_deadlift')]:
        lr = (a - b).to_numpy()
        fit, test = lr[m & idx], lr[m & ~idx]
        mu, sd = np.median(fit), fit.std()
        z = np.abs(test - mu) / sd
        cov[f'{sex} {key}'] = {'within_1sd': float((z <= 1).mean()), 'within_2sd': float((z <= 2).mean())}
print(json.dumps(cov, indent=1))
out['coverage_holdout'] = cov
json.dump(out, open('output/cross_lift.json', 'w'), indent=1)
