import { matchExercise } from '../matching';

describe('matchExercise', () => {
  it.each([
    ['Bench Press (Barbell)', 'barbell_bench_press'],
    ['barbell_bench_press', 'barbell_bench_press'],
    ['Incline Bench Press (Dumbbell)', 'incline_dumbbell_bench_press'],
    ['Squat (Barbell)', 'back_squat'],
    ['Lat Pulldown (Cable)', 'lat_pulldown'],
    ['Pull Up', 'pull_up'],
    ['Pullups', 'pull_up'],
    ['Tricep Pushdown', 'triceps_pushdown'],
    ['Romanian Deadlift (Barbell)', 'romanian_deadlift'],
    ['RDL', 'romanian_deadlift'],
    ['Lateral Raise (Dumbbell)', 'lateral_raise'],
    ['Seated Leg Curl (Machine)', 'leg_curl'],
  ])('%s → %s', (name, id) => {
    expect(matchExercise(name)?.exercise.id).toBe(id);
  });

  it('returns null for names it cannot place', () => {
    expect(matchExercise('Turkish Get Up')).toBeNull();
    expect(matchExercise('')).toBeNull();
  });
});
