"""Multilevel dose-response, following the structure of Pelland et al.'s
meta-regressions (study random effects, fractional sets):

    y_ij = b + u_j + A·(1 + δ·trained_ij)·(1 − exp(−S_ij/k)) + e_ij
    u_j ~ N(0, σ_u²)   (study random intercept)
    e_ij ~ N(0, v_ij + σ_e²)

Fitted by maximum likelihood; each study's block covariance is
diag(v + σ_e²) + σ_u²·11ᵀ, inverted in closed form (Sherman–Morrison).
Study-clustered bootstrap for intervals. Default-volume rule: the volume where
one more weekly set adds 10% of the first set's gain, i.e. S* = k·ln 10
(90% of the maximal volume-driven gain).
"""
import json, sys
import numpy as np, pandas as pd
from scipy.optimize import minimize
sys.path.insert(0, 'scripts')
from common import RNG, summary
from fit_volume import load

def negloglik(theta, blocks):
    b, logA, logk, dl, log_su, log_se = theta
    A, k, su2, se2 = np.exp(logA), np.exp(logk), np.exp(2 * log_su), np.exp(2 * log_se)
    nll = 0.0
    for S, y, v, tr in blocks:
        r = y - b - A * (1 + dl * tr) * (1 - np.exp(-S / k))
        d = v + se2
        dinv = 1 / d
        # V = D + su2·11ᵀ: V⁻¹ = D⁻¹ − D⁻¹11ᵀD⁻¹·su2/(1 + su2·Σd⁻¹); logdet = Σlog d + log(1 + su2·Σd⁻¹)
        s = np.sum(dinv); c = su2 / (1 + su2 * s)
        quad = np.sum(r * r * dinv) - c * np.sum(r * dinv) ** 2
        nll += 0.5 * (np.sum(np.log(d)) + np.log(1 + su2 * s) + quad + len(y) * np.log(2 * np.pi))
    return nll

def blocks_of(df):
    key = '_c' if '_c' in df else 'number'
    return [(g['sets.week.fractional'].to_numpy(float), g['y'].to_numpy(), g['v'].to_numpy(), g['trained'].to_numpy())
            for _, g in df.groupby(key)]

def fit(df, start=None):
    blocks = blocks_of(df)
    x0 = start if start is not None else np.array([0.0, np.log(0.015), np.log(4.0), 0.0, np.log(0.004), np.log(0.003)])
    bounds = [(-0.05, 0.05), (np.log(1e-4), np.log(0.2)), (np.log(0.3), np.log(200)), (-0.9, 3), (np.log(1e-5), np.log(0.1)), (np.log(1e-5), np.log(0.1))]
    res = minimize(negloglik, x0, args=(blocks,), method='L-BFGS-B', bounds=bounds)
    b, logA, logk, dl, log_su, log_se = res.x
    A, k = np.exp(logA), np.exp(logk)
    return np.array([b, A, k, dl, b + A, b + A * (1 + dl), k * np.log(10), np.exp(log_su), np.exp(log_se)]), res.x

NAMES = ['b', 'A', 'k', 'delta_trained', 'A0_untrained', 'A0_trained', 'sets_90pct', 'sd_study', 'sd_resid']

if __name__ == '__main__':
    e, r0 = load()
    out = {'source': 'Pelland et al., OSF 6z3xu (Extracted Data.xlsx)', 'imputed_pre_post_r': r0,
           'model': 'y = b + u_study + A(1+δ·trained)(1−exp(−S/k)) + e; ML; study-clustered bootstrap', 'fits': {}}
    for outcome, g in e.groupby('outcome'):
        point, x = fit(g)
        studies = g['number'].unique(); boot = []
        for _ in range(300):
            pick = RNG.choice(studies, size=len(studies), replace=True)
            bdf = pd.concat([g[g['number'] == s].assign(_c=f'{s}_{i}') for i, s in enumerate(pick)])
            boot.append(fit(bdf, start=x)[0])
        boot = np.array(boot)
        f = {'n_effects': int(len(g)), 'n_studies': int(g['number'].nunique()), 'point': dict(zip(NAMES, map(float, point))),
             'k_at_upper_bound_share': float(np.mean(boot[:, 2] > 190)), 'log_k_sd': float(np.std(np.log(boot[:, 2]))),
             'max_sets_studied': float(g['sets.week.fractional'].max())}
        for i, nm in enumerate(NAMES): f[nm] = summary(boot[:, i])
        out['fits'][outcome] = f
        P = f['point']
        print(f"{outcome:11s} n={f['n_effects']} studies={f['n_studies']}  A={P['A']:.4f} [{f['A']['low95']:.4f},{f['A']['high95']:.4f}]  "
              f"k={P['k']:.1f} [{f['k']['low95']:.1f},{f['k']['high95']:.1f}] (boot at bound {f['k_at_upper_bound_share']:.0%})  "
              f"δ={P['delta_trained']:.2f} [{f['delta_trained']['low95']:.2f},{f['delta_trained']['high95']:.2f}]  "
              f"A0 untr={P['A0_untrained']:.4f} tr={P['A0_trained']:.4f}  90%@{P['sets_90pct']:.1f} [{f['sets_90pct']['low95']:.1f},{f['sets_90pct']['high95']:.1f}]")
    json.dump(out, open('output/volume_multilevel.json', 'w'), indent=2)
