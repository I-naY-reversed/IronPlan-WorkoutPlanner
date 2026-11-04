import { platesPerSide } from '../plates';
import { fromUnit } from '../units';

test('loads the heaviest plates first', () => {
  expect(platesPerSide(142.5).plates).toEqual([25, 25, 10, 1.25]);
  expect(platesPerSide(100).plates).toEqual([25, 15]);
});

test('an empty bar has no plates', () => {
  expect(platesPerSide(20).plates).toEqual([]);
  expect(platesPerSide(15).plates).toEqual([]);
});

test('reports what the smallest plate cannot make up', () => {
  expect(platesPerSide(32.5, 5)).toEqual({ plates: [5], leftover: 2.5 });
});

test('pound gyms use a 45 lb bar and pound plates', () => {
  expect(platesPerSide(fromUnit(225, 'lb'), fromUnit(5, 'lb'), 'lb').plates).toEqual([45, 45]);
  expect(platesPerSide(fromUnit(185, 'lb'), fromUnit(5, 'lb'), 'lb').plates).toEqual([45, 25]);
  expect(platesPerSide(fromUnit(140, 'lb'), fromUnit(5, 'lb'), 'lb').plates).toEqual([45, 2.5]);
});
