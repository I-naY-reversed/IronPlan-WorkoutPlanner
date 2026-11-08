"""Within-person progression curve: lifters with careers ≥8 years, fitted on
years 0–6 (before age-related decline), so the curve shape is not distorted
by lifters joining and leaving the sample.
"""
import json, sys
import numpy as np
sys.path.insert(0, 'scripts')
from common import RNG, summary
from fit_opl import fit_curve, load

if __name__ == '__main__':
    d = load()
    span = d.groupby('Name')['t'].transform('max')
    d = d[(span >= 8) & (d['t'] <= 6)]
    out = {'selection': 'career ≥8 years, t ≤ 6 years', 'fits': {}}
    for sex, g in d.groupby('Sex'):
        H, tau = fit_curve(g)
        names = g['Name'].unique(); boot = []
        for _ in range(200):
            sub = g.set_index('Name').loc[RNG.choice(names, len(names))].reset_index()
            boot.append(fit_curve(sub))
        boot = np.array(boot)
        # Headroom remaining after `years` more of competing.
        rem3 = boot[:, 0] * np.exp(-3 / boot[:, 1])
        out['fits'][sex] = {'lifters': int(len(names)), 'H': float(H), 'tau_years': float(tau), 'H_boot': summary(boot[:, 0]),
                            'tau_boot': summary(boot[:, 1]), 'remaining_after_3y': summary(rem3)}
        f = out['fits'][sex]
        print(f"{sex}: lifters={f['lifters']} H={H:.3f} [{f['H_boot']['low95']:.3f},{f['H_boot']['high95']:.3f}] τ={tau:.2f}y "
              f"[{f['tau_boot']['low95']:.2f},{f['tau_boot']['high95']:.2f}] remaining after 3y={f['remaining_after_3y']['median']:.3f}")
    json.dump(out, open('output/opl_long.json', 'w'), indent=2)
