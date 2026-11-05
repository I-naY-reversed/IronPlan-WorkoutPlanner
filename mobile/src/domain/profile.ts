import { FULL_GYM, type EquipmentSetup, type LoadPreference } from './equipment';
import type { SessionKind } from './generator';
import type { Sport } from './sports';
import type { Unit } from './units';

export type Sex = 'male' | 'female';
export type Experience = 'new' | 'some' | 'experienced';
export type Goal = 'muscle' | 'strength' | 'general';
export type Appearance = 'system' | 'light' | 'dark';
import type { Language } from '@/i18n';
export type SplitPreference = 'auto' | 'ppl' | 'upper_lower' | 'lower_upper' | 'lift_days' | 'full_body' | 'custom';
export type LiftGoal = { id: string; exerciseId: string; targetKg: number; byDate: string; createdOn: string };
export type VolumePreference = 'less' | 'standard' | 'more';

export type Profile = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  bodyweightKg: number;
  experience: Experience;
  goal: Goal;
  sport: Sport;
  daysPerWeek: number;
  trainingDays: number[];
  matDays: number[];
  unit: Unit;
  appearance: Appearance;
  language?: Language;
  split: SplitPreference;
  sessionMinutes: number;
  dayFocus: Partial<Record<number, SessionKind>>;
  dayMinutes: Partial<Record<number, number>>;
  todayAdjust?: { date: string; minutes?: number; lighter?: boolean };
  volume: VolumePreference;
  equipment: EquipmentSetup;
  loadPreference?: LoadPreference;
  excludedExercises: string[];
  lockedExercises: string[];
  preferredExercises: string[];
  swaps: Record<string, string>;
  pausedWeeks: string[];
  retroPauses: string[];
  scheduleHistory: { from: string; days: number }[];
  weekStartDay: number;
  periodWeeks: 1 | 2;
  showStreaks: boolean;
  restTimer?: boolean;
  introSeen: boolean;
  display?: DisplayMode;
  awardedRecords: { exerciseId: string; week: string; date: string; e1rmKg: number; previousKg: number }[];
  goals: LiftGoal[];
  trainingTime: string;
  dayTimes: Partial<Record<number, string>>;
  reminderMinutes: number | null;
  confirmed: boolean;
};

export const POPULATION_MEANS: Record<Sex, { heightCm: number; bodyweightKg: number }> = {
  male: { heightCm: 175.3, bodyweightKg: 90.6 },
  female: { heightCm: 161.3, bodyweightKg: 77.5 },
};

export const DEFAULT_PROFILE: Profile = {
  sex: 'male',
  ageYears: 30,
  ...POPULATION_MEANS.male,
  experience: 'new',
  goal: 'muscle',
  sport: 'general',
  daysPerWeek: 3,
  trainingDays: [0, 2, 4],
  matDays: [],
  unit: 'kg',
  appearance: 'system',
  split: 'auto',
  sessionMinutes: 60,
  dayFocus: {},
  dayMinutes: {},
  volume: 'standard',
  equipment: FULL_GYM,
  excludedExercises: [],
  lockedExercises: [],
  preferredExercises: [],
  swaps: {},
  pausedWeeks: [],
  retroPauses: [],
  scheduleHistory: [],
  weekStartDay: 0,
  periodWeeks: 1,
  showStreaks: true,
  introSeen: false,
  display: undefined,
  awardedRecords: [],
  goals: [],
  trainingTime: '18:00',
  dayTimes: {},
  reminderMinutes: null,
  confirmed: false,
};

export type DisplayMode = 'simple' | 'detailed';
export const displayMode = (p: Pick<Profile, 'display' | 'experience'>): DisplayMode => p.display ?? (p.experience === 'new' ? 'simple' : 'detailed');

