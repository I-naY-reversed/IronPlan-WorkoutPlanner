import type { LoggedSet } from '../dose';
import { EXERCISES_BY_ID, MUSCLES, type Muscle } from '../exercises';
import { arrangeAroundPractice, dueCheckIn, easeAfterBigDay, generatePlan, spreadForFrequency } from '../generator';
import { DEFAULT_PROFILE, type Profile } from '../profile';

const TODAY = '2026-10-20';
const plan = (over: Partial<Profile>, history: LoggedSet[] = []) => generatePlan({ ...DEFAULT_PROFILE, ...over }, history, TODAY);
const LOWER = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'];
const heavyLegs = (id: string) => {
  const e = EXERCISES_BY_ID[id];
  return e.heavyCompound && !e.power && Object.entries(e.muscles).some(([m, w]) => w === 1 && LOWER.includes(m));
};

describe('sport practice', () => {
  it('rotates the split so leg days avoid the day before practice', () => {
    const order = arrangeAroundPractice(['lower', 'upper', 'lower'], [0, 2, 4], new Set([1, 3]));
    const clashes = order.filter((k, i) => k === 'lower' && [1, 3].includes(([0, 2, 4][i] + 1) % 7)).length;
    expect(clashes).toBeLessThanOrEqual(1);
  });

  it('drops heavy barbell leg work the day before practice, and says so', () => {
    const p = plan({ sport: 'muay_thai', trainingDays: [0, 2, 4], daysPerWeek: 3, matDays: [1, 3, 5] });
    const before = p.sessions.filter((s) => s.adjustments.some((a) => a.startsWith('Practice tomorrow')));
    expect(before.length).toBeGreaterThan(0);
    for (const s of before) expect(s.exercises.some((e) => heavyLegs(e.exerciseId))).toBe(false);
  });

  it('ignores practice days outside combat sports', () => {
    const p = plan({ sport: 'general', trainingDays: [0, 2, 4], daysPerWeek: 3, matDays: [1, 3, 5] });
    expect(p.sessions.every((s) => s.adjustments.length === 0)).toBe(true);
  });
});

describe('frequency for strength', () => {
  it('adds sessions for a muscle whose strength dose would hit the per-session cap', () => {
    const sessions: Muscle[][] = [['quads'], ['chest'], ['quads'], ['chest']];
    spreadForFrequency(sessions, (m) => (m === 'quads' ? 4 : 1));
    expect(sessions.filter((x) => x.includes('quads')).length).toBeGreaterThan(2);
    expect(sessions.filter((x) => x.includes('chest')).length).toBe(2);
  });
  it('leaves hypertrophy plans on their split', () => {
    const hypertrophy = plan({ goal: 'muscle', split: 'upper_lower', daysPerWeek: 4, trainingDays: [0, 1, 3, 4] });
    const quadH = hypertrophy.sessions.filter((s) => s.exercises.some((e) => EXERCISES_BY_ID[e.exerciseId].muscles.quads === 1)).length;
    expect(quadH).toBe(2);
  });
});

describe('easing after a big day', () => {
  const big: LoggedSet[] = Array.from({ length: 14 }, () => ({ date: '2026-10-19', exerciseId: 'leg_press', reps: 10, weightKg: 150, rpe: 8, rir: null }));
  it('halves the next session for muscles far over plan, within two days', () => {
    const zero = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
    const e = easeAfterBigDay(big, TODAY, [0, 2, 4], 3, { ...zero, quads: 10 }, { ...zero, quads: 2 });
    expect(e).toEqual({ session: 1, weekday: 0, muscles: ['quads'] });
  });
  it('shows the adjustment in the plan', () => {
    const p = plan({ split: 'full_body', trainingDays: [0, 2, 4], daysPerWeek: 3 }, big);
    const wed = p.sessions.find((s) => s.weekday === 2)!;
    expect(wed.adjustments.join(' ')).toMatch(/Eased after a big session on Monday/);
  });
  it('does nothing for an ordinary session', () => {
    const normal = big.slice(0, 3);
    const p = plan({ split: 'full_body', trainingDays: [0, 2, 4], daysPerWeek: 3 }, normal);
    expect(p.sessions.every((s) => !s.adjustments.some((a) => a.startsWith('Eased')))).toBe(true);
  });
});

describe('locks', () => {
  it('keeps a locked exercise in every session that trains its muscles', () => {
    const p = plan({ split: 'full_body', daysPerWeek: 3, trainingDays: [0, 2, 4], lockedExercises: ['leg_press'] });
    const withLegPress = p.sessions.filter((s) => s.exercises.some((e) => e.exerciseId === 'leg_press'));
    expect(withLegPress.length).toBe(3);
    expect(withLegPress[0].exercises.find((e) => e.exerciseId === 'leg_press')!.locked).toBe(true);
  });
});

describe('certainty label', () => {
  it('needs several days of data before saying "known closely"', () => {
    const { dotsWithData, certaintyWord } = jest.requireActual('../prescription');
    const tight = 0.01;
    expect(certaintyWord(dotsWithData(tight, 1))).toBe('Known roughly');
    expect(certaintyWord(dotsWithData(tight, 2))).toBe('Known well');
    expect(certaintyWord(dotsWithData(tight, 5))).toBe('Known closely');
  });
});

it('places a locked exercise even when other work already covers its muscles', () => {
  const p = plan({ sport: 'muay_thai', trainingDays: [0, 2, 4], daysPerWeek: 3, lockedExercises: ['leg_press'] });
  const lower = p.sessions.filter((s) => s.kind === 'lower');
  expect(lower.length).toBeGreaterThan(0);
  for (const s of lower) expect(s.exercises.some((e) => e.exerciseId === 'leg_press')).toBe(true);
});

describe('check-ins', () => {
  const sq = (date: string, rpe: number): LoggedSet => ({ date, exerciseId: 'back_squat', reps: 5, weightKg: 100, rpe, rir: null });
  const weeks = ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13'];
  it('flags a regularly trained heavy lift with no near-failure set in 4 weeks', () => {
    expect(dueCheckIn(weeks.map((d) => sq(d, 8)), TODAY)).toBe('back_squat');
    const p = plan({}, weeks.map((d) => sq(d, 8)));
    const flagged = p.sessions.flatMap((s) => s.exercises).filter((e) => e.checkIn);
    expect(flagged.length).toBe(1);
    expect(flagged[0].exerciseId).toBe('back_squat');
  });
  it('is not due after a recent RPE 9 set, or for rarely trained lifts', () => {
    expect(dueCheckIn([...weeks.map((d) => sq(d, 8)), sq('2026-10-13', 9)], TODAY)).toBeNull();
    expect(dueCheckIn([sq('2026-10-13', 8)], TODAY)).toBeNull();
  });
});
