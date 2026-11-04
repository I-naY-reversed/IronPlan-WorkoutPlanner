import { CENTRAL_80, fitSeries, mulberry32, normal, PRIORS, samplePrior, summarize, weeklyGain, type LiftSeries } from '../model';
import { personalization } from '../model';

const USERS = Number(process.env.SIM_USERS ?? 40);
const EXP = (process.env.SIM_EXP ?? 'some') as 'new' | 'some' | 'experienced';
const WEEKS = [6, 12, 26];

test('parameter recovery', () => {
  const rand = mulberry32(2026);
  const rows: string[] = [];
  for (const weeks of WEEKS) {
    let rhoIn80 = 0;
    let contraction = 0;
    let predIn1sd = 0;
    let predN = 0;
    for (let u = 0; u < USERS; u++) {
      const [truth] = samplePrior(1, 1000 + u + weeks * 97, EXP, 'male');
      const a0 = PRIORS.a0.male[EXP];
      const series: LiftSeries[] = [];
      const nextObs: number[] = [];
      for (let l = 0; l < 3; l++) {
        let mu = Math.log(80 + 40 * rand());
        const ceiling = mu + truth.h;
        const dose: number[] = [];
        const y: (number | null)[] = [];
        for (let t = 0; t <= weeks; t++) {
          const e = Math.max(0, 2.5 + 0.8 * normal(rand));
          dose.push(e);
          y.push(rand() < 0.85 ? mu + truth.sigma * normal(rand) : null);
          const r = weeklyGain(e, truth, a0);
          mu = mu + (r * (ceiling - mu)) / truth.h + PRIORS.processSd * normal(rand);
        }
        nextObs.push(mu + truth.sigma * normal(rand));
        series.push({ exerciseId: `lift${l}`, dose: dose.slice(0, weeks + 1), y: y.slice(0, weeks + 1) });
      }
      const post = fitSeries(series, EXP, { sex: 'male', particles: 1000, seed: u + 1 });
      const ci = summarize(post, (p) => p.rho, CENTRAL_80);
      if (truth.rho >= ci.low && truth.rho <= ci.high) rhoIn80++;
      contraction += personalization(post);
      series.forEach((s, l) => {
        const est = post.liftStrength[s.exerciseId];
        if (!est) return;
        const sd = Math.hypot(est.sd, PRIORS.sigmaE1rmMedian, PRIORS.processSd);
        predN++;
        if (Math.abs(nextObs[l] - est.mean) <= sd) predIn1sd++;
      });
    }
    rows.push(
      `${weeks} weeks: true ρ in 80% interval ${((100 * rhoIn80) / USERS).toFixed(0)}%, ` +
        `mean score ${(contraction / USERS).toFixed(2)}, next-week obs within 1σ ${((100 * predIn1sd) / Math.max(1, predN)).toFixed(0)}% (nominal 68%)`,
    );
  }
  console.log(`${EXP}\n` + rows.join('\n'));
});
