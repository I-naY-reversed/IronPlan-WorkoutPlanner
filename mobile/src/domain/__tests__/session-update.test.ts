import { estimateRir } from '../dose';
import { PRIORS } from '../model';
import { estimateFromBracket, updateAfterSet } from '../session-update';

const base = { reps: 5, rpe: 8, missed: false, targetReps: 5, targetRir: 2, incrementKg: 2.5 };

test('pull-ups: Epley applies to bodyweight + added, then bodyweight comes off', () => {
  const u = updateAfterSet({ ...base, prior: null, weightKg: 20, rpe: 10, bodyweightKg: 80, incrementKg: 1.25 });
  const rtfL = 5 + estimateRir({ rpe: 10, rir: null, reps: 5 }).rir;
  const rtfT = 5 + estimateRir({ rpe: null, rir: 2, reps: 5 }).rir;
  const expected = (100 * (1 + rtfL / 30)) / (1 + rtfT / 30) - 80;
  expect(Math.abs(u.next.value - expected)).toBeLessThanOrEqual(1.25);
  expect(u.next.value).toBeLessThan(25);
});

test('one set does not collapse the bracket below the measurement floor, and adds e1RM error', () => {
  const prior = estimateFromBracket(60, 140)!;
  const u = updateAfterSet({ ...base, prior, weightKg: 100, reps: 10, targetReps: 5 });
  expect(u.estimate.logSd).toBeGreaterThan(PRIORS.sigmaMedian);
  expect(u.estimate.logSd).toBeLessThan(prior.logSd);
});

test('a missed set never narrows the bracket', () => {
  const prior = estimateFromBracket(90, 110)!;
  const u = updateAfterSet({ ...base, prior, weightKg: 100, reps: 3, missed: true });
  expect(u.estimate.logSd).toBeGreaterThanOrEqual(prior.logSd - 1e-12);
  expect(u.estimate.logMean).toBeLessThan(prior.logMean);
});

test('the next load rises at most 5% or two increments', () => {
  const u = updateAfterSet({ ...base, prior: null, weightKg: 100, reps: 12, rpe: 10 });
  expect(u.next.value).toBeLessThanOrEqual(105);
  expect(u.next.low).toBeLessThanOrEqual(u.next.value);
  expect(u.next.high).toBeGreaterThan(u.next.value);
});
