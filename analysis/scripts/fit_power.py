"""Power dose-response y_ij = b_j + β·S^α (within-study), for outcomes without a
clear plateau (hypertrophy in Pelland et al.). Marginal gain of a set at S
relative to the first set is S^(α−1), so the volume where one more set adds
fraction X of the first set's gain is S* = X^(1/(α−1)).
"""
import json, sys
import numpy as np, pandas as pd
from scipy.optimize import least_squares
sys.path.insert(0, 'scripts')
from common import RNG, summary
from fit_volume import load

MARGINAL_FRACTION = 0.10  # decision rule shared with the strength default

def fit(df):
    S = df['sets.week.fractional'].to_numpy(float); y = df['y'].to_numpy(); v = df['v'].to_numpy()
    _, study = np.unique(df['_c'] if '_c' in df else df['number'], return_inverse=True)
    tau2 = 1e-5; p = np.array([0.003, 0.5])
    for _ in range(25):
        w = 1 / (v + tau2)
        def resid(q):
            beta, alpha = q
            f = beta * S**alpha
            b = (np.bincount(study, w * (y - f)) / np.bincount(study, w))[study]
            return (y - b - f) * np.sqrt(w)
        p = least_squares(resid, p, bounds=([0, 0.05], [0.1, 1.5])).x
        r = resid(p) / np.sqrt(w)
        new = max(1e-8, float(np.sum(r**2) / max(len(y) - 2 - study.max() - 1, 1) - np.mean(v)))
        if abs(new - tau2) < 1e-10: break
        tau2 = new
    beta, alpha = p
    s_star = MARGINAL_FRACTION ** (1 / (alpha - 1)) if alpha < 1 else np.inf
    return np.array([beta, alpha, s_star])

if __name__ == '__main__':
    e, _ = load()
    out = {}
    for outcome, g in e.groupby('outcome'):
        inf = g.groupby('number')['sets.week.fractional'].nunique()
        g = g[g['number'].isin(inf[inf >= 2].index)]
        point = fit(g); boot = []
        studies = g['number'].unique()
        for _ in range(400):
            pick = RNG.choice(studies, size=len(studies), replace=True)
            b = pd.concat([g[g['number'] == s].assign(_c=f'{s}_{i}') for i, s in enumerate(pick)])
            boot.append(fit(b))
        boot = np.array(boot)
        finite = boot[np.isfinite(boot[:, 2])]
        out[outcome] = {'point': dict(zip(['beta', 'alpha', 'sets_at_rule'], map(float, point))),
                        'beta': summary(boot[:, 0]), 'alpha': summary(boot[:, 1]), 'sets_at_rule': summary(finite[:, 2]),
                        'share_bootstrap_alpha_below_1': float(np.mean(boot[:, 1] < 1)), 'rule_marginal_fraction': MARGINAL_FRACTION}
        o = out[outcome]
        print(f"{outcome:11s} β={o['beta']['median']:.4f} α={o['alpha']['median']:.2f} [{o['alpha']['low95']:.2f},{o['alpha']['high95']:.2f}] "
              f"sets where next set adds 10%: {o['sets_at_rule']['median']:.1f} [{o['sets_at_rule']['low95']:.1f},{o['sets_at_rule']['high95']:.1f}]")
    json.dump(out, open('output/volume_power.json', 'w'), indent=2)
