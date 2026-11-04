import { effortWeight, estimateOneRepMax, estimateRir, weekStart, weeklyDose, type LoggedSet } from './dose';
import { EXERCISES_BY_ID, type Muscle } from './exercises';
import FITTED from './fitted-priors.json';
import type { Experience, Sex } from './profile';

const M = FITTED.model;

export const PRIORS = {
  a0: M.a0.value as Record<Sex, Record<Experience, number>>,
  logRhoSd: M.log_rho_sd.value,
  kMedian: M.k_median.value,
  logKSd: M.log_k_sd.value,
  sigmaMedian: M.sigma_median.value,
  sigmaE1rmMedian: Math.hypot(M.sigma_median.value, 1 / (30 + 8)),
  logSigmaSd: M.log_sigma_sd.value,
  processSd: M.process_sd.value,
  headroomMedian: M.headroom_median.value as Record<Sex, Record<Experience, number>>,
  logHeadroomSd: M.log_headroom_sd.value as Record<Sex, number>,
};

export const MIN_LIFT_WEEKS = 3;
export const MAX_EFFECTIVE_SETS = 30;
const MAX_ADAPT_ROUNDS = 6;
const TARGET_ESS_FRACTION = 0.25;
const INFLATION = 2;
const DEFENSIVE_PRIOR_SHARE = 0.1;
const CALIBRATION_DRAWS = 4000;

export type LiftSeries = {
  exerciseId: string;
  dose: number[];
  y: (number | null)[];
  obsFactor?: (number | null)[];
  firstWeek?: string;
};

export const DAY_SHARE = PRIORS.sigmaMedian ** 2 / PRIORS.sigmaE1rmMedian ** 2;
export const COMPARABLE_LOG_GAP = 0.05;
const PRECISE_SET_VARIANCE = 0.25;

export function weeklyObservation(sets: { logE1rm: number; date: string; precise: boolean }[]): { y: number; factor: number } {
  const best = Math.max(...sets.map((x) => x.logE1rm));
  const top = sets.filter((x) => x.logE1rm >= best - COMPARABLE_LOG_GAP);
  const m = top.map((x) => (x.precise ? PRECISE_SET_VARIANCE : 1));
  const raw = m.map((v) => 1 / v);
  const total = raw.reduce((a, b) => a + b, 0);
  const w = raw.map((v) => v / total);
  const y = top.reduce((sum, x, i) => sum + w[i] * x.logE1rm, 0);
  const byDay = new Map<string, number>();
  top.forEach((x, i) => byDay.set(x.date, (byDay.get(x.date) ?? 0) + w[i]));
  const day = [...byDay.values()].reduce((sum, W) => sum + W * W, 0);
  const set = w.reduce((sum, wi, i) => sum + wi * wi * m[i], 0);
  return { y, factor: DAY_SHARE * day + (1 - DAY_SHARE) * set };
}

export type Particle = { rho: number; k: number; sigma: number; h: number };

export type Posterior = {
  particles: Particle[];
  weights: number[];
  ess: number;
  remaining: number[];
  liftStrength: Record<string, { mean: number; sd: number }>;
  liftStates: Record<string, { mu: number[]; P: number[]; remaining: number[] }>;
  lifts: number;
  observations: number;
  experience: Experience;
  sex: Sex;
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normal(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export function samplePrior(n: number, seed = 1, experience: Experience = 'new', sex: Sex = 'male'): Particle[] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, () => ({
    rho: Math.exp(PRIORS.logRhoSd * normal(rand)),
    k: PRIORS.kMedian * Math.exp(PRIORS.logKSd * normal(rand)),
    sigma: PRIORS.sigmaE1rmMedian * Math.exp(PRIORS.logSigmaSd * normal(rand)),
    h: PRIORS.headroomMedian[sex][experience] * Math.exp(PRIORS.logHeadroomSd[sex] * normal(rand)),
  }));
}

