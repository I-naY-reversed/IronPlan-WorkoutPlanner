// Peer-reviewed evidence behind the technique notes and exercise choices.
// Findings are paraphrased. Each topic says how sure the research is, so the app
// never presents a single acute EMG study as settled fact.

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
    journal: 'European Journal of Sport Science', design: 'Randomized trial', n: '30 untrained men, 8 weeks',
    finding: 'Focusing on squeezing the target muscle grew the elbow flexors about twice as much as focusing on moving the weight (12.4% vs 6.9%). Quad growth was the same either way.',
    url: 'https://consensus.app/papers/details/f99dd4aaf0fa569da2535744f9437979/',
  },
  calatayud2016: {
    cite: 'Calatayud et al. 2016', title: 'Importance of mind-muscle connection during progressive resistance training',
    journal: 'European Journal of Applied Physiology', design: 'Acute EMG study', n: '18 trained men',
    finding: 'Thinking about the chest or triceps during bench press raised that muscle’s activity at 20–60% of 1RM, but not at 80%.',
    url: 'https://consensus.app/papers/details/803294acf55958de8a317840fdd30dba/',
  },
  grgic2021focusStrength: {
    cite: 'Grgic et al. 2021', title: 'Acute and long-term effects of attentional focus strategies on muscular strength: a meta-analysis',
    journal: 'Sports', design: 'Meta-analysis', n: '10 studies',
    finding: 'Focusing on the outcome (pushing the floor away, moving the bar) gave more strength in the moment. Over weeks of training there was no overall difference, except lower-body strength gained more with an outward focus.',
    url: 'https://consensus.app/papers/details/980b95c9ebed54fda580ee53ca6c44c6/',
  },
  grgic2021focusEndurance: {
    cite: 'Grgic et al. 2021', title: 'Effects of attentional focus on muscular endurance: a meta-analysis',
    journal: 'International Journal of Environmental Research and Public Health', design: 'Meta-analysis',
    finding: 'People managed more reps to failure with an outward focus than with a focus on the muscle.',
    url: 'https://consensus.app/papers/details/e0e9b674ad4355d2b04a83ae8e797dc0/',
  },
  vigotsky2022: {
    cite: 'Vigotsky et al. 2022', title: 'Acutely measured surface EMG amplitude is not a validated predictor of muscle hypertrophy',
    journal: 'Sports Medicine', design: 'Review',
    finding: 'Higher EMG during an exercise has not been shown to predict more growth over time, so "this lights up the muscle more" is weak evidence on its own.',
    url: 'https://consensus.app/papers/details/d8752ea6c5875e5b92181d23d4e4dbc6/',
  },
  haugen2023: {
    cite: 'Haugen et al. 2023', title: 'Effect of free-weight vs. machine-based strength training on maximal strength, hypertrophy and jump performance',
    journal: 'BMC Sports Science, Medicine and Rehabilitation', design: 'Meta-analysis', n: '13 studies, 1,016 people',
    finding: 'Free weights and machines built the same muscle and the same strength overall. Strength was specific: people got better at whichever tool they trained with.',
    url: 'https://consensus.app/papers/details/f6e9450b2d315742a1a3fd47288f454a/',
  },
  heidel2021: {
    cite: 'Heidel et al. 2021', title: 'Machines and free weight exercises: a systematic review and meta-analysis',
    journal: 'Journal of Sports Medicine and Physical Fitness', design: 'Meta-analysis',
    finding: 'Free-weight training won on free-weight tests and machine training won on machine tests. Muscle growth and power were the same.',
    url: 'https://consensus.app/papers/details/8ff2bb6754f2544fb5bd6f0d0081218c/',
  },
  hernandezBelmonte2023: {
    cite: 'Hernández-Belmonte et al. 2023', title: 'Free-weight and machine-based training are equally effective on strength and hypertrophy',
    journal: 'Medicine & Science in Sports & Exercise', design: 'Randomized trial', n: '38 trained men, 8 weeks',
    finding: 'Barbell and machine versions of squat, bench, row and shoulder press gave the same strength, the same growth and no difference in joint discomfort.',
    url: 'https://consensus.app/papers/details/7d28d8dbb6fc5e1e82de22a69058c891/',
  },
  maeo2022: {
    cite: 'Maeo et al. 2022', title: 'Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position',
    journal: 'European Journal of Sport Science', design: 'Within-person trial', n: '21 adults, 12 weeks, MRI',
    finding: 'Overhead extensions grew the whole triceps about 1.4 times as much as pushdowns (+19.9% vs +13.9%), even though lighter weights were used.',
    url: 'https://consensus.app/papers/details/60c0db596c4858c9af327b98318c102c/',
  },
  maeo2020: {
    cite: 'Maeo et al. 2020', title: 'Greater hamstrings muscle hypertrophy but similar damage protection after training at long versus short muscle lengths',
    journal: 'Medicine & Science in Sports & Exercise', design: 'Within-person trial', n: '20 adults, 12 weeks, MRI',
    finding: 'Seated leg curls grew the hamstrings more than lying leg curls (+14% vs +9%), because sitting stretches the hamstrings at the hip.',
    url: 'https://consensus.app/papers/details/64605c1a16355356b5f788524c718bf8/',
  },
  strey2026: {
    cite: 'Strey et al. 2026', title: 'Muscle hypertrophy from partial repetition at long vs. short muscle length',
    journal: 'Sport Sciences for Health', design: 'Meta-analysis', n: '8 studies',
    finding: 'Partial reps in the stretched half of the movement grew more muscle than partial reps in the shortened half (a small effect).',
    url: 'https://consensus.app/papers/details/c53fd1602de75c9eb021cbd7e720a59e/',
  },
  pallares2021: {
    cite: 'Pallarés et al. 2021', title: 'Effects of range of motion on resistance training adaptations',
    journal: 'Scandinavian Journal of Medicine & Science in Sports', design: 'Meta-analysis', n: '16 studies',
    finding: 'Full range of motion built more strength and more leg muscle than partial range of motion.',
    url: 'https://consensus.app/papers/details/87403619343b5ebfb51ec34b4e833a65/',
  },
  kubo2019: {
    cite: 'Kubo et al. 2019', title: 'Effects of squat training with different depths on lower limb muscle volumes',
    journal: 'European Journal of Applied Physiology', design: 'Randomized trial', n: '17 men, 10 weeks, MRI',
    finding: 'Full squats grew the glutes about three times and the adductors about twice as much as half squats. Quads grew equally. Neither grew the hamstrings or rectus femoris.',
    url: 'https://consensus.app/papers/details/31ecf7a95b1c584da565dc9013c1f864/',
  },
  plotkin2023: {
    cite: 'Plotkin et al. 2023', title: 'Hip thrust and back squat training elicit similar gluteus muscle hypertrophy and transfer similarly to the deadlift',
    journal: 'Frontiers in Physiology', design: 'Randomized trial', n: '34 untrained adults, 9 weeks, MRI',
    finding: 'Squats and hip thrusts grew the glutes about the same. Squats also grew the quads and adductors. Hip thrusts showed more glute EMG, which did not predict more growth.',
    url: 'https://consensus.app/papers/details/7e990ce959d45b929c847edd64924a97/',
  },
  ema2016: {
    cite: 'Ema et al. 2016', title: 'Unique activation of the quadriceps femoris during single- and multi-joint exercises',
    journal: 'European Journal of Applied Physiology', design: 'Acute EMG study',
    finding: 'The rectus femoris (the quad that crosses the hip) works little in the leg press even when heavy, but works hard in the leg extension.',
    url: 'https://consensus.app/papers/details/e24d348d6629548fa073c7b41874de4d/',
  },
  andersen2014: {
    cite: 'Andersen et al. 2014', title: 'Effects of grip width on muscle strength and activation in the lat pull-down',
    journal: 'Journal of Strength and Conditioning Research', design: 'Acute EMG study', n: '15 men',
    finding: 'Narrow, medium and wide pronated grips activated the lats about the same. The widest grip lifted a little less.',
    url: 'https://consensus.app/papers/details/5014aa1b9ee05b79b5cd22a85f45138d/',
  },
  lusk2010: {
    cite: 'Lusk et al. 2010', title: 'Grip width and forearm orientation effects on muscle activity during the lat pull-down',
    journal: 'Journal of Strength and Conditioning Research', design: 'Acute EMG study', n: '12 men',
    finding: 'An overhand grip activated the lats more than an underhand grip. Grip width made no difference.',
    url: 'https://consensus.app/papers/details/11f027656a3f57d587cd8defe9a709a2/',
  },
  buonsenso2025: {
    cite: 'Buonsenso et al. 2025', title: 'Electromyographic analysis of back muscle activation during lat pulldown: effects of grip variations',
    journal: 'Journal of Functional Morphology and Kinesiology', design: 'Acute EMG study', n: '40 trained men',
    finding: 'Across seven grip and lean variations, lat activity did not differ.',
    url: 'https://consensus.app/papers/details/bb894945e21054af851ef4b538705c10/',
  },
  saeterbakken2021: {
    cite: 'Saeterbakken et al. 2021', title: 'The effect of grip width on muscle strength and electromyographic activity in bench press',
    journal: 'International Journal of Environmental Research and Public Health', design: 'Acute EMG study', n: '28 men',
    finding: 'Chest activity was similar across grips. A narrow grip lifted less, and a wide grip used the triceps less.',
    url: 'https://consensus.app/papers/details/b700466152115ce78ecec0e5b6bdad2b/',
  },
  larsen2021: {
    cite: 'Larsen et al. 2021', title: 'Wide, medium, and narrow grip width effects on 1-RM bench pressing',
    journal: 'Frontiers in Sports and Active Living', design: 'Acute EMG study', n: '14 trained men',
    finding: 'Wide and medium grips lifted about the same maximum, about 6% more than a narrow grip. Narrower grips used more triceps.',
    url: 'https://consensus.app/papers/details/9b1a8f8ed30350c7bc18feb2566a93a9/',
  },
  augustsson2003: {
    cite: 'Augustsson et al. 2003', title: 'Effect of pre-exhaustion exercise on lower-extremity muscle activation during a leg press exercise',
    journal: 'Journal of Strength and Conditioning Research', design: 'Acute EMG study', n: '17 men',
    finding: 'Doing leg extensions right before the leg press lowered quad activity and reps in the leg press instead of raising them.',
    url: 'https://consensus.app/papers/details/0c66f967c3745ffebcbb9ab9c94ad56d/',
  },
  keskin2024: {
    cite: 'Keskin et al. 2024', title: 'Equated volume load: similar improvements for traditional, pre-exhaustion, and drop sets',
    journal: 'Sport Sciences for Health', design: 'Randomized trial', n: '53 trained men, 6 weeks',
    finding: 'With the same total work, straight sets, pre-exhaustion and drop sets built the same strength and muscle.',
    url: 'https://consensus.app/papers/details/c7670300fc3255f89acfa03cf863a851/',
  },
  simao2012: {
    cite: 'Simão et al. 2012', title: 'Exercise order in resistance training',
    journal: 'Sports Medicine', design: 'Review',
    finding: 'Whatever comes first in a session gets the most reps and the most progress, so order exercises by priority.',
    url: 'https://consensus.app/papers/details/0f3dce0a088c592dbef30610b46a29b7/',
  },
  schoenfeld2017load: {
    cite: 'Schoenfeld et al. 2017', title: 'Strength and hypertrophy adaptations between low- vs. high-load resistance training',
    journal: 'Journal of Strength and Conditioning Research', design: 'Meta-analysis', n: '21 studies',
    finding: 'Light and heavy loads built the same muscle when sets went to failure. Heavy loads built more maximal strength.',
    url: 'https://consensus.app/papers/details/96414ceacb2e56edb3a95330892f781f/',
  },
  robinson2024: {
    cite: 'Robinson et al. 2024', title: 'Dose–response between proximity to failure, strength gain, and muscle hypertrophy',
    journal: 'Sports Medicine', design: 'Meta-analysis',
    finding: 'Muscle growth rose as sets ended closer to failure. Strength gains barely depended on it.',
    url: 'https://consensus.app/papers/details/57d3863cb2ff54ce95ae91cd5c4e2e35/',
  },
  refalo2022: {
    cite: 'Refalo et al. 2022', title: 'Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy',
    journal: 'Sports Medicine', design: 'Meta-analysis', n: '15 studies',
    finding: 'Going all the way to failure gave at most a trivial extra benefit over stopping a rep or two short.',
    url: 'https://consensus.app/papers/details/f96cb437a7e95e72a2ab3b26becd407c/',
  },
  schoenfeld2015tempo: {
    cite: 'Schoenfeld et al. 2015', title: 'Effect of repetition duration during resistance training on muscle hypertrophy',
    journal: 'Sports Medicine', design: 'Meta-analysis', n: '8 studies',
    finding: 'Reps lasting anywhere from 0.5 to 8 seconds built similar muscle. Very slow reps (over 10 seconds) looked worse.',
    url: 'https://consensus.app/papers/details/578911a0dd2558e5a930ff9f7a9fef1b/',
  },
  enes2025: {
    cite: 'Enes et al. 2025', title: 'How slow should you go? Repetition tempo and muscle hypertrophy',
    journal: 'Journal of Strength and Conditioning Research', design: 'Meta-analysis', n: '14 studies',
    finding: 'Tempo had a minimal effect on growth.',
    url: 'https://consensus.app/papers/details/354e30090b8258b6ad97913857e133d5/',
  },
  singer2024: {
    cite: 'Singer et al. 2024', title: 'Give it a rest: inter-set rest interval duration and muscle hypertrophy',
    journal: 'Frontiers in Sports and Active Living', design: 'Meta-analysis', n: '9 studies',
    finding: 'Resting more than a minute between sets helped growth slightly. Beyond about 90 seconds made no further difference.',
    url: 'https://consensus.app/papers/details/7e24ba9ec7d15452aa06c56bdd2d7483/',
  },
  saraceni2020: {
    cite: 'Saraceni et al. 2020', title: 'To flex or not to flex? Lumbar spine flexion during lifting and low back pain',
    journal: 'Journal of Orthopaedic & Sports Physical Therapy', design: 'Meta-analysis',
    finding: 'Low-quality evidence found that bending the lower back while lifting did not predict back pain.',
    url: 'https://consensus.app/papers/details/475612e15e2259598a62d2b60c49a3b2/',
  },
  kassiano2025: {
    cite: 'Kassiano et al. 2025', title: 'Muscle growth and strength adaptations from unilateral and bilateral resistance training',
    journal: 'Sports Medicine', design: 'Meta-analysis', n: '9 studies',
    finding: 'One-limb and two-limb training built the same muscle. Strength was specific to how you trained.',
    url: 'https://consensus.app/papers/details/8968e942b54a5f39a93ec4b40299e7f3/',
  },
  zabaletaKorta2023: {
    cite: 'Zabaleta-Korta et al. 2023', title: 'Regional hypertrophy: exercises at long and short muscle lengths in trained women',
    journal: 'Journal of Human Kinetics', design: 'Randomized trial', n: '38 women, 9 weeks',
    finding: 'Preacher curls, hardest with the arm straight, grew the lower biceps. Incline curls did not show significant growth.',
    url: 'https://consensus.app/papers/details/d67a1af1562b5444b9492b45567021ca/',
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
      'It helps for small muscles on light to moderate sets, and gets in the way when you are trying to lift as much as possible. Focusing on the muscle raised its activity up to about 60% of 1RM but not at 80%, and over 8 weeks it doubled biceps growth but did nothing extra for the quads. Focusing on the result of the lift gives more strength and more reps.',
    doThis: [
      'Isolation work (curls, raises, extensions, flyes): slow down, think about the muscle shortening and lengthening.',
      'Heavy compound lifts (squat, bench, deadlift): think about the result instead, like "push the floor away" or "drive the bar to the ceiling".',
      'You do not need to feel a burn for a set to count. Sets that end close to failure grow muscle either way.',
    ],
    confidence: 'moderate',
    studies: ['schoenfeld2018focus', 'calatayud2016', 'grgic2021focusStrength', 'grgic2021focusEndurance'],
  },
  {
    id: 'activation',
    title: 'Forcing a muscle to work',
    question: 'Is there a way to make sure a target muscle is really working?',
    answer:
      'The most reliable way is effort, not a trick. Muscle growth rises as sets end closer to failure, and light and heavy loads build similar muscle when sets are hard enough. Beyond that, choose an exercise where the target muscle is the limiting factor: the rectus femoris barely works in a leg press but works hard in a leg extension. Pre-exhausting a muscle with an isolation move before a compound lift did not raise its activity; it lowered it.',
    doThis: [
      'Take most sets to 1–2 reps short of failure. Going all the way to failure adds little.',
      'Pick a single-joint exercise when a muscle gets left out of compound lifts (leg extension for the front of the thigh, curls for biceps).',
      'Put the muscle you care most about first in the session, not after pre-exhausting it.',
      'Treat "this exercise activates more" claims from EMG studies with caution: EMG has not been shown to predict growth.',
    ],
    confidence: 'strong',
    studies: ['robinson2024', 'refalo2022', 'schoenfeld2017load', 'ema2016', 'augustsson2003', 'keskin2024', 'simao2012', 'vigotsky2022'],
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
    studies: ['pallares2021', 'strey2026', 'kubo2019', 'maeo2022', 'maeo2020', 'zabaletaKorta2023'],
  },
  {
    id: 'grip',
    title: 'Grip width and hand position',
    question: 'Does grip change which muscle works?',
    answer:
      'Much less than gym lore suggests. In pulldowns and pull-ups, lat activity is about the same from narrow to wide grips; an overhand grip may use the lats slightly more than underhand. In the bench press, a wide or medium grip lifts the most and a narrower grip shifts some work to the triceps. Chest activity barely changes.',
    doThis: [
      'Pulldowns and pull-ups: any grip from shoulder width to about twice shoulder width. Pick the one that feels best on your shoulders and elbows.',
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
      'For building muscle, no: meta-analyses of over a thousand people found the same growth. Strength is specific, though: you get best at what you practise, so free-weight training builds more free-weight strength. That is why Ironplan prefers free weights when you have them and uses machines to fill gaps, and you can change this in Settings.',
    doThis: [
      'If your gym has only a few machines, free weights can cover nearly every muscle.',
      'Use machines when they are safer for you to push hard, or to train a muscle free weights miss.',
      'If you compete or test with a barbell, keep the barbell lifts in your plan.',
    ],
    confidence: 'strong',
    studies: ['haugen2023', 'heidel2021', 'hernandezBelmonte2023'],
  },
  {
    id: 'tempo',
    title: 'Tempo and rest',
    question: 'How fast should I lift, and how long should I rest?',
    answer:
      'Tempo matters little: reps lasting anywhere from half a second to 8 seconds built similar muscle, and only very slow reps looked worse. Resting longer than a minute between sets helps a little, with no extra benefit past about 90 seconds for growth.',
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
      'They build the same muscle as two-limb versions, so they are a good substitute when you lack a machine or a rack. Strength stays specific: single-leg work improves single-leg strength more.',
    doThis: [
      'No leg press or rack? Dumbbell split squats train the quads and glutes just as well.',
      'Start with your weaker side and match its reps on the other side.',
    ],
    confidence: 'moderate',
    studies: ['kassiano2025'],
  },
];

