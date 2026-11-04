import { buildSeries, DAY_SHARE, weeklyObservation } from '../model';

const set = (logE1rm: number, date = '2026-10-20', precise = false) => ({ logE1rm, date, precise });

test('a single set is one unit of variance', () => {
  expect(weeklyObservation([set(5)])).toEqual({ y: 5, factor: 1 });
});

test('more sets on one day only shave the set-level part; more days average the day part too', () => {
  const oneDay = weeklyObservation([set(5), set(5.01), set(4.99)]).factor;
  const twoDays = weeklyObservation([set(5), set(5.01, '2026-10-22'), set(4.99), set(5, '2026-10-22')]).factor;
  expect(oneDay).toBeCloseTo(DAY_SHARE + (1 - DAY_SHARE) / 3, 9);
  expect(twoDays).toBeLessThan(oneDay);
  expect(twoDays).toBeGreaterThan(DAY_SHARE / 2);
});

test('only comparable top sets count, and near-failure sets weigh more', () => {
  const o = weeklyObservation([set(5), set(4.8)]);
  expect(o).toEqual({ y: 5, factor: 1 });
  const w = weeklyObservation([set(5, '2026-10-20', true), set(5.04)]);
  expect(w.y).toBeLessThan(5.02);
});

test('the model uses the mean of comparable sets, not the best', () => {
  const day = (d: string) => [100, 102].map((weightKg) => ({ date: d, exerciseId: 'back_squat', reps: 5, weightKg, rpe: 8, rir: null }));
  const series = buildSeries([...day('2026-10-05'), ...day('2026-10-12'), ...day('2026-10-19')]);
  const best = Math.log(102 * (1 + (5 + 2 + 0.95) / 30));
  expect(series[0].y[0]!).toBeLessThan(best);
  expect(series[0].obsFactor![0]).toBeLessThan(1);
});
