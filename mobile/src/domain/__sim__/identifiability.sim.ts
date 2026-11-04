import { CENTRAL_80, DAY_SHARE, fitSeries, weeklyObservation, mulberry32, normal, PRIORS, samplePrior, summarize, weeklyGain, type LiftSeries, type Particle, type Posterior } from '../model';

const USERS = Number(process.env.SIM_USERS ?? 30);
const PARTICLES = Number(process.env.SIM_PARTICLES ?? 1000);
const EXP = (process.env.SIM_EXP ?? 'some') as 'new' | 'some' | 'experienced';
const SCENARIOS = (process.env.SIM_SCENARIOS ?? 'steady:26:1,blocks:26:1,steady:104:1,blocks:104:1,blocks:104:0.6').split(',');

function weightedSd(post: Posterior, f: (p: Particle, r: number) => number) {
  const v = post.particles.map((p, i) => f(p, post.remaining[i]));
  const m = v.reduce((s, x, i) => s + x * post.weights[i], 0);
  return Math.sqrt(v.reduce((s, x, i) => s + (x - m) ** 2 * post.weights[i], 0));
}

test('identifiability by scenario', () => {
  const a0 = PRIORS.a0.male[EXP];
  const prior = samplePrior(4000, 7, EXP, 'male');
  const sdOf = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  };
  const priorSd = {
    rho: sdOf(prior.map((p) => Math.log(p.rho))),
    k: sdOf(prior.map((p) => Math.log(p.k))),
    rate: sdOf(prior.map((p) => Math.log(weeklyGain(2.5, p, a0)))),
  };
  const rows: string[] = [`${EXP} (prior sd: log ρ ${priorSd.rho.toFixed(2)}, log k ${priorSd.k.toFixed(2)}, log rate at full headroom ${priorSd.rate.toFixed(2)})`];
  for (const spec of SCENARIOS) {
    const [pattern, weeksStr, noiseStr, setsSpec, obsMode] = spec.split(':');
    const weeks = Number(weeksStr);
    const noise = Number(noiseStr);
    const [S, N] = setsSpec ? setsSpec.split('x').map(Number) : [0, 0];
    const rand = mulberry32(99 + weeks);
    const acc = { rho: 0, k: 0, rate: 0, rhoIn: 0, rateIn: 0 };
    for (let u = 0; u < USERS; u++) {
      const [truth] = samplePrior(1, 5000 + u, EXP, 'male');
      const sigma = truth.sigma * noise;
      const series: LiftSeries[] = [];
      let remainingTruth = 0;
      for (let l = 0; l < 3; l++) {
        let mu = Math.log(80 + 40 * rand());
        const ceiling = mu + truth.h;
        const dose: number[] = [];
        const y: (number | null)[] = [];
        const obsFactor: (number | null)[] = [];
        for (let t = 0; t <= weeks; t++) {
          const base = pattern === 'blocks' ? (Math.floor(t / 4) % 2 === 0 ? 1 : 4) : 2.5;
          const e = Math.max(0, base + 0.4 * normal(rand));
          dose.push(e);
          if (rand() >= 0.85) {
            y.push(null);
            obsFactor.push(null);
          } else if (S > 0) {
            const sets: { logE1rm: number; date: string; precise: boolean }[] = [];
            for (let d = 0; d < S; d++) {
              const dayEffect = sigma * Math.sqrt(DAY_SHARE) * normal(rand);
              for (let k = 0; k < N; k++) sets.push({ logE1rm: mu + dayEffect + sigma * Math.sqrt(1 - DAY_SHARE) * normal(rand), date: `d${d}`, precise: false });
            }
            if (obsMode === 'max') {
              y.push(Math.max(...sets.map((x) => x.logE1rm)));
              obsFactor.push(1);
            } else {
              const o = weeklyObservation(sets);
              y.push(o.y);
              obsFactor.push(o.factor);
            }
          } else {
            y.push(mu + sigma * normal(rand));
            obsFactor.push(1);
          }
          if (t === weeks) remainingTruth += Math.max(0, (ceiling - mu) / truth.h) / 3;
          mu = mu + (weeklyGain(e, truth, a0) * (ceiling - mu)) / truth.h + PRIORS.processSd * normal(rand);
        }
        series.push({ exerciseId: `lift${l}`, dose, y, obsFactor });
      }
      const post = fitSeries(series, EXP, { sex: 'male', particles: PARTICLES, seed: u + 1 });
      const masked = series.map((s) => {
        const first = s.y.findIndex((v) => v !== null);
        return { ...s, y: s.y.map((v, i) => (i === first ? v : null)) };
      });
      const base = fitSeries(masked, EXP, { sex: 'male', particles: PARTICLES, seed: u + 1 });
      const rateLog = (p: Particle, r: number) => Math.log(weeklyGain(2.5, p, a0, Math.max(r, 1e-6)));
      acc.rho += 1 - weightedSd(post, (p) => Math.log(p.rho)) / weightedSd(base, (p) => Math.log(p.rho));
      acc.k += 1 - weightedSd(post, (p) => Math.log(p.k)) / weightedSd(base, (p) => Math.log(p.k));
      acc.rate += 1 - weightedSd(post, rateLog) / weightedSd(base, rateLog);
      const ci = summarize(post, (p) => p.rho, CENTRAL_80);
      if (truth.rho >= ci.low && truth.rho <= ci.high) acc.rhoIn++;
      const rate = summarize(post, (p, r) => weeklyGain(2.5, p, a0, r), CENTRAL_80);
      const trueRate = weeklyGain(2.5, truth, a0, remainingTruth);
      if (trueRate >= rate.low && trueRate <= rate.high) acc.rateIn++;
    }
    const pct = (x: number) => `${Math.round((100 * x) / USERS)}%`;
    rows.push(
      `${pattern.padEnd(6)} ${String(weeks).padStart(3)} wk ${setsSpec ? `${setsSpec} ${obsMode}` : `noise ${noise}`}: learned ρ ${(acc.rho / USERS).toFixed(2)}, k ${(acc.k / USERS).toFixed(2)}, rate ${(acc.rate / USERS).toFixed(2)} | in 80%: ρ ${pct(acc.rhoIn)}, rate ${pct(acc.rateIn)}`,
    );
  }
  console.log(rows.join('\n'));
});
