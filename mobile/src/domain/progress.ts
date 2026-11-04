import { estimateOneRepMax, estimateRir, type LoggedSet } from './dose';

export const ADDED_WEIGHT_LIFTS = new Set(['pull_up', 'dip']);

export type ProgressPoint = { date: string; e1rmKg: number };

export function e1rmOf(set: LoggedSet, bodyweightKg: number): number | null {
  if (set.drop || set.seconds) return null;
  const rir = estimateRir(set).rir;
  if (!ADDED_WEIGHT_LIFTS.has(set.exerciseId)) return estimateOneRepMax(set.weightKg, set.reps, rir);
  const total = estimateOneRepMax(bodyweightKg + set.weightKg, set.reps, rir);
  return total === null ? null : total - bodyweightKg;
}

export function progressSeries(history: LoggedSet[], exerciseId: string, bodyweightKg: number): ProgressPoint[] {
  const best = new Map<string, number>();
  for (const s of history) {
    if (s.exerciseId !== exerciseId) continue;
    const v = e1rmOf(s, bodyweightKg);
    if (v !== null && v > (best.get(s.date) ?? -Infinity)) best.set(s.date, v);
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e1rmKg]) => ({ date, e1rmKg }));
}

export function liftsWithProgress(history: LoggedSet[], bodyweightKg: number, min = 2): string[] {
  const days = new Map<string, Set<string>>();
  for (const s of history) {
    if (e1rmOf(s, bodyweightKg) === null) continue;
    if (!days.has(s.exerciseId)) days.set(s.exerciseId, new Set());
    days.get(s.exerciseId)!.add(s.date);
  }
  return [...days.entries()].filter(([, d]) => d.size >= min).sort((a, b) => b[1].size - a[1].size).map(([id]) => id);
}
