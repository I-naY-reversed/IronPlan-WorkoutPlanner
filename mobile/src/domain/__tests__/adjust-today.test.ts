import { adjustSession } from '../adjust-today';
import { generatePlan } from '../generator';
import { clampProfile, DEFAULT_PROFILE } from '../profile';

const plan = generatePlan(clampProfile({ ...DEFAULT_PROFILE, ageYears: 24, goal: 'strength' }), [], '2026-10-26');
const session = plan.sessions[0];

describe('adjustSession', () => {
  it('leaves the session alone with no change', () => {
    expect(adjustSession(session, {}).exercises).toEqual(session.exercises);
  });

  it('fits a shorter time by taking sets off the end first, keeping loads', () => {
    const s = adjustSession(session, { minutes: 30 });
    expect(s.estimatedMinutes).toBeLessThanOrEqual(30);
    expect(s.exercises[0].exerciseId).toBe(session.exercises[0].exerciseId);
    expect(s.exercises[0].loadKg).toBe(session.exercises[0].loadKg);
    expect(s.note).toMatch(/^30 min today: /);
  });

  it('lighter keeps every exercise with about two thirds of the sets', () => {
    const s = adjustSession(session, { lighter: true });
    expect(s.exercises).toHaveLength(session.exercises.length);
    expect(s.totalSets).toBeLessThan(session.totalSets);
    s.exercises.forEach((e) => expect(e.sets).toBeGreaterThanOrEqual(1));
  });
});
