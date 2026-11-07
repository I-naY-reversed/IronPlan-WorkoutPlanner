import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ExercisePicker } from '@/components/exercise-picker';
import { localToday, Screen, useBand } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Button, TextAction } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number-field';
import { Segmented } from '@/components/ui/segmented';
import { WeekdayPicker } from '@/components/ui/weekday-picker';
import { WeekEditor } from '@/components/week-editor';
import { Spacing } from '@/constants/theme';
import { insertSets, SETUP_RAW_NAME } from '@/db/database';
import { addDays } from '@/domain/engagement';
import { setProblem } from '@/domain/plausibility';
import { EQUIPMENT_PRESETS } from '@/domain/equipment';
import { EXERCISES_BY_ID } from '@/domain/exercises';
import { DEFAULT_PROFILE, EXPERIENCE_OPTIONS, GOAL_OPTIONS, POPULATION_MEANS, PROFILE_LIMITS, SESSION_MINUTE_OPTIONS, UNIT_OPTIONS, type Profile } from '@/domain/profile';
import { fromUnit, toUnit } from '@/domain/units';
import { COMBAT_SPORTS, SPORT_PROFILES, SPORTS } from '@/domain/sports';
import { useProfile } from '@/state/profile-context';

const STEPS = ['About you', 'Training', 'Your lifts', 'Schedule', 'Your week now', 'Equipment'] as const;

const SEED_LIFTS = [
  { id: 'back_squat', label: 'Squat' },
  { id: 'barbell_bench_press', label: 'Bench press' },
  { id: 'deadlift', label: 'Deadlift' },
] as const;
const SEED_RPE = 9;

