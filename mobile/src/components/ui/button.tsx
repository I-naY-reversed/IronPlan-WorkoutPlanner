import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { controlStyle } from '@/components/ui/control';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'destructive';
};

export function Button({ title, variant = 'primary', disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const outline = theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      style={(state) => [
        styles.base,
        primary
          ? { backgroundColor: theme.accent, minHeight: 60, alignSelf: 'stretch' }
          : { borderColor: outline, borderWidth: 2, minHeight: 48 },
        state.pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <ThemedText style={[styles.label, { color: primary ? theme.accentText : outline }]}>{title}</ThemedText>
    </Pressable>
  );
}

export function NudgeButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.nudge, controlStyle(theme), pressed && styles.pressed]}>
      <ThemedText type="num" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function TextAction({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} hitSlop={14}>
      <ThemedText type="small" themeColor="link" style={styles.underline}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.button, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: Fonts.semibold, fontSize: TypeScale.md },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ translateY: 2 }], opacity: 0.92 },
  nudge: { minWidth: 64, height: 48, paddingHorizontal: Spacing.two, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
