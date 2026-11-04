import { weekStart, type LoggedSet } from './dose';
import { EXERCISES_BY_ID } from './exercises';
import { fitModel, liftPaths, PRIORS, weeklyGain, windowedSeries, type LiftPath, type Posterior } from './model';
import type { Profile } from './profile';
import { e1rmOf } from './progress';
import { formatLoad, type Unit } from './units';
import { dateLocale } from '@/i18n';

const DAY_MS = 86400000;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const MIN_FORECAST_ESS = 200;

export function roomToGrowSettled(potential: { low: number; high: number }, ess: number): boolean {
  return ess >= MIN_FORECAST_ESS && (1 + potential.high / 100) / (1 + Math.max(-99, potential.low) / 100) < 2;
}

export const MIN_SESSION_SETS = 3;

export function sessionDates(history: LoggedSet[]): string[] {
  const perDay = new Map<string, number>();
  for (const s of history) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
  return [...perDay].filter(([, n]) => n >= MIN_SESSION_SETS).map(([d]) => d).sort();
}

export function weekStartOn(date: string, startDay: number): string {
  return addDays(date, -((weekdayOf(date) - startDay + 7) % 7));
}

type Schedule = Pick<Profile, 'daysPerWeek' | 'scheduleHistory'>;
export function plannedDaysOn(profile: Schedule, date: string): number {
  const h = [...profile.scheduleHistory].sort((a, b) => a.from.localeCompare(b.from));
  let days = h.length ? h[0].days : profile.daysPerWeek;
  for (const e of h) if (e.from <= date) days = e.days;
  return days;
}

export const periodNeeded = (days: number, weeks: 1 | 2) => Math.max(1, weeks * Math.min(days - 1, 5));
export const periodCap = (days: number, weeks: 1 | 2) => weeks * Math.min(Math.max(days, 2), 6);
export const weeklyNeeded = (days: number) => periodNeeded(days, 1);

export type WeekStatus = 'kept' | 'repaired' | 'paused' | 'missed' | 'pending' | 'open';
export type WeekRecord = { week: string; done: number; needed: number; status: WeekStatus };
export type Consistency = {
  weeks: WeekRecord[];
  streak: number;
  total: number;
  needed: number;
  periodWeeks: 1 | 2;
  repairable: { week: string; sessions: number } | null;
  canPauseLast: boolean;
  canPauseCurrent: boolean;
  pauseWeeksLeft: number;
};

export const RETRO_PAUSES = 2;
export const RETRO_WINDOW_DAYS = 84;
export const PAUSE_ALLOWANCE_WEEKS = 6;

type StreakProfile = Schedule & Pick<Profile, 'pausedWeeks' | 'retroPauses' | 'weekStartDay' | 'periodWeeks'>;

