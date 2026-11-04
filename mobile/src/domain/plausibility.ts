import { estimateRir, type LoggedSet } from './dose';
import { EXERCISES_BY_ID } from './exercises';
import type { CompetitionLift } from './generator';
import { absoluteRecord, STREETLIFTING_RECORDS } from './records';

const COMPETITION_LIFTS: CompetitionLift[] = ['back_squat', 'barbell_bench_press', 'deadlift'];

export const MAX_LOAD_KG = 1000;
export const MAX_REPS = 100;
const RECORD_MARGIN = 1.25;

export function loadLimitKg(exerciseId: string): number {
  if ((COMPETITION_LIFTS as string[]).includes(exerciseId)) return RECORD_MARGIN * absoluteRecord(exerciseId as CompetitionLift, 'male').kg;
  if (exerciseId === 'pull_up' || exerciseId === 'dip') return RECORD_MARGIN * STREETLIFTING_RECORDS[exerciseId].male;
  return MAX_LOAD_KG;
}

export type SetProblem = 'weight' | 'reps' | 'strength' | 'seconds' | null;
export const MAX_HOLD_SECONDS = 3600;

export function setProblem(set: Pick<LoggedSet, 'exerciseId' | 'weightKg' | 'reps' | 'rpe' | 'rir' | 'failed' | 'seconds'>): SetProblem {
  const limit = loadLimitKg(set.exerciseId);
  if (!Number.isFinite(set.weightKg) || set.weightKg < 0 || set.weightKg > limit) return 'weight';
  if (EXERCISES_BY_ID[set.exerciseId]?.timed) {
    const s = set.seconds ?? 0;
    return Number.isInteger(s) && s >= 1 && s <= MAX_HOLD_SECONDS ? null : 'seconds';
  }
  if (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > MAX_REPS) return 'reps';
  if (EXERCISES_BY_ID[set.exerciseId] && set.exerciseId !== 'pull_up' && set.exerciseId !== 'dip') {
    const R = set.reps + estimateRir(set).rir;
    const e1 = R <= 1 ? set.weightKg : set.weightKg * (1 + R / 30);
    if (e1 > limit) return 'strength';
  }
  return null;
}

export const plausible = (set: Pick<LoggedSet, 'exerciseId' | 'weightKg' | 'reps' | 'rpe' | 'rir' | 'failed' | 'seconds'>) => setProblem(set) === null;

export const PROBLEM_TEXT: Record<Exclude<SetProblem, null>, string> = {
  weight: 'Heavier than any record for this lift. Check the weight and unit.',
  reps: `Reps must be a whole number from 1 to ${MAX_REPS}.`,
  strength: 'That weight for those reps beats the world record. Check the numbers.',
  seconds: `Seconds must be a whole number from 1 to ${MAX_HOLD_SECONDS}.`,
};
