import type { ImportedSet } from '../csv';
import { prepareImport, resolveNames } from '../resolve';

const set = (exerciseName: string, setIndex = 1): ImportedSet => ({
  date: '2026-10-20', exerciseName, setIndex, reps: 8, weightKg: 80, rpe: null, rir: null,
});

describe('resolveNames', () => {
  it('prefers saved aliases, then fuzzy matches, else asks', () => {
    const { resolved, unresolved } = resolveNames(
      ['Bench Press (Barbell)', 'Turkish Get Up', 'My Weird Curl', 'Bench Press (Barbell)'],
      new Map([['My Weird Curl', 'hammer_curl']]),
    );
    expect(resolved.get('Bench Press (Barbell)')).toBe('barbell_bench_press');
    expect(resolved.get('My Weird Curl')).toBe('hammer_curl');
    expect(unresolved).toEqual(['Turkish Get Up']);
  });
});

describe('prepareImport', () => {
  it('drops unmatched sets and duplicates of existing ones', () => {
    const resolved = new Map([['Bench', 'barbell_bench_press']]);
    const existing = [{ date: '2026-10-20', exerciseId: 'barbell_bench_press', setIndex: 1, reps: 8, weightKg: 80 }];
    const { ready, duplicates, unmatched } = prepareImport(
      [set('Bench', 1), set('Bench', 2), set('Bench', 2), set('Unknown')],
      resolved,
      existing,
    );
    expect(ready.map((s) => s.setIndex)).toEqual([2]);
    expect(duplicates).toBe(2);
    expect(unmatched).toBe(1);
  });
});
