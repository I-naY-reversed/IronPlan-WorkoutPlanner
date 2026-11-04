import { describeRate, trend, weeklyRate } from '../bodyweight';
import { importCsv } from '../csv';
import { buildSeries } from '../model';
import { setProblem } from '../plausibility';
import { e1rmOf } from '../progress';
import { generatePlan } from '../generator';
import { DEFAULT_PROFILE } from '../profile';

const day = (i: number) => new Date(Date.parse('2026-10-01T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);

describe('bodyweight', () => {
  it('smooths the trend and finds a weekly rate with a range', () => {
    const entries = Array.from({ length: 28 }, (_, i) => ({ date: day(i), kg: 80 - (0.4 / 7) * i + (i % 2 ? 0.6 : -0.6) }));
    const r = weeklyRate(entries, day(27))!;
    expect(r.pctPerWeek).toBeCloseTo(-0.5, 0);
    expect(r.low).toBeLessThan(r.pctPerWeek);
    expect(r.high).toBeGreaterThan(r.pctPerWeek);
    expect(Math.abs(trend(entries).at(-1)!.kg - (80 - 0.4 * 4))).toBeLessThan(0.8);
    expect(describeRate(r, false)).toMatch(/^Losing about 0\.\d% of your weight a week/);
    expect(describeRate(r, true)).not.toMatch(/muscle/);
  });

  it('needs enough entries over enough days', () => {
    expect(weeklyRate([{ date: day(0), kg: 80 }, { date: day(1), kg: 80 }, { date: day(2), kg: 80 }], day(2))).toBeNull();
  });
});

describe('timed holds', () => {
  it('are plausible by seconds, never give an e1RM, and are never planned', () => {
    expect(setProblem({ exerciseId: 'plank', weightKg: 0, reps: 0, rpe: null, rir: null, seconds: 60 })).toBeNull();
    expect(setProblem({ exerciseId: 'plank', weightKg: 0, reps: 0, rpe: null, rir: null, seconds: 0 })).toBe('seconds');
    expect(e1rmOf({ date: day(0), exerciseId: 'plank', weightKg: 0, reps: 0, rpe: null, rir: null, seconds: 60 }, 80)).toBeNull();
    const plan = generatePlan(DEFAULT_PROFILE, [], day(0));
    expect(plan.sessions.flatMap((s) => s.exercises).some((e) => e.exerciseId === 'plank')).toBe(false);
  });

  it('import from Hevy duration and Strong seconds', () => {
    const hevy = importCsv('title,start_time,exercise_title,set_index,set_type,weight_kg,reps,duration_seconds,rpe\nA,"1 Oct 2026, 10:00",Plank,0,normal,,,45,\n');
    expect(hevy.sets[0]).toMatchObject({ reps: 0, seconds: 45 });
  });
});

describe('drop sets', () => {
  it('import from Hevy and stay out of the strength model', () => {
    const csv = 'title,start_time,exercise_title,set_index,set_type,weight_kg,reps,rpe\n' +
      [0, 7, 14].flatMap((d) => [`A,"${1 + d} Oct 2026, 10:00",Squat (Barbell),0,normal,100,5,8`, `A,"${1 + d} Oct 2026, 10:00",Squat (Barbell),1,dropset,60,12,`]).join('\n');
    const sets = importCsv(csv).sets;
    expect(sets.filter((s) => s.drop)).toHaveLength(3);
    const logged = sets.map((s) => ({ date: s.date, exerciseId: 'back_squat', weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, rir: null, drop: s.drop }));
    const withDrops = buildSeries(logged);
    const without = buildSeries(logged.filter((s) => !s.drop));
    expect(withDrops[0].y).toEqual(without[0].y);
    expect(e1rmOf(logged[1], 80)).toBeNull();
  });
});
