import type { EquipmentKind } from './equipment';
import FITTED from './fitted-priors.json';
import type { Profile } from './profile';

const S = FITTED.starting_strength;
type Measured = keyof typeof S.exercises;

export const ANALOGY_EXTRA_SD = 0.25;
const MIN_GROUPS = 4;

const UPPER = new Set<Measured>([
  'barbell_bench_press', 'biceps_curl', 'cable_row', 'chest_press_machine', 'dumbbell_shoulder_press',
  'lat_pulldown', 'lateral_raise', 'shoulder_press_machine', 'triceps_pushdown',
]);

export type StrengthSource = 'measured' | 'ratio' | 'analogy' | 'convention';

const CONVENTIONS: Record<string, { kinds: EquipmentKind[]; lowKg: number; highKg: number }> = {
  tibialis_machine: { kinds: ['tibialis_machine'], lowKg: 2.5, highKg: 11.3 },
};
const CONVENTION_DIVISOR = 1 + (12 + 2) / 30;


type Rule = { from: Measured; kinds: EquipmentKind[]; source: StrengthSource; logRatio?: number };

export const DUMBBELL_BENCH_RATIO = 0.81;

export const PAUSED_BENCH_RATIO = 0.93;
export const PAUSE_SQUAT_RATIO = 0.9;

const RULES: Record<string, Rule> = {
  back_squat: { from: 'back_squat', kinds: ['barbell'], source: 'measured' },
  barbell_bench_press: { from: 'barbell_bench_press', kinds: ['barbell'], source: 'measured' },
  biceps_curl: { from: 'biceps_curl', kinds: ['barbell', 'cable'], source: 'measured' },
  cable_row: { from: 'cable_row', kinds: ['cable'], source: 'measured' },
  lat_pulldown: { from: 'lat_pulldown', kinds: ['cable'], source: 'measured' },
  leg_curl: { from: 'leg_curl', kinds: ['leg_curl'], source: 'measured' },
  leg_extension: { from: 'leg_extension', kinds: ['leg_extension'], source: 'measured' },
  leg_press: { from: 'leg_press', kinds: ['leg_press'], source: 'measured' },
  hack_squat: { from: 'hack_squat', kinds: ['hack_squat'], source: 'measured' },
  triceps_pushdown: { from: 'triceps_pushdown', kinds: ['cable'], source: 'measured' },
  deadlift: { from: 'back_squat', kinds: ['barbell'], source: 'ratio' },
  incline_barbell_bench_press: { from: 'barbell_bench_press', kinds: ['barbell'], source: 'analogy' },
  front_squat: { from: 'back_squat', kinds: ['barbell'], source: 'analogy' },
  barbell_row: { from: 'cable_row', kinds: ['barbell'], source: 'analogy' },
  machine_row: { from: 'cable_row', kinds: ['row_machine'], source: 'analogy' },
  overhead_press: { from: 'shoulder_press_machine', kinds: ['barbell'], source: 'analogy' },
  overhead_triceps_extension: { from: 'triceps_pushdown', kinds: ['cable'], source: 'analogy' },
  dumbbell_bench_press: { from: 'barbell_bench_press', kinds: ['dumbbells'], source: 'analogy', logRatio: Math.log(DUMBBELL_BENCH_RATIO / 2) },
  paused_bench_press: { from: 'barbell_bench_press', kinds: ['barbell'], source: 'analogy', logRatio: Math.log(PAUSED_BENCH_RATIO) },
  pause_squat: { from: 'back_squat', kinds: ['barbell'], source: 'analogy', logRatio: Math.log(PAUSE_SQUAT_RATIO) },
};

