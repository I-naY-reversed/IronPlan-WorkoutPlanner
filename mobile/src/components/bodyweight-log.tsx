import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { localToday } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { inputStyle } from '@/components/ui/control';
import { Fonts, Radius, Spacing, TypeScale } from '@/constants/theme';
import { deleteBodyweight, getBodyweights, saveBodyweight } from '@/db/database';
import { describeRate, trend, weeklyRate, type BodyweightEntry } from '@/domain/bodyweight';
import { PROFILE_LIMITS, type Profile } from '@/domain/profile';
import { formatLoad, fromUnit } from '@/domain/units';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale } from '@/i18n';

const CHART_DAYS = 90;
const CHART_HEIGHT = 96;

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function BodyweightLog({ profile, update }: { profile: Profile; update: (p: Profile) => void }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const unit = profile.unit;
  const today = localToday();
  const [entries, setEntries] = useState<BodyweightEntry[]>([]);
  const [text, setText] = useState('');
  const [width, setWidth] = useState(0);

  const reload = useCallback(() => {
    getBodyweights(db).then(setEntries);
  }, [db]);
  useFocusEffect(reload);

  const value = Number(text.replace(',', '.'));
  const kg = fromUnit(value, unit);
  const valid = text.trim() !== '' && Number.isFinite(value) && kg >= PROFILE_LIMITS.bodyweightKg.min && kg <= PROFILE_LIMITS.bodyweightKg.max;

  const log = async () => {
    if (!valid) return;
    await saveBodyweight(db, today, Math.round(kg * 100) / 100);
    const all = await getBodyweights(db);
    setEntries(all);
    setText('');
    const t = trend(all).at(-1)?.kg;
    if (t && Math.abs(t - profile.bodyweightKg) >= 0.1) update({ ...profile, bodyweightKg: Math.round(t * 10) / 10 });
  };

  const trended = trend(entries);
  const current = trended.at(-1);
  const rate = weeklyRate(entries, today);
  const fmt = (x: number) => formatLoad(x, unit);

  const from = new Date(Date.parse(`${today}T00:00:00Z`) - CHART_DAYS * 86400000).toISOString().slice(0, 10);
  const shown = entries.filter((e) => e.date >= from);
  const shownTrend = trended.filter((e) => e.date >= from);
  const ys = [...shown.map((e) => e.kg), ...shownTrend.map((e) => e.kg)];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = Math.max(0.5, (hi - lo) * 0.15);
  const x0 = Date.parse(`${shown[0]?.date ?? today}T00:00:00Z`);
  const x1 = Math.max(x0 + 86400000, Date.parse(`${today}T00:00:00Z`));
  const px = (date: string) => 6 + ((Date.parse(`${date}T00:00:00Z`) - x0) / (x1 - x0)) * (width - 12);
  const py = (v: number) => 6 + (1 - (v - (lo - pad)) / (hi + pad - (lo - pad))) * (CHART_HEIGHT - 12);

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">Bodyweight</ThemedText>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          placeholder={current ? fmt(current.kg) : unit}
          placeholderTextColor={theme.steel}
          accessibilityLabel={`Today's bodyweight in ${unit === 'kg' ? 'kilograms' : 'pounds'}`}
          style={[styles.input, { color: theme.text }, inputStyle(theme)]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {unit}
        </ThemedText>
        <View style={styles.flex}>
          <Button title="Log today" onPress={log} disabled={!valid} />
        </View>
      </View>
      {text.trim() !== '' && !valid ? (
        <ThemedText type="small" themeColor="textSecondary">
          Enter {fmt(PROFILE_LIMITS.bodyweightKg.min)}–{fmt(PROFILE_LIMITS.bodyweightKg.max)} {unit}.
        </ThemedText>
      ) : null}
      {current ? (
        <>
          <ThemedText type="small">
            <ThemedText type="smallBold">Trend: {fmt(current.kg)} {unit}. </ThemedText>
            {rate ? describeRate(rate, profile.ageYears < 18) : 'Weigh in a few times over 2 weeks to see your weekly rate.'}
          </ThemedText>
          {shown.length >= 2 ? (
            <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.chart} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {width > 0 ? (
                <Svg width={width} height={CHART_HEIGHT}>
                  {shown.map((e) => (
                    <Circle key={e.date} cx={px(e.date)} cy={py(e.kg)} r={3} fill={theme.steel} />
                  ))}
                  <Polyline points={shownTrend.map((e) => `${px(e.date)},${py(e.kg)}`).join(' ')} fill="none" stroke={theme.bracket} strokeWidth={2.5} />
                </Svg>
              ) : null}
            </View>
          ) : null}
          <ThemedText type="caption" themeColor="steel">
            Points: weigh-ins. Line: trend, which smooths out day-to-day water swings of 1–2%. Weigh in at the same time of day, ideally in the morning.
          </ThemedText>
          {[...entries].reverse().slice(0, 3).map((e) => (
            <View key={e.date} style={styles.entry}>
              <ThemedText type="numSmall" style={styles.flex}>
                {dayLabel(e.date)}: {fmt(e.kg)} {unit}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete the weigh-in on ${dayLabel(e.date)}`}
                hitSlop={12}
                onPress={async () => {
                  await deleteBodyweight(db, e.date);
                  reload();
                }}>
                <ThemedText type="small" themeColor="link" style={styles.underline}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Your profile says {fmt(profile.bodyweightKg)} {unit}. Logging keeps it current, which keeps starting weights and pull-up and dip loads accurate.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { width: 96, minHeight: 48, borderRadius: Radius.input, paddingHorizontal: Spacing.two + Spacing.one, fontFamily: Fonts.regular, fontSize: TypeScale.md },
  flex: { flex: 1 },
  chart: { alignSelf: 'stretch' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  underline: { textDecorationLine: 'underline' },
});
