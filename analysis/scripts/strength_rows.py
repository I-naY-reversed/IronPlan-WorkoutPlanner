"""Collects pre-training 1RM group means (kg) with body mass, share of men and
training status from Pelland et al. (OSF 6z3xu) and Steele et al. 2023
(CC-BY 4.0), mapped to the app's exercise IDs.
"""
import re
import numpy as np, pandas as pd

# Measure name (lower-case regex) → app exercise. Only true 1RM or 1RM
# estimated from ≤8RM; nRM loads, torques and isometrics are excluded.
PELLAND = [
    (r'^(barbell )?bench press 1rm', 'barbell_bench_press'), (r'^bench press (estimated )?1rm', 'barbell_bench_press'),
    (r'^(barbell back )?squat 1rm$', 'back_squat'), (r'^barbell back squat 1rm', 'back_squat'),
    (r'^(45deg )?leg press 1rm', 'leg_press'), (r'^leg press (estimated )?1rm', 'leg_press'),
    (r'^(bicep curl|arm curl|elbow flexion|biceps curl machine) 1rm', 'biceps_curl'),
    (r'^(preacher bicep curl|dumbbell preacher curl) 1rm', 'biceps_curl'),
    (r'^leg extension (estimated )?1rm$', 'leg_extension'), (r'^knee extension 1rm', 'leg_extension'),
    (r'^leg curl 1rm', 'leg_curl'),
    (r'^(lat pulldown|pulldown|pull-down) (estimated )?1rm', 'lat_pulldown'),
    (r'^(chest press|machine chest press|seated bench press machine) ?1rm', 'chest_press_machine'),
    (r'^(shoulder press|overhead press machine) 1rm', 'shoulder_press_machine'),
    (r'^db ohp estimated 1rm', 'dumbbell_shoulder_press'),
    (r'^(row|machine row|seated row) (estimated )?1rm', 'cable_row'),
    (r'^deadlift 1rm', 'deadlift'), (r'^rdl estimated 1rm', 'romanian_deadlift'),
    (r'^lateral raise 1rm', 'lateral_raise'), (r'^calf raise 1rm', 'calf_raise'),
    (r'^(tricep press|elbow extension) 1rm', 'triceps_pushdown'),
    (r'^(45deg )?hack squat 1rm', 'hack_squat'),
]
STEELE = {'bench press': 'barbell_bench_press', 'squat': 'back_squat', 'leg press': 'leg_press', 'elbow flexion': 'biceps_curl',
          'knee extension': 'leg_extension', 'knee flexion': 'leg_curl', 'pulldown': 'lat_pulldown', 'chest press': 'chest_press_machine',
          'elbow extension': 'triceps_pushdown', 'seated row': 'cable_row', 'overhead press': 'shoulder_press_machine',
          'shoulder press': 'shoulder_press_machine', 'heel raise': 'calf_raise'}

def pelland():
    d = pd.read_excel('data/pelland_extracted.xlsx')
    d = d[d['outcome'] == 'Strength'].copy()
    m = d['measure'].astype(str).str.lower()
    d['exercise'] = None
    for pat, ex in PELLAND:
        hit = m.str.contains(pat.replace('(', '(?:'), regex=True) & d['exercise'].isna() & ~m.str.contains('unilateral|left|right|smith|half')
        d.loc[hit, 'exercise'] = ex
    d = d.dropna(subset=['exercise'])
    return pd.DataFrame({'source': 'pelland', 'study': 'p' + d['number'].astype(str), 'exercise': d['exercise'], 'measure': d['measure'],
                         'one_rm': d['pre.mean'].astype(float), 'sd': d['pre.sd'].astype(float), 'n': d['n'].astype(float),
                         'body_mass': pd.to_numeric(d['body.mass'], errors='coerce'), 'male': pd.to_numeric(d['sex.male'], errors='coerce') / 100,
                         'trained': (d['train.status'] == 'trained').astype(float), 'age': pd.to_numeric(d['age'], errors='coerce')})

def steele():
    d = pd.read_csv('data/steele_polito_rt.csv', encoding='latin-1')
    d = d[(d['outcome'] == 'strength') & d['measure'].astype(str).str.fullmatch('1RM')].copy()
    d['exercise'] = d['specific_region'].map(STEELE)
    d = d.dropna(subset=['exercise'])
    rows = []
    for arm in ('RT', 'CON'):
        rows.append(pd.DataFrame({'source': 'steele', 'study': 's' + d['study'].astype(str), 'exercise': d['exercise'], 'measure': d['specific_region'],
                                  'one_rm': pd.to_numeric(d[f'{arm}_pre_m'], errors='coerce'), 'sd': pd.to_numeric(d[f'{arm}_pre_sd'], errors='coerce'),
                                  'n': pd.to_numeric(d[f'{arm}_n'], errors='coerce'), 'body_mass': pd.to_numeric(d['weight'], errors='coerce'),
                                  'male': pd.to_numeric(d['sex_%_male'], errors='coerce') / 100,
                                  'trained': (d['train_status'] == 'trained').astype(float), 'age': pd.to_numeric(d['age'], errors='coerce')}))
    return pd.concat(rows)

def all_rows():
    r = pd.concat([pelland(), steele()], ignore_index=True)
    r = r[(r['one_rm'] > 0) & (r['body_mass'] > 30) & r['male'].between(0, 1)]
    r['rel'] = r['one_rm'] / r['body_mass']
    return r

if __name__ == '__main__':
    r = all_rows()
    print(r.groupby('exercise')['rel'].describe()[['count', 'min', '25%', '50%', '75%', 'max']].round(2).to_string())
    print(r['age'].describe())