export function weeklyGain(dose: number, p: Particle, a0: number, remaining = 1) {
  return p.rho * a0 * (1 - Math.exp(-dose / p.k)) * remaining;
}

export function buildSeries(history: LoggedSet[]): LiftSeries[] {
  if (history.length === 0) return [];
  const weeks = weeklyDose(history);
  const first = new Date(`${weeks[0].week}T00:00:00Z`).getTime();
  const last = new Date(`${weeks.at(-1)!.week}T00:00:00Z`).getTime();
  const n = Math.round((last - first) / (7 * 86400000)) + 1;
  const index = (week: string) => Math.round((new Date(`${week}T00:00:00Z`).getTime() - first) / (7 * 86400000));
  const doseByWeek = new Map(weeks.map((w) => [index(w.week), w.muscles]));

  const byLift = new Map<string, Map<number, { logE1rm: number; date: string; precise: boolean }[]>>();
  for (const s of history) {
    if (s.drop) continue;
    const e1rm = estimateOneRepMax(s.weightKg, s.reps, estimateRir(s).rir);
    if (e1rm === null || !EXERCISES_BY_ID[s.exerciseId]) continue;
    const w = index(weekStart(s.date));
    const lift = byLift.get(s.exerciseId) ?? new Map();
    const list = lift.get(w) ?? [];
    list.push({ logE1rm: Math.log(e1rm), date: s.date, precise: !!s.failed || (s.rpe !== null && s.rpe >= 9) });
    lift.set(w, list);
    byLift.set(s.exerciseId, lift);
  }

  const series: LiftSeries[] = [];
  for (const [exerciseId, weekSets] of byLift) {
    const byWeek = new Map([...weekSets].map(([w, sets]) => [w, weeklyObservation(sets)]));
    if (byWeek.size < MIN_LIFT_WEEKS) continue;
    const primary = (Object.entries(EXERCISES_BY_ID[exerciseId].muscles) as [Muscle, number][])
      .filter(([, w]) => w === 1)
      .map(([m]) => m);
    const dose = Array.from({ length: n }, (_, t) => {
      const muscles = doseByWeek.get(t);
      if (!muscles) return 0;
      return primary.reduce((sum, m) => sum + muscles[m].strengthDose, 0) / primary.length;
    });
    const y = Array.from({ length: n }, (_, t) => byWeek.get(t)?.y ?? null);
    const obsFactor = Array.from({ length: n }, (_, t) => byWeek.get(t)?.factor ?? null);
    series.push({ exerciseId, dose, y, obsFactor, firstWeek: weeks[0].week });
  }
  return series;
}

export type LiftFilter = { ll: number; remaining: number; remainingSd: number; mu: number; P: number };

export function filterLift(series: LiftSeries, p: Particle, a0: number): LiftFilter {
  const start = series.y.findIndex((v) => v !== null);
  if (start < 0) return { ll: 0, remaining: 1, remainingSd: 0, mu: NaN, P: NaN };
  let mu = series.y[start]!;
  let c = mu + p.h;
  const s2 = p.sigma * p.sigma;
  const obsVar = (t: number) => s2 * (series.obsFactor?.[t] ?? 1);
  let Pmm = obsVar(start);
  let Pmc = Pmm;
  let Pcc = Pmm;
  let ll = 0;
  const q2 = PRIORS.processSd * PRIORS.processSd;
  for (let t = start + 1; t < series.y.length; t++) {
    const a = Math.max(0, 1 - weeklyGain(series.dose[t - 1], p, a0) / p.h);
    const b = 1 - a;
    mu = a * mu + b * c;
    const nPmm = a * a * Pmm + 2 * a * b * Pmc + b * b * Pcc + q2;
    const nPmc = a * Pmc + b * Pcc;
    Pmm = nPmm;
    Pmc = nPmc;
    const y = series.y[t];
    if (y === null) continue;
    const S = Pmm + obsVar(t);
    const r = y - mu;
    ll += -0.5 * (Math.log(2 * Math.PI * S) + (r * r) / S);
    const Km = Pmm / S;
    const Kc = Pmc / S;
    mu += Km * r;
    c += Kc * r;
    Pcc -= Kc * Pmc;
    Pmc -= Km * Pmc;
    Pmm -= Km * Pmm;
  }
  return {
    ll,
    remaining: Math.max(0, Math.min(1, (c - mu) / p.h)),
    remainingSd: Math.sqrt(Math.max(0, Pcc + Pmm - 2 * Pmc)) / p.h,
    mu,
    P: Pmm,
  };
}