export type ExerciseNote = { text: string; studies: StudyId[] };

export const EXERCISE_EVIDENCE: Record<string, ExerciseNote[]> = {
  overhead_triceps_extension: [
    { text: 'Overhead extensions grew the triceps about 1.4 times as much as pushdowns in a 12-week MRI study.', studies: ['maeo2022'] },
  ],
  triceps_pushdown: [
    { text: 'For more triceps growth, swap some pushdowns for overhead extensions: they stretch the long head and grew more muscle.', studies: ['maeo2022'] },
  ],
  leg_curl: [
    { text: 'Use the seated version if you can: it grew the hamstrings more than lying leg curls.', studies: ['maeo2020'] },
  ],
  back_squat: [
    { text: 'Depth matters: full squats grew the glutes and adductors far more than half squats.', studies: ['kubo2019'] },
    { text: 'Think about the result ("push the floor away"). An outward focus gives more lower-body strength.', studies: ['grgic2021focusStrength'] },
  ],
  front_squat: [{ text: 'Squat to full depth for the most glute and adductor growth.', studies: ['kubo2019'] }],
  goblet_squat: [{ text: 'Squat to full depth for the most glute and adductor growth.', studies: ['kubo2019'] }],
  hip_thrust: [
    { text: 'Hip thrusts and squats grew the glutes about equally. Squats also grow the quads, so keep both if you can.', studies: ['plotkin2023'] },
  ],
  leg_press: [
    { text: 'The leg press barely trains the rectus femoris. Add leg extensions if you want the front of the thigh trained fully.', studies: ['ema2016'] },
  ],
  leg_extension: [
    { text: 'This is the best way to train the rectus femoris, which compound leg exercises mostly miss.', studies: ['ema2016'] },
  ],
  lat_pulldown: [
    { text: 'Grip width barely changes lat activity. Use an overhand grip about 1–2 times shoulder width and pull to the front.', studies: ['andersen2014', 'lusk2010', 'buonsenso2025'] },
  ],
  pull_up: [{ text: 'Grip width barely changes lat activity, so pick the grip that suits your shoulders.', studies: ['andersen2014', 'buonsenso2025'] }],
  barbell_bench_press: [
    { text: 'A medium to wide grip lifts the most. Narrower shifts work to the triceps; chest activity stays about the same.', studies: ['larsen2021', 'saeterbakken2021'] },
    { text: 'Heavy sets: focus on driving the bar. Light sets: focusing on the chest can raise its activity.', studies: ['calatayud2016'] },
  ],
  biceps_curl: [
    { text: 'Concentrating on squeezing the biceps doubled its growth in an 8-week trial. Worth doing here.', studies: ['schoenfeld2018focus'] },
    { text: 'Preacher-style curls, hardest with the arm straight, grew the lower biceps.', studies: ['zabaletaKorta2023'] },
  ],
  hammer_curl: [{ text: 'Concentrating on the working muscle helps on light isolation work like this.', studies: ['schoenfeld2018focus'] }],
  deadlift: [
    { text: 'Brace and keep a roughly neutral back on heavy sets. Small amounts of rounding have not been shown to cause back pain.', studies: ['saraceni2020'] },
  ],
  romanian_deadlift: [{ text: 'Lower until you feel a strong hamstring stretch: loading the stretched position builds more muscle.', studies: ['strey2026', 'pallares2021'] }],
  dumbbell_romanian_deadlift: [{ text: 'Lower until you feel a strong hamstring stretch: loading the stretched position builds more muscle.', studies: ['strey2026', 'pallares2021'] }],
  bulgarian_split_squat: [{ text: 'Single-leg work builds as much muscle as two-leg work.', studies: ['kassiano2025'] }],
  dumbbell_split_squat: [{ text: 'Single-leg work builds as much muscle as two-leg work, so this stands in well for a leg press or squat rack.', studies: ['kassiano2025'] }],
  machine_calf_raise: [{ text: 'Spend time in the stretch at the bottom. Stretched-position reps grew more muscle.', studies: ['strey2026'] }],
  dumbbell_calf_raise: [{ text: 'Spend time in the stretch at the bottom. Stretched-position reps grew more muscle.', studies: ['strey2026'] }],
  chest_fly: [{ text: 'On light isolation work, focusing on the chest can raise its activity.', studies: ['calatayud2016'] }],
  lateral_raise: [{ text: 'On light isolation work, focusing on the working muscle can help it grow.', studies: ['schoenfeld2018focus'] }],
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate evidence',
  limited: 'Limited evidence',
};

export const studiesFor = (ids: StudyId[]): Study[] => ids.map((id) => STUDIES[id]);
