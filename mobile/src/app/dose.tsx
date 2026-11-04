import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as RawSvgText, type TextProps as SvgTextProps } from 'react-native-svg';

import { Goals } from '@/components/goals';
import { ModelSection, ProteinSection } from '@/components/model-summary';
import { localToday, Screen, useBand } from '@/components/screen';
import { BodyweightLog } from '@/components/bodyweight-log';
import { MuscleMap } from '@/components/muscle-map';
import { ThemedText } from '@/components/themed-text';
import { Info } from '@/components/ui/info';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { getSets, getWeekFreeze, SETUP_RAW_NAME, type StoredSet } from '@/db/database';
import { weeklyDose, type LoggedSet, type WeeklyDose } from '@/domain/dose';
import { EXERCISES_BY_ID, INDIRECT_SET_WEIGHT, MUSCLE_LABELS, MUSCLES } from '@/domain/exercises';
import { COMPETITION_LIFTS, type Plan } from '@/domain/generator';
import { fitSeries, liftPaths, PRIORS, quantileDots, windowedSeries, type LiftPath } from '@/domain/model';
import { displayMode, type Profile } from '@/domain/profile';
import { ADDED_WEIGHT_LIFTS, liftsWithProgress, progressSeries } from '@/domain/progress';
import { absoluteRecord, STREETLIFTING_RECORDS, STREETLIFTING_SOURCE, worldRecord } from '@/domain/records';
import { formatLoad, toUnit, type Unit } from '@/domain/units';
import { useTheme } from '@/hooks/use-theme';
import { cachedPlan } from '@/state/plan-cache';
import { useProfile } from '@/state/profile-context';
import { adherence, goalForecast, roomToGrowSettled } from '@/domain/engagement';
import { Uncertain } from '@/components/ui/uncertain';
import { choiceStyle } from '@/components/ui/control';
import { dateLocale, t } from '@/i18n';

const SCALE_MIN = 6;
const CHART_H = 180;
const DOT_STEPS: Record<Unit, number[]> = { kg: [5, 2.5, 1, 0.5, 0.25], lb: [10, 5, 2.5, 1, 0.5] };

