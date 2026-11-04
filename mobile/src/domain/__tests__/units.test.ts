import { defaultIncrementKg } from '../equipment';
import { formatLoad, fromUnit, roundLoad, toUnit } from '../units';

test('round-trips between kg and lb', () => {
  expect(toUnit(fromUnit(225, 'lb'), 'lb')).toBeCloseTo(225, 9);
  expect(formatLoad(100, 'lb')).toBe('220.5');
  expect(formatLoad(100, 'kg')).toBe('100');
});

test('loads rounded to a 5 lb increment display as whole 5 lb steps', () => {
  const inc = defaultIncrementKg('barbell', 'lb')!;
  const load = Math.round(100 / inc) * inc;
  expect(formatLoad(load, 'lb')).toBe('220');
  expect(roundLoad(load, 'lb')).toBe(220);
});
