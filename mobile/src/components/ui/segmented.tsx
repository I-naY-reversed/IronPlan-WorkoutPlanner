import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { choiceStyle } from '@/components/ui/control';

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  mono = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  mono?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <ThemedText type="label" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={o.label}
              onPress={() => onChange(o.value)}
              style={[
                styles.item,
                choiceStyle(theme, selected),
              ]}>
              <ThemedText type={mono ? 'num' : 'smallBold'} >
                {o.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  item: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
