export type Design = 'Meta-analysis' | 'Systematic review' | 'Randomized trial' | 'Within-person trial' | 'Acute EMG study' | 'Review';
export type Confidence = 'strong' | 'moderate' | 'limited';

export type Study = {
  cite: string;
  title: string;
  journal: string;
  design: Design;
  n?: string;
  finding: string;
  url: string;
};

export const STUDIES = {
  schoenfeld2018focus: {
    cite: 'Schoenfeld et al. 2018', title: 'Differential effects of attentional focus strategies during long-term resistance training',
    journal: 'European Journal of Sport Science', design: 'Randomized trial', n: '27 untrained men analysed of 30, 8 weeks',
    finding: 'Focusing on squeezing the target muscle grew the elbow flexors nearly twice as much as focusing on moving the weight (12.4% vs 6.9%). Quad growth was similar either way.',
    url: 'https://doi.org/10.1080/17461391.2018.1447020',
  },
  calatayud2016: {
    cite: 'Calatayud et al. 2016', title: 'Importance of mind-muscle connection during progressive resistance training',
    journal: 'European Journal of Applied Physiology', design: 'Acute EMG study', n: '18 trained men',
    finding: 'Thinking about the chest or triceps during bench press raised that muscle’s activity at 20–60% of 1RM, but not at 80%.',
    url: 'https://doi.org/10.1007/s00421-015-3305-7',
  },
  grgic2021focusStrength: {
    cite: 'Grgic et al. 2021', title: 'Acute and Long-Term Effects of Attentional Focus Strategies on Muscular Strength: A Meta-Analysis',
    journal: 'Sports', design: 'Meta-analysis', n: '10 studies (7 acute, 3 training)',
    finding: 'Focusing on the outcome (pushing the floor away, moving the bar) gave more strength in the moment. Over weeks of training there was no significant overall difference. Lower-body strength may gain more with an outward focus, based on only three training studies.',
    url: 'https://doi.org/10.3390/sports9110153',
  },
  grgic2022focusEndurance: {
    cite: 'Grgic et al. 2022', title: 'Effects of Attentional Focus on Muscular Endurance: A Meta-Analysis',
    journal: 'International Journal of Environmental Research and Public Health', design: 'Meta-analysis', n: '5 studies, 139 people analysed',
    finding: 'People managed more reps to failure with an outward focus than with a focus on the muscle.',
    url: 'https://doi.org/10.3390/ijerph19010089',
  },
  vigotsky2022: {
    cite: 'Vigotsky et al. 2022', title: 'Longing for a Longitudinal Proxy: Acutely Measured Surface EMG Amplitude is not a Validated Predictor of Muscle Hypertrophy',
    journal: 'Sports Medicine', design: 'Review',
    finding: 'Higher EMG during an exercise has not been shown to reliably predict more growth over time, so "this lights up the muscle more" is weak evidence on its own.',
    url: 'https://doi.org/10.1007/s40279-021-01619-2',
  },
  haugen2023: {
    cite: 'Haugen et al. 2023', title: 'Effect of free-weight vs. machine-based strength training on maximal strength, hypertrophy and jump performance: a systematic review and meta-analysis',
    journal: 'BMC Sports Science, Medicine and Rehabilitation', design: 'Meta-analysis', n: '13 studies, 1,016 people',
    finding: 'Free weights and machines built similar muscle and strength overall, with no significant difference between them. Strength was specific: free-weight tests improved more with free-weight training.',
    url: 'https://doi.org/10.1186/s13102-023-00713-4',
  },
  heidel2022: {
    cite: 'Heidel et al. 2022', title: 'Machines and free weight exercises: a systematic review and meta-analysis comparing changes in muscle size, strength, and power',
    journal: 'Journal of Sports Medicine and Physical Fitness', design: 'Meta-analysis',
    finding: 'Free-weight training improved more on free-weight tests and machine training more on machine tests. There was no significant difference in muscle growth or power.',
    url: 'https://doi.org/10.23736/s0022-4707.21.12929-9',
  },
  hernandezBelmonte2023: {
    cite: 'Hernández-Belmonte et al. 2023', title: 'Free-Weight and Machine-Based Training Are Equally Effective on Strength and Hypertrophy: Challenging a Traditional Myth',
    journal: 'Medicine & Science in Sports & Exercise', design: 'Randomized trial', n: '36 trained men who completed, of 38, 8 weeks',
    finding: 'Barbell and machine versions of squat, bench press, prone row and shoulder press gave similar strength and growth, with no significant difference in joint discomfort.',
    url: 'https://doi.org/10.1249/mss.0000000000003271',
  },
  maeo2023: {
    cite: 'Maeo et al. 2023', title: 'Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position',
    journal: 'European Journal of Sport Science', design: 'Within-person trial', n: '21 adults, 12 weeks, MRI',
    finding: 'Overhead extensions grew the whole triceps about 1.4 times as much as pushdowns (+19.9% vs +13.9%), even though lighter weights were used.',
    url: 'https://doi.org/10.1080/17461391.2022.2100279',
  },
  maeo2021: {
    cite: 'Maeo et al. 2021', title: 'Greater Hamstrings Muscle Hypertrophy but Similar Damage Protection after Training at Long versus Short Muscle Lengths',
    journal: 'Medicine & Science in Sports & Exercise', design: 'Within-person trial', n: '20 adults, 12 weeks, MRI',
    finding: 'Seated leg curls grew the hamstrings more than lying leg curls (+14% vs +9%). The authors attribute this to the hamstrings working at longer lengths when seated.',
    url: 'https://doi.org/10.1249/mss.0000000000002523',
  },
  strey2026: {
    cite: 'Strey et al. 2026', title: 'Muscle hypertrophy from partial repetition at long vs. short muscle length: A systematic review and meta-analysis',
    journal: 'Sport Sciences for Health', design: 'Meta-analysis', n: '8 studies',
    finding: 'Partial reps in the stretched half of the movement grew more muscle than partial reps in the shortened half (a small effect).',
    url: 'https://doi.org/10.1007/s11332-025-01586-5',
  },
  pallares2021: {
    cite: 'Pallarés et al. 2021', title: 'Effects of range of motion on resistance training adaptations: A systematic review and meta-analysis',
    journal: 'Scandinavian Journal of Medicine & Science in Sports', design: 'Meta-analysis', n: '16 studies',
    finding: 'Full range of motion built more strength and more leg muscle than partial range of motion.',
    url: 'https://doi.org/10.1111/sms.14006',
  },
  kubo2019: {
    cite: 'Kubo et al. 2019', title: 'Effects of squat training with different depths on lower limb muscle volumes',
    journal: 'European Journal of Applied Physiology', design: 'Randomized trial', n: '17 men, 10 weeks, MRI',
    finding: 'Full squats grew the glutes about three times and the adductors about twice as much as half squats. Quad growth was similar in both groups. Neither grew the hamstrings or rectus femoris.',
    url: 'https://doi.org/10.1007/s00421-019-04181-y',
  },
  plotkin2023: {
    cite: 'Plotkin et al. 2023', title: 'Hip thrust and back squat training elicit similar gluteus muscle hypertrophy and transfer similarly to the deadlift',
    journal: 'Frontiers in Physiology', design: 'Randomized trial', n: '34 untrained adults analysed of 35, 9 weeks, MRI',
    finding: 'Squats and hip thrusts gave similar glute growth. Squats also grew the quads and adductors. Hip thrusts showed more glute EMG, which did not predict more growth.',
    url: 'https://doi.org/10.3389/fphys.2023.1279170',
  },
  ema2016: {
    cite: 'Ema et al. 2016', title: 'Unique activation of the quadriceps femoris during single- and multi-joint exercises',
    journal: 'European Journal of Applied Physiology', design: 'Acute EMG study', n: '15 men',
    finding: 'The rectus femoris (the quad that crosses the hip) was much more active in the leg extension than in the leg press, where its activity stayed low even at heavy loads.',
    url: 'https://doi.org/10.1007/s00421-016-3363-5',
  },
  andersen2014: {
    cite: 'Andersen et al. 2014', title: 'Effects of Grip Width on Muscle Strength and Activation in the Lat Pull-Down',
    journal: 'Journal of Strength and Conditioning Research', design: 'Acute EMG study', n: '15 men',
    finding: 'In the lat pulldown, narrow, medium and wide overhand grips activated the lats similarly. The widest grip lifted a little less.',
    url: 'https://doi.org/10.1097/jsc.0000000000000232',
  },
  lusk2010: {
    cite: 'Lusk et al. 2010', title: 'Grip Width and Forearm Orientation Effects on Muscle Activity During the Lat Pull-Down',
    journal: 'Journal of Strength and Conditioning Research', design: 'Acute EMG study', n: '12 men',
    finding: 'In the lat pulldown, an overhand grip activated the lats more than an underhand grip, whatever the grip width.',
    url: 'https://doi.org/10.1519/jsc.0b013e3181ddb0ab',
  },
  buonsenso2025: {
    cite: 'Buonsenso et al. 2025', title: 'Electromyographic Analysis of Back Muscle Activation During Lat Pulldown Exercise: Effects of Grip Variations and Forearm Orientation',
    journal: 'Journal of Functional Morphology and Kinesiology', design: 'Acute EMG study', n: '40 trained men',
    finding: 'Across seven lat pulldown grip and lean variations, lat activity did not differ significantly.',
    url: 'https://doi.org/10.3390/jfmk10030345',
  },
  saeterbakken2021: {
    cite: 'Saeterbakken et al. 2021', title: 'The Effect of Grip Width on Muscle Strength and Electromyographic Activity in Bench Press among Novice- and Resistance-Trained Men',
    journal: 'International Journal of Environmental Research and Public Health', design: 'Acute EMG study', n: '28 men',
    finding: 'Chest activity was similar across grips in 6-rep-max bench sets. A narrow grip lifted less, and a wide grip used the triceps less.',
    url: 'https://doi.org/10.3390/ijerph18126444',
  },
  larsen2021: {
    cite: 'Larsen et al. 2021', title: 'A Biomechanical Analysis of Wide, Medium, and Narrow Grip Width Effects on Kinematics, Horizontal Kinetics, and Muscle Activity on the Sticking Region in Recreationally Trained Males During 1-RM Bench Pressing',
    journal: 'Frontiers in Sports and Active Living', design: 'Acute EMG study', n: '14 trained men',
    finding: 'Wide and medium grips lifted a similar maximum, about 5–6% more than a narrow grip. Medium and narrow grips used more of the triceps than a wide grip.',
    url: 'https://doi.org/10.3389/fspor.2020.637066',
  },
  augustsson2003: {
    cite: 'Augustsson et al. 2003', title: 'Effect of Pre-Exhaustion Exercise on Lower-Extremity Muscle Activation During a Leg Press Exercise',
    journal: 'Journal of Strength and Conditioning Research', design: 'Acute EMG study', n: '17 men',
    finding: 'Doing leg extensions right before the leg press lowered quad activity and reps in the leg press instead of raising them.',
    url: 'https://doi.org/10.1519/00124278-200305000-00032',
  },
  keskin2025: {
    cite: 'Keskin et al. 2025', title: 'Equated volume load: similar improvements in muscle strength, endurance, and hypertrophy for traditional, pre-exhaustion, and drop sets in resistance training',
    journal: 'Sport Sciences for Health', design: 'Randomized trial', n: '53 men analysed of 56, 6 weeks',
    finding: 'With the same total work, straight sets, pre-exhaustion and drop sets gave similar gains in strength and muscle, with no significant difference between groups.',
    url: 'https://doi.org/10.1007/s11332-024-01281-x',
  },
  simao2012: {
    cite: 'Simão et al. 2012', title: 'Exercise Order in Resistance Training',
    journal: 'Sports Medicine', design: 'Review',
    finding: 'Whatever comes first in a session gets the most reps and the most progress, so order exercises by priority.',
    url: 'https://doi.org/10.2165/11597240-000000000-00000',
  },
  schoenfeld2017load: {
    cite: 'Schoenfeld et al. 2017', title: 'Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis',
    journal: 'Journal of Strength and Conditioning Research', design: 'Meta-analysis', n: '21 studies',
    finding: 'Light and heavy loads built similar muscle when sets went to failure. Heavy loads built more 1RM strength.',
    url: 'https://doi.org/10.1519/jsc.0000000000002200',
  },
  robinson2024: {
    cite: 'Robinson et al. 2024', title: 'Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions',
    journal: 'Sports Medicine', design: 'Meta-analysis', n: '26 studies for growth, 55 for strength',
    finding: 'Muscle growth rose as sets ended closer to failure. Strength gains depended little on it. Proximity to failure was estimated, so the authors advise caution.',
    url: 'https://doi.org/10.1007/s40279-024-02069-2',
  },
  refalo2023: {
    cite: 'Refalo et al. 2023', title: 'Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis',
    journal: 'Sports Medicine', design: 'Meta-analysis', n: '15 studies',
    finding: 'Training to failure showed at most a trivial advantage over non-failure training for muscle growth.',
    url: 'https://doi.org/10.1007/s40279-022-01784-y',
  },
  schoenfeld2015tempo: {
    cite: 'Schoenfeld et al. 2015', title: 'Effect of Repetition Duration During Resistance Training on Muscle Hypertrophy: A Systematic Review and Meta-Analysis',
    journal: 'Sports Medicine', design: 'Meta-analysis', n: '8 studies',
    finding: 'Reps lasting anywhere from 0.5 to 8 seconds built similar muscle. Very slow reps (over 10 seconds) looked worse.',
    url: 'https://doi.org/10.1007/s40279-015-0304-0',
  },
  enes2025: {
    cite: 'Enes et al. 2025', title: 'How Slow Should You Go? A Systematic Review With Meta-Analysis of the Effect of Resistance Training Repetition Tempo on Muscle Hypertrophy',
    journal: 'Journal of Strength and Conditioning Research', design: 'Meta-analysis', n: '14 studies',
    finding: 'Tempo had a minimal overall effect on growth.',
    url: 'https://doi.org/10.1519/jsc.0000000000005302',
  },
  singer2024: {
    cite: 'Singer et al. 2024', title: 'Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy',
    journal: 'Frontiers in Sports and Active Living', design: 'Meta-analysis', n: '9 studies',
    finding: 'Resting more than a minute between sets may help growth slightly. The analysis found no appreciable extra benefit beyond about 90 seconds, though the evidence is uncertain.',
    url: 'https://doi.org/10.3389/fspor.2024.1429789',
  },
  saraceni2020: {
    cite: 'Saraceni et al. 2020', title: 'To Flex or Not to Flex? Is There a Relationship Between Lumbar Spine Flexion During Lifting and Low Back Pain? A Systematic Review With Meta-analysis',
    journal: 'Journal of Orthopaedic & Sports Physical Therapy', design: 'Meta-analysis', n: '11 studies',
    finding: 'Low-quality evidence found that bending the lower back while lifting did not predict back pain.',
    url: 'https://doi.org/10.2519/jospt.2020.9218',
  },
  kassiano2025: {
    cite: 'Kassiano et al. 2025', title: 'Comparison of Muscle Growth and Dynamic Strength Adaptations Induced by Unilateral and Bilateral Resistance Training: A Systematic Review and Meta-analysis',
    journal: 'Sports Medicine', design: 'Meta-analysis', n: '9 studies',
    finding: 'One-limb and two-limb training showed no significant difference in muscle growth. Strength was specific to how you trained.',
    url: 'https://doi.org/10.1007/s40279-024-02169-z',
  },
  zabaletaKorta2023: {
    cite: 'Zabaleta-Korta et al. 2023', title: 'Regional Hypertrophy: The Effect of Exercises at Long and Short Muscle Lengths in Recreationally Trained Women',
    journal: 'Journal of Human Kinetics', design: 'Randomized trial', n: '31 women finished of 38, 9 weeks',
    finding: 'Preacher curls, hardest with the arm straight, increased distal elbow-flexor thickness while incline curls did not, but there was no significant difference between the groups. The result is tentative.',
    url: 'https://doi.org/10.5114/jhk/163561',
  },
} satisfies Record<string, Study>;

