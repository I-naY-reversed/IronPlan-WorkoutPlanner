import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Consistency } from '@/components/consistency';
import { ExercisePicker } from '@/components/exercise-picker';
import { localToday, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { BracketGlyph, FirstGuess, RangeBar } from '@/components/ui/bracket';
import { Button, TextAction } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { getSessionDays, getSets, getWeekFreeze, saveWeekFreeze } from '@/db/database';
import { applySwap, swapOptions } from '@/domain/customize';
import type { LoggedSet } from '@/domain/dose';
import { addDays, BLOCK_WEEKS, consistency, missedSessions, sessionDates, newAwards, recordPaths, reminderSchedule, trainingBlock, welcomeBack } from '@/domain/engagement';
import { EXERCISES_BY_ID } from '@/domain/exercises';
import { EQUIPMENT_INFO } from '@/domain/equipment';
import { freezeOf, type Plan, type PlannedExercise } from '@/domain/generator';
import { dotsWithData, logSdOf, rpeFor } from '@/domain/prescription';
import { COMBAT_SPORTS, SPORT_PROFILES } from '@/domain/sports';
import { WEEKDAYS } from '@/components/ui/weekday-picker';
import { displayMode, GOAL_OPTIONS } from '@/domain/profile';
import { formatLoad, fromUnit, toUnit, type Unit } from '@/domain/units';
import { useTheme } from '@/hooks/use-theme';
import { cachedPlan, prescriptionsFor } from '@/state/plan-cache';
import { scheduleReminders } from '@/state/reminders';
import { useProfile } from '@/state/profile-context';
import { controlStyle } from '@/components/ui/control';
import { Segmented } from '@/components/ui/segmented';
import { adjustSession } from '@/domain/adjust-today';
import { minutesFor } from '@/domain/generator';



export default function PlanScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { profile, update } = useProfile();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [day, setDay] = useState(0);
  const [swapping, setSwapping] = useState<PlannedExercise | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [history, setHistory] = useState<LoggedSet[]>([]);
  const [sessionDays, setSessionDays] = useState<Record<string, number>>({});
  const today = localToday();

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      (async () => {
        const [sets, freeze, days] = await Promise.all([getSets(db), getWeekFreeze(db), getSessionDays(db)]);
        setSessionDays(days);
        const now = localToday();
        const next = cachedPlan(profile, sets, now, freeze);
        const fresh = freezeOf(next, profile, now);
        if (!freeze || freeze.week !== fresh.week || freeze.key !== fresh.key) saveWeekFreeze(db, fresh);
        setHistory(sets);
        setPlan(next);
        const weekday = (new Date().getDay() + 6) % 7;
        const mon = addDays(now, -weekday);
        const doneW = new Set(
          [...new Set(sets.map((x) => x.date))].filter((d) => d >= mon && d <= now).map((d) => days[d] ?? (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${mon}T00:00:00Z`)) / 86400000),
        );
        const open = profile.trainingDays.findIndex((d) => d >= weekday && !(doneW.has(d) && d !== weekday));
        const upcoming = open >= 0 ? open : profile.trainingDays.findIndex((d) => d >= weekday);
        setDay((d) => (picked.current ? Math.min(d, profile.daysPerWeek - 1) : upcoming >= 0 ? upcoming : 0));
      })();
    }, [db, profile]),
  );
  const picked = useRef(false);

  const paths = useMemo(() => (plan ? recordPaths(history, plan.posterior, today) : []), [plan, history, today]);

  useEffect(() => {
    if (!profile?.showStreaks || !paths.length) return;
    const fresh = newAwards(paths, history, today, profile.awardedRecords);
    if (fresh.length) update({ ...profile, awardedRecords: [...profile.awardedRecords, ...fresh] });
  }, [paths, history, today, profile, update]);

  useEffect(() => {
    if (!plan || !profile) return;
    const missed = missedSessions(history, profile, today)?.missed.length ?? 0;
    scheduleReminders(reminderSchedule(profile, plan.sessions, new Date(), history.some((s) => s.date === today), missed));
  }, [plan, profile, history, today]);

  if (!plan || !profile) return <Screen title="This week">{null}</Screen>;
  const returning = history.some((s) => s.date === today) ? null : missedSessions(history, profile, today);
  const block = trainingBlock(history, profile, today, paths, profile.awardedRecords);

  if (swapping) {
    return (
      <Screen title={`Replace ${swapping.name}`} subtitle="Replaced in all workouts. Undo from its card.">
        <TextAction title="Cancel" onPress={() => setSwapping(null)} />
        <TextAction
          title={`Exclude ${swapping.name}`}
          onPress={() => {
            update({ ...profile, excludedExercises: [...new Set([...profile.excludedExercises, swapping.exerciseId])], lockedExercises: profile.lockedExercises.filter((x) => x !== swapping.exerciseId) });
            setSwapping(null);
          }}
        />
        <ExercisePicker
          options={swapOptions(swapping.exerciseId, profile)}
          onPick={(e) => {
            update(applySwap(profile, swapping.exerciseId, e.id));
            setSwapNote(`Replaced with ${e.name}. Tap "Back to ${swapping.name}" to undo.`);
            setSwapping(null);
          }}
        />
      </Screen>
    );
  }

  const planned0 = plan.sessions[Math.min(day, plan.sessions.length - 1)];
  const adjust = profile.todayAdjust?.date === today ? profile.todayAdjust : null;
  const todayWeekday = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const monday = addDays(today, -todayWeekday);
  const counted = new Set(sessionDates(history));
  const planDayOf = new Map<number, { date: string; counted: boolean }>();
  for (const d of [...new Set(history.map((h) => h.date))].filter((d) => d >= monday && d <= today).sort()) {
    const w = sessionDays[d] ?? (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 86400000;
    const prev = planDayOf.get(w);
    planDayOf.set(w, { date: d, counted: (prev?.counted ?? false) || counted.has(d) });
  }
  const doneOn = planDayOf.get(planned0.weekday)?.date;
  const doneToday = !!doneOn;
  const session = adjust && !doneToday ? adjustSession(planned0, adjust) : { ...planned0, note: null };
  const usualMinutes = minutesFor(profile, planned0.weekday);
  const setAdjust = (next: { minutes?: number; lighter?: boolean }) => {
    const merged = { ...(adjust ?? {}), ...next, date: today };
    update({ ...profile, todayAdjust: merged.minutes || merged.lighter ? merged : undefined });
  };
  const nextSession =
    plan.sessions.find((s) => s.weekday >= todayWeekday && !planDayOf.has(s.weekday)) ?? plan.sessions.find((s) => !planDayOf.has(s.weekday)) ?? plan.sessions[0];
  const nextTitle = `${nextSession.title}, ${nextSession.weekday > todayWeekday ? '' : 'next '}${WEEKDAYS[nextSession.weekday]}`;
  const streakNow = consistency(history, profile, today);
  const thisPeriod = streakNow.weeks[streakNow.weeks.length - 1];
  const span = profile.periodWeeks === 2 ? 'two-week period' : 'week';
  const planned = profile.daysPerWeek * (profile.periodWeeks === 2 ? 2 : 1);
  const weekLine =
    `Streak: ${streakNow.streak} ${span}${streakNow.streak === 1 ? '' : 's'}. ` +
    (thisPeriod.status === 'kept'
      ? `This ${span} counts.`
      : `${span === 'week' ? 'Weekly' : '2-week'} goal: ${thisPeriod.needed < planned ? `${thisPeriod.needed} of your ${planned} planned workouts` : `all ${planned} planned workouts`}, ${thisPeriod.done} done.`);
  const lastSetOf = (id: string) => {
    const last = [...history].reverse().find((h) => h.exerciseId === id);
    return last ? `${formatLoad(last.weightKg, profile.unit)} ${profile.unit} × ${last.reps}${last.rpe !== null ? ` @${last.rpe}` : ''}` : undefined;
  };
  const warmups = session.exercises.reduce((n, e) => n + e.warmups.length, 0);
  const slots = profile.trainingDays;
  const doneDays = new Set([...planDayOf].filter(([, v]) => v.counted).map(([w]) => w));
  const partDays = new Set([...planDayOf].filter(([, v]) => !v.counted).map(([w]) => w));
  const mat = COMBAT_SPORTS.includes(profile.sport) ? profile.matDays : [];
  const certainty = (s: Plan['sessions'][number]) => {
    const dots = s.exercises.flatMap((e) => {
      const sd = logSdOf(e);
      return sd === null ? [] : [dotsWithData(sd, e.sessionsOfData)];
    });
    return dots.length ? (dots.reduce((a, b) => a + b, 0) / dots.length - 1) / 4 : 0;
  };

  const open = (index: number) =>
    router.push({
      pathname: '/log',
      params: { session: JSON.stringify(prescriptionsFor(profile, session)), title: session.title, index: String(index), at: String(Date.now()), weekday: String(session.weekday) },
    });

  return (
    <Screen
      title="This week"
      subtitle={`${plan.sport === 'general' ? (GOAL_OPTIONS.find((g) => g.value === profile.goal)?.label ?? 'General') : SPORT_PROFILES[plan.sport].label}, ${plan.sessions.length} workouts${Object.keys(profile.dayMinutes).length ? '' : ` of ${profile.sessionMinutes} min`}${block ? `. Week ${block.week} of ${BLOCK_WEEKS}` : ''}`}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.week} accessibilityRole="tablist">
          {WEEKDAYS.map((wd, i) => {
            const index = slots.indexOf(i);
            const s = index >= 0 ? plan.sessions[index] : null;
            const selected = index === day;
            const onMat = mat.includes(i);
            const fg = selected ? { color: theme.background } : undefined;
            return (
              <Pressable
                key={wd}
                disabled={!s}
                accessibilityRole="tab"
                aria-selected={selected}
                accessibilityLabel={`${wd}: ${s ? s.title : 'rest'}${doneDays.has(i) ? ', done' : partDays.has(i) ? ', logged, not yet counted' : ''}${onMat ? ', sport practice' : ''}`}
                onPress={() => {
                  if (!s) return;
                  picked.current = true;
                  setDay(index);
                }}
                style={[styles.cell, s ? controlStyle(theme, selected) : styles.restCell]}>
                <ThemedText type="caption" themeColor="steel" style={fg}>
                  {wd}
                </ThemedText>
                {s ? (
                  <>
                    <ThemedText type="smallBold" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={fg}>
                      {s.title.split(' ')[0]}
                    </ThemedText>
                    <BracketGlyph certainty={certainty(s)} inverted={selected} />
                  </>
                ) : !onMat ? (
                  <ThemedText type="caption" themeColor="steel">
                    Rest
                  </ThemedText>
                ) : null}
                <View style={styles.dayMark}>
                  {doneDays.has(i) ? (
                    <Icon name="check" size={16} color={selected ? theme.background : theme.done} />
                  ) : partDays.has(i) ? (
                    <Icon name="partial" size={8} color={selected ? theme.background : theme.steel} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {!profile.introSeen ? (
          <View style={[styles.intro, { borderColor: theme.text }]}>
            <ThemedText type="smallBold">How it works</ThemedText>
            <ThemedText type="small">
              {history.length ? '1. Weights are estimated from your lifts, or population.' : '1. Weights start as a first guess.'} Sets calibrate the estimate.
            </ThemedText>
            <ThemedText type="small">2. Log each set and how hard it felt.</ThemedText>
            <View style={styles.loadLine}>
              <ThemedText type="small" style={styles.flex}>
                3. The bracket is your likely weight range. It refines with more logs.
              </ThemedText>
              <BracketGlyph certainty={0.25} />
            </View>
            <Button title="Got it" variant="secondary" onPress={() => update({ ...profile, introSeen: true })} />
          </View>
        ) : null}
        {profile.showStreaks ? (
          <ThemedText type="small" accessibilityRole="summary">
            {weekLine}
          </ThemedText>
        ) : null}
        {returning ? (
          <ThemedText type="smallBold" accessibilityRole="alert">
            {welcomeBack(returning)}
          </ThemedText>
        ) : null}
        {block?.previous ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Block {block.number - 1} done. A fresh block starts this week.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {block.previous.sessions} {block.previous.sessions === 1 ? 'workout' : 'workouts'} ({block.previous.target} needed for the streak)
              {block.previous.records ? `, ${block.previous.records} strength ${block.previous.records === 1 ? 'record' : 'records'}` : ''}.
            </ThemedText>
            {block.previous.lifts.map((l) => (
              <ThemedText key={l.exerciseId} type="caption" themeColor="textSecondary">
                {EXERCISES_BY_ID[l.exerciseId]?.name ?? l.exerciseId}: estimated max {formatLoad(l.fromKg, profile.unit)} → {formatLoad(l.toKg, profile.unit)} {profile.unit}
              </ThemedText>
            ))}
          </View>
        ) : null}

        {swapNote ? (
          <ThemedText type="smallBold" accessibilityRole="alert">
            {swapNote}
          </ThemedText>
        ) : null}
        <View style={styles.section}>
          <View style={styles.sessionHead}>
            <ThemedText type="heading">{session.title}</ThemedText>
            <ThemedText type="numSmall" themeColor="textSecondary">
              {session.totalSets} sets
              {warmups > 0 ? ` + ${warmups} warm-up` : ''}, about {session.estimatedMinutes} min
            </ThemedText>
          </View>
          {!doneToday ? (
            <ThemedText type="smallBold">
              {session.weekday === todayWeekday
                ? "Today's workout."
                : session.weekday > todayWeekday
                  ? `${slots.includes(todayWeekday) ? '' : 'Today is a rest day. '}Planned for ${WEEKDAYS[session.weekday]}. You can do it today instead.`
                  : `Planned for ${WEEKDAYS[session.weekday]}, not done yet. You can still do it today.`}
            </ThemedText>
          ) : null}
          {doneToday ? (
            <>
              <ThemedText type="smallBold">
                Done {doneOn === today ? 'today' : WEEKDAYS[(Date.parse(`${doneOn}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 86400000]}. Next: {nextTitle}.
              </ThemedText>
              <Button title="Open again" variant="secondary" onPress={() => open(0)} />
            </>
          ) : (
            <>
              {session.note ? <ThemedText type="small">{session.note}</ThemedText> : null}
              <Button title={session.weekday === todayWeekday ? `Start ${session.title}` : `Start ${session.title} today`} onPress={() => open(0)} />
              <TextAction title={adjusting ? 'Done changing' : 'Change today: less time or lighter'} onPress={() => setAdjusting(!adjusting)} />
              {adjusting ? (
                <View style={styles.adjust}>
                  <Segmented
                    label="Time today"
                    value={adjust?.minutes ?? 0}
                    options={[{ value: 0, label: `Usual (${usualMinutes})` }, ...[20, 30, 45, 60, 75, 90, 120].filter((m) => m < usualMinutes).map((m) => ({ value: m, label: `${m} min` }))]}
                    onChange={(m) => setAdjust({ minutes: m || undefined })}
                  />
                  <Segmented
                    label="Effort today"
                    value={adjust?.lighter ? 'lighter' : 'usual'}
                    options={[{ value: 'usual', label: 'Usual' }, { value: 'lighter', label: 'Lighter' }]}
                    onChange={(v) => setAdjust({ lighter: v === 'lighter' || undefined })}
                  />
                  <ThemedText type="caption" themeColor="steel">
                    Lighter keeps the weights and effort, with about a third fewer sets. Back to the usual plan tomorrow.
                  </ThemedText>
                </View>
              ) : null}
            </>
          )}
          <View style={[styles.loadLine, styles.legend]}>
            <BracketGlyph certainty={0.25} />
            <ThemedText type="caption" themeColor="steel">
              likely range: narrower is surer
            </ThemedText>
          </View>
          {session.adjustments.map((a) => (
            <ThemedText key={a} type="small" themeColor="textSecondary">
              {a}
            </ThemedText>
          ))}
          {session.exercises.map((e, i) => {
            const from = Object.entries(profile.swaps).find(([, to]) => to === e.exerciseId)?.[0];
            return (
              <ExerciseRow
                key={e.exerciseId}
                index={i}
                exercise={e}
                unit={profile.unit}
                onOpen={doneToday ? undefined : () => open(i)}
                onSwap={() => setSwapping(e)}
                swappedFrom={from ? EXERCISES_BY_ID[from]?.name ?? from : undefined}
                lastSet={lastSetOf(e.exerciseId)}
                simple={displayMode(profile) === 'simple'}
                onUndoSwap={
                  from
                    ? () => {
                      const swaps = { ...profile.swaps };
                      delete swaps[from];
                      update({ ...profile, swaps });
                    }
                    : undefined
                }
              />
            );
          })}
        </View>

        <Consistency profile={profile} history={history} today={today} plan={plan} paths={paths} onChange={update} />

        {plan.notes.length > 0 ? (
          <View style={styles.section}>
            {plan.notes.map((n) => (
              <ThemedText key={n} type="small" themeColor="textSecondary">
                {n}
              </ThemedText>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ExerciseRow({
  index,
  exercise: e,
  unit,
  onOpen,
  onSwap,
  swappedFrom,
  onUndoSwap,
  lastSet,
  simple,
}: {
  index: number;
  exercise: PlannedExercise;
  unit: Unit;
  onOpen?: () => void;
  onSwap: () => void;
  swappedFrom?: string;
  onUndoSwap?: () => void;
  lastSet?: string;
  simple: boolean;
}) {
  const theme = useTheme();
  const hasLoad = e.loadKg !== null && e.loadLow !== null && e.loadHigh !== null;
  const [load, low, high] = hasLoad ? [e.loadKg!, e.loadLow!, e.loadHigh!].map((x) => Math.round(toUnit(x, unit) * 10) / 10) : [0, 0, 0];
  const f = (x: number) => formatLoad(fromUnit(x, unit), unit);
  const starting = e.loadSource === 'population' || e.loadSource === 'analogy' || e.loadSource === 'convention';
  const rpe = rpeFor(e.targetRir);
  const each = e.equipment.find((k) => EQUIPMENT_INFO[k].loaded) === 'dumbbells' ? ' each' : '';
  const flags = [e.locked ? 'Locked' : '', e.reentryWeeks ? `Back after ${e.reentryWeeks} weeks, lighter` : '', e.checkIn ? 'Check-in set' : ''].filter(Boolean).join(' – ');
  const source = e.power
    ? 'Maximal intent'
    : !hasLoad
      ? e.loadSource === 'bodyweight' ? 'Bodyweight' : lastSet ? `Last: ${lastSet}` : 'No estimate yet'
      : e.emptyBar
        ? `The ${f(load)} ${unit} bar may feel heavy: replace it if so`
        : e.cappedByMax
          ? "Your equipment's max"
          : starting
            ? `${simple ? 'Low' : 'Conservative'} estimate${e.liftMoreShare ? `: ${e.liftMoreShare >= 0.9 ? '9 in 10' : '4 in 5'} people like you lift more` : ''}`
            : null;
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${e.name}, ${e.sets} sets of ${e.repRange[0]} to ${e.repRange[1]}${e.power ? ', explosive' : `, RPE ${rpe}`}${hasLoad ? `, ${load} ${unit}, likely ${low} to ${high}` : ''}. Open in session.`}
        onPress={onOpen}
        disabled={!onOpen}
        style={({ pressed }) => [styles.cardBody, pressed && { opacity: 0.7 }]}>
        <View style={styles.cardHead}>
          <ThemedText type="smallBold" style={styles.flex}>
            {e.name}
          </ThemedText>
          {hasLoad && !e.power ? (
            <ThemedText type="num" style={styles.display}>
              {f(load)}
              <ThemedText type="numSmall" themeColor="steel">
                {` ${unit}${each}`}
              </ThemedText>
            </ThemedText>
          ) : null}
        </View>
        <View style={[styles.cardHead, styles.wrapRow]}>
          <ThemedText type="numSmall" themeColor="textSecondary" style={styles.scheme}>
            {e.sets} × {e.repRange[0]}–{e.repRange[1]}
            {e.power ? ', explosive, light load' : simple ? `, stop ${e.targetRir} short` : ` at RPE ${rpe}`}
          </ThemedText>
          {source ? (
            <ThemedText type="caption" themeColor="steel" style={styles.source}>
              {source}
            </ThemedText>
          ) : null}
        </View>
        {!e.power && e.loadSource !== 'bodyweight' ? (
          <RangeBar
            low={hasLoad ? toUnit(e.loadLow!, unit) : null}
            value={hasLoad ? load : 1}
            high={hasLoad ? toUnit(e.loadHigh!, unit) : null}
            endLabels={f}
          />
        ) : null}
      </Pressable>
      <View style={styles.swapRow}>
        <View style={[styles.flex, styles.flagRow]}>
          {hasLoad && starting && !e.power ? <FirstGuess /> : null}
          {flags ? (
            <ThemedText type="caption" themeColor="steel" numberOfLines={2} style={styles.flex}>
              {flags}
            </ThemedText>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Replace ${e.name}`} onPress={onSwap} style={[styles.chipButton, { borderColor: theme.backgroundSelected }]}>
          <View style={styles.swapInner}>
            <Icon name="swap" size={18} color={theme.text} />
            <ThemedText type="small">Replace</ThemedText>
          </View>
        </Pressable>
      </View>
      {swappedFrom && onUndoSwap ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Undo replace, back to ${swappedFrom}`} onPress={onUndoSwap} style={[styles.chipButton, styles.undoSwap, { borderColor: theme.backgroundSelected }]}>
          <ThemedText type="small" numberOfLines={1}>
            Back to {swappedFrom}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  adjust: { gap: Spacing.two },
  content: { gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  flex: { flex: 1 },
  week: { flexDirection: 'row', gap: 2 },
  cell: {
    flex: 1,
    minHeight: 80,
    paddingVertical: Spacing.two,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Radius.button,
  },
  sessionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: Spacing.two },
  tableHead: { flexDirection: 'row', paddingHorizontal: Spacing.two, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two, minHeight: 64 },
  restCell: { borderWidth: 1.5, borderColor: 'transparent' },
  dayMark: { height: 16, alignItems: 'center', justifyContent: 'center' },
  display: { fontFamily: Fonts.compressed, fontSize: 30, lineHeight: 34 },
  rx: { alignItems: 'flex-end', gap: 2 },
  loadLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swap: { alignSelf: 'flex-start', paddingTop: Spacing.one },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: Radius.button, padding: Spacing.three, gap: Spacing.two },
  cardBody: { gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  wrapRow: { flexWrap: 'wrap', columnGap: Spacing.three, rowGap: 2 },
  scheme: { flexGrow: 1 },
  source: { flexShrink: 1 },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  swapInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  undoSwap: { alignSelf: 'flex-end', maxWidth: '100%' },
  chipButton: { minHeight: 40, paddingHorizontal: Spacing.three, borderWidth: 1, borderRadius: Radius.button, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  legend: { justifyContent: 'flex-end', paddingHorizontal: Spacing.two, paddingLeft: Spacing.three },
  intro: { borderWidth: 1.5, borderRadius: Radius.button, padding: Spacing.three, gap: Spacing.two },
});
