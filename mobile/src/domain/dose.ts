import { EXERCISES_BY_ID, MUSCLES, type Muscle } from './exercises';
import FITTED from './fitted-priors.json';

export const EFFORT_PRIORS = {
  reportBias: FITTED.effort.report_bias.value,
  reportBiasSlope: 0.025,
  reportBiasMax: FITTED.effort.report_bias.ci95[1],
  missingRir: Math.round(FITTED.effort.missing_rir.value * 10) / 10,
  maxRir: 6,
  slope: 0,
  floor: 0.4,
  hardSetMaxRir: 5,
} as const;

export const STRENGTH_SESSION_CEILING: number | null = FITTED.volume.strength_session_ceiling?.value ?? null;

const C_WEIGHTS: { c: number; w: number }[] = (() => {
  const raw = (FITTED.volume.strength_session_ceiling?.weights ?? []).filter((x): x is { c: number; w: number } => x.c !== null);
  const total = raw.reduce((t, x) => t + x.w, 0);
  return total > 0 ? raw.map((x) => ({ c: x.c, w: x.w / total })) : STRENGTH_SESSION_CEILING ? [{ c: STRENGTH_SESSION_CEILING, w: 1 }] : [];
})();

export function sessionStrengthDose(sets: number): number {
  if (C_WEIGHTS.length === 0) return sets;
  return C_WEIGHTS.reduce((d, { c, w }) => d + w * c * (1 - Math.exp(-sets / c)), 0);
}

function marginalShare(sets: number): number {
  if (C_WEIGHTS.length === 0) return 1;
  const at = (x: number) => C_WEIGHTS.reduce((d, { c, w }) => d + w * Math.exp(-x / c), 0);
  return at(sets) / at(0);
}

export const SESSION_SET_CAP = (() => {
  if (C_WEIGHTS.length === 0) return Infinity;
  let lo = 0;
  let hi = 50;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (marginalShare(mid) > 0.05) lo = mid;
    else hi = mid;
  }
  return lo;
})();

export function setsForStrengthDose(dose: number, sessions: number): { sets: number; capped: boolean } {
  if (C_WEIGHTS.length === 0 || sessions <= 0) return { sets: dose, capped: false };
  const perSession = dose / sessions;
  const capped = perSession > sessionStrengthDose(SESSION_SET_CAP);
  if (capped) return { sets: sessions * SESSION_SET_CAP, capped };
  let lo = 0;
  let hi = SESSION_SET_CAP;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sessionStrengthDose(mid) < perSession) lo = mid;
    else hi = mid;
  }
  return { sets: sessions * lo, capped };
}

export type LoggedSet = {
  date: string;
  exerciseId: string;
  reps: number;
  weightKg: number;
  rpe: number | null;
  rir: number | null;
  failed?: boolean;
  drop?: boolean;
  seconds?: number | null;
};

export type EffortEstimate = { rir: number; observed: boolean };

export function reportBias(reported: number, reps?: number): number {
  if (reps === undefined || reps <= 0) return EFFORT_PRIORS.reportBias;
  if (reported <= 0) return 0;
  const proximity = reps / (reps + reported);
  return Math.min(EFFORT_PRIORS.reportBiasMax, EFFORT_PRIORS.reportBiasSlope * 100 * (1 - proximity));
}

export function estimateRir(set: Pick<LoggedSet, 'rpe' | 'rir' | 'failed'> & { reps?: number }): EffortEstimate {
  if (set.failed) return { rir: 0, observed: true };
  const reported = set.rir ?? (set.rpe !== null ? 10 - set.rpe : null);
  if (reported === null) return { rir: EFFORT_PRIORS.missingRir, observed: false };
  const rir = Math.min(EFFORT_PRIORS.maxRir, Math.max(0, reported + reportBias(reported, set.reps)));
  return { rir, observed: true };
}

export function effortWeight(rir: number): number {
  return Math.max(EFFORT_PRIORS.floor, 1 - EFFORT_PRIORS.slope * rir);
}

export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export type MuscleDose = {
  fractionalSets: number;
  effectiveSets: number;
  effortCoverage: number;
  strengthDose: number;
};

export type WeeklyDose = { week: string; muscles: Record<Muscle, MuscleDose> };

function emptyMuscles(): Record<Muscle, MuscleDose> {
  return Object.fromEntries(
    MUSCLES.map((m) => [m, { fractionalSets: 0, effectiveSets: 0, effortCoverage: 0, strengthDose: 0 }]),
  ) as Record<Muscle, MuscleDose>;
}

export function weeklyDose(sets: LoggedSet[]): WeeklyDose[] {
  const weeks = new Map<string, { muscles: Record<Muscle, MuscleDose>; observed: Record<Muscle, number>; days: Map<string, Record<Muscle, number>> }>();

  for (const set of sets) {
    const exercise = EXERCISES_BY_ID[set.exerciseId];
    if (!exercise) continue;
    const week = weekStart(set.date);
    let bucket = weeks.get(week);
    if (!bucket) {
      const observed = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
      bucket = { muscles: emptyMuscles(), observed, days: new Map() };
      weeks.set(week, bucket);
    }
    const effort = estimateRir(set);
    if (effort.rir > EFFORT_PRIORS.hardSetMaxRir) continue;
    const g = effortWeight(effort.rir);
    let day = bucket.days.get(set.date);
    if (!day) {
      day = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
      bucket.days.set(set.date, day);
    }
    for (const [muscle, w] of Object.entries(exercise.muscles) as [Muscle, number][]) {
      bucket.muscles[muscle].fractionalSets += w;
      bucket.muscles[muscle].effectiveSets += w * g;
      day[muscle] += w * g;
      if (effort.observed) bucket.observed[muscle] += w;
    }
  }

  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, b]) => {
      for (const m of MUSCLES) {
        const total = b.muscles[m].fractionalSets;
        b.muscles[m].effortCoverage = total > 0 ? b.observed[m] / total : 0;
        b.muscles[m].strengthDose = [...b.days.values()].reduce((sum, d) => sum + sessionStrengthDose(d[m]), 0);
      }
      return { week, muscles: b.muscles };
    });
}

export function estimateOneRepMax(weightKg: number, reps: number, rir = 0): number | null {
  const repsToFailure = reps + rir;
  if (weightKg <= 0 || repsToFailure < 1 || repsToFailure > 12) return null;
  return repsToFailure === 1 ? weightKg : weightKg * (1 + repsToFailure / 30);
}
