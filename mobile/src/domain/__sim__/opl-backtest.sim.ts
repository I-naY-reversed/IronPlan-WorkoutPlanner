/// <reference types="node" />
// Input: analysis/output/opl_backtest_input.json (committed), from analysis/scripts/backtest_opl_data.py.
import { readFileSync } from 'fs';
import { join } from 'path';

import { goalForecast } from '../engagement';
import { fitSeries, PRIORS, type LiftSeries } from '../model';

type Meet = { date: string; back_squat: number; barbell_bench_press: number; deadlift: number };
const LIFTS = ['back_squat', 'barbell_bench_press', 'deadlift'] as const;
const TRAIN = 5;
const ADHERENCE = Number(process.env.SIM_ADHERENCE ?? 1);
const PARTICLES = Number(process.env.SIM_PARTICLES ?? 1000);

test('OpenIPF forecast backtest', () => {
  const data = JSON.parse(readFileSync(join(__dirname, '../../../../analysis/output/opl_backtest_input.json'), 'utf8')) as { lifters: { sex: 'male' | 'female'; meets: Meet[] }[] };
  const weekOf = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / (7 * 86400000));
  const testSd = PRIORS.sigmaMedian;
  const band = (W: number) => (W <= 13 ? '2–13 wk' : W <= 26 ? '14–26 wk' : '27–104 wk');
  const rows: { lifter: number; band: string; below: number }[] = [];
  let skipped = 0;
  let gated = 0;
  data.lifters.forEach((l, li) => {
    const meets = l.meets;
    const last = meets[TRAIN - 1];
    const W = weekOf(last.date, meets[TRAIN].date);
    if (W < 2 || W > 104) return void skipped++;
    const weeks = weekOf(meets[0].date, last.date) + 1;
    const series: LiftSeries[] = LIFTS.map((id) => {
      const y: (number | null)[] = Array(weeks).fill(null);
      const f: (number | null)[] = Array(weeks).fill(null);
      for (const m of meets.slice(0, TRAIN)) {
        const t = weekOf(meets[0].date, m.date);
        y[t] = Math.log(m[id]);
        f[t] = (testSd / PRIORS.sigmaE1rmMedian) ** 2;
      }
      return { exerciseId: id, dose: Array(weeks).fill(2.5), y, obsFactor: f };
    });
    const post = fitSeries(series, 'some', { sex: l.sex, particles: PARTICLES, seed: li + 1 });
    for (const id of LIFTS) {
      const actual = meets[TRAIN][id];
      const fc = goalForecast(post, id, post.liftStrength[id], 2.5, W, actual, ADHERENCE, li + 11, testSd, 3);
      if (!fc) {
        gated++;
        continue;
      }
      rows.push({ lifter: li, band: band(W), below: fc.dots.filter((d) => d < actual).length });
    }
  });
  const stats = (rs: typeof rows) => ({
    n: rs.length,
    central: rs.filter((r) => r.below >= 3 && r.below <= 17).length / rs.length,
    above: rs.filter((r) => r.below >= 10).length / rs.length,
    quintiles: [0, 1, 2, 3, 4].map((q) => rs.filter((r) => Math.min(4, Math.floor(r.below / 4)) === q).length / rs.length),
  });
  const lifters = [...new Set(rows.map((r) => r.lifter))];
  const byLifter = new Map(lifters.map((l) => [l, rows.filter((r) => r.lifter === l)]));
  let state = 12345;
  const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ci = (pick: (rs: typeof rows) => typeof rows, f: (s: ReturnType<typeof stats>) => number) => {
    const vals: number[] = [];
    for (let b = 0; b < 1000; b++) {
      const sample = lifters.flatMap(() => byLifter.get(lifters[Math.floor(rand() * lifters.length)])!);
      const sub = pick(sample);
      if (sub.length) vals.push(f(stats(sub)));
    }
    vals.sort((a, b) => a - b);
    return `${(100 * vals[25]).toFixed(1)}–${(100 * vals[974]).toFixed(1)}`;
  };
  const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
  const lines = [`adherence ${ADHERENCE}: ${rows.length} forecasts from ${lifters.length} lifters (${skipped} skipped for horizon, ${gated} withheld)`];
  for (const b of [null, '2–13 wk', '14–26 wk', '27–104 wk']) {
    const pick = (rs: typeof rows) => (b ? rs.filter((r) => r.band === b) : rs);
    const s = stats(pick(rows));
    lines.push(
      `${b ?? 'all'}: n=${s.n}, central ${pct(s.central)} (95% CI ${ci(pick, (x) => x.central)}), above median ${pct(s.above)} (${ci(pick, (x) => x.above)}), quintiles ${s.quintiles.map(pct).join(' ')}`,
    );
  }
  console.log(lines.join('\n'));
});
