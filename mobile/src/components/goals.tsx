import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useBand } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, TextAction } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number-field';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import type { LoggedSet } from '@/domain/dose';
import { addDays, adherence, goalFixes, goalForecast, goalReached, goalTargetProblem, MAX_GOAL_WEEKS, weeksUntil, type GoalFix, type GoalForecast } from '@/domain/engagement';
import { EXERCISES_BY_ID } from '@/domain/exercises';
import { COMPETITION_LIFTS, type Plan } from '@/domain/generator';
import { loadLimitKg } from '@/domain/plausibility';
import type { LiftGoal, Profile } from '@/domain/profile';
import { ADDED_WEIGHT_LIFTS, liftsWithProgress } from '@/domain/progress';
import { formatLoad, fromUnit, roundLoad, toUnit, type Unit } from '@/domain/units';
import { useTheme } from '@/hooks/use-theme';
import { choiceStyle, controlStyle } from '@/components/ui/control';
import { RangeBar } from '@/components/ui/bracket';
import { dateLocale } from '@/i18n';

const HORIZONS = [4, 8, 12, 16, 26];
const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString(dateLocale(), {
    day: 'numeric',
    month: 'short',
    year: d.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric',
    timeZone: 'UTC',
  });
const UNLIKELY = 6;

function Likely({ forecast, unit }: { forecast: GoalForecast; unit: Unit }) {
  return (
    <ThemedText type="caption" themeColor="textSecondary">
      Most likely by then: {Math.round(toUnit(forecast.dots[5], unit))}–{Math.round(toUnit(forecast.dots[14], unit))} {unit}. A target in that range is realistic.
    </ThemedText>
  );
}

const odds = (n: number) => (n === 0 ? 'an under 1 in 20' : n === 20 ? 'an over 19 in 20' : `${n === 8 || n === 11 || n === 18 ? 'an' : 'a'} ${n} in 20 (${n * 5}%)`);

function Fixes({ fixes, unit, today, onApply }: { fixes: GoalFix[]; unit: Unit; today: string; onApply: (f: GoalFix) => void }) {
  const theme = useTheme();
  if (!fixes.length) return null;
  const label = (f: GoalFix) =>
    f.kind === 'later'
      ? `By ${fmtDate(addDays(today, 7 * f.weeks))} – ${odds(f.reaching)} chance`
      : f.kind === 'lower'
        ? `${formatLoad(f.targetKg, unit)} ${unit} – ${odds(f.reaching)} chance`
        : `Every planned workout – ${odds(f.reaching)} chance`;
  return (
    <View style={styles.fixes}>
      <ThemedText type="caption" themeColor="textSecondary">
        Try:
      </ThemedText>
      {fixes.map((f) =>
        f.kind === 'sessions' ? (
          <ThemedText key={f.kind} type="caption" themeColor="textSecondary">
            {label(f)}
          </ThemedText>
        ) : (
          <Pressable key={f.kind} accessibilityRole="button" accessibilityLabel={label(f)} onPress={() => onApply(f)} style={[styles.chip, controlStyle(theme, false)]}>
            <ThemedText type="small">{label(f)}</ThemedText>
          </Pressable>
        ),
      )}
    </View>
  );
}

