import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { sessionTabIcon } from '@/components/tab-icons';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/state/profile-context';

const TABS = [
  { name: 'index', href: '/', label: 'Plan', icon: require('@/assets/images/tabIcons/plan.png') },
  { name: 'log', href: '/log', label: 'Workout', icon: null },
  { name: 'dose', href: '/dose', label: 'Progress', icon: require('@/assets/images/tabIcons/progress.png') },
  { name: 'profile', href: '/profile', label: 'Settings', icon: require('@/assets/images/tabIcons/profile.png') },
] as const;

export default function AppTabs() {
  const { profile } = useProfile();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <CustomTabList>
          {TABS.map((t) => (
            <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
              <TabButton icon={t.icon ?? sessionTabIcon(profile?.sport)}>{t.label}</TabButton>
            </TabTrigger>
          ))}
          <TabTrigger name="import" href="/import" style={styles.hidden} />
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, icon, ref: _ref, ...props }: TabTriggerSlotProps & { icon: number }) {
  const theme = useTheme();
  const color = isFocused ? theme.text : theme.steel;
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <Image source={icon} style={[styles.icon, { tintColor: isFocused ? theme.highlight : theme.steel }]} />
      <ThemedText type="caption" style={{ color }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const theme = useTheme();
  return (
    <View {...props} style={[styles.container, { backgroundColor: theme.background, borderTopColor: theme.backgroundSelected }]}>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: Spacing.two },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingTop: Spacing.two, minHeight: 56 },
  icon: { width: 24, height: 24 },
  hidden: { display: 'none' },
  pressed: { opacity: 0.7 },
});
