import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

const ICONS = {
  back: { ios: 'chevron.left', md: 'chevron_left' },
  forward: { ios: 'chevron.right', md: 'chevron_right' },
  close: { ios: 'xmark', md: 'close' },
  check: { ios: 'checkmark', md: 'check' },
  partial: { ios: 'circle.fill', md: 'fiber_manual_record' },
  swap: { ios: 'arrow.left.arrow.right', md: 'swap_horiz' },
  info: { ios: 'info.circle', md: 'info' },
  timer: { ios: 'timer', md: 'timer' },
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: ColorValue }) {
  const i = ICONS[name];
  return (
    <SymbolView
      name={{ ios: i.ios, android: i.md, web: i.md }}
      size={size}
      tintColor={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
