import type { LoggedSet } from '../dose';
import {
  addDays,
  adherence,
  goalFixes,
  goalTargetProblem,
  roomToGrowSettled,
  consistency,
  effortOutlier,
  firstWeeks,
  goalForecast,
  goalReached,
  missedSessions,
  recordPaths,
  recordsBetween,
  recordsForSet,
  reminderSchedule,
  sessionDates,
  strengthRecords,
  trainingBlock,
  weekSummaryText,
  welcomeBack,
} from '../engagement';
import { generatePlan } from '../generator';
import { fitModel, potentialPct } from '../model';
import { DEFAULT_PROFILE, withScheduleHistory, type Profile } from '../profile';

const set = (date: string, weightKg = 100, reps = 5, exerciseId = 'back_squat', extra: Partial<LoggedSet> = {}): LoggedSet => ({ date, exerciseId, reps, weightKg, rpe: 8, rir: null, ...extra });
const days = (...dates: string[]) => dates.flatMap((d) => [set(d), set(d), set(d)]);
const profile: Profile = { ...DEFAULT_PROFILE, daysPerWeek: 3, trainingDays: [0, 2, 4] };
const MON = '2026-10-19';
const wk = (n: number, day = 0) => addDays(MON, 7 * n + day);
const status = (c: ReturnType<typeof consistency>, w: number) => c.weeks.find((r) => r.week === wk(w))!.status;

describe('sessions', () => {
  it('need 3 working sets on the day', () => {
    expect(sessionDates([set(wk(0)), set(wk(0))])).toEqual([]);
    expect(sessionDates([set(wk(0)), set(wk(0)), set(wk(0))])).toEqual([wk(0)]);
  });
});

describe('weekly streak', () => {
  it('counts weeks with all planned sessions but one', () => {
    const c = consistency(days(wk(-3), wk(-3, 2), wk(-2), wk(-2, 4), wk(-1), wk(-1, 2), wk(-1, 4)), profile, wk(0, 1));
    expect(c.needed).toBe(2);
    expect(c.streak).toBe(3);
    expect(c.total).toBe(3);
    expect(c.weeks.at(-1)!.status).toBe('open');
  });

  it('a short week is made up by one extra session within the next two weeks', () => {
    const repaired = consistency(days(wk(-3), wk(-3, 2), wk(-2), wk(-1), wk(-1, 2), wk(-1, 4)), profile, wk(0, 1));
    expect(status(repaired, -2)).toBe('repaired');
    expect(repaired.streak).toBe(3);
    const broken = consistency(days(wk(-4), wk(-4, 2), wk(-3), wk(-2), wk(-2, 2), wk(-1), wk(-1, 2)), profile, wk(0, 1));
    expect(status(broken, -3)).toBe('missed');
    expect(broken.streak).toBe(2);
    expect(broken.total).toBe(3);
  });

  it('waits while a short week can still be made up, and says how', () => {
    const c = consistency(days(wk(-2), wk(-2, 2), wk(-1)), profile, wk(0, 1));
    expect(c.repairable).toEqual({ week: wk(-1), sessions: 3 });
    expect(c.streak).toBe(1);
    const c2 = consistency(days(wk(-3), wk(-3, 2), wk(-2), wk(-1), wk(-1, 2)), profile, wk(0, 1));
    expect(status(c2, -2)).toBe('pending');
    expect(c2.streak).toBe(2);
  });

  it('never asks for more than the plan or for a 7th day', () => {
    const seven = { ...profile, daysPerWeek: 7, trainingDays: [0, 1, 2, 3, 4, 5, 6] };
    const week = (w: number, n: number) => days(...Array.from({ length: n }, (_, d) => wk(w, d)));
    const c = consistency([...week(-2, 4), ...week(-1, 6)], seven, wk(0, 1));
    expect(c.needed).toBe(5);
    expect(status(c, -2)).toBe('repaired');
    const c7 = consistency([...week(-3, 4), ...week(-2, 4), ...week(-1, 7)], seven, wk(0, 1));
    expect([status(c7, -3), status(c7, -2)]).toContain('pending');
  });

  it('a week taken off, ahead or afterwards, neither counts nor breaks', () => {
    const h = days(wk(-3), wk(-3, 2), wk(-1), wk(-1, 2));
    expect(consistency(h, profile, wk(0, 1)).streak).toBe(2);
    expect(consistency(h, profile, wk(1, 1)).streak).toBe(1);
    expect(consistency(h, { ...profile, pausedWeeks: [wk(-2, 3)] }, wk(1, 1)).streak).toBe(2);
    expect(consistency(days(wk(-2), wk(-2, 2)), profile, wk(0, 1)).canPauseLast).toBe(true);
    const marked = consistency(days(wk(-2), wk(-2, 2)), { ...profile, retroPauses: [wk(-1)] }, wk(0, 1));
    expect(status(marked, -1)).toBe('paused');
    expect(consistency(days(wk(-2), wk(-2, 2)), { ...profile, retroPauses: [wk(-5), wk(-8)] }, wk(0, 1)).canPauseLast).toBe(false);
  });

  it('makes up a short week session for session, not with one token extra', () => {
    const alternating = consistency(days(wk(-4), wk(-4, 2), wk(-4, 4), wk(-2), wk(-2, 2), wk(-2, 4)), profile, wk(0, 1));
    expect(status(alternating, -3)).toBe('missed');
    const one = consistency(days(wk(-2), wk(-1), wk(-1, 2), wk(-1, 4)), profile, wk(0, 1));
    expect(status(one, -2)).toBe('repaired');
  });

  it('limits weeks off to 6 in 12 months', () => {
    const many = { ...profile, pausedWeeks: [1, 2, 3, 4, 5, 6].map((w) => wk(-w * 2)) };
    const c = consistency(days(wk(-1), wk(-1, 2)), many, wk(0, 1));
    expect(c.pauseWeeksLeft).toBe(0);
    expect(c.canPauseCurrent).toBe(false);
    expect(consistency(days(wk(-1), wk(-1, 2)), profile, wk(0, 1)).pauseWeeksLeft).toBe(6);
  });

  it('scores past weeks against the plan they had', () => {
    const h = days(wk(-2), wk(-2, 2), wk(-1), wk(-1, 2));
    const changed = withScheduleHistory(profile, { ...profile, daysPerWeek: 5, trainingDays: [0, 1, 2, 3, 4] }, wk(0));
    const c = consistency(h, changed, wk(0, 1));
    expect(c.streak).toBe(2);
    expect(c.needed).toBe(4);
  });

  it('supports another week start and two-week periods', () => {
    const fortnight = { ...profile, periodWeeks: 2 as const };
    const c = consistency(days(wk(-4), wk(-4, 2), wk(-3), wk(-3, 2), wk(-2), wk(-1)), fortnight, wk(0, 1));
    expect(c.needed).toBe(4);
    expect(c.periodWeeks).toBe(2);
    const sunday = consistency(days(wk(-1, 6)), { ...profile, weekStartDay: 6 }, wk(0, 1));
    expect(sunday.weeks[0].week).toBe(wk(-1, 6));
  });
});

