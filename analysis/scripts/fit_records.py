"""World records (IPF classic, open) per sex and weight class from OpenIPF.

Records are the best successful lift (4th attempts count) at IPF and IPF
regional championships, classic (raw) equipment, in the weight classes in use
since 2019. Official IPF lists can differ slightly (late ratifications, meets
missing from the dump). Streams the CSV so memory stays small.

Output: ../mobile/src/domain/world-records.json
"""
import csv, io, json, zipfile
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'data' / 'openipf-latest.zip'
OUT = Path(__file__).resolve().parent.parent.parent / 'mobile' / 'src' / 'domain' / 'world-records.json'
RECORD_FEDS = {'IPF', 'EPF', 'NAPF', 'AsianPF', 'AfricanPF', 'ORPF', 'FESUPO'}
CLASSES = {
    'M': ['59', '66', '74', '83', '93', '105', '120', '120+'],
    'F': ['47', '52', '57', '63', '69', '76', '84', '84+'],
}
LIFTS = {'squat': ('Squat4Kg', 'Best3SquatKg'), 'bench': ('Bench4Kg', 'Best3BenchKg'), 'deadlift': ('Deadlift4Kg', 'Best3DeadliftKg')}

def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None

best = {}
feds = Counter()
with zipfile.ZipFile(DATA) as z:
    name = next(n for n in z.namelist() if n.endswith('.csv'))
    snapshot = name.split('/')[0].replace('openipf-', '')
    with z.open(name) as f:
        for r in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8')):
            if r['Equipment'] != 'Raw' or r['Date'] < '2019-01-01' or r['Sex'] not in CLASSES:
                continue
            if r['Federation'] not in RECORD_FEDS or r['Place'] in ('DQ', 'DD', 'NS'):
                continue
            wc = r['WeightClassKg']
            if wc not in CLASSES[r['Sex']]:
                continue
            feds[r['Federation']] += 1
            for lift, cols in LIFTS.items():
                v = max([x for x in (num(r[c]) for c in cols) if x and x > 0], default=None)
                if v is None:
                    continue
                key = (r['Sex'], wc, lift)
                if v > best.get(key, (0,))[0]:
                    best[key] = (v, r['Name'], r['Date'], r['MeetName'])

out = {
    'source': f'OpenIPF snapshot {snapshot}: best classic lift at IPF and regional championships since 2019, 4th attempts included',
    'classes': CLASSES,
    'records': {
        sex: {wc: {lift: best[(sex, wc, lift)][0] for lift in LIFTS if (sex, wc, lift) in best} for wc in CLASSES[sex]}
        for sex in CLASSES
    },
}
OUT.write_text(json.dumps(out, indent=1))
print(feds)
for sex in CLASSES:
    for wc in CLASSES[sex]:
        print(sex, wc, {l: best.get((sex, wc, l), (None, '', ''))[:3] for l in LIFTS})
