import { FREE_WEIGHT_GYM, FULL_GYM, availableKinds, modalityOf } from '../equipment';
import { EXERCISES_BY_ID, usableOption } from '../exercises';
import { swapOptions } from '../customize';
import { generatePlan } from '../generator';
import { DEFAULT_PROFILE, type Profile } from '../profile';

const TODAY = '2026-10-20';
const profile = (over: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, daysPerWeek: 4, trainingDays: [0, 1, 3, 4], ...over });
const planned = (p: Profile) => generatePlan(p, [], TODAY).sessions.flatMap((s) => s.exercises);
const share = (p: Profile, m: 'free' | 'machine') => {
  const xs = planned(p);
  return xs.filter((x) => modalityOf(x.equipment) === m).length / xs.length;
};

describe('free-weight preference', () => {
  it('classifies equipment options', () => {
    expect(modalityOf(['dumbbells', 'bench'])).toBe('free');
    expect(modalityOf(['cable'])).toBe('machine');
    expect(modalityOf(['pullup_bar'])).toBe('bodyweight');
  });

  it('picks the free-weight way to do an exercise when one is available', () => {
    const gym = availableKinds(FULL_GYM);
    expect(usableOption(EXERCISES_BY_ID.chest_fly, gym)).toEqual(['cable']);
    expect(usableOption(EXERCISES_BY_ID.chest_fly, gym, 'free_weights')).toEqual(['dumbbells', 'bench']);
    expect(usableOption(EXERCISES_BY_ID.biceps_curl, gym, 'machines')).toEqual(['cable']);
  });

  it('defaults to free weights and plans more of them than machines-first does', () => {
    expect(share(profile(), 'free')).toBeGreaterThan(share(profile({ loadPreference: 'machines' }), 'free'));
    expect(share(profile({ loadPreference: 'machines' }), 'machine')).toBeGreaterThan(share(profile(), 'machine'));
  });

  it('uses no machines in a free-weight gym and still trains every main muscle', () => {
    const plan = generatePlan(profile({ equipment: FREE_WEIGHT_GYM }), [], TODAY);
    const xs = plan.sessions.flatMap((s) => s.exercises);
    expect(xs.every((x) => modalityOf(x.equipment) !== 'machine')).toBe(true);
    for (const m of ['chest', 'lats', 'upper_back', 'quads', 'hamstrings', 'glutes', 'calves'] as const) expect(plan.delivered[m]).toBeGreaterThan(0);
  });

  it('explains when a machine is the only way to train a muscle', () => {
    const gym = { owned: { bench: {}, leg_curl: {} }, custom: [] };
    const plan = generatePlan(profile({ equipment: gym }), [], TODAY);
    expect(plan.notes.join(' ')).toMatch(/use a machine: .*Leg Curl/);
  });

  it('lists free-weight stand-ins first among equally good swaps', () => {
    const options = swapOptions('leg_press', profile()).map((e) => e.id);
    expect(options.indexOf('dumbbell_split_squat')).toBeLessThan(options.indexOf('hack_squat'));
  });
});
