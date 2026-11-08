"""Do sets in one session have diminishing returns? Fitted from Pelland et al.

Same within-study model as fit_volume.py, with the weekly dose built per session:
    D = f · c · (1 − exp(−(S/f) / c)),   S = weekly sets (indirect weighted), f = sessions/week for the muscle,
so each session's sets saturate with scale c (sets per session); c → ∞ recovers the
plain weekly count. c is profiled over a grid with heterogeneity fixed at the c = ∞
fit, so the weighted RSS is a likelihood-ratio statistic (ΔRSS > 3.84 ≈ p < 0.05).
Study-clustered bootstrap for the interval.

Output: output/session.json
"""
import json, os, sys
import numpy as np, pandas as pd
os.environ['RAW_WEEKLY_DOSE'] = '1'  # this script builds the per-session dose itself
from scipy.optimize import least_squares
sys.path.insert(0, 'scripts')
from common import RNG
from fit_volume import load

GRID = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30, 50, np.inf]

def dose(df, c):
    S = df['sets.week.fractional'].to_numpy(float)
    f = df['frequency.fractional'].to_numpy(float)
    if np.isinf(c):
        return S
    per = np.where(f > 0, S / np.where(f > 0, f, 1), 0)
    return np.where(f > 0, f * c * (1 - np.exp(-per / c)), 0)

def rss_for(df, c, tau2=None):
    D = dose(df, c)
    y = df['y'].to_numpy(); v = df['v'].to_numpy(); tr = df['trained'].to_numpy()
    _, study = np.unique(df['number'], return_inverse=True)
    t2 = 1e-5 if tau2 is None else tau2
    p = np.array([0.01, 4.0, 0.0])
    for _ in range(1 if tau2 is not None else 20):
        wt = 1 / (v + t2)
        def resid(q):
            A, k, dl = q
            fx = A * (1 + dl * tr) * (1 - np.exp(-D / k))
            b = (np.bincount(study, wt * (y - fx)) / np.bincount(study, wt))[study]
            return (y - b - fx) * np.sqrt(wt)
        p = least_squares(resid, p, bounds=([0, 0.3, -0.9], [0.2, 200, 5])).x
        if tau2 is not None:
            break
        r = resid(p) / np.sqrt(wt)
        new = max(1e-8, float(np.sum(r**2) / max(len(y) - 3 - study.max() - 1, 1) - np.mean(v)))
        if abs(new - t2) < 1e-10:
            break
        t2 = new
    return float(np.sum(resid(p) ** 2)), t2, p

def profile(df):
    _, tau2, _ = rss_for(df, np.inf)
    rss = np.array([rss_for(df, c, tau2)[0] for c in GRID])
    return GRID[int(np.argmin(rss))], rss, tau2

out = {}
e, _ = load()
for outcome in ['Hypertrophy', 'Strength']:
    df = e[(e['outcome'] == outcome) & e['y'].notna() & e['v'].notna()].copy()
    c, rss, tau2 = profile(df)
    A, k, dl = rss_for(df, c, tau2)[2]
    lr = float(rss[-1] - rss.min())  # evidence against no per-session ceiling
    studies = df['number'].unique()
    boot = []
    for _ in range(150):
        pick = RNG.choice(studies, len(studies), replace=True)
        parts = []
        for i, s in enumerate(pick):
            part = df[df['number'] == s].copy(); part['number'] = f'{s}_{i}'; parts.append(part)
        boot.append(profile(pd.concat(parts))[0])
    boot = np.array(boot, float)
    finite = np.where(np.isinf(boot), 1e9, boot)
    lo, hi = np.percentile(finite, [2.5, 97.5])
    hi = np.inf if hi >= 1e9 else hi
    out[outcome.lower()] = {
        'c': None if np.isinf(c) else float(c), 'ci95': [float(lo), None if np.isinf(hi) else float(hi)],
        'share_boot_infinite': float(np.mean(np.isinf(boot))),
        'lr_vs_no_ceiling': lr, 'curve_at_c': {'A': float(A), 'k': float(k), 'delta': float(dl)}, 'groups': len(df), 'studies': int(len(studies)),
        'profile': {('inf' if np.isinf(g) else str(g)): float(r - rss.min()) for g, r in zip(GRID, rss)},
    }
    print(outcome, 'c =', c, 'A k δ', round(A, 4), round(k, 2), round(dl, 2), 'CI', lo, hi, 'boot ∞ share', round(float(np.mean(np.isinf(boot))), 2), 'ΔRSS vs ∞', round(lr, 2))
    print('  profile', {('inf' if np.isinf(g) else g): round(float(r - rss.min()), 2) for g, r in zip(GRID, rss)})
json.dump(out, open('output/session.json', 'w'), indent=1)
