import { prepareImport, markLikelyWarmups } from '../resolve';
import { estimateFromBracket } from '../session-update';
import { likelyWarmups, looksLikeWarmup } from '../warmup';

const set = (weightKg: number, reps: number, rpe: number | null = null, exerciseId = 'back_squat', date = '2026-10-01') => ({ date, exerciseId, weightKg, reps, rpe, rir: null });

describe('likelyWarmups (logs)', () => {
  it('flags an unmarked ramp before the working sets, not the working sets', () => {
    const day = [set(20, 8), set(60, 5), set(80, 3), set(100, 5), set(100, 5), set(100, 5)];
    expect(likelyWarmups(day)).toEqual([true, true, true, false, false, false]);
  });

  it('keeps a light set the lifter rated as hard', () => {
    expect(likelyWarmups([set(60, 5, 9), set(100, 5)])).toEqual([false, false]);
  });

  it('flags a light set rated 4 or more reps left', () => {
    expect(likelyWarmups([set(60, 5, 6), set(100, 5)])).toEqual([true, false]);
  });

  it('keeps a light set of many reps that is close to failure', () => {
    expect(likelyWarmups([set(85, 12), set(100, 5)])).toEqual([false, false]);
  });

  it('leaves back-off sets after the top set, single sets, and pull-ups alone', () => {
    expect(likelyWarmups([set(100, 5), set(50, 5)])).toEqual([false, false]);
    expect(likelyWarmups([set(20, 5)])).toEqual([false]);
    expect(likelyWarmups([set(0, 8, null, 'pull_up'), set(20, 5, null, 'pull_up')])).toEqual([false, false]);
  });

  it('groups by day and exercise', () => {
    const flags = likelyWarmups([set(60, 5), set(100, 5, null, 'deadlift'), set(100, 5, null, 'back_squat', '2026-10-02'), set(100, 5)]);
    expect(flags).toEqual([true, false, false, false]);
  });
});

describe('looksLikeWarmup (in a workout)', () => {
  const estimate = estimateFromBracket(55, 157.5);
  const at = (weightKg: number, reps: number, rpe: number | null = null) =>
    looksLikeWarmup({ exerciseId: 'back_squat', weightKg, reps, rpe, failed: false, estimate, targetReps: 5, targetRir: 2 });

  it('flags the empty bar and light sets of few reps', () => {
    expect(at(20, 8)).toBe(true);
    expect(at(30, 5)).toBe(true);
  });

  it('never flags a set at the weak end of the range, or one rated hard', () => {
    expect(at(55, 5)).toBe(false);
    expect(at(30, 5, 9)).toBe(false);
    expect(looksLikeWarmup({ exerciseId: 'back_squat', weightKg: 30, reps: 5, rpe: 10, failed: true, estimate, targetReps: 5, targetRir: 2 })).toBe(false);
  });

  it('needs an estimate', () => {
    expect(looksLikeWarmup({ exerciseId: 'back_squat', weightKg: 20, reps: 5, rpe: null, failed: false, estimate: null, targetReps: 5, targetRir: 2 })).toBe(false);
  });
});

describe('import', () => {
  const file = [
    { date: '2026-10-01', exerciseName: 'Squat (Barbell)', setIndex: 1, reps: 5, weightKg: 60, rpe: null, rir: null },
    { date: '2026-10-01', exerciseName: 'Squat (Barbell)', setIndex: 2, reps: 5, weightKg: 100, rpe: null, rir: null },
  ];
  const resolved = new Map([['Squat (Barbell)', 'back_squat']]);

  it('marks spotted warm-ups', () => {
    const marked = markLikelyWarmups(file, resolved);
    expect(marked[0]).toMatchObject({ warmup: true, autoWarmup: true });
    expect(marked[1].warmup).toBeUndefined();
  });

  it('treats a spotted warm-up already stored as a working set as a duplicate', () => {
    const existing = [{ date: '2026-10-01', exerciseId: 'back_squat', setIndex: 1, reps: 5, weightKg: 60 }];
    const { ready, duplicates } = prepareImport(markLikelyWarmups(file, resolved), resolved, existing);
    expect(duplicates).toBe(1);
    expect(ready).toHaveLength(1);
  });
});
