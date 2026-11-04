import { detectFormat, importCsv, parseCsv, parseDate } from '../csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });

  it('drops blank lines', () => {
    expect(parseCsv('a\n\n\nb\n')).toEqual([['a'], ['b']]);
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-10-12', '2026-10-12'],
    ['2026-10-12 08:30:00', '2026-10-12'],
    ['26 Jan 2024, 18:11', '2024-01-26'],
    ['3 Sept 2025, 07:00', '2025-09-03'],
  ])('%s → %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it('rejects garbage', () => {
    expect(parseDate('yesterday')).toBeNull();
  });
});

describe('detectFormat', () => {
  it('recognises each layout', () => {
    expect(detectFormat(['date', 'exercise', 'set', 'reps', 'weight_kg'])).toBe('native');
    expect(detectFormat(['Date', 'Workout Name', 'Exercise Name', 'Set Order', 'Weight', 'Reps'])).toBe('strong');
    expect(detectFormat(['title', 'start_time', 'exercise_title', 'set_index', 'weight_kg', 'reps'])).toBe('hevy');
    expect(detectFormat(['foo', 'bar'])).toBeNull();
  });
});

describe('importCsv', () => {
  it('reads the native layout and keeps blank RPE/RIR as missing', () => {
    const csv = [
      'date,exercise,set,reps,weight_kg,rpe,rir,notes',
      '2026-10-12,barbell_bench_press,1,8,80,,,',
      '2026-10-12,barbell_bench_press,2,7,80,8.5,,',
      '2026-10-12,barbell_row,1,10,70,,2,',
    ].join('\n');
    const { format, sets, skipped } = importCsv(csv);
    expect(format).toBe('native');
    expect(skipped).toEqual([]);
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({ rpe: null, rir: null, setIndex: 1 });
    expect(sets[1]).toMatchObject({ rpe: 8.5, setIndex: 2 });
    expect(sets[2]).toMatchObject({ rir: 2, exerciseName: 'barbell_row' });
  });

  it('expands a per-exercise `sets` column', () => {
    const csv = 'date,exercise,sets,reps,weight_kg\n2026-10-12,squat,3,5,100\n';
    const { sets } = importCsv(csv);
    expect(sets.map((s) => s.setIndex)).toEqual([1, 2, 3]);
  });

  it('reads Strong exports, marks warm-ups and converts lb when asked', () => {
    const csv = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE',
      '2025-03-01 09:00:00,Push,1h,Bench Press (Barbell),W,95,10,0,0,',
      '2025-03-01 09:00:00,Push,1h,Bench Press (Barbell),1,185,5,0,0,8',
      '2025-03-01 09:00:00,Push,1h,Plank,1,0,0,0,60,',
    ].join('\n');
    const { format, sets, skipped } = importCsv(csv, { defaultUnit: 'lb' });
    expect(format).toBe('strong');
    expect(sets).toHaveLength(3);
    expect(sets[0].warmup).toBe(true);
    expect(sets[1].warmup).toBeUndefined();
    expect(sets[1].weightKg).toBeCloseTo(83.91, 2);
    expect(sets[1].rpe).toBe(8);
    expect(sets[2]).toMatchObject({ exerciseName: 'Plank', reps: 0, seconds: 60 });
    expect(skipped).toEqual([]);
  });

  it('reads Hevy exports', () => {
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Legs,"26 Jan 2024, 18:11","26 Jan 2024, 19:20",,Squat (Barbell),,,0,warmup,60,5,,,',
      'Legs,"26 Jan 2024, 18:11","26 Jan 2024, 19:20",,Squat (Barbell),,,1,normal,120,5,,,9',
    ].join('\n');
    const { format, sets } = importCsv(csv);
    expect(format).toBe('hevy');
    expect(sets).toEqual([
      { date: '2024-01-26', exerciseName: 'Squat (Barbell)', setIndex: 1, reps: 5, weightKg: 60, rpe: null, rir: null, warmup: true },
      { date: '2024-01-26', exerciseName: 'Squat (Barbell)', setIndex: 1, reps: 5, weightKg: 120, rpe: 9, rir: null },
    ]);
  });

  it('nulls out-of-range RPE instead of trusting it', () => {
    const { sets } = importCsv('date,exercise,reps,weight_kg,rpe\n2026-01-01,curl,10,20,12\n');
    expect(sets[0].rpe).toBeNull();
  });

  it('throws on unknown layouts', () => {
    expect(() => importCsv('foo,bar\n1,2\n')).toThrow(/Unrecognized/);
  });
});

describe('Hevy failure sets', () => {
  it('imports them as failed sets at RPE 10', () => {
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Legs,"26 Jan 2024, 18:11","26 Jan 2024, 19:20",,Squat (Barbell),,,0,failure,120,3,,,',
    ].join('\n');
    const { sets } = importCsv(csv);
    expect(sets[0]).toMatchObject({ failed: true, rpe: 10, reps: 3 });
  });
});
