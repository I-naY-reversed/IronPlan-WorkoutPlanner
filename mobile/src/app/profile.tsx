import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ExercisePicker } from '@/components/exercise-picker';
import { OnCard, Screen, useBand } from '@/components/screen';
import { Sources } from '@/components/sources';
import { TechniqueLibrary } from '@/components/evidence';
import { ThemedText } from '@/components/themed-text';
import { Button, TextAction } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number-field';
import { Segmented } from '@/components/ui/segmented';
import { TabBar } from '@/components/ui/tab-bar';
import { WeekdayPicker } from '@/components/ui/weekday-picker';
import { Info } from '@/components/ui/info';
import { WeekEditor } from '@/components/week-editor';
import { Fonts, Radius, Spacing, TypeScale } from '@/constants/theme';
import { defaultIncrementKg, EQUIPMENT_INFO, minLoadKg, EQUIPMENT_KINDS, EQUIPMENT_PRESETS, type CustomEquipment, type EquipmentKind, type LoadSettings } from '@/domain/equipment';
import { EXERCISES_BY_ID } from '@/domain/exercises';
import { displayMode, EXPERIENCE_OPTIONS, GOAL_OPTIONS, POPULATION_MEANS, PROFILE_LIMITS, LOAD_PREFERENCE_OPTIONS, loadPreferenceOf, REMINDER_OPTIONS, SESSION_MINUTE_OPTIONS, TIME_OPTIONS, UNIT_OPTIONS, VOLUME_OPTIONS, type Profile } from '@/domain/profile';
import { allowReminders } from '@/state/reminders';
import { MAX_LOAD_KG } from '@/domain/plausibility';
import { formatLoad, fromUnit, toUnit } from '@/domain/units';
import { COMBAT_SPORTS, SPORT_PROFILES, SPORTS } from '@/domain/sports';
import { useTheme } from '@/hooks/use-theme';
import { deviceLanguage, LANGUAGES, t } from '@/i18n';
import { useProfile } from '@/state/profile-context';
import { inputStyle } from '@/components/ui/control';