export function consistency(history: LoggedSet[], profile: StreakProfile, today: string, shown = 12): Consistency {
  const P = profile.periodWeeks;
  const len = 7 * P;
  const dates = sessionDates(history.filter((s) => s.date <= today));
  const anchor = weekStartOn(dates[0] ?? today, profile.weekStartDay);
  const periodOf = (d: string) => addDays(anchor, len * Math.floor(daysBetween(anchor, d) / len));
  const current = periodOf(today);
  const pausedIn = new Set([...profile.pausedWeeks, ...profile.retroPauses].filter((d) => d >= anchor).map(periodOf));

  const rows: (WeekRecord & { extra: number; deficit: number })[] = [];
  for (let w = anchor; w <= current; w = addDays(w, len)) {
    const days = plannedDaysOn(profile, w);
    const needed = periodNeeded(days, P);
    const done = dates.filter((d) => d >= w && d < addDays(w, len)).length;
    const counted = Math.min(done, periodCap(days, P));
    let status: WeekStatus;
    if (done >= needed) status = 'kept';
    else if (pausedIn.has(w)) status = 'paused';
    else if (w === current) status = 'open';
    else status = 'pending';
    rows.push({ week: w, done, needed, status, extra: Math.max(0, counted - needed), deficit: Math.max(0, needed - done) });
  }

  const windowPeriods = P === 1 ? 2 : 1;
  rows.forEach((r, i) => {
    let extra = r.extra;
    for (let j = Math.max(0, i - windowPeriods); j < i && extra > 0; j++) {
      while (rows[j].status === 'pending' && rows[j].deficit > 0 && extra > 0) {
        rows[j].deficit--;
        extra--;
      }
      if (rows[j].status === 'pending' && rows[j].deficit === 0) rows[j].status = 'repaired';
    }
  });
  const last = rows.length - 1;
  for (let j = 0; j < last; j++) if (rows[j].status === 'pending' && last - j > windowPeriods) rows[j].status = 'missed';

  const oldestPending = rows.find((r) => r.status === 'pending');
  const cur = rows[last];
  const repairable = oldestPending ? { week: oldestPending.week, sessions: Math.max(1, cur.needed + oldestPending.deficit - cur.done) } : null;

  let streak = 0;
  for (let i = last; i >= 0; i--) {
    const r = rows[i];
    if (r.status === 'open' || r.status === 'paused' || r.status === 'pending') continue;
    if (r.status === 'kept' || r.status === 'repaired') streak++;
    else break;
  }
  const recentRetro = profile.retroPauses.filter((d) => daysBetween(d, today) <= RETRO_WINDOW_DAYS).length;
  const yearAgo = addDays(today, -364);
  const pausedWeeks = new Set([...profile.pausedWeeks, ...profile.retroPauses].filter((d) => d >= yearAgo).map(periodOf)).size * P;
  const pauseWeeksLeft = Math.max(0, PAUSE_ALLOWANCE_WEEKS - pausedWeeks);
  const prev = rows[last - 1];
  return {
    weeks: rows.slice(-shown).map(({ extra: _e, deficit: _d, ...r }) => r),
    streak,
    total: rows.filter((r) => r.status === 'kept' || r.status === 'repaired').length,
    needed: cur.needed,
    periodWeeks: P,
    repairable,
    canPauseLast: !!prev && prev.status === 'pending' && recentRetro < RETRO_PAUSES && pauseWeeksLeft >= P,
    canPauseCurrent: pauseWeeksLeft >= P,
    pauseWeeksLeft,
  };
}

export function previousPeriod(profile: Pick<Profile, 'weekStartDay' | 'periodWeeks'>, history: LoggedSet[], today: string): string {
  const dates = sessionDates(history.filter((s) => s.date <= today));
  const anchor = weekStartOn(dates[0] ?? today, profile.weekStartDay);
  const len = 7 * profile.periodWeeks;
  const current = addDays(anchor, len * Math.floor(daysBetween(anchor, today) / len));
  return addDays(current, -len);
}

export type Return = { missed: string[]; lastSession: string; weeksAway: number };

export function missedSessions(history: LoggedSet[], profile: Pick<Profile, 'trainingDays' | 'pausedWeeks' | 'retroPauses'>, today: string): Return | null {
  const lastSession = sessionDates(history.filter((s) => s.date < today)).at(-1);
  if (!lastSession) return null;
  const paused = new Set([...profile.pausedWeeks, ...profile.retroPauses].map(weekStart));
  const missed: string[] = [];
  for (let d = addDays(lastSession, 1); d < today; d = addDays(d, 1)) {
    if (profile.trainingDays.includes(weekdayOf(d)) && !paused.has(weekStart(d))) missed.push(d);
  }
  return missed.length ? { missed, lastSession, weeksAway: Math.floor(daysBetween(lastSession, today) / 7) } : null;
}

export function welcomeBack(r: Return): string {
  if (r.weeksAway >= 3) return `Welcome back after ${r.weeksAway} weeks. Loads start lighter and build back up.`;
  return 'Welcome back. Today’s workout is ready.';
}

export type FirstWeeks = { start: string | null; target: number; done: number; daysLeft: number };

