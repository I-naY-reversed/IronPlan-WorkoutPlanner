import { weeklyDose, type LoggedSet } from '../dose';
import { EXERCISES_BY_ID, type Muscle } from '../exercises';
import { DEFAULT_WEEKLY_SETS, generatePlan } from '../generator';
import { calibratedCost, mulberry32, normal, optimizeVolume, plannedEffortWeight, PRIORS, samplePrior } from '../model';
import { clampProfile, DEFAULT_PROFILE, type Profile } from '../profile';

const WEEKS = Number(process.env.SIM_WEEKS ?? 26);
const SEEDS = Number(process.env.SIM_SEEDS ?? 6);
const ONLY = process.env.SIM_SCENARIOS?.split(',');
const EXPLORE = process.env.SIM_EXPLORE === '1';
const START = '2026-01-05';

type Truth = { name: string; rho: number; k: number; h: number; fatigue?: { from: number; per: number } };

const a0 = PRIORS.a0.male.new;
const kMed = PRIORS.kMedian;
const SCENARIOS: Truth[] = [
  { name: 'typical (prior median)', rho: 1, k: kMed, h: PRIORS.headroomMedian.male.new },
  { name: 'high-volume responder (k +2 sd)', rho: 1.1, k: kMed * Math.exp(2 * PRIORS.logKSd), h: PRIORS.headroomMedian.male.new },
  { name: 'low-volume responder (k -2 sd)', rho: 0.9, k: kMed * Math.exp(-2 * PRIORS.logKSd), h: PRIORS.headroomMedian.male.new },
  { name: 'fatigue past 2 units (not in model)', rho: 1, k: kMed, h: PRIORS.headroomMedian.male.new, fatigue: { from: 2, per: 0.004 } },
];

const profile: Profile = clampProfile({
  ...DEFAULT_PROFILE, ageYears: 24, heightCm: 177, bodyweightKg: 82, experience: 'new', goal: 'strength',
  daysPerWeek: 3, trainingDays: [0, 2, 4], confirmed: true, introSeen: true,
});

const dayOf = (week: number, weekday: number) => new Date(Date.parse(`${START}T00:00:00Z`) + (week * 7 + weekday) * 86400000).toISOString().slice(0, 10);

function trueGain(t: Truth, e: number, remaining: number) {
  let g = t.rho * a0 * (1 - Math.exp(-e / t.k));
  if (t.fatigue) g -= t.fatigue.per * Math.max(0, e - t.fatigue.from) ** 2;
  return g * remaining;
}

function trueOptimum(t: Truth, cost: number, remaining: number) {
  const value = (e: number) => trueGain(t, e, remaining) - cost * e;
  let best = { e: 0, v: value(0) };
  for (let e = 0; e <= 30; e += 0.05) if (value(e) > best.v) best = { e, v: value(e) };
  return { e: best.e, value };
}

function primaryDose(sets: LoggedSet[], exerciseId: string) {
  const w = weeklyDose(sets);
  if (!w.length) return 0;
  const primary = (Object.entries(EXERCISES_BY_ID[exerciseId].muscles) as [Muscle, number][]).filter(([, x]) => x === 1).map(([m]) => m);
  return primary.reduce((s, m) => s + w[0].muscles[m].strengthDose, 0) / primary.length;
}

