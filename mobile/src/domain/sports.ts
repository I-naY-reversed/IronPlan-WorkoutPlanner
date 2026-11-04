import type { Muscle } from './exercises';
import type { Goal, SplitPreference } from './profile';

export const SPORTS = ['general', 'muay_thai', 'boxing', 'wrestling', 'powerlifting'] as const;
export type Sport = (typeof SPORTS)[number];
export const COMBAT_SPORTS: readonly Sport[] = ['muay_thai', 'boxing', 'wrestling'];

export type SportProfile = {
  label: string;
  summary: string;
  emphasis: Partial<Record<Muscle, number>>;
  volumeGoal: Goal;
  autoSplit: (days: number) => Exclude<SplitPreference, 'auto' | 'custom'>;
  reps: { heavy: [number, number]; compound: [number, number]; isolation: [number, number]; power: [number, number] };
  rir: { heavy: number; other: number; power: number };
  powerPerSession: number;
  requiredLifts: Record<string, number>;
  lowerAnchors: string[][];
  conditioning: string[];
};

const COMBAT_LOWER_ANCHORS = [
  ['back_squat', 'front_squat', 'goblet_squat', 'bulgarian_split_squat'],
  ['deadlift', 'romanian_deadlift', 'dumbbell_romanian_deadlift', 'hip_thrust'],
];

const GENERAL_REPS = { heavy: [6, 10], compound: [8, 12], isolation: [10, 15], power: [3, 5] } as SportProfile['reps'];

export const SPORT_PROFILES: Record<Sport, SportProfile> = {
  general: {
    label: 'General training',
    summary: 'Balanced muscle and strength. Uses your main goal setting.',
    emphasis: { calves: 0.6, adductors: 0.6, abs: 0.6, forearms: 0, neck: 0 },
    volumeGoal: 'muscle',
    autoSplit: (days) => (days <= 1 ? 'full_body' : days === 2 || days === 4 ? 'upper_lower' : 'ppl'),
    reps: GENERAL_REPS,
    rir: { heavy: 2, other: 1, power: 4 },
    powerPerSession: 0,
    requiredLifts: {},
    lowerAnchors: [],
    conditioning: [
      'Aim for 150–300 minutes of moderate cardio a week. It barely affects strength or muscle gains.',
    ],
  },

  muay_thai: {
    label: 'Muay Thai',
    summary: 'Hip, trunk and rotational power for kicks, knees and clinch, plus neck for the clinch. Lighter lifting around sport practice.',
    emphasis: {
      glutes: 1.3, hamstrings: 1.1, quads: 1, adductors: 0.9, calves: 1, abs: 1.3, upper_back: 1, rear_delts: 0.9, lats: 0.9,
      chest: 0.7, front_delts: 0.7, side_delts: 0.4, triceps: 0.6, biceps: 0.5, neck: 0.8, forearms: 0.3,
      tibialis: 0.3,
    },
    volumeGoal: 'strength',
    autoSplit: () => 'lower_upper',
    reps: { heavy: [3, 6], compound: [6, 10], isolation: [10, 15], power: [3, 5] },
    rir: { heavy: 2, other: 2, power: 4 },
    powerPerSession: 1,
    requiredLifts: {},
    lowerAnchors: COMBAT_LOWER_ANCHORS,
    conditioning: [
      'Most conditioning should come from pad work, bag work and sparring.',
      'Optional extra: round intervals matching fight structure, for example 5 × 3 min hard with 2 min easy.',
      'Keep lifting and hard conditioning in separate sessions. Explosive gains suffer most when the two are combined.',
    ],
  },

  boxing: {
    label: 'Boxing',
    summary: 'Leg drive and trunk rotation for punching power, shoulder and upper-back resilience. Lighter lifting around sport practice.',
    emphasis: {
      glutes: 1.1, quads: 1, hamstrings: 1, adductors: 0.5, calves: 0.9, abs: 1.3, upper_back: 1.1, rear_delts: 1.1, lats: 0.9,
      chest: 0.9, front_delts: 0.8, side_delts: 0.6, triceps: 0.8, biceps: 0.5, neck: 0.7, forearms: 0.4,
    },
    volumeGoal: 'strength',
    autoSplit: () => 'lower_upper',
    reps: { heavy: [3, 6], compound: [6, 10], isolation: [10, 15], power: [3, 5] },
    rir: { heavy: 2, other: 2, power: 4 },
    powerPerSession: 1,
    requiredLifts: {},
    lowerAnchors: COMBAT_LOWER_ANCHORS,
    conditioning: [
      'Most conditioning should come from rounds on the bag, pads and sparring, plus roadwork.',
      'Optional extra: round intervals, for example 3 × 3 min (amateur) or more rounds for longer bouts, with 1 min rest.',
      'Keep lifting and hard conditioning in separate sessions. Explosive gains suffer most when the two are combined.',
    ],
  },

  wrestling: {
    label: 'Wrestling',
    summary: 'Pulling strength, grip and neck, hip power for shots and lifts. Grip and isometric strength predict wrestling success.',
    emphasis: {
      upper_back: 1.3, lats: 1.2, biceps: 1.1, forearms: 1.3, neck: 1, glutes: 1.2, hamstrings: 1.1, quads: 1.1, abs: 1.1,
      rear_delts: 0.9, chest: 0.8, front_delts: 0.7, triceps: 0.7, side_delts: 0.4, calves: 0.5, adductors: 1,
    },
    volumeGoal: 'strength',
    autoSplit: () => 'lower_upper',
    reps: { heavy: [3, 6], compound: [6, 10], isolation: [8, 15], power: [3, 5] },
    rir: { heavy: 2, other: 2, power: 4 },
    powerPerSession: 1,
    requiredLifts: {},
    lowerAnchors: COMBAT_LOWER_ANCHORS,
    conditioning: [
      'Most conditioning should come from live wrestling and drilling.',
      'Optional extra: repeated hard efforts matching match periods (for example 2 × 3 min hard, 30 s rest, as in freestyle).',
      'Keep lifting and hard conditioning in separate sessions. Explosive gains suffer most when the two are combined.',
    ],
  },

  powerlifting: {
    label: 'Powerlifting',
    summary: 'Squat, bench press and deadlift trained heavy and often. Accessories support the three lifts.',
    emphasis: {
      quads: 1.2, glutes: 1.2, chest: 1.2, triceps: 1.1, upper_back: 1, hamstrings: 1, front_delts: 0.9, lats: 0.9,
      rear_delts: 0.7, side_delts: 0.4, biceps: 0.5, calves: 0.2, adductors: 0.4, abs: 0.6, forearms: 0.3, neck: 0,
    },
    volumeGoal: 'strength',
    autoSplit: () => 'lift_days',
    reps: { heavy: [1, 5], compound: [6, 10], isolation: [6, 10], power: [3, 5] },
    rir: { heavy: 2, other: 2, power: 4 },
    powerPerSession: 0,
    requiredLifts: { back_squat: 2, barbell_bench_press: 3, deadlift: 1 },
    lowerAnchors: [],
    conditioning: [
      'Light cardio such as walking or cycling, 150–300 minutes a week, away from heavy days.',
      'Keep it low-impact and away from heavy squat and deadlift sessions.',
    ],
  },
};

export const OPT_IN: ReadonlySet<Muscle> = new Set(['tibialis']);

export function emphasisFor(sport: Sport, muscle: Muscle): number {
  return SPORT_PROFILES[sport].emphasis[muscle] ?? (OPT_IN.has(muscle) ? 0 : 1);
}