export const EXPERIENCE_OPTIONS: { value: Experience; label: string }[] = [
  { value: 'new', label: 'Beginner (<1 yr)' },
  { value: 'some', label: 'Intermediate (1–3 yr)' },
  { value: 'experienced', label: 'Advanced (3+ yr)' },
];
export const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: 'muscle', label: 'Hypertrophy' },
  { value: 'strength', label: 'Strength' },
  { value: 'general', label: 'General fitness' },
];
export const VOLUME_OPTIONS: { value: VolumePreference; label: string }[] = [
  { value: 'less', label: 'Less' },
  { value: 'standard', label: 'Recommended' },
  { value: 'more', label: 'More' },
];
export const VOLUME_FACTOR: Record<VolumePreference, number> = { less: 0.75, standard: 1, more: 1.25 };

export const DEFAULT_LOAD_PREFERENCE: LoadPreference = 'free_weights';
export const loadPreferenceOf = (p: Pick<Profile, 'loadPreference'>): LoadPreference => p.loadPreference ?? DEFAULT_LOAD_PREFERENCE;
export const LOAD_PREFERENCE_OPTIONS: { value: LoadPreference; label: string }[] = [
  { value: 'free_weights', label: 'Free weights first' },
  { value: 'any', label: 'No preference' },
  { value: 'machines', label: 'Machines first' },
];

export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
];

export const SESSION_MINUTE_OPTIONS = [45, 60, 75, 90, 105, 120, 135, 150] as const;

export const PROFILE_LIMITS = {
  ageYears: { min: 13, max: 100 },
  heightCm: { min: 120, max: 230 },
  bodyweightKg: { min: 30, max: 250 },
  daysPerWeek: { min: 1, max: 6 },
  sessionMinutes: { min: 45, max: 150 },
} as const;

export const DEFAULT_DAYS: Record<number, number[]> = {
  1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5],
};

