import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen, useBand } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { TextAction } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { CONFIDENCE_LABELS, EXERCISE_EVIDENCE, studiesFor, TOPICS, type Study, type StudyId } from '@/domain/evidence';

function StudyLink({ study }: { study: Study }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${study.cite}, ${study.title}`} onPress={() => Linking.openURL(study.url)}>
      <ThemedText type="caption" themeColor="link" style={styles.underline}>
        {study.cite}, {study.journal}
      </ThemedText>
    </Pressable>
  );
}

export function StudyLinks({ ids }: { ids: StudyId[] }) {
  return (
    <View style={styles.links}>
      {studiesFor(ids).map((s) => (
        <StudyLink key={s.url} study={s} />
      ))}
    </View>
  );
}

/** Short research notes for one exercise, shown under its technique cues. */
export function ExerciseEvidence({ exerciseId }: { exerciseId: string }) {
  const notes = EXERCISE_EVIDENCE[exerciseId];
  if (!notes?.length) return null;
  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">What the research says</ThemedText>
      {notes.map((n) => (
        <View key={n.text} style={styles.note}>
          <ThemedText type="small" themeColor="textSecondary">
            {n.text}
          </ThemedText>
          <StudyLinks ids={n.studies} />
        </View>
      ))}
    </View>
  );
}

/** Settings screen: the technique research library, one expandable topic at a time. */
export function TechniqueLibrary({ onBack }: { onBack: () => void }) {
  const band = useBand();
  const [open, setOpen] = useState<string | null>(TOPICS[0].id);
  return (
    <Screen title="Technique research">
      <TextAction title="Back to settings" onPress={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText type="small" themeColor="textSecondary">
          Form, grip, focus and exercise choice, from peer-reviewed studies. Each topic says how strong the evidence is. Tap a study to read it.
        </ThemedText>
        {TOPICS.map((t, i) => {
          const expanded = open === t.id;
          return (
            <View key={t.id} style={[styles.topic, band(i)]}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${t.title}. ${t.question}`}
                onPress={() => setOpen(expanded ? null : t.id)}
                style={styles.header}>
                <ThemedText type="heading">{t.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t.question}
                </ThemedText>
                <ThemedText type="caption" themeColor="steel">
                  {CONFIDENCE_LABELS[t.confidence]} · {t.studies.length} {t.studies.length === 1 ? 'study' : 'studies'}
                </ThemedText>
              </Pressable>
              {expanded ? (
                <View style={styles.body}>
                  <ThemedText type="small">{t.answer}</ThemedText>
                  <ThemedText type="smallBold">What to do</ThemedText>
                  {t.doThis.map((d) => (
                    <ThemedText key={d} type="small" themeColor="textSecondary">
                      • {d}
                    </ThemedText>
                  ))}
                  <ThemedText type="smallBold">Studies</ThemedText>
                  {studiesFor(t.studies).map((s) => (
                    <View key={s.url} style={styles.note}>
                      <StudyLink study={s} />
                      <ThemedText type="caption" themeColor="steel">
                        {s.design}
                        {s.n ? `, ${s.n}` : ''}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {s.finding}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        <ThemedText type="caption" themeColor="steel">
          Findings are summarized in plain language and may not apply to injuries or medical conditions. This is general guidance, not coaching.
        </ThemedText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, paddingBottom: Spacing.six },
  topic: { padding: Spacing.two, gap: Spacing.two },
  header: { gap: Spacing.half },
  body: { gap: Spacing.two },
  block: { gap: Spacing.two },
  note: { gap: Spacing.half },
  links: { gap: Spacing.half },
  underline: { textDecorationLine: 'underline' },
});
