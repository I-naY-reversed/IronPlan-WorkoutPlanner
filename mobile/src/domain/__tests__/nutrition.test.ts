import { proteinGuide } from '../nutrition';

describe('protein guide', () => {
  it('scales with bodyweight, with the Morton range', () => {
    const g = proteinGuide({ bodyweightKg: 80, heightCm: 180 });
    expect(g.grams).toEqual({ mean: 130, low: 80, high: 175 });
    expect(g.perMealGrams).toBe(30);
    expect(g.meals).toBe(4);
    expect(g.adjusted).toBe(false);
  });

  it('uses an adjusted reference weight at BMI 30 or more', () => {
    const g = proteinGuide({ bodyweightKg: 140, heightCm: 175 });
    expect(g.adjusted).toBe(true);
    expect(g.referenceKg).toBeCloseTo(92.4, 0);
    expect(g.grams.mean).toBe(150);
  });

  it('stays finite at the profile limits', () => {
    for (const [w, h] of [[30, 120], [250, 230], [30, 230], [250, 120]]) {
      const g = proteinGuide({ bodyweightKg: w, heightCm: h });
      expect(Number.isFinite(g.grams.mean) && g.grams.low <= g.grams.mean && g.grams.mean <= g.grams.high).toBe(true);
    }
  });
});
