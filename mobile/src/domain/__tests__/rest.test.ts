import { EXERCISES_BY_ID } from '../exercises';
import { restSeconds } from '../prescription';

describe('restSeconds', () => {
  it('rests longer for heavy, low-rep compounds than for isolation', () => {
    const squat = EXERCISES_BY_ID.back_squat;
    expect(restSeconds(squat, [3, 6])).toBe(180);
    expect(restSeconds(squat, [6, 10])).toBe(150);
    expect(restSeconds(EXERCISES_BY_ID.dumbbell_bench_press, [8, 12])).toBe(120);
    const iso = Object.values(EXERCISES_BY_ID).find((e) => !e.heavyCompound && !e.power && Object.keys(e.muscles).length === 1)!;
    expect(restSeconds(iso, [10, 15])).toBe(90);
  });
});
