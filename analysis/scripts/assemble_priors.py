"""Combines the fitted outputs into the app's priors file
(mobile/src/domain/fitted-priors.json), with a source for every value.

Run after the fit_*.py scripts. Decisions that are rules rather than fits are
listed under `decisions` so they are visible in the app's data.
"""
import json
import math
from pathlib import Path

out_dir = Path('output')
ml = json.loads((out_dir / 'volume_multilevel.json').read_text())['fits']
rir = json.loads((out_dir / 'rir.json').read_text())['fits']
ind = json.loads((out_dir / 'individual.json').read_text())['fits']
opl = json.loads((out_dir / 'opl.json').read_text())['fits']
opl_long = json.loads((out_dir / 'opl_long.json').read_text())['fits']
levels = json.loads((out_dir / 'strength_levels.json').read_text())

WEEKS_PER_YEAR = 52.18
strength = ml['Strength']
delta = strength['point']['delta_trained']  # trained rate = untrained × (1 + δ)

headroom, a0, log_h_sd = {}, {}, {}
for sex, key in (('male', 'M'), ('female', 'F')):
    long = opl_long[key]
    tau_w = long['tau_years'] * WEEKS_PER_YEAR
    h_some = long['H']
    h_exp = long['remaining_after_3y']['median']
    # Novices: same approach time constant, headroom scaled by the trial-measured
    # untrained/trained rate ratio 1/(1+δ). Their gain rate comes from the trials directly.
    h_new = h_some / (1 + delta)
    headroom[sex] = {'new': h_new, 'some': h_some, 'experienced': h_exp}
    a0[sex] = {'new': strength['point']['A0_untrained'], 'some': h_some / tau_w, 'experienced': h_exp / tau_w}
    log_h_sd[sex] = opl[key]['sd_log_Hi']

# Pooled weekly drift from consecutive-meet residuals (variance pooled by pair count).
pairs = sum(opl[k]['n_consecutive_pairs'] for k in ('M', 'F'))
q = math.sqrt(sum(opl[k]['weekly_drift_q'] ** 2 * opl[k]['n_consecutive_pairs'] for k in ('M', 'F')) / pairs)

indirect = json.loads((out_dir / 'indirect.json').read_text())
session = json.loads((out_dir / 'session.json').read_text())

def session_ci(outcome):
    """Profile-likelihood 95% range: grid values within ΔRSS 3.84 of the best (None = unbounded)."""
    prof = session[outcome]['profile']
    ok = [float(k) for k, v in prof.items() if v <= 3.84]
    return [min(ok), None if float('inf') in ok else max(ok)]
import sys; sys.path.insert(0, str(Path(__file__).resolve().parent))
from fit_volume import load as _load
_e, _ = _load()
hyp_median = round(float(_e.loc[_e['outcome'] == 'Hypertrophy', 'sets.week.fractional'].median()), 1)

