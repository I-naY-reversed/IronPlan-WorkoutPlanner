import { generatePlan } from '../generator';
import { DEFAULT_PROFILE, type Profile } from '../profile';

const TODAY = '2026-10-20';
const plan = (over: Partial<Profile>) => generatePlan({ ...DEFAULT_PROFILE, ...over }, [], TODAY).sessions.flatMap((s) => s.exercises);

describe('cautious start share', () => {
  it('says 4 in 5 for adults and 9 in 10 for under-18s on first guesses', () => {
    const adult = plan({ ageYears: 30 }).filter((e) => (e.loadSource === 'population' || e.loadSource === 'analogy') && !e.emptyBar && e.loadKg !== null);
    expect(adult.length).toBeGreaterThan(0);
    for (const e of adult) expect(e.liftMoreShare).toBe(0.8);
    const minor = plan({ ageYears: 16 }).filter((e) => (e.loadSource === 'population' || e.loadSource === 'analogy') && !e.emptyBar && e.loadKg !== null);
    for (const e of minor) expect(e.liftMoreShare).toBe(0.9);
  });

  it('makes no share claim once the load is raised to the empty bar', () => {
    for (const e of plan({ sex: 'female', ageYears: 75, bodyweightKg: 45, heightCm: 150 })) if (e.emptyBar) expect(e.liftMoreShare).toBeNull();
  });
});
