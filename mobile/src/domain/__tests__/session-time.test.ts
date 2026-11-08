import { EQUIPMENT_PRESETS } from '../equipment';
import { EXERCISES_BY_ID } from '../exercises';
import { generatePlan, minutesFor, trimToTime } from '../generator';
import { DEFAULT_PROFILE, type Goal, type Profile } from '../profile';
import { SPORT_PROFILES } from '../sports';

const TODAY = '2026-10-20';
const WEEKS: number[][] = [[0, 3], [0, 2, 4], [0, 1, 3, 4], [0, 1, 2, 3, 4, 5]];
const GOALS: Goal[] = ['muscle', 'strength', 'general'];

const profile = (over: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, ...over });
const planned = (p: Profile) => generatePlan(p, [], TODAY).sessions.flatMap((s) => s.exercises);

type Row = { exerciseId: string; sets: number; keep?: boolean };
const minutes = (xs: Row[]) => 5 + xs.reduce((n, x) => n + x.sets, 0) * 2;
const isKept = (x: Row) => !!x.keep;

describe('trimming a session to its time limit', () => {
  it('leaves a session that already fits untouched', () => {
    const xs: Row[] = [{ exerciseId: 'a', sets: 3 }, { exerciseId: 'b', sets: 3 }];
    expect(trimToTime(xs, 60, minutes, isKept)).toBe(xs);
  });

  it('takes sets from the lowest-priority lift first, down to two, before dropping it', () => {
    const xs: Row[] = [{ exerciseId: 'a', sets: 4 }, { exerciseId: 'b', sets: 4 }];
    expect(trimToTime(xs, 19, minutes, isKept)).toEqual([{ exerciseId: 'a', sets: 4 }, { exerciseId: 'b', sets: 3 }]);
    expect(trimToTime(xs, 15, minutes, isKept)).toEqual([{ exerciseId: 'a', sets: 3 }, { exerciseId: 'b', sets: 2 }]);
    expect(trimToTime([{ exerciseId: 'a', sets: 2 }, { exerciseId: 'b', sets: 2 }], 10, minutes, isKept)).toEqual([{ exerciseId: 'a', sets: 2 }]);
  });

  it('never cuts protected lifts or their sets', () => {
    const xs: Row[] = [{ exerciseId: 'squat', sets: 5, keep: true }, { exerciseId: 'curl', sets: 3 }, { exerciseId: 'locked_raise', sets: 4, keep: true }];
    const out = trimToTime(xs, 0, minutes, isKept);
    expect(out).toEqual([{ exerciseId: 'squat', sets: 5, keep: true }, { exerciseId: 'locked_raise', sets: 4, keep: true }]);
  });
});

describe('session time limit in generated plans', () => {
  it('fits every session within its time limit', () => {
    const over: string[] = [];
    for (const sessionMinutes of [30, 45, 60, 75, 90])
      for (const trainingDays of WEEKS)
        for (const goal of GOALS)
          for (const preset of EQUIPMENT_PRESETS) {
            const p = profile({ sessionMinutes, daysPerWeek: trainingDays.length, trainingDays, goal, equipment: preset.setup });
            for (const s of generatePlan(p, [], TODAY).sessions) {
              const limit = minutesFor(p, s.weekday);
              if (s.estimatedMinutes > limit) over.push(`${preset.id} ${goal} ${trainingDays.length} days ${s.title}: ${s.estimatedMinutes} > ${limit}`);
            }
          }
    expect(over).toEqual([]);
  });

  it('fits a shorter day set for one weekday', () => {
    const p = profile({ sessionMinutes: 75, daysPerWeek: 3, trainingDays: [0, 2, 4], dayMinutes: { 2: 30 } });
    const short = generatePlan(p, [], TODAY).sessions.find((s) => s.weekday === 2)!;
    expect(short.estimatedMinutes).toBeLessThanOrEqual(30);
  });

  it('keeps every required lift in short sessions', () => {
    for (const sessionMinutes of [30, 45]) {
      const xs = planned(profile({ sport: 'powerlifting', goal: 'strength', sessionMinutes, daysPerWeek: 3, trainingDays: [0, 2, 4] }));
      for (const id of Object.keys(SPORT_PROFILES.powerlifting.requiredLifts)) expect(xs.some((x) => x.exerciseId === id)).toBe(true);
    }
  });

  it('keeps every locked lift in short sessions', () => {
    const lockedExercises = ['lateral_raise', 'biceps_curl', 'leg_extension'];
    const xs = planned(profile({ sessionMinutes: 30, daysPerWeek: 3, trainingDays: [0, 2, 4], lockedExercises }));
    for (const id of lockedExercises) expect(xs.some((x) => x.exerciseId === id && x.locked)).toBe(true);
  });

  it('keeps power work for combat sports in short sessions', () => {
    const xs = planned(profile({ sport: 'boxing', sessionMinutes: 30, daysPerWeek: 2, trainingDays: [0, 3] }));
    expect(xs.some((x) => EXERCISES_BY_ID[x.exerciseId].power)).toBe(true);
  });
});
