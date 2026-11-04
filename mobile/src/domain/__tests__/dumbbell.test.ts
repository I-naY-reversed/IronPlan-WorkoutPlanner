import { DUMBBELL_BENCH_RATIO, startingOneRepMax } from '../starting-strength';

describe('dumbbell bench starting estimate', () => {
  const p = { sex: 'male' as const, ageYears: 28, bodyweightKg: 80, experience: 'some' as const };
  it('is the barbell estimate times the measured ratio, per dumbbell, with wider uncertainty', () => {
    const bb = startingOneRepMax('barbell_bench_press', 'barbell', p)!;
    const db = startingOneRepMax('dumbbell_bench_press', 'dumbbells', p)!;
    expect(Math.exp(db.logOneRm) / Math.exp(bb.logOneRm)).toBeCloseTo(DUMBBELL_BENCH_RATIO / 2, 5);
    expect(db.sd).toBeGreaterThan(bb.sd);
    expect(db.source).toBe('analogy');
  });
  it('other dumbbell lifts get only a labelled rough start, not the measured ratio', () => {
    expect(startingOneRepMax('incline_dumbbell_bench_press', 'dumbbells', p)?.source).toBe('convention');
  });
});
