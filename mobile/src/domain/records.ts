import type { CompetitionLift } from './generator';
import type { Sex } from './profile';
import RECORDS from './world-records.json';

type Lift = 'squat' | 'bench' | 'deadlift';
const LIFT: Record<CompetitionLift, Lift> = { back_squat: 'squat', barbell_bench_press: 'bench', deadlift: 'deadlift' };
const SEX_KEY: Record<Sex, 'M' | 'F'> = { male: 'M', female: 'F' };

export const RECORD_SOURCE = RECORDS.source;

export function weightClass(sex: Sex, bodyweightKg: number): string {
  const classes = RECORDS.classes[SEX_KEY[sex]];
  return classes.find((c) => !c.endsWith('+') && bodyweightKg <= Number(c)) ?? classes[classes.length - 1];
}

export function worldRecord(lift: CompetitionLift, sex: Sex, bodyweightKg: number): { kg: number; weightClass: string } | null {
  const cls = weightClass(sex, bodyweightKg);
  const table = RECORDS.records[SEX_KEY[sex]] as Record<string, Partial<Record<Lift, number>>>;
  const kg = table[cls]?.[LIFT[lift]];
  return kg ? { kg, weightClass: cls } : null;
}

export function absoluteRecord(lift: CompetitionLift, sex: Sex): { kg: number; weightClass: string } {
  const table = RECORDS.records[SEX_KEY[sex]] as Record<string, Partial<Record<Lift, number>>>;
  let best = { kg: 0, weightClass: '' };
  for (const [cls, row] of Object.entries(table)) {
    const kg = row[LIFT[lift]] ?? 0;
    if (kg > best.kg) best = { kg, weightClass: cls };
  }
  return best;
}

export const STREETLIFTING_SOURCE = 'Official Streetlifting rankings, all-time absolute, added weight, read 2026-10-20';
export const STREETLIFTING_RECORDS: Record<'pull_up' | 'dip', Record<Sex, number>> = {
  pull_up: { male: 125, female: 63.75 },
  dip: { male: 200, female: 90 },
};
