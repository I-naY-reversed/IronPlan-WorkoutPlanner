"""Steele et al. 2023 (Polito et al. RT extracted data; CC-BY 4.0): true
individual differences in response to resistance training.

Per RT-vs-control comparison, individual-response variance (Atkinson &
Batterham) is SD_ir² = SD_Δ,RT² − SD_Δ,CON², with change SDs taken as reported
or imputed from pre/post SDs and the median pre-post correlation. The app's
responsiveness ρ multiplies the mean gain, so its log-scale spread is
    sd(log ρ) = sqrt(ln(1 + SD_ir² / Δ_RT²)),
pooled across comparisons by the median of SD_ir²/Δ_RT² (robust to the
comparisons with tiny mean changes that make the mean unstable), truncated at
0, with a study bootstrap. Sensitivity: the same estimate using only
comparisons that report change SDs (no imputation).
"""
import json, sys
import numpy as np, pandas as pd
sys.path.insert(0, 'scripts')
from common import RNG, impute_correlation, summary

def change_sd(pre_sd, post_sd, delta_sd, r):
    return delta_sd.fillna(np.sqrt(pre_sd**2 + post_sd**2 - 2 * r * pre_sd * post_sd))

def prepare():
    d = pd.read_csv('data/steele_polito_rt.csv', encoding='latin-1')
    rs = []
    for arm in ('RT', 'CON'):
        rs.append(impute_correlation(d[f'{arm}_pre_sd'], d[f'{arm}_post_sd'], d[f'{arm}_delta_sd']))
    r = float(np.nanmedian(rs))
    for arm in ('RT', 'CON'):
        d[f'{arm}_dsd'] = change_sd(d[f'{arm}_pre_sd'], d[f'{arm}_post_sd'], d[f'{arm}_delta_sd'], r)
        d[f'{arm}_dm'] = d[f'{arm}_delta_m'].fillna(d[f'{arm}_post_m'] - d[f'{arm}_pre_m'])
    d = d[d['RT_dsd'].notna() & d['CON_dsd'].notna() & (d['RT_dm'] > 0)]
    d['rel_ir_var'] = (d['RT_dsd']**2 - d['CON_dsd']**2) / d['RT_dm']**2
    d['w'] = d['RT_n'] + d['CON_n']
    return d, r

def pooled_sd_log_rho(df):
    return float(np.sqrt(np.log1p(max(float(df['rel_ir_var'].median()), 0.0))))

if __name__ == '__main__':
    d, r = prepare()
    out = {'source': 'Steele et al. 2023, Polito et al. RT extracted data (github.com/jamessteeleii/Meta-Analysis-of-Variation-in-Resistance-Training), CC-BY 4.0',
           'imputed_pre_post_r': r, 'fits': {}}
    for outcome, g in d.groupby('outcome'):
        point = pooled_sd_log_rho(g); studies = g['study'].unique()
        boot = [pooled_sd_log_rho(pd.concat([g[g['study'] == s] for s in RNG.choice(studies, len(studies))])) for _ in range(500)]
        reported = g[g['RT_delta_sd'].notna() & g['CON_delta_sd'].notna()]
        out['fits'][outcome] = {'n_comparisons': int(len(g)), 'n_studies': int(len(studies)),
                                'sensitivity_reported_sds_only': {'n': int(len(reported)), 'sd_log_rho': pooled_sd_log_rho(reported)},
                                'share_negative_ir_variance': float(np.mean(g['rel_ir_var'] < 0)),
                                'sd_log_rho': point, 'sd_log_rho_boot': summary(np.array(boot))}
        f = out['fits'][outcome]
        print(f"{outcome:12s} comparisons={f['n_comparisons']} studies={f['n_studies']}  sd(log ρ)={point:.3f} "
              f"[{f['sd_log_rho_boot']['low95']:.3f},{f['sd_log_rho_boot']['high95']:.3f}]  negative IR var share={f['share_negative_ir_variance']:.0%}")
    json.dump(out, open('output/individual.json', 'w'), indent=2)
