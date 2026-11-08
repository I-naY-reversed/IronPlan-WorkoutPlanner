"""How much does an indirect set count? Fitted from Pelland et al. (OSF 6z3xu).

Same within-study model as fit_volume.py, with the dose built as
    S = direct sets + w · indirect sets,   indirect = all − direct,
and w estimated jointly with the curve (profile over a grid, then refined).
w = 0.5 is the "fractional" convention the source uses; w = 0 counts direct
sets only; w = 1 counts every set. Study-clustered bootstrap for the interval.

Output: output/indirect.json
"""
import json, sys
import numpy as np
sys.path.insert(0, 'scripts')
from common import RNG
from fit_volume import load

GRID = np.round(np.linspace(0, 1, 21), 2)

def rss_for(df, w, tau2=None):
    from scipy.optimize import least_squares
    S = df['sets.week.direct'].to_numpy(float) + w * (df['sets.week.all'] - df['sets.week.direct']).to_numpy(float)
    y = df['y'].to_numpy(); v = df['v'].to_numpy(); tr = df['trained'].to_numpy()
    _, study = np.unique(df['number'], return_inverse=True)
    t2 = 1e-5 if tau2 is None else tau2
    p = np.array([0.01, 4.0, 0.0])
    for _ in range(1 if tau2 is not None else 20):
        wt = 1 / (v + t2)
        def resid(q):
            A, k, dl = q
            f = A * (1 + dl * tr) * (1 - np.exp(-S / k))
            b = (np.bincount(study, wt * (y - f)) / np.bincount(study, wt))[study]
            return (y - b - f) * np.sqrt(wt)
        res = least_squares(resid, p, bounds=([0, 0.3, -0.9], [0.2, 60, 5]))
        p = res.x
        if tau2 is not None:
            break
        r = resid(p) / np.sqrt(wt)
        dof = len(y) - 3 - study.max() - 1
        new = max(1e-8, float(np.sum(r**2) / max(dof, 1) - np.mean(v)))
        if abs(new - t2) < 1e-10:
            break
        t2 = new
    return float(np.sum(resid(p) ** 2)), t2

def best_w(df):
    _, tau2 = rss_for(df, 0.5)  # heterogeneity fixed at the convention's fit, so RSS is comparable across w
    rss = np.array([rss_for(df, w, tau2)[0] for w in GRID])
    return float(GRID[int(np.argmin(rss))]), rss

out = {}
e, _ = load()
for outcome in ['Hypertrophy', 'Strength']:
    df = e[(e['outcome'] == outcome) & e['y'].notna() & e['v'].notna()].copy()
    # Only groups with some indirect volume inform w.
    informative = int(((df['sets.week.all'] - df['sets.week.direct']) > 0).sum())
    w, rss = best_w(df)
    studies = df['number'].unique()
    boot = []
    for _ in range(150):
        pick = RNG.choice(studies, len(studies), replace=True)
        parts = []
        for i, s in enumerate(pick):
            part = df[df['number'] == s].copy(); part['number'] = f'{s}_{i}'; parts.append(part)
        import pandas as pd
        boot.append(best_w(pd.concat(parts))[0])
    lo, hi = np.percentile(boot, [2.5, 97.5])
    # Likelihood-ratio check against the 0.5 convention (RSS is a weighted chi-square).
    d_rss = float(rss[list(GRID).index(0.5)] - rss.min())
    out[outcome.lower()] = {
        'w': w, 'ci95': [float(lo), float(hi)], 'groups': len(df), 'groups_with_indirect': informative,
        'studies': int(len(studies)), 'rss_gain_vs_half': d_rss,
        'profile': {str(g): float(r - rss.min()) for g, r in zip(GRID, rss)},
    }
    print(outcome, out[outcome.lower()]['w'], out[outcome.lower()]['ci95'], 'groups', len(df), 'with indirect', informative, 'ΔRSS vs 0.5', round(d_rss, 2))
json.dump(out, open('output/indirect.json', 'w'), indent=1)
