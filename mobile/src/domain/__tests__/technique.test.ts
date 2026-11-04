import { EXERCISES } from '../exercises';
import { TECHNIQUE } from '../technique';

describe('technique cues', () => {
  it('cover every exercise with 3–4 short lines, and nothing else', () => {
    for (const e of EXERCISES) {
      const cues = TECHNIQUE[e.id];
      expect(cues?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(cues.length).toBeLessThanOrEqual(4);
      cues.forEach((c) => expect(c.length).toBeLessThan(140));
    }
    const ids = new Set(EXERCISES.map((e) => e.id));
    expect(Object.keys(TECHNIQUE).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('exercise ids are unique', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });
});
