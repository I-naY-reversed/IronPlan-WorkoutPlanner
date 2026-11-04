import type { Profile } from './profile';

export const PROTEIN = {
  breakpoint: 1.62,
  low: 1.03,
  high: 2.2,
  perMeal: 0.4,
  meals: 4,
} as const;

export type ProteinGuide = {
  grams: { mean: number; low: number; high: number };
  perMealGrams: number;
  meals: number;
  referenceKg: number;
  adjusted: boolean;
};

export function proteinGuide(profile: Pick<Profile, 'bodyweightKg' | 'heightCm'>): ProteinGuide {
  const m = profile.heightCm / 100;
  const bmi = profile.bodyweightKg / (m * m);
  const atBmi25 = 25 * m * m;
  const adjusted = bmi >= 30;
  const referenceKg = adjusted ? atBmi25 + 0.25 * (profile.bodyweightKg - atBmi25) : profile.bodyweightKg;
  const round5 = (g: number) => Math.round(g / 5) * 5;
  return {
    grams: { mean: round5(PROTEIN.breakpoint * referenceKg), low: round5(PROTEIN.low * referenceKg), high: round5(PROTEIN.high * referenceKg) },
    perMealGrams: round5(PROTEIN.perMeal * referenceKg),
    meals: PROTEIN.meals,
    referenceKg,
    adjusted,
  };
}