export function validTime(t: unknown): t is string {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export const TIME_OPTIONS = ['06:00', '07:00', '08:00', '12:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'] as const;
export const REMINDER_OPTIONS: { value: number | -1; label: string }[] = [
  { value: -1, label: 'Off' },
  { value: 0, label: 'At start' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
];

export function clampProfile(p: Profile): Profile {
  const days = [...new Set((p.trainingDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const valid = days.length >= PROFILE_LIMITS.daysPerWeek.min && days.length <= PROFILE_LIMITS.daysPerWeek.max;
  const trainingDays = valid ? days : (DEFAULT_DAYS[Math.min(6, Math.max(1, Math.round(p.daysPerWeek) || 3))] ?? DEFAULT_DAYS[3]);
  const matDays = [...new Set((p.matDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const byDay = <T,>(o: Partial<Record<number, T>> | undefined, ok: (v: T) => boolean) =>
    Object.fromEntries(Object.entries(o ?? {}).filter(([d, v]) => trainingDays.includes(Number(d)) && v !== undefined && ok(v as T))) as Partial<Record<number, T>>;
  const minutesOk = (m: number) => Number.isFinite(m) && m >= PROFILE_LIMITS.sessionMinutes.min && m <= PROFILE_LIMITS.sessionMinutes.max;
  p = {
    ...p,
    trainingDays,
    matDays,
    unit: p.unit === 'lb' ? 'lb' : 'kg',
    daysPerWeek: trainingDays.length,
    dayFocus: byDay(p.dayFocus, (k) => typeof k === 'string'),
    dayMinutes: byDay(p.dayMinutes, minutesOk),
    volume: p.volume === 'less' || p.volume === 'more' ? p.volume : 'standard',
    preferredExercises: p.preferredExercises ?? [],
    swaps: p.swaps ?? {},
    equipment: sanitizeEquipment(p.equipment),
    loadPreference: p.loadPreference === 'any' || p.loadPreference === 'machines' ? p.loadPreference : p.loadPreference === 'free_weights' ? 'free_weights' : undefined,
    lockedExercises: p.lockedExercises ?? [],
    pausedWeeks: p.pausedWeeks ?? [],
    retroPauses: p.retroPauses ?? [],
    scheduleHistory: (p.scheduleHistory ?? []).filter((e) => e && typeof e.from === 'string' && Number.isInteger(e.days) && e.days >= 1 && e.days <= 7),
    weekStartDay: Number.isInteger(p.weekStartDay) && p.weekStartDay >= 0 && p.weekStartDay <= 6 ? p.weekStartDay : 0,
    periodWeeks: p.periodWeeks === 2 ? 2 : 1,
    showStreaks: p.showStreaks !== false,
    restTimer: p.restTimer === true,
    introSeen: p.introSeen === true,
    display: p.display === 'simple' || p.display === 'detailed' ? p.display : undefined,
    awardedRecords: (p.awardedRecords ?? []).filter((r) => r && typeof r.exerciseId === 'string' && Number.isFinite(r.e1rmKg)),
    goals: (p.goals ?? []).filter((g) => g && Number.isFinite(g.targetKg) && g.targetKg > 0),
    trainingTime: validTime(p.trainingTime) ? p.trainingTime : '18:00',
    dayTimes: byDay(p.dayTimes, validTime),
    reminderMinutes: p.reminderMinutes === undefined || p.reminderMinutes === null || !Number.isFinite(p.reminderMinutes) ? null : Math.max(0, Math.round(p.reminderMinutes)),
    excludedExercises: p.excludedExercises ?? [],
    todayAdjust:
      p.todayAdjust && typeof p.todayAdjust.date === 'string'
        ? {
            date: p.todayAdjust.date,
            minutes: Number.isFinite(p.todayAdjust.minutes) && p.todayAdjust.minutes! >= 10 && p.todayAdjust.minutes! <= 300 ? p.todayAdjust.minutes : undefined,
            lighter: p.todayAdjust.lighter === true || undefined,
          }
        : undefined,
  };
  const clamp = (v: number, k: keyof typeof PROFILE_LIMITS) =>
    Math.min(PROFILE_LIMITS[k].max, Math.max(PROFILE_LIMITS[k].min, Number.isFinite(v) ? v : DEFAULT_PROFILE[k]));
  return {
    ...p,
    ageYears: Math.round(clamp(p.ageYears, 'ageYears')),
    heightCm: clamp(p.heightCm, 'heightCm'),
    bodyweightKg: clamp(p.bodyweightKg, 'bodyweightKg'),
    daysPerWeek: Math.round(clamp(p.daysPerWeek, 'daysPerWeek')),
    sessionMinutes: Math.round(clamp(p.sessionMinutes, 'sessionMinutes')),
  };
}

export function withScheduleHistory(prev: Profile | null, next: Profile, today: string): Profile {
  if (!prev || prev.daysPerWeek === next.daysPerWeek) return next;
  const history = next.scheduleHistory.length ? [...next.scheduleHistory] : [{ from: '0000-01-01', days: prev.daysPerWeek }];
  const kept = history.filter((e) => e.from < today);
  return { ...next, scheduleHistory: [...kept, { from: today, days: next.daysPerWeek }] };
}

function sanitizeEquipment(e: EquipmentSetup): EquipmentSetup {
  const fix = <T extends { incrementKg?: number; maxKg?: number }>(x: T): T => ({
    ...x,
    incrementKg: x.incrementKg !== undefined && Number.isFinite(x.incrementKg) && x.incrementKg >= 0.25 && x.incrementKg <= 25 ? x.incrementKg : undefined,
    maxKg: x.maxKg !== undefined && Number.isFinite(x.maxKg) && x.maxKg >= 1 && x.maxKg <= 1000 ? x.maxKg : undefined,
  });
  const owned = Object.fromEntries(Object.entries(e?.owned ?? {}).map(([k, v]) => [k, fix(v ?? {})])) as EquipmentSetup['owned'];
  return { ...e, owned, custom: (e?.custom ?? []).map(fix) };
}
