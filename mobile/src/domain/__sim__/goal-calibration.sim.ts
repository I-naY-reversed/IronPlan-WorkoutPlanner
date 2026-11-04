import { goalForecast } from '../engagement';
import { fitSeries, mulberry32, normal, PRIORS, samplePrior, weeklyGain, type LiftSeries } from '../model';

const USERS = Number(process.env.SIM_USERS ?? 40);
const EXP = (process.env.SIM_EXP ?? 'some') as 'new' | 'some';
const ADHERENCE = Number(process.env.SIM_ADHERENCE ?? 1);

test('goal forecast calibration under the model', () => {
  const a0 = PRIORS.a0.male[EXP];
  let n = 0, central = 0, above = 0, gated = 0;
  for (let u = 0; u < USERS; u++) {
    const [truth] = samplePrior(1, 9000 + u, EXP, 'male');
    const rand = mulberry32(31 + u);
    const series: LiftSeries[] = [];
    const future: number[] = [];
    for (let l = 0; l < 3; l++) {
      let mu = Math.log(80 + 40 * rand());
      const ceiling = mu + truth.h;
      const y: (number | null)[] = [];
      for (let t = 0; t < 16; t++) {
        y.push(mu + truth.sigma * normal(rand));
        mu += (weeklyGain(2.5, truth, a0) * (ceiling - mu)) / truth.h + PRIORS.processSd * normal(rand);
      }
      let m = mu;
      for (let t = 0; t < 12; t++) {
        let n = 0;
        for (let k = 0; k < 3; k++) if (rand() < ADHERENCE) n++;
        m += (weeklyGain((2.5 * n) / 3, truth, a0) * (ceiling - m)) / truth.h + PRIORS.processSd * normal(rand);
      }
      future.push(m);
      series.push({ exerciseId: `lift${l}`, dose: Array(16).fill(2.5), y });
    }
    const post = fitSeries(series, EXP, { sex: 'male', particles: 1000, seed: u + 1 });
    series.forEach((s, l) => {
      const actual = Math.exp(future[l]);
      const fc = goalForecast(post, s.exerciseId, post.liftStrength[s.exerciseId], 2.5, 13, actual, ADHERENCE, u * 7 + l, 0, 3);
      if (!fc) return void gated++;
      n++;
      if (actual >= fc.dots[2] && actual <= fc.dots[17]) central++;
      if (actual > fc.dots[9]) above++;
    });
  }
  console.log(`${EXP}, adherence ${ADHERENCE}: ${n} forecasts (${gated} withheld); between 3rd and 18th dot ${((100 * central) / n).toFixed(1)}% (75%), above median ${((100 * above) / n).toFixed(1)}% (50%)`);
});
