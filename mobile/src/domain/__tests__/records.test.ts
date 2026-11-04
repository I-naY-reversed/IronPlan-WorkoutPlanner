import { weightClass, worldRecord } from '../records';

test('weight classes follow IPF limits', () => {
  expect(weightClass('male', 90.6)).toBe('93');
  expect(weightClass('male', 93)).toBe('93');
  expect(weightClass('male', 130)).toBe('120+');
  expect(weightClass('female', 77.5)).toBe('84');
  expect(weightClass('female', 90)).toBe('84+');
});

test('records exist for every lift and class, and men lead women at the same bodyweight', () => {
  for (const lift of ['back_squat', 'barbell_bench_press', 'deadlift'] as const) {
    for (const bw of [50, 60, 70, 80, 90, 110, 140]) {
      const m = worldRecord(lift, 'male', bw);
      const f = worldRecord(lift, 'female', bw);
      expect(m && f).toBeTruthy();
      expect(m!.kg).toBeGreaterThan(f!.kg);
    }
  }
});

test('absolute records come from the heaviest class', () => {
  const { absoluteRecord } = jest.requireActual('../records');
  expect(absoluteRecord('back_squat', 'male')).toEqual({ kg: 460, weightClass: '120+' });
  expect(absoluteRecord('barbell_bench_press', 'male').kg).toBe(300);
});
