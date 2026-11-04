import { BODYWEIGHT_ONLY } from '../equipment';
import { EXERCISES_BY_ID, MUSCLE_LABELS, MUSCLES } from '../exercises';
import { reportBias } from '../dose';
import { bestOneRepMaxes, DEFAULT_WEEKLY_SETS, generatePlan, recentVolume, splitFor } from '../generator';
import { DEFAULT_PROFILE, type Profile } from '../profile';
import type { LoggedSet } from '../dose';

const TODAY = '2026-10-20';
const profile = (over: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...over });

describe('splitFor', () => {
  it('defaults to push/pull/legs at 3 days and upper/lower at 2 and 4', () => {
    expect(splitFor(1)).toEqual(['full']);
    expect(splitFor(2)).toEqual(['upper', 'lower']);
    expect(splitFor(3)).toEqual(['push', 'pull', 'legs']);
    expect(splitFor(4)).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(splitFor(5)).toEqual(['push', 'pull', 'legs', 'upper', 'lower']);
    expect(splitFor(6)).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs']);
  });

  it('honours an explicit preference', () => {
    expect(splitFor(3, 'full_body')).toEqual(['full', 'full', 'full']);
    expect(splitFor(3, 'upper_lower')).toEqual(['upper', 'lower', 'upper']);
    expect(splitFor(2, 'ppl')).toEqual(['upper', 'lower']);
  });
});

describe('generatePlan with no data', () => {
  const plan = generatePlan(DEFAULT_PROFILE, [], TODAY);

  it('gives a workout for every training day', () => {
    expect(plan.sessions).toHaveLength(DEFAULT_PROFILE.daysPerWeek);
    for (const s of plan.sessions) expect(s.exercises.length).toBeGreaterThan(0);
  });

  it('fits each session in the time available', () => {
    for (const s of plan.sessions) expect(s.estimatedMinutes).toBeLessThanOrEqual(DEFAULT_PROFILE.sessionMinutes);
  });

  it('trains every targeted muscle and flags shortfalls the session time causes', () => {
    for (const m of MUSCLES) if (plan.targets[m] > 0) expect(plan.delivered[m]).toBeGreaterThan(0);
    const short = MUSCLES.filter((m) => plan.delivered[m] < plan.targets[m] - 1);
    if (short.length > 3) expect(plan.notes.join(' ')).toContain(`${short.length} muscle groups.`);
    else if (short.length) expect(plan.notes.join(' ')).toContain(MUSCLE_LABELS[short[0]].toLowerCase());
  });

  it('suggests population starting weights with 1σ bounds when there is no history', () => {
    const loaded = plan.sessions.flatMap((s) => s.exercises).filter((e) => e.loadKg !== null);
    expect(loaded.length).toBeGreaterThan(0);
    for (const e of loaded) {
      expect(['population', 'analogy', 'convention']).toContain(e.loadSource);
      expect(e.loadLow!).toBeLessThanOrEqual(e.loadKg!);
      expect(e.loadHigh!).toBeGreaterThan(e.loadKg!);
    }
    expect(plan.usedHistory).toBe(false);
  });

  it('varies exercises between repeated sessions', () => {
    const fullBody = generatePlan(profile({ split: 'full_body' }), [], TODAY);
    const [a, b] = fullBody.sessions.map((s) => new Set(s.exercises.map((e) => e.exerciseId)));
    expect([...a].some((id) => !b.has(id))).toBe(true);
  });
});

describe('equipment', () => {
  it('only uses exercises the equipment allows', () => {
    const plan = generatePlan(profile({ equipment: BODYWEIGHT_ONLY }), [], TODAY);
    const ids = plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(EXERCISES_BY_ID[id].requires.some((o) => o.length === 0)).toBe(true);
    expect(plan.notes.join(' ')).toMatch(/can't train/);
  });

  it('lets custom equipment stand in for a built-in kind', () => {
    const plan = generatePlan(
      profile({ equipment: { owned: {}, custom: [{ id: 'c1', name: 'Adjustable dumbbells', worksLike: 'dumbbells', incrementKg: 2.5, maxKg: 24 }] } }),
      [],
      TODAY,
    );
    const ids = plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(ids.some((id) => EXERCISES_BY_ID[id].requires.some((o) => o.includes('dumbbells')))).toBe(true);
  });

  it('respects excluded exercises', () => {
    const plan = generatePlan(profile({ excludedExercises: ['back_squat', 'barbell_bench_press'] }), [], TODAY);
    const ids = plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(ids).not.toContain('back_squat');
    expect(ids).not.toContain('barbell_bench_press');
  });
});

describe('history', () => {
  const history: LoggedSet[] = [];
  for (const date of ['2026-10-06', '2026-10-13']) {
    for (let i = 0; i < 4; i++) history.push({ date, exerciseId: 'goblet_squat', reps: 8, weightKg: 30, rpe: 8, rir: null });
  }

  it('limits increases to +20% or +2 sets over recent weeks, whichever is larger', () => {
    expect(recentVolume(history, TODAY)).toMatchObject({ weeks: 2 });
    const plan = generatePlan(profile({ experience: 'experienced' }), history, TODAY);
    expect(plan.targets.quads).toBe(6);
    expect(plan.usedHistory).toBe(true);
  });

  it('suggests loads from estimated 1RM, rounded down and capped by max weight', () => {
    expect(bestOneRepMaxes(history, TODAY).get('goblet_squat')).toBeCloseTo(30 * (1 + (8 + 2 + reportBias(2, 8)) / 30));
    const plan = generatePlan(
      profile({ equipment: { owned: { dumbbells: { incrementKg: 2, maxKg: 20 } }, custom: [] } }),
      history,
      TODAY,
    );
    const goblet = plan.sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === 'goblet_squat');
    expect(goblet).toBeDefined();
    expect(goblet!.loadKg).toBe(20);
    expect(goblet!.cappedByMax).toBe(true);
  });
});

