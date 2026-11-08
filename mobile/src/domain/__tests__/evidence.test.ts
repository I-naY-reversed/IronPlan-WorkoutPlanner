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

  it('links every study by its DOI and keeps topic ids unique', () => {
    for (const s of Object.values(STUDIES)) expect(s.url).toMatch(/^https:\/\/doi\.org\/10\.\d{4,}\/\S+$/);
    expect(new Set(Object.values(STUDIES).map((s) => s.url)).size).toBe(Object.keys(STUDIES).length);
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length);
  });

  it('cites each study with the year in its id', () => {
    for (const [id, s] of Object.entries(STUDIES)) expect(id).toContain(s.cite.slice(-4));
  });

  it('only annotates exercises the cited studies tested', () => {
    expect(EXERCISE_EVIDENCE.pull_up).toBeUndefined();
    expect(EXERCISE_EVIDENCE.lateral_raise).toBeUndefined();
  });

  it('writes without em dashes', () => {
    const text = JSON.stringify({ STUDIES, TOPICS, EXERCISE_EVIDENCE });
    expect(text).not.toContain('—');
  });
});
