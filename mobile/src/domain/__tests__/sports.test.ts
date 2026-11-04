import { HOME_DUMBBELLS } from '../equipment';
import { EXERCISES_BY_ID, MUSCLES } from '../exercises';
import { sessionStrengthDose } from '../dose';
import { effectiveSplit, generatePlan } from '../generator';
import { DEFAULT_PROFILE, type Profile } from '../profile';
import { SPORT_PROFILES, SPORTS, type Sport } from '../sports';

const TODAY = '2026-10-20';
const plan = (sport: Sport, over: Partial<Profile> = {}) => generatePlan({ ...DEFAULT_PROFILE, sport, ...over }, [], TODAY);
const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const ids = (p: ReturnType<typeof plan>) => p.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));

describe('sport settings', () => {
  it('every sport produces a full week that fits the session time', () => {
    for (const sport of SPORTS) {
      const p = plan(sport);
      expect(p.sessions).toHaveLength(3);
      for (const s of p.sessions) {
        expect(s.exercises.length).toBeGreaterThan(0);
        expect(s.estimatedMinutes).toBeLessThanOrEqual(DEFAULT_PROFILE.sessionMinutes);
      }
      expect(p.conditioning.length).toBeGreaterThan(0);
    }
  });

  it('combat sports lift less than general lifting', () => {
    const general = total(plan('general').targets);
    for (const sport of ['muay_thai', 'boxing', 'wrestling'] as const) expect(total(plan(sport).targets)).toBeLessThan(general);
  });

  it('combat sports open every session with power work; lower days follow with a heavy lower-body lift', () => {
    for (const sport of ['muay_thai', 'boxing', 'wrestling'] as const) {
      const p = plan(sport);
      expect(p.sessions.map((s) => s.kind)).toEqual(['lower', 'upper', 'lower']);
      for (const s of p.sessions) {
        expect(s.exercises[0].power).toBe(true);
        expect(s.exercises[0].loadKg).toBeNull();
        expect(s.exercises[0].targetRir).toBeGreaterThanOrEqual(3);
        if (s.kind === 'lower') expect(SPORT_PROFILES[sport].lowerAnchors.flat()).toContain(s.exercises[1].exerciseId);
      }
    }
  });

  it('wrestling trains grip and neck; general lifting does not target them', () => {
    const wrestling = plan('wrestling');
    expect(wrestling.targets.forearms).toBeGreaterThan(0);
    expect(wrestling.targets.neck).toBeGreaterThan(0);
    expect(wrestling.delivered.forearms).toBeGreaterThan(0);
    const general = plan('general');
    expect(general.targets.forearms).toBe(0);
    expect(general.targets.neck).toBe(0);
    expect(wrestling.targets.upper_back).toBeGreaterThanOrEqual(wrestling.targets.chest);
    if (wrestling.targets.upper_back === wrestling.targets.chest) {
      expect(wrestling.notes.some((n) => n.includes('more sessions per week'))).toBe(true);
    }
  });

  it('powerlifting trains the competition lifts at their weekly frequency, heavy', () => {
    const p = plan('powerlifting');
    const count = (id: string) => ids(p).filter((x) => x === id).length;
    expect(count('back_squat')).toBe(2);
    expect(count('barbell_bench_press')).toBe(3);
    expect(count('deadlift')).toBe(1);
    for (const e of p.sessions.flatMap((s) => s.exercises).filter((e) => e.exerciseId === 'back_squat')) {
      expect(e.repRange[1]).toBeLessThanOrEqual(5);
    }
    for (const s of p.sessions) {
      const heavy = s.exercises.filter((e) => EXERCISES_BY_ID[e.exerciseId].heavyCompound).length;
      expect(heavy).toBeLessThanOrEqual(2);
    }
  });

  it('powerlifting days follow the 2-3-1 protocol: squat + bench, deadlift + bench, squat + bench', () => {
    const p = plan('powerlifting');
    expect(p.sessions.map((s) => s.title)).toEqual(['Squat A', 'Deadlift', 'Squat B']);
    const lifts = p.sessions.map((s) => s.exercises.map((e) => e.exerciseId));
    expect(lifts[0]).toEqual(expect.arrayContaining(['back_squat', 'barbell_bench_press']));
    expect(lifts[1]).toEqual(expect.arrayContaining(['deadlift', 'barbell_bench_press']));
    expect(lifts[1]).not.toContain('back_squat');
    expect(lifts[2]).toEqual(expect.arrayContaining(['back_squat', 'barbell_bench_press']));
    for (const id of ['back_squat', 'barbell_bench_press', 'deadlift']) {
      const weekly = p.sessions.flatMap((s) => s.exercises).filter((e) => e.exerciseId === id).reduce((n, e) => n + e.sets, 0);
      expect(weekly).toBeGreaterThanOrEqual(3);
      expect(weekly).toBeLessThanOrEqual(6);
    }
  });

  it('powerlifting flags missing equipment for the competition lifts', () => {
    const p = plan('powerlifting', { equipment: HOME_DUMBBELLS });
    expect(p.notes.join(' ')).toMatch(/Competition lifts/);
  });

  it('uses each sport’s split when the split is auto, and respects an explicit choice', () => {
    expect(effectiveSplit({ ...DEFAULT_PROFILE, sport: 'general' })).toEqual(['push', 'pull', 'legs']);
    expect(effectiveSplit({ ...DEFAULT_PROFILE, sport: 'boxing' })).toEqual(['lower', 'upper', 'lower']);
    expect(effectiveSplit({ ...DEFAULT_PROFILE, sport: 'powerlifting' })).toEqual(['squat_day', 'deadlift_day', 'squat_day']);
    expect(effectiveSplit({ ...DEFAULT_PROFILE, sport: 'boxing', split: 'full_body' })).toEqual(['full', 'full', 'full']);
    expect(effectiveSplit({ ...DEFAULT_PROFILE, sport: 'boxing', split: 'ppl' })).toEqual(['push', 'pull', 'legs']);
  });

  it('priority weights scale each muscle’s volume', () => {
    const p = plan('muay_thai', { daysPerWeek: 4, trainingDays: [0, 1, 3, 4] });
    expect(p.targets.glutes).toBeGreaterThan(p.targets.chest);
    const dose = (sets: number, f: number) => f * sessionStrengthDose(sets / f);
    const sessions = (m: 'glutes' | 'chest') => p.sessions.filter((x) => x.exercises.some((e) => EXERCISES_BY_ID[e.exerciseId].muscles[m])).length;
    const ratio = dose(p.targets.glutes, sessions('glutes')) / dose(p.targets.chest, sessions('chest'));
    if (!p.notes.some((n) => n.includes('more sessions per week'))) expect(Math.abs(ratio / (1.3 / 0.7) - 1)).toBeLessThan(0.1);
    for (const m of MUSCLES) expect(p.targets[m]).toBeGreaterThanOrEqual(0);
  });
});
