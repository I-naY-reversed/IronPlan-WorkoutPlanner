import { estimateOneRepMax, estimateRir, setsForStrengthDose, weekStart, weeklyDose, type LoggedSet } from './dose';
import { availableKinds, EQUIPMENT_INFO, loadSettingsFor, minLoadKg, type EquipmentKind } from './equipment';
import { BAR } from './plates';
import { plausible } from './plausibility';
import { fromUnit } from './units';
import { PLANNED_HEAVY_WARMUPS, WARMUP_SET_MINUTES, warmupSets, type WarmupSet } from './warmup';
import { EXERCISES, EXERCISES_BY_ID, MUSCLE_LABELS, MUSCLES, usableOption, type Exercise, type Muscle } from './exercises';
import { fitModel, optimizeVolume, personalization, plannedEffortWeight, potentialPct, PRIORS, progressLearned, summarize, windowedSeries, type Interval, type Posterior } from './model';
import { startingOneRepMax } from './starting-strength';
import FITTED from './fitted-priors.json';
import { VOLUME_FACTOR, type Goal, type Profile, type SplitPreference } from './profile';
import { COMBAT_SPORTS, emphasisFor, OPT_IN, SPORT_PROFILES, type Sport } from './sports';

export const DEFAULT_WEEKLY_SETS: Record<Goal, number> = {
  strength: Math.round(FITTED.volume.strength_sets_90pct.value * 10) / 10,
  general: Math.round(FITTED.volume.strength_sets_90pct.value * 10) / 10,
  muscle: FITTED.volume.hypertrophy_median_studied.value,
};
const REQUIRED_LIFT_SETS = 3;
const COMPETITION_WEEKLY_SETS = 5;
const requiredSetsPerSession = (freq: number) => Math.min(4, Math.max(2, Math.round(COMPETITION_WEEKLY_SETS / freq)));
const POWER_SETS = 3;
const POWER_TARGET_SHARE = 0.5;

export const MAX_VOLUME_CHANGE = 0.2;
export const MIN_WEEKLY_INCREASE = 2;
export const MINUTES_PER_SET = FITTED.timing.minutes_per_set.value;
export const WARMUP_MINUTES = 8;
const MAX_SETS_PER_EXERCISE = 4;
const MIN_SETS_PER_EXERCISE = 2;
const MAX_HEAVY_PER_SESSION = 2;
const OVERSHOOT_PENALTY = 1;
const MIN_HISTORY_WEEKS = 2;

export type SessionKind = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'squat_day' | 'bench_day' | 'deadlift_day';
export const SESSION_KINDS: SessionKind[] = ['full', 'upper', 'lower', 'push', 'pull', 'legs', 'squat_day', 'bench_day', 'deadlift_day'];

const MUSCLE_SIZE: Record<Muscle, number> = {
  quads: 4, glutes: 4, hamstrings: 4, adductors: 3, chest: 3, lats: 3, upper_back: 3,
  front_delts: 2, side_delts: 2, rear_delts: 2, biceps: 1, triceps: 1,
  calves: 0, abs: 0, forearms: 0, neck: 0, tibialis: 0,
};

