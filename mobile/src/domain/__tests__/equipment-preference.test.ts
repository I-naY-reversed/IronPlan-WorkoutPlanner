import { FREE_WEIGHT_GYM, FULL_GYM, HOME_DUMBBELLS, availableKinds, modalityOf, type EquipmentSetup } from '../equipment';
import { EXERCISES, EXERCISES_BY_ID, usableOption, type Muscle } from '../exercises';
import { swapOptions } from '../customize';
import { generatePlan } from '../generator';
import { DEFAULT_PROFILE, loadPreferenceOf, type Profile } from '../profile';

const TODAY = '2026-10-20';
const profile = (over: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, daysPerWeek: 4, trainingDays: [0, 1, 3, 4], ...over });
const planned = (p: Profile) => generatePlan(p, [], TODAY).sessions.flatMap((s) => s.exercises);
const share = (p: Profile, m: 'free' | 'machine') => {
  const xs = planned(p);
  return xs.filter((x) => modalityOf(x.equipment) === m).length / xs.length;
};

const primaries = (id: string) => (Object.entries(EXERCISES_BY_ID[id].muscles) as [Muscle, number][]).filter(([, w]) => w === 1).map(([m]) => m);
const freeCoverage = (equipment: EquipmentSetup) => {
  const available = availableKinds(equipment);
  const covered = new Set<Muscle>();
  for (const e of EXERCISES) {
    if (e.timed || e.variantOf) continue;
    const option = usableOption(e, available, 'free_weights');
    if (option && modalityOf(option) === 'free') for (const m of primaries(e.id)) covered.add(m);
  }
  return covered;
};
const machineNote = (notes: string[]) => {
  const note = notes.find((n) => n.startsWith('Free weights first, but'));
  return note ? note.replace(/^.*so these use a machine: /, '').replace(/\.$/, '').split(', ') : null;
};
const GYMS: EquipmentSetup[] = [
  FULL_GYM,
  HOME_DUMBBELLS,
  FREE_WEIGHT_GYM,
  { owned: { bench: {}, leg_curl: {} }, custom: [] },
  { owned: { dumbbells: {}, bench: {}, leg_curl: {}, leg_extension: {} }, custom: [] },
  { owned: { barbell: {}, squat_rack: {}, bench: {}, cable: {}, leg_press: {} }, custom: [] },
  { owned: { cable: {}, leg_press: {}, chest_fly_machine: {}, row_machine: {}, pullup_bar: {} }, custom: [] },
];

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

  it('defaults to no preference', () => {
    expect(loadPreferenceOf(DEFAULT_PROFILE)).toBe('any');
    expect(loadPreferenceOf({})).toBe('any');
    expect(planned(profile())).toEqual(planned(profile({ loadPreference: 'any' })));
  });

  it('plans more free weights with free weights first than with machines first', () => {
    expect(share(profile({ loadPreference: 'free_weights' }), 'free')).toBeGreaterThan(share(profile({ loadPreference: 'machines' }), 'free'));
    expect(share(profile({ loadPreference: 'machines' }), 'machine')).toBeGreaterThan(share(profile({ loadPreference: 'free_weights' }), 'machine'));
    expect(share(profile({ loadPreference: 'free_weights' }), 'free')).toBeGreaterThanOrEqual(share(profile(), 'free'));
  });

  it('uses no machines in a free-weight gym and still trains every main muscle', () => {
    const plan = generatePlan(profile({ equipment: FREE_WEIGHT_GYM, loadPreference: 'free_weights' }), [], TODAY);
    const xs = plan.sessions.flatMap((s) => s.exercises);
    expect(xs.every((x) => modalityOf(x.equipment) !== 'machine')).toBe(true);
    for (const m of ['chest', 'lats', 'upper_back', 'quads', 'hamstrings', 'glutes', 'calves'] as const) expect(plan.delivered[m]).toBeGreaterThan(0);
  });

  it('explains when a machine is the only way to train a muscle', () => {
    const plan = generatePlan(profile({ equipment: { owned: { bench: {}, leg_curl: {} }, custom: [] }, loadPreference: 'free_weights' }), [], TODAY);
    expect(machineNote(plan.notes)).toContain('Leg Curl');
  });

  it('names a machine exercise only when one of its main muscles has no usable free-weight exercise', () => {
    for (const equipment of GYMS) {
      const plan = generatePlan(profile({ equipment, loadPreference: 'free_weights' }), [], TODAY);
      const covered = freeCoverage(equipment);
      const named = machineNote(plan.notes) ?? [];
      const machineLifts = plan.sessions.flatMap((s) => s.exercises).filter((x) => modalityOf(x.equipment) === 'machine');
      const needed = new Set(machineLifts.filter((x) => primaries(x.exerciseId).some((m) => !covered.has(m))).map((x) => x.name));
      expect(new Set(named)).toEqual(needed);
      if (!needed.size) expect(machineNote(plan.notes)).toBeNull();
    }
  });

  it('never names a machine when a free weight can train the same muscle', () => {
    const equipment = { owned: { dumbbells: {}, bench: {}, leg_curl: {} }, custom: [] };
    expect(freeCoverage(equipment).has('hamstrings')).toBe(true);
    const plan = generatePlan(profile({ equipment, loadPreference: 'free_weights' }), [], TODAY);
    expect(machineNote(plan.notes) ?? []).not.toContain('Leg Curl');
  });

  it('shows the note only with free weights first', () => {
    const equipment = { owned: { bench: {}, leg_curl: {} }, custom: [] };
    for (const loadPreference of ['any', 'machines'] as const) {
      expect(machineNote(generatePlan(profile({ equipment, loadPreference }), [], TODAY).notes)).toBeNull();
    }
  });

  it('lists free-weight stand-ins first among equally good swaps', () => {
    const options = swapOptions('leg_press', profile({ loadPreference: 'free_weights' })).map((e) => e.id);
    expect(options.indexOf('dumbbell_split_squat')).toBeLessThan(options.indexOf('hack_squat'));
  });
});
