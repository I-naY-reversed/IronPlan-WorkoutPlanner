import { applySwap, setDayFocus, swapOptions } from '../customize';
import { effectiveSplit, freezeOf, generatePlan } from '../generator';
import { clampProfile, DEFAULT_PROFILE, type Profile } from '../profile';

const TODAY = '2026-10-20';
const profile = (over: Partial<Profile>): Profile => clampProfile({ ...DEFAULT_PROFILE, confirmed: true, ...over });
const plan = (over: Partial<Profile>) => generatePlan(profile(over), [], TODAY);
const ids = (p: ReturnType<typeof plan>) => p.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
const totalSets = (p: ReturnType<typeof plan>) => p.sessions.reduce((n, s) => n + s.totalSets, 0);

describe('custom week', () => {
  it('keeps each day where the user put it, filling days left open', () => {
    const p = profile({ split: 'custom', trainingDays: [0, 2, 4], dayFocus: { 0: 'legs', 4: 'push' } });
    expect(effectiveSplit(p)).toEqual(['legs', 'pull', 'push']);
    const week = generatePlan(p, [], TODAY);
    expect(week.sessions.map((s) => [s.weekday, s.kind])).toEqual([[0, 'legs'], [2, 'pull'], [4, 'push']]);
  });

  it('is not rotated around sport practice, but still lightens the day before it', () => {
    const p = plan({ sport: 'muay_thai', split: 'custom', trainingDays: [0, 2, 4], matDays: [1], dayFocus: { 0: 'lower', 2: 'upper', 4: 'lower' } });
    expect(p.sessions.map((s) => s.kind)).toEqual(['lower', 'upper', 'lower']);
    expect(p.sessions[0].adjustments.some((a) => a.startsWith('Practice tomorrow'))).toBe(true);
  });

  it('says which muscles no day trains', () => {
    const p = plan({ split: 'custom', trainingDays: [0, 3], dayFocus: { 0: 'push', 3: 'push' } });
    expect(p.notes.some((n) => n.startsWith('No day in your week trains') && n.includes('quads'))).toBe(true);
  });

  it('drops focus for days that are no longer training days', () => {
    expect(profile({ trainingDays: [0, 2], dayFocus: { 0: 'legs', 5: 'push' } }).dayFocus).toEqual({ 0: 'legs' });
  });
});

describe('per-day length', () => {
  it('fits fewer sets into a shorter day', () => {
    const p = plan({ trainingDays: [0, 2, 4], split: 'full_body', sessionMinutes: 90, dayMinutes: { 2: 45 } });
    const [mon, wed] = p.sessions;
    expect(wed.totalSets).toBeLessThan(mon.totalSets);
    expect(wed.estimatedMinutes).toBeLessThanOrEqual(50);
  });
});

describe('exercise choice', () => {
  it('a swap replaces the exercise everywhere', () => {
    const before = ids(plan({}));
    const from = 'barbell_bench_press';
    expect(before).toContain(from);
    expect(before).not.toContain('dumbbell_bench_press');
    const after = ids(plan({ swaps: { [from]: 'dumbbell_bench_press' } }));
    expect(after).not.toContain(from);
    expect(after).toContain('dumbbell_bench_press');
  });

  it('prefers exercises the user does now', () => {
    expect(ids(plan({}))).not.toContain('chest_fly');
    expect(ids(plan({ preferredExercises: ['chest_fly'] }))).toContain('chest_fly');
  });
});

describe('volume preference', () => {
  it('scales the planned sets and says so', () => {
    const base = { goal: 'muscle' as const, sessionMinutes: 150, trainingDays: [0, 1, 3, 4] };
    const less = plan({ ...base, volume: 'less' });
    const std = plan(base);
    const more = plan({ ...base, volume: 'more' });
    expect(totalSets(less)).toBeLessThan(totalSets(std));
    expect(totalSets(more)).toBeGreaterThan(totalSets(std));
    expect(less.notes.some((n) => n.startsWith('Volume set to less'))).toBe(true);
    expect(std.notes.some((n) => n.startsWith('Volume set'))).toBe(false);
  });
});