export function Goals({ profile, plan, history, today, onChange }: { profile: Profile; plan: Plan; history: LoggedSet[]; today: string; onChange: (next: Profile) => void }) {
  const theme = useTheme();
  const band = useBand();
  const unit = profile.unit;
  const stepKg = unit === 'kg' ? 2.5 : fromUnit(5, 'lb');
  const [adding, setAdding] = useState(false);
  const fromLogs = useCallback(
    (id: string) => {
      const s = EXERCISES_BY_ID[id] && !ADDED_WEIGHT_LIFTS.has(id) ? plan.strengthOf(id) : null;
      return s && (s.source === 'model' || s.source === 'log') ? s : null;
    },
    [plan],
  );
  const candidates = useMemo(
    () => [...new Set([...COMPETITION_LIFTS, ...liftsWithProgress(history, profile.bodyweightKg, 1)])].filter((id) => fromLogs(id)).slice(0, 8),
    [history, profile.bodyweightKg, fromLogs],
  );
  const [lift, setLift] = useState<string | null>(null);
  const chosen = lift ?? candidates[0] ?? null;
  const [weeks, setWeeks] = useState(12);
  const [target, setTarget] = useState<number | undefined>(undefined);
  const nowKg = useCallback((id: string) => {
    const s = fromLogs(id);
    return s ? Math.exp(s.mean) : null;
  }, [fromLogs]);
  const roundStep = unit === 'kg' ? 2.5 : 5;
  const whole = (kg: number) => String(Math.round(toUnit(kg, unit)));
  const suggested = (id: string) => {
    const n = nowKg(id);
    return n ? Math.ceil(toUnit(n * 1.05, unit) / roundStep) * roundStep : undefined;
  };
  const targetShown = chosen ? (target ?? suggested(chosen)) : undefined;
  const targetKg = targetShown !== undefined ? fromUnit(targetShown, unit) : undefined;
  const rate = useMemo(() => adherence(history, profile, today), [history, profile, today]);
  const days = profile.daysPerWeek;

  const forecastFor = useCallback(
    (exerciseId: string, kg: number, w: number, a: number = rate): GoalForecast | null | undefined => {
      const s = fromLogs(exerciseId);
      return s ? goalForecast(plan.posterior, exerciseId, s, plan.effectiveDose, w, kg, a, 7, 0, days) : undefined;
    },
    [plan, rate, days, fromLogs],
  );
  const fixesFor = useCallback(
    (exerciseId: string, kg: number, w: number) => goalFixes((t, h, a) => forecastFor(exerciseId, t, h, a), kg, w, rate, nowKg(exerciseId), stepKg, HORIZONS),
    [forecastFor, rate, stepKg, nowKg],
  );

  const problem = chosen && targetKg !== undefined ? goalTargetProblem(targetKg, nowKg(chosen), loadLimitKg(chosen)) : null;
  const preview = useMemo(
    () => (adding && chosen && targetKg !== undefined && !problem ? forecastFor(chosen, targetKg, weeks) : undefined),
    [adding, chosen, targetKg, weeks, problem, forecastFor],
  );
  const previewFixes = useMemo(
    () => (preview && preview.reaching <= UNLIKELY && chosen && targetKg !== undefined ? fixesFor(chosen, targetKg, weeks) : []),
    [preview, chosen, targetKg, weeks, fixesFor],
  );

  const views = useMemo(
    () =>
      profile.goals.map((g) => {
        const reached = goalReached(g, plan.strengthOf(g.exerciseId), history);
        const left = weeksUntil(today, g.byDate);
        const f = reached || left === 0 || left > MAX_GOAL_WEEKS ? undefined : forecastFor(g.exerciseId, g.targetKg, left);
        const ended = !reached && left === 0;
        const fixes = ended ? fixesFor(g.exerciseId, g.targetKg, 8) : f && f.reaching <= UNLIKELY ? fixesFor(g.exerciseId, g.targetKg, left) : [];
        return { g, reached, left, f, ended, fixes };
      }),
    [profile.goals, plan, history, today, forecastFor, fixesFor],
  );

  const save = () => {
    if (!chosen || targetKg === undefined || problem) return;
    const goal: LiftGoal = { id: `goal-${Date.now()}`, exerciseId: chosen, targetKg, byDate: addDays(today, 7 * weeks), createdOn: today };
    onChange({ ...profile, goals: [...profile.goals, goal] });
    setAdding(false);
    setTarget(undefined);
  };
  const applyToGoal = (g: LiftGoal, f: GoalFix) =>
    onChange({
      ...profile,
      goals: profile.goals.map((x) => {
        if (x.id !== g.id) return x;
        if (f.kind === 'later') return { ...x, byDate: addDays(today, 7 * f.weeks) };
        if (f.kind === 'lower') return { ...x, targetKg: f.targetKg, byDate: x.byDate > today ? x.byDate : addDays(today, 7 * 8) };
        return x;
      }),
    });
  const applyToForm = (f: GoalFix) => {
    if (f.kind === 'later') setWeeks(f.weeks);
    if (f.kind === 'lower') setTarget(roundLoad(f.targetKg, unit));
  };

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Goals</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary">
        Tracked with odds. A goal does not change your plan.
      </ThemedText>
      {views.map(({ g, reached, left, f, ended, fixes }, i) => (
        <View key={g.id} style={[styles.goal, band(i)]}>
          <View style={styles.goalHead}>
            <ThemedText style={styles.flex}>
              {EXERCISES_BY_ID[g.exerciseId]?.name ?? g.exerciseId}: {formatLoad(g.targetKg, unit)} {unit}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              by {fmtDate(g.byDate)}
            </ThemedText>
            <TextAction title="Remove" onPress={() => onChange({ ...profile, goals: profile.goals.filter((x) => x.id !== g.id) })} />
          </View>
          {reached ? (
            <ThemedText type="small">{reached.date ? `Reached ${fmtDate(reached.date)} with a single.` : `Reached: estimated 1RM ${formatLoad(reached.kg, unit)} ${unit}.`}</ThemedText>
          ) : ended ? (
            <ThemedText type="small">Ended without reaching it.</ThemedText>
          ) : f ? (
            <ThemedText type="small">
              About {odds(f.reaching)} chance{f.reaching <= UNLIKELY ? ': unlikely as it stands.' : '.'}
            </ThemedText>
          ) : (
            <ThemedText type="caption" themeColor="textSecondary">
              {f === null ? 'Odds appear once the model settles. Keep logging.' : left > MAX_GOAL_WEEKS ? `Odds appear ${MAX_GOAL_WEEKS} weeks before the date.` : 'Log this lift for a few weeks to see odds.'}
            </ThemedText>
          )}
          <Fixes fixes={fixes} unit={unit} today={today} onApply={(fx) => applyToGoal(g, fx)} />
          {f && f.reaching <= UNLIKELY && fixes.length === 0 ? <Likely forecast={f} unit={unit} /> : null}
        </View>
      ))}

      {candidates.length === 0 && !adding ? (
        <View style={styles.form} accessible accessibilityLabel="Goals open once you have logged a lift">
          <ThemedText type="small" themeColor="textSecondary">
            Log any lift once to set goals.
          </ThemedText>
        </View>
      ) : adding ? (
        <View style={styles.form}>
          {!chosen ? (
            <ThemedText type="small" themeColor="textSecondary">
              Log a lift for a few weeks first. The odds need your own data.
            </ThemedText>
          ) : (
            <>
              <ThemedText type="caption" themeColor="textSecondary">
                Lifts with your own numbers (logged, or entered at setup). Log another lift to set a goal for it.
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {candidates.map((id) => (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    aria-checked={id === chosen}
                    accessibilityLabel={EXERCISES_BY_ID[id].name}
                    onPress={() => {
                      setLift(id);
                      setTarget(undefined);
                    }}
                    style={[styles.chip, choiceStyle(theme, id === chosen)]}>
                    <ThemedText type="small" >
                      {EXERCISES_BY_ID[id].name}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.row}>
                <NumberField label="Target max (1 rep)" unit={unit} min={1} max={Math.floor(toUnit(loadLimitKg(chosen), unit))} value={targetShown} onCommit={(v) => setTarget(v)} />
                {nowKg(chosen) ? (
                  <View style={styles.flex}>
                    <ThemedText type="caption" themeColor="textSecondary">
                      Your max now: about {whole(nowKg(chosen)!)} {unit} (likely {whole(Math.exp(fromLogs(chosen)!.mean - fromLogs(chosen)!.sd))}–{whole(Math.exp(fromLogs(chosen)!.mean + fromLogs(chosen)!.sd))})
                    </ThemedText>
                    <RangeBar low={Math.exp(fromLogs(chosen)!.mean - fromLogs(chosen)!.sd)} value={nowKg(chosen)!} high={Math.exp(fromLogs(chosen)!.mean + fromLogs(chosen)!.sd)} />
                  </View>
                ) : null}
              </View>
              <Segmented label="By" mono value={weeks} onChange={setWeeks} options={HORIZONS.map((w) => ({ value: w, label: `${w}w` }))} />
              {problem ? (
                <ThemedText type="small" accessibilityRole="alert">
                  {problem === 'below' ? 'You are already about there. Pick a higher target.' : 'Beyond any record for this lift.'}
                </ThemedText>
              ) : preview ? (
                <>
                  <ThemedText type="small">
                    About {odds(preview.reaching)} chance by {fmtDate(addDays(today, 7 * weeks))}.
                  </ThemedText>
                  <Fixes fixes={previewFixes} unit={unit} today={today} onApply={applyToForm} />
                  {preview.reaching <= UNLIKELY && previewFixes.length === 0 ? <Likely forecast={preview} unit={unit} /> : null}
                </>
              ) : preview === null ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  Odds appear once the model settles. Keep logging.
                </ThemedText>
              ) : null}
              <Button title="Save goal" onPress={save} disabled={targetKg === undefined || !!problem} />
            </>
          )}
          <TextAction title="Cancel" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Button title="Set a goal" variant="secondary" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  goal: { padding: Spacing.two, gap: Spacing.two },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  form: { gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: { minHeight: 40, paddingHorizontal: Spacing.three, borderRadius: 6, justifyContent: 'center' },
  fixes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
});
