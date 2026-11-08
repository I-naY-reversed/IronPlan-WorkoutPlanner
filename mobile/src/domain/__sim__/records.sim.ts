import { MIN_RECORD_WEEKS } from '../engagement';
import { DAY_SHARE, fitSeries, liftPaths, mulberry32, normal, PRIORS, weeklyObservation, type LiftSeries } from '../model';

const USERS = Number(process.env.SIM_USERS ?? 40);
const KS: number[] = (process.env.SIM_KS ?? '0.1,0.25,0.5,0.75').split(',').map(Number);
const RATES = [0, 0.0017, 0.005, 0.015];
const K_EARLY = Number(process.env.SIM_K_EARLY ?? 0);
const [SESSIONS, SETS] = (process.env.SIM_LOG ?? '2x3').split('x').map(Number);

test('strength record rule', () => {
  const sigma = PRIORS.sigmaE1rmMedian;
  const rows: string[] = [];
  for (const rate of RATES) {
    const fires = KS.map(() => ({ early: 0, late: 0, all: 0 }));
    let earlyN = 0;
    let lateN = 0;
    let allN = 0;
    for (let u = 0; u < USERS; u++) {
      const rand = mulberry32(1000 + u + Math.round(rate * 1e5));
      const weeks = 52;
      let mu = Math.log(100);
      const y: (number | null)[] = [];
      const obsFactor: (number | null)[] = [];
      const dose: number[] = [];
      for (let t = 0; t < weeks; t++) {
        const sets: { logE1rm: number; date: string; precise: boolean }[] = [];
        for (let d = 0; d < SESSIONS; d++) {
          const day = sigma * Math.sqrt(DAY_SHARE) * normal(rand);
          for (let k = 0; k < SETS; k++) sets.push({ logE1rm: mu + day + sigma * Math.sqrt(1 - DAY_SHARE) * normal(rand), date: `d${d}`, precise: false });
        }
        const o = weeklyObservation(sets);
        y.push(o.y);
        obsFactor.push(o.factor);
        dose.push(2.5);
        mu += rate;
      }
      const series: LiftSeries[] = [{ exerciseId: 'lift', dose, y, obsFactor }];
      const experience = rate >= 0.01 ? 'new' : 'some';
      const post = fitSeries(series, experience, { sex: 'male', particles: 1000, seed: u + 1 });
      const [path] = liftPaths(series, post);
      let best = -Infinity;
      let seen = 0;
      for (let t = 0; t < path.mean.length; t++) {
        if (path.observed[t] !== null) seen++;
        const kt = (k: number) => (K_EARLY > k ? k + (K_EARLY - k) * Math.max(0, Math.min(1, (16 - seen) / 9)) : k);
        if (t >= MIN_RECORD_WEEKS) {
          allN++;
          const early = t <= 16;
          const late = t >= 40;
          if (early) earlyN++;
          if (late) lateN++;
          KS.forEach((k, i) => {
            if (path.mean[t] - best > kt(k) * path.sd[t]) {
              fires[i].all++;
              if (early) fires[i].early++;
              if (late) fires[i].late++;
            }
          });
        }
        best = Math.max(best, path.mean[t]);
      }
    }
    rows.push(
      `weekly gain ${(rate * 100).toFixed(2)}%: ` +
        KS.map((k, i) => `k=${k}: ${((100 * fires[i].all) / allN).toFixed(1)}% of weeks (early ${((100 * fires[i].early) / earlyN).toFixed(1)}, late ${((100 * fires[i].late) / lateN).toFixed(1)}), ${((52 * fires[i].all) / allN).toFixed(1)}/yr`).join(' | '),
    );
  }
  console.log(rows.join('\n'));
});
