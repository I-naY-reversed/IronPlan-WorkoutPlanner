import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { choiceStyle } from '@/components/ui/control';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WeekdayPicker({
  value,
  onChange,
  min = 1,
  max = 6,
  label = 'Training days',
}: {
  value: number[];
  onChange: (days: number[]) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  const theme = useTheme();
  const toggle = (d: number) => {
    const on = value.includes(d);
    if (on && value.length <= min) return;
    if (!on && value.length >= max) return;
    onChange(on ? value.filter((x) => x !== d) : [...value, d].sort());
  };
  return (
    <View style={styles.row} accessibilityLabel={label}>
      {WEEKDAYS.map((day, d) => {
        const on = value.includes(d);
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            aria-checked={on}
            accessibilityLabel={label === 'Training days' ? day : `${label}, ${day}`}
            onPress={() => toggle(d)}
            style={[styles.day, choiceStyle(theme, on)]}>
            <ThemedText type="smallBold" numberOfLines={1} >
              {day}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.one },
  day: { flex: 1, minHeight: 48, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
});
