import { warmupSets } from '../warmup';

test('a heavy squat ramps from the empty bar', () => {
  expect(warmupSets({ workingKg: 140, incrementKg: 2.5, heavy: true, barKg: 20, firstForMuscle: true })).toEqual([
    { loadKg: 20, reps: 8 },
    { loadKg: 70, reps: 5 },
    { loadKg: 97.5, reps: 3 },
    { loadKg: 117.5, reps: 1 },
  ]);
});

test('a light barbell load needs fewer steps', () => {
  const sets = warmupSets({ workingKg: 40, incrementKg: 2.5, heavy: true, barKg: 20, firstForMuscle: true });
  expect(sets[0]).toEqual({ loadKg: 20, reps: 8 });
  expect(sets.every((s, i) => i === 0 || s.loadKg > sets[i - 1].loadKg)).toBe(true);
  expect(sets.every((s) => s.loadKg < 40)).toBe(true);
});

test('isolation work warms up once, only if nothing earlier hit the muscle', () => {
  expect(warmupSets({ workingKg: 50, incrementKg: 5, heavy: false, firstForMuscle: true })).toEqual([{ loadKg: 25, reps: 8 }]);
  expect(warmupSets({ workingKg: 50, incrementKg: 5, heavy: false, firstForMuscle: false })).toEqual([]);
});

test('no load, no warm-up', () => {
  expect(warmupSets({ workingKg: null, incrementKg: 2.5, heavy: true, barKg: 20, firstForMuscle: true })).toEqual([]);
});
