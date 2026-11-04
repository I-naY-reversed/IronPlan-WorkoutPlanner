import { estimateRir, weeklyDose, type LoggedSet } from '../dose';
import { generatePlan } from '../generator';
import { DEFAULT_PROFILE } from '../profile';
import { startingOneRepMax } from '../starting-strength';

const TODAY = '2026-10-20';

test('prior-only loads start below the median estimate', () => {
  const plan = generatePlan(DEFAULT_PROFILE, [], TODAY);
  const squat = plan.sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === 'back_squat')!;
  const pop = startingOneRepMax('back_squat', 'barbell', DEFAULT_PROFILE)!;
  const medianLoad = Math.exp(pop.logOneRm) / (1 + ((squat.repRange[0] + squat.repRange[1]) / 2 + squat.targetRir) / 30);
  expect(squat.loadKg!).toBeLessThan(medianLoad * 0.8);
  expect(squat.loadLow!).toBeLessThanOrEqual(squat.loadKg!);
});

test('a lift not trained for weeks comes back lighter, with a wider bracket', () => {
  const set = (date: string): LoggedSet => ({ date, exerciseId: 'back_squat', reps: 5, weightKg: 100, rpe: 8, rir: null });
  const recent = [set('2026-10-13'), set('2026-10-13')];
  const old = [set('2026-09-08'), set('2026-09-08')];
  const load = (h: LoggedSet[]) => generatePlan(DEFAULT_PROFILE, h, TODAY).sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === 'back_squat')!;
  const a = load(recent);
  const b = load(old);
  expect(b.reentryWeeks).toBe(6);
  expect(a.reentryWeeks).toBeNull();
  expect(b.loadKg!).toBeLessThan(a.loadKg!);
});

test('very easy sets are not hard sets', () => {
  const easy = { date: TODAY, exerciseId: 'back_squat', reps: 5, weightKg: 60, rpe: 4, rir: null };
  const hard = { ...easy, rpe: 8 };
  const [w] = weeklyDose([easy, hard]);
  expect(w.muscles.quads.fractionalSets).toBe(1);
});

test('missed reps mean zero reps in reserve, with no reporting correction', () => {
  expect(estimateRir({ rpe: 10, rir: null, failed: true }).rir).toBe(0);
  expect(estimateRir({ rpe: 10, rir: null }).rir).toBeGreaterThan(0);
});

test('age does not add a strength bonus under 25', () => {
  const at = (ageYears: number) => startingOneRepMax('back_squat', 'barbell', { ...DEFAULT_PROFILE, ageYears })!.logOneRm;
  expect(at(16)).toBe(at(25));
  expect(at(45)).toBeLessThan(at(25));
});

test('under-18s start lower than adults and are told to train supervised', () => {
  const squat = (ageYears: number) =>
    generatePlan({ ...DEFAULT_PROFILE, ageYears }, [], TODAY).sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === 'back_squat')!;
  expect(squat(16).loadKg!).toBeLessThan(squat(25).loadKg!);
  expect(generatePlan({ ...DEFAULT_PROFILE, ageYears: 16 }, [], TODAY).notes.join(' ')).toMatch(/Under 18/);
});

test('hypertrophy volume is the research default, not the strength model; general fitness converts like strength', () => {
  const muscle = generatePlan({ ...DEFAULT_PROFILE, goal: 'muscle' }, [], TODAY);
  expect(muscle.model.volumeSource).toBe('default');
  expect(muscle.model.recommendedSets).toBe(10.5);
  const general = generatePlan({ ...DEFAULT_PROFILE, goal: 'general' }, [], TODAY);
  expect(general.model.volumeSource).toBe('model');
  expect(general.model.recommendedSets).toBeGreaterThan(2.6);
});