export function firstWeeks(history: LoggedSet[], profile: StreakProfile, today: string): FirstWeeks | null {
  const dates = sessionDates(history.filter((s) => s.date <= today));
  const start = dates.length ? weekStartOn(dates[0], profile.weekStartDay) : null;
  if (start && daysBetween(start, today) >= 28) return null;
  const from = start ?? weekStartOn(today, profile.weekStartDay);
  const paused = new Set([...profile.pausedWeeks, ...profile.retroPauses].map((d) => weekStartOn(d, profile.weekStartDay)));
  let target = 0;
  for (let w = 0; w < 4; w++) {
    const week = addDays(from, 7 * w);
    if (!paused.has(week)) target += periodNeeded(plannedDaysOn(profile, week), 1);
  }
  return { start, target, done: dates.filter((d) => d >= from).length, daysLeft: 28 - daysBetween(from, today) };
}

export type RecordKind = 'strength' | 'heaviest' | 'reps';
export type SetRecord = { kind: RecordKind; exerciseId: string; date: string; weightKg: number; reps: number; e1rmKg: number | null; previousKg: number | null };

export const RECORD_K = 0.5;
export const RECORD_K_EARLY = 1;
const recordK = (observedWeeks: number) => RECORD_K + (RECORD_K_EARLY - RECORD_K) * Math.max(0, Math.min(1, (16 - observedWeeks) / 9));
export const MIN_RECORD_WEEKS = 6;

const MAX_REWARDED_RPE = 9;

const reported = (s: LoggedSet) => s.rir ?? (s.rpe !== null ? 10 - s.rpe : null);

function nearMaximal(s: LoggedSet): boolean {
  return !!s.failed || (s.rpe !== null && s.rpe > MAX_REWARDED_RPE) || (s.rir !== null && s.rir < 10 - MAX_REWARDED_RPE);
}

export function effortOutlier(set: LoggedSet, earlier: LoggedSet[]): boolean {
  const r = reported(set);
  if (r === null) return false;
  const similar = earlier
    .filter((s) => s.exerciseId === set.exerciseId && s.reps === set.reps && Math.abs(s.weightKg - set.weightKg) <= 0.025 * set.weightKg && s.date < set.date && daysBetween(s.date, set.date) <= 28)
    .map(reported)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (similar.length < 2) return false;
  return r - similar[Math.floor(similar.length / 2)] >= 3;
}

export function recordEligible(history: LoggedSet[]): LoggedSet[] {
  return history.filter((s) => !nearMaximal(s) && !effortOutlier(s, history));
}

export function recordsForSet(set: LoggedSet, earlier: LoggedSet[], bodyweightKg: number): SetRecord[] {
  if (set.drop || nearMaximal(set) || effortOutlier(set, earlier)) return [];
  const prior = earlier.filter((s) => s.exerciseId === set.exerciseId && s.reps > 0 && !s.drop && s.date < set.date && !nearMaximal(s));
  if (prior.length === 0 || set.reps <= 0) return [];
  const base = { exerciseId: set.exerciseId, date: set.date, weightKg: set.weightKg, reps: set.reps, e1rmKg: e1rmOf(set, bodyweightKg) };
  const out: SetRecord[] = [];
  const heaviest = Math.max(...prior.map((s) => s.weightKg));
  if (set.weightKg > heaviest && set.weightKg > 0) out.push({ ...base, kind: 'heaviest', previousKg: heaviest });
  const atLeast = prior.filter((s) => s.weightKg >= set.weightKg);
  if (atLeast.length && set.reps > Math.max(...atLeast.map((s) => s.reps))) out.push({ ...base, kind: 'reps', previousKg: null });
  return out;
}

export function recordPaths(history: LoggedSet[], post: Posterior, today: string): LiftPath[] {
  const upTo = history.filter((s) => s.date <= today);
  return liftPaths(windowedSeries(upTo.filter((s) => !effortOutlier(s, upTo)), today), post);
}

