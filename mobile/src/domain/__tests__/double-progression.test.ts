import type { LoggedSet } from '../dose';
import { generatePlan } from '../generator';
import { DEFAULT_PROFILE } from '../profile';

const TODAY = '2026-10-20';
const LAST = '2026-10-13';
const exercises = (history: LoggedSet[]) => generatePlan(DEFAULT_PROFILE, history, TODAY).sessions.flatMap((s) => s.exercises);
const start = exercises([]).find((e) => e.loadSource === 'population' && e.loadKg !== null && !e.emptyBar && e.repRange[1] >= 13)!;
const sets = (weightKg: number, reps: number, rpe: number | null, failed?: boolean): LoggedSet[] =>
  [1, 2, 3].map(() => ({ date: LAST, exerciseId: start.exerciseId, reps, weightKg, rpe, rir: null, failed }));
const next = (history: LoggedSet[]) => exercises(history).find((e) => e.exerciseId === start.exerciseId)!;

describe('double progression for lifts without a strength estimate', () => {
  it('has a high-rep lift whose sets cannot give an e1RM', () => {
    expect(start).toBeDefined();
    expect(start.repRange[1] + start.targetRir).toBeGreaterThan(12);
  });

  it('adds an increment once every top set reaches the top of the range at or below the target effort', () => {
    const top = start.loadKg! + 10;
    const e = next(sets(top, start.repRange[1], 6));
    expect(e.loadKg).toBeGreaterThan(top);
    expect(e.loadKg).toBeLessThanOrEqual(top + 5);
    expect(e.loadSource).toBe('log');
    expect(e.liftMoreShare).toBeNull();
  });

  it('holds the last load when reps fall short, effort is unrated, or a set failed', () => {
    const top = start.loadKg! + 10;
    expect(next(sets(top, start.repRange[0], 7)).loadKg).toBe(top);
    expect(next(sets(top, start.repRange[1], null)).loadKg).toBe(top);
    expect(next(sets(top, start.repRange[1], null, true)).loadKg).toBe(top);
  });

  it('keeps progressing after an e1RM exists when the last top sets were beyond the e1RM range', () => {
    const top = start.loadKg! + 10;
    const lighter = [1, 2, 3].map(() => ({ date: LAST, exerciseId: start.exerciseId, reps: 10, weightKg: start.loadKg!, rpe: 10, rir: null }));
    const e = next([...lighter, ...sets(top, start.repRange[1], 6)]);
    expect(e.loadKg).toBeGreaterThan(top);
    expect(e.loadSource).toBe('log');
  });

  it('never goes below the cautious start', () => {
    expect(next(sets(start.loadKg! - 10, start.repRange[1], 6)).loadKg).toBe(start.loadKg);
  });
});
