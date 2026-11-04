import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { inputStyle } from '@/components/ui/control';

export function NumberField({
  label,
  value,
  onCommit,
  unit,
  optional = false,
  placeholder,
  min = 0,
  max = Infinity,
}: {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  unit?: string;
  optional?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  const rangeText = Number.isFinite(max) ? `${fmt(min)} to ${fmt(max)}${unit ? ` ${unit}` : ''}` : `at least ${fmt(min)}${unit ? ` ${unit}` : ''}`;
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value === undefined ? '' : String(value));
  }

  const commit = () => {
    const trimmed = draft.trim().replace(',', '.');
    if (trimmed === '') {
      if (optional) onCommit(undefined);
      else setDraft(value === undefined ? '' : String(value));
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= min && n <= max) {
      setError(null);
      onCommit(n);
    } else {
      setError(`Enter ${rangeText}.`);
      setDraft(value === undefined ? '' : String(value));
    }
  };

  return (
    <View style={styles.field}>
      <ThemedText type="label" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={[styles.box, inputStyle(theme)]}>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          const n = Number(text.trim().replace(',', '.'));
          if (text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) {
            setError(null);
            setSynced(n);
            onCommit(n);
          } else if (text.trim() !== '' && Number.isFinite(n) && n > max) {
            setError(`Enter ${rangeText}.`);
          }
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        returnKeyType="done"
        selectTextOnFocus
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={label}
        style={[styles.input, { color: theme.text }]}
      />
      {unit ? (
        <ThemedText type="small" themeColor="steel">
          {unit}
        </ThemedText>
      ) : null}
      </View>
      {error ? (
        <ThemedText type="caption" themeColor="textSecondary" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: Spacing.one, minWidth: 96 },
  box: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.input, paddingHorizontal: Spacing.two + Spacing.one, gap: Spacing.one },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 0, fontFamily: Fonts.medium, fontSize: TypeScale.md, fontVariant: ['tabular-nums'] },
});