export function liftLogLikelihood(series: LiftSeries, p: Particle, a0: number): number {
  return filterLift(series, p, a0).ll;
}

const DIMS = 4;
const toVec = (p: Particle) => [Math.log(p.rho), Math.log(p.k), Math.log(p.sigma), Math.log(p.h)];
const fromVec = (v: number[]): Particle => ({ rho: Math.exp(v[0]), k: Math.exp(v[1]), sigma: Math.exp(v[2]), h: Math.exp(v[3]) });
const priorMean = (experience: Experience, sex: Sex) => [
  0, Math.log(PRIORS.kMedian), Math.log(PRIORS.sigmaE1rmMedian), Math.log(PRIORS.headroomMedian[sex][experience]),
];
const priorSd = (sex: Sex) => [PRIORS.logRhoSd, PRIORS.logKSd, PRIORS.logSigmaSd, PRIORS.logHeadroomSd[sex]];

function logPrior(v: number[], mean: number[], sd: number[]) {
  return v.reduce((s, x, i) => s - 0.5 * ((x - mean[i]) / sd[i]) ** 2 - Math.log(sd[i] * Math.sqrt(2 * Math.PI)), 0);
}

function cholesky(c: number[][]): number[][] | null {
  const n = c.length;
  const L = c.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = c[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 1e-12) return null;
        L[i][i] = Math.sqrt(sum);
      } else L[i][j] = sum / L[j][j];
    }
  }
  return L;
}

