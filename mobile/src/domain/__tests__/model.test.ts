import { reportBias, type LoggedSet } from '../dose';
import {
  buildSeries,
  CENTRAL_80,
  fitSeries,
  liftLogLikelihood,
  mulberry32,
  normal,
  optimizeVolume,
  personalization,
  potentialPct,
  PRIORS,
  summarize,
  weeklyGain,
  type LiftSeries,
  type Particle,
} from '../model';

function simulate(truth: Particle, weeks: number, lifts: number, seed: number, a0 = PRIORS.a0.male.new): LiftSeries[] {
  const rand = mulberry32(seed);
  return Array.from({ length: lifts }, (_, l) => {
    const dose = Array.from({ length: weeks }, (_, t) => (Math.floor(t / 4) % 2 === 0 ? 3 : 14) + l);
    const start = Math.log(60 + 20 * l);
    const ceiling = start + truth.h;
    let mu = start;
    const y: (number | null)[] = [];
    for (let t = 0; t < weeks; t++) {
      y.push(mu + truth.sigma * normal(rand));
      mu += weeklyGain(dose[t], truth, a0, (ceiling - mu) / truth.h) + PRIORS.processSd * normal(rand);
    }
    return { exerciseId: `lift${l}`, dose, y };
  });
}

const drawTruth = (rand: () => number): Particle => ({
  rho: Math.exp(PRIORS.logRhoSd * normal(rand)),
  k: PRIORS.kMedian * Math.exp(PRIORS.logKSd * normal(rand)),
  sigma: PRIORS.sigmaMedian * Math.exp(PRIORS.logSigmaSd * normal(rand)),
  h: PRIORS.headroomMedian.male.new * Math.exp(PRIORS.logHeadroomSd.male * normal(rand)),
});

describe('liftLogLikelihood', () => {
  it('prefers the true parameters over clearly wrong ones', () => {
    const truth = { rho: 1.5, k: 5, sigma: 0.02, h: 0.5 };
    const data = simulate(truth, 24, 3, 7);
    const ll = (p: Particle) => data.reduce((s, d) => s + liftLogLikelihood(d, p, PRIORS.a0.male.new), 0);
    expect(ll(truth)).toBeGreaterThan(ll({ ...truth, rho: 0.3 }));
    expect(ll(truth)).toBeGreaterThan(ll({ ...truth, rho: 4 }));
  });
});

describe('fitSeries', () => {
  it('returns the prior when there is no data', () => {
    const post = fitSeries([], 'new');
    expect(post.ess).toBeCloseTo(post.particles.length);
    expect(personalization(post)).toBeLessThan(0.05);
  });

  it('tightens the responsiveness estimate as data accumulates', () => {
    const truth = { rho: 1.8, k: 5, sigma: 0.025, h: 0.5 };
    const width = (weeks: number) => {
      const s = summarize(fitSeries(simulate(truth, weeks, 3, 11), 'new'), (p) => Math.log(p.rho));
      return s.high - s.low;
    };
    expect(width(24)).toBeLessThan(width(6));
  });

  it('has roughly calibrated 80% intervals across simulated users', () => {
    const rand = mulberry32(99);
    let covered = 0;
    const users = 30;
    for (let u = 0; u < users; u++) {
      const truth = drawTruth(rand);
      const post = fitSeries(simulate(truth, 16, 3, 1000 + u), 'new', { particles: 1500, seed: u + 1 });
      const s = summarize(post, (p) => p.rho, CENTRAL_80);
      if (truth.rho >= s.low && truth.rho <= s.high) covered++;
    }
    // A calibrated 80% interval covers Binomial(30, 0.8) users; 18–29 of 30 holds 99.6% of the time.
    expect(covered / users).toBeGreaterThanOrEqual(0.6);
    expect(covered / users).toBeLessThanOrEqual(0.97);
  });
});

describe('optimizeVolume', () => {
  it('reproduces the default volume under the prior', () => {
    const rec = optimizeVolume(fitSeries([], 'new'), 6);
    expect(Math.abs(rec.effectiveSets - 6)).toBeLessThanOrEqual(0.5);
  });

  it('recommends more volume for a strong responder than a weak one', () => {
    const strong = fitSeries(simulate({ rho: 2.5, k: 8, sigma: 0.02, h: 0.5 }, 24, 3, 5), 'new');
    const weak = fitSeries(simulate({ rho: 0.4, k: 8, sigma: 0.02, h: 0.5 }, 24, 3, 5), 'new');
    expect(optimizeVolume(strong, 6).effectiveSets).toBeGreaterThan(optimizeVolume(weak, 6).effectiveSets);
  });
});

describe('plateau', () => {
  it('slows gains as a lift approaches its ceiling, whatever the volume', () => {
    const p = { rho: 1, k: 5, sigma: 0.03, h: 0.3 };
    const [lift] = simulate({ ...p, sigma: 1e-6 }, 200, 1, 3);
    const avgGain = (from: number) => (lift.y[from + 20]! - lift.y[from]!) / 20;
    expect(Math.abs(avgGain(179))).toBeLessThan(avgGain(0) / 3);
    expect(lift.y[199]! - lift.y[0]!).toBeLessThan(p.h + 0.02);
  });

  it('detects a plateaued lifter and predicts smaller gains for them', () => {
    const fast = { rho: 2, k: 5, sigma: 0.02, h: 0.15 };
    const open = { rho: 2, k: 5, sigma: 0.02, h: 1.2 };
    const plateaued = fitSeries(simulate(fast, 40, 3, 21), 'new');
    const progressing = fitSeries(simulate(open, 40, 3, 21), 'new');
    expect(potentialPct(plateaued).mean).toBeLessThan(potentialPct(progressing).mean);
    expect(optimizeVolume(plateaued, 6).weeklyGain.mean).toBeLessThan(optimizeVolume(progressing, 6).weeklyGain.mean);
  });

  it('does not cut volume to nothing near a ceiling', () => {
    const plateaued = fitSeries(simulate({ rho: 2, k: 5, sigma: 0.02, h: 0.15 }, 40, 3, 21), 'new');
    expect(optimizeVolume(plateaued, 6).effectiveSets).toBeGreaterThan(3);
  });

  it('uses less headroom in its prior for experienced lifters', () => {
    expect(potentialPct(fitSeries([], 'experienced')).mean).toBeLessThan(potentialPct(fitSeries([], 'new')).mean);
  });
});

describe('buildSeries', () => {
  it('builds weekly best e1RM per lift and the primary-muscle dose, skipping sparse lifts', () => {
    const history: LoggedSet[] = [];
    for (const [i, date] of ['2026-09-07', '2026-09-14', '2026-09-28'].entries()) {
      history.push({ date, exerciseId: 'back_squat', reps: 5, weightKg: 100 + 5 * i, rpe: null, rir: 2 });
      history.push({ date, exerciseId: 'back_squat', reps: 5, weightKg: 80, rpe: null, rir: 4 });
    }
    history.push({ date: '2026-09-07', exerciseId: 'leg_curl', reps: 10, weightKg: 40, rpe: null, rir: 2 });
    const series = buildSeries(history);
    expect(series.map((s) => s.exerciseId)).toEqual(['back_squat']);
    const [squat] = series;
    expect(squat.y).toHaveLength(4);
    expect(squat.y[2]).toBeNull();
    expect(squat.dose[2]).toBe(0);
    expect(squat.dose[0]).toBeGreaterThan(0);
    expect(Math.exp(squat.y[0]!)).toBeCloseTo(100 * (1 + (5 + 2 + reportBias(2, 5)) / 30));
  });
});