export function strengthRecords(paths: LiftPath[], history: LoggedSet[], from: string, to: string): SetRecord[] {
  const out: SetRecord[] = [];
  for (const p of paths) {
    if (!p.weekStart) continue;
    let best = -Infinity;
    let observed = 0;
    for (let t = 0; t < p.mean.length; t++) {
      if (p.observed[t] !== null) observed++;
      const week = p.weekStart[t];
      if (p.observed[t] !== null && observed > MIN_RECORD_WEEKS && week >= weekStart(from) && week <= to && p.mean[t] - best > recordK(observed) * p.sd[t]) {
        const day = history.filter((s) => s.exerciseId === p.exerciseId && weekStart(s.date) === week).map((s) => s.date).sort().at(-1) ?? week;
        out.push({ kind: 'strength', exerciseId: p.exerciseId, date: day, weightKg: 0, reps: 0, e1rmKg: Math.exp(p.mean[t]), previousKg: Math.exp(best) });
      }
      best = Math.max(best, p.mean[t]);
    }
  }
  return out;
}

export type AwardedRecord = { exerciseId: string; week: string; date: string; e1rmKg: number; previousKg: number };

export function recordsBetween(history: LoggedSet[], from: string, to: string, _bodyweightKg: number, paths: LiftPath[] = [], awarded: AwardedRecord[] = []): SetRecord[] {
  const keyOf = (id: string, week: string) => `${id}|${week}`;
  const frozen = new Set(awarded.map((a) => keyOf(a.exerciseId, a.week)));
  const fresh = strengthRecords(paths, history, from, to).filter((r) => !frozen.has(keyOf(r.exerciseId, weekStart(r.date))));
  const kept = awarded
    .filter((a) => a.date >= from && a.date <= to)
    .map((a): SetRecord => ({ kind: 'strength', exerciseId: a.exerciseId, date: a.date, weightKg: 0, reps: 0, e1rmKg: a.e1rmKg, previousKg: a.previousKg }));
  return [...kept, ...fresh].sort((a, b) => b.date.localeCompare(a.date));
}

export function newAwards(paths: LiftPath[], history: LoggedSet[], today: string, awarded: AwardedRecord[]): AwardedRecord[] {
  const frozen = new Set(awarded.map((a) => `${a.exerciseId}|${a.week}`));
  return strengthRecords(paths, history, addDays(today, -13), today)
    .filter((r) => !frozen.has(`${r.exerciseId}|${weekStart(r.date)}`))
    .map((r) => ({ exerciseId: r.exerciseId, week: weekStart(r.date), date: r.date, e1rmKg: r.e1rmKg!, previousKg: r.previousKg! }));
}

export function describeRecord(r: SetRecord, unit: Unit): string {
  const name = EXERCISES_BY_ID[r.exerciseId]?.name ?? r.exerciseId;
  const load = formatLoad(r.weightKg, unit);
  if (r.kind === 'strength') return `${name}: strength record, estimated 1RM now ${formatLoad(r.e1rmKg!, unit)} ${unit} (best before ${formatLoad(r.previousKg!, unit)})`;
  if (r.kind === 'heaviest') return `${name}: heaviest yet, ${load} ${unit} × ${r.reps}`;
  return `${name}: rep record, ${r.reps} reps at ${load} ${unit}`;
}

export const BLOCK_WEEKS = 4;
export type BlockSummary = { sessions: number; target: number; records: number; lifts: { exerciseId: string; fromKg: number; toKg: number }[] };
export type Block = { number: number; week: number; previous: BlockSummary | null };

