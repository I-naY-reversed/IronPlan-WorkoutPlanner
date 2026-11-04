export type Unit = 'kg' | 'lb';

export const LB_PER_KG = 2.20462262;

export const toUnit = (kg: number, unit: Unit) => (unit === 'lb' ? kg * LB_PER_KG : kg);
export const fromUnit = (x: number, unit: Unit) => (unit === 'lb' ? x / LB_PER_KG : x);

export function roundLoad(kg: number, unit: Unit): number {
  const v = toUnit(kg, unit);
  const step = Math.abs(v) < 2 ? 100 : 10;
  return Math.round(v * step) / step;
}

export function formatLoad(kg: number, unit: Unit): string {
  return String(roundLoad(kg, unit));
}