export type StudyId = keyof typeof STUDIES;

export type Topic = {
  id: string;
  title: string;
  question: string;
  answer: string;
  doThis: string[];
  confidence: Confidence;
  studies: StudyId[];
};

export const TOPICS: Topic[] = [
  {
    id: 'focus',
    title: 'Mind-muscle connection',
    question: 'Do I need to "feel" the muscle working?',
    answer:
      'It helps for small muscles on light to moderate sets, and gets in the way when you are trying to lift as much as possible. Focusing on the muscle raised its activity up to about 60% of 1RM but not at 80%, and over 8 weeks it nearly doubled elbow-flexor growth but made no significant difference for the quads. Focusing on the result of the lift gives more strength and more reps.',
    doThis: [
      'Isolation work (curls, raises, extensions, flyes): slow down, think about the muscle shortening and lengthening.',
      'Heavy compound lifts (squat, bench, deadlift): think about the result instead, like "push the floor away" or "drive the bar to the ceiling".',
      'You do not need to feel a burn for a set to count. Sets that end close to failure grow muscle either way.',
    ],
    confidence: 'moderate',
    studies: ['schoenfeld2018focus', 'calatayud2016', 'grgic2021focusStrength', 'grgic2022focusEndurance'],
  },
  {
    id: 'activation',
    title: 'Forcing a muscle to work',
    question: 'Is there a way to make sure a target muscle is really working?',
    answer:
      'The most reliable way is effort, not a trick. Muscle growth rises as sets end closer to failure, and light and heavy loads build similar muscle when sets are hard enough. Beyond that, choose an exercise where the target muscle is the limiting factor: the rectus femoris is far more active in a leg extension than in a leg press. Pre-exhausting a muscle with an isolation move before a compound lift did not raise its activity; it lowered it.',
    doThis: [
      'Take most sets to 1–2 reps short of failure. Going all the way to failure adds little.',
      'Pick a single-joint exercise when a muscle gets left out of compound lifts (leg extension for the front of the thigh, curls for biceps).',
      'Put the muscle you care most about first in the session, not after pre-exhausting it.',
      'Treat "this exercise activates more" claims from EMG studies with caution: EMG has not been shown to predict growth.',
    ],
    confidence: 'strong',
    studies: ['robinson2024', 'refalo2023', 'schoenfeld2017load', 'ema2016', 'augustsson2003', 'keskin2025', 'simao2012', 'vigotsky2022'],
  },
  {
    id: 'stretch',
    title: 'Range of motion and the stretch',
    question: 'How deep should each rep go?',
    answer:
      'Full range of motion beats partial range for strength and for leg growth. When you can only do part of a rep, the stretched half grows more than the shortened half. Exercises that load a muscle at long lengths, like overhead triceps extensions and seated leg curls, grew noticeably more muscle than versions that load it short.',
    doThis: [
      'Use the full range you can control, especially the bottom (stretched) part.',
      'Squat as deep as you can with good control: full squats grew the glutes and adductors far more than half squats.',
      'Prefer overhead triceps extensions over pushdowns and seated over lying leg curls when growth is the goal.',
      'When a set is nearly done, extra partial reps in the stretched position are a reasonable way to finish.',
    ],
    confidence: 'moderate',
    studies: ['pallares2021', 'strey2026', 'kubo2019', 'maeo2023', 'maeo2021', 'zabaletaKorta2023'],
  },
  {
    id: 'grip',
    title: 'Grip width and hand position',
    question: 'Does grip change which muscle works?',
    answer:
      'Much less than gym lore suggests. In lat pulldowns, lat activity is similar from narrow to wide grips, and an overhand grip may use the lats slightly more than underhand. In the bench press, a wide or medium grip lifts the most and a narrower grip shifts some work to the triceps. Chest activity barely changes.',
    doThis: [
      'Pulldowns: any grip from shoulder width to about twice shoulder width. Pick the one that feels best on your shoulders and elbows.',
      'Bench press: a medium to wide grip for the most strength. Go a little narrower to bias the triceps.',
      'Pull the bar to the front of your chest on pulldowns rather than behind the neck.',
    ],
    confidence: 'limited',
    studies: ['andersen2014', 'lusk2010', 'buonsenso2025', 'saeterbakken2021', 'larsen2021'],
  },
  {
    id: 'free_vs_machine',
    title: 'Free weights or machines',
    question: 'Are free weights better than machines?',
    answer:
      'For building muscle, no: meta-analyses of over a thousand people found similar growth, with no significant difference. Strength is specific, though: you get best at what you practise, so free-weight training builds more free-weight strength. IronPlan has no preference by default. Choose Free weights first in Settings if you want the plan to favour them, with machines filling the gaps.',
    doThis: [
      'If your gym has only a few machines, free weights can cover nearly every muscle.',
      'Use machines when they are safer for you to push hard, or to train a muscle free weights miss.',
      'If you compete or test with a barbell, keep the barbell lifts in your plan.',
    ],
    confidence: 'strong',
    studies: ['haugen2023', 'heidel2022', 'hernandezBelmonte2023'],
  },
  {
    id: 'tempo',
    title: 'Tempo and rest',
    question: 'How fast should I lift, and how long should I rest?',
    answer:
      'Tempo matters little: reps lasting anywhere from half a second to 8 seconds built similar muscle, and only very slow reps looked worse. Resting longer than a minute between sets may help a little. No appreciable extra benefit for growth was found past about 90 seconds, though the evidence is uncertain.',
    doThis: [
      'Lower the weight under control and lift it with intent. No need to count a slow tempo.',
      'Rest at least 1–2 minutes between hard sets, longer on heavy compound lifts.',
    ],
    confidence: 'strong',
    studies: ['schoenfeld2015tempo', 'enes2025', 'singer2024'],
  },
  {
    id: 'spine',
    title: 'Back position when lifting',
    question: 'Will a rounded back hurt me?',
    answer:
      'The evidence is weaker than the warnings. Reviews found that bending the lower back while lifting did not predict back pain, though the studies were low quality and mostly about everyday lifting rather than heavy barbells. A braced, fairly neutral back is still the sensible default for heavy lifts, without fear of every bit of rounding.',
    doThis: [
      'On heavy deadlifts and squats, brace your trunk and keep your back roughly neutral.',
      'Small amounts of rounding on lighter work are not a reason to panic.',
      'Stop and see a professional if a movement causes pain.',
    ],
    confidence: 'limited',
    studies: ['saraceni2020'],
  },
  {
    id: 'unilateral',
    title: 'One side at a time',
    question: 'Are single-arm and single-leg exercises worth doing?',
    answer:
      'They build similar muscle to two-limb versions, with no significant difference, so they are a good substitute when you lack a machine or a rack. Strength stays specific: single-leg work improves single-leg strength more.',
    doThis: [
      'No leg press or rack? Dumbbell split squats are a good stand-in for the quads and glutes.',
      'Start with your weaker side and match its reps on the other side.',
    ],
    confidence: 'moderate',
    studies: ['kassiano2025'],
  },
];

