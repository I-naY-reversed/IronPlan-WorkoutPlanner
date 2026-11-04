import { MINUTES_PER_SET, WARMUP_MINUTES, type PlannedSession } from './generator';
import { WARMUP_SET_MINUTES } from './warmup';

export type DayAdjust = { minutes?: number; lighter?: boolean };

export const LIGHTER_SHARE = 2 / 3;

const minutesOf = (exercises: PlannedSession['exercises']) =>
  Math.round(
    WARMUP_MINUTES +
      exercises.reduce((n, e) => n + e.sets, 0) * MINUTES_PER_SET +
      exercises.reduce((n, e) => n + e.warmups.length, 0) * WARMUP_SET_MINUTES,
  );

export function adjustSession(session: PlannedSession, adj: DayAdjust): PlannedSession & { note: string | null } {
  if (!adj.minutes && !adj.lighter) return { ...session, note: null };
  let exercises = session.exercises.map((e) => ({ ...e }));
  if (adj.lighter) for (const e of exercises) e.sets = Math.max(1, Math.round(e.sets * LIGHTER_SHARE));
  const left: string[] = [];
  if (adj.minutes) {
    const over = () => minutesOf(exercises) > adj.minutes!;
    while (over()) {
      const i = exercises.map((e) => e.sets).lastIndexOf(Math.max(...exercises.map((e) => e.sets)));
      if (exercises[i].sets > 1) exercises[i].sets--;
      else if (exercises.length > 1) left.push(exercises.pop()!.name);
      else break;
    }
  }
  exercises = exercises.filter((e) => e.sets > 0);
  const totalSets = exercises.reduce((n, e) => n + e.sets, 0);
  const fewer = session.totalSets - totalSets;
  const head = [adj.lighter ? 'Lighter' : '', adj.minutes ? `${adj.minutes} min` : ''].filter(Boolean).join(', ');
  const parts = [
    fewer > 0 ? `${fewer} fewer ${fewer === 1 ? 'set' : 'sets'}` : 'no sets off',
    left.length ? `${left.reverse().join(', ')} left out` : '',
    'same weights and effort',
  ].filter(Boolean);
  return { ...session, exercises, totalSets, estimatedMinutes: minutesOf(exercises), note: `${head} today: ${parts.join(', ')}.` };
}