function logGaussian(v: number[], mean: number[], L: number[][]) {
  const n = v.length;
  const z = new Array<number>(n).fill(0);
  let logDet = 0;
  for (let i = 0; i < n; i++) {
    let sum = v[i] - mean[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * z[k];
    z[i] = sum / L[i][i];
    logDet += Math.log(L[i][i]);
  }
  return -0.5 * z.reduce((s, x) => s + x * x, 0) - logDet - (n / 2) * Math.log(2 * Math.PI);
}

function normalise(logW: number[]) {
  const max = Math.max(...logW);
  const raw = logW.map((l) => Math.exp(l - max));
  const total = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map((w) => w / total);
  return { weights, ess: 1 / weights.reduce((sum, w) => sum + w * w, 0) };
}

export type FitOptions = { particles?: number; seed?: number; sex?: Sex };

export function fitSeries(series: LiftSeries[], experience: Experience, options: FitOptions = {}): Posterior {
  const n = options.particles ?? 2000;
  const sex = options.sex ?? 'male';
  const rand = mulberry32((options.seed ?? 1) * 7919);
  const a0 = PRIORS.a0[sex][experience];
  const mean0 = priorMean(experience, sex);
  const PRIOR_SD = priorSd(sex);
  const evaluate = (p: Particle) => {
    let ll = 0;
    let remaining = 0;
    let remainingVar = 0;
    const lifts: { mu: number; P: number; remaining: number; remainingSd: number }[] = [];
    for (const s of series) {
      const f = filterLift(s, p, a0);
      ll += f.ll;
      remaining += f.remaining;
      remainingVar += f.remainingSd ** 2;
      lifts.push({ mu: f.mu, P: f.P, remaining: f.remaining, remainingSd: f.remainingSd });
    }
    const n = series.length;
    return { ll, remaining: n ? remaining / n : 1, remainingSd: n ? Math.sqrt(remainingVar) / n : 0, lifts };
  };
  const observations = series.reduce((sum, s) => sum + s.y.filter((v) => v !== null).length, 0);

  let particles = samplePrior(n, options.seed ?? 1, experience, sex);
  let evals = particles.map(evaluate);
  let { weights, ess } = normalise(evals.map((e) => e.ll));

  for (let round = 0; round < MAX_ADAPT_ROUNDS && ess < n * TARGET_ESS_FRACTION; round++) {
    const vecs = particles.map(toVec);
    const dims = [...Array(DIMS).keys()];
    const mean = dims.map((d) => vecs.reduce((s, v, i) => s + v[d] * weights[i], 0));
    const cov = dims.map((a) =>
      dims.map((b) => INFLATION * vecs.reduce((s, v, i) => s + (v[a] - mean[a]) * (v[b] - mean[b]) * weights[i], 0)),
    );
    for (const d of dims) cov[d][d] = Math.max(cov[d][d], (PRIOR_SD[d] * 0.05) ** 2);
    const L = cholesky(cov);
    if (!L) break;
    const next: Particle[] = [];
    const nextEvals: ReturnType<typeof evaluate>[] = [];
    const logW: number[] = [];
    for (let i = 0; i < n; i++) {
      let v: number[];
      if (rand() < DEFENSIVE_PRIOR_SHARE) {
        v = mean0.map((m, d) => m + PRIOR_SD[d] * normal(rand));
      } else {
        const z = dims.map(() => normal(rand));
        v = dims.map((r) => mean[r] + dims.reduce((s, c) => s + L[r][c] * z[c], 0));
      }
      const lq = Math.log(
        DEFENSIVE_PRIOR_SHARE * Math.exp(logPrior(v, mean0, PRIOR_SD)) + (1 - DEFENSIVE_PRIOR_SHARE) * Math.exp(logGaussian(v, mean, L)),
      );
      const p = fromVec(v);
      const e = evaluate(p);
      next.push(p);
      nextEvals.push(e);
      logW.push(e.ll + logPrior(v, mean0, PRIOR_SD) - lq);
    }
    particles = next;
    evals = nextEvals;
    ({ weights, ess } = normalise(logW));
  }

  const liftStrength: Posterior['liftStrength'] = {};
  series.forEach((s, l) => {
    let mean = 0;
    let second = 0;
    evals.forEach((e, i) => {
      mean += weights[i] * e.lifts[l].mu;
      second += weights[i] * (e.lifts[l].P + e.lifts[l].mu ** 2);
    });
    liftStrength[s.exerciseId] = { mean, sd: Math.sqrt(Math.max(0, second - mean * mean)) };
  });

  const drawRand = mulberry32((options.seed ?? 1) * 104729);
  const remaining = evals.map((e) => Math.max(0, Math.min(1, e.remaining + e.remainingSd * normal(drawRand))));
  const liftStates: Posterior['liftStates'] = {};
  series.forEach((s, l) => {
    liftStates[s.exerciseId] = {
      mu: evals.map((e) => e.lifts[l].mu),
      P: evals.map((e) => e.lifts[l].P),
      remaining: evals.map((e) => Math.max(0, Math.min(1, e.lifts[l].remaining + e.lifts[l].remainingSd * normal(drawRand)))),
    };
  });
  return { particles, weights, ess, remaining, liftStrength, liftStates, lifts: series.length, observations, experience, sex };
}

export const MODEL_WINDOW_WEEKS = 104;

export function fitModel(
  history: LoggedSet[],
  experience: Experience,
  today: string,
  options?: FitOptions,
) {
  return fitSeries(windowedSeries(history, today), experience, options);
}

export function windowedSeries(history: LoggedSet[], today: string): LiftSeries[] {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - MODEL_WINDOW_WEEKS * 7);
  const from = cutoff.toISOString().slice(0, 10);
  return buildSeries(history.filter((s) => s.date >= from));
}

export type Interval = { mean: number; low: number; high: number };

export const SIGMA_1: [number, number] = [0.1587, 0.8413];
export const CENTRAL_80: [number, number] = [0.1, 0.9];

