/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { reportBias, weeklyDose, type LoggedSet } from '../dose';
import { EXERCISES_BY_ID, type Muscle } from '../exercises';
import { DEFAULT_WEEKLY_SETS, generatePlan } from '../generator';
import { calibratedCost, DAY_SHARE, MAX_EFFECTIVE_SETS, mulberry32, normal, optimizeVolume, plannedEffortWeight, PRIORS, samplePrior, SIGMA_1, summarize, type Particle, type Posterior } from '../model';
import { ADDED_WEIGHT_LIFTS } from '../progress';
import { clampProfile, DEFAULT_DAYS, DEFAULT_PROFILE, type Experience, type Goal, type Profile, type Sex } from '../profile';
import { estimateFromBracket, updateAfterSet, type LoadEstimate } from '../session-update';
import { COMBAT_SPORTS, SPORT_PROFILES, type Sport } from '../sports';

const PEOPLE = Number(process.env.SIM_PEOPLE ?? 90);
const WEEKS = Number(process.env.SIM_WEEKS ?? 26);
const FIRST = Number(process.env.SIM_FIRST ?? 0);
const OBS = process.env.SIM_OBS === 'matched' ? 'matched' : 'current';
const DOSE = (['random', 'blocks', 'weeks'] as const).find((d) => d === process.env.SIM_DOSE) ?? 'plan';
const LOADS = (['double', 'linear'] as const).find((d) => d === process.env.SIM_LOADS) ?? 'app';
const DELOAD = 0.9;
const STALLS = 3;
const OUT = process.env.SIM_OUT ?? join(__dirname, '../../../../analysis/optimization/results.json');
const START = '2026-01-05';
const CHECKPOINTS = [1, 2, 4, 6, 8, 12, 16, 20, 26, 39, 52].filter((w) => w <= WEEKS);
const LEVELS = [50, 68, 80, 90, 95];

type Person = {
  id: number;
  cohort: 'on_prior' | 'off_prior';
  sex: Sex;
  ageYears: number;
  heightCm: number;
  bodyweightKg: number;
  experience: Experience;
  sport: Sport;
  goal: Goal;
  daysPerWeek: number;
  truth: Particle;
};

const dayOf = (week: number, weekday: number) => new Date(Date.parse(`${START}T00:00:00Z`) + (week * 7 + weekday) * 86400000).toISOString().slice(0, 10);
const pick = <T,>(rand: () => number, items: readonly T[], weights?: number[]) => {
  const w = weights ?? items.map(() => 1);
  let u = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((u -= w[i]) <= 0) return items[i];
  return items[items.length - 1];
};

function makePerson(id: number): Person {
  const rand = mulberry32(9000 + id);
  const cohort = id % 3 === 2 ? 'off_prior' : 'on_prior';
  const sex = pick(rand, ['male', 'female'] as const, [0.6, 0.4]);
  const heightCm = Math.round(sex === 'male' ? 177 + 7 * normal(rand) : 164 + 6 * normal(rand));
  const bmi = Math.min(36, Math.max(19, 25 + 3.5 * normal(rand)));
  const bodyweightKg = Math.round(bmi * (heightCm / 100) ** 2 * 10) / 10;
  const experience = pick(rand, ['new', 'some', 'experienced'] as const, [0.4, 0.35, 0.25]);
  const sport = pick(rand, ['general', 'general', 'general', 'muay_thai', 'boxing', 'wrestling', 'powerlifting'] as const);
  const goal = sport === 'general' ? pick(rand, ['strength', 'general'] as const) : SPORT_PROFILES[sport].volumeGoal;
  const daysPerWeek = pick(rand, [2, 3, 4, 5], [0.15, 0.45, 0.3, 0.1]);
  const truth = samplePrior(1, 500 + id, experience, sex)[0];
  if (cohort === 'off_prior') {
    truth.rho = truth.rho ** 2;
    truth.k = PRIORS.kMedian * (truth.k / PRIORS.kMedian) ** 2;
  }
  return { id, cohort, sex, ageYears: 18 + Math.floor(rand() * 43), heightCm, bodyweightKg, experience, sport, goal, daysPerWeek, truth };
}

