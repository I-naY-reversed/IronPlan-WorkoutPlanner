import type { SQLiteDatabase } from 'expo-sqlite';

import type { LoggedSet } from '@/domain/dose';
import { clampProfile, DEFAULT_DAYS, DEFAULT_PROFILE, type Profile } from '@/domain/profile';
import { plausible } from '@/domain/plausibility';
import type { WeekFreeze } from '@/domain/generator';
import type { BodyweightEntry } from '@/domain/bodyweight';

export const DATABASE_NAME = 'training.db';

export const SETUP_RAW_NAME = 'Entered at setup';

export type SetSource = 'log' | 'native' | 'strong' | 'hevy';
export type SetKind = 'working' | 'warmup' | 'failed' | 'drop';

export type StoredSet = LoggedSet & {
  id: number;
  setIndex: number;
  source: SetSource;
  rawName: string | null;
  kind: SetKind;
};

type SetRow = {
  id: number;
  date: string;
  exercise_id: string;
  set_index: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  rir: number | null;
  source: SetSource;
  raw_name: string | null;
  kind: SetKind;
  seconds: number | null;
};

const MIGRATIONS: string[] = [
  `CREATE TABLE sets (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     date TEXT NOT NULL,
     exercise_id TEXT NOT NULL,
     set_index INTEGER NOT NULL,
     reps INTEGER NOT NULL,
     weight_kg REAL NOT NULL,
     rpe REAL,
     rir REAL,
     source TEXT NOT NULL,
     raw_name TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX sets_date ON sets (date);
   CREATE TABLE exercise_aliases (
     raw_name TEXT PRIMARY KEY NOT NULL,
     exercise_id TEXT NOT NULL
   );`,
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  `ALTER TABLE sets ADD COLUMN kind TEXT NOT NULL DEFAULT 'working';`,
  `ALTER TABLE sets ADD COLUMN seconds INTEGER;
   CREATE TABLE bodyweight (
     date TEXT PRIMARY KEY NOT NULL,
     kg REAL NOT NULL
   );`,
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[next - 1]);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version++;
  }
}

function toSet(row: SetRow): StoredSet {
  return {
    id: row.id,
    date: row.date,
    exerciseId: row.exercise_id,
    setIndex: row.set_index,
    reps: row.reps,
    weightKg: row.weight_kg,
    rpe: row.rpe,
    rir: row.rir,
    source: row.source,
    rawName: row.raw_name,
    kind: row.kind ?? 'working',
    failed: row.kind === 'failed',
    drop: row.kind === 'drop' || undefined,
    seconds: row.seconds ?? null,
  };
}

export type NewSet = Omit<StoredSet, 'id' | 'kind'> & { kind?: SetKind };

export async function insertSets(db: SQLiteDatabase, sets: NewSet[]) {
  await db.withTransactionAsync(async () => {
    const stmt = await db.prepareAsync(
      `INSERT INTO sets (date, exercise_id, set_index, reps, weight_kg, rpe, rir, source, raw_name, kind, seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const s of sets) {
        await stmt.executeAsync([s.date, s.exerciseId, s.setIndex, s.reps, s.weightKg, s.rpe, s.rir, s.source, s.rawName, s.kind ?? 'working', s.seconds ?? null]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

export async function getSets(db: SQLiteDatabase, from?: string): Promise<StoredSet[]> {
  const rows = from
    ? await db.getAllAsync<SetRow>("SELECT * FROM sets WHERE kind != 'warmup' AND date >= ? ORDER BY date, id", from)
    : await db.getAllAsync<SetRow>("SELECT * FROM sets WHERE kind != 'warmup' ORDER BY date, id");
  return rows.map(toSet).filter(plausible);
}

export async function getAllSets(db: SQLiteDatabase): Promise<StoredSet[]> {
  return (await db.getAllAsync<SetRow>('SELECT * FROM sets ORDER BY date, id')).map(toSet);
}

export async function getSetsOn(db: SQLiteDatabase, date: string): Promise<StoredSet[]> {
  const rows = await db.getAllAsync<SetRow>('SELECT * FROM sets WHERE date = ? ORDER BY id', date);
  return rows.map(toSet);
}

export async function getLastSet(db: SQLiteDatabase, exerciseId: string): Promise<StoredSet | null> {
  const row = await db.getFirstAsync<SetRow>(
    "SELECT * FROM sets WHERE exercise_id = ? AND kind != 'warmup' ORDER BY date DESC, id DESC LIMIT 1",
    exerciseId,
  );
  return row ? toSet(row) : null;
}

export async function deleteSet(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM sets WHERE id = ?', id);
}

export async function getAliases(db: SQLiteDatabase): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ raw_name: string; exercise_id: string }>('SELECT * FROM exercise_aliases');
  return new Map(rows.map((r) => [r.raw_name, r.exercise_id]));
}

export async function saveAliases(db: SQLiteDatabase, aliases: Map<string, string>) {
  await db.withTransactionAsync(async () => {
    for (const [rawName, exerciseId] of aliases) {
      await db.runAsync(
        'INSERT OR REPLACE INTO exercise_aliases (raw_name, exercise_id) VALUES (?, ?)',
        rawName,
        exerciseId,
      );
    }
  });
}

export async function getProfile(db: SQLiteDatabase): Promise<Profile> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'profile'");
  if (!row) return DEFAULT_PROFILE;
  try {
    const saved = JSON.parse(row.value) as Partial<Profile>;
    return clampProfile({
      ...DEFAULT_PROFILE,
      ...saved,
      trainingDays: saved.trainingDays ?? DEFAULT_DAYS[saved.daysPerWeek ?? DEFAULT_PROFILE.daysPerWeek] ?? DEFAULT_PROFILE.trainingDays,
      equipment: { ...DEFAULT_PROFILE.equipment, ...saved.equipment },
    });
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(db: SQLiteDatabase, profile: Profile) {
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('profile', ?)",
    JSON.stringify(profile),
  );
}

export async function getWeekFreeze(db: SQLiteDatabase): Promise<WeekFreeze | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'weekFreeze'");
  if (!row) return null;
  try {
    return JSON.parse(row.value) as WeekFreeze;
  } catch {
    return null;
  }
}

export async function saveWeekFreeze(db: SQLiteDatabase, freeze: WeekFreeze) {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('weekFreeze', ?)", JSON.stringify(freeze));
}

export async function getSessionDays(db: SQLiteDatabase): Promise<Record<string, number>> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'sessionDays'");
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, number>;
  } catch {
    return {};
  }
}

export async function saveSessionDay(db: SQLiteDatabase, date: string, weekday: number) {
  const days = await getSessionDays(db);
  if (days[date] === weekday) return;
  const cutoff = new Date(Date.parse(`${date}T00:00:00Z`) - 60 * 86400000).toISOString().slice(0, 10);
  const kept = Object.fromEntries(Object.entries(days).filter(([d]) => d >= cutoff));
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('sessionDays', ?)", JSON.stringify({ ...kept, [date]: weekday }));
}

export async function getBodyweights(db: SQLiteDatabase): Promise<BodyweightEntry[]> {
  return db.getAllAsync<BodyweightEntry>('SELECT date, kg FROM bodyweight ORDER BY date');
}

export async function saveBodyweight(db: SQLiteDatabase, date: string, kg: number) {
  await db.runAsync('INSERT OR REPLACE INTO bodyweight (date, kg) VALUES (?, ?)', date, kg);
}

export async function deleteBodyweight(db: SQLiteDatabase, date: string) {
  await db.runAsync('DELETE FROM bodyweight WHERE date = ?', date);
}
