import { EXERCISES, type Exercise } from './exercises';

export const MATCH_THRESHOLD = 0.6;

const STOP_WORDS = new Set(['the', 'a', 'with', 'on', 'machine']);
const SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  dumbbells: 'dumbbell',
  bb: 'barbell',
  tricep: 'triceps',
  bicep: 'biceps',
  pullups: 'pull',
  pullup: 'pull',
  chinup: 'chin',
  ups: 'up',
  raises: 'raise',
  curls: 'curl',
  rows: 'row',
  presses: 'press',
  extensions: 'extension',
};

export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[()[\],/_-]/g, ' ')
    .split(/\s+/)
    .map((t) => SYNONYMS[t] ?? t)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'smith', 'kettlebell', 'band', 'ez', 'bar', 'bodyweight']);
const weight = (t: string) => (EQUIPMENT.has(t) ? 0.5 : 1);

function score(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const total = (s: Set<string>) => [...s].reduce((sum, t) => sum + weight(t), 0);
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += weight(t);
  return (2 * shared) / (total(sa) + total(sb));
}

export type MatchResult = { exercise: Exercise; score: number } | null;

export function matchExercise(rawName: string, catalog: Exercise[] = EXERCISES): MatchResult {
  const tokens = tokenize(rawName);
  if (tokens.length === 0) return null;
  let best: MatchResult = null;
  for (const exercise of catalog) {
    for (const candidate of [exercise.name, exercise.id, ...(exercise.aliases ?? [])]) {
      const s = score(tokens, tokenize(candidate));
      if (!best || s > best.score) best = { exercise, score: s };
    }
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}
