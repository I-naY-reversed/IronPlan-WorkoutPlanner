import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useBand } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { TextAction } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import { focusOptions, setDayFocus } from '@/domain/customize';
import { effectiveSplit, minutesFor, SESSION_LABELS } from '@/domain/generator';
import { SESSION_MINUTE_OPTIONS, TIME_OPTIONS, type Profile } from '@/domain/profile';
import { useTheme } from '@/hooks/use-theme';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function WeekEditor({ profile, onChange }: { profile: Profile; onChange: (next: Profile) => void }) {
  const theme = useTheme();
  const band = useBand();
  const [open, setOpen] = useState<number | null>(null);
  const split = effectiveSplit(profile);
  const usual = profile.sessionMinutes;
  return (
    <View style={styles.wrap}>
      {profile.trainingDays.map((d, i) => {
        const expanded = open === d;
        const minutes = minutesFor(profile, d);
        return (
          <View key={d} style={[styles.day, band(i)]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${DAY_NAMES[d]}: ${SESSION_LABELS[split[i]]}, ${profile.dayTimes[d] ?? profile.trainingTime}, ${minutes} minutes. ${expanded ? 'Close' : 'Change'}`}
              onPress={() => setOpen(expanded ? null : d)}
              style={({ pressed }) => [styles.head, pressed && { backgroundColor: theme.backgroundSelected }]}>
              <View style={styles.headLine}>
                <ThemedText type="smallBold" style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {DAY_NAMES[d]}
                </ThemedText>
                <ThemedText style={styles.flex} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {SESSION_LABELS[split[i]]}
                </ThemedText>
                <ThemedText type="caption" themeColor="link">
                  {expanded ? 'Done' : 'Change'}
                </ThemedText>
              </View>
              <ThemedText type="numSmall" themeColor={profile.dayMinutes[d] || profile.dayTimes[d] ? 'text' : 'steel'} numberOfLines={1}>
                {profile.dayTimes[d] ?? profile.trainingTime}, {minutes} min
              </ThemedText>
            </Pressable>
            {expanded ? (
              <View style={styles.body}>
                <Segmented
                  label={`${DAY_NAMES[d]}: what you train`}
                  value={split[i]}
                  onChange={(k) => onChange(setDayFocus(profile, d, k))}
                  options={focusOptions(profile).map((k) => ({ value: k, label: SESSION_LABELS[k] }))}
                />
                <Segmented
                  label={`${DAY_NAMES[d]}: minutes available`}
                  mono
                  value={profile.dayMinutes[d] ?? 0}
                  onChange={(m) => {
                    const dayMinutes = { ...profile.dayMinutes };
                    if (m === 0) delete dayMinutes[d];
                    else dayMinutes[d] = m;
                    onChange({ ...profile, dayMinutes });
                  }}
                  options={[{ value: 0, label: `Usual (${usual})` }, ...SESSION_MINUTE_OPTIONS.filter((m) => m !== usual).map((m) => ({ value: m, label: String(m) }))]}
                />
                <Segmented
                  label={`${DAY_NAMES[d]}: time`}
                  mono
                  value={profile.dayTimes[d] ?? ''}
                  onChange={(t) => {
                    const dayTimes = { ...profile.dayTimes };
                    if (t === '') delete dayTimes[d];
                    else dayTimes[d] = t;
                    onChange({ ...profile, dayTimes });
                  }}
                  options={[{ value: '', label: `Usual (${profile.trainingTime})` }, ...TIME_OPTIONS.filter((t) => t !== profile.trainingTime).map((t) => ({ value: t, label: t }))]}
                />
              </View>
            ) : null}
          </View>
        );
      })}
      {profile.split === 'custom' ? (
        <TextAction title="Use the recommended week instead" onPress={() => onChange({ ...profile, split: 'auto', dayFocus: {} })} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  day: { paddingHorizontal: Spacing.two },
  head: { gap: Spacing.half, minHeight: 48, justifyContent: 'center' },
  headLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  name: { width: 92 },
  flex: { flex: 1 },
  body: { gap: Spacing.three, paddingBottom: Spacing.three },
});
