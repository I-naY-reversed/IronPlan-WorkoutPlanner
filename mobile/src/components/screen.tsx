import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSurface, useTheme } from '@/hooks/use-theme';

const TopInset = Platform.select({ web: 24 + Spacing.three, default: Spacing.three });

export function Screen({
  title,
  subtitle,
  action,
  tabs = true,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  tabs?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const surface = useSurface();
  return (
    <>
      <StatusBar style={surface === 'steel' ? 'light' : 'dark'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={[styles.outer, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.inner,
            { paddingTop: insets.top + TopInset, paddingBottom: tabs ? BottomTabInset + Spacing.two : insets.bottom + Spacing.three },
          ]}>
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
            {action}
          </View>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

export const OnCard = createContext(false);

export function useBand() {
  const theme = useTheme();
  const onCard = useContext(OnCard);
  return (i: number) => ({ backgroundColor: i % 2 === 0 ? (onCard ? theme.backgroundSelected : theme.backgroundElement) : 'transparent' });
}

export function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  inner: { flex: 1, width: '100%', maxWidth: MaxContentWidth, paddingHorizontal: Spacing.three, gap: Spacing.three },
});