export function summarize(
  post: Posterior,
  f: (p: Particle, remaining: number) => number,
  [lo, hi]: [number, number] = SIGMA_1,
): Interval {
  const pairs = post.particles.map((p, i) => ({ v: f(p, post.remaining[i]), w: post.weights[i] })).sort((a, b) => a.v - b.v);
  const quantile = (q: number) => {
    let acc = 0;
    for (const { v, w } of pairs) {
      acc += w;
      if (acc >= q) return v;
    }
    return pairs.at(-1)!.v;
  };
  const mean = pairs.reduce((s, { v, w }) => s + v * w, 0);
  return { mean, low: quantile(lo), high: quantile(hi) };
}

function weightedSd(post: Posterior, f: (p: Particle) => number) {
  const mean = post.particles.reduce((s, p, i) => s + f(p) * post.weights[i], 0);
  const v = post.particles.reduce((s, p, i) => s + (f(p) - mean) ** 2 * post.weights[i], 0);
  return Math.sqrt(v);
}

export function personalization(post: Posterior): number {
  const sd = weightedSd(post, (p) => Math.log(p.rho));
  return Math.max(0, Math.min(1, 1 - sd / PRIORS.logRhoSd));
}

export function progressLearned(series: LiftSeries[], post: Posterior, dose: number, options: FitOptions = {}): number {
  if (series.length === 0 || post.observations <= series.length) return 0;
  const masked = series.map((s) => {
    const first = s.y.findIndex((v) => v !== null);
    return { ...s, y: s.y.map((v, i) => (i === first ? v : null)) };
  });
  const base = fitSeries(masked, post.experience, { ...options, sex: post.sex });
  const a0 = PRIORS.a0[post.sex][post.experience];
  const spread = (q: Posterior) => {
    const v = q.particles.map((p, i) => [Math.log(weeklyGain(dose, p, a0, Math.max(q.remaining[i], 1e-6))), q.weights[i]]);
    v.sort((x, y) => x[0] - y[0]);
    const at = (level: number) => {
      let c = 0;
      for (const [x, w] of v) if ((c += w) >= level) return x;
      return v[v.length - 1][0];
    };
    return (at(SIGMA_1[1]) - at(SIGMA_1[0])) / 2;
  };
  const b = spread(base);
  return b > 0 ? Math.min(1, 1 - spread(post) / b) : 0;
}

export function calibratedCost(prior: Particle[], a0: number, defaultEffective: number) {
  return prior.reduce((s, p) => s + (p.rho * a0 * Math.exp(-defaultEffective / p.k)) / p.k, 0) / prior.length;
}

export type VolumeRecommendation = {
  effectiveSets: number;
  effectiveSetsRange: Interval;
  weeklyGain: Interval;
};

export function optimizeVolume(post: Posterior, defaultEffective: number, weight = 1): VolumeRecommendation {
  const a0 = PRIORS.a0[post.sex][post.experience];
  if (weight <= 0) return { effectiveSets: 0, effectiveSetsRange: { mean: 0, low: 0, high: 0 }, weeklyGain: { mean: 0, low: 0, high: 0 } };
  const meanRemaining = post.remaining.reduce((s, r, i) => s + r * post.weights[i], 0);
  const cost = calibratedCost(samplePrior(CALIBRATION_DRAWS, 1, post.experience, post.sex), a0, defaultEffective) * meanRemaining;
  let best = { e: defaultEffective, value: -Infinity };
  for (let e = 0; e <= MAX_EFFECTIVE_SETS + 1e-9; e += 0.25) {
    const gain = post.particles.reduce((s, p, i) => s + post.weights[i] * weeklyGain(e, p, a0, post.remaining[i]), 0);
    const value = weight * gain - cost * e;
    if (value > best.value) best = { e, value };
  }
  const perParticle = (p: Particle, r: number) => {
    const arg = (weight * p.rho * a0 * r) / (p.k * cost);
    return arg <= 1 ? 0 : Math.min(MAX_EFFECTIVE_SETS, p.k * Math.log(arg));
  };
  return {
    effectiveSets: best.e,
    effectiveSetsRange: summarize(post, perParticle),
    weeklyGain: summarize(post, (p, r) => weeklyGain(best.e, p, a0, r)),
  };
}

