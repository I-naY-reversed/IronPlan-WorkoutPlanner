"""Pelland et al. (OSF 6z3xu): weekly gain vs weekly fractional sets.

Model, per outcome (strength, hypertrophy):
    y_ij = b_j + A · (1 + δ · trained_ij) · (1 − exp(−S_ij / k)) + e_ij
y = ln(post/pre)/weeks; S = weekly sets for the measured muscle, indirect sets
weighted by the fitted w from fit_indirect.py (the source's convention is 0.5). b_j is a per-study intercept, so the
dose-response (A, k, δ) is identified only by within-study comparisons between
randomised groups. Weights 1/(v + τ²), with τ² the residual heterogeneity.
Study-clustered bootstrap for intervals.

The app needs the gain at saturating volume for a typical participant:
    A0(status) = mean_j(b_j) + A·(1 + δ·trained),
averaged over studies, i.e. the expected weekly gain at high volume.
"""
import json, sys
import numpy as np, pandas as pd
from scipy.optimize import least_squares
sys.path.insert(0, 'scripts')
from common import RNG, impute_correlation, summary, weekly_lnrr

def load():
    d = pd.read_excel('data/pelland_extracted.xlsx')
    r0 = impute_correlation(d['pre.sd'], d['post.sd'], d['delta.sd'])
    cols = dict(pre='pre.mean', post='post.mean', delta='delta.mean', n='n', pre_sd='pre.sd', post_sd='post.sd',
                delta_sd='delta.sd', r='pre.post.correlation', weeks='weeks')
    e = weekly_lnrr(d, cols, r0)
    e['trained'] = (e['train.status'] == 'trained').astype(float)
    # Dose: direct sets + w · indirect sets, with w fitted by fit_indirect.py (0.5 before it has run).
    e['sets.week.fractional'] = e['sets.week.direct'] + indirect_weight() * (e['sets.week.all'] - e['sets.week.direct'])
    # Strength dose saturates within a session (fit_session.py): sum over sessions of c·(1 − e^(−sets/c)).
    c = session_ceiling('strength')
    if c is not None:
        st = e['outcome'] == 'Strength'
        f = e.loc[st, 'frequency.fractional'].astype(float)
        S = e.loc[st, 'sets.week.fractional'].astype(float)
        per = (S / f.where(f > 0)).fillna(0)
        e.loc[st, 'sets.week.fractional'] = (f * c * (1 - np.exp(-per / c))).where(f > 0, 0)
    return e, r0

def session_ceiling(outcome: str):
    """Per-session saturation scale c (sets), or None for a plain weekly count. Ignored while fit_session runs."""
    import os
    from pathlib import Path
    f = Path(__file__).resolve().parent.parent / 'output' / 'session.json'
    if os.environ.get('RAW_WEEKLY_DOSE') or not f.exists():
        return None
    return json.loads(f.read_text())[outcome]['c']

def indirect_weight() -> float:
    from pathlib import Path
    f = Path(__file__).resolve().parent.parent / 'output' / 'indirect.json'
    return json.loads(f.read_text())['hypertrophy']['w'] if f.exists() else 0.5

def fit(df):
    S = df['sets.week.fractional'].to_numpy(float)
    y = df['y'].to_numpy(); v = df['v'].to_numpy(); tr = df['trained'].to_numpy()
    codes, study = np.unique(df['_c'] if '_c' in df else df['number'], return_inverse=True)
    tau2 = 1e-5
    p = np.array([0.01, 4.0, 0.0])
    for _ in range(25):
        w = 1 / (v + tau2)
        def resid(q):
            A, k, dl = q
            f = A * (1 + dl * tr) * (1 - np.exp(-S / k))
            # Profile out study intercepts: weighted mean of y − f within study.
            num = np.bincount(study, w * (y - f)); den = np.bincount(study, w)
            b = (num / den)[study]
            return (y - b - f) * np.sqrt(w)
        res = least_squares(resid, p, bounds=([0, 0.3, -0.9], [0.2, 60, 5]))
        p = res.x
        r = resid(p) / np.sqrt(w)
        dof = len(y) - len(p) - len(codes)
        new = max(1e-8, float(np.sum(r**2) / max(dof, 1) - np.mean(v)))
        if abs(new - tau2) < 1e-10: break
        tau2 = new
    A, k, dl = p
    f = A * (1 + dl * tr) * (1 - np.exp(-S / k))
    w = 1 / (v + tau2)
    b = np.bincount(study, w * (y - f)) / np.bincount(study, w)
    mean_b = float(np.mean(b))
    return np.array([A, k, dl, mean_b + A, mean_b + A * (1 + dl), tau2])

def bootstrap(df, n=400):
    studies = df['number'].unique(); out = []
    for _ in range(n):
        pick = RNG.choice(studies, size=len(studies), replace=True)
        boot = pd.concat([df[df['number'] == s].assign(_c=f'{s}_{i}') for i, s in enumerate(pick)])
        try: out.append(fit(boot))
        except Exception: pass
    return np.array(out)

if __name__ == '__main__':
    e, r0 = load()
    out = {'source': 'Pelland et al., OSF 6z3xu (Extracted Data.xlsx)', 'imputed_pre_post_r': r0,
           'model': 'y_ij = b_j + A(1+δ·trained)(1−exp(−S/k)); within-study identification', 'fits': {}}
    for outcome, g in e.groupby('outcome'):
        # Only studies with ≥2 groups at different volumes inform the dose-response.
        informative = g.groupby('number')['sets.week.fractional'].nunique()
        g = g[g['number'].isin(informative[informative >= 2].index)]
        point = fit(g); boot = bootstrap(g)
        names = ['A', 'k', 'delta_trained', 'A0_untrained', 'A0_trained', 'tau2']
        f = {'n_effects': int(len(g)), 'n_studies': int(g['number'].nunique()),
             'point': dict(zip(names, map(float, point)))}
        for i, nm in enumerate(names): f[nm] = summary(boot[:, i])
        k = boot[:, 1]
        f['log_k_sd'] = float(np.std(np.log(k)))
        for pct in (70, 80, 90): f[f'sets_for_{pct}pct_of_max'] = summary(k * np.log(1 / (1 - pct / 100)))
        f['max_sets_studied'] = float(g['sets.week.fractional'].max())
        out['fits'][outcome] = f
        print(f"{outcome:11s} n={f['n_effects']} studies={f['n_studies']}  A={f['A']['median']:.4f} [{f['A']['low95']:.4f},{f['A']['high95']:.4f}]  "
              f"k={f['k']['median']:.1f} [{f['k']['low95']:.1f},{f['k']['high95']:.1f}]  δ={f['delta_trained']['median']:.2f} "
              f"[{f['delta_trained']['low95']:.2f},{f['delta_trained']['high95']:.2f}]  A0 untrained={f['A0_untrained']['median']:.4f} "
              f"trained={f['A0_trained']['median']:.4f}  80%@{f['sets_for_80pct_of_max']['median']:.1f} [{f['sets_for_80pct_of_max']['low95']:.1f},"
              f"{f['sets_for_80pct_of_max']['high95']:.1f}]  70%@{f['sets_for_70pct_of_max']['median']:.1f} 90%@{f['sets_for_90pct_of_max']['median']:.1f}  maxS={f['max_sets_studied']}")
    json.dump(out, open('output/volume.json', 'w'), indent=2)
