import { NativeTabs } from 'expo-router/native-tabs';

import { sessionTabIcon } from '@/components/tab-icons';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useProfile } from '@/state/profile-context';

const TABS = [
  { name: 'index', label: 'Plan', icon: require('@/assets/images/tabIcons/plan.png') },
  { name: 'log', label: 'Workout', icon: null },
  { name: 'dose', label: 'Progress', icon: require('@/assets/images/tabIcons/progress.png') },
  { name: 'import', label: 'Import', icon: require('@/assets/images/tabIcons/import.png'), hidden: true },
  { name: 'profile', label: 'Settings', icon: require('@/assets/images/tabIcons/profile.png') },
] as const;

export default function AppTabs() {
  const theme = useTheme();
  const { profile } = useProfile();
  const tr = useT();
  return (
    <NativeTabs
      backgroundColor={theme.background}
      indicatorColor="transparent"
      labelVisibilityMode="labeled"
      iconColor={{ default: theme.steel, selected: theme.bracket }}
      labelStyle={{ default: { color: theme.steel }, selected: { color: theme.text } }}>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name} hidden={'hidden' in t ? t.hidden : undefined}>
          <NativeTabs.Trigger.Label>{tr(t.label)}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={t.icon ?? sessionTabIcon(profile?.sport)} renderingMode="template" />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
