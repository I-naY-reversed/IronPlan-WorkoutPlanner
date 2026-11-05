import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ExercisePicker } from '@/components/exercise-picker';
import { localToday, Screen, useBand } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { BracketStrip, FirstGuess, KnowledgeDots, loadDomain, RangeBar } from '@/components/ui/bracket';
import { Button, NudgeButton, TextAction } from '@/components/ui/button';
import { PlateStrip } from '@/components/ui/plate-strip';
import { useConfirm } from '@/components/ui/confirm';
import { Icon } from '@/components/ui/icon';
import { Fonts, Radius, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteSet, getLastSet, getSets, getSetsOn, getWeekFreeze, insertSets, saveSessionDay, type StoredSet } from '@/db/database';
import { EFFORT_PRIORS, weekStart } from '@/domain/dose';
import { MAX_REPS, PROBLEM_TEXT, setProblem } from '@/domain/plausibility';
import { consistency, describeRecord, MIN_SESSION_SETS, missedSessions, recordModel, recordPaths, recordsForSet, sessionDates, strengthRecords } from '@/domain/engagement';
import type { Posterior } from '@/domain/model';
import { EXERCISES_BY_ID, INDIRECT_SET_WEIGHT, MUSCLE_LABELS, type Exercise, type Muscle } from '@/domain/exercises';
import { MuscleMap } from '@/components/muscle-map';
import { TECHNIQUE } from '@/domain/technique';
import { ExerciseEvidence } from '@/components/evidence';
import { BAR_KG } from '@/domain/plates';
import { ADDED_WEIGHT_LIFTS } from '@/domain/progress';
import { estimateFromBracket, updateAfterSet, type LoadEstimate } from '@/domain/session-update';
import { looksLikeWarmup } from '@/domain/warmup';
import { relatedLiftOf } from '@/domain/starting-strength';
import { defaultIncrementKg, minLoadKg } from '@/domain/equipment';
import { formatLoad, fromUnit, toUnit } from '@/domain/units';
import { useProfile } from '@/state/profile-context';
import { cachedPlan, incrementFor, prescriptionsFor } from '@/state/plan-cache';
import { displayMode } from '@/domain/profile';
import { certaintyWord, dotsWithData, logSdOf, restSeconds, rpeFor, type Prescription } from '@/domain/prescription';
import { scheduleRestEnd } from '@/state/reminders';
import { choiceStyle, controlStyle } from '@/components/ui/control';
import { dateLocale } from '@/i18n';

const SET_TYPE_LABEL = { normal: 'Normal', drop: 'Drop set', warmup: 'Warm-up' } as const;
const SET_TYPE_HELP = {
  normal: 'A working set: rated, and it updates the weight and range.',
  drop: 'Straight after a set, at a lower weight. Counts towards weekly sets, not your strength estimate.',
  warmup: 'Kept for the record. Not counted as a hard set.',
} as const;
const REST_SECONDS = 120;
const REST_STEP = 30;
const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const REPS_LEFT_STEPS = [
  { rpe: 10, label: '0' },
  { rpe: 9, label: '1' },
  { rpe: 8, label: '2' },
  { rpe: 7, label: '3' },
  { rpe: 6, label: '4+' },
];


type Bracket = { value: number; low: number; high: number };

type SessionSummary = {
  title: string | null;
  sets: number;
  volumeKg: number;
  exercises: { id: string; name: string; sets: number; top: string; next: { when: string; kg: number; low: number | null; high: number | null; reason: string | null } | null }[];
};
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const nowMs = () => Date.now();

