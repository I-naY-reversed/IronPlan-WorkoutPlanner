import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing, TypeScale } from '@/constants/theme';
import { EXERCISES, MUSCLE_LABELS, type Exercise, type Muscle } from '@/domain/exercises';
import { tokenize } from '@/domain/matching';
import { useTheme } from '@/hooks/use-theme';
import { inputStyle } from '@/components/ui/control';
import { t } from '@/i18n';

function primaryMuscles(exercise: Exercise) {
  return (Object.entries(exercise.muscles) as [Muscle, number][])
    .filter(([, w]) => w === 1)
    .map(([m]) => MUSCLE_LABELS[m])
    .join(', ');
}

export function ExercisePicker({ onPick, initialQuery = '', options = EXERCISES }: { onPick: (exercise: Exercise) => void; initialQuery?: string; options?: Exercise[] }) {
  const theme = useTheme();
  const [query, setQuery] = useState(initialQuery);

  const results = useMemo(() => {
    const tokens = tokenize(query);
    if (tokens.length === 0) return options;
    const haystack = (e: Exercise) => tokenize([e.name, ...(e.aliases ?? [])].join(' ')).join(' ');
    const all = options.filter((e) => tokens.every((t) => haystack(e).includes(t)));
    return all.length > 0 ? all : options.filter((e) => tokens.some((t) => haystack(e).includes(t)));
  }, [query, options]);

  return (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('Search exercises')}
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
        style={[styles.search, { color: theme.text }, inputStyle(theme)]}
      />
      <FlatList
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Spacing.six }}
        data={results}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => onPick(item)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? theme.backgroundSelected : index % 2 === 0 ? theme.backgroundElement : 'transparent' },
            ]}>
            <ThemedText>{item.name}</ThemedText>
            <ThemedText type="caption" themeColor="steel">
              {primaryMuscles(item)}
            </ThemedText>
          </Pressable>
        )}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No match. The exercise list is a v1 seed and still growing.
          </ThemedText>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: 48, borderRadius: Radius.input, paddingHorizontal: Spacing.two + Spacing.one, fontFamily: Fonts.regular, fontSize: TypeScale.md },
  row: { paddingVertical: Spacing.two + Spacing.one, paddingHorizontal: Spacing.two },
  empty: { paddingVertical: Spacing.three },
});
