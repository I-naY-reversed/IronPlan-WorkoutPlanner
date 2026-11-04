import { INDIRECT_SET_WEIGHT } from '../exercises';
import {
  EFFORT_PRIORS,
  effortWeight,
  estimateOneRepMax,
  estimateRir,
  sessionStrengthDose,
  setsForStrengthDose,
  SESSION_SET_CAP,
  weekStart,
  weeklyDose,
} from '../dose';

describe('estimateRir', () => {
  it('uses the prior when effort is missing', () => {
    expect(estimateRir({ rpe: null, rir: null })).toEqual({ rir: EFFORT_PRIORS.missingRir, observed: false });
  });

  it('converts RPE and applies the reporting bias', () => {
    expect(estimateRir({ rpe: 8, rir: null })).toEqual({ rir: 2 + EFFORT_PRIORS.reportBias, observed: true });
  });

  it('prefers explicit RIR over RPE', () => {
    expect(estimateRir({ rpe: 6, rir: 1 }).rir).toBe(1 + EFFORT_PRIORS.reportBias);
  });
});

describe('effortWeight', () => {
  it('is flat for strength, per the fitted Robinson et al. slope (CI spans zero)', () => {
    expect(EFFORT_PRIORS.slope).toBe(0);
    expect(effortWeight(0)).toBe(1);
    expect(effortWeight(4)).toBe(1);
  });
});

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart('2026-10-20')).toBe('2026-10-19');
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
  });
});

describe('weeklyDose', () => {
  it('counts indirect work at the fitted indirect weight', () => {
    const set = { date: '2026-10-20', exerciseId: 'barbell_bench_press', reps: 8, weightKg: 80, rpe: null, rir: null };
    const [week] = weeklyDose([set, set, set]);
    expect(week.week).toBe('2026-10-19');
    expect(week.muscles.chest.fractionalSets).toBe(3);
    expect(week.muscles.triceps.fractionalSets).toBeCloseTo(3 * INDIRECT_SET_WEIGHT, 9);
    expect(week.muscles.quads.fractionalSets).toBe(0);
    expect(week.muscles.chest.effortCoverage).toBe(0);
    expect(week.muscles.chest.effectiveSets).toBeCloseTo(3 * effortWeight(EFFORT_PRIORS.missingRir));
  });

  it('splits by week and ignores unknown exercises', () => {
    const weeks = weeklyDose([
      { date: '2026-10-27', exerciseId: 'leg_curl', reps: 10, weightKg: 40, rpe: 9, rir: null },
      { date: '2026-10-20', exerciseId: 'leg_curl', reps: 10, weightKg: 40, rpe: null, rir: null },
      { date: '2026-10-20', exerciseId: 'unknown', reps: 10, weightKg: 40, rpe: null, rir: null },
    ]);
    expect(weeks.map((w) => w.week)).toEqual(['2026-10-19', '2026-10-26']);
    expect(weeks[1].muscles.hamstrings.effortCoverage).toBe(1);
  });

  it('weights effort coverage by fractional sets', () => {
    const [week] = weeklyDose([
      { date: '2026-10-20', exerciseId: 'barbell_bench_press', reps: 8, weightKg: 80, rpe: 8, rir: null },
      { date: '2026-10-20', exerciseId: 'dumbbell_shoulder_press', reps: 10, weightKg: 20, rpe: null, rir: null },
    ]);
    const w = INDIRECT_SET_WEIGHT;
    expect(week.muscles.front_delts.fractionalSets).toBeCloseTo(1 + w, 9);
    expect(week.muscles.front_delts.effortCoverage).toBeCloseTo(w / (1 + w));
  });
});

describe('estimateOneRepMax', () => {
  it('uses Epley within 1–12 reps to failure', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5, 1)).toBeCloseTo(120);
    expect(estimateOneRepMax(100, 15)).toBeNull();
  });
});

describe('per-session strength dose', () => {
  const squat = (date: string) => ({ date, exerciseId: 'back_squat', reps: 5, weightKg: 100, rpe: null, rir: null });
  it('counts the same sets for more when spread over more sessions', () => {
    const [oneDay] = weeklyDose([squat('2026-10-20'), squat('2026-10-20'), squat('2026-10-20'), squat('2026-10-20')]);
    const [twoDays] = weeklyDose([squat('2026-10-20'), squat('2026-10-20'), squat('2026-10-22'), squat('2026-10-22')]);
    expect(oneDay.muscles.quads.effectiveSets).toBeCloseTo(twoDays.muscles.quads.effectiveSets, 9);
    expect(twoDays.muscles.quads.strengthDose).toBeGreaterThan(oneDay.muscles.quads.strengthDose);
    expect(oneDay.muscles.quads.strengthDose).toBeLessThan(sessionStrengthDose(SESSION_SET_CAP) + 1e-9);
  });
  it('inverts dose to weekly sets, capped where a session stops adding much', () => {
    const { sets } = setsForStrengthDose(2, 3);
    expect(3 * sessionStrengthDose(sets / 3)).toBeCloseTo(2, 6);
    expect(setsForStrengthDose(100, 1).capped).toBe(true);
  });
});
