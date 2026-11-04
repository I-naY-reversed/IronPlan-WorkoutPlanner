import { estimateOneRepMax, estimateRir, type LoggedSet } from '../dose';
import { e1rmOf, liftsWithProgress, progressSeries } from '../progress';

const set = (date: string, exerciseId: string, weightKg: number, reps: number, rpe: number | null = 10): LoggedSet =>
  ({ date, exerciseId, setIndex: 1, weightKg, reps, rpe, rir: null }) as LoggedSet;

test('keeps the best e1RM per day, oldest first', () => {
  const s = progressSeries([set('2026-10-08', 'back_squat', 100, 5), set('2026-10-01', 'back_squat', 90, 5), set('2026-10-08', 'back_squat', 80, 5)], 'back_squat', 80);
  expect(s.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-08']);
  expect(s[1].e1rmKg).toBeCloseTo(estimateOneRepMax(100, 5, estimateRir({ rpe: 10, rir: null, reps: 5 }).rir)!, 6);
});

test('pull-ups count added weight on top of bodyweight', () => {
  const rir = estimateRir({ rpe: 10, rir: null, reps: 3 }).rir;
  expect(e1rmOf(set('2026-10-01', 'pull_up', 20, 3), 80)).toBeCloseTo(estimateOneRepMax(100, 3, rir)! - 80, 6);
  expect(e1rmOf(set('2026-10-01', 'pull_up', 20, 3), 80)!).toBeGreaterThan(estimateOneRepMax(20, 3, rir)!);
});

test('lists lifts with at least two days of data', () => {
  const h = [set('2026-10-01', 'back_squat', 90, 5), set('2026-10-08', 'back_squat', 95, 5), set('2026-10-01', 'deadlift', 120, 5)];
  expect(liftsWithProgress(h, 80)).toEqual(['back_squat']);
});
