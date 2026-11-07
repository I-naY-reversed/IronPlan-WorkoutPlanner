import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function TabBar<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: theme.backgroundSelected }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            aria-selected={active}
            onPress={() => onChange(o.value)}
            hitSlop={6}
            style={[styles.tab, active && { borderBottomColor: theme.highlight }]}>
            <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'text' : 'textSecondary'} numberOfLines={1}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flexGrow: 1, alignItems: 'center', paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, borderBottomWidth: 3, borderBottomColor: 'transparent', marginBottom: -1 },
});