describe('coming back', () => {
  it('lists planned days missed since the last session, in neutral words', () => {
    const r = missedSessions(days(wk(-1, 0)), profile, wk(0, 0));
    expect(r!.missed).toEqual([wk(-1, 2), wk(-1, 4)]);
    expect(welcomeBack(r!)).toBe('Welcome back. Today’s workout is ready.');
    expect(missedSessions(days(wk(-1, 4)), profile, wk(0, 0))).toBeNull();
    expect(welcomeBack(missedSessions(days(wk(-5)), profile, wk(0, 1))!)).toMatch(/after 5 weeks/);
  });
});

describe('first four weeks', () => {
  it('counts against what the streak needs, from the first week, less weeks off', () => {
    expect(firstWeeks(days(wk(-1), wk(-1, 2)), profile, wk(0))).toMatchObject({ target: 8, done: 2, daysLeft: 21 });
    expect(firstWeeks(days(wk(-1), wk(-1, 2)), { ...profile, pausedWeeks: [wk(1)] }, wk(0))!.target).toBe(6);
    expect(firstWeeks(days(wk(-5)), profile, wk(0))).toBeNull();
    expect(firstWeeks([], profile, wk(0))).toMatchObject({ start: null, done: 0 });
  });
});

describe('rep and weight records', () => {
  const past = [set(wk(-3), 100, 5), set(wk(-2), 100, 5), set(wk(-1), 100, 6)];

  it('the first time is never a record', () => {
    expect(recordsForSet(set(wk(0), 100, 5), [], 80)).toEqual([]);
  });

  it('are exact, and never come from near-maximal sets', () => {
    expect(recordsForSet(set(wk(0), 100, 7), past, 80).map((r) => r.kind)).toEqual(['reps']);
    expect(recordsForSet(set(wk(0), 102.5, 3), past, 80).map((r) => r.kind)).toEqual(['heaviest']);
    expect(recordsForSet(set(wk(0), 100, 6), past, 80)).toEqual([]);
    expect(recordsForSet(set(wk(0), 100, 7, 'back_squat', { failed: true }), past, 80)).toEqual([]);
    expect(recordsForSet(set(wk(0), 100, 7, 'back_squat', { rpe: 10 }), past, 80)).toEqual([]);
  });

  it('ignore a sudden change in how effort is rated', () => {
    const rated = [set(wk(-2), 100, 5, 'back_squat', { rpe: 9 }), set(wk(-1), 100, 5, 'back_squat', { rpe: 9 })];
    expect(effortOutlier(set(wk(0), 100, 5, 'back_squat', { rpe: 6 }), rated)).toBe(true);
    expect(effortOutlier(set(wk(0), 100, 5, 'back_squat', { rpe: 8 }), rated)).toBe(false);
  });

  it('are said in the session only: summaries keep strength records', () => {
    const h = [...past, set(wk(0), 100, 7), set(wk(0), 100, 7), set(wk(0), 105, 3)];
    expect(recordsBetween(h, wk(0), wk(0, 6), 80)).toEqual([]);
  });

  it('frozen strength records stay as awarded', () => {
    const awarded = [{ exerciseId: 'back_squat', week: wk(0), date: wk(0, 2), e1rmKg: 130, previousKg: 120 }];
    expect(recordsBetween([], wk(0), wk(0, 6), 80, [], awarded)).toMatchObject([{ kind: 'strength', e1rmKg: 130 }]);
  });
});