export default function ProgressScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [weeks, setWeeks] = useState<WeeklyDose[]>([]);
  const [selected, setSelected] = useState(0);
  const [paths, setPaths] = useState<LiftPath[]>([]);
  const [lift, setLift] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const { profile, update } = useProfile();
  const [plan, setPlan] = useState<Plan | null>(null);
  const e1rm = plan?.competitionE1rm ?? {};
  const [history, setHistory] = useState<LoggedSet[]>([]);
  const unit = profile?.unit ?? 'kg';

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      getSets(db).then((sets) => {
        setHistory(sets);
        setWeeks(weeklyDose(sets).reverse());
        setSelected(0);
        const series = windowedSeries(sets, localToday());
        const post = fitSeries(series, profile.experience, { sex: profile.sex });
        setPaths(liftPaths(series, post));
        setLift((l) => Math.min(l, Math.max(0, series.length - 1)));
        getWeekFreeze(db).then((freeze) => setPlan(cachedPlan(profile, sets, localToday(), freeze)));
      });
    }, [db, profile]),
  );

  const week = weeks[selected];
  const scaleMax = Math.max(SCALE_MIN, ...(week ? MUSCLES.map((m) => week.muscles[m].fractionalSets) : []), ...(plan ? MUSCLES.map((m) => plan.targets[m]) : [])) * 1.15;
  const path = paths[lift];

  const simple = profile ? displayMode(profile) === 'simple' : false;
  const learned = plan ? <ModelSection model={plan.model} settled={roomToGrowSettled(plan.model.potentialPct, plan.posterior.ess)} /> : null;
  const weekMax = week ? Math.max(...MUSCLES.map((m) => week.muscles[m].fractionalSets)) : 0;
  const mapShade = Object.fromEntries(
    MUSCLES.map((m) => {
      const v = week?.muscles[m].fractionalSets ?? 0;
      const target = selected === 0 ? (plan?.targets[m] ?? 0) : 0;
      return [m, target > 0 ? v / target : weekMax > 0 ? v / weekMax : 0];
    }),
  );
  const weeklySets = (
    <View style={styles.section}>
      <ThemedText type="smallBold">Weekly sets per muscle</ThemedText>
      {!week ? (
        <ThemedText type="small" themeColor="textSecondary">
          Log a session or import a CSV to see your weekly volume.
        </ThemedText>
      ) : (
        <>
          <View style={styles.weekNav}>
            <Pressable accessibilityRole="button" disabled={selected >= weeks.length - 1} onPress={() => setSelected(selected + 1)} hitSlop={12}>
              <ThemedText type="small" themeColor={selected >= weeks.length - 1 ? 'steel' : 'link'} style={styles.underline}>
                Earlier
              </ThemedText>
            </Pressable>
            <ThemedText type="numSmall" themeColor="textSecondary">
              week of {week.week}
            </ThemedText>
            <Pressable accessibilityRole="button" disabled={selected === 0} onPress={() => setSelected(selected - 1)} hitSlop={12}>
              <ThemedText type="small" themeColor={selected === 0 ? 'steel' : 'link'} style={styles.underline}>
                Later
              </ThemedText>
            </Pressable>
          </View>
          <MuscleMap shade={mapShade} />
          <ThemedText type="caption" themeColor="steel" style={styles.mapCaption}>
            {selected === 0 && plan ? 'Stronger colour: closer to this week’s target. Full colour: target reached.' : 'Stronger colour: more sets that week.'}
          </ThemedText>
          {MUSCLES.map((m, i) => {
            const v = week.muscles[m].fractionalSets;
            return (
              <View key={m} style={styles.row} accessibilityLabel={`${MUSCLE_LABELS[m]}: ${v} of ${plan?.targets[m] ?? 0} target sets`}>
                <ThemedText type="small" style={styles.label}>
                  {MUSCLE_LABELS[m]}
                </ThemedText>
                <View style={[styles.track, { backgroundColor: theme.interval }]}>
                  <View style={[styles.bar, { backgroundColor: theme.text, width: `${Math.min(100, (v / scaleMax) * 100)}%` }]} />
                  {selected === 0 && plan && plan.targets[m] > 0 ? (
                    <View style={[styles.target, { left: `${Math.min(100, (plan.targets[m] / scaleMax) * 100)}%`, backgroundColor: theme.bracket }]} />
                  ) : null}
                </View>
                <ThemedText type="numSmall" style={styles.value}>
                  {v % 1 === 0 ? v : v.toFixed(1)}
                  {selected === 0 && plan && plan.targets[m] > 0 ? (
                    <ThemedText type="numSmall" themeColor="steel">{` / ${Math.round(plan.targets[m])}`}</ThemedText>
                  ) : null}
                </ThemedText>
              </View>
            );
          })}
          <ThemedText type="caption" themeColor="textSecondary">
            Mark: this week&apos;s target. A muscle that only helps in a lift counts {INDIRECT_SET_WEIGHT} of a set, so totals can have decimals.
          </ThemedText>
        </>
      )}
    </View>
  );

  return (
    <Screen
      title="Progress">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {plan && plan.model.lifts > 0 ? (
          <ThemedText type="smallBold">
            From your logs on {plan.model.lifts} {plan.model.lifts === 1 ? 'lift' : 'lifts'}. Ranges narrow as you log sets.
          </ThemedText>
        ) : null}
        {profile ? <ProgressOverTime history={history} profile={profile} plan={plan} /> : null}
        {profile && plan ? <Goals profile={profile} plan={plan} history={history} today={localToday()} onChange={update} /> : null}
        {!simple ? learned : null}
        {profile ? <BodyweightLog profile={profile} update={update} /> : null}
        {profile ? <ProteinSection profile={profile} /> : null}
        {!simple ? weeklySets : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          onPress={() => setShowDetails(!showDetails)}
          style={[styles.detailsToggle, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{showDetails ? 'Hide model details' : 'Model details'}</ThemedText>
          <ThemedText type="caption" themeColor="steel">
            {showDetails ? '' : simple ? 'What the app has learned, weekly sets per muscle, ceiling, week-by-week max, records' : 'Ceiling, weekly sets, week-by-week max, records'}
          </ThemedText>
        </Pressable>
        {showDetails ? (
          <>
            {simple ? learned : null}
            {simple ? weeklySets : null}
            {plan ? <ModelSection part="details" model={plan.model} settled={roomToGrowSettled(plan.model.potentialPct, plan.posterior.ess)} /> : null}
            <View style={styles.section}>
              <ThemedText type="smallBold">Estimated max (heaviest single rep)</ThemedText>
              {paths.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  The week-by-week chart starts once a lift is logged in 3 or more separate weeks. Until then, estimates (as in Goals) come from your
                  logged sets alone, and the band narrows as weeks of logs replace the starting estimate.
                </ThemedText>
              ) : (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {paths.map((p, i) => (
                      <Pressable
                        key={p.exerciseId}
                        accessibilityRole="radio"
                        aria-checked={i === lift}
                        accessibilityLabel={EXERCISES_BY_ID[p.exerciseId]?.name ?? p.exerciseId}
                        onPress={() => setLift(i)}
                        style={[styles.chip, choiceStyle(theme, i === lift)]}>
                        <ThemedText type="small" >
                          {EXERCISES_BY_ID[p.exerciseId]?.name ?? p.exerciseId}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {path ? <LearningChart path={path} unit={unit} /> : null}
                  {path && history.some((h) => h.exerciseId === path.exerciseId && (h as StoredSet).rawName === SETUP_RAW_NAME) ? (
                    <ThemedText type="caption" themeColor="textSecondary">
                      Includes the set you entered at setup, dated last week.
                    </ThemedText>
                  ) : null}
                  {path ? <NextWeekDots path={path} unit={unit} /> : null}
                </>
              )}
            </View>

            {profile ? <Records e1rm={e1rm} profile={profile} history={history} /> : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function LearningChart({ path, unit }: { path: LiftPath; unit: Unit }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const kg = useMemo(() => {
    const u = (logKg: number) => toUnit(Math.exp(logKg), unit);
    const hi = path.mean.map((m, i) => u(m + path.sd[i]));
    const lo = path.mean.map((m, i) => u(m - path.sd[i]));
    const obs = path.observed.filter((v): v is number => v !== null).map(u);
    return { hi, lo, mid: path.mean.map(u), obs: path.observed.map((v) => (v === null ? null : u(v))), min: Math.min(...lo, ...obs), max: Math.max(...hi, ...obs) };
  }, [path, unit]);
  const pad = { l: 8, r: 64, t: 8, b: 20 };
  const n = path.week.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (width - pad.l - pad.r));
  const span = Math.max(1, kg.max - kg.min);
  const y = (v: number) => pad.t + (1 - (v - (kg.min - span * 0.1)) / (span * 1.2)) * (CHART_H - pad.t - pad.b);
  const band = kg.hi.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ') + ' ' + kg.lo.map((_, j) => {
    const i = n - 1 - j;
    return `L${x(i)},${y(kg.lo[i])}`;
  }).join(' ') + ' Z';
  const line = kg.mid.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const last = n - 1;
  const halfWidth = (kg.hi[last] - kg.lo[last]) / 2;
  const first = (kg.hi[0] - kg.lo[0]) / 2;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Estimated 1RM ${kg.mid[last].toFixed(0)} ${unit}, plus or minus ${halfWidth.toFixed(1)}, narrowed from plus or minus ${first.toFixed(1)} over ${n} weeks`}>
      {width > 0 ? (
        <Svg width={width} height={CHART_H}>
          {[0.25, 0.5, 0.75].map((f) => (
            <Line key={f} x1={pad.l} x2={width - pad.r} y1={pad.t + f * (CHART_H - pad.t - pad.b)} y2={pad.t + f * (CHART_H - pad.t - pad.b)} stroke={theme.interval} strokeOpacity={0.6} strokeWidth={1} />
          ))}
          <Path d={band} fill={theme.interval} />
          <Path d={line} stroke={theme.text} strokeWidth={2} fill="none" />
          {kg.obs.map((v, i) => (v === null ? null : <Circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={theme.textSecondary} />))}
          <Path d={`M${x(last) + 10},${y(kg.hi[last])} h-6 V${y(kg.lo[last])} h6`} stroke={theme.accent} strokeWidth={2} fill="none" strokeLinecap="square" />
          <SvgText x={x(last) + 14} y={y(kg.mid[last]) + 4} fill={theme.text} fontFamily={Fonts.semibold} fontSize={14}>
            {`${kg.mid[last].toFixed(0)} ${unit}`}
          </SvgText>
          <SvgText x={x(last) + 14} y={y(kg.mid[last]) + 19} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13}>
            {`±${halfWidth.toFixed(1)}`}
          </SvgText>
          <SvgText x={pad.l} y={CHART_H - 4} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13}>
            Week 0
          </SvgText>
          <SvgText x={width - pad.r} y={CHART_H - 4} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13} textAnchor="end">
            {`Week ${path.week[last]}`}
          </SvgText>
        </Svg>
      ) : null}
      <ThemedText type="caption" themeColor="textSecondary">
        {first - halfWidth >= 0.1
          ? `Likely range narrowed from ±${first.toFixed(1)} to ±${halfWidth.toFixed(1)} ${unit}.`
          : `Likely range ±${halfWidth.toFixed(1)} ${unit}.`}
      </ThemedText>
    </View>
  );
}

function NextWeekDots({ path, unit }: { path: LiftPath; unit: Unit }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const raw = quantileDots(path.next.mean, path.next.sd).map((v) => toUnit(Math.exp(v), unit));
  const spread = raw[raw.length - 1] - raw[0];
  const steps = DOT_STEPS[unit];
  const step = steps.find((st) => spread / st >= 8) ?? steps[steps.length - 1];
  const values = raw.map((v) => Math.round(v / step) * step);
  const bins = new Map<number, number>();
  for (const v of values) bins.set(v, (bins.get(v) ?? 0) + 1);
  const keys = [...bins.keys()].sort((a, b) => a - b);
  const lo = keys[0] - step, hi = keys[keys.length - 1] + step;
  const r = 5;
  const tallest = Math.max(...bins.values());
  const h = tallest * (2 * r + 2) + 22;
  const x = (v: number) => 12 + ((v - lo) / Math.max(1e-6, hi - lo)) * (width - 24);
  return (
    <View style={styles.dotplot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ThemedText type="small">Estimated max next week</ThemedText>
      {width > 0 ? (
        <Svg width={width} height={h} accessibilityLabel={`From ${keys[0]} to ${keys[keys.length - 1]} ${unit}`}>
          {keys.flatMap((k) =>
            Array.from({ length: bins.get(k)! }, (_, j) => (
              <Circle key={`${k}-${j}`} cx={x(k)} cy={h - 22 - r - j * (2 * r + 2)} r={r} fill={theme.interval} stroke={theme.steel} strokeWidth={1} />
            )),
          )}
          <Rect x={0} y={h - 20} width={width} height={1} fill={theme.interval} />
          <SvgText x={x(keys[0])} y={h - 6} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13} textAnchor="middle">
            {`${+keys[0].toFixed(2)}`}
          </SvgText>
          <SvgText x={x(keys[keys.length - 1])} y={h - 6} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13} textAnchor="middle">
            {`${+keys[keys.length - 1].toFixed(2)} ${unit}`}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

const LIFT_NAMES: Record<string, string> = {
  back_squat: 'Squat',
  barbell_bench_press: 'Bench press',
  deadlift: 'Deadlift',
  pull_up: 'Weighted pull-up',
  dip: 'Weighted dip',
};

type RecordRow = {
  id: string;
  you: { mid: number; low: number; high: number };
  women: { kg: number; label: string };
  men: { kg: number; label: string };
  note?: string;
};

function Records({ e1rm, profile, history }: { e1rm: Plan['competitionE1rm']; profile: Profile; history: LoggedSet[] }) {
  const band = useBand();
  const unit = profile.unit;
  const f = (kg: number) => formatLoad(kg, unit);
  const rows: RecordRow[] = [];
  for (const id of COMPETITION_LIFTS) {
    const est = e1rm[id];
    if (!est || est.source !== 'model') continue;
    const women = worldRecord(id, 'female', profile.bodyweightKg);
    const men = worldRecord(id, 'male', profile.bodyweightKg);
    if (!est || !women || !men) continue;
    const aw = absoluteRecord(id, 'female');
    const am = absoluteRecord(id, 'male');
    rows.push({
      id,
      you: { mid: Math.exp(est.mean), low: Math.exp(est.mean - est.sd), high: Math.exp(est.mean + est.sd) },
      women: { kg: women.kg, label: `Women's WR, ${women.weightClass} kg` },
      men: { kg: men.kg, label: `Men's WR, ${men.weightClass} kg` },
      note: `Heaviest in any class: women ${f(aw.kg)} (${aw.weightClass}), men ${f(am.kg)} (${am.weightClass}) ${unit}.`,
    });
  }
  for (const id of ['pull_up', 'dip'] as const) {
    const series = progressSeries(history.slice(-400), id, profile.bodyweightKg).filter((x) => x.e1rmKg > 0);
    if (!series.length) continue;
    const best = Math.max(...series.slice(-8).map((x) => x.e1rmKg));
    const spread = (profile.bodyweightKg + best) * PRIORS.sigmaMedian;
    const r = STREETLIFTING_RECORDS[id];
    rows.push({
      id,
      you: { mid: best, low: Math.max(0, best - spread), high: best + spread },
      women: { kg: r.female, label: "Women's record" },
      men: { kg: r.male, label: "Men's record" },
      note: 'Streetlifting, added weight, any class.',
    });
  }
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Versus world records</ThemedText>
      {rows.map((row, i) => (
        <View key={row.id} style={[styles.recordRow, band(i)]}>
          <RecordScale name={LIFT_NAMES[row.id]} row={row} unit={unit} sex={profile.sex} />
        </View>
      ))}
      <ThemedText type="caption" themeColor="textSecondary">
        Squat, bench and deadlift: IPF classic open records for your bodyweight class, from OpenIPF meet results; official lists can
        differ slightly. Pull-up and dip: {STREETLIFTING_SOURCE}.
      </ThemedText>
    </View>
  );
}

function RecordScale({ name, row, unit, sex }: { name: string; row: RecordRow; unit: Unit; sex: Profile['sex'] }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const u = (kg: number) => toUnit(kg, unit);
  const [mid, lo, hi, w, m] = [row.you.mid, row.you.low, row.you.high, row.women.kg, row.men.kg].map(u);
  const top = Math.max(w, m, hi) * 1.04;
  const x = (v: number) => 4 + (v / top) * (width - 8);
  const record = sex === 'male' ? m : w;
  const pct = Math.round((mid / record) * 100);
  const H = 64;
  const ty = 32;
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const anchor = (v: number, label: string) => (x(v) > label.length * 6.5 ? 'end' : 'start');
  const wLabel = `${row.women.label}: ${n(w)}`;
  const mLabel = `${row.men.label}: ${n(m)}`;
  return (
    <View
      style={styles.recordInner}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`${name}: e1RM ${Math.round(mid)} ${unit}, ${pct}% of the ${sex === 'male' ? "men's" : "women's"} record. ${wLabel}. ${mLabel} ${unit}.`}>
      <View style={styles.recordHead}>
        <ThemedText type="small" style={styles.flex}>
          {name}
        </ThemedText>
        <Uncertain value={mid} low={lo} high={hi} digits={0} unit={` ${unit}`} type="numSmall" />
      </View>
      {width > 0 ? (
        <Svg width={width} height={H}>
          <Rect x={4} y={ty - 1} width={width - 8} height={2} fill={theme.interval} />
          <Rect x={x(lo)} y={ty - 4} width={Math.max(2, x(hi) - x(lo))} height={8} fill={theme.interval} />
          <Path d={`M${x(lo) + 5},${ty - 9} h-5 v18 h5`} stroke={theme.accent} strokeWidth={2} fill="none" strokeLinecap="square" />
          <Path d={`M${x(hi) - 5},${ty - 9} h5 v18 h-5`} stroke={theme.accent} strokeWidth={2} fill="none" strokeLinecap="square" />
          <Rect x={x(mid) - 1} y={ty - 7} width={2} height={14} fill={theme.text} />
          <Rect x={x(w) - 1} y={ty - 12} width={2} height={12} fill={theme.text} />
          <SvgText x={x(w)} y={ty - 16} fill={theme.textSecondary} fontFamily={Fonts.regular} fontSize={13} textAnchor={anchor(w, wLabel)}>
            {wLabel}
          </SvgText>
          <Rect x={x(m) - 1} y={ty} width={2} height={12} fill={theme.text} />
          <SvgText x={x(m)} y={ty + 26} fill={theme.textSecondary} fontFamily={Fonts.regular} fontSize={13} textAnchor={anchor(m, mLabel)}>
            {mLabel}
          </SvgText>
        </Svg>
      ) : null}
      <ThemedText type="caption" themeColor="textSecondary">
        {pct}% of the {sex === 'male' ? "men's" : "women's"} record. {row.note}
      </ThemedText>
    </View>
  );
}

function ProgressOverTime({ history, profile, plan }: { history: LoggedSet[]; profile: Profile; plan: Plan | null }) {
  const theme = useTheme();
  const unit = profile.unit;
  const lifts = useMemo(() => liftsWithProgress(history, profile.bodyweightKg, 1), [history, profile.bodyweightKg]);
  const [pick, setPick] = useState(0);
  const [width, setWidth] = useState(0);
  const id = lifts[Math.min(pick, lifts.length - 1)];
  const series = useMemo(() => (id ? progressSeries(history, id, profile.bodyweightKg) : []), [history, id, profile.bodyweightKg]);
  const fan = useMemo(() => {
    if (!plan || !id || ADDED_WEIGHT_LIFTS.has(id)) return null;
    const s = plan.strengthOf(id);
    if (!s) return null;
    const rate = adherence(history, profile, localToday());
    const pts = [{ w: 0, lo: Math.exp(s.mean - 0.84 * s.sd), mid: Math.exp(s.mean), hi: Math.exp(s.mean + 0.84 * s.sd) }];
    for (const w of [4, 8, 12]) {
      const f = goalForecast(plan.posterior, id, s, plan.effectiveDose, w, Math.exp(s.mean), rate, 7, 0, profile.daysPerWeek);
      if (!f) return null;
      pts.push({ w, lo: f.dots[3], mid: (f.dots[9] + f.dots[10]) / 2, hi: f.dots[16] });
    }
    return pts.map((p) => ({ ...p, lo: toUnit(p.lo, unit), mid: toUnit(p.mid, unit), hi: toUnit(p.hi, unit) }));
  }, [plan, id, history, profile, unit]);
  if (lifts.length === 0) {
    return (
      <View style={styles.section}>
        <ThemedText type="smallBold">Progress over time</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Log a lift to see your estimated max and where it is likely heading.
        </ThemedText>
      </View>
    );
  }
  const vals = series.map((p) => toUnit(p.e1rmKg, unit));
  const t = series.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const t0 = t[0];
  const tNow = Date.parse(`${localToday()}T00:00:00Z`);
  const WEEK = 7 * 86400000;
  const t1 = fan ? tNow + 12 * WEEK : Math.max(t[t.length - 1], t0 + 86400000);
  const sig = PRIORS.sigmaE1rmMedian;
  const up = vals.map((v) => v * Math.exp(sig));
  const down = vals.map((v) => v * Math.exp(-sig));
  const goal = profile.goals.find((g) => g.exerciseId === id);
  const goalV = goal ? toUnit(goal.targetKg, unit) : null;
  const lo = Math.min(...down, goalV ?? Infinity, ...(fan ? fan.map((p) => p.lo) : []));
  const hi = Math.max(...up, goalV ?? -Infinity, ...(fan ? fan.map((p) => p.hi) : []));
  const span = Math.max(hi - lo, hi * 0.05, 1);
  const H = 160;
  const pad = { l: 36, r: 56, t: 24, b: 22 };
  const x = (ms: number) => pad.l + ((ms - t0) / (t1 - t0)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - (lo - span * 0.15)) / (span * 1.3)) * (H - pad.t - pad.b);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(t[i])},${y(v)}`).join(' ');
  const first = vals[0];
  const last = vals[vals.length - 1];
  const change = ((last - first) / first) * 100;
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Progress over time</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {lifts.map((l, i) => (
          <Pressable
            key={l}
            accessibilityRole="radio"
            aria-checked={l === id}
            accessibilityLabel={EXERCISES_BY_ID[l]?.name ?? l}
            onPress={() => setPick(i)}
            style={[styles.chip, choiceStyle(theme, l === id)]}>
            <ThemedText type="small" >
              {EXERCISES_BY_ID[l]?.name ?? l}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={`${EXERCISES_BY_ID[id]?.name}: e1RM from ${Math.round(first)} to ${Math.round(last)} ${unit} over ${series.length} days`}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            {[0.25, 0.5, 0.75].map((g) => (
              <Line key={g} x1={pad.l} x2={width - pad.r} y1={pad.t + g * (H - pad.t - pad.b)} y2={pad.t + g * (H - pad.t - pad.b)} stroke={theme.interval} strokeOpacity={0.6} strokeWidth={1} />
            ))}
            <SvgText x={4} y={12} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13}>
              {`Estimated 1-rep max, ${unit}`}
            </SvgText>
            {[0.25, 0.5, 0.75].map((g) => {
              const yy = pad.t + g * (H - pad.t - pad.b);
              const v = lo - span * 0.15 + (1 - (yy - pad.t) / (H - pad.t - pad.b)) * span * 1.3;
              return (
                <SvgText key={g} x={pad.l - 4} y={yy + 4} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13} textAnchor="end">
                  {String(Math.round(v))}
                </SvgText>
              );
            })}
            {vals.length > 1 ? (
              <Path
                d={up.map((v, i) => `${i ? 'L' : 'M'}${x(t[i])},${y(v)}`).join(' ') + ' ' + down.map((_, j) => { const i = down.length - 1 - j; return `L${x(t[i])},${y(down[i])}`; }).join(' ') + ' Z'}
                fill={theme.interval}
                fillOpacity={0.7}
              />
            ) : null}
            {goalV !== null ? (
              <>
                <Line x1={pad.l} x2={width - pad.r} y1={y(goalV)} y2={y(goalV)} stroke={theme.bracket} strokeWidth={1.5} strokeDasharray="5,4" />
                <SvgText x={width - pad.r + 6} y={y(goalV) + 4} fill={theme.bracket} fontFamily={Fonts.semibold} fontSize={12}>
                  {`Goal ${Math.round(goalV)}`}
                </SvgText>
              </>
            ) : null}
            {fan ? (
              <>
                <Path
                  d={fan.map((p, i) => `${i ? 'L' : 'M'}${x(tNow + p.w * WEEK)},${y(p.hi)}`).join(' ') + ' ' + [...fan].reverse().map((p) => `L${x(tNow + p.w * WEEK)},${y(p.lo)}`).join(' ') + ' Z'}
                  fill={theme.bracketBand}
                  fillOpacity={0.25}
                />
                <Path d={fan.map((p, i) => `${i ? 'L' : 'M'}${x(tNow + p.w * WEEK)},${y(p.mid)}`).join(' ')} stroke={theme.text} strokeWidth={1.5} strokeDasharray="4,4" fill="none" />
                <Line x1={x(tNow)} x2={x(tNow)} y1={pad.t} y2={H - pad.b} stroke={theme.steel} strokeWidth={1} strokeOpacity={0.5} />
              </>
            ) : null}
            <Path d={line} stroke={theme.text} strokeWidth={2} fill="none" />
            {vals.map((v, i) => (
              <Line key={`e${i}`} x1={x(t[i])} x2={x(t[i])} y1={y(up[i])} y2={y(down[i])} stroke={theme.bracketBand} strokeWidth={vals.length > 1 ? 0 : 2} />
            ))}
            {vals.map((v, i) => (
              <Circle key={i} cx={x(t[i])} cy={y(v)} r={3} fill={theme.text} />
            ))}
            {fan ? (
              <SvgText x={width - pad.r + 4} y={y(fan[3].mid) + 4} fill={theme.text} fontFamily={Fonts.semibold} fontSize={13}>
                {`${Math.round(fan[3].lo)}–${Math.round(fan[3].hi)}`}
              </SvgText>
            ) : (
              <SvgText x={x(t[t.length - 1]) + 8} y={y(last) + 5} fill={theme.text} fontFamily={Fonts.semibold} fontSize={14}>
                {`${Math.round(last)} ${unit}`}
              </SvgText>
            )}
            {!fan || x(tNow) - pad.l > (width - pad.r - x(tNow) < 70 ? 110 : 70) ? (
              <SvgText x={pad.l} y={H - 4} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13}>
                {short(series[0].date)}
              </SvgText>
            ) : null}
            {fan ? (
              <SvgText
                x={width - pad.r - x(tNow) < 70 ? x(tNow) - 4 : x(tNow)}
                y={H - 4}
                fill={theme.steel}
                fontFamily={Fonts.regular}
                fontSize={13}
                textAnchor={width - pad.r - x(tNow) < 70 ? 'end' : 'middle'}>
                Today
              </SvgText>
            ) : null}
            <SvgText x={width - pad.r} y={H - 4} fill={theme.steel} fontFamily={Fonts.regular} fontSize={13} textAnchor="end">
              {fan ? '+12 wk' : short(series[series.length - 1].date)}
            </SvgText>
          </Svg>
        ) : null}
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        {fan
          ? `In 12 weeks: likely ${Math.round(fan[3].lo)}–${Math.round(fan[3].hi)} ${unit}, if you keep training as you have.`
          : `Estimated max${ADDED_WEIGHT_LIFTS.has(id) ? ' (added weight)' : ''}: ${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}% since ${short(series[0].date)}.`}
      </ThemedText>
      <Info title="How to read this chart">
        {fan
          ? `Dots: your estimated max each day. Shaded: where you're likely to be (the middle 60% of outcomes). Dashed: the middle guess.`
          : `Dots: your estimated max each day. Grey band: its likely range.`}
      </Info>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCaption: { textAlign: 'center' },
  content: { gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', gap: Spacing.two },
  chip: { minHeight: 44, paddingHorizontal: Spacing.three, borderRadius: Radius.button, justifyContent: 'center' },
  dotplot: { gap: Spacing.one, marginTop: Spacing.three },
  weekNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  underline: { textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 36, paddingHorizontal: Spacing.two },
  label: { width: 120 },
  track: { flex: 1, height: 6, justifyContent: 'center' },
  bar: { height: '100%' },
  target: { position: 'absolute', top: -4, width: 3, height: 14, marginLeft: -1 },
  value: { width: 64, textAlign: 'right' },
  flex: { flex: 1 },
  detailsToggle: { borderRadius: Radius.button, padding: Spacing.three, gap: 2, minHeight: 48 },
  recordRow: { padding: Spacing.two },
  recordInner: { gap: Spacing.one },
  recordHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});

function SvgText({ children, ...props }: SvgTextProps) {
  return <RawSvgText {...props}>{typeof children === 'string' ? t(children) : children}</RawSvgText>;
}
