import { Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TextAction } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { weekStart, type LoggedSet } from '@/domain/dose';
import {
  addDays,
  consistency,
  describeRecord,
  firstWeeks,
  previousPeriod,
  recordsBetween,
  weekSummaryText,
  type WeekStatus,
} from '@/domain/engagement';
import type { Plan } from '@/domain/generator';
import type { LiftPath } from '@/domain/model';
import type { Profile } from '@/domain/profile';
import { useTheme } from '@/hooks/use-theme';

const STATUS_WORD: Record<WeekStatus, string> = { kept: 'kept', repaired: 'made up', paused: 'off', missed: 'missed', pending: 'short, can still be made up', open: 'in progress' };

export function Consistency({
  profile,
  history,
  today,
  plan,
  paths,
  onChange,
}: {
  profile: Profile;
  history: LoggedSet[];
  today: string;
  plan: Plan;
  paths: LiftPath[];
  onChange: (next: Profile) => void;
}) {
  const theme = useTheme();
  const c = consistency(history, profile, today);
  const first = firstWeeks(history, profile, today);
  const week = weekStart(today);
  const records = recordsBetween(history, week, addDays(week, 6), profile.bodyweightKg, paths, profile.awardedRecords);
  const current = c.weeks[c.weeks.length - 1];
  const pausedNow = current.status === 'paused';
  const started = c.weeks.some((w) => w.status !== 'open');
  const unit = c.periodWeeks === 2 ? 'fortnight' : 'week';
  const counts = c.weeks.reduce<Record<string, number>>((n, w) => ({ ...n, [w.status]: (n[w.status] ?? 0) + 1 }), {});

  const cell = (status: WeekStatus) => {
    switch (status) {
      case 'kept':
        return { backgroundColor: theme.text, borderColor: theme.text };
      case 'repaired':
        return { backgroundColor: theme.steel, borderColor: theme.steel };
      case 'paused':
        return { backgroundColor: theme.interval, borderColor: theme.interval };
      case 'open':
      case 'pending':
        return { backgroundColor: 'transparent', borderColor: theme.text, borderStyle: 'dashed' as const };
      default:
        return { backgroundColor: 'transparent', borderColor: theme.steel };
    }
  };

  const share = () =>
    Share.share({ message: weekSummaryText({ today, history, profile, paths, awarded: profile.awardedRecords, nextSessions: plan.sessions.map((s) => ({ weekday: s.weekday, title: s.title })) }) }).catch(() => {});

  const pauseCurrent = () => onChange({ ...profile, pausedWeeks: [...profile.pausedWeeks, today] });
  const unpauseCurrent = () => {
    const inCurrent = (d: string) => c.weeks.length > 0 && d >= current.week && d < addDays(current.week, 7 * c.periodWeeks);
    onChange({ ...profile, pausedWeeks: profile.pausedWeeks.filter((d) => !inCurrent(d)), retroPauses: profile.retroPauses.filter((d) => !inCurrent(d)) });
  };
  const pauseLast = () => onChange({ ...profile, retroPauses: [...profile.retroPauses, previousPeriod(profile, history, today)] });

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.flex}>
          Consistency
        </ThemedText>
        {profile.showStreaks && c.streak > 0 ? (
          <ThemedText type="num">
            {c.streak} {c.streak === 1 ? unit : `${unit}s`} in a row
          </ThemedText>
        ) : null}
      </View>
      {profile.showStreaks && started ? (
        <>
          <View
            style={styles.weeks}
            accessible
            accessibilityLabel={`Last ${c.weeks.length} ${unit}s: ${Object.entries(counts)
              .map(([k, n]) => `${n} ${STATUS_WORD[k as WeekStatus]}`)
              .join(', ')}`}>
            {c.weeks.map((w) => (
              <View key={w.week} style={[styles.week, cell(w.status)]} />
            ))}
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            {c.total} {c.total === 1 ? unit : `${unit}s`} kept in total
          </ThemedText>
        </>
      ) : null}
      {!profile.showStreaks ? null : c.repairable ? (
        <ThemedText type="smallBold">
          Short {unit}: {c.repairable.sessions} more {c.repairable.sessions === 1 ? 'workout' : 'workouts'} this {unit} makes it up.
        </ThemedText>
      ) : null}

      {profile.showStreaks && first ? (
        <View style={styles.first}>
          <ThemedText type="small">
            First 4 weeks: {Math.min(first.done, first.target)} of {first.target} sessions ({c.needed}+ a week)
            {first.start ? `, ${first.daysLeft} ${first.daysLeft === 1 ? 'day' : 'days'} left` : ''}
          </ThemedText>
          <View style={styles.weeks} accessible accessibilityLabel={`${first.done} of ${first.target} workouts done`}>
            {Array.from({ length: first.target }, (_, i) => (
              <View key={i} style={[styles.tick, { borderColor: theme.text, backgroundColor: i < first.done ? theme.text : 'transparent' }]} />
            ))}
          </View>
        </View>
      ) : null}

      {profile.showStreaks && records.length ? (
        <View style={styles.first}>
          <ThemedText type="small">This week</ThemedText>
          {records.slice(0, 5).map((r) => (
            <ThemedText key={`${r.exerciseId}${r.date}${r.kind}`} type="caption" themeColor="textSecondary">
              {describeRecord(r, profile.unit)}
            </ThemedText>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {pausedNow ? (
          <TextAction title={`Back on this ${unit}`} onPress={unpauseCurrent} />
        ) : current.status !== 'kept' && c.canPauseCurrent ? (
          <TextAction title={`Take this ${unit} off`} onPress={pauseCurrent} />
        ) : null}
        {c.canPauseLast ? <TextAction title={`Last ${unit} off (ill or away)`} onPress={pauseLast} /> : null}
        <TextAction title="Share" onPress={share} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  flex: { flex: 1 },
  weeks: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  week: { width: 22, height: 22, borderWidth: 1.5, borderRadius: Radius.input },
  tick: { width: 18, height: 18, borderWidth: 1.5, borderRadius: Radius.input },
  first: { gap: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap', paddingTop: Spacing.one },
});
