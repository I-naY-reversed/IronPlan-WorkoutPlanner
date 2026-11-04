import type { LoggedSet } from '../dose';
import { consistency, goalForecast, goalReached, recordPaths, reminderSchedule, trainingBlock } from '../engagement';
import { BODYWEIGHT_ONLY, FULL_GYM, HOME_DUMBBELLS } from '../equipment';
import { generatePlan } from '../generator';
import { platesPerSide } from '../plates';
import { loadLimitKg, setProblem } from '../plausibility';
import { clampProfile, DEFAULT_PROFILE, type Profile } from '../profile';
import { estimateFromBracket, updateAfterSet } from '../session-update';
import { formatLoad } from '../units';
import { warmupSets } from '../warmup';

const TODAY = '2026-10-21';
const finite = (x: number | null) => x === null || Number.isFinite(x);
const day = (i: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);

const profiles: Partial<Profile>[] = [
  { ageYears: 13, bodyweightKg: 30, heightCm: 120, sex: 'female', experience: 'new' },
  { ageYears: 100, bodyweightKg: 250, heightCm: 230, experience: 'experienced', goal: 'strength' },
  { ageYears: 1e9, bodyweightKg: -5, heightCm: NaN, sessionMinutes: 1e6, daysPerWeek: 99 },
  { trainingDays: [0, 1, 2, 3, 4, 5], sessionMinutes: 45, sport: 'powerlifting' },
  { trainingDays: [6], sessionMinutes: 150, sport: 'wrestling', matDays: [0, 1, 2, 3, 4, 5, 6] },
  { equipment: { ...FULL_GYM, owned: { ...FULL_GYM.owned, barbell: { incrementKg: 0.001, maxKg: 1 } } } },
  { equipment: { ...FULL_GYM, owned: { ...FULL_GYM.owned, barbell: { incrementKg: 1000, maxKg: 5000 } } } },
  { unit: 'lb', volume: 'more', split: 'custom', dayFocus: { 0: 'push' } },
];
profiles.push({ equipment: HOME_DUMBBELLS }, { equipment: BODYWEIGHT_ONLY });

const histories: LoggedSet[][] = [
  [],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((w) => [
    { date: day(w * 7), exerciseId: 'back_squat', reps: 1, weightKg: 0.5, rpe: 10, rir: null },
    { date: day(w * 7), exerciseId: 'back_squat', reps: 100, weightKg: 1000, rpe: 1, rir: null },
    { date: day(w * 7), exerciseId: 'deadlift', reps: 12, weightKg: 9999, rpe: null, rir: 0, failed: true },
    { date: day(w * 7), exerciseId: 'barbell_bench_press', reps: 5, weightKg: 0, rpe: 8, rir: null },
    { date: day(w * 7), exerciseId: 'pull_up', reps: 50, weightKg: 200, rpe: 6, rir: null },
  ]),
  Array.from({ length: 300 }, (_, i) => ({ date: day(i * 2), exerciseId: 'back_squat', reps: 5, weightKg: 140 - i * 0.2, rpe: 8, rir: null })),
];

describe('stress: plans', () => {
  for (const [pi, over] of profiles.entries()) {
    for (const [hi, history] of histories.entries()) {
      it(`profile ${pi}, history ${hi}`, () => {
        const profile = clampProfile({ ...DEFAULT_PROFILE, ...over });
        const plan = generatePlan(profile, history, TODAY);
        for (const s of plan.sessions) {
          expect(Number.isFinite(s.estimatedMinutes)).toBe(true);
          for (const e of s.exercises) {
            expect([e.loadKg, e.loadLow, e.loadHigh].every(finite)).toBe(true);
            if (e.loadKg !== null) {
              expect(e.loadKg).toBeGreaterThanOrEqual(0);
              expect(e.loadLow!).toBeLessThanOrEqual(e.loadKg + 1e-9);
              expect(e.loadHigh!).toBeGreaterThanOrEqual(e.loadKg - 1e-9);
              expect(e.loadKg).toBeLessThan(600);
            }
            for (const w of e.warmups) expect(Number.isFinite(w.loadKg) && w.loadKg >= 0).toBe(true);
          }
        }
        expect(Object.values(plan.targets).every((t) => Number.isFinite(t) && t >= 0)).toBe(true);
        const c = consistency(history, profile, TODAY);
        expect(Number.isFinite(c.streak)).toBe(true);
        const paths = recordPaths(history, plan.posterior, TODAY);
        trainingBlock(history, profile, TODAY, paths);
        const s = plan.strengthOf('back_squat');
        if (s) {
          for (const target of [0.5, 1, 100, 1e6]) {
            const f = goalForecast(plan.posterior, 'back_squat', s, plan.effectiveDose, 26, target, 0.75, 7, 0, profile.daysPerWeek);
            if (f) expect(f.dots.every((d) => Number.isFinite(d) && d > 0)).toBe(true);
            goalReached({ exerciseId: 'back_squat', targetKg: target, createdOn: day(30) }, s, history);
          }
        }
        reminderSchedule(profile, plan.sessions, new Date(2026, 9, 21, 12), false, 0);
      });
    }
  }
});

describe('stress: set-by-set updates, plates, warm-ups', () => {
  it('stay finite for extreme sets', () => {
    for (const weightKg of [0, 0.5, 20, 500, 5000]) {
      for (const reps of [1, 5, 30, 100]) {
        for (const rpe of [null, 1, 6, 10]) {
          const u = updateAfterSet({ prior: estimateFromBracket(90, 110), weightKg, reps, rpe, missed: false, targetReps: 8, targetRir: 2, incrementKg: 2.5 });
          expect([u.next.value, u.next.low, u.next.high].every(Number.isFinite)).toBe(true);
          expect(u.next.low).toBeLessThanOrEqual(u.next.high);
        }
      }
    }
  });

  it('plates terminate and stay finite', () => {
    for (const load of [-10, 0, 0.1, 20, 21.3, 500, 10000]) {
      for (const inc of [0.001, 0.5, 2.5, 50]) {
        const p = platesPerSide(load, inc);
        expect(p.plates.length).toBeLessThan(500);
        expect(Number.isFinite(p.leftover)).toBe(true);
      }
    }
  });

  it('warm-ups stay finite', () => {
    for (const workingKg of [null, 0, 1, 20, 1000]) {
      const w = warmupSets({ workingKg, incrementKg: 2.5, heavy: true, barKg: 20, firstForMuscle: true });
      expect(w.every((s) => Number.isFinite(s.loadKg) && s.loadKg >= 0)).toBe(true);
    }
    expect(formatLoad(1e9, 'kg')).not.toMatch(/NaN|Infinity/);
  });
});

describe('stress: plausibility', () => {
  it('rejects typos and keeps real extremes', () => {
    const s = (exerciseId: string, weightKg: number, reps: number) => setProblem({ exerciseId, weightKg, reps, rpe: 8, rir: null });
    expect(s('deadlift', 9999, 1)).toBe('weight');
    expect(s('back_squat', 100, 500)).toBe('reps');
    expect(s('barbell_bench_press', 300, 12)).toBe('strength');
    expect(s('leg_press', 600, 10)).toBeNull();
    expect(s('deadlift', 300, 5)).toBeNull();
    expect(s('pull_up', 40, 5)).toBeNull();
    expect(s('back_squat', -5, 5)).toBe('weight');
    expect(loadLimitKg('deadlift')).toBeGreaterThan(450);
  });
});
