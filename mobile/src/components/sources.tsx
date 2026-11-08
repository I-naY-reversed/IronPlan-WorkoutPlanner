import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen, useBand } from '@/components/screen';
import { TechniqueSection } from '@/components/evidence';
import { ThemedText } from '@/components/themed-text';
import { TextAction } from '@/components/ui/button';
import { Info } from '@/components/ui/info';
import { Spacing } from '@/constants/theme';
import { PAUSE_ALLOWANCE_WEEKS, periodNeeded, RETRO_PAUSES } from '@/domain/engagement';
import FITTED from '@/domain/fitted-priors.json';
import type { Profile } from '@/domain/profile';
import { SPORT_PROFILES } from '@/domain/sports';

type Source = { title: string; url?: string; used: string };

const GROUPS: { heading: string; items: Source[] }[] = [
  {
    heading: 'Volume and response',
    items: [
      { title: 'Pelland et al., weekly volume and frequency meta-regressions (OSF 6z3xu)', url: 'https://osf.io/6z3xu/', used: 'How strength gains flatten with weekly sets; default volume; gain rate for new lifters; set timing.' },
      { title: 'Steele et al. 2023, meta-analysis of variation (CC-BY 4.0)', url: 'https://osf.io/2h9ma/', used: 'How much individuals truly differ in response.' },
    ],
  },
  {
    heading: 'Effort',
    items: [
      { title: 'Robinson et al. 2024, proximity to failure (OSF 7knsj)', url: 'https://osf.io/7knsj/', used: 'Strength gains barely depend on reps in reserve, but hypertrophy does.' },
      { title: 'Halperin et al., accuracy in predicting reps to failure', url: 'https://sportrxiv.org/index.php/server/preprint/view/67', used: 'People under-predict reps left by about 0.95.' },
      { title: 'Warm-up ramp (coaching convention)', used: 'Empty bar, then about 50% × 5, 70% × 3, 85% × 1 of the working load, following the NSCA 1RM-testing pattern. Not fitted to data. Warm-ups never count as hard sets. A light set that is unrated or rated 4+ reps left counts as a warm-up when Epley puts it more than 5 reps short of failure (the hard-set threshold). In imports that is measured against the day’s heaviest set. In a workout it is measured against the low end of the likely range, before the first working set.' },
      { title: 'Grgic et al. 2020, 1RM test-retest reliability', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7367986/', used: 'Measurement noise of a 1RM (median 4.2%).' },
    ],
  },
  {
    heading: 'Strength levels and plateaus',
    items: [
      { title: 'OpenPowerlifting, drug-tested raw results (public domain)', url: 'https://openpowerlifting.gitlab.io/opl-csv/', used: 'Long-run progress and plateau by sex; sex gap in strength; deadlift-to-squat ratio; week-to-week noise; world-record marks (best classic lift at IPF and regional championships since 2019, by weight class).' },
      { title: 'Pre-training 1RMs in Pelland and Steele trial data', used: 'Starting weights by exercise, sex, age, bodyweight and experience.' },
      { title: 'Saeterbakken et al. 2011, 1RM of three chest presses (J Sports Sci 29:533)', url: 'https://www.semanticscholar.org/paper/6baff2f6f89f8d4ac73b7ef95eff820d9c56721d', used: 'Dumbbell bench 1RM 17% below barbell in 12 trained men. With Jackson 2012: dumbbell bench starts at 0.81 of the barbell estimate (half per dumbbell), with extra uncertainty.' },
      { title: 'Jackson 2012, barbell vs dumbbell bench 1RM in 56 men', url: 'https://arch.astate.edu/all-etd/866/', used: 'Dumbbell-to-barbell bench ratio (about 80%) and its spread.' },
      { title: 'CDC NHANES 2015–2018 anthropometric reference data', url: 'https://stacks.cdc.gov/view/cdc/100478', used: 'Default height and weight.' },
    ],
  },
  {
    heading: 'Sports',
    items: [
      { title: 'Androulakis-Korakakis et al. 2021, minimum effective dose in powerlifters', url: 'https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2021.713655/full', used: 'Squat 2×, bench 3×, deadlift 1× a week; 3–6 sets of 1–5 reps.' },
      { title: 'Schumann et al. 2022, concurrent training meta-analysis', url: 'https://sportrxiv.org/index.php/server/preprint/download/37/71/54', used: 'Explosive work first, and hard conditioning kept separate.' },
      { title: 'Chaabene et al. 2017, physical attributes of wrestlers (JSCR)', url: 'https://journals.lww.com/nsca-jscr/fulltext/2017/05000/physical_and_physiological_attributes_of.31.aspx', used: 'Grip and isometric strength priorities.' },
      { title: 'WHO 2020 physical activity guidelines', url: 'https://www.who.int/publications/i/item/9789240015128', used: 'Aerobic activity guidance.' },
      { title: 'Morton et al. 2018, protein supplementation meta-analysis (BJSM)', url: 'https://bjsm.bmj.com/content/52/6/376', used: 'Protein target: gains stop rising beyond about 1.62 g/kg/day (95% CI 1.03–2.20).' },
      { title: 'Nunes et al. 2022, protein intake and muscle mass meta-analysis', url: 'https://onlinelibrary.wiley.com/doi/full/10.1002/jcsm.12922', used: '1.6 g/kg/day or more gave small extra lean-mass gains in younger adults lifting.' },
      { title: 'Schoenfeld & Aragon 2018, protein per meal (JISSN)', url: 'https://www.tandfonline.com/doi/pdf/10.1186/s12970-018-0215-1', used: 'About 0.4 g/kg per meal over at least 4 meals.' },
    ],
  },
  {
    heading: 'Per-session dose',
    items: [
      { title: 'Pelland et al. data, per-session fit (fit_session.py)', url: 'https://osf.io/6z3xu/', used: 'Strength gains level off within a session (about 1–2 hard sets per muscle), so strength plans train priority muscles more often. Hypertrophy showed no per-session ceiling.' },
    ],
  },
  {
    heading: 'Coaching conventions (not fitted)',
    items: [
      { title: 'Sport practice', used: 'Leg-heavy sessions are placed away from the day before practice. Any that remain skip heavy barbell leg work. Explosive work stays.' },
      { title: 'After a big session', used: 'A muscle given 1.5× its planned session volume (and 3+ sets more) gets half its volume in the next session within two days.' },
      { title: 'Certainty labels', used: 'One day of data caps the label at "Known roughly", two to three days at "Known well". "Known closely" needs four or more.' },
      { title: 'Missed reps', used: 'Logged at RPE 10. The estimate can move down, but the bracket does not narrow on a miss.' },
    ],
  },
  {
    heading: 'Exercise library',
    items: [
      { title: 'Free Exercise DB (public domain)', url: 'https://github.com/yuhonas/free-exercise-db', used: 'Cross-check of which muscles each exercise trains.' },
      { title: 'Kubo et al. 2019, squat depth and muscle volume', used: 'Squats count for glutes and adductors, not hamstrings.' },
      { title: 'Ishøi et al. 2016 and Harøy et al. 2019, Copenhagen adduction', used: 'Adductor strength and fewer groin problems.' },
    ],
  },
];

export function Sources({ onBack, profile }: { onBack: () => void; profile: Pick<Profile, 'sport' | 'daysPerWeek' | 'periodWeeks'> }) {
  const band = useBand();
  const unit = profile.periodWeeks === 2 ? 'fortnight' : 'week';
  const needed = periodNeeded(profile.daysPerWeek, profile.periodWeeks);
  return (
    <Screen title="Evidence and sources">
      <TextAction title="Back to settings" onPress={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {GROUPS.map((g) => (
          <View key={g.heading} style={styles.group}>
            <ThemedText type="heading">{g.heading}</ThemedText>
            {g.items.map((s, i) => (
              <View key={s.title} style={[styles.item, band(i)]}>
                {s.url ? (
                  <Pressable accessibilityRole="link" onPress={() => Linking.openURL(s.url!)}>
                    <ThemedText type="smallBold" themeColor="link" style={styles.underline}>
                      {s.title}
                    </ThemedText>
                  </Pressable>
                ) : (
                  <ThemedText type="smallBold">{s.title}</ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  {s.used}
                </ThemedText>
              </View>
            ))}
          </View>
        ))}
        <TechniqueSection />
        <View style={styles.group}>
          <ThemedText type="heading">Model assumptions</ThemedText>
          {FITTED.decisions.map((d, i) => (
            <View key={d} style={[styles.item, band(i)]}>
              <ThemedText type="small" themeColor="textSecondary">
                {d}
              </ThemedText>
            </View>
          ))}
        </View>
        <View style={styles.group}>
          <ThemedText type="heading">Plan guidance</ThemedText>
          <Info title="Conditioning">{SPORT_PROFILES[profile.sport].conditioning.join(' ')}</Info>
          <Info title="Streak">
            A {unit} counts with {needed} sessions of 3 or more working sets. Miss some, and doing the missing sessions on
            top of the usual ones within two weeks makes it up. Black: kept. Grey: made up. Light: off. Dashed: in progress.
            Outline: missed. Weeks off: up to {PAUSE_ALLOWANCE_WEEKS} a year, with up to {RETRO_PAUSES} marked afterwards
            every 12 weeks.
          </Info>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, paddingBottom: Spacing.six },
  group: { gap: Spacing.two },
  item: { gap: Spacing.half, padding: Spacing.two },
  underline: { textDecorationLine: 'underline' },
});
