import type { ImportedSet } from './csv';
import type { LoggedSet } from './dose';
import { matchExercise } from './matching';
import { plausible } from './plausibility';
import { likelyWarmups } from './warmup';

export type NameResolution = {
  resolved: Map<string, string>;
  unresolved: string[];
};

export function resolveNames(names: Iterable<string>, savedAliases: Map<string, string>): NameResolution {
  const resolved = new Map<string, string>();
  const unresolved: string[] = [];
  for (const name of new Set(names)) {
    const saved = savedAliases.get(name);
    const match = saved ?? matchExercise(name)?.exercise.id;
    if (match) resolved.set(name, match);
    else unresolved.push(name);
  }
  return { resolved, unresolved: unresolved.sort() };
}

type Keyed = Pick<LoggedSet, 'date' | 'exerciseId' | 'reps' | 'weightKg'> & { setIndex: number; warmup?: boolean };
const setKey = (s: Keyed) => `${s.date}|${s.exerciseId}|${s.setIndex}|${s.reps}|${s.weightKg}|${s.warmup ? 'w' : ''}`;

export function prepareImport(
  sets: ImportedSet[],
  resolved: Map<string, string>,
  existing: Keyed[],
) {
  const seen = new Set(existing.map(setKey));
  const ready: (ImportedSet & { exerciseId: string })[] = [];
  let duplicates = 0;
  let unmatched = 0;
  let implausible = 0;
  for (const s of sets) {
    const exerciseId = resolved.get(s.exerciseName);
    if (!exerciseId) {
      unmatched++;
      continue;
    }
    const candidate = { ...s, exerciseId };
    if (!s.warmup && !plausible({ exerciseId, weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, rir: s.rir, failed: s.failed, seconds: s.seconds })) {
      implausible++;
      continue;
    }
    const key = setKey(candidate);
    if (seen.has(key) || (s.autoWarmup && seen.has(setKey({ ...candidate, warmup: false })))) {
      duplicates++;
      continue;
    }
    seen.add(key);
    ready.push(candidate);
  }
  return { ready, duplicates, unmatched, implausible };
}

export function markLikelyWarmups(sets: ImportedSet[], resolved: Map<string, string>): ImportedSet[] {
  const flags = likelyWarmups(sets.map((s) => ({ ...s, exerciseId: resolved.get(s.exerciseName) ?? `name:${s.exerciseName}` })));
  return sets.map((s, i) => (flags[i] ? { ...s, warmup: true as const, autoWarmup: true as const } : s));
}
