import { preferenceRank, type EquipmentKind, type LoadPreference } from './equipment';
import FITTED from './fitted-priors.json';

export const INDIRECT_SET_WEIGHT: number = FITTED.volume.indirect_set_weight.value;

export const MUSCLES = [
  'chest',
  'lats',
  'upper_back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'tibialis',
  'abs',
  'forearms',
  'neck',
] as const;

export type Muscle = (typeof MUSCLES)[number];
export type MuscleWeight = number;

export type Exercise = {
  id: string;
  name: string;
  muscles: Partial<Record<Muscle, MuscleWeight>>;
  heavyCompound: boolean;
  requires: EquipmentKind[][];
  aliases?: string[];
  power?: boolean;
  timed?: boolean;
  variantOf?: string;
  cue?: string;
};

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  calves: 'Calves',
  tibialis: 'Shins (tibialis)',
  abs: 'Abs',
  forearms: 'Grip / forearms',
  neck: 'Neck',
};

const NONE: EquipmentKind[][] = [[]];

const TABLE: Exercise[] = [
  { id: 'barbell_bench_press', name: 'Bench Press (Barbell)', heavyCompound: true, requires: [['barbell', 'bench']],
    muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 }, aliases: ['bench press', 'flat bench'] },
  { id: 'paused_bench_press', name: 'Paused Bench Press (Barbell)', heavyCompound: true, requires: [['barbell', 'bench']],
    muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 }, variantOf: 'barbell_bench_press',
    cue: 'Lower to the chest, hold it still for about 1 second, then press. No bounce.',
    aliases: ['paused bench', 'pause bench', 'pause bench press', 'bench press paused', 'competition bench'] },
  { id: 'dumbbell_bench_press', name: 'Bench Press (Dumbbell)', heavyCompound: false, requires: [['dumbbells', 'bench']],
    muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },
  { id: 'incline_barbell_bench_press', name: 'Incline Bench Press (Barbell)', heavyCompound: true, requires: [['barbell', 'bench']],
    muscles: { chest: 1, front_delts: 0.5, triceps: 0.5 } },
  { id: 'incline_dumbbell_bench_press', name: 'Incline Bench Press (Dumbbell)', heavyCompound: false, requires: [['dumbbells', 'bench']],
    muscles: { chest: 1, front_delts: 0.5, triceps: 0.5 } },
  { id: 'chest_fly', name: 'Chest Fly', heavyCompound: false, requires: [['cable'], ['chest_fly_machine'], ['dumbbells', 'bench']],
    muscles: { chest: 1 }, aliases: ['cable fly', 'pec deck', 'dumbbell fly', 'cable crossover'] },
  { id: 'dip', name: 'Dip', heavyCompound: false, requires: [['dip_bars']],
    muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 }, aliases: ['chest dip', 'triceps dip'] },
  { id: 'push_up', name: 'Push Up', heavyCompound: false, requires: NONE,
    muscles: { chest: 1, triceps: 0.5, front_delts: 0.5 } },
  { id: 'overhead_press', name: 'Overhead Press (Barbell)', heavyCompound: true, requires: [['barbell']],
    muscles: { front_delts: 1, side_delts: 0.5, triceps: 0.5 }, aliases: ['ohp', 'military press', 'strict press'] },
  { id: 'dumbbell_shoulder_press', name: 'Shoulder Press (Dumbbell)', heavyCompound: false, requires: [['dumbbells']],
    muscles: { front_delts: 1, side_delts: 0.5, triceps: 0.5 }, aliases: ['seated dumbbell press'] },
  { id: 'pike_push_up', name: 'Pike Push Up', heavyCompound: false, requires: NONE,
    muscles: { front_delts: 1, triceps: 0.5 } },
  { id: 'lateral_raise', name: 'Lateral Raise', heavyCompound: false, requires: [['dumbbells'], ['cable'], ['bands']],
    muscles: { side_delts: 1 }, aliases: ['side raise', 'lateral raise dumbbell', 'lateral raise cable'] },
  { id: 'triceps_pushdown', name: 'Triceps Pushdown', heavyCompound: false, requires: [['cable'], ['bands']],
    muscles: { triceps: 1 }, aliases: ['tricep pushdown', 'rope pushdown', 'triceps pushdown cable'] },
  { id: 'overhead_triceps_extension', name: 'Overhead Triceps Extension', heavyCompound: false, requires: [['dumbbells'], ['cable'], ['barbell', 'bench']],
    muscles: { triceps: 1 }, aliases: ['triceps extension', 'skullcrusher', 'skull crusher'] },

  { id: 'pull_up', name: 'Pull Up', heavyCompound: false, requires: [['pullup_bar']],
    muscles: { lats: 1, biceps: 0.5, upper_back: 0.5 }, aliases: ['chin up', 'chinup', 'pullup'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', heavyCompound: false, requires: [['cable']],
    muscles: { lats: 1, biceps: 0.5, upper_back: 0.5 }, aliases: ['pulldown', 'lat pulldown cable'] },
  { id: 'barbell_row', name: 'Bent Over Row (Barbell)', heavyCompound: true, requires: [['barbell']],
    muscles: { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 }, aliases: ['barbell row', 'pendlay row'] },
  { id: 'dumbbell_row', name: 'Row (Dumbbell)', heavyCompound: false, requires: [['dumbbells'], ['kettlebell']],
    muscles: { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 }, aliases: ['one arm row', 'single arm row'] },
  { id: 'cable_row', name: 'Seated Cable Row', heavyCompound: false, requires: [['cable']],
    muscles: { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 }, aliases: ['seated row', 'cable row'] },
  { id: 'machine_row', name: 'Seated Row (Machine)', heavyCompound: false, requires: [['row_machine']],
    muscles: { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 }, aliases: ['machine row', 'seated row machine', 'chest supported row'] },
  { id: 'band_row', name: 'Band Row', heavyCompound: false, requires: [['bands']],
    muscles: { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 } },
  { id: 'face_pull', name: 'Face Pull', heavyCompound: false, requires: [['cable'], ['bands']],
    muscles: { rear_delts: 1, upper_back: 0.5 } },
  { id: 'reverse_fly', name: 'Reverse Fly', heavyCompound: false, requires: [['dumbbells'], ['cable'], ['chest_fly_machine']],
    muscles: { rear_delts: 1, upper_back: 0.5 }, aliases: ['rear delt fly', 'reverse pec deck'] },
  { id: 'biceps_curl', name: 'Biceps Curl', heavyCompound: false, requires: [['dumbbells'], ['barbell'], ['cable'], ['bands']],
    muscles: { biceps: 1, forearms: 0.5 }, aliases: ['bicep curl', 'curl', 'barbell curl', 'dumbbell curl', 'ez bar curl', 'preacher curl'] },
  { id: 'hammer_curl', name: 'Hammer Curl', heavyCompound: false, requires: [['dumbbells']],
    muscles: { biceps: 1, forearms: 0.5 } },

  { id: 'back_squat', name: 'Squat (Barbell)', heavyCompound: true, requires: [['barbell', 'squat_rack']],
    muscles: { quads: 1, glutes: 1, adductors: 1 }, aliases: ['squat', 'back squat', 'barbell squat'] },
  { id: 'pause_squat', name: 'Pause Squat (Barbell)', heavyCompound: true, requires: [['barbell', 'squat_rack']],
    muscles: { quads: 1, glutes: 1, adductors: 1 }, variantOf: 'back_squat',
    cue: 'Sit to depth, hold still for 1–2 seconds while staying tight, then stand up. No bounce.',
    aliases: ['paused squat', 'pause back squat', 'squat paused', 'paused back squat'] },
  { id: 'front_squat', name: 'Front Squat', heavyCompound: true, requires: [['barbell', 'squat_rack']],
    muscles: { quads: 1, glutes: 0.5, adductors: 0.5 } },
  { id: 'goblet_squat', name: 'Goblet Squat', heavyCompound: false, requires: [['dumbbells'], ['kettlebell']],
    muscles: { quads: 1, glutes: 0.5, adductors: 0.5 } },
  { id: 'leg_press', name: 'Leg Press', heavyCompound: false, requires: [['leg_press']],
    muscles: { quads: 1, glutes: 0.5 } },
  { id: 'hack_squat', name: 'Hack Squat', heavyCompound: false, requires: [['hack_squat']],
    muscles: { quads: 1, glutes: 0.5 } },
  { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', heavyCompound: false, requires: NONE,
    muscles: { quads: 1, glutes: 1, adductors: 0.5 }, aliases: ['split squat', 'lunge', 'walking lunge'] },
  { id: 'dumbbell_split_squat', name: 'Split Squat (Dumbbell)', heavyCompound: false, requires: [['dumbbells'], ['kettlebell']],
    muscles: { quads: 1, glutes: 1, adductors: 0.5 }, aliases: ['dumbbell split squat', 'dumbbell bulgarian split squat', 'dumbbell lunge', 'weighted split squat'] },
  { id: 'leg_extension', name: 'Leg Extension', heavyCompound: false, requires: [['leg_extension']],
    muscles: { quads: 1 } },
  { id: 'sled_push', name: 'Sled Push', heavyCompound: false, requires: [['sled']],
    muscles: { quads: 1, glutes: 0.5, calves: 0.5 }, aliases: ['prowler push', 'sled drag'] },
  { id: 'deadlift', name: 'Deadlift (Barbell)', heavyCompound: true, requires: [['barbell']],
    muscles: { glutes: 1, hamstrings: 0.5, upper_back: 0.5, quads: 0.5, adductors: 0.5, forearms: 0.5 }, aliases: ['deadlift', 'conventional deadlift', 'sumo deadlift'] },
  { id: 'romanian_deadlift', name: 'Romanian Deadlift', heavyCompound: true, requires: [['barbell']],
    muscles: { hamstrings: 1, glutes: 1 }, aliases: ['rdl', 'stiff leg deadlift'] },
  { id: 'dumbbell_romanian_deadlift', name: 'Romanian Deadlift (Dumbbell)', heavyCompound: false, requires: [['dumbbells'], ['kettlebell']],
    muscles: { hamstrings: 1, glutes: 1 } },
  { id: 'leg_curl', name: 'Leg Curl', heavyCompound: false, requires: [['leg_curl']],
    muscles: { hamstrings: 1 }, aliases: ['lying leg curl', 'seated leg curl', 'hamstring curl'] },
  { id: 'nordic_curl', name: 'Nordic Curl', heavyCompound: false, requires: NONE,
    muscles: { hamstrings: 1 } },
  { id: 'hip_thrust', name: 'Hip Thrust', heavyCompound: false, requires: [['barbell', 'bench'], ['dumbbells', 'bench']],
    muscles: { glutes: 1, hamstrings: 0.5 }, aliases: ['glute bridge'] },
  { id: 'calf_raise', name: 'Calf Raise (Bodyweight)', heavyCompound: false, requires: NONE,
    muscles: { calves: 1 }, aliases: ['calf raise', 'single leg calf raise', 'standing calf raise bodyweight'] },
  { id: 'machine_calf_raise', name: 'Calf Raise (Machine)', heavyCompound: false, requires: [['calf_raise_machine'], ['leg_press']],
    muscles: { calves: 1 }, aliases: ['standing calf raise', 'seated calf raise', 'calf press', 'leg press calf raise'] },
  { id: 'dumbbell_calf_raise', name: 'Calf Raise (Dumbbell)', heavyCompound: false, requires: [['dumbbells'], ['kettlebell']],
    muscles: { calves: 1 }, aliases: ['dumbbell calf raise', 'single leg dumbbell calf raise', 'weighted calf raise'] },
  { id: 'hip_adduction', name: 'Hip Adduction (Machine)', heavyCompound: false, requires: [['hip_adductor'], ['cable']],
    muscles: { adductors: 1 }, aliases: ['hip adductor', 'adductor machine', 'cable hip adduction'] },
  { id: 'copenhagen_adduction', name: 'Copenhagen Adduction', heavyCompound: false, requires: NONE,
    muscles: { adductors: 1 }, aliases: ['copenhagen plank', 'copenhagen'] },

  { id: 'jump_squat', name: 'Jump Squat', heavyCompound: false, power: true, requires: NONE,
    muscles: { quads: 1, glutes: 0.5, calves: 0.5 }, aliases: ['squat jump', 'box jump'] },
  { id: 'broad_jump', name: 'Broad Jump', heavyCompound: false, power: true, requires: NONE,
    muscles: { glutes: 1, quads: 0.5, hamstrings: 0.5 } },
  { id: 'kettlebell_swing', name: 'Kettlebell Swing', heavyCompound: false, power: true, requires: [['kettlebell'], ['dumbbells']],
    muscles: { glutes: 1, hamstrings: 0.5, forearms: 0.5 } },
  { id: 'power_clean', name: 'Power Clean', heavyCompound: true, power: true, requires: [['barbell']],
    muscles: { glutes: 1, quads: 0.5, hamstrings: 0.5, upper_back: 0.5, forearms: 0.5 }, aliases: ['hang clean', 'clean'] },
  { id: 'plyo_push_up', name: 'Plyometric Push Up', heavyCompound: false, power: true, requires: NONE,
    muscles: { chest: 1, triceps: 0.5 }, aliases: ['clap push up'] },
  { id: 'med_ball_rotational_throw', name: 'Rotational Med Ball Throw', heavyCompound: false, power: true, requires: [['medicine_ball']],
    muscles: { abs: 1, glutes: 0.5 }, aliases: ['med ball throw', 'medicine ball throw'] },
  { id: 'med_ball_chest_pass', name: 'Med Ball Chest Pass', heavyCompound: false, power: true, requires: [['medicine_ball']],
    muscles: { chest: 1, triceps: 0.5 } },
  { id: 'medicine_ball_drop', name: 'Medicine Ball Drop', heavyCompound: false, power: true, requires: [['medicine_ball']],
    muscles: { abs: 1, lats: 0.5 }, aliases: ['med ball drop', 'medicine ball slam', 'med ball slam'] },

  { id: 'farmers_carry', name: "Farmer's Carry", heavyCompound: false, requires: [['dumbbells'], ['kettlebell']],
    muscles: { forearms: 1, upper_back: 0.5 }, aliases: ['farmers walk', 'farmer walk'] },
  { id: 'towel_pull_up', name: 'Towel Pull Up', heavyCompound: false, requires: [['pullup_bar']],
    muscles: { lats: 1, forearms: 1, biceps: 0.5 } },
  { id: 'neck_flexion', name: 'Neck Flexion (manual or band)', heavyCompound: false, requires: NONE,
    muscles: { neck: 1 }, aliases: ['neck curl'] },
  { id: 'neck_extension', name: 'Neck Extension (manual or band)', heavyCompound: false, requires: NONE,
    muscles: { neck: 1 }, aliases: ['neck harness'] },

  { id: 'cable_woodchop', name: 'Woodchop', heavyCompound: false, requires: [['cable'], ['bands']],
    muscles: { abs: 1 }, aliases: ['cable woodchop', 'pallof press', 'cable rotation'] },
  { id: 'crunch', name: 'Crunch', heavyCompound: false, requires: NONE,
    muscles: { abs: 1 }, aliases: ['cable crunch', 'sit up', 'situp'] },
  { id: 'ab_crunch_machine', name: 'Ab Crunch (Machine)', heavyCompound: false, requires: [['ab_crunch_machine']],
    muscles: { abs: 1 }, aliases: ['ab crunch machine', 'crunch machine', 'machine crunch'] },
  { id: 'russian_twist', name: 'Russian Twist', heavyCompound: false, requires: NONE,
    muscles: { abs: 1 }, aliases: ['russian twists', 'seated twist', 'oblique twist'] },
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', heavyCompound: false, requires: [['pullup_bar']],
    muscles: { abs: 1 }, aliases: ['leg raise', 'knee raise'] },

  { id: 'tibialis_raise', name: 'Tibialis Raise', heavyCompound: false, requires: NONE,
    muscles: { tibialis: 1 }, aliases: ['tib raise', 'wall tibialis raise', 'toe raise', 'tibialis raises'] },
  { id: 'tibialis_machine', name: 'Tibialis Raise (Machine)', heavyCompound: false, requires: [['tibialis_machine']],
    muscles: { tibialis: 1 }, aliases: ['tib bar', 'tibia dorsi', 'tibialis machine', 'seated tibialis raise', 'dorsiflexion machine'] },

  { id: 'plank', name: 'Plank', heavyCompound: false, requires: NONE, timed: true,
    muscles: { abs: 1 }, aliases: ['front plank', 'forearm plank'] },
  { id: 'side_plank', name: 'Side Plank', heavyCompound: false, requires: NONE, timed: true,
    muscles: { abs: 1 }, aliases: ['side bridge'] },
  { id: 'hollow_hold', name: 'Hollow Body Hold', heavyCompound: false, requires: NONE, timed: true,
    muscles: { abs: 1 }, aliases: ['hollow hold', 'hollow body'] },
  { id: 'dead_hang', name: 'Dead Hang', heavyCompound: false, requires: [['pullup_bar']], timed: true,
    muscles: { forearms: 1 }, aliases: ['bar hang', 'hang'] },
];

export const EXERCISES: Exercise[] = TABLE.map((e) => ({
  ...e,
  muscles: Object.fromEntries(
    Object.entries(e.muscles).map(([m, w]) => [m, w === 1 ? 1 : INDIRECT_SET_WEIGHT]),
  ) as Exercise['muscles'],
}));

export const EXERCISES_BY_ID: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((e) => [e.id, e]),
);

export function usableOption(exercise: Exercise, available: Set<EquipmentKind>, preference: LoadPreference = 'any'): EquipmentKind[] | null {
  const usable = exercise.requires.filter((option) => option.every((k) => available.has(k)));
  if (!usable.length) return null;
  if (preference === 'any') return usable[0];
  return usable.reduce((best, o) => (preferenceRank(o, preference) < preferenceRank(best, preference) ? o : best));
}