export function trainingBlock(history: LoggedSet[], profile: StreakProfile & Pick<Profile, 'bodyweightKg'>, today: string, paths: LiftPath[] = [], awarded: AwardedRecord[] = []): Block | null {
  const dates = sessionDates(history.filter((s) => s.date <= today));
  if (!dates.length) return null;
  const anchor = weekStartOn(dates[0], profile.weekStartDay);
  const elapsed = daysBetween(anchor, today);
  const index = Math.floor(elapsed / (7 * BLOCK_WEEKS));
  const week = Math.floor((elapsed % (7 * BLOCK_WEEKS)) / 7) + 1;
  if (week !== 1 || index === 0) return { number: index + 1, week, previous: null };
  const start = addDays(anchor, 7 * BLOCK_WEEKS * (index - 1));
  const end = addDays(start, 7 * BLOCK_WEEKS - 1);
  const paused = new Set([...profile.pausedWeeks, ...profile.retroPauses].map((d) => weekStartOn(d, profile.weekStartDay)));
  let target = 0;
  for (let w = 0; w < BLOCK_WEEKS; w++) {
    const wk = addDays(start, 7 * w);
    if (!paused.has(wk)) target += periodNeeded(plannedDaysOn(profile, wk), 1);
  }
  const estimateAt = (p: LiftPath, date: string): number | null => {
    let v: number | null = null;
    (p.weekStart ?? []).forEach((w, t) => {
      if (w <= date && p.observed[t] !== null) v = p.mean[t];
    });
    return v as number | null;
  };
  const setsPerLift = new Map<string, number>();
  for (const s of history) if (s.date >= start && s.date <= end) setsPerLift.set(s.exerciseId, (setsPerLift.get(s.exerciseId) ?? 0) + 1);
  const lifts = paths
    .filter((p) => setsPerLift.has(p.exerciseId))
    .sort((a, b) => setsPerLift.get(b.exerciseId)! - setsPerLift.get(a.exerciseId)!)
    .map((p) => ({ exerciseId: p.exerciseId, from: estimateAt(p, addDays(start, -1)), to: estimateAt(p, end) }))
    .filter((l): l is { exerciseId: string; from: number; to: number } => l.from !== null && l.to !== null)
    .slice(0, 3)
    .map((l) => ({ exerciseId: l.exerciseId, fromKg: Math.exp(l.from), toKg: Math.exp(l.to) }));
  return {
    number: index + 1,
    week,
    previous: {
      sessions: dates.filter((d) => d >= start && d <= end).length,
      target,
      records: recordsBetween(history, start, end, profile.bodyweightKg, paths, awarded).length,
      lifts,
    },
  };
}

export const ADHERENCE_PRIOR = { mean: 0.75, weeks: 4 };

export function adherence(history: LoggedSet[], profile: Schedule & Pick<Profile, 'pausedWeeks' | 'retroPauses'>, today: string): number {
  const dates = sessionDates(history.filter((s) => s.date < weekStart(today)));
  let done = 0;
  let planned = 0;
  let weeks = 0;
  if (dates.length) {
    for (let w = 1; w <= 8; w++) {
      const week = addDays(weekStart(today), -7 * w);
      if (week < weekStart(dates[0])) break;
      const days = plannedDaysOn(profile, week);
      done += Math.min(days, dates.filter((d) => weekStart(d) === week).length);
      planned += days;
      weeks++;
    }
  }
  const observed = planned ? done / planned : ADHERENCE_PRIOR.mean;
  return (observed * weeks + ADHERENCE_PRIOR.mean * ADHERENCE_PRIOR.weeks) / (weeks + ADHERENCE_PRIOR.weeks);
}

export type GoalForecast = {
  dots: number[];
  reaching: number;
  adherence: number;
  fromYourData: boolean;
};

export const MAX_GOAL_WEEKS = 26;
const DRAWS_PER_PARTICLE = 3;