const SESSION_MUSCLES: Record<SessionKind, Muscle[]> = {
  full: [...MUSCLES],
  upper: ['chest', 'lats', 'upper_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'abs', 'forearms', 'neck'],
  lower: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'tibialis', 'abs', 'neck', 'forearms'],
  push: ['chest', 'front_delts', 'side_delts', 'triceps'],
  pull: ['lats', 'upper_back', 'rear_delts', 'biceps', 'abs', 'forearms', 'neck'],
  legs: ['quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'tibialis'],
  squat_day: ['quads', 'glutes', 'hamstrings', 'adductors', 'calves', 'abs', 'chest', 'triceps', 'front_delts'],
  bench_day: ['chest', 'triceps', 'front_delts', 'side_delts', 'lats', 'upper_back', 'rear_delts', 'biceps', 'forearms'],
  deadlift_day: ['glutes', 'hamstrings', 'adductors', 'upper_back', 'lats', 'abs', 'forearms', 'chest', 'triceps'],
};

const SESSION_FEATURE: Partial<Record<SessionKind, string>> = {
  squat_day: 'back_squat',
  bench_day: 'barbell_bench_press',
  deadlift_day: 'deadlift',
};

export const SESSION_LABELS: Record<SessionKind, string> = {
  full: 'Full body', upper: 'Upper', lower: 'Lower', push: 'Push', pull: 'Pull', legs: 'Legs',
  squat_day: 'Squat', bench_day: 'Bench', deadlift_day: 'Deadlift',
};

const cycle = (pattern: SessionKind[], days: number) => Array.from({ length: days }, (_, i) => pattern[i % pattern.length]);

export function splitFor(days: number, preference: SplitPreference = 'auto'): SessionKind[] {
  if (days <= 1) return ['full'];
  switch (preference) {
    case 'full_body':
      return cycle(['full'], days);
    case 'upper_lower':
      return cycle(['upper', 'lower'], days);
    case 'lower_upper':
      return cycle(['lower', 'upper'], days);
    case 'ppl':
      return days < 3 ? cycle(['upper', 'lower'], days) : cycle(['push', 'pull', 'legs'], days);
    case 'lift_days': {
      const byDays: Record<number, SessionKind[]> = {
        2: ['squat_day', 'deadlift_day'],
        3: ['squat_day', 'deadlift_day', 'squat_day'],
        4: ['squat_day', 'bench_day', 'deadlift_day', 'squat_day'],
        5: ['squat_day', 'bench_day', 'deadlift_day', 'squat_day', 'bench_day'],
        6: ['squat_day', 'bench_day', 'deadlift_day', 'squat_day', 'bench_day', 'deadlift_day'],
      };
      return byDays[Math.min(6, days)];
    }
    default:
      if (days === 2 || days === 4) return cycle(['upper', 'lower'], days);
      if (days === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
      return cycle(['push', 'pull', 'legs'], days);
  }
}

export function effectiveSplit(profile: Pick<Profile, 'daysPerWeek' | 'split' | 'sport' | 'trainingDays' | 'dayFocus'> & { goal?: Profile['goal'] }): SessionKind[] {
  const frequent = profile.sport === 'general' && profile.goal !== undefined && profile.goal !== 'muscle' && profile.daysPerWeek >= 2 && profile.daysPerWeek <= 3;
  const auto = frequent ? 'full_body' : SPORT_PROFILES[profile.sport].autoSplit(profile.daysPerWeek);
  if (profile.split === 'custom') {
    const fill = splitFor(profile.daysPerWeek, auto);
    return profile.trainingDays.map((d, i) => {
      const k = profile.dayFocus?.[d];
      return k && SESSION_KINDS.includes(k) ? k : fill[i];
    });
  }
  return splitFor(profile.daysPerWeek, profile.split === 'auto' ? auto : profile.split);
}

export function minutesFor(profile: Pick<Profile, 'sessionMinutes' | 'dayMinutes'>, weekday: number): number {
  return profile.dayMinutes?.[weekday] ?? profile.sessionMinutes;
}

export type PlannedExercise = {
  exerciseId: string;
  name: string;
  sets: number;
  repRange: [number, number];
  targetRir: number;
  loadKg: number | null;
  loadLow: number | null;
  loadHigh: number | null;
  loadSource: 'model' | 'log' | 'population' | 'analogy' | 'convention' | 'bodyweight' | null;
  equipment: EquipmentKind[];
  cappedByMax: boolean;
  emptyBar: boolean;
  liftMoreShare: number | null;
  power: boolean;
  warmups: WarmupSet[];
  sessionsOfData: number;
  locked: boolean;
  reentryWeeks: number | null;
  checkIn: boolean;
};

export type PlannedSession = {
  kind: SessionKind;
  weekday: number;
  title: string;
  adjustments: string[];
  exercises: PlannedExercise[];
  totalSets: number;
  estimatedMinutes: number;
};

export type ModelSummary = {
  lifts: number;
  observations: number;
  personalization: number;
  learned: number;
  lessCertain?: boolean;
  responsiveness: Interval;
  volumeSource: 'model' | 'default';
  halfSaturation: Interval;
  recommendedSets: number;
  recommendedSetsRange: Interval;
  blockGainPct: Interval;
  potentialPct: Interval;
};

export type Plan = {
  sport: Sport;
  sessions: PlannedSession[];
  model: ModelSummary;
  conditioning: string[];
  targets: Record<Muscle, number>;
  delivered: Record<Muscle, number>;
  usedHistory: boolean;
  notes: string[];
  competitionE1rm: Partial<Record<CompetitionLift, StrengthEstimateLog>>;
  strengthOf: (exerciseId: string) => StrengthEstimateLog | null;
  posterior: Posterior;
  effectiveDose: number;
};

export const COMPETITION_LIFTS = ['back_squat', 'barbell_bench_press', 'deadlift'] as const;
export type CompetitionLift = (typeof COMPETITION_LIFTS)[number];
export type StrengthEstimateLog = { mean: number; sd: number; source: NonNullable<PlannedExercise['loadSource']> };

function median(xs: number[]): number {
  const v = [...xs].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

function prescriptionFor(exercise: Exercise, profile: Profile, required: boolean): { repRange: [number, number]; targetRir: number } {
  const sport = SPORT_PROFILES[profile.sport];
  const isolation = Object.keys(exercise.muscles).length === 1;
  if (exercise.power) return { repRange: sport.reps.power, targetRir: sport.rir.power };
  if (profile.sport === 'general') {
    const targetRir = profile.goal === 'strength' && exercise.heavyCompound ? 2 : profile.experience === 'new' ? 2 : 1;
    if (profile.goal === 'strength' && exercise.heavyCompound) return { repRange: [3, 6], targetRir };
    if (exercise.heavyCompound) return { repRange: [6, 10], targetRir };
    return { repRange: isolation ? [10, 15] : [8, 12], targetRir };
  }
  if (required || exercise.heavyCompound) return { repRange: sport.reps.heavy, targetRir: sport.rir.heavy };
  return { repRange: isolation ? sport.reps.isolation : sport.reps.compound, targetRir: sport.rir.other };
}

function assignRequiredLifts(split: SessionKind[], required: Record<string, number>, eligibleIds: Set<string>) {
  const assigned: string[][] = split.map(() => []);
  const missing: string[] = [];
  const lifts = Object.entries(required).sort(([, a], [, b]) => b - a);
  for (const [id, freq] of lifts) {
    if (!eligibleIds.has(id)) {
      missing.push(id);
      continue;
    }
    const primary = (Object.entries(EXERCISES_BY_ID[id].muscles) as [Muscle, number][]).filter(([, w]) => w === 1).map(([m]) => m);
    const candidates = split.map((k, i) => i).filter((i) => primary.some((m) => SESSION_MUSCLES[split[i]].includes(m)));
    const chosen: number[] = [];
    for (let n = 0; n < Math.min(freq, candidates.length); n++) {
      const pick = candidates
        .filter((i) => !chosen.includes(i))
        .sort((a, b) => {
          const featured = Number(SESSION_FEATURE[split[b]] === id) - Number(SESSION_FEATURE[split[a]] === id);
          if (featured !== 0) return featured;
          const load = assigned[a].length - assigned[b].length;
          if (load !== 0) return load;
          const gap = (i: number) => (chosen.length ? Math.min(...chosen.map((c) => Math.abs(c - i))) : 0);
          return gap(b) - gap(a);
        })[0];
      chosen.push(pick);
      assigned[pick].push(id);
    }
  }
  return { assigned, missing };
}

export function recentVolume(history: LoggedSet[], today: string): { volume: Record<Muscle, number>; weeks: number } {
  const cutoff = new Date(`${weekStart(today)}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 28);
  const from = cutoff.toISOString().slice(0, 10);
  const currentWeek = weekStart(today);
  const weeks = weeklyDose(history.filter((s) => s.date >= from && weekStart(s.date) < currentWeek));
  const volume = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const w of weeks) for (const m of MUSCLES) volume[m] += w.muscles[m].fractionalSets / weeks.length;
  return { volume, weeks: weeks.length };
}

export function bestOneRepMaxes(history: LoggedSet[], today: string): Map<string, number> {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 56);
  const from = cutoff.toISOString().slice(0, 10);
  const best = new Map<string, number>();
  for (const s of history) {
    if (s.date < from || s.drop) continue;
    const e1rm = estimateOneRepMax(s.weightKg, s.reps, estimateRir(s).rir);
    if (e1rm !== null && e1rm > (best.get(s.exerciseId) ?? 0)) best.set(s.exerciseId, e1rm);
  }
  return best;
}

const listMuscles = (ms: Muscle[]) => ms.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(', ');

function roundDown(value: number, step: number) {
  return Math.floor(value / step + 1e-9) * step;
}

const PRIOR_START_Z = 0.84;
const MINOR_START_Z = 1.28;
const LOWER: Muscle[] = ['quads', 'hamstrings', 'glutes', 'adductors', 'calves'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EASE_FACTOR = 0.5;

export function arrangeAroundPractice(split: SessionKind[], days: number[], practice: Set<number>): SessionKind[] {
  if (practice.size === 0 || split.length < 2) return split;
  const clashes = (order: SessionKind[]) =>
    order.reduce((n, k, i) => {
      if (!SESSION_MUSCLES[k].includes('quads')) return n;
      return n + (practice.has((days[i] + 1) % 7) ? 1 : 0) + (practice.has(days[i]) ? 0.5 : 0);
    }, 0);
  let best = split;
  for (let r = 1; r < split.length; r++) {
    const order = [...split.slice(r), ...split.slice(0, r)];
    if (clashes(order) < clashes(best)) best = order;
  }
  return best;
}

export function spreadForFrequency(sessionMuscles: Muscle[][], dose: (m: Muscle) => number) {
  const n = sessionMuscles.length;
  if (n < 3) return;
  for (const m of MUSCLES) {
    if (dose(m) <= 0) continue;
    for (;;) {
      const have = sessionMuscles.map((ms, i) => (ms.includes(m) ? i : -1)).filter((i) => i >= 0);
      if (have.length === 0 || have.length >= n || !setsForStrengthDose(dose(m), have.length).capped) break;
      const dist = (i: number) => Math.min(...have.map((h) => Math.min(Math.abs(i - h), n - Math.abs(i - h))));
      const next = [...Array(n).keys()].filter((i) => !have.includes(i)).sort((a, b) => dist(b) - dist(a))[0];
      sessionMuscles[next].push(m);
    }
  }
}

export function dueCheckIn(history: LoggedSet[], today: string): string | null {
  const t = Date.parse(`${today}T00:00:00Z`);
  const daysAgo = (d: string) => (t - Date.parse(`${d}T00:00:00Z`)) / 86400000;
  const weeksTrained = new Map<string, Set<string>>();
  const lastPrecise = new Map<string, number>();
  for (const s of history) {
    const ago = daysAgo(s.date);
    if (ago < 0 || !EXERCISES_BY_ID[s.exerciseId]?.heavyCompound || EXERCISES_BY_ID[s.exerciseId].power) continue;
    if (ago <= 42) {
      if (!weeksTrained.has(s.exerciseId)) weeksTrained.set(s.exerciseId, new Set());
      weeksTrained.get(s.exerciseId)!.add(weekStart(s.date));
    }
    if (s.failed || (s.rpe !== null && s.rpe >= 9)) lastPrecise.set(s.exerciseId, Math.min(lastPrecise.get(s.exerciseId) ?? Infinity, ago));
  }
  const due = [...weeksTrained]
    .filter(([id, w]) => w.size >= 3 && (lastPrecise.get(id) ?? Infinity) > 28)
    .sort((a, b) => (lastPrecise.get(b[0]) ?? Infinity) - (lastPrecise.get(a[0]) ?? Infinity));
  return due[0]?.[0] ?? null;
}

function countDays(history: LoggedSet[]): Map<string, number> {
  const days = new Map<string, Set<string>>();
  for (const s of history) {
    if (!days.has(s.exerciseId)) days.set(s.exerciseId, new Set());
    days.get(s.exerciseId)!.add(s.date);
  }
  return new Map([...days].map(([id, d]) => [id, d.size]));
}

export function easeAfterBigDay(
  history: LoggedSet[],
  today: string,
  days: number[],
  sessions: number,
  targets: Record<Muscle, number>,
  sessionsPerMuscle: Record<Muscle, number>,
): { session: number; weekday: number; muscles: Muscle[] } | null {
  const t = Date.parse(`${today}T00:00:00Z`);
  const recent = [...new Set(history.map((s) => s.date))].filter((d) => {
    const ago = (t - Date.parse(`${d}T00:00:00Z`)) / 86400000;
    return ago >= 0 && ago <= 2;
  }).sort();
  const last = recent.at(-1);
  if (!last) return null;
  const [dose] = weeklyDose(history.filter((s) => s.date === last));
  if (!dose) return null;
  const big = MUSCLES.filter((m) => {
    const planned = sessionsPerMuscle[m] ? targets[m] / sessionsPerMuscle[m] : 0;
    const done = dose.muscles[m].fractionalSets;
    return planned > 0 && done >= 1.5 * planned && done >= planned + 3;
  });
  if (!big.length) return null;
  const weekdayOf = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  const bigDay = weekdayOf(last);
  const ago = Math.round((t - Date.parse(`${last}T00:00:00Z`)) / 86400000);
  for (let gap = Math.max(1, ago); gap <= 2; gap++) {
    const i = days.indexOf((bigDay + gap) % 7);
    if (i >= 0 && i < sessions) return { session: i, weekday: bigDay, muscles: big };
  }
  return null;
}

export type WeekFreeze = { week: string; key: string; sessions: { exerciseId: string; sets: number }[][] };

export function selectionKey(profile: Profile): string {
  const { trainingDays, split, dayFocus, dayMinutes, sessionMinutes, sport, goal, experience, equipment, excludedExercises, lockedExercises, preferredExercises, volume, matDays } = profile;
  return JSON.stringify({ trainingDays, split, dayFocus, dayMinutes, sessionMinutes, sport, goal, experience, equipment, excludedExercises, lockedExercises, preferredExercises, volume, matDays });
}

export function freezeOf(plan: Plan, profile: Profile, today: string): WeekFreeze {
  const back = new Map(Object.entries(profile.swaps ?? {}).map(([from, to]) => [to, from]));
  return {
    week: weekStart(today),
    key: selectionKey(profile),
    sessions: plan.sessions.map((s) => s.exercises.map((e) => ({ exerciseId: back.get(e.exerciseId) ?? e.exerciseId, sets: e.sets }))),
  };
}

export function generatePlan(profile: Profile, allHistory: LoggedSet[], today: string, freeze?: WeekFreeze | null): Plan {
  const frozenSessions = freeze && freeze.week === weekStart(today) && freeze.key === selectionKey(profile) ? freeze.sessions : null;
  const notes: string[] = [];
  const history = allHistory.filter(plausible);
  if (profile.ageYears < 18) {
    notes.push('Under 18: it is advised to train with a qualified coach supervising. Starting weights are set extra conservatively because the research data comes from adults.');
  }
  const available = availableKinds(profile.equipment, profile.unit);
  const swaps = Object.entries(profile.swaps ?? {});
  const excluded = new Set(profile.excludedExercises);
  const preferred = new Set([...(profile.preferredExercises ?? []), ...swaps.map(([, to]) => to)]);
  const familiar = new Set([...history.map((s) => s.exerciseId), ...preferred]);

  let eligible = EXERCISES.flatMap((e) => {
    if (excluded.has(e.id) || e.timed) return [];
    if (e.variantOf && !preferred.has(e.id) && !profile.lockedExercises.includes(e.id)) return [];
    const option = usableOption(e, available);
    return option ? [{ exercise: e, option }] : [];
  });

  const sport = SPORT_PROFILES[profile.sport];
  const plannedRir = profile.sport === 'general' ? (profile.experience === 'new' ? 2 : 1) : sport.rir.other;
  const g = plannedEffortWeight(plannedRir);
  const posterior = fitModel(history, profile.experience, today, { sex: profile.sex });
  const goal = profile.sport === 'general' ? profile.goal : sport.volumeGoal;
  const defaultEffective = DEFAULT_WEEKLY_SETS[goal] * g;
  const recommendation = optimizeVolume(posterior, defaultEffective);
  const volumeFromModel = goal !== 'muscle';
  const volumeFactor = VOLUME_FACTOR[profile.volume ?? 'standard'];
  const base = (volumeFromModel ? recommendation.effectiveSets / g : DEFAULT_WEEKLY_SETS.muscle) * volumeFactor;
  if (volumeFactor !== 1) {
    notes.push(volumeFactor < 1 ? 'Volume set to less than recommended (Settings), so progress may be slower.' : 'Volume set to more than recommended (Settings). Recover well and ease off if sets stall.');
  }
  const toBlockPct = (x: number) => (Math.exp(4 * x) - 1) * 100;
  const learnedRaw = progressLearned(windowedSeries(history, today), posterior, recommendation.effectiveSets, { sex: profile.sex });
  const model: ModelSummary = {
    lifts: posterior.lifts,
    observations: posterior.observations,
    personalization: personalization(posterior),
    learned: Math.max(0, learnedRaw),
    lessCertain: learnedRaw < 0,
    responsiveness: summarize(posterior, (p) => p.rho),
    halfSaturation: summarize(posterior, (p) => p.k / g),
    volumeSource: volumeFromModel ? 'model' : 'default',
    recommendedSets: Math.round(base * 10) / 10,
    recommendedSetsRange: volumeFromModel
      ? {
          mean: recommendation.effectiveSetsRange.mean / g,
          low: recommendation.effectiveSetsRange.low / g,
          high: recommendation.effectiveSetsRange.high / g,
        }
      : { mean: base, low: base, high: base },
    blockGainPct: {
      mean: toBlockPct(recommendation.weeklyGain.mean),
      low: toBlockPct(recommendation.weeklyGain.low),
      high: toBlockPct(recommendation.weeklyGain.high),
    },
    potentialPct: potentialPct(posterior),
  };

  const practice = new Set(COMBAT_SPORTS.includes(profile.sport) ? profile.matDays : []);
  const days = profile.trainingDays;
  const custom = profile.split === 'custom';
  const split = custom ? effectiveSplit(profile) : arrangeAroundPractice(effectiveSplit(profile), days, practice);
  const practiceTomorrow = split.map((k, i) => practice.has((days[i] + 1) % 7) && SESSION_MUSCLES[k].includes('quads'));
  const strengthGoal = goal === 'strength' || goal === 'general';
  const sessionMuscles: Muscle[][] = split.map((k) => [...SESSION_MUSCLES[k]]);
  if (strengthGoal && profile.split === 'auto') spreadForFrequency(sessionMuscles, (m) => base * emphasisFor(profile.sport, m));
  const sessionsPerMuscle = Object.fromEntries(
    MUSCLES.map((m) => [m, sessionMuscles.filter((ms) => ms.includes(m)).length]),
  ) as Record<Muscle, number>;
  const frequencyLimited: Muscle[] = [];
  const toSets = (dose: number, m: Muscle) => {
    if (!strengthGoal) return dose;
    const { sets, capped } = setsForStrengthDose(dose, sessionsPerMuscle[m]);
    if (capped && dose > 0) frequencyLimited.push(m);
    return sets;
  };
  const recent = recentVolume(history, today);
  const useHistory = recent.weeks >= MIN_HISTORY_WEEKS;
  const targets = Object.fromEntries(
    MUSCLES.map((m) => {
      const weight = emphasisFor(profile.sport, m);
      let t = toSets(base * weight, m);
      if (useHistory && recent.volume[m] > 0 && weight > 0) {
        const lo = recent.volume[m] * (1 - MAX_VOLUME_CHANGE);
        const hi = Math.max(recent.volume[m] * (1 + MAX_VOLUME_CHANGE), recent.volume[m] + MIN_WEEKLY_INCREASE);
        t = Math.min(hi, Math.max(lo, t));
      }
      return [m, Math.round(t * 10) / 10];
    }),
  ) as Record<Muscle, number>;

  if (strengthGoal) {
    const f = Math.max(1, Math.round(median(['chest', 'quads', 'upper_back', 'glutes'].map((m) => sessionsPerMuscle[m as Muscle]))));
    const conv = (x: number) => setsForStrengthDose(x, f).sets;
    model.recommendedSets = Math.round(conv(base) * 10) / 10;
    model.recommendedSetsRange = {
      mean: conv(model.recommendedSetsRange.mean),
      low: conv(model.recommendedSetsRange.low),
      high: conv(model.recommendedSetsRange.high),
    };
  }
  if (frequencyLimited.length) {
    notes.push('Strength gains level off within a session, so more sessions a week would help more than more sets.');
  }

  const unreachable = MUSCLES.filter(
    (m) => targets[m] > 0 && !eligible.some(({ exercise }) => exercise.muscles[m] === 1),
  );
  if (unreachable.length) notes.push(`Your equipment can't train: ${listMuscles(unreachable)}.`);
  const unscheduled = MUSCLES.filter((m) => targets[m] > 0 && !unreachable.includes(m) && sessionsPerMuscle[m] === 0);
  if (unscheduled.length) notes.push(`No day in your week trains: ${listMuscles(unscheduled)}.`);

  const eased = easeAfterBigDay(history, today, days, split.length, targets, sessionsPerMuscle);
  const sessionsOfData = new Map<string, number>();
  for (const [id, n] of countDays(history.filter((x) => x.date < today))) sessionsOfData.set(id, n);
  const locked = new Set(profile.lockedExercises);
  const checkInLift = dueCheckIn(history, today);
  let checkInPlaced = false;

  const e1rms = bestOneRepMaxes(history, today);
  const estimate = (id: string, loadKind: EquipmentKind): StrengthEstimateLog | null => {
    const modelled = posterior.liftStrength[id];
    const logged = e1rms.get(id);
    if (modelled) return { ...modelled, source: 'model' };
    if (logged) return { mean: Math.log(logged), sd: PRIORS.sigmaE1rmMedian, source: 'log' };
    const pop = startingOneRepMax(id, loadKind, profile);
    return pop ? { mean: pop.logOneRm, sd: pop.sd, source: pop.source === 'analogy' || pop.source === 'convention' ? pop.source : 'population' } : null;
  };
  const barKg = fromUnit(BAR[profile.unit], profile.unit);
  const requiredLiftIds = new Set(Object.keys(SPORT_PROFILES[profile.sport].requiredLifts));
  const tooLightForBar = (e: Exercise, option: EquipmentKind[]) => {
    if (requiredLiftIds.has(e.id) || !option.includes('barbell') || e.power) return false;
    const found = estimate(e.id, 'barbell');
    return !!found && Math.exp(found.mean + found.sd) < barKg * (1 + (6 + 2) / 30);
  };
  eligible = eligible.filter(({ exercise, option }) => !tooLightForBar(exercise, option));

  const eligibleIds = new Set(eligible.map((x) => x.exercise.id));
  const { assigned, missing } = assignRequiredLifts(split, sport.requiredLifts, eligibleIds);
  let lowerSessionCount = 0;
  if (missing.length) {
    notes.push(`Competition lifts need a barbell, rack and bench: ${missing.map((id) => EXERCISES_BY_ID[id].name).join(', ')}.`);
  }
  const requiredIds = new Set(Object.keys(sport.requiredLifts));
  const anchorIds = new Set(sport.lowerAnchors.flat());
  const maxSetsFor = (weekday: number) => Math.max(4, Math.floor((minutesFor(profile, weekday) - WARMUP_MINUTES) / MINUTES_PER_SET));

  const lastTrained = new Map<string, string>();
  for (const s of history) if (s.date <= today && s.date > (lastTrained.get(s.exerciseId) ?? '')) lastTrained.set(s.exerciseId, s.date);
  const previousSession = new Map<string, LoggedSet[]>();
  for (const s of history) {
    if (s.date >= today || s.drop) continue;
    const sets = previousSession.get(s.exerciseId);
    if (!sets || s.date > sets[0].date) previousSession.set(s.exerciseId, [s]);
    else if (s.date === sets[0].date) sets.push(s);
  }
  const delivered = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const counts = Object.fromEntries(SESSION_KINDS.map((k) => [k, 0])) as Record<SessionKind, number>;
  const usedByKind = Object.fromEntries(SESSION_KINDS.map((k) => [k, []])) as unknown as Record<SessionKind, Set<string>[]>;

  const suggestLoad = (id: string, loadKind: EquipmentKind | undefined, repRange: [number, number], targetRir: number, power: boolean) => {
    const none = { loadKg: null, loadLow: null, loadHigh: null, cappedByMax: false, emptyBar: false, liftMoreShare: null, reentryWeeks: null };
    if (!loadKind) return { ...none, loadSource: power ? null : ('bodyweight' as const) };
    if (power) return { ...none, loadSource: null };
    const found = estimate(id, loadKind);
    if (!found) return { ...none, loadSource: null };
    let est = found;
    const last = lastTrained.get(id);
    const weeksOff = last && (est.source === 'model' || est.source === 'log') ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / (7 * 86400000)) : 0;
    const reentryWeeks = weeksOff >= 3 ? weeksOff : null;
    if (reentryWeeks) {
      est = { ...est, mean: est.mean + Math.log(1 - Math.min(0.1, 0.025 * (reentryWeeks - 2))), sd: Math.hypot(est.sd, 0.02 * reentryWeeks) };
    }
    const z = profile.ageYears < 18 ? MINOR_START_Z : PRIOR_START_Z;
    const fromPrior = est.source === 'population' || est.source === 'analogy' || est.source === 'convention';
    const centre = fromPrior ? est.mean - z * est.sd : est.mean;
    const midReps = Math.round((repRange[0] + repRange[1]) / 2);
    const divisor = 1 + (midReps + targetRir) / 30;
    const { incrementKg = 2.5, maxKg } = loadSettingsFor(profile.equipment, loadKind, profile.unit);
    const roundUp = (x: number) => Math.ceil(x / incrementKg - 1e-9) * incrementKg;
    let loadKg = roundDown(Math.exp(centre) / divisor, incrementKg);
    let loadLow = Math.max(0, Math.min(loadKg, roundDown(Math.exp(est.mean - est.sd) / divisor, incrementKg)));
    let loadHigh = Math.max(loadKg + incrementKg, roundUp(Math.exp(est.mean + est.sd) / divisor));
    let source = est.source;
    const previous = previousSession.get(id);
    const top = previous ? Math.max(...previous.map((s) => s.weightKg)) : 0;
    const topSets = previous?.filter((s) => s.weightKg === top) ?? [];
    const unseen = topSets.length > 0 && topSets.every((s) => estimateOneRepMax(s.weightKg, s.reps, estimateRir(s).rir) === null);
    if (previous && (fromPrior || unseen)) {
      const cleared = topSets.every((s) => {
        const effort = estimateRir(s);
        return !s.failed && s.reps >= repRange[1] && effort.observed && effort.rir >= targetRir;
      });
      const progressed = cleared ? top + incrementKg : top;
      if (progressed > loadKg) {
        loadKg = progressed;
        loadLow = Math.min(loadKg, Math.max(loadLow, top));
        loadHigh = Math.max(loadHigh, loadKg + incrementKg);
        source = 'log';
      }
    }
    let cappedByMax = false;
    if (maxKg) {
      if (loadKg > maxKg) {
        loadKg = maxKg;
        cappedByMax = true;
      }
      loadLow = Math.min(loadLow, maxKg);
      loadHigh = Math.min(loadHigh, maxKg);
    }
    const minKg = minLoadKg(loadKind, profile.unit);
    const emptyBar = minKg !== undefined && loadKg < minKg;
    if (emptyBar) {
      loadKg = minKg;
      loadHigh = Math.max(loadHigh, minKg);
    }
    const liftMoreShare = source === est.source && centre !== est.mean && !emptyBar && est.source !== 'convention' ? (z === MINOR_START_Z ? 0.9 : 0.8) : null;
    return { loadKg, loadLow, loadHigh, cappedByMax, emptyBar, liftMoreShare, loadSource: source, reentryWeeks };
  };

  const sessions = split.map((kind, sessionIndex): PlannedSession => {
    const muscles = sessionMuscles[sessionIndex];
    const maxSets = maxSetsFor(days[sessionIndex] ?? sessionIndex);
    const adjustments: string[] = [];
    const remaining = Object.fromEntries(
      muscles.map((m) => [m, sessionsPerMuscle[m] ? targets[m] / sessionsPerMuscle[m] : 0]),
    ) as Partial<Record<Muscle, number>>;
    const ease = eased?.session === sessionIndex ? eased.muscles.filter((m) => remaining[m] !== undefined) : [];
    for (const m of ease) remaining[m] = remaining[m]! * EASE_FACTOR;
    if (ease.length) adjustments.push(`Eased after a big session on ${WEEKDAY_NAMES[eased!.weekday]}: ${listMuscles(ease)}.`);
    const lightLegs = practiceTomorrow[sessionIndex];
    if (lightLegs) adjustments.push('Practice tomorrow: no heavy barbell leg work today.');
    const heavyLegs = (e: Exercise) =>
      e.heavyCompound && !e.power && (Object.entries(e.muscles) as [Muscle, number][]).some(([m, w]) => w === 1 && LOWER.includes(m));
    const previousSameKind = usedByKind[kind].at(-1) ?? new Set<string>();
    const sets = new Map<string, number>();
    let total = 0;
    let warmCost = 0;
    const warmupCostOf = (e: Exercise) => (e.heavyCompound && !e.power ? (PLANNED_HEAVY_WARMUPS * WARMUP_SET_MINUTES) / MINUTES_PER_SET : 0);
    const used = () => total + warmCost;

    const initial = { ...remaining };
    const gain = (e: Exercise) => {
      let fill = 0;
      let value = 0;
      let over = 0;
      for (const [m, w] of Object.entries(e.muscles) as [Muscle, number][]) {
        const rem = remaining[m];
        if (rem === undefined) continue;
        const filled = Math.min(w, Math.max(0, rem));
        fill += filled;
        value += filled * (initial[m]! > 0 ? Math.max(0, rem) / initial[m]! : 0);
        over += Math.max(0, w - Math.max(0, rem));
      }
      return { fill, score: value - OVERSHOOT_PENALTY * over };
    };
    const heavyCount = () => [...sets.keys()].filter((id) => EXERCISES_BY_ID[id].heavyCompound).length;
    const place = (e: Exercise, n: number) => {
      if (!sets.has(e.id)) warmCost += warmupCostOf(e);
      sets.set(e.id, (sets.get(e.id) ?? 0) + n);
      total += n;
      const share = e.power ? POWER_TARGET_SHARE : 1;
      for (const [m, w] of Object.entries(e.muscles) as [Muscle, number][]) {
        if (remaining[m] !== undefined) remaining[m] = remaining[m]! - w * n * share;
      }
    };
    const primaryHere = (e: Exercise) =>
      (Object.entries(e.muscles) as [Muscle, number][]).some(([m, w]) => w === 1 && muscles.includes(m));

    const frozenList = frozenSessions?.[sessionIndex];
    if (frozenList) {
      for (const f of frozenList) {
        const e = EXERCISES_BY_ID[f.exerciseId];
        if (e && eligibleIds.has(e.id) && !sets.has(e.id)) place(e, f.sets);
      }
    } else {
      for (let p = 0; p < sport.powerPerSession && used() + POWER_SETS <= maxSets; p++) {
        const options = eligible
          .map((x) => x.exercise)
          .filter((e) => e.power && !sets.has(e.id) && primaryHere(e))
          .sort((a, b) => Number(previousSameKind.has(a.id)) - Number(previousSameKind.has(b.id)) || gain(b).fill - gain(a).fill);
        if (options[0]) place(options[0], POWER_SETS);
      }
      for (const id of assigned[sessionIndex]) {
        const n = requiredSetsPerSession(sport.requiredLifts[id]);
        if (used() + n + warmupCostOf(EXERCISES_BY_ID[id]) <= maxSets) place(EXERCISES_BY_ID[id], n);
      }
      if (sport.lowerAnchors.length && SESSION_MUSCLES[kind].includes('quads')) {
        const pattern = sport.lowerAnchors[lowerSessionCount % sport.lowerAnchors.length];
        lowerSessionCount++;
        const id = pattern.find((x) => eligibleIds.has(x) && !sets.has(x) && !(lightLegs && heavyLegs(EXERCISES_BY_ID[x])));
        if (id && used() + REQUIRED_LIFT_SETS + warmupCostOf(EXERCISES_BY_ID[id]) <= maxSets) place(EXERCISES_BY_ID[id], REQUIRED_LIFT_SETS);
      }

      for (const { exercise: e } of eligible) {
        if (!locked.has(e.id) || sets.has(e.id) || e.power || !primaryHere(e)) continue;
        if (lightLegs && heavyLegs(e)) continue;
        if (used() + MIN_SETS_PER_EXERCISE + warmupCostOf(e) <= maxSets) place(e, MIN_SETS_PER_EXERCISE);
      }

      while (used() < maxSets) {
        let best: { e: Exercise; score: number } | null = null;
        for (const { exercise: e, option } of eligible) {
          const current = sets.get(e.id) ?? 0;
          if (current >= MAX_SETS_PER_EXERCISE) continue;
          if (current === 0 && used() + MIN_SETS_PER_EXERCISE + warmupCostOf(e) > maxSets) continue;
          if (current > 0 && used() + 1 > maxSets) continue;
          if (!primaryHere(e)) continue;
          if (e.power) continue;
          if ((Object.entries(e.muscles) as [Muscle, number][]).every(([m, w]) => w < 1 || OPT_IN.has(m))) continue;
          if (current === 0 && e.heavyCompound && heavyCount() >= MAX_HEAVY_PER_SESSION) continue;
          if (lightLegs && heavyLegs(e)) continue;
          const g = gain(e);
          if (g.fill < 0.5) continue;
          let score = g.score;
          if (current > 0) score += 0.3;
          if (familiar.has(e.id)) score += 0.2;
          if (preferred.has(e.id)) score += 0.4;
          if (e.heavyCompound) score += 0.1;
        if (option.some((k) => EQUIPMENT_INFO[k].loaded)) score += strengthGoal ? 0.35 : 0.05;
          if (locked.has(e.id)) score += 1;
          else if (previousSameKind.has(e.id)) score -= 0.25;
          if (!best || score > best.score) best = { e, score };
        }
        if (!best) break;
        place(best.e, sets.has(best.e.id) ? 1 : MIN_SETS_PER_EXERCISE);
      }

      for (const m of muscles) {
        if (!OPT_IN.has(m) || targets[m] <= 0 || delivered[m] >= targets[m]) continue;
        if (used() + MIN_SETS_PER_EXERCISE > maxSets) break;
        const options = eligible.filter(({ exercise: e }) => !e.power && e.muscles[m] === 1 && !sets.has(e.id) && !(lightLegs && heavyLegs(e)));
        const pick = options.find(({ option }) => option.some((k) => EQUIPMENT_INFO[k].loaded)) ?? options[0];
        if (pick) place(pick.exercise, MIN_SETS_PER_EXERCISE);
      }
    }

    for (const [from, to] of swaps) {
      const n = sets.get(from);
      if (n === undefined || !eligibleIds.has(to)) continue;
      sets.delete(from);
      sets.set(to, Math.min(MAX_SETS_PER_EXERCISE, (sets.get(to) ?? 0) + n));
    }

    const exercises = [...sets.entries()]
      .map(([id, n]) => {
        const { exercise, option } = eligible.find((x) => x.exercise.id === id)!;
        for (const [m, w] of Object.entries(exercise.muscles) as [Muscle, number][]) delivered[m] += w * n;
        const required = requiredIds.has(id) || (anchorIds.has(id) && exercise.heavyCompound);
        const { repRange, targetRir } = prescriptionFor(exercise, profile, required);
        const loadKind = option.find((k) => EQUIPMENT_INFO[k].loaded);
        const load = suggestLoad(id, loadKind, repRange, targetRir, !!exercise.power);
        return {
          exerciseId: id, name: exercise.name, sets: n, repRange, targetRir, equipment: option, ...load,
          power: !!exercise.power,
          rank: exercise.power ? 3 : requiredIds.has(id) || anchorIds.has(id) ? 2 : exercise.heavyCompound ? 1 : 0,
          muscleCount: Object.keys(exercise.muscles).length,
          size: Math.max(...(Object.entries(exercise.muscles) as [Muscle, number][]).filter(([, w]) => w === 1).map(([m]) => MUSCLE_SIZE[m])),
        };
      })
      .sort((a, b) => b.rank - a.rank || (a.rank === 0 ? Number(a.size === 0) - Number(b.size === 0) || Number(b.muscleCount > 1) - Number(a.muscleCount > 1) : 0) || b.size - a.size || b.muscleCount - a.muscleCount)
      .map(({ rank: _r, muscleCount: _m, size: _s, ...rest }) => rest)
      .map((ex, i, all) => {
        const e = EXERCISES_BY_ID[ex.exerciseId];
        const primary = (x: Exercise) => (Object.entries(x.muscles) as [Muscle, number][]).filter(([, w]) => w === 1).map(([m]) => m);
        const earlier = new Set(all.slice(0, i).flatMap((o) => Object.keys(EXERCISES_BY_ID[o.exerciseId].muscles)));
        const kind = ex.equipment.find((k) => EQUIPMENT_INFO[k].loaded);
        const incrementKg = kind ? (loadSettingsFor(profile.equipment, kind, profile.unit).incrementKg ?? 2.5) : 2.5;
        const warmups = ex.power
          ? []
          : warmupSets({
              workingKg: ex.loadKg,
              incrementKg,
              heavy: e.heavyCompound,
              barKg: ex.equipment.includes('barbell') ? fromUnit(BAR[profile.unit], profile.unit) : undefined,
              firstForMuscle: !primary(e).some((m) => earlier.has(m)),
            });
        const checkIn = !checkInPlaced && ex.exerciseId === checkInLift && !ex.power && ex.loadKg !== null;
        if (checkIn) checkInPlaced = true;
        return { ...ex, warmups, sessionsOfData: sessionsOfData.get(ex.exerciseId) ?? 0, locked: locked.has(ex.exerciseId), checkIn };
      });
    const warmupCount = exercises.reduce((n, e) => n + e.warmups.length, 0);

    usedByKind[kind].push(new Set(sets.keys()));
    counts[kind]++;
    const label = SESSION_LABELS[kind];
    const sameKind = split.filter((k) => k === kind).length;
    return {
      kind,
      weekday: days[sessionIndex] ?? sessionIndex,
      adjustments,
      title: sameKind > 1 ? `${label} ${String.fromCharCode(64 + counts[kind])}` : label,
      exercises,
      totalSets: total,
      estimatedMinutes: Math.round(WARMUP_MINUTES + total * MINUTES_PER_SET + warmupCount * WARMUP_SET_MINUTES),
    };
  });

  const short = MUSCLES.filter((m) => !unreachable.includes(m) && !unscheduled.includes(m) && delivered[m] < targets[m] - 1);
  if (short.length) {
    notes.push(
      short.length <= 3
        ? `Not enough time this week for all the planned ${listMuscles(short)} work. Longer sessions would fit it.`
        : `Not enough time this week for ${short.length} muscle groups. Longer or more sessions would fit them.`,
    );
  }

  return {
    sport: profile.sport,
    sessions,
    model,
    conditioning: sport.conditioning,
    targets,
    delivered,
    usedHistory: useHistory || e1rms.size > 0 || posterior.lifts > 0,
    notes,
    strengthOf: (id) => {
      const e = EXERCISES_BY_ID[id];
      const kind = e && usableOption(e, available)?.find((k) => EQUIPMENT_INFO[k].loaded);
      return kind ? estimate(id, kind) : null;
    },
    posterior,
    effectiveDose: base * g,
    competitionE1rm: Object.fromEntries(
      COMPETITION_LIFTS.flatMap((id) => {
        const est = estimate(id, 'barbell');
        return est ? [[id, est]] : [];
      }),
    ),
  };
}
