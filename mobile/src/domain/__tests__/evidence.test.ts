import { EXERCISE_EVIDENCE, STUDIES, TOPICS } from '../evidence';
import { EXERCISES_BY_ID } from '../exercises';

describe('evidence library', () => {
  it('only annotates real exercises and cites studies that exist', () => {
    for (const [id, notes] of Object.entries(EXERCISE_EVIDENCE)) {
      expect(EXERCISES_BY_ID[id]).toBeDefined();
      for (const n of notes) for (const s of n.studies) expect(STUDIES[s]).toBeDefined();
    }
    for (const t of TOPICS) {
      expect(t.studies.length).toBeGreaterThan(0);
      for (const s of t.studies) expect(STUDIES[s]).toBeDefined();
    }
  });

  it('links every study and keeps topic ids unique', () => {
    for (const s of Object.values(STUDIES)) expect(s.url).toMatch(/^https:\/\//);
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
  });

  it('writes without em dashes', () => {
    const text = JSON.stringify({ STUDIES, TOPICS, EXERCISE_EVIDENCE });
    expect(text).not.toContain('—');
  });
});
