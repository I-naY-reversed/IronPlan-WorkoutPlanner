import { EXERCISES_BY_ID, type Muscle } from '../exercises';
import { generatePlan } from '../generator';
import { clampProfile, DEFAULT_PROFILE, type Profile } from '../profile';

const SMALL = new Set<Muscle>(['calves', 'abs', 'forearms', 'neck', 'tibialis']);
const primary = (id: string) => (Object.entries(EXERCISES_BY_ID[id].muscles) as [Muscle, number][]).filter(([, w]) => w === 1).map(([m]) => m);
const smallOnly = (id: string) => primary(id).every((m) => SMALL.has(m));

const profiles: Partial<Profile>[] = [
  { goal: 'strength' },
  { goal: 'muscle', trainingDays: [0, 1, 3, 4] },
  { sport: 'muay_thai', sessionMinutes: 75 },
  { sport: 'powerlifting', trainingDays: [0, 2, 4, 5] },
  { sport: 'wrestling' },
];

describe('exercise order within a session', () => {
  it.each(profiles)('heavy compounds before isolation; small muscles last (%o)', (over) => {
    for (const s of generatePlan(clampProfile({ ...DEFAULT_PROFILE, ...over }), [], '2026-10-26').sessions) {
      const ids = s.exercises.map((e) => e.exerciseId);
      const firstSmall = ids.findIndex(smallOnly);
      if (firstSmall >= 0) expect(ids.slice(firstSmall).every(smallOnly)).toBe(true);
      const lastHeavy = ids.map((id) => EXERCISES_BY_ID[id].heavyCompound && !EXERCISES_BY_ID[id].power).lastIndexOf(true);
      const firstLight = ids.findIndex((id) => Object.keys(EXERCISES_BY_ID[id].muscles).length === 1 && !EXERCISES_BY_ID[id].power);
      if (lastHeavy >= 0 && firstLight >= 0) expect(lastHeavy).toBeLessThan(firstLight);
    }
  });
});