describe('strength records', () => {
  const weeks = (from: number, n: number, kg: (w: number) => number) =>
    Array.from({ length: n }, (_, i) => [0, 2, 4].flatMap((d) => [0, 1, 2].map(() => set(wk(from + i, d), kg(i))))).flat();

  it('come from the model estimate rising clear of its uncertainty', () => {
    const flat = weeks(-12, 12, () => 100);
    const post = fitModel(flat, 'some', wk(0), { sex: 'male' });
    expect(strengthRecords(recordPaths(flat, post, wk(0, 6)), flat, wk(-12), wk(0, 6))).toEqual([]);
    const jump = [...flat, ...weeks(0, 1, () => 115)];
    const records = strengthRecords(recordPaths(jump, post, wk(0, 6)), jump, wk(0), wk(0, 6));
    expect(records).toHaveLength(1);
    expect(records[0].e1rmKg!).toBeGreaterThan(records[0].previousKg!);
  });

  it('need 6 weeks of data on the lift', () => {
    const early = [...weeks(-3, 3, () => 100), ...weeks(0, 1, () => 130)];
    const post = fitModel(early, 'some', wk(0), { sex: 'male' });
    expect(strengthRecords(recordPaths(early, post, wk(0, 6)), early, wk(0), wk(0, 6))).toEqual([]);
  });
});

describe('training blocks', () => {
  it('summarise the last block from the model estimates in week 1 of a new one', () => {
    const block = (from: number, kg: number) => [0, 1, 2, 3].flatMap((w) => [0, 2].flatMap((d) => [0, 1, 2].map(() => set(wk(from + w, d), kg + 2.5 * w))));
    const h = [...block(-8, 100), ...block(-4, 110)];
    const paths = recordPaths(h, fitModel(h, 'some', wk(0), { sex: 'male' }), wk(0, 1));
    const b = trainingBlock(h, profile, wk(0, 1), paths)!;
    expect(b).toMatchObject({ number: 3, week: 1 });
    expect(b.previous).toMatchObject({ sessions: 8, target: 8 });
    expect(b.previous!.lifts[0].toKg).toBeGreaterThan(b.previous!.lifts[0].fromKg);
    expect(trainingBlock(h, profile, wk(1, 1), paths)!.previous).toBeNull();
  });
});