export default function SettingsScreen() {
  const theme = useTheme();
  const band = useBand();
  const { profile, update: save } = useProfile();
  const [view, setView] = useState<'main' | 'exclude' | 'lock' | 'prefer' | 'sources' | 'technique'>('main');
  const [customName, setCustomName] = useState('');
  const [customKind, setCustomKind] = useState<EquipmentKind>('dumbbells');
  const [reminderNote, setReminderNote] = useState<string | null>(null);
  const [tab, setTab] = useState<'you' | 'training' | 'exercises' | 'equipment' | 'app'>('training');
  if (!profile) return null;
  const unit = profile.unit;
  const shown = (kg: number | undefined) => (kg === undefined ? undefined : Math.round(toUnit(kg, unit) * 10) / 10);
  const stored = (x: number | undefined) => (x === undefined ? undefined : fromUnit(x, unit));

  const update = (change: (p: Profile) => Profile) => save({ ...change(profile), confirmed: true });
  const setSex = (sex: Profile['sex']) =>
    update((p) => {
      const old = POPULATION_MEANS[p.sex];
      const untouched = p.heightCm === old.heightCm && p.bodyweightKg === old.bodyweightKg;
      return untouched ? { ...p, sex, ...POPULATION_MEANS[sex] } : { ...p, sex };
    });
  const toggleKind = (kind: EquipmentKind, on: boolean) =>
    update((p) => {
      const owned = { ...p.equipment.owned };
      if (on) owned[kind] = owned[kind] ?? {};
      else delete owned[kind];
      return { ...p, equipment: { ...p.equipment, owned } };
    });
  const setLoad = (kind: EquipmentKind, change: Partial<LoadSettings>) =>
    update((p) => ({ ...p, equipment: { ...p.equipment, owned: { ...p.equipment.owned, [kind]: { ...p.equipment.owned[kind], ...change } } } }));
  const setCustom = (id: string, change: Partial<CustomEquipment>) =>
    update((p) => ({ ...p, equipment: { ...p.equipment, custom: p.equipment.custom.map((c) => (c.id === id ? { ...c, ...change } : c)) } }));
  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    update((p) => ({ ...p, equipment: { ...p.equipment, custom: [...p.equipment.custom, { id: `custom-${Date.now()}`, name, worksLike: customKind }] } }));
    setCustomName('');
  };

  if (view === 'sources') return <Sources onBack={() => setView('main')} profile={profile} />;
  if (view === 'technique') return <TechniqueLibrary onBack={() => setView('main')} />;
  if (view === 'lock') {
    return (
      <Screen title="Lock an exercise" subtitle="Kept in your plan every week">
        <Button title="Cancel" variant="secondary" onPress={() => setView('main')} />
        <ExercisePicker
          onPick={(e) => {
            update((p) => ({ ...p, lockedExercises: [...new Set([...p.lockedExercises, e.id])], excludedExercises: p.excludedExercises.filter((x) => x !== e.id) }));
            setView('main');
          }}
        />
      </Screen>
    );
  }
  if (view === 'prefer') {
    return (
      <Screen title="Exercises you currently do" subtitle="Chosen ahead of similar ones where they fit">
        <Button title="Cancel" variant="secondary" onPress={() => setView('main')} />
        <ExercisePicker
          onPick={(e) => {
            update((p) => ({ ...p, preferredExercises: [...new Set([...p.preferredExercises, e.id])], excludedExercises: p.excludedExercises.filter((x) => x !== e.id) }));
            setView('main');
          }}
        />
      </Screen>
    );
  }
  if (view === 'exclude') {
    return (
      <Screen title="Avoid an exercise">
        <Button title="Cancel" variant="secondary" onPress={() => setView('main')} />
        <ExercisePicker
          onPick={(e) => {
            update((p) => ({ ...p, excludedExercises: [...new Set([...p.excludedExercises, e.id])], lockedExercises: p.lockedExercises.filter((x) => x !== e.id) }));
            setView('main');
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Settings">
      <TabBar
        value={tab}
        onChange={setTab}
        options={[
          { value: 'training', label: 'Training' },
          { value: 'you', label: 'You' },
          { value: 'exercises', label: 'Exercises' },
          { value: 'equipment', label: 'Equipment' },
          { value: 'app', label: 'App' },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {tab === 'you' ? (
          <Section title="About you">
            <Segmented label="Units" mono value={profile.unit} onChange={(u) => update((p) => ({ ...p, unit: u }))} options={UNIT_OPTIONS} />
            <Segmented label="Sex" value={profile.sex} onChange={setSex} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
            <View style={styles.row}>
              <NumberField label="Age" min={PROFILE_LIMITS.ageYears.min} max={PROFILE_LIMITS.ageYears.max} value={profile.ageYears} onCommit={(v) => v !== undefined && update((p) => ({ ...p, ageYears: v }))} />
              <NumberField label="Height" unit="cm" min={PROFILE_LIMITS.heightCm.min} max={PROFILE_LIMITS.heightCm.max} value={profile.heightCm} onCommit={(v) => v !== undefined && update((p) => ({ ...p, heightCm: v }))} />
              <NumberField label="Bodyweight" unit={unit} min={toUnit(PROFILE_LIMITS.bodyweightKg.min, unit)} max={toUnit(PROFILE_LIMITS.bodyweightKg.max, unit)} value={shown(profile.bodyweightKg)} onCommit={(v) => v !== undefined && update((p) => ({ ...p, bodyweightKg: fromUnit(v, unit) }))} />
            </View>
          </Section>
        ) : null}

        {tab === 'training' ? (
          <Section title="Experience and goal">
            <Segmented label="Training age" value={profile.experience} onChange={(experience) => update((p) => ({ ...p, experience }))} options={EXPERIENCE_OPTIONS} />
            <Segmented label="Sport" value={profile.sport} onChange={(sport) => update((p) => ({ ...p, sport }))} options={SPORTS.map((s) => ({ value: s, label: SPORT_PROFILES[s].label }))} />
            {profile.sport === 'general' ? (
              <Segmented label="Goal" value={profile.goal} onChange={(goal) => update((p) => ({ ...p, goal }))} options={GOAL_OPTIONS} />
            ) : null}
            <View style={styles.field}>
              <ThemedText type="label" themeColor="textSecondary">
                Training days
              </ThemedText>
              <WeekdayPicker value={profile.trainingDays} onChange={(trainingDays) => update((p) => ({ ...p, trainingDays, daysPerWeek: trainingDays.length }))} />
              {profile.experience === 'new' && profile.daysPerWeek >= 5 ? (
                <ThemedText type="caption" themeColor="textSecondary">
                  Beginners are recommended to start with 2 to 3 days a week.
                </ThemedText>
              ) : null}
            </View>
            {COMBAT_SPORTS.includes(profile.sport) ? (
              <View style={styles.field}>
                <ThemedText type="label" themeColor="textSecondary">
                  Practice days: sparring, pads, drilling
                </ThemedText>
                <WeekdayPicker label="Practice days" min={0} max={7} value={profile.matDays} onChange={(matDays) => update((p) => ({ ...p, matDays }))} />
              </View>
            ) : null}
            <Segmented
              label="Split"
              value={profile.split}
              onChange={(split) => update((p) => ({ ...p, split }))}
              options={[
                { value: 'auto', label: 'Recommended' },
                { value: 'ppl', label: 'Push / pull / legs' },
                { value: 'upper_lower', label: 'Upper / lower' },
                { value: 'lift_days', label: 'Squat / bench / deadlift days' },
                { value: 'full_body', label: 'Full body' },
                { value: 'custom', label: 'My own week' },
              ]}
            />
            <Segmented
              label="Usual minutes per workout"
              mono
              value={profile.sessionMinutes}
              onChange={(sessionMinutes) => update((p) => ({ ...p, sessionMinutes }))}
              options={SESSION_MINUTE_OPTIONS.map((m) => ({ value: m, label: String(m) }))}
            />
            <View style={styles.field}>
              <ThemedText type="label" themeColor="textSecondary">
                Your week: tap a day to change what it trains or how long it is
              </ThemedText>
              <WeekEditor profile={profile} onChange={(next) => update(() => next)} />
            </View>
            <Segmented label="Weekly volume" value={profile.volume} onChange={(volume) => update((p) => ({ ...p, volume }))} options={VOLUME_OPTIONS} />
            <ThemedText type="caption" themeColor="textSecondary">
              Less or More: 25% fewer or more sets, phased in.
            </ThemedText>
          </Section>
        ) : null}

        {tab === 'equipment' ? (
          <Section title="Equipment">
            <Segmented
              label="Preset"
              value={EQUIPMENT_PRESETS.find((x) => JSON.stringify(Object.keys(x.setup.owned).sort()) === JSON.stringify(Object.keys(profile.equipment.owned).sort()))?.id ?? ''}
              onChange={(id) => update((p) => ({ ...p, equipment: { ...EQUIPMENT_PRESETS.find((x) => x.id === id)!.setup, custom: p.equipment.custom } }))}
              options={EQUIPMENT_PRESETS.map((x) => ({ value: x.id, label: x.label }))}
            />
            <Segmented
              label="Prefer"
              value={loadPreferenceOf(profile)}
              onChange={(loadPreference) => update((p) => ({ ...p, loadPreference }))}
              options={LOAD_PREFERENCE_OPTIONS}
            />
            <Info title="Free weights or machines">
              Both build the same muscle, but strength carries over best to the tool you train with. With free weights first,
              the plan uses barbells, dumbbells and kettlebells where it can and fills gaps with your machines. Turn off what
              your gym does not have below.
            </Info>
            {EQUIPMENT_KINDS.map((kind, i) => {
              const owned = profile.equipment.owned[kind];
              const info = EQUIPMENT_INFO[kind];
              return (
                <View key={kind} style={[styles.equipment, band(i)]}>
                  <View style={styles.switchRow}>
                    <ThemedText style={styles.flex}>{info.label}</ThemedText>
                    <Switch
                      accessibilityLabel={info.label}
                      value={owned !== undefined}
                      onValueChange={(on) => toggleKind(kind, on)}
                      trackColor={{ true: theme.highlight, false: theme.backgroundSelected }}
                      thumbColor={owned !== undefined ? theme.text : theme.steel}
                      // @ts-expect-error
                      activeThumbColor={theme.text}
                    />
                  </View>
                  {owned && info.loaded ? (
                    <View style={styles.row}>
                      <NumberField label="Smallest increment" unit={unit} optional min={toUnit(0.25, unit)} max={toUnit(25, unit)} placeholder={formatLoad(defaultIncrementKg(kind, unit) ?? 0, unit)} value={shown(owned.incrementKg)} onCommit={(v) => setLoad(kind, { incrementKg: stored(v) })} />
                      <NumberField label="Max load" unit={unit} optional min={toUnit(minLoadKg(kind, unit) ?? 1, unit)} max={toUnit(MAX_LOAD_KG, unit)} placeholder="None" value={shown(owned.maxKg)} onCommit={(v) => setLoad(kind, { maxKg: stored(v) })} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Section>
        ) : null}

        {tab === 'equipment' ? (
          <Section title="Custom equipment">
            {profile.equipment.custom.map((c, i) => (
              <View key={c.id} style={[styles.equipment, band(i)]}>
                <View style={styles.switchRow}>
                  <View style={styles.flex}>
                    <ThemedText>{c.name}</ThemedText>
                    <ThemedText type="caption" themeColor="steel">
                      Works like {EQUIPMENT_INFO[c.worksLike].label.toLowerCase()}
                    </ThemedText>
                  </View>
                  <TextAction
                    title="Remove"
                    onPress={() => update((p) => ({ ...p, equipment: { ...p.equipment, custom: p.equipment.custom.filter((x) => x.id !== c.id) } }))}
                  />
                </View>
                {EQUIPMENT_INFO[c.worksLike].loaded ? (
                  <View style={styles.row}>
                    <NumberField label="Smallest increment" unit={unit} optional min={toUnit(0.25, unit)} max={toUnit(25, unit)} value={shown(c.incrementKg)} onCommit={(v) => setCustom(c.id, { incrementKg: stored(v) })} />
                    <NumberField label="Max load" unit={unit} optional min={toUnit(minLoadKg(c.worksLike, unit) ?? 1, unit)} max={toUnit(MAX_LOAD_KG, unit)} placeholder="None" value={shown(c.maxKg)} onCommit={(v) => setCustom(c.id, { maxKg: stored(v) })} />
                  </View>
                ) : null}
              </View>
            ))}
            <TextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder={t('Name, e.g. adjustable dumbbells')}
              placeholderTextColor={theme.steel}
              accessibilityLabel="Custom equipment name"
              style={[styles.textInput, { color: theme.text }, inputStyle(theme)]}
            />
            <Segmented label="Like" value={customKind} onChange={setCustomKind} options={EQUIPMENT_KINDS.map((k) => ({ value: k, label: EQUIPMENT_INFO[k].label }))} />
            <Button title="Add equipment" variant="secondary" onPress={addCustom} disabled={!customName.trim()} />
          </Section>
        ) : null}

        {tab === 'exercises' ? (
          <Section title="Exercises to avoid">
            {profile.excludedExercises.map((id, i) => (
              <View key={id} style={[styles.switchRow, styles.equipment, band(i)]}>
                <ThemedText style={styles.flex}>{EXERCISES_BY_ID[id]?.name ?? id}</ThemedText>
                <TextAction title="Allow" onPress={() => update((p) => ({ ...p, excludedExercises: p.excludedExercises.filter((x) => x !== id) }))} />
              </View>
            ))}
            <Button title="Add exercise to avoid" variant="secondary" onPress={() => setView('exclude')} />
          </Section>
        ) : null}

        {tab === 'exercises' ? (
          <Section title="Locked exercises">
            <ThemedText type="caption" themeColor="textSecondary">
              Kept every week.
            </ThemedText>
            {profile.lockedExercises.map((id, i) => (
              <View key={id} style={[styles.switchRow, styles.equipment, band(i)]}>
                <ThemedText style={styles.flex}>{EXERCISES_BY_ID[id]?.name ?? id}</ThemedText>
                <TextAction title="Unlock" onPress={() => update((p) => ({ ...p, lockedExercises: p.lockedExercises.filter((x) => x !== id) }))} />
              </View>
            ))}
            <Button title="Fix an exercise" variant="secondary" onPress={() => setView('lock')} />
          </Section>
        ) : null}

        {tab === 'training' ? (
          <Section title="Training time and reminders">
            <Segmented
              label="Usual training time"
              mono
              value={profile.trainingTime}
              onChange={(trainingTime) => update((p) => ({ ...p, trainingTime }))}
              options={[...new Set([...TIME_OPTIONS, profile.trainingTime])].sort().map((t) => ({ value: t, label: t }))}
            />
            <ThemedText type="caption" themeColor="textSecondary">
              Change single days in Your week.
            </ThemedText>
            <Segmented
              label="Reminder"
              value={profile.reminderMinutes ?? -1}
              onChange={async (v) => {
                if (v === -1) return update((p) => ({ ...p, reminderMinutes: null }));
                const ok = await allowReminders();
                if (!ok) {
                  setReminderNote('Notifications are off for Ironplan. Turn them on in your phone settings to get reminders.');
                  return;
                }
                setReminderNote(null);
                update((p) => ({ ...p, reminderMinutes: v }));
              }}
              options={REMINDER_OPTIONS}
            />
            <Info>
              Android may deliver them up to an hour late. No notifications will be sent on off weeks or after you have trained that
              day.
            </Info>
            {reminderNote ? (
              <ThemedText type="small" themeColor="textSecondary">
                {reminderNote}
              </ThemedText>
            ) : null}
          </Section>
        ) : null}

        {tab === 'app' ? (
          <Section title="Workout">
            <View style={styles.switchRow}>
              <ThemedText style={styles.flex}>Rest timer after each set</ThemedText>
              <Switch
                accessibilityLabel="Rest timer after each set"
                value={!!profile.restTimer}
                onValueChange={(restTimer) => update((p) => ({ ...p, restTimer }))}
                trackColor={{ true: theme.highlight, false: theme.backgroundSelected }}
                thumbColor={profile.restTimer ? theme.text : theme.steel}
                // @ts-expect-error
                activeThumbColor={theme.text}
              />
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              Times rest by exercise: about 3 min for heavy lifts, 1½ for small ones.
            </ThemedText>
          </Section>
        ) : null}

        {tab === 'app' ? (
          <Section title="Streak and records">
            <View style={styles.switchRow}>
              <ThemedText style={styles.flex}>Show streak and records</ThemedText>
              <Switch
                accessibilityLabel="Show streak, records and the first-4-weeks target"
                value={profile.showStreaks}
                onValueChange={(showStreaks) => update((p) => ({ ...p, showStreaks }))}
                trackColor={{ true: theme.highlight, false: theme.backgroundSelected }}
                thumbColor={profile.showStreaks ? theme.text : theme.steel}
                // @ts-expect-error
                activeThumbColor={theme.text}
              />
            </View>
            <Segmented
              label="Weeks start on"
              value={profile.weekStartDay}
              onChange={(weekStartDay) => update((p) => ({ ...p, weekStartDay }))}
              options={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ value: i, label: d }))}
            />
            <Segmented
              label="Count workouts per"
              value={profile.periodWeeks}
              onChange={(periodWeeks) => update((p) => ({ ...p, periodWeeks }))}
              options={[
                { value: 1, label: 'Week' },
                { value: 2, label: 'Two weeks' },
              ]}
            />
            <Info>
              Two-week periods suit rotating shifts. The streak never asks for more than your planned days, always leaves a rest
              day, and never changes your plan.
            </Info>
          </Section>
        ) : null}

        {tab === 'exercises' ? (
          <Section title="Exercises you currently do">
            <ThemedText type="caption" themeColor="textSecondary">
              Preferred where they fit, but they can rotate out.
            </ThemedText>
            {profile.preferredExercises.map((id, i) => (
              <View key={id} style={[styles.switchRow, styles.equipment, band(i)]}>
                <ThemedText style={styles.flex}>{EXERCISES_BY_ID[id]?.name ?? id}</ThemedText>
                <TextAction title="Remove" onPress={() => update((p) => ({ ...p, preferredExercises: p.preferredExercises.filter((x) => x !== id) }))} />
              </View>
            ))}
            <Button title="Add an exercise you do" variant="secondary" onPress={() => setView('prefer')} />
          </Section>
        ) : null}

        {tab === 'exercises' && Object.keys(profile.swaps).length > 0 ? (
          <Section title="Replaced exercises">
            {Object.entries(profile.swaps).map(([from, to], i) => (
              <View key={from} style={[styles.switchRow, styles.equipment, band(i)]}>
                <ThemedText style={styles.flex}>
                  {EXERCISES_BY_ID[from]?.name ?? from} → {EXERCISES_BY_ID[to]?.name ?? to}
                </ThemedText>
                <TextAction
                  title="Undo"
                  onPress={() =>
                    update((p) => {
                      const swaps = { ...p.swaps };
                      delete swaps[from];
                      return { ...p, swaps };
                    })
                  }
                />
              </View>
            ))}
          </Section>
        ) : null}

        {tab === 'app' ? (<>
          <Section title="Appearance">
            <Segmented
              label="Display"
              value={displayMode(profile)}
              onChange={(display) => update((p) => ({ ...p, display }))}
              options={[
                { value: 'simple', label: 'Simple' },
                { value: 'detailed', label: 'Detailed' },
              ]}
            />
            <ThemedText type="caption" themeColor="textSecondary">
              Simple uses plain words. Detailed shows RPE and the model&apos;s figures.
            </ThemedText>
            <Segmented
              label="Theme"
              value={profile.appearance}
              onChange={(appearance) => update((p) => ({ ...p, appearance }))}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
            <Segmented
              label="Colours"
              value={profile.colorTheme}
              onChange={(colorTheme) => update((p) => ({ ...p, colorTheme }))}
              options={[
                { value: 'plate', label: 'Plate' },
                { value: 'classic', label: 'Classic' },
              ]}
            />
            <Segmented
              label="Language"
              value={profile.language ?? deviceLanguage()}
              onChange={(language) => update((p) => ({ ...p, language }))}
              options={LANGUAGES}
            />
          </Section>

          <Section title="Training history">
            <ThemedText type="caption" themeColor="textSecondary">
              From Strong, Hevy or any CSV.
            </ThemedText>
            <Button title="Import history" variant="secondary" onPress={() => router.push('/import')} />
          </Section>

          <View style={styles.field}>
            <Pressable accessibilityRole="link" onPress={() => setView('technique')} style={styles.link}>
              <ThemedText themeColor="link" style={styles.underline}>
                Technique research
              </ThemedText>
              <ThemedText type="caption" themeColor="steel">
                Form, grip, mind-muscle connection and exercise choice, from peer-reviewed studies
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Pressable accessibilityRole="link" onPress={() => setView('sources')} style={styles.link}>
              <ThemedText themeColor="link" style={styles.underline}>
                Evidence and sources
              </ThemedText>
              <ThemedText type="caption" themeColor="steel">
                Where every number in the plan comes from
              </ThemedText>
            </Pressable>
          </View>
        </>) : null}
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <OnCard.Provider value>
      <View style={[styles.section, styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="heading">{title}</ThemedText>
        {children}
      </View>
    </OnCard.Provider>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.three },
  card: { borderRadius: Radius.button, padding: Spacing.three },
  field: { gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  equipment: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 44 },
  flex: { flex: 1 },
  textInput: { minHeight: 48, borderRadius: Radius.input, paddingHorizontal: Spacing.two + Spacing.one, fontFamily: Fonts.regular, fontSize: TypeScale.md },
  link: { gap: Spacing.half, paddingVertical: Spacing.two },
  underline: { textDecorationLine: 'underline' },
});