priors = {
    'generated_by': 'analysis/scripts/assemble_priors.py',
    'model': {
        'a0': {'value': a0, 'source': 'new: Pelland et al. (OSF 6z3xu) multilevel fit, untrained weekly strength gain at saturating volume; '
               'some/experienced: OpenPowerlifting within-person curves (careers ≥8 y), headroom ÷ time constant'},
        'headroom_median': {'value': headroom, 'source': 'OpenPowerlifting within-person curves: some = headroom from first meet, '
                            'experienced = headroom left 3 years later; new = some ÷ (1+δ), δ = trained vs untrained rate (Pelland fit)'},
        'log_headroom_sd': {'value': log_h_sd, 'source': 'OpenPowerlifting: sd of log individual headroom, careers ≥3 y with ≥5 meets'},
        'k_median': {'value': strength['point']['k'], 'ci95': [strength['k']['low95'], strength['k']['high95']],
                     'source': 'Pelland et al. multilevel strength fit: weekly fractional sets where returns flatten'},
        'log_k_sd': {'value': strength['log_k_sd'], 'source': 'Pelland fit, study-bootstrap sd of log k (population uncertainty; individual variation in k is not identifiable from aggregate trials)'},
        'log_rho_sd': {'value': ind['strength']['sd_log_rho'], 'ci95': [ind['strength']['sd_log_rho_boot']['low95'], ind['strength']['sd_log_rho_boot']['high95']],
                       'sensitivity': ind['strength']['sensitivity_reported_sds_only'],
                       'source': 'Steele et al. 2023 data (CC-BY 4.0): individual-response SD in RCT strength outcomes relative to mean change'},
        'sigma_median': {'value': math.log(1.042), 'source': 'Grgic et al. 2020: median 1RM test-retest CV 4.2% (32 studies, n=1595)'},
        'log_sigma_sd': {'value': (math.log(12.1) - math.log(0.5)) / 4, 'source': 'Grgic et al. 2020 CV range 0.5–12.1% treated as ±2 sd on the log scale'},
        'process_sd': {'value': q, 'source': 'OpenPowerlifting: weekly drift from consecutive-meet residual changes vs gap, pooled across sexes'},
    },
    'effort': {
        'report_bias': {'value': 0.95, 'ci95': [0.17, 1.73], 'source': 'Halperin et al. meta-analysis: reps to failure under-predicted by 0.95 (12 studies, n=414)'},
        'strength_slope_per_rir': {'value': rir['Strength']['point']['g_slope_per_rir'],
                                   'ci95': [rir['Strength']['g_slope_per_rir']['low95'], rir['Strength']['g_slope_per_rir']['high95']],
                                   'source': 'Robinson et al. 2024 (OSF 7knsj) multilevel fit: strength gain vs estimated RIR'},
        'hypertrophy_slope_per_rir': {'value': rir['Hypertrophy']['point']['g_slope_per_rir'],
                                      'ci95': [rir['Hypertrophy']['g_slope_per_rir']['low95'], rir['Hypertrophy']['g_slope_per_rir']['high95']],
                                      'source': 'Robinson et al. 2024 multilevel fit: hypertrophy gain vs estimated RIR'},
        'missing_rir': {'value': rir['Strength']['median_rir'], 'source': 'Robinson et al. 2024: median estimated RIR across strength-trial groups'},
    },
    'volume': {
        'strength_sets_90pct': {'value': strength['point']['sets_90pct'], 'ci95': [strength['sets_90pct']['low95'], strength['sets_90pct']['high95']],
                                'source': 'Pelland fit: weekly fractional sets reaching 90% of the maximal volume-driven strength gain'},
        'hypertrophy_median_studied': {'value': hyp_median, 'source': 'Pelland data: median weekly sets (indirect weighted by w) in hypertrophy groups (no plateau identifiable up to 45)'},
        'strength_session_ceiling': {'value': session['strength']['c'], 'ci95_profile': session_ci('strength'),
                                     'lr_vs_none': round(session['strength']['lr_vs_no_ceiling'], 2),
                                     'boot_p': session['strength'].get('boot_p'), 'boot_n': session['strength'].get('boot_n'),
                                     'weights': [x for x in session['strength'].get('c_weights', []) if x['w'] >= 0.001],
                                     'source': 'Pelland et al. data, fit_session.py: sets per session where the strength stimulus saturates '
                                               '(dose = Σ sessions c·(1 − e^(−sets/c))). Likely reflects practice of the tested lift as well as physiology.'},
        'hypertrophy_session_ceiling': {'value': session['hypertrophy']['c'], 'lower_profile': session_ci('hypertrophy')[0],
                                        'source': 'fit_session.py: no per-session ceiling for hypertrophy; ceilings under ~12 sets per session were rejected.'},
        'indirect_set_weight': {'value': indirect['hypertrophy']['w'], 'ci95': indirect['hypertrophy']['ci95'],
                                'strength': {'value': indirect['strength']['w'], 'ci95': indirect['strength']['ci95']},
                                'source': 'Pelland et al. data, fit_indirect.py: how much a set counts for a muscle it trains indirectly '
                                          '(direct = 1). The 0.5 convention lies inside the interval; the data cannot separate the two.'},
        'hypertrophy_curve_note': 'Hypertrophy rose roughly linearly across 0–45 weekly sets in the within- and between-study fit; k was not identifiable.',
    },
    'timing': {
        'minutes_per_set': {'value': 2.5, 'source': 'Pelland data: median inter-set rest 2.0 min (IQR 1.5–2.0, 572 groups) + ~30 s for a 10-rep set (median reps 10; ~3 s/rep assumed)'},
    },
    'starting_strength': {
        'source': levels['source'] + '; sex gap and deadlift/squat ratio from OpenPowerlifting',
        'model': 'log(1RM/body mass) = intercept[exercise] + sex_gap[region]·male + trained·[experience ≠ new] + age_per_decade·(age−25)/10',
        'sex_gap_log': {'upper': levels['sex_gap_log']['upper'], 'lower': levels['sex_gap_log']['lower']},
        'trained': levels['beta_trained']['point'],
        'age_per_decade': levels['beta_age_per_decade']['point'],
        'exercises': {e: {'intercept': f['log_rel_intercept'], 'sd': f['predictive_sd'], 'n_groups': f['n_groups']}
                      for e, f in levels['exercises'].items()},
        'deadlift_to_squat': {'male': levels['opl_deadlift_to_squat']['M'], 'female': levels['opl_deadlift_to_squat']['F']},
    },
    'decisions': [
        'Starting loads by analogy (e.g. incline bench from flat bench) add 0.25 to the log-scale 1σ; penalty arbitrary.',
        'Experience "1–3 years" and "3+ years" both use the trial "trained" strength level; no data separates them.',
        'Default weekly sets per muscle: strength and general goals use the volume reaching 90% of the fitted strength curve (one more set adds <10% of the first set’s gain); the muscle goal uses the median studied hypertrophy volume because no plateau is identifiable.',
        'Experience mapping for OpenPowerlifting: "1–3 years" ≈ first competition, "3+ years" ≈ three years of competing later.',
        'Novice headroom assumes the same approach time constant as trained lifters, scaled by the trial-measured untrained/trained rate ratio.',
        'Strength effort weighting is flat: the Robinson strength slope is indistinguishable from zero.',
        'Sport muscle priorities for coaches, not fitted.',
    ],
}

target = Path('../mobile/src/domain/fitted-priors.json')
target.write_text(json.dumps(priors, indent=2) + '\n')
print(json.dumps({k: v['value'] for k, v in priors['model'].items()}, indent=1))
print('effort', {k: v['value'] for k, v in priors['effort'].items()})
print('volume', priors['volume']['strength_sets_90pct']['value'])