describe('goals', () => {
  const plan = generatePlan({ ...DEFAULT_PROFILE, goal: 'strength' }, [], wk(0));
  const strength = plan.strengthOf('back_squat')!;
  const now = Math.exp(strength.mean);
  const forecast = (weeks: number, target: number, rate = 1) => goalForecast(plan.posterior, 'back_squat', strength, plan.effectiveDose, weeks, target, rate)!;

  it('further ahead is more likely to reach a higher target; dots are sorted', () => {
    expect(forecast(26, now * 1.1).reaching).toBeGreaterThan(forecast(4, now * 1.1).reaching);
    expect([...forecast(26, now).dots].sort((a, b) => a - b)).toEqual(forecast(26, now).dots);
  });

  it('missed sessions lower the odds', () => {
    expect(forecast(26, now * 1.15, 0.5).reaching).toBeLessThan(forecast(26, now * 1.15, 1).reaching);
  });

  it('an easy target is reached in most futures, an absurd one in none', () => {
    expect(forecast(12, now * 0.5).reaching).toBeGreaterThanOrEqual(18);
    expect(forecast(12, now * 5).reaching).toBe(0);
  });

  it('is withheld when the posterior is poorly resolved', () => {
    expect(goalForecast({ ...plan.posterior, ess: 50 }, 'back_squat', strength, plan.effectiveDose, 12, now)).toBeNull();
  });

  it('weeks off still count as untrained weeks for the forecast', () => {
    const h = days(...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((w) => (w === 3 ? [] : [wk(-w), wk(-w, 2), wk(-w, 4)])));
    expect(adherence(h, { ...profile, pausedWeeks: [wk(-3)] }, wk(0, 1))).toBeCloseTo(adherence(h, profile, wk(0, 1)));
  });

  it('adherence comes from recent weeks, shrunk toward the prior', () => {
    const full = adherence(days(...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((w) => [wk(-w), wk(-w, 2), wk(-w, 4)])), profile, wk(0, 1));
    const third = adherence(days(...[1, 2, 3, 4, 5, 6, 7, 8].map((w) => wk(-w))), profile, wk(0, 1));
    expect(full).toBeGreaterThan(0.9);
    expect(third).toBeLessThan(0.5);
    expect(adherence([], profile, wk(0))).toBeCloseTo(0.75);
  });

  it('counts as reached when the model estimate clears the target, or a completed single, never a lucky set', () => {
    const goal = { exerciseId: 'back_squat', targetKg: 120, createdOn: wk(-4) };
    expect(goalReached(goal, { mean: Math.log(123), sd: 0.02, source: 'model' }, [])).toMatchObject({ date: null });
    expect(goalReached(goal, { mean: Math.log(120.5), sd: 0.02, source: 'model' }, [])).toBeNull();
    expect(goalReached(goal, { mean: Math.log(110), sd: 0.02, source: 'model' }, [set(wk(-1), 112.5, 5)])).toBeNull();
    expect(goalReached(goal, null, [set(wk(-1), 120, 1, 'back_squat', { rpe: 10 })])).toMatchObject({ date: wk(-1), kg: 120 });
    expect(goalReached(goal, null, [set(wk(-1), 120, 1, 'back_squat', { failed: true })])).toBeNull();
  });

  it('partial weeks and the plan days shape the forecast', () => {
    const full = goalForecast(plan.posterior, 'back_squat', strength, plan.effectiveDose, 12, now * 1.1, 1, 7, 0, 3)!;
    const some = goalForecast(plan.posterior, 'back_squat', strength, plan.effectiveDose, 12, now * 1.1, 0.67, 7, 0, 3)!;
    expect(some.reaching).toBeLessThanOrEqual(full.reaching);
    expect(full.dots).toHaveLength(20);
  });
});

describe('weekly summary', () => {
  it('reports sessions, streak, records and the plan', () => {
    const h = [...days(wk(-2), wk(-2, 2), wk(-1), wk(-1, 2)), ...days(wk(0)), set(wk(0, 2), 100, 9), set(wk(0, 2)), set(wk(0, 2))];
    const text = weekSummaryText({ today: wk(0, 3), history: h, profile, nextSessions: [{ weekday: 4, title: 'Legs' }] });
    expect(text).toMatch(/2 of 3 workouts/);
    expect(text).toMatch(/3 weeks in a row/);
    expect(text).not.toMatch(/rep record/);
    expect(text).toMatch(/Plan: Fri Legs/);
    expect(weekSummaryText({ today: wk(0, 3), history: h, profile: { ...profile, showStreaks: false }, nextSessions: [] })).not.toMatch(/in a row|record/);
  });
});

