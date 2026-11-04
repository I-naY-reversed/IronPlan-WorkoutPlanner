import { toUnit, type Unit } from './units';

export const BAR = { kg: 20, lb: 45 } as const;
export const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] } as const;
export const BAR_KG = 20;

export function platesPerSide(loadKg: number, incrementKg = 2.5, unit: Unit = 'kg'): { plates: number[]; leftover: number } {
  const smallest = toUnit(incrementKg, unit) / 2;
  let side = Math.max(0, (toUnit(loadKg, unit) - BAR[unit]) / 2);
  const plates: number[] = [];
  for (const p of PLATES[unit]) {
    if (p < smallest - 1e-6) break;
    while (side >= p - 1e-6) {
      plates.push(p);
      side -= p;
    }
  }
  return { plates, leftover: Math.round(side * 2 * 100) / 100 };
}
