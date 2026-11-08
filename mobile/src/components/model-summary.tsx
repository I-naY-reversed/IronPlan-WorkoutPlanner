import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useBand } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { KnowledgeDots, RangeBar } from '@/components/ui/bracket';
import { TextAction } from '@/components/ui/button';
import { Info } from '@/components/ui/info';
import { Spacing } from '@/constants/theme';
import type { ModelSummary } from '@/domain/generator';
import { proteinGuide } from '@/domain/nutrition';
import { certaintyWord } from '@/domain/prescription';
import type { Profile } from '@/domain/profile';

export function ModelSection({ model, settled, part = 'summary' }: { model: ModelSummary; settled: boolean; part?: 'summary' | 'details' }) {
  const gain = model.blockGainPct;
  const filled = Math.round(1 + 4 * model.learned);
  if (part === 'details') {
    return (
      <View style={styles.section}>
        <Fact index={0} label="How much stronger you can get" detail={settled ? 'before progress levels off, rough' : 'needs more logs to estimate'}>
          {settled ? (
            <Estimate value={model.potentialPct.mean} low={model.potentialPct.low} high={model.potentialPct.high} digits={0} prefix="+" unit="%" />
          ) : (
            <ThemedText type="num">–</ThemedText>
          )}
        </Fact>
        <Fact
          index={1}
          label="Hard sets per main muscle, each week"
          detail={`your plan's weekly target, ${model.volumeSource === 'model' ? 'experimental: where extra sets stop adding much' : 'research default'}; ${model.volumeSource === 'model' && model.lifts > 0 ? 'from your logs' : 'research average'}`}>
          <Estimate
            value={model.recommendedSets}
            low={model.volumeSource === 'model' ? model.recommendedSetsRange.low : undefined}
            high={model.volumeSource === 'model' ? model.recommendedSetsRange.high : undefined}
          />
        </Fact>
      </View>
    );
  }
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">What the app has learned</ThemedText>
      <KnowledgeDots
        filled={filled}
        label={
          model.lifts === 0
            ? 'How fast you progress: not learned yet. Research averages until a lift has 3 weeks of logs.'
            : model.lessCertain
              ? 'How fast you progress: less certain than at the start. Your recent logs fit both steady gains and a slowdown.'
              : `How fast you progress: ${certaintyWord(filled).toLowerCase()}, ${Math.round(model.learned * 100)}% learned from ${model.lifts} ${model.lifts === 1 ? 'lift' : 'lifts'}`
        }
      />
      {model.lifts === 0 ? <TextAction title="Import history from Strong or Hevy" onPress={() => router.push('/import')} /> : null}
      <Fact index={0} label="Your max, 4 weeks from now" detail={model.lifts === 0 ? 'expected rise from today, research average' : 'expected rise from today, from your logs'}>
        <Estimate value={gain.mean} low={gain.low} high={gain.high} prefix={gain.mean >= 0 ? '+' : ''} unit="%" />
      </Fact>
    </View>
  );
}

export function Estimate({ value, low, high, digits = 1, prefix = '', unit = '' }: { value: number; low?: number; high?: number; digits?: number; prefix?: string; unit?: string }) {
  const f = (x: number) => (Math.abs(x) >= 10 || digits === 0 ? Math.round(x).toString() : x.toFixed(digits));
  return (
    <View style={styles.estimate}>
      <ThemedText type="num">
        {prefix}
        {f(value)}
        {unit}
      </ThemedText>
      {low !== undefined && high !== undefined ? (
        <>
          <View style={styles.bar}>
            <RangeBar low={low} value={value} high={high} domain={[Math.min(0, low), Math.max(high * 1.25, value * 1.25, 1e-6)]} />
          </View>
          <ThemedText type="caption" themeColor="steel">
            likely {f(low)}–{f(high)}
            {unit}
          </ThemedText>
        </>
      ) : null}
    </View>
  );
}

export function ProteinSection({ profile }: { profile: Profile }) {
  const g = proteinGuide(profile);
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Protein to eat</ThemedText>
      <Fact index={0} label="Per day, to support muscle gain" detail={`about ${g.meals} meals of ${g.perMealGrams} g`}>
        <Estimate value={g.grams.mean} low={g.grams.low} high={g.grams.high} digits={0} unit=" g" />
      </Fact>
      <Info>
        About 1.6 g per kg of bodyweight a day{g.adjusted ? ' (of an adjusted weight, since per-kg targets overstate need at high bodyweight)' : ''}: in
        a meta-analysis of 49 trials, extra protein stopped adding muscle beyond about 1.6 g/kg, with 95% uncertainty from 1.0
        to 2.2. Aiming near the top covers most people. More than that adds nothing measurable. Spread it over about{' '}
        {g.meals} meals. Needs are higher when eating less to lose weight. Not medical advice. Check with a doctor if you have
        kidney disease or are pregnant.
      </Info>
    </View>
  );
}

function Fact({ index, label, detail, children }: { index: number; label: string; detail: string; children: React.ReactNode }) {
  const band = useBand();
  return (
    <View style={[styles.fact, band(index)]}>
      <View style={styles.flex}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  flex: { flex: 1 },
  estimate: { alignItems: 'flex-end' },
  bar: { width: 110 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two },
});