export default function SessionScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const band = useBand();
  const { profile, update } = useProfile();
  const unit = profile?.unit ?? 'kg';
  const bodyweightKg = profile?.bodyweightKg ?? 80;
  const fmt = useCallback((kg: number) => formatLoad(kg, unit), [unit]);
  const simple = profile ? displayMode(profile) === 'simple' : false;
  const unitName = unit === 'kg' ? 'kilograms' : 'pounds';
  const lastLogAt = useRef(0);
  const [today, setToday] = useState(localToday);
  const params = useLocalSearchParams<{ session?: string; title?: string; index?: string; at?: string; weekday?: string }>();

  const [queue, setQueue] = useState<Prescription[]>([]);
  const [index, setIndex] = useState(0);
  const [title, setTitle] = useState<string | null>(null);
  const [planDay, setPlanDay] = useState<number | null>(null);
  const [freeExercise, setFreeExercise] = useState<Exercise | null>(null);
  const [picking, setPicking] = useState(false);
  const [sets, setSets] = useState<StoredSet[]>([]);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [missed, setMissed] = useState(false);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [estimate, setEstimate] = useState<LoadEstimate | null>(null);
  const [domain, setDomain] = useState<[number, number] | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const [autoWarm, setAutoWarm] = useState<{ text: string; weightKg: number; reps: number; rpe: number | null; missed: boolean } | null>(null);
  const [celebration, setCelebration] = useState<string[]>([]);
  const [announced, setAnnounced] = useState<Set<string>>(() => new Set());
  const [recPost, setRecPost] = useState<Posterior | null>(null);
  const [why, setWhy] = useState(false);
  const [musclesOpen, setMusclesOpen] = useState(false);
  const [seconds, setSeconds] = useState('30');
  const [holdStart, setHoldStart] = useState<number | null>(null);
  const [setType, setSetType] = useState<'normal' | 'drop' | 'warmup'>('normal');
  const [typeOpen, setTypeOpen] = useState(false);
  useEffect(() => {
    if (holdStart === null) return;
    const id = setInterval(() => setSeconds(String(Math.floor((nowMs() - holdStart) / 1000))), 250);
    return () => clearInterval(id);
  }, [holdStart]);
  const [effortOpen, setEffortOpen] = useState(false);
  const [confirmDialog, confirm] = useConfirm();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [startRanges, setStartRanges] = useState<Record<string, [number, number]>>({});
  const [history, setHistory] = useState<StoredSet[]>([]);
  const [lastTime, setLastTime] = useState<StoredSet[]>([]);
  const [rest] = useState(() => new Animated.Value(0));
  const [resting, setResting] = useState(false);
  const [restLeft, setRestLeft] = useState(0);
  const [restTotal, setRestTotal] = useState(REST_SECONDS);
  const restEnd = useRef(0);
  const weightRef = useRef<ComponentRef<typeof TextInput>>(null);
  const repsRef = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (!resting) return;
    const id = setInterval(() => setRestLeft(Math.max(0, Math.round((restEnd.current - nowMs()) / 1000))), 1000);
    return () => clearInterval(id);
  }, [resting]);

  const [handled, setHandled] = useState<string | undefined>(undefined);
  const handover = params.session ? `${params.at ?? ''}|${params.session}` : undefined;
  if (handover && handover !== handled) {
    setHandled(handover);
    try {
      const parsed = JSON.parse(params.session!) as Prescription[];
      setQueue(parsed);
      setStartRanges(Object.fromEntries(parsed.filter((r) => r.loadLow !== null && r.loadHigh !== null).map((r) => [r.exerciseId, [r.loadLow!, r.loadHigh!]])));
      setResting(false);
      scheduleRestEnd(null);
      setIndex(Math.max(0, Math.min(Number(params.index ?? 0), parsed.length - 1)));
      setTitle(params.title ?? null);
      setPlanDay(params.weekday !== undefined ? Number(params.weekday) : null);
      setFreeExercise(null);
    } catch {
      setQueue([]);
    }
  }

  useEffect(() => {
    if (!profile || !title) return;
    let cancelled = false;
    (async () => {
      const [all, freeze] = await Promise.all([getSets(db), getWeekFreeze(db)]);
      const session = cachedPlan(profile, all, localToday(), freeze).sessions.find((x) => x.title === title);
      if (!session || cancelled) return;
      const fresh = prescriptionsFor(profile, session);
      const started = new Set(all.filter((x) => x.date === today).map((x) => x.exerciseId));
      setQueue((q) => {
        const used = new Set(q.map((x) => x.exerciseId));
        let changed = false;
        const next = q.map((item) => {
          if (started.has(item.exerciseId) || fresh.some((f) => f.exerciseId === item.exerciseId)) return item;
          const replacement = fresh.find((f) => !used.has(f.exerciseId));
          if (!replacement) return item;
          used.add(replacement.exerciseId);
          changed = true;
          return replacement;
        });
        return changed ? next : q;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [db, profile, title, today]);

  const rx = queue[index] ?? null;
  const todayIndex = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const sessionDay =
    title && planDay !== null && planDay !== todayIndex
      ? `moved from ${WEEKDAY_NAMES[planDay]} to today`
      : new Date(`${today}T00:00:00Z`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const todayWorking = sets.filter((x) => x.kind !== 'warmup').length;
  const exercise = rx ? EXERCISES_BY_ID[rx.exerciseId] : freeExercise;

  const reload = useCallback(async () => setSets(await getSetsOn(db, today)), [db, today]);
  useFocusEffect(
    useCallback(() => {
      if (nowMs() - lastLogAt.current > 3 * 3600000) setToday(localToday());
      reload();
      if (profile?.showStreaks) getSets(db).then((all) => setRecPost(recordModel(all, profile, today)));
    }, [reload, db, profile, today]),
  );

  useEffect(() => {
    if (!exercise) return;
    let cancelled = false;
    (async () => {
      const last = await getLastSet(db, exercise.id);
      const all = await getSets(db);
      if (cancelled) return;
      setHistory(all.filter((s) => s.exerciseId === exercise.id).slice(-3).reverse());
      const before = all.filter((s) => s.exerciseId === exercise.id && s.date < today && s.kind !== 'warmup');
      const lastDay = before.length ? before.reduce((d, s) => (s.date > d ? s.date : d), before[0].date) : null;
      setLastTime(lastDay ? before.filter((s) => s.date === lastDay) : []);
      const target = rx?.loadKg ?? last?.weightKg ?? (rx?.loadSource === 'bodyweight' ? 0 : null);
      setWeight(target !== null ? fmt(target) : '');
      setReps(String(rx ? Math.round((rx.repRange[0] + rx.repRange[1]) / 2) : (last?.reps ?? '')));
      setRpe(null);
      setMissed(false);
      setMoved(null);
      setAutoWarm(null);
      setSeconds(String(last?.seconds ?? 30));
      setHoldStart(null);
      setSetType('normal');
      setCelebration([]);
      setWhy(false);
      let est = rx?.loadLow && rx.loadHigh ? estimateFromBracket(rx.loadLow, rx.loadHigh) : null;
      let br = rx?.loadKg && rx.loadLow && rx.loadHigh ? { value: rx.loadKg, low: rx.loadLow, high: rx.loadHigh } : null;
      if (rx && !rx.power) {
        const loggedToday = all.filter((x) => x.exerciseId === exercise.id && x.date === today && x.kind !== 'warmup' && x.kind !== 'drop');
        for (const x of loggedToday) {
          const u = updateAfterSet({
            prior: est,
            weightKg: x.weightKg,
            reps: x.reps,
            rpe: x.rpe,
            missed: x.kind === 'failed',
            targetReps: Math.round((rx.repRange[0] + rx.repRange[1]) / 2),
            targetRir: rx.targetRir,
            incrementKg: rx.incrementKg ?? 2.5,
            bodyweightKg: ADDED_WEIGHT_LIFTS.has(exercise.id) ? bodyweightKg : undefined,
          });
          est = u.estimate;
          br = u.next;
        }
        if (loggedToday.length && br) setWeight(fmt(Math.max(br.value, rx.equipment?.includes('barbell') ? (minLoadKg('barbell', unit) ?? 0) : 0)));
      }
      setEstimate(est);
      setBracket(br);
      setDomain(br ? loadDomain(br.low, br.value, br.high) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, exercise, rx, fmt, today, bodyweightKg, unit]);

  const weightNum = Number(weight.replace(',', '.'));
  const weightKg = fromUnit(weightNum, unit);
  const repsNum = Number(reps);
  const timed = !!exercise?.timed;
  const secondsNum = Number(seconds);
  const typed = !!exercise && (timed ? seconds.trim() !== '' && Number.isFinite(secondsNum) : weight.trim() !== '' && reps.trim() !== '' && Number.isFinite(weightNum) && Number.isFinite(repsNum));
  const problem =
    exercise && typed
      ? setProblem(timed ? { exerciseId: exercise.id, weightKg: 0, reps: 0, rpe: null, rir: null, seconds: secondsNum } : { exerciseId: exercise.id, weightKg, reps: repsNum, rpe, rir: null, failed: missed })
      : null;
  const valid = typed && problem === null;
  const missingInput = !exercise || typed
    ? null
    : timed
      ? 'Enter the seconds held to log this set.'
      : weight.trim() === ''
        ? `Enter a weight to log this set${rx?.loadSource === 'bodyweight' ? ' (0 for bodyweight only)' : ''}.`
        : 'Enter your reps to log this set.';
  const done = exercise ? sets.filter((s) => s.exerciseId === exercise.id && s.kind !== 'warmup') : [];
  const warmDone = exercise ? sets.filter((s) => s.exerciseId === exercise.id && s.kind === 'warmup') : [];
  const warmTodo = done.length > 0 ? [] : (rx?.warmups ?? []).slice(warmDone.length);
  const increment = rx?.incrementKg ?? defaultIncrementKg('barbell', unit) ?? 2.5;
  const incrementLabel = fmt(increment);
  const floorKg = rx?.equipment?.includes('barbell') ? (minLoadKg('barbell', unit) ?? 0) : 0;

  const nudge = (delta: number) => {
    const base = Number.isFinite(weightKg) ? weightKg : 0;
    setWeight(fmt(Math.max(0, Math.round((base + delta) / increment) * increment)));
    Haptics.selectionAsync().catch(() => {});
  };

  const restFor = exercise ? restSeconds(exercise, rx?.repRange) : REST_SECONDS;
  const endRest = (over: boolean) => {
    rest.stopAnimation();
    setResting(false);
    scheduleRestEnd(null);
    if (over) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  const runRest = (endMs: number, total: number) => {
    restEnd.current = endMs;
    const left = Math.max(0, (endMs - nowMs()) / 1000);
    setRestTotal(total);
    setRestLeft(Math.round(left));
    setResting(true);
    rest.stopAnimation();
    rest.setValue(Math.min(1, left / total));
    Animated.timing(rest, { toValue: 0, duration: left * 1000, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (finished) endRest(true);
    });
    scheduleRestEnd(new Date(endMs));
  };
  const startRest = () => {
    if (profile?.restTimer) runRest(nowMs() + restFor * 1000, restFor);
  };
  const adjustRest = (seconds: number) => {
    const end = Math.max(nowMs() + 5000, restEnd.current + seconds * 1000);
    runRest(end, Math.max(restTotal + seconds, (end - nowMs()) / 1000));
  };

  const requestLog = () => {
    if (setType === 'warmup') {
      setSetType('normal');
      return void logWarmup();
    }
    if (timed || setType === 'drop' || rx?.power) return void logSet({ rpe: null, missed: false });
    setEffortOpen(true);
  };
  const rpeNow = rpe;
  const missedNow = missed;
  const typedKg = weightKg;
  const typedReps = repsNum;
  const logSet = async (effort?: { rpe: number | null; missed: boolean; asWorking?: { weightKg: number; reps: number } }) => {
    const weightKg = timed ? 0 : (effort?.asWorking?.weightKg ?? typedKg);
    const repsNum = timed ? 0 : (effort?.asWorking?.reps ?? typedReps);
    const hold = timed ? Math.round(secondsNum) : null;
    const drop = setType === 'drop' && !effort?.asWorking && !timed;
    const rpe = effort ? effort.rpe : rpeNow;
    const missed = effort ? effort.missed : missedNow;
    setEffortOpen(false);
    if (!exercise || (!effort?.asWorking && !valid)) return;
    const wasCalibrating = calibrating;
    const setRpe10 = missed ? 10 : rpe;
    const aimReps = rx ? Math.round((rx.repRange[0] + rx.repRange[1]) / 2) : repsNum;
    if (
      !effort?.asWorking && !drop && !timed && rx && !rx.power && done.length === 0 &&
      looksLikeWarmup({ exerciseId: exercise.id, weightKg, reps: repsNum, rpe: setRpe10, failed: missed, estimate, targetReps: aimReps, targetRir: rx.targetRir })
    ) {
      await insertSets(db, [
        { date: today, exerciseId: exercise.id, setIndex: warmDone.length + 1, reps: repsNum, weightKg, rpe: setRpe10, rir: null, source: 'log', rawName: null, kind: 'warmup' },
      ]);
      setMoved(null);
      setAutoWarm({ text: `Logged as a warm-up: ${fmt(weightKg)} ${unit} × ${repsNum} is well below your working weight, so it doesn't change the estimate.`, weightKg, reps: repsNum, rpe: setRpe10, missed });
      if (rx.loadKg !== null) setWeight(fmt(Math.max(bracket?.value ?? rx.loadKg, floorKg)));
      setReps(String(aimReps));
      setRpe(null);
      setMissed(false);
      Haptics.selectionAsync().catch(() => {});
      await reload();
      return;
    }
    setAutoWarm(null);
    const before = await getSets(db);
    const newSet = { date: today, exerciseId: exercise.id, reps: repsNum, weightKg, rpe: setRpe10, rir: null, failed: missed, drop, seconds: hold };
    const after = [...before, newSet];
    const news: string[] = [];
    if (profile?.showStreaks) {
      const becameSession = sessionDates(after).includes(today) && !sessionDates(before).includes(today);
      if (becameSession && missedSessions(before, profile, today)) news.push('First workout after a break.');
      if (becameSession) {
        const was = consistency(before, profile, today);
        const now = consistency(after, profile, today);
        const cur = now.weeks[now.weeks.length - 1];
        if (cur.status === 'kept' && was.weeks[was.weeks.length - 1].status !== 'kept') news.push(`Workout ${cur.done} this ${profile.periodWeeks === 2 ? 'fortnight' : 'week'}, which counts towards your streak.`);
        else if (now.repairable === null && was.repairable !== null) news.push('That makes up the short week.');
      }
      const found = [
        ...(recPost ? strengthRecords(recordPaths(after, recPost, today), after, today, today).filter((r) => r.exerciseId === exercise.id) : []),
        ...recordsForSet(newSet, before.filter((s) => s.exerciseId === exercise.id), bodyweightKg),
      ];
      for (const r of found) {
        const key = `${r.exerciseId}|${r.kind}`;
        if (announced.has(key)) continue;
        announced.add(key);
        news.push(`${describeRecord(r, unit)}.`);
        if (r.kind === 'strength' && !profile.awardedRecords.some((a) => a.exerciseId === r.exerciseId && a.week === weekStart(r.date))) {
          update({ ...profile, awardedRecords: [...profile.awardedRecords, { exerciseId: r.exerciseId, week: weekStart(r.date), date: r.date, e1rmKg: r.e1rmKg!, previousKg: r.previousKg! }] });
        }
        break;
      }
      setAnnounced(new Set(announced));
    }
    setCelebration(news);
    lastLogAt.current = nowMs();
    if (title && planDay !== null) await saveSessionDay(db, today, planDay);
    await insertSets(db, [
      {
        date: today, exerciseId: exercise.id, setIndex: done.length + 1, reps: repsNum, weightKg, rpe: setRpe10, rir: null,
        source: 'log', rawName: null, kind: drop ? 'drop' : missed ? 'failed' : 'working', seconds: hold,
      },
    ]);
    if (drop) {
      setMoved('Drop set logged. It counts towards weekly sets, not your strength estimate.');
      if (bracket) setWeight(fmt(Math.max(bracket.value, floorKg)));
    }
    if (timed) setHoldStart(null);
    if (!rx?.power && !timed && !drop) {
      const mid = rx ? Math.round((rx.repRange[0] + rx.repRange[1]) / 2) : repsNum;
      const rirTarget = rx ? rx.targetRir : rpe !== null ? 10 - rpe : EFFORT_PRIORS.missingRir;
      const added = ADDED_WEIGHT_LIFTS.has(exercise.id);
      const update = updateAfterSet({
        prior: estimate,
        weightKg,
        reps: repsNum,
        rpe: setRpe10,
        missed,
        targetReps: mid,
        targetRir: rirTarget,
        incrementKg: increment,
        bodyweightKg: added ? bodyweightKg : undefined,
      });
      setEstimate(update.estimate);
      const next = update.next;
      const prev = bracket;
      setBracket(next);
      setDomain(loadDomain(next.low, next.value, next.high));
      const widened = prev && estimate && update.estimate.logSd > estimate.logSd;
      const aimRpe = 10 - rirTarget;
      const effortPart = missed
        ? 'missed reps'
        : setRpe10 === null
          ? 'no effort rating'
          : simple
            ? setRpe10 <= aimRpe - 0.5 ? 'felt easier than the aim' : setRpe10 >= aimRpe + 0.5 ? 'felt harder than the aim' : 'as hard as the aim'
            : `RPE ${setRpe10}${setRpe10 <= aimRpe - 0.5 ? ' (easier than ' : setRpe10 >= aimRpe + 0.5 ? ' (harder than ' : ' (as '}aim ${aimRpe})`;
      const repsPart = rx && !missed ? `${repsNum} reps${repsNum > mid ? ` (more than aim ${mid})` : repsNum < mid ? ` (fewer than aim ${mid})` : ''}` : '';
      const nextKg = Math.max(next.value, floorKg);
      const change = nextKg - weightKg;
      const fromSuggested = prev ? nextKg - Math.max(prev.value, floorKg) : 0;
      const move =
        Math.abs(change) >= increment / 2
          ? `${change > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(change))} ${unit} next`
          : Math.abs(fromSuggested) >= increment / 2
            ? `Same weight next, ${fromSuggested > 0 ? 'up' : 'down'} from the suggested ${fmt(Math.max(prev!.value, floorKg))} ${unit}`
            : 'Same weight next';
      const best = toUnit(Math.exp(update.estimate.logMean) - (added ? bodyweightKg : 0), unit);
      const offTarget = !missed && setRpe10 !== null && (Math.abs(setRpe10 - aimRpe) >= 0.5 || (!!rx && repsNum !== mid));
      const small =
        move === 'Same weight next' && offTarget && Math.abs(best - toUnit(nextKg, unit)) >= 0.1
          ? simple
            ? ` It moved, but by less than one ${incrementLabel} ${unit} step.`
            : ` Best estimate ${best.toFixed(1)} ${unit}, under one ${incrementLabel} ${unit} step.`
          : '';
      const calibrated =
        wasCalibrating && prev ? `Calibrated: ${fmt(prev.low)}–${fmt(prev.high)} to ${fmt(next.low)}–${fmt(next.high)} ${unit}.\n` : '';
      setMoved(`${calibrated}${move}: ${[effortPart, repsPart].filter(Boolean).join(', ')}${missed ? '; range kept wide' : widened ? '; range widened' : ''}.${small}`);
      if (weightKg > 0) setWeight(fmt(nextKg));
    }
    setMissed(false);
    setRpe(null);
    if (rx) setReps(String(Math.round((rx.repRange[0] + rx.repRange[1]) / 2)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!drop) startRest();
    setSetType('normal');
    await reload();
    const all = await getSets(db);
    setHistory(all.filter((h) => h.exerciseId === exercise.id).slice(-3).reverse());
  };

  const effortCell = (r: number | null) => (r === null ? '–' : simple ? (r <= 6 ? '4+' : String(10 - r)) : String(r));

  const reasonFor = (mine: StoredSet[], topKg: number, nextKg: number, aimRpe: number, step: number): string | null => {
    const rated = mine.filter((x) => x.rpe !== null);
    if (!rated.length) return null;
    const avg = Math.round((rated.reduce((a, x) => a + x.rpe!, 0) / rated.length) * 10) / 10;
    const diff = nextKg - topKg;
    const move = Math.abs(diff) < step / 2 ? 'Same as today' : `${diff > 0 ? 'Up' : 'Down'} ${fmt(Math.abs(diff))} ${unit} from today`;
    const how = Math.abs(diff) < step / 2 ? (simple ? ' Sets that feel easier move it up.' : ` It steps up once the estimate gains a full ${fmt(step)} ${unit}.`) : '';
    if (simple) return `${move}: your sets felt ${avg <= aimRpe - 0.75 ? 'easier than' : avg >= aimRpe + 0.75 ? 'harder than' : 'about'} the aim.${how}`;
    return `${move}: your sets averaged RPE ${avg} (aim ${aimRpe}${Math.abs(avg - aimRpe) < 0.75 ? ', close to it' : ''}).${how}`;
  };

  const summarize = async (p: NonNullable<typeof profile>, sessionTitle: string | null): Promise<SessionSummary> => {
    const [all, freeze] = await Promise.all([getSets(db), getWeekFreeze(db)]);
    const todays = all.filter((x) => x.date === today);
    const plan = cachedPlan(p, all, localToday(), freeze);
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    const thisWeek = (x: { weekday: number }) => x.weekday > weekday && x.weekday !== planDay;
    const dayOf = (ahead: number) =>
      new Date(Date.parse(`${today}T00:00:00Z`) + ahead * 86400000).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const order = [...plan.sessions.filter(thisWeek), ...plan.sessions.filter((x) => !thisWeek(x))];
    const ids = [...new Set(todays.map((x) => x.exerciseId))];
    return {
      title: sessionTitle,
      sets: todays.length,
      volumeKg: todays.reduce((v, x) => v + x.weightKg * x.reps, 0),
      exercises: ids.map((id) => {
        const mine = todays.filter((x) => x.exerciseId === id);
        const top = mine.reduce((a, b) => (b.weightKg > a.weightKg ? b : a));
        const next = order.map((x) => ({ x, e: x.exercises.find((e) => e.exerciseId === id) })).find((h) => h.e);
        return {
          id,
          name: EXERCISES_BY_ID[id]?.name ?? id,
          sets: mine.length,
          top: `${fmt(top.weightKg)} ${unit} × ${top.reps}`,
          next: next?.e && next.e.loadKg !== null ? { when: dayOf(thisWeek(next.x) ? next.x.weekday - weekday : 7 - weekday + next.x.weekday), kg: next.e.loadKg, low: next.e.loadLow, high: next.e.loadHigh, reason: reasonFor(mine, top.weightKg, next.e.loadKg, rpeFor(next.e.targetRir), incrementFor(p, next.e)) } : null,
        };
      }),
    };
  };

  const finish = () => {
    const working = sets.filter((x) => x.kind !== 'warmup');
    const untouched = queue.filter((q) => !working.some((x) => x.exerciseId === q.exerciseId)).length;
    const leave = async () => {
      const finishedTitle = title;
      setQueue([]);
      setFreeExercise(null);
      setTitle(null);
      endRest(false);
      if (profile) setSummary(await summarize(profile, finishedTitle));
    };
    if (untouched > 0) {
      const started = queue.length - untouched;
      confirm({
        title: 'Finish workout?',
        message: started === 0 ? 'Nothing logged yet.' : `You did ${started} of ${queue.length} exercises. Your sets are saved.`,
        cancel: 'Keep going',
        confirm: 'Finish',
        onConfirm: leave,
      });
    } else leave();
  };

  const countAsWorking = async () => {
    if (!autoWarm || !warmDone.length) return;
    const last = warmDone.reduce((a, b) => (b.id > a.id ? b : a));
    await deleteSet(db, last.id);
    await logSet({ rpe: autoWarm.rpe, missed: autoWarm.missed, asWorking: { weightKg: autoWarm.weightKg, reps: autoWarm.reps } });
  };

  const logWarmup = async (w?: { loadKg: number; reps: number }) => {
    if (!exercise) return;
    const loadKg = w?.loadKg ?? weightKg;
    const r = w?.reps ?? repsNum;
    if (setProblem({ exerciseId: exercise.id, weightKg: loadKg, reps: r, rpe: null, rir: null }) === 'weight' || !Number.isInteger(r) || r <= 0 || r > MAX_REPS) return;
    await insertSets(db, [
      { date: today, exerciseId: exercise.id, setIndex: warmDone.length + 1, reps: r, weightKg: loadKg, rpe: null, rir: null, source: 'log', rawName: null, kind: 'warmup' },
    ]);
    Haptics.selectionAsync().catch(() => {});
    await reload();
  };

  const remove = (id: number, n: number | string) =>
    confirm({
      title: `Delete set ${n}?`,
      message: 'This removes it from your log.',
      cancel: 'Keep',
      confirm: 'Delete',
      destructive: true,
      onConfirm: async () => {
        await deleteSet(db, id);
        await reload();
      },
    });

  if (summary) {
    const counted = summary.sets >= MIN_SESSION_SETS;
    return (
      <Screen title="Workout complete" subtitle={summary.title ?? undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.statRow}>
            {[
              { label: summary.sets === 1 ? 'Set' : 'Sets', value: String(summary.sets) },
              { label: summary.exercises.length === 1 ? 'Exercise' : 'Exercises', value: String(summary.exercises.length) },
              { label: `Total lifted, ${unit}`, value: String(Math.round(toUnit(summary.volumeKg, unit))) },
            ].map((x) => (
              <View key={x.label} style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="num" style={styles.display}>
                  {x.value}
                </ThemedText>
                <ThemedText type="caption" themeColor="steel">
                  {x.label}
                </ThemedText>
              </View>
            ))}
          </View>
          <ThemedText type="small" themeColor={counted ? 'text' : 'textSecondary'}>
            {counted ? 'Counts towards your streak.' : `${MIN_SESSION_SETS - summary.sets} more working ${MIN_SESSION_SETS - summary.sets === 1 ? 'set' : 'sets'} today would count it towards your streak.`}
          </ThemedText>
          {summary.exercises.map((x) => (
            <View key={x.id} style={[styles.summaryCard, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.summaryHead}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {x.name}
                </ThemedText>
                <ThemedText type="numSmall" themeColor="textSecondary">
                  {x.sets} {x.sets === 1 ? 'set' : 'sets'}, top {x.top}
                </ThemedText>
              </View>
              {x.next ? (
                <>
                  <View style={styles.summaryHead}>
                    <ThemedText type="small" style={styles.flex}>
                      Next time ({x.next.when})
                    </ThemedText>
                    <ThemedText type="num" style={styles.display}>
                      {fmt(x.next.kg)}
                      <ThemedText type="numSmall" themeColor="steel">{` ${unit}`}</ThemedText>
                    </ThemedText>
                  </View>
                  {x.next.reason ? <ThemedText type="small">{x.next.reason}</ThemedText> : null}
                  <RangeBar low={x.next.low !== null ? toUnit(x.next.low, unit) : null} value={toUnit(x.next.kg, unit)} high={x.next.high !== null ? toUnit(x.next.high, unit) : null} />
                  {x.next.low !== null && x.next.high !== null ? (
                    <ThemedText type="caption" themeColor="steel">
                      {startRanges[x.id]
                        ? `Range narrowed from ${fmt(startRanges[x.id][0])}–${fmt(startRanges[x.id][1])} to ${fmt(x.next.low)}–${fmt(x.next.high)} ${unit}`
                        : `likely ${fmt(x.next.low)}–${fmt(x.next.high)} ${unit}, from all your sets so far`}
                    </ThemedText>
                  ) : null}
                </>
              ) : (
                <ThemedText type="caption" themeColor="steel">
                  No estimate for this lift yet. Next time, start from today&apos;s top set and adjust by RPE.
                </ThemedText>
              )}
            </View>
          ))}
        </ScrollView>
        <Button
          title="Done"
          onPress={() => {
            setSummary(null);
            router.push('/');
          }}
        />
      </Screen>
    );
  }

  if (picking || !exercise) {
    return (
      <Screen title="Workout" subtitle={exercise ? 'Change exercise' : "Start today's planned workout, or pick any exercise below"}>
        {exercise ? <Button title="Cancel" variant="secondary" onPress={() => setPicking(false)} /> : <Button title="Go to today's workout" onPress={() => router.push('/')} />}
        <ExercisePicker
          onPick={(e) => {
            setQueue([]);
            setFreeExercise(e);
            setPicking(false);
          }}
        />
      </Screen>
    );
  }

  const bracketSd = bracket && bracket.low > 0 ? (Math.log(bracket.high) - Math.log(bracket.low)) / 2 : rx ? logSdOf(rx) : null;
  const fromLogs = rx?.loadSource === 'model' || rx?.loadSource === 'log';
  const daysBefore = Math.max(rx?.sessionsOfData ?? 0, new Set(history.filter((h) => h.date < today).map((h) => h.date)).size);
  const learnedSessions = daysBefore + (done.length > 0 ? 1 : 0);

  const barbell = !!rx?.equipment?.includes('barbell') && weightKg >= BAR_KG;
  const each = exercise?.requires.some((o) => o.includes('dumbbells')) && !exercise.requires.some((o) => o.includes('barbell')) ? ' each' : '';
  const dots = bracketSd !== null ? dotsWithData(bracketSd, learnedSessions) : 1;
  const calibrating = !!rx && !rx.power && (rx.loadSource === 'population' || rx.loadSource === 'analogy' || rx.loadSource === 'convention') && learnedSessions === 0 && done.length === 0;
  const certainty =
    learnedSessions > 0 || fromLogs
      ? `How sure this weight is: ${certaintyWord(dots).toLowerCase()}, from ${learnedSessions} ${learnedSessions === 1 ? 'workout' : 'workouts'} on this exercise`
      : `How sure this weight is: ${certaintyWord(dots).toLowerCase()}, a starting estimate`;

  return (
    <Screen
      title={exercise.name}
      subtitle={[title, sessionDay, queue.length > 1 ? `${index + 1} of ${queue.length}` : null].filter(Boolean).join(' – ')}
      action={
        queue.length > 0 || sets.some((x) => x.kind !== 'warmup') ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Finish workout" onPress={finish} style={[styles.navButton, { borderColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">Finish</ThemedText>
          </Pressable>
        ) : null
      }>
      {confirmDialog}
      <Modal visible={effortOpen} transparent animationType="slide" onRequestClose={() => setEffortOpen(false)} statusBarTranslucent>
        <Pressable style={styles.scrim} onPress={() => setEffortOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="heading">
            {simple ? `${weight} ${unit} × ${repsNum}: how many more reps could you have done?` : `How hard was ${weight} ${unit} × ${repsNum}?`}
          </ThemedText>
          {simple ? (
            <View style={styles.rpeStrip} accessibilityRole="radiogroup" accessibilityLabel="Reps left">
              {REPS_LEFT_STEPS.map((x) => {
                const target = rx && !rx.power && x.rpe === rpeFor(rx.targetRir);
                return (
                  <Pressable
                    key={x.rpe}
                    accessibilityRole="button"
                    accessibilityLabel={`${x.label} more${target ? ', the target' : ''}`}
                    onPress={() => logSet({ rpe: x.rpe, missed: false })}
                    style={({ pressed }) => [styles.rpeCell, controlStyle(theme, pressed)]}>
                    <ThemedText type="num">{x.label}</ThemedText>
                    {target ? (
                      <ThemedText type="caption" themeColor="steel" style={styles.targetLabel}>
                        target
                      </ThemedText>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
          <>
          <ThemedText type="small" themeColor="textSecondary">
            RPE: 10 = no more reps possible, 9 = 1 more, 8 = 2 more, 7 = 3 more, 6 = 4 or more.
            {rx && !rx.power ? ` Target: RPE ${rpeFor(rx.targetRir)}.` : ''}
          </ThemedText>
          <View style={styles.rpeGrid} accessibilityRole="radiogroup" accessibilityLabel="RPE">
            {[RPE_STEPS.slice(0, 5), RPE_STEPS.slice(5)].map((row) => (
              <View key={row[0]} style={styles.rpeStrip}>
                {row.map((v) => {
                  const target = rx && !rx.power && v === rpeFor(rx.targetRir);
                  return (
                    <Pressable
                      key={v}
                      accessibilityRole="button"
                      accessibilityLabel={`RPE ${v}${target ? ', the target' : ''}`}
                      onPress={() => logSet({ rpe: v, missed: false })}
                      style={({ pressed }) => [styles.rpeCell, controlStyle(theme, pressed)]}>
                      <ThemedText type="num">{v}</ThemedText>
                      {target ? (
                        <ThemedText type="caption" themeColor="steel" style={styles.targetLabel}>
                          target
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  );
                })}
                {row.length < 5 ? <View style={styles.rpeSpacer} /> : null}
              </View>
            ))}
          </View>
          </>
          )}
          <Button title="Failed a rep" variant="secondary" onPress={() => logSet({ rpe: 10, missed: true })} />
          <TextAction title="Skip rating" onPress={() => logSet({ rpe: null, missed: false })} />
        </View>
      </Modal>
      {resting ? (
        <View style={[styles.restTrack, { backgroundColor: theme.backgroundElement }]} accessibilityLabel="Rest timer running">
          <View style={styles.restHead}>
            <View style={styles.setCell}>
              <Icon name="timer" size={20} color={theme.text} />
              <ThemedText type="num">
              Rest {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}
              </ThemedText>
            </View>
            <View style={styles.restActions}>
              {[-REST_STEP, REST_STEP].map((d) => (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={`${d < 0 ? 'Shorten' : 'Lengthen'} rest by ${REST_STEP} seconds`}
                  onPress={() => adjustRest(d)}
                  hitSlop={4}
                  style={[styles.restStep, { borderColor: theme.backgroundSelected }]}>
                  <ThemedText type="smallBold">{d < 0 ? '−' : '+'}{REST_STEP}s</ThemedText>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel="Skip rest" onPress={() => endRest(false)} hitSlop={12}>
                <ThemedText type="small" themeColor="link" style={styles.underline}>
                  Skip
                </ThemedText>
              </Pressable>
            </View>
          </View>
          <View style={[styles.restBar, { backgroundColor: theme.interval }]}>
            <Animated.View
              style={[styles.restFill, { backgroundColor: theme.bracket, width: rest.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
            />
          </View>
        </View>
      ) : null}
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {queue.length <= 1 ? <TextAction title="Change exercise" onPress={() => setPicking(true)} /> : null}
          {exercise?.cue ? (
            <ThemedText type="small" themeColor="textSecondary">
              {exercise.cue}
            </ThemedText>
          ) : null}
          {rx ? (
            <ThemedText type="num">
              <ThemedText type="smallBold">
                {done.length >= rx.sets ? `All ${rx.sets} sets done${done.length > rx.sets ? `, plus ${done.length - rx.sets} extra` : ''}: ` : `Set ${done.length + 1} of ${rx.sets}${calibrating ? ', calibration' : ''}: `}
              </ThemedText>
              {rx.repRange[0]}–{rx.repRange[1]} reps
              {rx.power ? ', explosive with a light load' : simple ? `, stop ${rx.targetRir} ${rx.targetRir === 1 ? 'rep' : 'reps'} short` : ` at RPE ${rpeFor(rx.targetRir)}`}
              {!rx.power && !simple ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {`  (${rx.targetRir} ${rx.targetRir === 1 ? 'rep' : 'reps'} left)`}
                </ThemedText>
              ) : null}
            </ThemedText>
          ) : (
            <ThemedText type="smallBold">Set {done.length + 1}</ThemedText>
          )}

          {rx && (warmTodo.length > 0 || warmDone.length > 0) && done.length === 0 ? (
            <View style={styles.warmStrip}>
              <ThemedText type="small" themeColor="textSecondary">
                Warm-up{warmTodo.length ? ` (optional): tap each when done, ${warmTodo.length} to go` : ' done'}
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.warmChips}>
                {warmTodo.map((w, i) => (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={`Log warm-up: ${fmt(w.loadKg)} ${unit} for ${w.reps}`}
                    onPress={() => logWarmup(w)}
                    style={({ pressed }) => [styles.warmChip, controlStyle(theme), pressed && styles.pressed]}>
                    <ThemedText type="numSmall">
                      {fmt(w.loadKg)} × {w.reps}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View>
            <View style={styles.tableRow}>
              {['Set', Platform.OS === 'web' ? 'Prev' : 'Previous', timed ? '' : unit, timed ? 'Time' : 'Reps', timed ? '' : simple ? 'Left' : 'RPE', ''].map((h, i) => (
                <ThemedText key={i} type="label" themeColor="steel" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={h === '' ? styles.colAction : i === 1 ? styles.colWide : i === 2 ? styles.colKg : i === 3 ? styles.colReps : styles.colNarrow}>
                  {h}
                </ThemedText>
              ))}
            </View>
            {warmDone.map((s, i) => (
              <View key={s.id} style={[styles.tableRow, styles.warmRow]}>
                <ThemedText numberOfLines={1} adjustsFontSizeToFit type="numSmall" themeColor="steel" style={styles.colNarrow}>
                  W{i + 1}
                </ThemedText>
                <ThemedText numberOfLines={1} adjustsFontSizeToFit type="numSmall" themeColor="steel" style={styles.colWide}>
                  warm-up
                </ThemedText>
                <ThemedText numberOfLines={1} adjustsFontSizeToFit type="numSmall" themeColor="steel" style={styles.colKg}>
                  {fmt(s.weightKg)}
                </ThemedText>
                <ThemedText numberOfLines={1} adjustsFontSizeToFit type="numSmall" themeColor="steel" style={styles.colReps}>
                  {s.reps}
                </ThemedText>
                <ThemedText numberOfLines={1} adjustsFontSizeToFit type="numSmall" themeColor="steel" style={styles.colNarrow}>
                  –
                </ThemedText>
                <View style={styles.colAction}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete warm-up ${i + 1}`} hitSlop={4} onPress={() => remove(s.id, `W${i + 1}`)} style={[styles.actionButton, styles.actionOutline, { borderColor: theme.backgroundSelected }]}>
                    <Icon name="close" size={20} color={theme.steel} />
                  </Pressable>
                </View>
              </View>
            ))}
            {Array.from({ length: Math.max(done.length + 1, rx?.sets ?? 0) }, (_, i) => {
              const s = done[i];
              const prev = lastTime[i];
              const current = i === done.length;
              const prevText = prev ? (prev.seconds ? `${prev.seconds} s` : `${fmt(prev.weightKg)}×${prev.reps}`) : '–';
              const typeMark = s ? (s.kind === 'drop' ? 'D' : '') : current && setType !== 'normal' ? (setType === 'drop' ? 'D' : 'W') : '';
              return (
                <View
                  key={s ? s.id : `p${i}`}
                  style={[styles.tableRow, !s && !current && styles.futureRow, current ? (rx && done.length >= rx.sets ? { borderLeftWidth: 3, borderLeftColor: theme.steel } : { backgroundColor: theme.accentTint, borderLeftWidth: 3, borderLeftColor: theme.accent }) : s ? { backgroundColor: theme.doneTint } : band(i)]}
                  accessibilityLabel={s ? `Set ${i + 1}${s.kind === 'drop' ? ', drop set' : ''}: ${s.seconds ? `${s.seconds} seconds` : `${fmt(s.weightKg)} ${unit} × ${s.reps}`}` : current ? `Set ${i + 1}, now` : `Set ${i + 1}, to do`}>
                  <Pressable
                    disabled={!current || timed || !!rx?.power}
                    accessibilityRole={current && !timed ? 'button' : undefined}
                    accessibilityLabel={current && !timed ? 'Set type' : undefined}
                    onPress={() => setTypeOpen(true)}
                    style={[styles.colNarrow, styles.setCell]}>
                    <ThemedText numberOfLines={1} adjustsFontSizeToFit type="num" themeColor={s || current ? 'text' : 'steel'} style={current && !timed ? styles.editable : undefined}>
                      {typeMark || i + 1}
                    </ThemedText>
                    {s ? <Icon name="check" size={16} color={theme.done} /> : null}
                  </Pressable>
                  <ThemedText numberOfLines={1} adjustsFontSizeToFit type="numSmall" themeColor="steel" style={styles.colWide}>
                    {prevText}
                  </ThemedText>
                  {current ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit weight, ${weight || 'empty'}`} onPress={() => weightRef.current?.focus()} style={styles.colKg}>
                      <ThemedText numberOfLines={1} adjustsFontSizeToFit type="num" style={styles.editable}>
                        {timed ? '–' : weight || '–'}
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <ThemedText numberOfLines={1} adjustsFontSizeToFit type="num" themeColor={s ? 'text' : 'steel'} style={styles.colKg}>
                      {s && !s.seconds ? fmt(s.weightKg) : '–'}
                    </ThemedText>
                  )}
                  {current ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Edit reps, ${reps || 'empty'}`} onPress={() => repsRef.current?.focus()} style={styles.colReps}>
                      <ThemedText numberOfLines={1} adjustsFontSizeToFit type="num" style={styles.editable}>
                        {timed ? `${seconds || '–'} s` : reps || '–'}
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <ThemedText numberOfLines={1} adjustsFontSizeToFit type="num" themeColor={s ? 'text' : 'steel'} style={styles.colReps}>
                      {s ? (s.seconds ? `${s.seconds} s` : s.reps) : '–'}
                    </ThemedText>
                  )}
                  <ThemedText numberOfLines={1} adjustsFontSizeToFit type="num" themeColor={s || current ? 'text' : 'steel'} style={styles.colNarrow}>
                    {s ? (s.kind === 'failed' ? 'Miss' : effortCell(s.rpe ?? (s.rir !== null ? rpeFor(s.rir) : null))) : current ? (missed ? effortCell(10) : effortCell(rpe)) : '–'}
                  </ThemedText>
                  {s ? (
                    <View style={styles.colAction}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Delete set ${i + 1}`} hitSlop={4} onPress={() => remove(s.id, i + 1)} style={[styles.actionButton, styles.actionOutline, { borderColor: theme.backgroundSelected }]}>
                        <Icon name="close" size={20} color={theme.steel} />
                      </Pressable>
                    </View>
                  ) : (
                    current ? (
                    <View style={styles.colAction}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Log set ${i + 1}`} disabled={!valid} onPress={requestLog} style={[styles.actionButton, { backgroundColor: valid ? theme.accent : theme.backgroundElement }]}>
                        <Icon name="check" size={20} color={theme.accentText} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.colAction} />
                  )
                  )}
                </View>
              );
            })}
          </View>

          {!timed ? (
          <View style={styles.hero}>
            <NudgeButton label={`−${incrementLabel}`} accessibilityLabel={`Decrease weight by ${incrementLabel} ${unitName}`} onPress={() => nudge(-increment)} />
            <View style={styles.heroLoad}>
              <TextInput
                ref={weightRef}
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                selectTextOnFocus
                placeholder="–"
                placeholderTextColor={theme.steel}
                accessibilityLabel={`Weight in ${unitName}`}
                style={[styles.heroInput, { color: theme.text }]}
              />
              <ThemedText type="small" themeColor="steel">
                {ADDED_WEIGHT_LIFTS.has(exercise.id) ? `${unit} added` : `${unit}${each}`}
              </ThemedText>
            </View>
            <NudgeButton label={`+${incrementLabel}`} accessibilityLabel={`Increase weight by ${incrementLabel} ${unitName}`} onPress={() => nudge(increment)} />
          </View>
          ) : null}
          {moved ? (
            <ThemedText type="smallBold" accessibilityRole="alert">
              {moved}
            </ThemedText>
          ) : null}
          {autoWarm ? (
            <View style={styles.autoWarm}>
              <ThemedText type="smallBold" accessibilityRole="alert">
                {autoWarm.text}
              </ThemedText>
              <TextAction title="Count it as a working set" onPress={countAsWorking} />
            </View>
          ) : null}
          {bracket && domain ? (
            done.length > 0 || fromLogs ? (
              <ThemedText type="caption" themeColor="steel">
                This set, likely {fmt(bracket.low)}–{fmt(bracket.high)} {unit}
                {each}
              </ThemedText>
            ) : (
              <View style={styles.guessRow}>
                <FirstGuess label={calibrating ? 'Calibration set' : 'First guess'} />
                <ThemedText type="caption" themeColor="steel">
                  likely {fmt(bracket.low)}–{fmt(bracket.high)} {unit}
                  {each}. {rx?.liftMoreShare ? `Starts low: ${rx.liftMoreShare >= 0.9 ? '9 in 10' : '4 in 5'} people like you lift more. ` : ''}Go heavier if it feels light.
                </ThemedText>
              </View>
            )
          ) : null}
          {bracket && domain ? (
            <BracketStrip
              low={toUnit(bracket.low, unit)}
              value={toUnit(bracket.value, unit)}
              high={toUnit(bracket.high, unit)}
              domain={[toUnit(domain[0], unit), toUnit(domain[1], unit)]}
              unit={unit}
            />
          ) : null}
          {profile?.showStreaks && todayWorking < MIN_SESSION_SETS ? (
            <ThemedText type="caption" themeColor="steel">
              {todayWorking === 0
                ? `${MIN_SESSION_SETS} working sets today count this workout towards your streak.`
                : `${MIN_SESSION_SETS - todayWorking} more working ${MIN_SESSION_SETS - todayWorking === 1 ? 'set today counts' : 'sets today count'} this workout towards your streak.`}
            </ThemedText>
          ) : null}
          {timed ? (
            <>
              <View style={styles.repsRow}>
                <NudgeButton label="−5" accessibilityLabel="Five seconds less" onPress={() => setSeconds(String(Math.max(1, (Number(seconds) || 5) - 5)))} />
                <View style={styles.repsCentre}>
                  <TextInput
                    ref={repsRef}
                    value={seconds}
                    onChangeText={(t) => {
                      setHoldStart(null);
                      setSeconds(t);
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    accessibilityLabel="Seconds held"
                    style={[styles.repsInput, { color: theme.text }]}
                  />
                  <ThemedText type="small" themeColor="steel">
                    seconds held
                  </ThemedText>
                </View>
                <NudgeButton label="+5" accessibilityLabel="Five seconds more" onPress={() => setSeconds(String(Math.min(3600, (Number(seconds) || 0) + 5)))} />
              </View>
              <Button
                title={holdStart !== null ? `Stop at ${seconds} s` : 'Start timer'}
                variant="secondary"
                onPress={() => {
                  if (holdStart !== null) return setHoldStart(null);
                  setSeconds('0');
                  setHoldStart(nowMs());
                }}
              />
            </>
          ) : (
          <View style={styles.repsRow}>
            <NudgeButton label="−1" accessibilityLabel="One rep fewer" onPress={() => setReps(String(Math.max(1, (Number(reps) || 1) - 1)))} />
            <View style={styles.repsCentre}>
              <TextInput
                ref={repsRef}
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
                selectTextOnFocus
                accessibilityLabel="Reps done"
                style={[styles.repsInput, { color: theme.text }]}
              />
              <ThemedText type="small" themeColor="steel">
                reps done
              </ThemedText>
            </View>
            <NudgeButton label="+1" accessibilityLabel="One rep more" onPress={() => setReps(String(Math.min(100, (Number(reps) || 0) + 1)))} />
          </View>
          )}


          {barbell ? <PlateStrip loadKg={weightKg} incrementKg={increment} unit={unit} /> : null}

          {rx && !simple ? <KnowledgeDots filled={dots} label={certainty} /> : null}
          {rx && !rx.power && rx.loadKg === null && rx.loadSource !== 'bodyweight' && learnedSessions === 0 && done.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No published data to start this exercise from. Pick a weight you could lift for the target reps at RPE {rpeFor(rx.targetRir)}. The
              estimate starts from that first set.
            </ThemedText>
          ) : null}
          {rx?.checkIn ? (
            <ThemedText type="small" themeColor="textSecondary">
              Check-in: make the last set a top set at RPE 9 (one rep left).
            </ThemedText>
          ) : null}
          {rx?.reentryWeeks ? (
            <ThemedText type="small" themeColor="textSecondary">
              Back after {rx.reentryWeeks} weeks: lighter to start.
            </ThemedText>
          ) : null}
          {rx && done.length >= rx.sets ? (
            <ThemedText type="smallBold" accessibilityRole="alert">
              All {rx.sets} sets done.{index < queue.length - 1 ? ' Tap Next for the next exercise.' : ' Tap Finish workout when you are done.'}
            </ThemedText>
          ) : null}
          {celebration.map((c) => (
            <ThemedText key={c} type="smallBold" accessibilityRole="alert">
              {c}
            </ThemedText>
          ))}
          <View style={styles.links}>
            {rx && !rx.power ? <TextAction title="Why this weight?" onPress={() => setWhy(true)} /> : null}
            {exercise ? <TextAction title="How to" onPress={() => setMusclesOpen(true)} /> : null}
          </View>
        </View>


      </ScrollView>
      {exercise && !timed && !rx?.power ? (
        <View style={styles.warmAction}>
          <TextAction title={`Set type: ${SET_TYPE_LABEL[setType]}`} onPress={() => setTypeOpen(true)} />
        </View>
      ) : null}
      <Modal visible={typeOpen} transparent animationType="none" onRequestClose={() => setTypeOpen(false)} statusBarTranslucent>
        <Pressable style={styles.scrim} onPress={() => setTypeOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <ThemedText type="heading">Set type</ThemedText>
          {(['normal', 'drop', 'warmup'] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="radio"
              aria-checked={setType === t}
              onPress={() => {
                setSetType(t);
                setTypeOpen(false);
              }}
              style={[styles.typeOption, choiceStyle(theme, setType === t)]}>
              <ThemedText type="smallBold">{SET_TYPE_LABEL[t]}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {SET_TYPE_HELP[t]}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </Modal>
      {problem ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityRole="alert">
          {PROBLEM_TEXT[problem]}
        </ThemedText>
      ) : missingInput && !(rx && done.length >= rx.sets) ? (
        <ThemedText type="small" themeColor="textSecondary" accessibilityRole="alert">
          {missingInput}
        </ThemedText>
      ) : null}
      <View style={styles.bottomBar}>
        {queue.length > 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Previous exercise" disabled={index === 0} onPress={() => setIndex(Math.max(0, index - 1))} style={[styles.arrow, { borderColor: theme.backgroundSelected, opacity: index === 0 ? 0.35 : 1 }]}>
            <Icon name="back" size={28} color={theme.text} />
          </Pressable>
        ) : null}
        <View style={styles.flex}>
          {rx && done.length >= rx.sets ? (
            index < queue.length - 1 ? (
              <Button title="Next exercise" onPress={() => setIndex(index + 1)} />
            ) : (
              <Button title="Finish workout" onPress={finish} />
            )
          ) : (
            <Button
              title={!valid ? 'Log set' : timed ? `Log ${secondsNum} s` : `Log ${setType === 'drop' ? 'drop set: ' : setType === 'warmup' ? 'warm-up: ' : ''}${weight} ${unit} × ${repsNum}`}
              onPress={requestLog}
              disabled={!valid}
            />
          )}
        </View>
        {queue.length > 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Next exercise" disabled={index >= queue.length - 1} onPress={() => setIndex(Math.min(queue.length - 1, index + 1))} style={[styles.arrow, { borderColor: theme.backgroundSelected, opacity: index >= queue.length - 1 ? 0.35 : 1 }]}>
            <Icon name="forward" size={28} color={theme.text} />
          </Pressable>
        ) : null}
      </View>
      {rx && done.length >= rx.sets ? (
        <TextAction title={!valid ? 'Log an extra set' : timed ? `Log an extra set: ${secondsNum} s` : `Log an extra ${setType === 'drop' ? 'drop set' : 'set'}: ${weight} ${unit} × ${repsNum}`} onPress={requestLog} />
      ) : null}
      {exercise ? <MusclesSheet visible={musclesOpen} onClose={() => setMusclesOpen(false)} exercise={exercise} /> : null}
      <WhySheet visible={why} onClose={() => setWhy(false)} rx={rx} history={history} fmt={(kg) => `${fmt(kg)} ${unit}`} simple={simple} />
    </Screen>
  );
}

function MusclesSheet({ visible, onClose, exercise }: { visible: boolean; onClose: () => void; exercise: Exercise }) {
  const theme = useTheme();
  const cues = TECHNIQUE[exercise.id] ?? [];
  const entries = Object.entries(exercise.muscles) as [Muscle, number][];
  const primary = entries.filter(([, w]) => w === 1).map(([m]) => MUSCLE_LABELS[m]);
  const helping = entries.filter(([, w]) => w < 1).map(([m]) => MUSCLE_LABELS[m]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, styles.tallSheet, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.howTo} showsVerticalScrollIndicator={false}>
        <ThemedText type="heading">How to: {exercise.name}</ThemedText>
        {cues.map((c, i) => (
          <View key={i} style={styles.cue}>
            <ThemedText type="numSmall" themeColor="steel">
              {i + 1}
            </ThemedText>
            <ThemedText type="small" style={styles.flex}>
              {c}
            </ThemedText>
          </View>
        ))}
        {cues.length ? (
          <ThemedText type="caption" themeColor="steel">
            General guidance, not coaching. Stop if something hurts, and get in-person coaching for new heavy lifts.
          </ThemedText>
        ) : null}
        <ExerciseEvidence exerciseId={exercise.id} />
        <ThemedText type="smallBold">Muscles worked</ThemedText>
        <MuscleMap shade={exercise.muscles} height={220} />
        <ThemedText type="small">
          <ThemedText type="smallBold">Main: </ThemedText>
          {primary.join(', ') || '–'}
        </ThemedText>
        {helping.length ? (
          <ThemedText type="small" themeColor="textSecondary">
            <ThemedText type="smallBold">Also helps: </ThemedText>
            {helping.join(', ')}. Each set counts {INDIRECT_SET_WEIGHT} of a set for these.
          </ThemedText>
        ) : null}
        </ScrollView>
        <Button title="Close" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

function WhySheet({
  visible,
  onClose,
  rx,
  history,
  fmt,
  simple,
}: {
  visible: boolean;
  onClose: () => void;
  rx: Prescription | null;
  history: StoredSet[];
  fmt: (kg: number) => string;
  simple: boolean;
}) {
  const theme = useTheme();
  const band = useBand();
  const related = rx ? relatedLiftOf(rx.exerciseId) : null;
  const relatedName = related ? (EXERCISES_BY_ID[related]?.name ?? related.replace(/_/g, ' ')) : 'a related lift';
  const prior =
    rx?.loadSource === 'population'
      ? 'Strength-trial data on people of your sex, age, bodyweight and experience.'
      : rx?.loadSource === 'convention'
        ? related
          ? `No study measured this exercise, so the start is a rough rule of thumb from your estimate for ${relatedName}. The range is wide and your first set will move it.`
          : 'No study measured this exercise, so the start is a coaching rule of thumb. The range is wide and your first set will move it.'
        : rx?.loadSource === 'analogy'
        ? `Trial data for ${relatedName}, a related lift on the same equipment, for people like you. The range is wider because the two lifts differ.`
        : rx?.loadSource === null
          ? simple
            ? `No trial measured this exercise. Choose a weight where you would have ${rx.targetRir} reps left.`
            : 'No trial measured this exercise. Choose the load that matches the target RPE.'
          : 'Replaced by your logs.';
  const effort = (r: number | null) => (r === null ? '' : simple ? `, ${r <= 6 ? '4+' : 10 - r} left` : `, RPE ${r}`);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <ThemedText type="heading">Why this weight?</ThemedText>
        <View style={styles.sheetGroup}>
          <ThemedText type="smallBold">Starting estimate</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {prior}
          </ThemedText>
        </View>
        <View style={styles.sheetGroup}>
          <ThemedText type="smallBold">Your logs</ThemedText>
          {history.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              None yet for this exercise.
            </ThemedText>
          ) : (
            history.map((h, i) => (
              <View key={h.id} style={[styles.historyRow, band(i)]}>
                <ThemedText type="numSmall" style={styles.col}>
                  {h.date}
                </ThemedText>
                <ThemedText type="numSmall">
                  {fmt(h.weightKg)} × {h.reps}
                  {effort(h.rpe ?? (h.rir !== null ? rpeFor(h.rir) : null))}
                </ThemedText>
              </View>
            ))
          )}
        </View>
        <Button title="Close" variant="secondary" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  howTo: { gap: Spacing.two, paddingBottom: Spacing.two },
  tallSheet: { maxHeight: '88%' },
  cue: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  typeOption: { padding: Spacing.three, borderRadius: Radius.button, gap: Spacing.half },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.four, rowGap: Spacing.one },
  autoWarm: { gap: Spacing.one, alignItems: 'flex-start' },
  content: { gap: Spacing.four, paddingBottom: Spacing.four },
  card: { gap: Spacing.two },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  repsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  repsCentre: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: Spacing.one },
  repsInput: { minWidth: 56, textAlign: 'center', fontFamily: Fonts.semibold, fontSize: TypeScale.xl, fontVariant: ['tabular-nums'], paddingVertical: 0 },
  heroLoad: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: Spacing.one },
  heroInput: {
    fontFamily: Fonts.compressed,
    fontSize: TypeScale.hero,
    height: 72,
    minWidth: 120,
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingVertical: 0,
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: Spacing.two, gap: Spacing.two },
  colWide: { flex: 1.3 },
  colReps: { flex: 1.15 },
  editable: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  colKg: { flex: 1.4 },
  colNarrow: { flex: 0.9 },
  flex: { flex: 1 },
  actionButton: { width: 48, height: 40, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
  actionOutline: { borderWidth: 1 },
  setCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  guessRow: { gap: Spacing.one, alignItems: 'flex-start' },
  display: { fontFamily: Fonts.compressed, fontSize: 30, lineHeight: 34 },
  statRow: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: Radius.button, padding: Spacing.three, alignItems: 'center' },
  summaryCard: { borderRadius: Radius.button, padding: Spacing.three, gap: Spacing.two },
  summaryHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  col: { flex: 1, minWidth: 0 },
  warmRow: { minHeight: 40 },
  futureRow: { minHeight: 36 },
  warmAction: { alignItems: 'flex-start' },
  rpeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  missChip: { minHeight: 40, paddingHorizontal: Spacing.three, borderRadius: Radius.button, justifyContent: 'center' },
  warmStrip: { gap: Spacing.one },
  warmChips: { flexDirection: 'row', gap: Spacing.two },
  warmChip: { minHeight: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.button, justifyContent: 'center' },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.92 },
  colAction: { width: 56, alignItems: 'flex-end' },
  input: {
    fontFamily: Fonts.medium,
    fontSize: TypeScale.md,
    borderRadius: Radius.input,
    minHeight: 40,
    paddingVertical: 0,
    paddingHorizontal: Spacing.two,
    marginRight: Spacing.three,
    fontVariant: ['tabular-nums'],
  },
  underline: { textDecorationLine: 'underline' },
  rpe: { gap: Spacing.one },
  rpeGrid: { gap: Spacing.one },
  rpeStrip: { flexDirection: 'row', gap: Spacing.one },
  rpeSpacer: { flex: 1 },
  rpeCell: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.button },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetLabel: { fontSize: 10, lineHeight: 12 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  arrow: { width: 52, height: 56, borderWidth: 1, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
  navButton: { minHeight: 44, paddingHorizontal: Spacing.three, borderWidth: 1, borderRadius: Radius.button, justifyContent: 'center' },
  restTrack: { alignSelf: 'stretch', gap: Spacing.one, paddingVertical: Spacing.one },
  restHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  restActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  restStep: { minWidth: 56, minHeight: 40, borderWidth: 1, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  restBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  restFill: { height: 6 },
  scrim: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  sheetGroup: { gap: Spacing.one },
  historyRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: Spacing.two },
});
