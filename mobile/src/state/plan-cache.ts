import type { LoggedSet } from '@/domain/dose';
import { EQUIPMENT_INFO, loadSettingsFor } from '@/domain/equipment';
import { generatePlan, type Plan, type PlannedExercise, type PlannedSession, type WeekFreeze } from '@/domain/generator';
import { sessionPrescriptions, type Prescription } from '@/domain/prescription';
import type { Profile } from '@/domain/profile';

let last: { key: string; plan: Plan } | null = null;

export function cachedPlan(profile: Profile, sets: (LoggedSet & { id?: number })[], today: string, freeze: WeekFreeze | null = null): Plan {
  const lastSet = sets.at(-1);
  const key = JSON.stringify([profile, today, sets.length, lastSet?.id ?? null, lastSet?.date ?? null, lastSet?.weightKg ?? null, lastSet?.reps ?? null, freeze?.week ?? null, freeze?.key ?? null]);
  if (last?.key !== key) last = { key, plan: generatePlan(profile, sets, today, freeze) };
  return last.plan;
}

export function prescriptionsFor(profile: Profile, session: PlannedSession): Prescription[] {
  return sessionPrescriptions(session, (e) => incrementFor(profile, e));
}

export function incrementFor(profile: Profile, e: PlannedExercise): number {
  const kind = e.equipment.find((k) => EQUIPMENT_INFO[k].loaded);
  return kind ? (loadSettingsFor(profile.equipment, kind, profile.unit).incrementKg ?? 2.5) : 2.5;
}