export type ExerciseNote = { text: string; studies: StudyId[] };

export const EXERCISE_EVIDENCE: Record<string, ExerciseNote[]> = {
  overhead_triceps_extension: [
    { text: 'Overhead extensions grew the triceps about 1.4 times as much as pushdowns in a 12-week MRI study.', studies: ['maeo2023'] },
  ],
  triceps_pushdown: [
    { text: 'For more triceps growth, swap some pushdowns for overhead extensions: they stretch the long head and grew more muscle.', studies: ['maeo2023'] },
  ],
  leg_curl: [
    { text: 'Use the seated version if you can: it grew the hamstrings more than lying leg curls.', studies: ['maeo2021'] },
  ],
  back_squat: [
    { text: 'Depth matters: full squats grew the glutes and adductors far more than half squats.', studies: ['kubo2019'] },
    { text: 'Think about the result ("push the floor away"). An outward focus gives more strength in the moment and may help lower-body strength over time.', studies: ['grgic2021focusStrength'] },
  ],
  front_squat: [{ text: 'Squat to full depth for the most glute and adductor growth.', studies: ['kubo2019'] }],
  goblet_squat: [{ text: 'Squat to full depth for the most glute and adductor growth.', studies: ['kubo2019'] }],
  hip_thrust: [
    { text: 'Hip thrusts and squats gave similar glute growth. Squats also grow the quads, so keep both if you can.', studies: ['plotkin2023'] },
  ],
  leg_press: [
    { text: 'The rectus femoris is much less active in the leg press than in the leg extension. Add leg extensions if you want the front of the thigh trained fully.', studies: ['ema2016'] },
  ],
  leg_extension: [
    { text: 'The rectus femoris, which the leg press mostly misses, is far more active here.', studies: ['ema2016'] },
  ],
  lat_pulldown: [
    { text: 'Grip width made little difference to lat activity. Use an overhand grip about 1–2 times shoulder width and pull to the front.', studies: ['andersen2014', 'lusk2010', 'buonsenso2025'] },
  ],
  barbell_bench_press: [
    { text: 'A medium to wide grip lifts the most. Narrower shifts work to the triceps, and chest activity stays similar.', studies: ['larsen2021', 'saeterbakken2021'] },
    { text: 'Heavy sets: focus on driving the bar. Light sets: focusing on the chest can raise its activity.', studies: ['calatayud2016'] },
  ],
  biceps_curl: [
    { text: 'Concentrating on squeezing the muscle nearly doubled elbow-flexor growth in an 8-week trial. Worth doing here.', studies: ['schoenfeld2018focus'] },
    { text: 'In one small trial, preacher curls increased distal elbow-flexor thickness, but not significantly more than incline curls. Treat this as tentative.', studies: ['zabaletaKorta2023'] },
  ],
  hammer_curl: [{ text: 'Concentrating on the working muscle helps on light isolation work like this.', studies: ['schoenfeld2018focus'] }],
  deadlift: [
    { text: 'Brace and keep a roughly neutral back on heavy sets. Small amounts of rounding have not been shown to cause back pain.', studies: ['saraceni2020'] },
  ],
  romanian_deadlift: [{ text: 'Lower until you feel a strong hamstring stretch: loading the stretched position builds more muscle.', studies: ['strey2026', 'pallares2021'] }],
  dumbbell_romanian_deadlift: [{ text: 'Lower until you feel a strong hamstring stretch: loading the stretched position builds more muscle.', studies: ['strey2026', 'pallares2021'] }],
  bulgarian_split_squat: [{ text: 'Single-leg work builds similar muscle to two-leg work.', studies: ['kassiano2025'] }],
  dumbbell_split_squat: [{ text: 'Single-leg work builds similar muscle to two-leg work, so this stands in well for a leg press or squat rack.', studies: ['kassiano2025'] }],
  machine_calf_raise: [{ text: 'Spend time in the stretch at the bottom. Stretched-position reps grew more muscle.', studies: ['strey2026'] }],
  dumbbell_calf_raise: [{ text: 'Spend time in the stretch at the bottom. Stretched-position reps grew more muscle.', studies: ['strey2026'] }],
  chest_fly: [{ text: 'On light isolation work, focusing on the chest can raise its activity.', studies: ['calatayud2016'] }],
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  limited: 'Limited evidence',
};

export const studiesFor = (ids: StudyId[]): Study[] => ids.map((id) => STUDIES[id]);
