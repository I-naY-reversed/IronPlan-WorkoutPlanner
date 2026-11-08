"""Boundary-aware test and model averaging for the per-session strength ceiling.

1. Parametric bootstrap of the likelihood-ratio statistic LR = RSS(c=∞) − min_c RSS(c)
   under the no-ceiling model (c = ∞): simulate outcomes from the fitted null
   (study intercepts + curve + N(0, v + τ²) noise), refit, recompute LR. The p-value
   is the share of simulated LR ≥ the observed LR. This respects the boundary at
   c = ∞, which the χ²(1) reference ignores.
2. Profile-likelihood weights over the c grid, w_c ∝ exp(−ΔRSS/2) (flat prior on the
   grid, which is roughly log-spaced), for the app to average over c instead of
   using the point estimate.

Updates output/session.json (strength.boot_p, strength.c_weights).
"""
import json, os, sys
import numpy as np
os.environ['RAW_WEEKLY_DOSE'] = '1'
sys.path.insert(0, 'scripts')
from common import RNG
from fit_volume import load
from fit_session import GRID, dose, rss_for
from scipy.optimize import least_squares

def null_fit(df):
    rss, tau2, p = rss_for(df, np.inf)
    A, k, dl = p
    D = dose(df, np.inf)
    y = df['y'].to_numpy(); v = df['v'].to_numpy(); tr = df['trained'].to_numpy()
    _, study = np.unique(df['number'], return_inverse=True)
    wt = 1 / (v + tau2)
    f = A * (1 + dl * tr) * (1 - np.exp(-D / k))
    b = (np.bincount(study, wt * (y - f)) / np.bincount(study, wt))[study]
    return b + f, v + tau2

def lr_stat(df):
    _, tau2, _ = rss_for(df, np.inf)
    rss = np.array([rss_for(df, c, tau2)[0] for c in GRID])
    return float(rss[-1] - rss.min()), rss

e, _ = load()
df = e[(e['outcome'] == 'Strength') & e['y'].notna() & e['v'].notna()].copy()
obs, rss = lr_stat(df)
mean, var = null_fit(df)
sims = []
for i in range(int(os.environ.get('BOOT', 200))):
    d = df.copy()
    d['y'] = mean + RNG.normal(0, np.sqrt(var))
    sims.append(lr_stat(d)[0])
sims = np.array(sims)
p = float((np.sum(sims >= obs) + 1) / (len(sims) + 1))
delta = rss - rss.min()
w = np.exp(-delta / 2); w /= w.sum()
out = json.load(open('output/session.json'))
out['strength']['boot_p'] = p
out['strength']['boot_n'] = int(len(sims))
out['strength']['lr_null_95'] = float(np.percentile(sims, 95))
out['strength']['c_weights'] = [{'c': (None if np.isinf(c) else float(c)), 'w': float(x)} for c, x in zip(GRID, w)]
json.dump(out, open('output/session.json', 'w'), indent=1)
print('observed LR', round(obs, 2), 'null 95th pct', round(float(np.percentile(sims, 95)), 2), 'boot p', round(p, 4))
print('weights', {('inf' if np.isinf(c) else c): round(float(x), 3) for c, x in zip(GRID, w) if x > 0.005})
