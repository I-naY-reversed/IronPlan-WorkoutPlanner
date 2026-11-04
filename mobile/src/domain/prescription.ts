import type { PlannedExercise, PlannedSession } from './generator';
import { PRIORS } from './model';
import FITTED from './fitted-priors.json';

export type Prescription = Pick<
  PlannedExercise,
  'exerciseId' | 'name' | 'sets' | 'repRange' | 'targetRir' | 'loadKg' | 'loadLow' | 'loadHigh' | 'liftMoreShare' | 'loadSource' | 'power' | 'equipment' | 'warmups' | 'sessionsOfData' | 'locked' | 'reentryWeeks' | 'checkIn'
> & { incrementKg: number };

export const rpeFor = (rir: number) => 10 - rir;

const WIDEST = Math.max(...Object.values(FITTED.starting_strength.exercises).map((e) => e.sd));
export function knowledgeDots(logSd: number): number {
  const lo = Math.log(PRIORS.sigmaMedian);
  const hi = Math.log(WIDEST);
  const t = (hi - Math.log(Math.max(logSd, 1e-6))) / (hi - lo);
  return 1 + Math.round(4 * Math.max(0, Math.min(1, t)));
}

export function logSdOf(e: Pick<PlannedExercise, 'loadKg' | 'loadLow' | 'loadHigh'>): number | null {
  if (!e.loadKg || !e.loadLow || !e.loadHigh || e.loadLow <= 0) return null;
  return (Math.log(e.loadHigh) - Math.log(e.loadLow)) / 2;
}

export function sessionPrescriptions(session: PlannedSession, increments: (e: PlannedExercise) => number): Prescription[] {
  return session.exercises.map((e) => ({
    exerciseId: e.exerciseId, name: e.name, sets: e.sets, repRange: e.repRange, targetRir: e.targetRir,
    loadKg: e.loadKg, loadLow: e.loadLow, loadHigh: e.loadHigh, liftMoreShare: e.liftMoreShare, loadSource: e.loadSource, power: e.power,
    equipment: e.equipment, warmups: e.warmups, sessionsOfData: e.sessionsOfData, locked: e.locked, reentryWeeks: e.reentryWeeks, checkIn: e.checkIn, incrementKg: increments(e),
  }));
}

export function certaintyWord(dots: number): string {
  return dots >= 5 ? 'Known closely' : dots >= 3 ? 'Known well' : 'Known roughly';
}

export function dotsWithData(logSd: number, daysOfData: number): number {
  const cap = daysOfData <= 0 ? 5 : daysOfData === 1 ? 2 : daysOfData < 4 ? 4 : 5;
  return Math.min(knowledgeDots(logSd), cap);
}

export function restSeconds(ex: { heavyCompound: boolean; power?: boolean; muscles: Record<string, number> }, repRange?: [number, number]): number {
  if (ex.power) return 180;
  if (ex.heavyCompound) return repRange && repRange[1] <= 6 ? 180 : 150;
  return Object.keys(ex.muscles).length === 1 ? 90 : 120;
}
