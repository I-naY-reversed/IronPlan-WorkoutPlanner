import { EQUIPMENT_INFO, FULL_GYM, availableKinds } from '../equipment';
import { EXERCISES, usableOption } from '../exercises';
import { generatePlan } from '../generator';
import { clampProfile, DEFAULT_PROFILE } from '../profile';
import { startingOneRepMax } from '../starting-strength';

describe('starting weights', () => {
  it('every loaded lift with a plannable load has a start, except the sled', () => {
    const avail = availableKinds(FULL_GYM, 'kg');
    const missing = EXERCISES.filter((e) => !e.power && !e.timed).filter((e) => {
      const kind = usableOption(e, avail)?.find((k) => EQUIPMENT_INFO[k].loaded);
      return kind && !startingOneRepMax(e.id, kind, DEFAULT_PROFILE);
    }).map((e) => e.id);
    expect(missing).toEqual(['sled_push']);
  });

  it('rough starts are labelled, wider than data-based ones, and make no "people like you" claim', () => {
    const lateral = startingOneRepMax('lateral_raise', 'dumbbells', DEFAULT_PROFILE)!;
    const bench = startingOneRepMax('barbell_bench_press', 'barbell', DEFAULT_PROFILE)!;
    expect(lateral.source).toBe('convention');
    expect(lateral.sd).toBeGreaterThan(bench.sd);
    const plan = generatePlan(clampProfile({ ...DEFAULT_PROFILE }), [], '2026-10-26');
    for (const e of plan.sessions.flatMap((s) => s.exercises)) if (e.loadSource === 'convention') expect(e.liftMoreShare).toBeNull();
  });

  it('the rest timer is off unless turned on', () => {
    expect(clampProfile(DEFAULT_PROFILE).restTimer).toBe(false);
    expect(clampProfile({ ...DEFAULT_PROFILE, restTimer: true }).restTimer).toBe(true);
  });
});
