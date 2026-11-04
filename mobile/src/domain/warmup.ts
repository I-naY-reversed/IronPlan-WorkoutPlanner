import { EFFORT_PRIORS, estimateOneRepMax, estimateRir, type LoggedSet } from './dose';
import { COMPARABLE_LOG_GAP } from './model';
import { ADDED_WEIGHT_LIFTS } from './progress';

export type WarmupSet = { loadKg: number; reps: number };

const RAMP: { pct: number; reps: number }[] = [
  { pct: 0.5, reps: 5 },
  { pct: 0.7, reps: 3 },
  { pct: 0.85, reps: 1 },
];
export const WARMUP_SET_MINUTES = 1;
export const PLANNED_HEAVY_WARMUPS = 3;

export function warmupSets({
  workingKg,
  incrementKg,
  heavy,
  barKg,
  firstForMuscle,
}: {
  workingKg: number | null;
  incrementKg: number;
  heavy: boolean;
  barKg?: number;
  firstForMuscle: boolean;
}): WarmupSet[] {
  if (!workingKg || workingKg <= 0) return [];
  const floor = (x: number) => Math.floor(x / incrementKg + 1e-9) * incrementKg;
  if (!heavy) {
    const light = floor(workingKg * 0.5);
    return firstForMuscle && light > 0 && light <= workingKg - incrementKg ? [{ loadKg: Math.max(light, barKg ?? 0), reps: 8 }] : [];
  }
  const out: WarmupSet[] = [];
  const min = barKg ?? incrementKg;
  if (barKg && workingKg >= barKg * 1.5) out.push({ loadKg: barKg, reps: 8 });
  for (const step of RAMP) {
    const load = Math.max(min, floor(workingKg * step.pct));
    const prev = out.at(-1)?.loadKg ?? 0;
    if (load < prev + incrementKg || load > workingKg - incrementKg) continue;
    out.push({ loadKg: load, reps: step.reps });
  }
  return out;
}

export function impliedRir(weightKg: number, reps: number, oneRmKg: number): number {
  return 30 * (oneRmKg / weightKg - 1) - reps;
}

type Rated = Pick<LoggedSet, 'rpe' | 'rir' | 'failed'>;

function easyOrUnrated(s: Rated): boolean {
  if (s.failed) return false;
  if (s.rpe !== null) return s.rpe <= 6;
  if (s.rir !== null) return s.rir >= 4;
  return true;
}

const isWarmupGap = (rir: number) => rir > EFFORT_PRIORS.hardSetMaxRir;

export function likelyWarmups(sets: (Pick<LoggedSet, 'date' | 'exerciseId' | 'weightKg' | 'reps' | 'rpe' | 'rir' | 'failed' | 'drop'> & { warmup?: boolean })[]): boolean[] {
  const flags = sets.map(() => false);
  const groups = new Map<string, number[]>();
  sets.forEach((s, i) => {
    if (s.warmup || s.drop || s.weightKg <= 0 || ADDED_WEIGHT_LIFTS.has(s.exerciseId)) return;
    const key = `${s.date}|${s.exerciseId}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const e1rm = idx.map((i) => estimateOneRepMax(sets[i].weightKg, sets[i].reps, estimateRir({ ...sets[i], reps: sets[i].reps }).rir));
    const best = Math.max(...e1rm.map((x) => x ?? 0));
    if (best <= 0) continue;
    const top = e1rm.findIndex((x) => x !== null && Math.log(x) >= Math.log(best) - COMPARABLE_LOG_GAP);
    for (let j = 0; j < top; j++) {
      const s = sets[idx[j]];
      if (s.weightKg < sets[idx[top]].weightKg && easyOrUnrated(s) && isWarmupGap(impliedRir(s.weightKg, s.reps, best))) flags[idx[j]] = true;
    }
  }
  return flags;
}

export function looksLikeWarmup(args: {
  exerciseId: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
  failed: boolean;
  estimate: { logMean: number; logSd: number } | null;
  targetReps: number;
  targetRir: number;
}): boolean {
  if (!args.estimate || args.weightKg <= 0 || ADDED_WEIGHT_LIFTS.has(args.exerciseId)) return false;
  if (!easyOrUnrated({ rpe: args.rpe, rir: null, failed: args.failed })) return false;
  const targetRtf = args.targetReps + estimateRir({ rpe: null, rir: args.targetRir, reps: args.targetReps }).rir;
  const lowOneRm = Math.exp(args.estimate.logMean - args.estimate.logSd) * (1 + targetRtf / 30);
  return isWarmupGap(impliedRir(args.weightKg, args.reps, lowOneRm));
}
