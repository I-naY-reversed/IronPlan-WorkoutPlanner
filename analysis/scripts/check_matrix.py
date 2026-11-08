"""Cross-check the app's exercise-to-muscle matrix against Free Exercise DB
(public domain). Reports, per exercise, muscles each source lists as primary
or secondary, after mapping vocabularies. Output is for human review.
"""
import json, re, sys
from pathlib import Path

DB = {e['name']: e for e in json.load(open('data/free-exercise-db.json'))}
MATCH = {
    'barbell_bench_press': 'Barbell Bench Press - Medium Grip', 'dumbbell_bench_press': 'Dumbbell Bench Press',
    'incline_barbell_bench_press': 'Barbell Incline Bench Press - Medium Grip', 'incline_dumbbell_bench_press': 'Incline Dumbbell Press',
    'chest_fly': 'Dumbbell Flyes', 'dip': 'Dips - Chest Version', 'push_up': 'Pushups', 'overhead_press': 'Standing Military Press',
    'dumbbell_shoulder_press': 'Dumbbell Shoulder Press', 'lateral_raise': 'Side Lateral Raise', 'triceps_pushdown': 'Triceps Pushdown',
    'overhead_triceps_extension': 'Standing Dumbbell Triceps Extension', 'pull_up': 'Pullups', 'lat_pulldown': 'Wide-Grip Lat Pulldown',
    'barbell_row': 'Bent Over Barbell Row', 'dumbbell_row': 'One-Arm Dumbbell Row', 'cable_row': 'Seated Cable Rows', 'face_pull': 'Face Pull',
    'reverse_fly': 'Reverse Flyes', 'biceps_curl': 'Dumbbell Bicep Curl', 'hammer_curl': 'Hammer Curls', 'back_squat': 'Barbell Squat',
    'front_squat': 'Front Barbell Squat', 'goblet_squat': 'Goblet Squat', 'leg_press': 'Leg Press', 'hack_squat': 'Barbell Hack Squat',
    'bulgarian_split_squat': 'Split Squat with Dumbbells', 'leg_extension': 'Leg Extensions', 'deadlift': 'Barbell Deadlift',
    'romanian_deadlift': 'Romanian Deadlift', 'leg_curl': 'Lying Leg Curls', 'hip_thrust': 'Barbell Hip Thrust', 'calf_raise': 'Standing Calf Raises',
    'crunch': 'Crunches', 'hanging_leg_raise': 'Hanging Leg Raise', 'kettlebell_swing': 'One-Arm Kettlebell Swings', 'power_clean': 'Power Clean',
    'farmers_carry': "Farmer's Walk", 'neck_flexion': 'Lying Face Up Plate Neck Resistance', 'neck_extension': 'Lying Face Down Plate Neck Resistance',
    'pike_push_up': 'Handstand Push-Ups', 'jump_squat': 'Freehand Jump Squat', 'plyo_push_up': 'Plyo Push-up',
}
VOCAB = {'quadriceps': {'quads'}, 'hamstrings': {'hamstrings'}, 'glutes': {'glutes'}, 'calves': {'calves'}, 'chest': {'chest'},
         'triceps': {'triceps'}, 'biceps': {'biceps'}, 'lats': {'lats'}, 'middle back': {'upper_back'}, 'traps': {'upper_back'},
         'shoulders': {'front_delts', 'side_delts', 'rear_delts'}, 'abdominals': {'abs'}, 'forearms': {'forearms'}, 'neck': {'neck'},
         'lower back': set(), 'adductors': set(), 'abductors': set()}

def app_matrix():
    src = Path('../mobile/src/domain/exercises.ts').read_text()
    out = {}
    for m in re.finditer(r"id: '([a-z_]+)'.*?muscles: \{([^}]*)\}", src, re.S):
        out[m.group(1)] = {k: float(v) for k, v in re.findall(r"(\w+): (1|0\.5)", m.group(2))}
    return out

def mapped(names):
    s = set()
    for n in names: s |= VOCAB.get(n, set())
    return s

if __name__ == '__main__':
    app = app_matrix(); rows = []
    for ex, name in MATCH.items():
        if name not in DB or ex not in app:
            rows.append(f'- {ex}: no match ({name})'); continue
        db = DB[name]; prim, sec = mapped(db['primaryMuscles']), mapped(db['secondaryMuscles'])
        mine_p = {m for m, w in app[ex].items() if w == 1}; mine_s = {m for m, w in app[ex].items() if w == 0.5}
        # Shoulders map to three delt heads; agree if any head matches.
        delts = {'front_delts', 'side_delts', 'rear_delts'}
        def norm(s, ref): return (s - delts) | ({'delts'} if s & delts else set())
        P, S, MP, MS = norm(prim, None), norm(sec, None), norm(mine_p, None), norm(mine_s, None)
        missing = (P | S) - (MP | MS); extra = (MP | MS) - (P | S); level = (P & MS) | (S & MP)
        if missing or extra or level:
            rows.append(f"- {ex} vs '{name}': DB primary={sorted(db['primaryMuscles'])} secondary={sorted(db['secondaryMuscles'])}; "
                        f"app primary={sorted(mine_p)} secondary={sorted(mine_s)}"
                        + (f"; DB lists, app omits: {sorted(missing)}" if missing else '')
                        + (f"; app lists, DB omits: {sorted(extra)}" if extra else '')
                        + (f"; primary/secondary swapped: {sorted(level)}" if level else ''))
    Path('output/matrix_check.md').write_text('# Exercise matrix vs Free Exercise DB\n\n' + '\n'.join(rows) + '\n')
    print('\n'.join(rows)); print(f'\n{len(rows)} of {len(MATCH)} exercises differ')
