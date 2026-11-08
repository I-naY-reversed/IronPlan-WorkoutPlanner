"""OpenPowerlifting, drug-tested IPF-affiliate subset (public domain):
long-run strength progression and its plateau.

Lifters: raw full-power (SBD) meets with a valid total, ≥3 meets. For lifter i
at t years after their first meet, d_it = ln(Total_it / Total_i0).

1. Population curve per sex: d = H·(1 − exp(−t/τ)) (nonlinear least squares,
   lifter-clustered bootstrap). H is mean headroom above the first-meet level;
   τ is the time constant of approaching the plateau.
2. Spread of individual headroom: per-lifter H_i with τ fixed (closed form),
   for lifters with ≥5 meets over ≥3 years; sd(log H_i) over H_i > 0.
3. Noise: residual changes between consecutive meets <52 weeks apart regressed
   on the gap: E[Δres²] = 2σ² + q²·weeks → meet-day noise σ, weekly drift q.

Caveats: competitors are committed, mostly experienced lifters; people who
keep competing are likely those still progressing (survivorship); totals
include bodyweight gain.
"""
import json, sys
import numpy as np, pandas as pd
from scipy.optimize import least_squares
sys.path.insert(0, 'scripts')
from common import RNG, summary

def load():
    cols = ['Name', 'Sex', 'Event', 'Equipment', 'Age', 'BodyweightKg', 'TotalKg', 'Date']
    import zipfile
    with zipfile.ZipFile('data/openipf-latest.zip') as z:
        name = next(n for n in z.namelist() if n.endswith('.csv'))
        with z.open(name) as f:
            d = pd.read_csv(f, usecols=cols, low_memory=False)
    d = d[(d['Event'] == 'SBD') & (d['Equipment'] == 'Raw') & (d['TotalKg'] > 0) & d['Sex'].isin(['M', 'F'])].copy()
    d['Date'] = pd.to_datetime(d['Date'], errors='coerce')
    d = d.dropna(subset=['Date']).sort_values(['Name', 'Date'])
    # One result per lifter per day (some lifters enter multiple divisions).
    d = d.groupby(['Name', 'Sex', 'Date'], as_index=False)['TotalKg'].max()
    counts = d.groupby('Name')['Date'].transform('size')
    d = d[counts >= 3].copy()
    first = d.groupby('Name')['Date'].transform('min')
    first_total = d.groupby('Name')['TotalKg'].transform('first')
    d['t'] = (d['Date'] - first).dt.days / 365.25
    d['d'] = np.log(d['TotalKg'] / first_total)
    return d[d['t'] <= 10]

def curve(p, t):
    H, tau = p
    return H * (1 - np.exp(-t / tau))

def fit_curve(df):
    res = least_squares(lambda p: curve(p, df['t'].to_numpy()) - df['d'].to_numpy(), [0.2, 2.0], bounds=([0, 0.05], [3, 30]))
    return res.x

if __name__ == '__main__':
    d = load()
    out = {'source': 'OpenPowerlifting openipf-latest (public domain), raw SBD', 'n_rows': int(len(d)), 'fits': {}}
    for sex, g in d.groupby('Sex'):
        H, tau = fit_curve(g)
        names = g['Name'].unique()
        boot = []
        for _ in range(100):
            pick = RNG.choice(names, size=min(len(names), 20000), replace=True)
            sub = g.set_index('Name').loc[pick].reset_index()
            boot.append(fit_curve(sub))
        boot = np.array(boot)
        # Individual headroom with τ fixed.
        g = g.assign(f=1 - np.exp(-g['t'] / tau))
        span = g.groupby('Name')['t'].transform('max'); n = g.groupby('Name')['t'].transform('size')
        long = g[(span >= 3) & (n >= 5)]
        Hi = long.groupby('Name').apply(lambda x: float((x['f'] * x['d']).sum() / (x['f'] ** 2).sum()), include_groups=False)
        # Noise from consecutive meets.
        g = g.assign(res=g['d'] - H * g['f'])
        g['dres'] = g.groupby('Name')['res'].diff(); g['gap'] = g.groupby('Name')['t'].diff() * 52.18
        c = g.dropna(subset=['dres'])
        c = c[(c['gap'] > 0) & (c['gap'] < 52)]
        X = np.column_stack([np.ones(len(c)), c['gap']])
        coef, *_ = np.linalg.lstsq(X, c['dres'].to_numpy() ** 2, rcond=None)
        sigma = float(np.sqrt(max(coef[0], 0) / 2)); q = float(np.sqrt(max(coef[1], 0)))
        out['fits'][sex] = {
            'lifters': int(len(names)), 'H': float(H), 'tau_years': float(tau),
            'H_boot': summary(boot[:, 0]), 'tau_boot': summary(boot[:, 1]),
            'lifters_long_careers': int(len(Hi)), 'share_Hi_nonpositive': float(np.mean(Hi <= 0)),
            'median_Hi_positive': float(np.median(Hi[Hi > 0])), 'sd_log_Hi': float(np.std(np.log(Hi[Hi > 0]))),
            'meet_noise_sigma': sigma, 'weekly_drift_q': q, 'n_consecutive_pairs': int(len(c)),
        }
        f = out['fits'][sex]
        print(f"{sex}: lifters={f['lifters']} H={H:.3f} [{f['H_boot']['low95']:.3f},{f['H_boot']['high95']:.3f}] (+{(np.exp(H)-1)*100:.0f}%)  "
              f"τ={tau:.2f}y [{f['tau_boot']['low95']:.2f},{f['tau_boot']['high95']:.2f}]  long careers={f['lifters_long_careers']} "
              f"median H_i={f['median_Hi_positive']:.3f} sd(log H_i)={f['sd_log_Hi']:.2f} nonpos={f['share_Hi_nonpositive']:.0%}  "
              f"σ_meet={sigma:.3f} q/wk={q:.4f} pairs={f['n_consecutive_pairs']}")
    json.dump(out, open('output/opl.json', 'w'), indent=2)
