export type ImportedSet = {
  date: string;
  exerciseName: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
  rir: number | null;
  warmup?: true;
  autoWarmup?: true;
  failed?: true;
  drop?: true;
  seconds?: number;
};

export type CsvFormat = 'native' | 'strong' | 'hevy';

export type ImportResult = {
  format: CsvFormat;
  sets: ImportedSet[];
  skipped: { line: number; reason: string }[];
};

export type ImportOptions = {
  defaultUnit?: 'kg' | 'lb';
};

const LB_TO_KG = 0.45359237;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

export function detectFormat(header: string[]): CsvFormat | null {
  const h = new Set(header.map((c) => c.trim().toLowerCase()));
  if (h.has('exercise_title') && h.has('start_time')) return 'hevy';
  if (h.has('exercise name') && h.has('set order')) return 'strong';
  if (h.has('date') && h.has('exercise') && h.has('reps')) return 'native';
  return null;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export function parseDate(value: string): string | null {
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = v.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/);
  if (dmy) {
    const month = MONTHS[dmy[2].toLowerCase()];
    if (month) return `${dmy[3]}-${month}-${dmy[1].padStart(2, '0')}`;
  }
  return null;
}

function num(value: string | undefined): number | null {
  if (value === undefined) return null;
  const v = value.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function importCsv(text: string, options: ImportOptions = {}): ImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('The file is empty.');
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const format = detectFormat(header);
  if (!format) {
    throw new Error('Unrecognized CSV layout. Expected a Strong, Hevy or date/exercise/reps/weight export.');
  }
  const col = (name: string) => header.indexOf(name);
  const get = (row: string[], name: string) => {
    const i = col(name);
    return i >= 0 ? row[i] : undefined;
  };

  const lbDefault = options.defaultUnit === 'lb';
  const sets: ImportedSet[] = [];
  const skipped: ImportResult['skipped'] = [];
  const counters = new Map<string, number>();
  const nextIndex = (date: string, exercise: string, warmup = false) => {
    const key = `${date}|${exercise}|${warmup ? 'w' : ''}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return n;
  };

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    let date: string | null;
    let exerciseName: string | undefined;
    let reps: number | null;
    let weight: number | null;
    let isLb = lbDefault;
    let rpe: number | null;
    let rir: number | null = null;
    let repeat = 1;
    let warmup = false;
    let failed = false;
    let drop = false;
    let seconds: number | null = null;

    if (format === 'hevy') {
      const type = (get(row, 'set_type') ?? '').trim().toLowerCase();
      warmup = type === 'warmup';
      failed = type === 'failure';
      drop = type === 'dropset';
      seconds = num(get(row, 'duration_seconds'));
      date = parseDate(get(row, 'start_time') ?? '');
      exerciseName = get(row, 'exercise_title');
      reps = num(get(row, 'reps'));
      if (col('weight_kg') >= 0) {
        weight = num(get(row, 'weight_kg'));
        isLb = false;
      } else {
        weight = num(get(row, 'weight_lbs'));
        isLb = true;
      }
      rpe = num(get(row, 'rpe'));
    } else if (format === 'strong') {
      const order = (get(row, 'set order') ?? '').trim().toUpperCase();
      warmup = order === 'W';
      failed = order === 'F';
      drop = order === 'D';
      seconds = num(get(row, 'seconds'));
      date = parseDate(get(row, 'date') ?? '');
      exerciseName = get(row, 'exercise name');
      reps = num(get(row, 'reps'));
      weight = num(get(row, 'weight'));
      const unit = (get(row, 'weight unit') ?? '').trim().toLowerCase();
      if (unit) isLb = unit.startsWith('lb');
      rpe = num(get(row, 'rpe'));
    } else {
      date = parseDate(get(row, 'date') ?? '');
      exerciseName = get(row, 'exercise');
      reps = num(get(row, 'reps'));
      if (col('weight_kg') >= 0) {
        weight = num(get(row, 'weight_kg'));
        isLb = false;
      } else if (col('weight_lb') >= 0) {
        weight = num(get(row, 'weight_lb'));
        isLb = true;
      } else {
        weight = num(get(row, 'weight'));
      }
      rpe = num(get(row, 'rpe'));
      rir = num(get(row, 'rir'));
      seconds = num(get(row, 'seconds'));
      repeat = num(get(row, 'sets')) ?? 1;
    }

    const name = exerciseName?.trim();
    if (!date) return void skipped.push({ line, reason: 'missing or unreadable date' });
    if (!name) return void skipped.push({ line, reason: 'missing exercise name' });
    const timed = (reps === null || reps <= 0) && seconds !== null && seconds > 0;
    if (!timed && (reps === null || reps <= 0)) return void skipped.push({ line, reason: 'no reps (cardio?)' });
    if (rpe !== null && (rpe < 1 || rpe > 10)) rpe = null;
    if (failed) rpe = 10;
    if (rir !== null && rir < 0) rir = null;

    const weightKg = weight === null ? 0 : isLb ? weight * LB_TO_KG : weight;
    for (let r = 0; r < Math.max(1, Math.floor(repeat)); r++) {
      sets.push({
        date,
        exerciseName: name,
        setIndex: nextIndex(date, name, warmup),
        reps: timed ? 0 : reps!,
        weightKg: Math.round(weightKg * 100) / 100,
        rpe,
        rir,
        ...(warmup ? { warmup: true as const } : {}),
        ...(failed ? { failed: true as const } : {}),
        ...(drop && !warmup ? { drop: true as const } : {}),
        ...(timed ? { seconds: Math.round(seconds!) } : {}),
      });
    }
  });

  return { format, sets, skipped };
}