describe('set counts', () => {
  it('never prescribes a single set of an exercise', () => {
    for (const days of [1, 2, 3, 4, 5, 6]) {
      for (const sessionMinutes of [45, 90, 150]) {
        const plan = generatePlan(profile({ daysPerWeek: days, sessionMinutes }), [], TODAY);
        for (const e of plan.sessions.flatMap((s) => s.exercises)) expect(e.sets).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('session balance', () => {
  it('caps heavy compound lifts per session and avoids large overshoot', () => {
    const plan = generatePlan(DEFAULT_PROFILE, [], TODAY);
    for (const s of plan.sessions) {
      expect(s.exercises.filter((e) => EXERCISES_BY_ID[e.exerciseId].heavyCompound).length).toBeLessThanOrEqual(2);
    }
    for (const m of MUSCLES) if (plan.targets[m] > 0) expect(plan.delivered[m]).toBeLessThanOrEqual(plan.targets[m] * 1.75);
  });
});

describe('response model in the plan', () => {
  it('matches the default volume when there is no data', () => {
    const plan = generatePlan(DEFAULT_PROFILE, [], TODAY);
    expect(plan.model.lifts).toBe(0);
    expect(plan.model.personalization).toBeLessThan(0.05);
    expect(plan.model.learned).toBe(0);
    expect(Math.abs(plan.targets.chest - DEFAULT_WEEKLY_SETS.muscle)).toBeLessThanOrEqual(0.5);
  });

  it('learns a fast responder from logged progress', () => {
    const history: LoggedSet[] = [];
    for (let w = 0; w < 10; w++) {
      const d = new Date(Date.UTC(2026, 7, 10 + 7 * w)).toISOString().slice(0, 10);
      for (let s = 0; s < 4; s++) {
        history.push({ date: d, exerciseId: 'barbell_bench_press', reps: 8, weightKg: Math.round(60 * 1.025 ** w * 2) / 2, rpe: null, rir: 2 });
      }
    }
    const plan = generatePlan(profile(), history, TODAY);
    expect(plan.model.lifts).toBe(1);
    expect(plan.model.responsiveness.mean).toBeGreaterThan(1);
    expect(plan.model.personalization).toBeGreaterThan(0.2);
    expect(plan.model.learned).toBeGreaterThan(plan.model.personalization);
  });
});

test('a full gym gets the loadable calf raise, and adductors are trained', () => {
  const plan = generatePlan({ ...DEFAULT_PROFILE, daysPerWeek: 4, trainingDays: [0, 1, 3, 4] }, [], '2026-10-20');
  const lower = plan.sessions.find((s) => s.exercises.some((e) => e.exerciseId.includes('calf')))!;
  const ids = lower.exercises.map((e) => e.exerciseId);
  expect(ids).toContain('machine_calf_raise');
  expect(ids).not.toContain('calf_raise');
  expect(plan.delivered.adductors).toBeGreaterThan(0);
});

test('heavy compounds get a warm-up ramp, and warm-ups count toward session time', () => {
  const plan = generatePlan({ ...DEFAULT_PROFILE, sport: 'powerlifting', daysPerWeek: 3, trainingDays: [0, 2, 4], sessionMinutes: 60 }, [], '2026-10-20');
  const squat = plan.sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === 'back_squat')!;
  expect(squat.warmups.length).toBeGreaterThanOrEqual(2);
  expect(squat.warmups.every((w) => w.loadKg < squat.loadKg!)).toBe(true);
  for (const s of plan.sessions) {
    const warm = s.exercises.reduce((n, e) => n + e.warmups.length, 0);
    expect(s.estimatedMinutes).toBeGreaterThanOrEqual(Math.round(8 + warm));
    expect(s.estimatedMinutes).toBeLessThanOrEqual(60 + 3);
  }
});