export function goalForecast(
  post: Posterior,
  exerciseId: string,
  fallback: { mean: number; sd: number },
  dose: number,
  weeks: number,
  targetKg: number,
  adherenceRate = 1,
  seed = 7,
  observationSd = 0,
  daysPerWeek = 3,
): GoalForecast | null {
  if (post.ess < MIN_FORECAST_ESS) return null;
  const a0 = PRIORS.a0[post.sex][post.experience];
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const W = Math.max(0, Math.round(weeks));
  const lift = post.liftStates[exerciseId];
  const q2 = PRIORS.processSd ** 2;
  const D = Math.max(1, Math.round(daysPerWeek));
  const draws: { v: number; w: number }[] = [];
  post.particles.forEach((p, i) => {
    const fBySessions = Array.from({ length: D + 1 }, (_, n) => Math.min(1, Math.max(0, weeklyGain((dose * n) / D, p, a0) / p.h)));
    for (let d = 0; d < DRAWS_PER_PARTICLE; d++) {
      let mu = lift ? lift.mu[i] + Math.sqrt(lift.P[i]) * gauss() : fallback.mean + fallback.sd * gauss();
      let gap = p.h * (lift ? lift.remaining[i] : post.remaining[i]);
      for (let w = 0; w < W; w++) {
        let n = 0;
        for (let k = 0; k < D; k++) if (rand() < adherenceRate) n++;
        const step = fBySessions[n] * gap;
        const shock = Math.sqrt(q2) * gauss();
        mu += step + shock;
        gap = Math.max(0, gap - step - shock);
      }
      draws.push({ v: mu + observationSd * gauss(), w: post.weights[i] / DRAWS_PER_PARTICLE });
    }
  });
  draws.sort((a, b) => a.v - b.v);
  const total = draws.reduce((s, d) => s + d.w, 0);
  const dots: number[] = [];
  let acc = 0;
  let j = 0;
  for (let k = 0; k < 20; k++) {
    const q = ((k + 0.5) / 20) * total;
    while (j < draws.length - 1 && acc + draws[j].w < q) acc += draws[j++].w;
    dots.push(Math.exp(draws[j].v));
  }
  return { dots, reaching: dots.filter((d) => d >= targetKg).length, adherence: adherenceRate, fromYourData: !!lift };
}

export const setNoise = (repsToFailure: number) => Math.hypot(PRIORS.sigmaMedian, 1 / (30 + repsToFailure));

export function goalReached(
  goal: { exerciseId: string; targetKg: number; createdOn: string },
  estimate: { mean: number; sd: number; source: string } | null,
  history: LoggedSet[],
): { date: string | null; kg: number } | null {
  if (estimate && estimate.source === 'model' && estimate.mean - Math.log(goal.targetKg) > RECORD_K * estimate.sd) return { date: null, kg: Math.exp(estimate.mean) };
  const single = history
    .filter((x) => x.exerciseId === goal.exerciseId && x.date >= goal.createdOn && x.reps === 1 && !x.failed && x.weightKg >= goal.targetKg)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return single ? { date: single.date, kg: single.weightKg } : null;
}

export const weeksUntil = (today: string, date: string) => Math.max(0, Math.ceil(daysBetween(today, date) / 7));

export function weekSummaryText(opts: {
  today: string;
  history: LoggedSet[];
  profile: StreakProfile & Pick<Profile, 'bodyweightKg' | 'unit' | 'showStreaks'>;
  nextSessions: { weekday: number; title: string }[];
  paths?: LiftPath[];
  awarded?: AwardedRecord[];
}): string {
  const { today, history, profile } = opts;
  const week = weekStart(today);
  const end = addDays(week, 6);
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const done = sessionDates(history).filter((d) => d >= week && d <= end).length;
  const lines = [`My training week, ${fmt(week)} to ${fmt(end)}: ${done} of ${plannedDaysOn(profile, today)} workouts.`];
  if (profile.showStreaks) {
    const c = consistency(history, profile, today);
    if (c.streak > 1) lines.push(`${c.streak} ${c.periodWeeks === 2 ? 'fortnights' : 'weeks'} in a row.`);
    for (const r of recordsBetween(history, week, end, profile.bodyweightKg, opts.paths, opts.awarded).slice(0, 3)) lines.push(describeRecord(r, profile.unit) + '.');
  }
  const next = opts.nextSessions.map((s) => `${WEEKDAY_NAMES[s.weekday].slice(0, 3)} ${s.title}`).join(', ');
  if (next) lines.push(`Plan: ${next}.`);
  lines.push('Sent from Ironplan');
  return lines.join('\n');
}

export type Reminder = { at: Date; body: string };
export const REMINDER_WEEKS = 8;
export const TAPER_AFTER = 3;
export const STOP_AFTER = 8;