export const GUESS_EXTRA_SD = 0.4;
type Guess = { from: Measured; kinds: EquipmentKind[]; ratio: number };
const GUESSES: Record<string, Guess[]> = {
  incline_dumbbell_bench_press: [{ from: 'barbell_bench_press', kinds: ['dumbbells'], ratio: (DUMBBELL_BENCH_RATIO / 2) * 0.85 }],
  chest_fly: [
    { from: 'barbell_bench_press', kinds: ['dumbbells', 'cable'], ratio: 0.15 },
    { from: 'chest_press_machine', kinds: ['chest_fly_machine'], ratio: 0.6 },
  ],
  dumbbell_shoulder_press: [{ from: 'shoulder_press_machine', kinds: ['dumbbells'], ratio: 0.4 }],
  lateral_raise: [{ from: 'shoulder_press_machine', kinds: ['dumbbells', 'cable'], ratio: 0.12 }],
  overhead_triceps_extension: [{ from: 'triceps_pushdown', kinds: ['dumbbells', 'barbell'], ratio: 0.6 }],
  dumbbell_row: [{ from: 'cable_row', kinds: ['dumbbells', 'kettlebell'], ratio: 0.45 }],
  face_pull: [{ from: 'cable_row', kinds: ['cable'], ratio: 0.4 }],
  reverse_fly: [
    { from: 'cable_row', kinds: ['dumbbells', 'cable'], ratio: 0.1 },
    { from: 'cable_row', kinds: ['chest_fly_machine'], ratio: 0.4 },
  ],
  biceps_curl: [{ from: 'biceps_curl', kinds: ['dumbbells'], ratio: 0.45 }],
  hammer_curl: [{ from: 'biceps_curl', kinds: ['dumbbells'], ratio: 0.5 }],
  goblet_squat: [{ from: 'back_squat', kinds: ['dumbbells', 'kettlebell'], ratio: 0.3 }],
  romanian_deadlift: [{ from: 'back_squat', kinds: ['barbell'], ratio: 0.85 }],
  dumbbell_romanian_deadlift: [{ from: 'back_squat', kinds: ['dumbbells'], ratio: 0.35 }],
  hip_thrust: [
    { from: 'back_squat', kinds: ['barbell'], ratio: 1.1 },
    { from: 'back_squat', kinds: ['dumbbells'], ratio: 0.4 },
  ],
  machine_calf_raise: [{ from: 'leg_press', kinds: ['calf_raise_machine', 'leg_press'], ratio: 0.6 }],
  hip_adduction: [
    { from: 'leg_extension', kinds: ['hip_adductor'], ratio: 0.9 },
    { from: 'leg_extension', kinds: ['cable'], ratio: 0.25 },
  ],
  farmers_carry: [{ from: 'back_squat', kinds: ['dumbbells', 'kettlebell'], ratio: 0.35 }],
  cable_woodchop: [{ from: 'cable_row', kinds: ['cable'], ratio: 0.3 }],
  ab_crunch_machine: [{ from: 'leg_extension', kinds: ['ab_crunch_machine'], ratio: 0.6 }],
};

export type StrengthEstimate = { logOneRm: number; sd: number; source: StrengthSource };

export function startingOneRepMax(
  exerciseId: string,
  loadKind: EquipmentKind | undefined,
  profile: Pick<Profile, 'sex' | 'ageYears' | 'bodyweightKg' | 'experience'>,
): StrengthEstimate | null {
  const convention = CONVENTIONS[exerciseId];
  if (convention && loadKind && convention.kinds.includes(loadKind)) {
    const lo = Math.log(convention.lowKg * CONVENTION_DIVISOR);
    const hi = Math.log(convention.highKg * CONVENTION_DIVISOR);
    return { logOneRm: (lo + hi) / 2, sd: (hi - lo) / 2, source: 'convention' };
  }
  const measuredRule = RULES[exerciseId];
  const guess = loadKind && !(measuredRule && measuredRule.kinds.includes(loadKind)) ? GUESSES[exerciseId]?.find((g) => g.kinds.includes(loadKind)) : undefined;
  const rule: Rule | undefined = guess ? { from: guess.from, kinds: guess.kinds, source: 'convention', logRatio: Math.log(guess.ratio) } : measuredRule;
  if (!rule || !loadKind || !rule.kinds.includes(loadKind)) return null;
  const m = S.exercises[rule.from];
  if (!m || m.n_groups < MIN_GROUPS) return null;
  const male = profile.sex === 'male' ? 1 : 0;
  const gap = UPPER.has(rule.from) ? S.sex_gap_log.upper : S.sex_gap_log.lower;
  let logOneRm =
    Math.log(profile.bodyweightKg) +
    m.intercept +
    gap * male +
    S.trained * (profile.experience === 'new' ? 0 : 1) +
    S.age_per_decade * (Math.max(0, profile.ageYears - 25) / 10);
  let sd = m.sd;
  if (rule.source === 'ratio') {
    const ratio = S.deadlift_to_squat[profile.sex];
    logOneRm += Math.log(ratio.median_ratio);
    sd = Math.sqrt(sd * sd + ratio.log_sd * ratio.log_sd);
  }
  if (rule.logRatio) logOneRm += rule.logRatio;
  if (rule.source === 'analogy') sd = Math.sqrt(sd * sd + ANALOGY_EXTRA_SD * ANALOGY_EXTRA_SD);
  if (rule.source === 'convention') sd = Math.sqrt(sd * sd + GUESS_EXTRA_SD * GUESS_EXTRA_SD);
  return { logOneRm, sd, source: rule.source };
}

export function relatedLiftOf(exerciseId: string): string | null {
  const rule = RULES[exerciseId];
  if (rule && rule.source === 'analogy') return rule.from;
  return GUESSES[exerciseId]?.[0]?.from ?? null;
}