function profileOf(p: Person): Profile {
  const trainingDays = DEFAULT_DAYS[p.daysPerWeek];
  const matDays = COMBAT_SPORTS.includes(p.sport) ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !trainingDays.includes(d)).slice(0, 2) : [];
  return clampProfile({
    ...DEFAULT_PROFILE, sex: p.sex, ageYears: p.ageYears, heightCm: p.heightCm, bodyweightKg: p.bodyweightKg, experience: p.experience,
    sport: p.sport, goal: p.goal, daysPerWeek: p.daysPerWeek, trainingDays, matDays, confirmed: true, introSeen: true,
  });
}

function primaryDose(sets: LoggedSet[], exerciseId: string) {
  const w = weeklyDose(sets);
  if (!w.length) return 0;
  const primary = (Object.entries(EXERCISES_BY_ID[exerciseId].muscles) as [Muscle, number][]).filter(([, x]) => x === 1).map(([m]) => m);
  return primary.reduce((s, m) => s + w[0].muscles[m].strengthDose, 0) / primary.length;
}

function reportedRir(trueRir: number, reps: number) {
  let lo = 0;
  let hi = trueRir;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (mid + reportBias(mid, reps) > trueRir) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

function posteriorLog(post: Posterior, f: (p: Particle) => number) {
  const mean = post.particles.reduce((s, p, i) => s + f(p) * post.weights[i], 0);
  const sd = Math.sqrt(post.particles.reduce((s, p, i) => s + (f(p) - mean) ** 2 * post.weights[i], 0));
  return { mean, sd };
}

function credibleIntervals(post: Posterior, a0: number, baseCost: number) {
  const cost = baseCost * post.remaining.reduce((s, r, i) => s + r * post.weights[i], 0);
  const optimum = (p: Particle, r: number) => {
    const arg = (p.rho * a0 * r) / (p.k * cost);
    return arg <= 1 ? 0 : Math.min(MAX_EFFECTIVE_SETS, p.k * Math.log(arg));
  };
  const out: Record<string, number> = {};
  for (const level of LEVELS) {
    const q: [number, number] = level === 68 ? SIGMA_1 : [(1 - level / 100) / 2, 1 - (1 - level / 100) / 2];
    const { low, high } = summarize(post, optimum, q);
    out[`lo${level}`] = low;
    out[`hi${level}`] = high;
  }
  return out;
}

function simulate(person: Person) {
  const profile = profileOf(person);
  const rand = mulberry32(20000 + person.id);
  const a0 = PRIORS.a0[person.sex][person.experience];
  const sport = SPORT_PROFILES[person.sport];
  const plannedRir = person.sport === 'general' ? (person.experience === 'new' ? 2 : 1) : sport.rir.other;
  const defaultEffective = DEFAULT_WEEKLY_SETS[person.goal] * plannedEffortWeight(plannedRir);
  const baseCost = calibratedCost(samplePrior(4000, 1, person.experience, person.sex), a0, defaultEffective);
  const t = person.truth;
  const gain = (e: number, remaining: number) => t.rho * a0 * (1 - Math.exp(-e / t.k)) * remaining;
  const history: LoggedSet[] = [];
  const lifts = new Map<string, { mu: number; start: number; ceiling: number }>();
  const fixed = new Map<string, { load: number; stalls: number }>();
  const weekly: { week: number; on_target: number; failed: number; delivered: number }[] = [];
  const checkpoints: Record<string, number>[] = [];
  const started = Date.now();

  for (let week = 0; week < WEEKS; week++) {
    const plan = generatePlan(profile, history, dayOf(week, 0));
    const rec = optimizeVolume(plan.posterior, defaultEffective);
    const cri = credibleIntervals(plan.posterior, a0, baseCost);
    if (Math.abs(cri.lo68 - rec.effectiveSetsRange.low) > 1e-9 || Math.abs(cri.hi68 - rec.effectiveSetsRange.high) > 1e-9) throw new Error(`68% CrI does not match the app for person ${person.id}`);
    const weekSets: LoggedSet[] = [];
    const trueSets: LoggedSet[] = [];
    const onTarget: boolean[] = [];
    const failures: boolean[] = [];
    const weekFactor = rand() < 0.5 ? 0.33 : 2;
    for (const session of plan.sessions) {
      const date = dayOf(week, session.weekday);
      const dayNoise = PRIORS.sigmaMedian * normal(rand);
      for (const ex of session.exercises) {
        if (ex.loadKg === null || ex.loadKg <= 0) continue;
        let s = lifts.get(ex.exerciseId);
        if (!s) {
          const bound = (v: number | null | undefined) => (v && v > 0 ? v : ex.loadKg!);
          const centre = Math.sqrt(bound(ex.loadLow) * bound(ex.loadHigh)) * (1 + (ex.repRange[0] + ex.repRange[1]) / 2 / 30 + ex.targetRir / 30);
          const mu = Math.log(centre) + 0.25 * normal(rand);
          s = { mu, start: mu, ceiling: mu + t.h };
          lifts.set(ex.exerciseId, s);
        }
        const sets =
          DOSE === 'blocks' ? Math.max(1, Math.round(ex.sets * (Math.floor(week / 4) % 2 === 0 ? 0.5 : 1.75)))
            : DOSE === 'random' ? Math.max(1, Math.round(ex.sets * Math.exp(0.6 * normal(rand))))
              : DOSE === 'weeks' ? Math.max(1, Math.round(ex.sets * weekFactor))
              : ex.sets;
        const added = ADDED_WEIGHT_LIFTS.has(ex.exerciseId) ? person.bodyweightKg : undefined;
        let estimate: LoadEstimate | null = ex.loadLow && ex.loadHigh ? estimateFromBracket(ex.loadLow, ex.loadHigh) : null;
        const rule = LOADS === 'app' ? null : fixed.get(ex.exerciseId) ?? { load: ex.loadKg, stalls: 0 };
        let load = rule ? rule.load : ex.loadKg;
        const goal = LOADS === 'linear' ? Math.round((ex.repRange[0] + ex.repRange[1]) / 2) : null;
        const outcomes: { reps: number; failed: boolean }[] = [];
        const liftDay = t.sigma * Math.sqrt(DAY_SHARE) * normal(rand);
        for (let k = 0; k < sets; k++) {
          const rtf = OBS === 'matched'
            ? 30 * (Math.exp(s.mu + liftDay + t.sigma * Math.sqrt(1 - DAY_SHARE) * normal(rand)) / load - 1)
            : Math.max(0, 30 * (Math.exp(s.mu + dayNoise) / load - 1) - k * 0.4);
          if (OBS === 'matched' && rtf < 1) continue;
          let reps = goal ?? Math.min(ex.repRange[1], Math.max(ex.repRange[0], Math.round(rtf - ex.targetRir + (OBS === 'matched' ? 0 : 0.7 * normal(rand)))));
          const failed = reps > rtf;
          if (failed) reps = OBS === 'matched' ? Math.floor(rtf) : Math.max(1, Math.floor(rtf));
          const trueRir = failed ? 0 : rtf - reps;
          const rpe = failed ? null
            : OBS === 'matched' ? Math.round((10 - Math.min(4, reportedRir(trueRir, reps))) * 2) / 2
              : Math.round((10 - Math.max(0, Math.min(4, trueRir - 0.95 + normal(rand)))) * 2) / 2;
          weekSets.push({ date, exerciseId: ex.exerciseId, reps, weightKg: load, rpe, rir: null, failed: failed || undefined });
          trueSets.push({ date, exerciseId: ex.exerciseId, reps, weightKg: load, rpe: null, rir: failed ? null : reportedRir(trueRir, reps), failed: failed || undefined });
          outcomes.push({ reps, failed });
          onTarget.push(!failed && Math.abs(trueRir - ex.targetRir) <= 1);
          failures.push(failed);
          if (!rule && !ex.power) {
            const u = updateAfterSet({ prior: estimate, weightKg: load, reps, rpe, missed: failed, targetReps: Math.round((ex.repRange[0] + ex.repRange[1]) / 2), targetRir: ex.targetRir, incrementKg: 2.5, bodyweightKg: added });
            estimate = u.estimate;
            if (u.next.value > 0) load = u.next.value;
          }
        }
        if (rule && outcomes.length) {
          const top = goal ?? ex.repRange[1];
          const bottom = goal ?? ex.repRange[0];
          if (outcomes.every((o) => !o.failed && o.reps >= top)) fixed.set(ex.exerciseId, { load: rule.load + 2.5, stalls: 0 });
          else if (outcomes.some((o) => o.failed || o.reps < bottom)) {
            const stalls = rule.stalls + 1;
            fixed.set(ex.exerciseId, stalls >= STALLS ? { load: Math.max(2.5, Math.round((rule.load * DELOAD) / 2.5) * 2.5), stalls: 0 } : { load: rule.load, stalls });
          } else fixed.set(ex.exerciseId, { load: rule.load, stalls: 0 });
        }
      }
    }
    history.push(...weekSets);
    const fraction = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : 0);
    const delivered: number[] = [];
    for (const [id, s] of lifts) {
      const e = primaryDose(trueSets, id);
      delivered.push(e);
      s.mu += gain(e, Math.max(0, (s.ceiling - s.mu) / t.h)) + PRIORS.processSd * normal(rand);
    }
    weekly.push({ week: week + 1, on_target: fraction(onTarget), failed: fraction(failures), delivered: delivered.reduce((a, b) => a + b, 0) / Math.max(1, delivered.length) });
    if (CHECKPOINTS.includes(week + 1)) {
      const remaining = [...lifts.values()].reduce((sum, s) => sum + Math.max(0, (s.ceiling - s.mu) / t.h), 0) / Math.max(1, lifts.size);
      const cost = baseCost * remaining;
      const value = (e: number) => gain(e, remaining) - cost * e;
      let opt = 0;
      for (let e = 0; e <= 30; e += 0.05) if (value(e) > value(opt)) opt = e;
      const span = value(opt) - value(0);
      const share = (e: number) => (span > 0 ? (value(e) - value(0)) / span : 1);
      const rho = posteriorLog(plan.posterior, (p) => Math.log(p.rho));
      const logK = posteriorLog(plan.posterior, (p) => Math.log(p.k));
      checkpoints.push({
        week: week + 1,
        app: rec.effectiveSets,
        low: rec.effectiveSetsRange.low,
        high: rec.effectiveSetsRange.high,
        optimum: opt,
        default: defaultEffective,
        delivered: delivered.reduce((a, b) => a + b, 0) / Math.max(1, delivered.length),
        share_app: share(rec.effectiveSets),
        share_default: share(defaultEffective),
        learned: plan.model.learned,
        remaining,
        ...cri,
        delivered_sd: Math.sqrt(delivered.reduce((v, x, _, xs) => v + (x - xs.reduce((m, y) => m + y, 0) / xs.length) ** 2, 0) / Math.max(1, delivered.length)),
        post_log_rho: rho.mean,
        post_log_rho_sd: rho.sd,
        post_log_k: logK.mean,
        post_log_k_sd: logK.sd,
      });
    }
  }
  const logGains = [...lifts.values()].map((s) => s.mu - s.start);
  const { truth, ...rest } = person;
  return {
    ...rest,
    truth: { rho: truth.rho, k: truth.k, headroom: truth.h, sigma: truth.sigma, a0 },
    default_dose: defaultEffective,
    strength_gain_pct: (Math.exp(logGains.reduce((a, b) => a + b, 0) / Math.max(1, logGains.length)) - 1) * 100,
    seconds: (Date.now() - started) / 1000,
    weekly,
    checkpoints,
  };
}

test('population: app volume vs each person’s true optimum', () => {
  const people = Array.from({ length: PEOPLE }, (_, i) => makePerson(FIRST + i));
  const results = people.map((p) => {
    const r = simulate(p);
    console.log(`person ${p.id} ${p.cohort} ${p.sex} ${p.experience} ${p.sport}: ${r.seconds.toFixed(1)} s`);
    return r;
  });
  mkdirSync(join(OUT, '..'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ weeks: WEEKS, obs: OBS, dose: DOSE, loads: LOADS, start: START, people: results }, null, 1));
}, 24 * 3_600_000);
