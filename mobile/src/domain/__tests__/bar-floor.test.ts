import { FULL_GYM } from '../equipment';
import { generatePlan } from '../generator';
import { DEFAULT_PROFILE, type Profile } from '../profile';

const TODAY = '2026-10-20';
const profile = (over: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...over });
const exercises = (p: Profile) => generatePlan(p, [], TODAY).sessions.flatMap((s) => s.exercises);

describe('barbell loads and the empty bar', () => {
  it('never suggests less than the empty bar on a barbell lift', () => {
    const weak = profile({ sex: 'female', ageYears: 75, bodyweightKg: 45, heightCm: 150, experience: 'new', daysPerWeek: 5, trainingDays: [0, 1, 2, 3, 4] });
    for (const e of exercises(weak)) {
      if (e.equipment.includes('barbell') && e.loadKg !== null) expect(e.loadKg).toBeGreaterThanOrEqual(20);
    }
  });

  it('marks a bar heavier than the suggestion, keeping the estimate range', () => {
    const weak = profile({ sex: 'female', ageYears: 75, bodyweightKg: 45, heightCm: 150, experience: 'new', daysPerWeek: 5, trainingDays: [0, 1, 2, 3, 4] });
    const floored = exercises(weak).filter((e) => e.emptyBar);
    expect(floored.length).toBeGreaterThan(0);
    for (const e of floored) {
      expect(e.loadKg).toBe(20);
      expect(e.loadLow).not.toBeNull();
      expect(e.loadLow!).toBeLessThan(20);
    }
  });

  it('drops the barbell when its max load is below the bar, using other equipment instead', () => {
    const p = profile({ equipment: { ...FULL_GYM, owned: { ...FULL_GYM.owned, barbell: { maxKg: 1 } } } });
    const list = exercises(p);
    expect(list.length).toBeGreaterThan(0);
    for (const e of list) expect(e.equipment).not.toContain('barbell');
  });

  it('keeps the barbell when its max load is at least the bar', () => {
    const p = profile({ equipment: { ...FULL_GYM, owned: { ...FULL_GYM.owned, barbell: { maxKg: 60 } } } });
    expect(exercises(p).some((e) => e.equipment.includes('barbell'))).toBe(true);
  });
});