export function reminderSchedule(
  profile: Pick<Profile, 'trainingDays' | 'pausedWeeks' | 'trainingTime' | 'dayTimes' | 'reminderMinutes'> & { retroPauses?: string[] },
  sessions: { weekday: number; title: string }[],
  now: Date,
  trainedToday: boolean,
  missedInRow = 0,
): Reminder[] {
  if (profile.reminderMinutes === null) return [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = iso(now);
  const paused = new Set([...profile.pausedWeeks, ...(profile.retroPauses ?? [])].map(weekStart));
  const firstDay = Math.min(...profile.trainingDays);
  const out: Reminder[] = [];
  let missed = missedInRow;
  let stoppedAt: Date | null = null;
  for (let i = 0; i < 7 * REMINDER_WEEKS; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const date = iso(day);
    const weekday = (day.getDay() + 6) % 7;
    if (!profile.trainingDays.includes(weekday) || paused.has(weekStart(date))) continue;
    if (date === today && trainedToday) continue;
    const planned = missed;
    if (date !== today || !trainedToday) missed++;
    if (planned >= STOP_AFTER) {
      stoppedAt = stoppedAt ?? day;
      continue;
    }
    if (planned >= TAPER_AFTER && weekday !== firstDay) continue;
    const time = profile.dayTimes[weekday] ?? profile.trainingTime;
    const [h, m] = time.split(':').map(Number);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m - profile.reminderMinutes);
    if (at <= now) continue;
    const title = sessions.find((s) => s.weekday === weekday)?.title ?? 'Training';
    out.push({ at, body: `${title} at ${time}${profile.reminderMinutes ? '' : ', starting now'}.` });
  }
  const stop = stoppedAt ?? (missedInRow >= STOP_AFTER ? now : null);
  if (stop) {
    const back = new Date(stop.getFullYear(), stop.getMonth(), stop.getDate() + 14, ...(profile.trainingTime.split(':').map(Number) as [number, number]));
    if (back > now) out.push({ at: back, body: 'Your plan is ready when you are. Loads start lighter after a break.' });
  }
  return out;
}

export function recordModel(history: LoggedSet[], profile: Pick<Profile, 'experience' | 'sex'>, today: string): Posterior {
  return fitModel(recordEligible(history.filter((s) => s.date < today)), profile.experience, today, { sex: profile.sex });
}

export function goalTargetProblem(targetKg: number, nowKg: number | null, limitKg: number): 'below' | 'beyond' | null {
  if (nowKg !== null && targetKg <= nowKg) return 'below';
  if (targetKg > limitKg) return 'beyond';
  return null;
}

export type GoalFix =
  | { kind: 'later'; weeks: number; reaching: number }
  | { kind: 'lower'; targetKg: number; reaching: number }
  | { kind: 'sessions'; reaching: number };

export function goalFixes(
  forecast: (targetKg: number, weeks: number, adherence: number) => GoalForecast | null | undefined,
  targetKg: number,
  weeks: number,
  adherenceRate: number,
  nowKg: number | null,
  stepKg: number,
  horizons: number[],
): GoalFix[] {
  const fixes: GoalFix[] = [];
  const w = Math.max(1, Math.min(weeks, MAX_GOAL_WEEKS));
  for (const h of horizons.filter((x) => x > weeks && x <= MAX_GOAL_WEEKS)) {
    const f = forecast(targetKg, h, adherenceRate);
    if (f && f.reaching >= 10) {
      fixes.push({ kind: 'later', weeks: h, reaching: f.reaching });
      break;
    }
  }
  const base = forecast(targetKg, w, adherenceRate);
  if (base) {
    const median = base.dots[9];
    const lower = Math.floor(median / stepKg) * stepKg;
    if (lower < targetKg && (nowKg === null || lower > nowKg)) {
      const f = forecast(lower, w, adherenceRate);
      if (f) fixes.push({ kind: 'lower', targetKg: lower, reaching: f.reaching });
    }
    if (adherenceRate < 0.9) {
      const f = forecast(targetKg, w, 1);
      if (f && f.reaching > base.reaching + 1) fixes.push({ kind: 'sessions', reaching: f.reaching });
    }
  }
  return fixes;
}