export function potentialPct(post: Posterior): Interval {
  const f = (p: Particle, r: number) => (Math.exp(p.h * r) - 1) * 100;
  const { low, high } = summarize(post, f);
  return { mean: summarize(post, f, [0.5, 0.5]).low, low, high };
}

export function plannedEffortWeight(targetRir: number) {
  return effortWeight(estimateRir({ rpe: null, rir: targetRir }).rir);
}

export type LiftPath = {
  exerciseId: string;
  week: number[];
  mean: number[];
  sd: number[];
  observed: (number | null)[];
  next: { mean: number; sd: number };
  weekStart?: string[];
};

function centralParticle(post: Posterior): Particle {
  const avg = (f: (p: Particle) => number) => Math.exp(post.particles.reduce((s, p, i) => s + post.weights[i] * Math.log(f(p)), 0));
  return { rho: avg((p) => p.rho), k: avg((p) => p.k), sigma: avg((p) => p.sigma), h: avg((p) => p.h) };
}

export function liftPaths(series: LiftSeries[], post: Posterior): LiftPath[] {
  const p = centralParticle(post);
  const a0 = PRIORS.a0[post.sex][post.experience];
  const q2 = PRIORS.processSd * PRIORS.processSd;
  const s2 = p.sigma * p.sigma;
  return series.map((s) => {
    const start = s.y.findIndex((v) => v !== null);
    let mu = s.y[start]!;
    let c = mu + p.h;
    const ov = (t: number) => s2 * (s.obsFactor?.[t] ?? 1);
    let Pmm = ov(start), Pmc = Pmm, Pcc = Pmm;
    const out: LiftPath = { exerciseId: s.exerciseId, week: [0], mean: [mu], sd: [Math.sqrt(Pmm)], observed: [s.y[start]], next: { mean: mu, sd: 0 } };
    for (let t = start + 1; t < s.y.length; t++) {
      const a = Math.max(0, 1 - weeklyGain(s.dose[t - 1], p, a0) / p.h);
      const b = 1 - a;
      mu = a * mu + b * c;
      const nPmm = a * a * Pmm + 2 * a * b * Pmc + b * b * Pcc + q2;
      Pmc = a * Pmc + b * Pcc;
      Pmm = nPmm;
      const y = s.y[t];
      if (y !== null) {
        const S = Pmm + ov(t), r = y - mu, Km = Pmm / S, Kc = Pmc / S;
        mu += Km * r; c += Kc * r;
        Pcc -= Kc * Pmc; Pmc -= Km * Pmc; Pmm -= Km * Pmm;
      }
      out.week.push(t - start);
      out.mean.push(mu);
      out.sd.push(Math.sqrt(Pmm));
      out.observed.push(y);
    }
    const last = s.dose[s.dose.length - 1] ?? 0;
    const a = Math.max(0, 1 - weeklyGain(last, p, a0) / p.h);
    out.next = { mean: a * mu + (1 - a) * c, sd: Math.sqrt(Pmm + q2 + s2) };
    if (s.firstWeek) {
      const t0 = Date.parse(`${s.firstWeek}T00:00:00Z`);
      out.weekStart = out.week.map((w) => new Date(t0 + (start + w) * 7 * 86400000).toISOString().slice(0, 10));
    }
    return out;
  });
}

export function normalQuantile(prob: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (prob < lo) {
    const q = Math.sqrt(-2 * Math.log(prob));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (prob > 1 - lo) return -normalQuantile(1 - prob);
  const q = prob - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function quantileDots(mean: number, sd: number, n = 20): number[] {
  return Array.from({ length: n }, (_, i) => mean + sd * normalQuantile((i + 0.5) / n));
}
