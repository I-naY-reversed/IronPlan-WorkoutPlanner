import { swapOptions } from '../customize';
import { EXERCISES_BY_ID } from '../exercises';
import { generatePlan } from '../generator';
import { matchExercise } from '../matching';
import { clampProfile, DEFAULT_PROFILE } from '../profile';
import { startingOneRepMax } from '../starting-strength';

const profile = clampProfile({ ...DEFAULT_PROFILE, ageYears: 24, goal: 'strength' });
const ids = (p: typeof profile) => generatePlan(p, [], '2026-10-26').sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));

describe('paused lifts', () => {
  it('are never planned unless chosen, and are planned once swapped in', () => {
    expect(ids(profile)).not.toContain('pause_squat');
    expect(ids(profile)).not.toContain('paused_bench_press');
    expect(swapOptions('back_squat', profile).map((e) => e.id)).toContain('pause_squat');
    expect(ids({ ...profile, swaps: { back_squat: 'pause_squat' } })).toContain('pause_squat');
  });

  it('start a bit lighter than the normal lift, with a wider range', () => {
    const bench = startingOneRepMax('barbell_bench_press', 'barbell', profile)!;
    const paused = startingOneRepMax('paused_bench_press', 'barbell', profile)!;
    expect(Math.exp(paused.logOneRm - bench.logOneRm)).toBeCloseTo(0.93, 2);
    expect(paused.sd).toBeGreaterThan(bench.sd);
  });

  it('match imported names and keep the base lift for plain names', () => {
    expect(matchExercise('Paused Bench Press')?.exercise.id).toBe('paused_bench_press');
    expect(matchExercise('Pause Squat (Barbell)')?.exercise.id).toBe('pause_squat');
    expect(matchExercise('Bench Press (Barbell)')?.exercise.id).toBe('barbell_bench_press');
    expect(matchExercise('Squat (Barbell)')?.exercise.id).toBe('back_squat');
  });

  it('holds are never offered as replacements', () => {
    expect(swapOptions('crunch', profile).some((e) => EXERCISES_BY_ID[e.id].timed)).toBe(false);
  });
});

describe('tibialis', () => {
  it('has exercises that match common names, and plans never add them', () => {
    expect(matchExercise('Tib Bar')?.exercise.id).toBe('tibialis_machine');
    expect(matchExercise('Tibialis Raise')?.exercise.id).toBe('tibialis_raise');
    const plan = generatePlan({ ...profile, equipment: { ...profile.equipment, owned: { ...profile.equipment.owned, tibialis_machine: {} } } }, [], '2026-10-26');
    expect(plan.targets.tibialis).toBe(0);
    expect(plan.sessions.flatMap((s) => s.exercises).some((e) => EXERCISES_BY_ID[e.exerciseId].muscles.tibialis)).toBe(false);
  });
});

describe('tibialis for Muay Thai', () => {
  const mt = (sessionMinutes: number) =>
    clampProfile({ ...DEFAULT_PROFILE, sport: 'muay_thai', sessionMinutes, equipment: { ...DEFAULT_PROFILE.equipment, owned: { ...DEFAULT_PROFILE.equipment.owned, tibialis_machine: {} } } });
  const tibOf = (p: ReturnType<typeof generatePlan>) => p.sessions.flatMap((s) => s.exercises).filter((e) => EXERCISES_BY_ID[e.exerciseId].muscles.tibialis);

  it('uses only time left over, and never displaces other work', () => {
    const short = generatePlan(mt(60), [], '2026-10-26');
    const without = generatePlan({ ...mt(60), sport: 'muay_thai', equipment: DEFAULT_PROFILE.equipment }, [], '2026-10-26');
    expect(tibOf(short)).toHaveLength(0);
    expect(short.delivered.hamstrings).toBe(without.delivered.hamstrings);
  });

  it('adds two sets once a week when there is room, starting the machine from 2.5–11 kg', () => {
    const tib = tibOf(generatePlan(mt(75), [], '2026-10-26'));
    expect(tib).toHaveLength(1);
    expect(tib[0]).toMatchObject({ exerciseId: 'tibialis_machine', sets: 2, loadSource: 'convention', liftMoreShare: null });
    expect(tib[0].loadKg!).toBeGreaterThanOrEqual(2.5);
    expect(tib[0].loadKg!).toBeLessThanOrEqual(11.3);
  });
});