describe('reminders', () => {
  const base = { trainingDays: [0, 2, 4], pausedWeeks: [] as string[], trainingTime: '18:00', dayTimes: {} as Record<number, string>, reminderMinutes: 30 as number | null };
  const sessions = [{ weekday: 0, title: 'Push' }, { weekday: 2, title: 'Pull' }, { weekday: 4, title: 'Legs' }];
  const monNoon = new Date(2026, 9, 19, 12, 0);

  it('schedules planned days at their time minus the lead, tapering ahead in case no session is logged', () => {
    const r = reminderSchedule(base, sessions, monNoon, false);
    expect(r[0].at).toEqual(new Date(2026, 9, 19, 17, 30));
    expect(r[0].body).toBe('Push at 18:00.');
    expect(r.map((x) => x.at.getDate())).toEqual([19, 21, 23, 26, 2, 20]);
    expect(r.at(-1)!.body).toMatch(/ready when you are/);
  });

  it('skips today once trained, paused weeks and past times; off means none', () => {
    expect(reminderSchedule(base, sessions, monNoon, true)[0].at.getDate()).toBe(21);
    expect(reminderSchedule({ ...base, pausedWeeks: ['2026-10-19'] }, sessions, monNoon, false)[0].at.getDate()).toBe(26);
    expect(reminderSchedule(base, sessions, new Date(2026, 9, 19, 17, 45), false)[0].at.getDate()).toBe(21);
    expect(reminderSchedule({ ...base, dayTimes: { 2: '07:00' } }, sessions, monNoon, false)[1].at).toEqual(new Date(2026, 9, 21, 6, 30));
    expect(reminderSchedule({ ...base, reminderMinutes: null }, sessions, monNoon, false)).toEqual([]);
  });

  it('thin to one a week when ignored, and stop after a long run of misses', () => {
    const thin = reminderSchedule(base, sessions, monNoon, false, 3);
    expect(thin.filter((x) => !/ready/.test(x.body)).every((x) => x.at.getDay() === 1)).toBe(true);
    const stopped = reminderSchedule(base, sessions, monNoon, false, 8);
    expect(stopped).toHaveLength(1);
    expect(stopped[0].body).toMatch(/ready when you are/);
  });
});

describe('room to grow', () => {
  it('is shown only when its range spans less than a factor of 2', () => {
    expect(roomToGrowSettled({ low: 5, high: 52 }, 1500)).toBe(true);
    expect(roomToGrowSettled({ low: 99, high: 1056 }, 1010)).toBe(false);
    expect(roomToGrowSettled({ low: 5, high: 52 }, 50)).toBe(false);
  });

  it('is centred inside its own interval even for fast, steady beginner gains', () => {
    const h: LoggedSet[] = [];
    for (let w = 0; w < 8; w++) {
      for (const [d, id, base] of [[0, 'back_squat', 80], [2, 'barbell_bench_press', 60], [4, 'deadlift', 100]] as const) {
        for (let s = 0; s < 3; s++) h.push({ ...set(wk(w - 8, d), base + 2.5 * w, 5, id), rpe: null, rir: 2 });
      }
    }
    const p = potentialPct(fitModel(h, 'new', wk(0), { sex: 'male' }));
    expect(p.mean).toBeGreaterThanOrEqual(p.low);
    expect(p.mean).toBeLessThanOrEqual(p.high);
  });
});

describe('goal checks and fixes', () => {
  const logs = Array.from({ length: 10 }, (_, w) => [0, 2, 4].flatMap((d) => [0, 1, 2].map(() => set(wk(w - 10, d), 100 + 1.25 * w)))).flat();
  const plan = generatePlan({ ...DEFAULT_PROFILE, goal: 'strength' }, logs, wk(0));
  const s = plan.strengthOf('back_squat')!;
  const now = Math.exp(s.mean);
  const fc = (t: number, w: number, a: number) => goalForecast(plan.posterior, 'back_squat', s, plan.effectiveDose, w, t, a, 7, 0, 3);

  it('refuses targets at or below today, or beyond any record', () => {
    expect(goalTargetProblem(now * 0.9, now, 500)).toBe('below');
    expect(goalTargetProblem(600, now, 500)).toBe('beyond');
    expect(goalTargetProblem(now * 1.05, now, 500)).toBeNull();
  });

  it('offers a later date, a lower target and full sessions for an unlikely goal', () => {
    const fixes = goalFixes(fc, now * 1.3, 4, 0.5, now, 2.5, [4, 8, 12, 16, 26]);
    const lower = fixes.find((f) => f.kind === 'lower');
    expect(lower && lower.kind === 'lower' && lower.targetKg).toBeGreaterThan(now);
    expect(lower!.reaching).toBeGreaterThanOrEqual(9);
    for (const f of fixes) if (f.kind === 'later') expect(f.reaching).toBeGreaterThanOrEqual(10);
  });
});