test('closed loop: does the planner find the true optimal volume?', () => {
  const g = plannedEffortWeight(2);
  const defaultEffective = DEFAULT_WEEKLY_SETS.strength * g;
  const prior = samplePrior(4000, 1, 'new', 'male');
  const baseCost = calibratedCost(prior, a0, defaultEffective);
  const lines: string[] = [`Default dose ${defaultEffective.toFixed(2)} units/week;${EXPLORE ? ' lifter varies volume in 4-week blocks;' : ''} ${WEEKS} weeks; ${SEEDS} noisy runs per scenario.`];

  for (const truth of SCENARIOS.filter((s) => !ONLY || ONLY.some((o) => s.name.startsWith(o)))) {
    const checkpoints = [1, 4, 8, 12, 16, 20, 26, 39, 52].filter((w) => w <= WEEKS);
    const acc = new Map<number, { app: number[]; low: number[]; high: number[]; opt: number[]; share: number[]; covered: number; learned: number[]; done: number[] }>();
    checkpoints.forEach((w) => acc.set(w, { app: [], low: [], high: [], opt: [], share: [], covered: 0, learned: [], done: [] }));
    const gains: number[] = [];

    for (let seed = 0; seed < SEEDS; seed++) {
      const rand = mulberry32(1000 + seed);
      const history: LoggedSet[] = [];
      const mu = new Map<string, { mu: number; ceiling: number; start: number }>();
      const trueStrength = (id: string, populationKg: number) => {
        let s = mu.get(id);
        if (!s) {
          const m = Math.log(populationKg) + 0.25 * normal(rand);
          s = { mu: m, ceiling: m + truth.h, start: m };
          mu.set(id, s);
        }
        return s;
      };

      for (let week = 0; week < WEEKS; week++) {
        const today = dayOf(week, 0);
        const plan = generatePlan(profile, history, today);
        const rec = optimizeVolume(plan.posterior, defaultEffective);
        const weekSets: LoggedSet[] = [];
        for (const session of plan.sessions) {
          const date = dayOf(week, session.weekday);
          const dayNoise = PRIORS.sigmaMedian * normal(rand);
          for (const ex of session.exercises) {
            if (ex.loadKg === null || ex.loadKg <= 0) continue;
            const s = trueStrength(ex.exerciseId, Math.sqrt((ex.loadLow ?? ex.loadKg) * (ex.loadHigh ?? ex.loadKg)) * (1 + (ex.repRange[0] + ex.repRange[1]) / 2 / 30 + ex.targetRir / 30));
            const e1rm = Math.exp(s.mu + dayNoise);
            const toFailure = 30 * (e1rm / ex.loadKg - 1);
            const sets = EXPLORE ? Math.max(1, Math.round(ex.sets * (Math.floor(week / 4) % 2 === 0 ? 0.5 : 1.75))) : ex.sets;
            for (let k = 0; k < sets; k++) {
              const fatigueReps = k * 0.4;
              const rtf = Math.max(0, toFailure - fatigueReps);
              let reps = Math.round(rtf - ex.targetRir + 0.7 * normal(rand));
              reps = Math.min(ex.repRange[1], Math.max(ex.repRange[0], reps));
              const failed = reps > rtf;
              if (failed) reps = Math.max(1, Math.floor(rtf));
              const trueRir = failed ? 0 : rtf - reps;
              const reported = Math.max(0, Math.min(4, trueRir - 0.95 + normal(rand)));
              const rpe = failed ? null : Math.round((10 - reported) * 2) / 2;
              weekSets.push({ date, exerciseId: ex.exerciseId, reps, weightKg: ex.loadKg, rpe, rir: null, failed: failed || undefined });
            }
          }
        }
        history.push(...weekSets);
        const delivered: number[] = [];
        for (const [id, s] of mu) {
          const e = primaryDose(weekSets, id);
          delivered.push(e);
          const remaining = Math.max(0, (s.ceiling - s.mu) / truth.h);
          s.mu += trueGain(truth, e, remaining) + PRIORS.processSd * normal(rand);
        }
        const at = acc.get(week + 1);
        if (at) {
          const remaining = [...mu.values()].reduce((t, s) => t + Math.max(0, (s.ceiling - s.mu) / truth.h), 0) / Math.max(1, mu.size);
          const opt = trueOptimum(truth, baseCost * remaining, remaining);
          const best = opt.value(opt.e), none = opt.value(0);
          at.app.push(rec.effectiveSets);
          at.low.push(rec.effectiveSetsRange.low);
          at.high.push(rec.effectiveSetsRange.high);
          at.opt.push(opt.e);
          at.share.push(best > none ? (opt.value(rec.effectiveSets) - none) / (best - none) : 1);
          if (opt.e >= rec.effectiveSetsRange.low && opt.e <= rec.effectiveSetsRange.high) at.covered++;
          at.learned.push(plan.model.learned);
          at.done.push(delivered.reduce((t, x) => t + x, 0) / Math.max(1, delivered.length));
        }
      }
      const sq = [...mu.values()].map((s) => s.mu - s.start);
      gains.push(sq.reduce((a, b) => a + b, 0) / sq.length);
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
    lines.push('', `${truth.name}: true ρ ${truth.rho.toFixed(2)}, k ${truth.k.toFixed(2)}`);
    lines.push('week | app dose (sd across runs) | app 1σ range | true optimum | dose delivered | value reached | truth in range | learned');
    for (const [w, a] of acc) {
      lines.push(
        `${String(w).padStart(4)} | ${mean(a.app).toFixed(2)} (${sd(a.app).toFixed(2)}) | ${mean(a.low).toFixed(2)}–${mean(a.high).toFixed(2)} | ${mean(a.opt).toFixed(2)} | ${mean(a.done).toFixed(2)} | ${(100 * mean(a.share)).toFixed(0)}% | ${a.covered}/${SEEDS} | ${(100 * mean(a.learned)).toFixed(0)}%`,
      );
    }
    lines.push(`mean true strength gain over ${WEEKS} weeks: ${((Math.exp(mean(gains)) - 1) * 100).toFixed(1)}%`);
  }
  console.log(lines.join('\n'));
}, 3_600_000);
