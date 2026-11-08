"""Robinson et al. 2024 (OSF 7knsj): weekly gain vs estimated reps in reserve.

Linear multilevel model per outcome (study random intercept, ML):
    y_ij = b + u_j + β_rir·RIR_ij + β_sets·sets_ij + β_tr·trained_ij + e_ij
RIR is the authors' estimated average RIR (strength-specific RIR for strength
outcomes when available). Effort weighting for the app, relative to failure:
    g(RIR) = 1 + (β_rir / ŷ₀)·RIR, ŷ₀ = mean predicted gain at RIR 0,
floored at 0 and reported with study-bootstrap intervals.
"""
import json, sys
import numpy as np, pandas as pd
from scipy.optimize import minimize
sys.path.insert(0, 'scripts')
from common import RNG, impute_correlation, summary, weekly_lnrr

MAX_RIR = 10  # drop implausible estimates (a few groups exceed 20)

def load():
    r = pd.read_excel('data/robinson_ptf.xlsx')
    r0 = impute_correlation(r['pre.sd'], r['post.sd'], r['delta.sd'])
    cols = dict(pre='pre.mean', post='post.mean', delta='delta.mean', n='n', pre_sd='pre.sd', post_sd='post.sd',
                delta_sd='delta.sd', r='pre.post.correlation', weeks='weeks')
    e = weekly_lnrr(r, cols, r0)
    e['rir'] = np.where(e['outcome'] == 'Strength', e['str.avg.rir'].fillna(e['avg.rir']), e['avg.rir'])
    e['trained'] = (e['train.status'] == 'trained').astype(float)
    e = e[e['rir'].between(0, MAX_RIR)]
    return e, r0

def fit(df):
    key = '_c' if '_c' in df else 'study'
    X = np.column_stack([np.ones(len(df)), df['rir'], df['adj.sets.week'], df['trained']])
    y = df['y'].to_numpy(); v = df['v'].to_numpy()
    groups = [np.flatnonzero(df[key].to_numpy() == s) for s in df[key].unique()]
    def gls(log_su, log_se):
        su2, se2 = np.exp(2 * log_su), np.exp(2 * log_se)
        XtVX = np.zeros((4, 4)); XtVy = np.zeros(4); logdet = 0.0; blocks = []
        for idx in groups:
            d = v[idx] + se2; dinv = 1 / d; s = dinv.sum(); c = su2 / (1 + su2 * s)
            Xi, yi = X[idx], y[idx]
            DX, Dy = Xi * dinv[:, None], yi * dinv
            XtVX += Xi.T @ DX - c * np.outer(DX.sum(0), DX.sum(0))
            XtVy += Xi.T @ Dy - c * DX.sum(0) * Dy.sum()
            logdet += np.log(d).sum() + np.log(1 + su2 * s); blocks.append((idx, dinv, c))
        beta = np.linalg.solve(XtVX, XtVy)
        quad = 0.0
        for idx, dinv, c in blocks:
            r = y[idx] - X[idx] @ beta
            quad += (r * r * dinv).sum() - c * (r * dinv).sum() ** 2
        return beta, 0.5 * (logdet + quad)
    res = minimize(lambda t: gls(*t)[1], [np.log(0.003), np.log(0.003)], method='Nelder-Mead')
    beta, _ = gls(*res.x)
    y0 = float(np.mean(X @ beta - beta[1] * X[:, 1]))  # predicted at RIR 0
    return np.array([*beta, y0, beta[1] / y0])

if __name__ == '__main__':
    e, r0 = load()
    out = {'source': 'Robinson et al. 2024, OSF 7knsj (V2.PTF.Data.xlsx)', 'imputed_pre_post_r': r0, 'fits': {}}
    for outcome, g in e.groupby('outcome'):
        point = fit(g); studies = g['study'].unique(); boot = []
        for _ in range(500):
            pick = RNG.choice(studies, size=len(studies), replace=True)
            boot.append(fit(pd.concat([g[g['study'] == s].assign(_c=f'{s}_{i}') for i, s in enumerate(pick)])))
        boot = np.array(boot)
        names = ['b', 'beta_rir', 'beta_sets', 'beta_trained', 'gain_at_rir0', 'g_slope_per_rir']
        f = {'n_effects': int(len(g)), 'n_studies': int(len(studies)), 'median_rir': float(g['rir'].median()),
             'point': dict(zip(names, map(float, point)))}
        for i, nm in enumerate(names): f[nm] = summary(boot[:, i])
        out['fits'][outcome] = f
        P = f['point']
        print(f"{outcome:11s} n={f['n_effects']} studies={f['n_studies']} median RIR={f['median_rir']:.1f}  β_rir={P['beta_rir']:.5f} "
              f"[{f['beta_rir']['low95']:.5f},{f['beta_rir']['high95']:.5f}]  g slope/RIR={P['g_slope_per_rir']:.3f} "
              f"[{f['g_slope_per_rir']['low95']:.3f},{f['g_slope_per_rir']['high95']:.3f}]  gain@RIR0={P['gain_at_rir0']:.4f}")
    json.dump(out, open('output/rir.json', 'w'), indent=2)
