import { DEFAULT_PROFILE } from '../profile';
import { ANALOGY_EXTRA_SD, startingOneRepMax } from '../starting-strength';
import { fitSeries, PRIORS, type LiftSeries } from '../model';
import FITTED from '../fitted-priors.json';

const base = { ...DEFAULT_PROFILE, ageYears: 25 };
const kg = (id: string, kind: Parameters<typeof startingOneRepMax>[1], p = base) => {
  const e = startingOneRepMax(id, kind, p);
  return e ? Math.exp(e.logOneRm) : null;
};

describe('startingOneRepMax', () => {
  it('scales with bodyweight and shrinks with age, by the fitted coefficients', () => {
    expect(kg('barbell_bench_press', 'barbell', { ...base, bodyweightKg: 100 })! / kg('barbell_bench_press', 'barbell', { ...base, bodyweightKg: 50 })!).toBeCloseTo(2);
    const older = kg('back_squat', 'barbell', { ...base, ageYears: 45 })! / kg('back_squat', 'barbell')!;
    expect(older).toBeCloseTo(Math.exp(2 * FITTED.starting_strength.age_per_decade));
    expect(older).toBeLessThan(1);
  });

  it('uses the OpenPowerlifting sex gap, larger for upper than lower body', () => {
    const female = { ...base, sex: 'female' as const };
    const upper = kg('barbell_bench_press', 'barbell')! / kg('barbell_bench_press', 'barbell', female)!;
    const lower = kg('back_squat', 'barbell')! / kg('back_squat', 'barbell', female)!;
    expect(upper).toBeGreaterThan(lower);
    expect(Math.log(upper)).toBeCloseTo(FITTED.starting_strength.sex_gap_log.upper);
  });

  it('is higher for trained lifters', () => {
    expect(kg('leg_press', 'leg_press', { ...base, experience: 'some' })!).toBeGreaterThan(kg('leg_press', 'leg_press')!);
  });

  it('derives deadlift from squat with the OpenPowerlifting ratio, adding its spread', () => {
    const sq = startingOneRepMax('back_squat', 'barbell', base)!;
    const dl = startingOneRepMax('deadlift', 'barbell', base)!;
    expect(Math.exp(dl.logOneRm - sq.logOneRm)).toBeCloseTo(FITTED.starting_strength.deadlift_to_squat.male.median_ratio);
    expect(dl.sd).toBeGreaterThan(sq.sd);
  });

  it('flags analogies and widens their error', () => {
    const flat = startingOneRepMax('barbell_bench_press', 'barbell', base)!;
    const incline = startingOneRepMax('incline_barbell_bench_press', 'barbell', base)!;
    expect(incline.source).toBe('analogy');
    expect(incline.sd).toBeCloseTo(Math.sqrt(flat.sd ** 2 + ANALOGY_EXTRA_SD ** 2));
  });

  it('labels unmeasured lifts and other implements as rough rules of thumb, never as data', () => {
    for (const [id, kind] of [['biceps_curl', 'dumbbells'], ['face_pull', 'cable'], ['lateral_raise', 'dumbbells']] as const) {
      expect(startingOneRepMax(id, kind, base)?.source).toBe('convention');
    }
    expect(startingOneRepMax('biceps_curl', 'bands', base)).toBeNull();
  });
});

describe('model lift strength', () => {
  it('tracks a logged lift with an uncertainty near measurement noise', () => {
    const y = Array.from({ length: 12 }, (_, t) => Math.log(100) + 0.01 * t);
    const series: LiftSeries[] = [{ exerciseId: 'back_squat', dose: y.map(() => 6), y }];
    const post = fitSeries(series, 'new');
    const s = post.liftStrength.back_squat;
    expect(Math.exp(s.mean)).toBeGreaterThan(105);
    expect(Math.exp(s.mean)).toBeLessThan(118);
    expect(s.sd).toBeLessThan(2 * PRIORS.sigmaMedian);
    expect(s.sd).toBeGreaterThan(0);
  });
});
