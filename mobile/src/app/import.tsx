import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ExercisePicker } from '@/components/exercise-picker';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, TextAction } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { getAliases, getAllSets, insertSets, saveAliases, type SetSource } from '@/db/database';
import { importCsv, type ImportResult } from '@/domain/csv';
import { EXERCISES_BY_ID } from '@/domain/exercises';
import { markLikelyWarmups, prepareImport, resolveNames } from '@/domain/resolve';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/state/profile-context';
import { choiceStyle } from '@/components/ui/control';

type Parsed = ImportResult & { fileName: string; resolved: Map<string, string>; unresolved: string[] };

export default function ImportScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { profile } = useProfile();
  const [unit, setUnit] = useState<'kg' | 'lb'>(profile?.unit ?? 'kg');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [choices, setChoices] = useState(new Map<string, string>());
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chooseFile = async () => {
    setMessage(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const imported = importCsv(text, { defaultUnit: unit });
      const { resolved, unresolved } = resolveNames(
        imported.sets.map((s) => s.exerciseName),
        await getAliases(db),
      );
      setParsed({ ...imported, fileName: asset.name, resolved, unresolved });
      setChoices(new Map());
    } catch (e) {
      setParsed(null);
      setMessage(e instanceof Error ? e.message : 'Could not read the file.');
    }
  };

  const allResolved = useMemo(() => {
    if (!parsed) return new Map<string, string>();
    return new Map([...parsed.resolved, ...choices]);
  }, [parsed, choices]);
  const sets = useMemo(() => (parsed ? markLikelyWarmups(parsed.sets, allResolved) : []), [parsed, allResolved]);
  const spotted = sets.filter((x) => x.autoWarmup).length;

  const runImport = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const existing = (await getAllSets(db)).map((s) => ({ ...s, warmup: s.kind === 'warmup' }));
      const { ready, duplicates, unmatched, implausible } = prepareImport(sets, allResolved, existing);
      const source: SetSource = parsed.format;
      await insertSets(
        db,
        ready.map((s) => ({
          date: s.date, exerciseId: s.exerciseId, setIndex: s.setIndex, reps: s.reps, weightKg: s.weightKg,
          rpe: s.rpe, rir: s.rir, source, rawName: s.exerciseName, kind: s.warmup ? 'warmup' : s.failed ? 'failed' : s.drop ? 'drop' : 'working', seconds: s.seconds ?? null,
        })),
      );
      if (choices.size > 0) await saveAliases(db, choices);
      const warm = ready.filter((s) => s.warmup).length;
      const auto = ready.filter((s) => s.autoWarmup).length;
      const parts = [`Imported ${plural(ready.length - warm, 'working set')}${warm ? ` and ${plural(warm, 'warm-up')}` : ''}.`];
      if (auto) parts.push(`${auto} warm-up${auto === 1 ? ' was' : 's were'} spotted automatically.`);
      if (duplicates) parts.push(`${duplicates} already in your log.`);
      if (unmatched) parts.push(`${unmatched} skipped (exercise not matched).`);
      if (implausible) parts.push(`${implausible} skipped (weight or reps beyond any record, likely typos).`);
      setMessage(parts.join(' '));
      setParsed(null);
    } finally {
      setBusy(false);
    }
  };

  if (choosingFor) {
    return (
      <Screen title="Match exercise" subtitle={`“${choosingFor}”`}>
        <Button title="Cancel" variant="secondary" onPress={() => setChoosingFor(null)} />
        <ExercisePicker
          initialQuery={choosingFor}
          onPick={(e) => {
            setChoices(new Map(choices).set(choosingFor, e.id));
            setChoosingFor(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Import" subtitle="Strong, Hevy, or any CSV with date, exercise, reps and weight">
      <TextAction title="Back to Settings" onPress={() => router.navigate('/profile')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {!parsed ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Unit for files that don’t say
            </ThemedText>
            <View style={styles.segment}>
              {(['kg', 'lb'] as const).map((u) => (
                <Pressable
                  key={u}
                  accessibilityRole="button"
                  aria-selected={unit === u}
                  onPress={() => setUnit(u)}
                  style={[styles.segmentItem, choiceStyle(theme, unit === u)]}>
                  <ThemedText type="smallBold" >
                    {u}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <Button title="Choose CSV file" onPress={chooseFile} />
          </>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{parsed.fileName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatLabel(parsed.format)}, {plural(sets.filter((x) => !x.warmup).length, 'working set')}
                {sets.some((x) => x.warmup) ? `, ${plural(sets.filter((x) => x.warmup).length, 'warm-up')}` : ''}
                {parsed.skipped.length ? `, ${plural(parsed.skipped.length, 'row')} skipped` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {plural(parsed.resolved.size, 'exercise name')} matched automatically
              </ThemedText>
              {spotted ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {spotted} light {spotted === 1 ? 'set' : 'sets'} before the day’s heaviest will count as warm-ups.
                </ThemedText>
              ) : null}
            </View>

            {parsed.unresolved.length > 0 ? (
              <View style={styles.unresolved}>
                <ThemedText type="smallBold">Confirm these once</ThemedText>
                {parsed.unresolved.map((name, i) => {
                  const chosen = choices.get(name);
                  return (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      accessibilityLabel={`Match ${name}`}
                      onPress={() => setChoosingFor(name)}
                      style={[styles.nameRow, { backgroundColor: i % 2 === 0 ? theme.backgroundElement : 'transparent' }]}>
                      <ThemedText style={styles.nameText}>{name}</ThemedText>
                      <ThemedText type="small" themeColor={chosen ? 'text' : 'link'} style={chosen ? undefined : styles.underline}>
                        {chosen ? EXERCISES_BY_ID[chosen].name : 'Choose'}
                      </ThemedText>
                    </Pressable>
                  );
                })}
                <ThemedText type="small" themeColor="textSecondary">
                  Names you leave unmatched are skipped.
                </ThemedText>
              </View>
            ) : null}

            <Button title={busy ? 'Importing…' : 'Import'} onPress={runImport} disabled={busy} />
            <Button title="Cancel" variant="secondary" onPress={() => setParsed(null)} />
          </>
        )}

        {message ? <ThemedText>{message}</ThemedText> : null}
      </ScrollView>
    </Screen>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function formatLabel(format: ImportResult['format']) {
  return format === 'strong' ? 'Strong export' : format === 'hevy' ? 'Hevy export' : 'CSV log';
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.four },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segmentItem: { minWidth: 64, minHeight: 48, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center' },
  card: { padding: Spacing.three, gap: Spacing.one },
  unresolved: { gap: Spacing.one },
  nameRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two + Spacing.one, paddingHorizontal: Spacing.two, gap: Spacing.three },
  nameText: { flex: 1 },
  underline: { textDecorationLine: 'underline' },
});
