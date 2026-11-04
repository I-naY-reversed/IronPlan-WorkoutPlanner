import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Icon } from '@/components/ui/icon';

export function Info({ title = 'How this works', children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title} onPress={() => setOpen(!open)} hitSlop={14} style={styles.row}>
        <Icon name="info" size={16} color={theme.steel} />
        <ThemedText type="caption" themeColor="link" style={styles.link}>
          {open ? 'Hide' : title}
        </ThemedText>
      </Pressable>
      {open ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {children}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  link: { textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
});
