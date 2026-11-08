import { availableKinds, preferenceRank } from './equipment';
import { EXERCISES, EXERCISES_BY_ID, usableOption, type Exercise, type Muscle } from './exercises';
import { effectiveSplit, type SessionKind } from './generator';
import { loadPreferenceOf, type Profile } from './profile';

const primary = (e: Exercise) => (Object.entries(e.muscles) as [Muscle, number][]).filter(([, w]) => w === 1).map(([m]) => m);

export function swapOptions(exerciseId: string, profile: Profile): Exercise[] {
  const from = EXERCISES_BY_ID[exerciseId];
  if (!from) return [];
  const available = availableKinds(profile.equipment);
  const excluded = new Set(profile.excludedExercises);
  const targets = primary(from);
  const overlap = (e: Exercise) => (Object.entries(from.muscles) as [Muscle, number][]).reduce((s, [m, w]) => s + Math.min(w, e.muscles[m] ?? 0), 0);
  const preference = loadPreferenceOf(profile);
  const rank = (e: Exercise) => preferenceRank(usableOption(e, available, preference) ?? [], preference);
  return EXERCISES.filter(
    (e) => e.id !== from.id && !excluded.has(e.id) && !e.timed && !!e.power === !!from.power && primary(e).some((m) => targets.includes(m)) && usableOption(e, available),
  ).sort((a, b) => overlap(b) - overlap(a) || rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function applySwap(profile: Profile, from: string, to: string): Profile {
  const swaps: Record<string, string> = {};
  for (const [a, b] of Object.entries(profile.swaps)) {
    if (a === to) continue;
    swaps[a] = b === from ? to : b;
  }
  if (from !== to) swaps[from] = to;
  for (const [a, b] of Object.entries(swaps)) if (a === b) delete swaps[a];
  return {
    ...profile,
    swaps,
    lockedExercises: profile.lockedExercises.filter((x) => x !== from),
    preferredExercises: profile.preferredExercises.filter((x) => x !== from),
  };
}

export function setDayFocus(profile: Profile, weekday: number, focus: SessionKind | null): Profile {
  const current = effectiveSplit(profile);
  const dayFocus: Partial<Record<number, SessionKind>> =
    profile.split === 'custom' ? { ...profile.dayFocus } : Object.fromEntries(profile.trainingDays.map((d, i) => [d, current[i]]));
  if (focus) dayFocus[weekday] = focus;
  else delete dayFocus[weekday];
  return { ...profile, split: 'custom', dayFocus };
}

export function focusOptions(profile: Pick<Profile, 'sport'>): SessionKind[] {
  const base: SessionKind[] = ['full', 'upper', 'lower', 'push', 'pull', 'legs'];
  return profile.sport === 'powerlifting' ? [...base, 'squat_day', 'bench_day', 'deadlift_day'] : base;
}