describe('plan edits', () => {
  it('offers stand-ins that train the same muscles with the user’s equipment', () => {
    const options = swapOptions('barbell_bench_press', profile({}));
    expect(options[0].muscles.chest).toBe(1);
    expect(options.map((e) => e.id)).toContain('dumbbell_bench_press');
    expect(options.map((e) => e.id)).not.toContain('barbell_bench_press');
    expect(options.some((e) => e.power)).toBe(false);
  });

  it('offers the other ab exercises for a Russian twist', () => {
    const options = swapOptions('russian_twist', profile({})).map((e) => e.id);
    expect(options).toContain('crunch');
    expect(options).toContain('ab_crunch_machine');
    expect(options).not.toContain('russian_twist');
  });

  it('chains swaps and undoes one by swapping back', () => {
    let p = applySwap(profile({}), 'barbell_bench_press', 'dumbbell_bench_press');
    p = applySwap(p, 'dumbbell_bench_press', 'incline_dumbbell_bench_press');
    expect(p.swaps).toEqual({ barbell_bench_press: 'incline_dumbbell_bench_press', dumbbell_bench_press: 'incline_dumbbell_bench_press' });
    p = applySwap(p, 'incline_dumbbell_bench_press', 'barbell_bench_press');
    expect(p.swaps.barbell_bench_press).toBeUndefined();
  });

  it('editing one day keeps the others as they were', () => {
    const p = profile({ trainingDays: [0, 2, 4] });
    const before = effectiveSplit(p);
    const after = setDayFocus(p, 2, 'full');
    expect(after.split).toBe('custom');
    expect(effectiveSplit(after)).toEqual([before[0], 'full', before[2]]);
  });
});

describe('notes', () => {
  it('does not count unscheduled muscles as short on time', () => {
    const p = plan({ split: 'custom', trainingDays: [0, 3], dayFocus: { 0: 'push', 3: 'push' }, sessionMinutes: 150 });
    const short = p.notes.find((n) => n.startsWith('Not enough time'));
    expect(short ?? '').not.toMatch(/quads/);
  });
});

describe('usability-test fixes', () => {
  const strength = { goal: 'strength' as const, trainingDays: [0, 2, 4] };

  it('recommends full body for strength on 3 days', () => {
    expect(plan(strength).sessions.map((s) => s.kind)).toEqual(['full', 'full', 'full']);
  });

  it('a chosen push/pull/legs split keeps push days push', () => {
    const push = plan({ ...strength, split: 'ppl' }).sessions[0];
    expect(push.kind).toBe('push');
    for (const e of push.exercises) expect(['deadlift', 'barbell_row', 'romanian_deadlift', 'back_squat']).not.toContain(e.exerciseId);
  });

  it('a swap puts the chosen exercise exactly where the old one was', () => {
    const before = plan(strength);
    const where = before.sessions.map((s) => s.exercises.find((e) => e.exerciseId === 'back_squat')?.sets ?? 0);
    expect(where.some((n) => n > 0)).toBe(true);
    const after = plan({ ...strength, swaps: { back_squat: 'front_squat' } });
    after.sessions.forEach((s, i) => {
      expect(s.exercises.some((e) => e.exerciseId === 'back_squat')).toBe(false);
      if (where[i]) expect(s.exercises.find((e) => e.exerciseId === 'front_squat')?.sets ?? 0).toBeGreaterThanOrEqual(where[i]);
    });
  });
});

describe('second usability test', () => {
  const strength = { goal: 'strength' as const, trainingDays: [0, 2, 4] };

  it('keeps the week as first shown after a session is logged; loads still update', () => {
    const p = profile(strength);
    const first = generatePlan(p, [], TODAY);
    const freeze = freezeOf(first, p, TODAY);
    const logged = [0, 1, 2].map(() => ({ date: TODAY, exerciseId: first.sessions[0].exercises[0].exerciseId, reps: 5, weightKg: 60, rpe: 6, rir: null }));
    const after = generatePlan(p, logged, TODAY, freeze);
    expect(after.sessions.map((s) => s.exercises.map((e) => [e.exerciseId, e.sets]))).toEqual(first.sessions.map((s) => s.exercises.map((e) => [e.exerciseId, e.sets])));
    const changed = generatePlan(profile({ ...strength, sessionMinutes: 45 }), logged, TODAY, freeze);
    expect(changed.sessions[0].totalSets).toBeLessThanOrEqual(first.sessions[0].totalSets);
  });

  it('a full-gym strength plan uses loadable exercises, not bodyweight stand-ins', () => {
    const names = plan(strength).sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    for (const id of ['pike_push_up', 'push_up', 'bodyweight_squat']) expect(names).not.toContain(id);
  });
});
