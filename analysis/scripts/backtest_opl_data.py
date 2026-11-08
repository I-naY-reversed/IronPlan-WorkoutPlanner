"""Sample of real lifters' meet histories for the forecast backtest (mobile/src/domain/__sim__/opl-backtest.sim.ts).

OpenIPF (public domain), raw SBD, lifters with at least 6 meets; first 6 meets each, one per date.
Note: the model's population priors (a0, headroom, drift) were fitted on OpenPowerlifting too, so
this checks individual forecasts out of sample in time, not the priors out of sample.
"""
import json
import zipfile

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
N_LIFTERS = 300

with zipfile.ZipFile('data/openipf-latest.zip') as z:
    name = next(n for n in z.namelist() if n.endswith('.csv'))
    with z.open(name) as f:
        o = pd.read_csv(f, usecols=['Name', 'Sex', 'Event', 'Equipment', 'Date', 'Best3SquatKg', 'Best3BenchKg', 'Best3DeadliftKg'], low_memory=False)
o = o[(o['Event'] == 'SBD') & (o['Equipment'] == 'Raw') & o['Sex'].isin(['M', 'F'])]
o = o[(o['Best3SquatKg'] > 0) & (o['Best3BenchKg'] > 0) & (o['Best3DeadliftKg'] > 0)]
o = o.sort_values('Date').drop_duplicates(['Name', 'Date'])
counts = o.groupby('Name').size()
eligible = counts[counts >= 6].index.to_numpy()
pick = set(RNG.choice(eligible, size=min(N_LIFTERS, len(eligible)), replace=False))
out = []
for name, g in o[o['Name'].isin(pick)].groupby('Name'):
    g = g.head(6)
    out.append({
        'sex': 'male' if g['Sex'].iloc[0] == 'M' else 'female',
        'meets': [{'date': d, 'back_squat': float(s), 'barbell_bench_press': float(b), 'deadlift': float(dl)}
                  for d, s, b, dl in zip(g['Date'], g['Best3SquatKg'], g['Best3BenchKg'], g['Best3DeadliftKg'])],
    })
json.dump({'source': 'OpenIPF raw SBD, lifters with 6+ meets, random sample (seed 42)', 'eligible': int(len(eligible)), 'lifters': out}, open('output/opl_backtest_input.json', 'w'))
print(len(eligible), 'eligible;', len(out), 'sampled')