export function Onboarding() {
  const { profile, update } = useProfile();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Profile>(profile ?? DEFAULT_PROFILE);
  const [preset, setPreset] = useState(EQUIPMENT_PRESETS[0].id);
  const [picking, setPicking] = useState(false);
  const band = useBand();
  const db = useSQLiteContext();
  const [seeds, setSeeds] = useState<Record<string, { kg?: number; reps?: number }>>({});
  const set = (change: Partial<Profile>) => setDraft((d) => ({ ...d, ...change }));

  const setSex = (sex: Profile['sex']) =>
    setDraft((d) => {
      const old = POPULATION_MEANS[d.sex];
      const untouched = d.heightCm === old.heightCm && d.bodyweightKg === old.bodyweightKg;
      return untouched ? { ...d, sex, ...POPULATION_MEANS[sex] } : { ...d, sex };
    });

  const finish = async () => {
    const today = localToday();
    const lastSunday = addDays(today, -(((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1));
    const seeded = SEED_LIFTS.flatMap((l, i) => {
      const v = seeds[l.id];
      if (!v?.kg || !v.reps) return [];
      const kg = fromUnit(v.kg, draft.unit);
      if (setProblem({ exerciseId: l.id, weightKg: kg, reps: v.reps, rpe: null, rir: null })) return [];
      return [{ date: addDays(lastSunday, -i), exerciseId: l.id, setIndex: 1, reps: v.reps, weightKg: kg, rpe: SEED_RPE, rir: null, source: 'log' as const, rawName: SETUP_RAW_NAME, kind: 'working' as const }];
    });
    if (seeded.length) await insertSets(db, seeded);
    const setup = EQUIPMENT_PRESETS.find((p) => p.id === preset)!.setup;
    update({ ...draft, equipment: { ...setup, custom: draft.equipment.custom }, confirmed: true });
  };

  if (picking) {
    return (
      <Screen title="Exercises you currently do" tabs={false}>
        <Button title="Cancel" variant="secondary" onPress={() => setPicking(false)} />
        <ExercisePicker
          onPick={(e) => {
            set({ preferredExercises: [...new Set([...draft.preferredExercises, e.id])] });
            setPicking(false);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title={STEPS[step]} subtitle={`Step ${step + 1} of ${STEPS.length}`} tabs={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Used to estimate your starting weights.
            </ThemedText>
            <Segmented label="Units" mono value={draft.unit} onChange={(u) => set({ unit: u })} options={UNIT_OPTIONS} />
            <Segmented label="Sex" value={draft.sex} onChange={setSex} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
            <View style={styles.row}>
              <NumberField label="Age" min={PROFILE_LIMITS.ageYears.min} max={PROFILE_LIMITS.ageYears.max} value={draft.ageYears} onCommit={(v) => v !== undefined && set({ ageYears: v })} />
              <NumberField label="Height" unit="cm" min={PROFILE_LIMITS.heightCm.min} max={PROFILE_LIMITS.heightCm.max} value={draft.heightCm} onCommit={(v) => v !== undefined && set({ heightCm: v })} />
              <NumberField
                label="Bodyweight"
                unit={draft.unit}
                min={toUnit(PROFILE_LIMITS.bodyweightKg.min, draft.unit)}
                max={toUnit(PROFILE_LIMITS.bodyweightKg.max, draft.unit)}
                value={Math.round(toUnit(draft.bodyweightKg, draft.unit) * 10) / 10}
                onCommit={(v) => v !== undefined && set({ bodyweightKg: fromUnit(v, draft.unit) })}
              />
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Segmented label="Training age" value={draft.experience} onChange={(experience) => set({ experience })} options={EXPERIENCE_OPTIONS} />
            <Segmented label="Sport" value={draft.sport} onChange={(sport) => set({ sport })} options={SPORTS.map((s) => ({ value: s, label: SPORT_PROFILES[s].label }))} />
            {draft.sport === 'general' ? (
              <Segmented label="Goal" value={draft.goal} onChange={(goal) => set({ goal })} options={GOAL_OPTIONS} />
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Optional: a recent hard set (about 1 rep left) starts you from your own numbers. Not sure? Leave it blank.
            </ThemedText>
            {SEED_LIFTS.map((l) => (
              <View key={l.id} style={styles.row}>
                <NumberField
                  label={l.label}
                  unit={draft.unit}
                  min={1}
                  max={Math.round(toUnit(500, draft.unit))}
                  value={seeds[l.id]?.kg}
                  onCommit={(kg) => setSeeds((x) => ({ ...x, [l.id]: { ...x[l.id], kg } }))}
                />
                <NumberField
                  label="Reps"
                  min={1}
                  max={20}
                  value={seeds[l.id]?.reps}
                  onCommit={(reps) => setSeeds((x) => ({ ...x, [l.id]: { ...x[l.id], reps } }))}
                />
              </View>
            ))}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <ThemedText type="label" themeColor="textSecondary">
              Days you usually train
            </ThemedText>
            <WeekdayPicker value={draft.trainingDays} onChange={(trainingDays) => set({ trainingDays, daysPerWeek: trainingDays.length })} />
            {draft.experience === 'new' && draft.trainingDays.length >= 5 ? (
              <ThemedText type="caption" themeColor="textSecondary">
                Beginners are recommended to start with 2 to 3 days a week.
              </ThemedText>
            ) : null}
            {COMBAT_SPORTS.includes(draft.sport) ? (
              <>
                <ThemedText type="label" themeColor="textSecondary">
                  Practice days: sparring, pads, drilling
                </ThemedText>
                <WeekdayPicker label="Practice days" min={0} max={7} value={draft.matDays} onChange={(matDays) => set({ matDays })} />
              </>
            ) : null}
            <Segmented
              label="Minutes per workout"
              mono
              value={draft.sessionMinutes}
              onChange={(sessionMinutes) => set({ sessionMinutes })}
              options={SESSION_MINUTE_OPTIONS.map((m) => ({ value: m, label: String(m) }))}
            />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Have a routine? Set each day to match it. New to lifting? Leave it as is.
            </ThemedText>
            <WeekEditor profile={draft} onChange={setDraft} />
            <ThemedText type="label" themeColor="textSecondary">
              Exercises you currently do (optional)
            </ThemedText>
            {draft.preferredExercises.map((id, i) => (
              <View key={id} style={[styles.listRow, band(i)]}>
                <ThemedText style={styles.flex}>{EXERCISES_BY_ID[id]?.name ?? id}</ThemedText>
                <TextAction title="Remove" onPress={() => set({ preferredExercises: draft.preferredExercises.filter((x) => x !== id) })} />
              </View>
            ))}
            <Button title="Add an exercise" variant="secondary" onPress={() => setPicking(true)} />
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Segmented label="Where you train" value={preset} onChange={setPreset} options={EQUIPMENT_PRESETS.map((p) => ({ value: p.id, label: p.label }))} />
            <ThemedText type="small" themeColor="textSecondary">
              Using Strong or Hevy? Import your logs for a more personal plan.
            </ThemedText>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? <TextAction title="Back" onPress={() => setStep(step - 1)} /> : <View />}
      </View>
      <Button title={step < STEPS.length - 1 ? 'Next' : 'Build my plan'} onPress={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish())} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, paddingBottom: Spacing.four },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  footer: { flexDirection: 'row' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48, paddingHorizontal: Spacing.two },
  flex: { flex: 1 },
});
