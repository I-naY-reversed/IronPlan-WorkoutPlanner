import { BAR } from './plates';
import { fromUnit, type Unit } from './units';

export const EQUIPMENT_KINDS = [
  'barbell',
  'squat_rack',
  'bench',
  'dumbbells',
  'kettlebell',
  'cable',
  'bands',
  'pullup_bar',
  'dip_bars',
  'leg_press',
  'hack_squat',
  'leg_curl',
  'leg_extension',
  'chest_fly_machine',
  'row_machine',
  'calf_raise_machine',
  'hip_adductor',
  'ab_crunch_machine',
  'medicine_ball',
  'sled',
  'tibialis_machine',
] as const;

export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

export type EquipmentInfo = {
  label: string;
  loaded: boolean;
  defaultIncrementKg?: number;
  defaultIncrementLb?: number;
};

export const EQUIPMENT_INFO: Record<EquipmentKind, EquipmentInfo> = {
  barbell: { label: 'Barbell and plates', loaded: true, defaultIncrementKg: 2.5, defaultIncrementLb: 5 },
  squat_rack: { label: 'Squat rack', loaded: false },
  bench: { label: 'Bench', loaded: false },
  dumbbells: { label: 'Dumbbells', loaded: true, defaultIncrementKg: 2, defaultIncrementLb: 5 },
  kettlebell: { label: 'Kettlebells', loaded: true, defaultIncrementKg: 4 },
  cable: { label: 'Cable station', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  bands: { label: 'Resistance bands', loaded: false },
  pullup_bar: { label: 'Pull-up bar', loaded: false },
  dip_bars: { label: 'Dip bars', loaded: false },
  leg_press: { label: 'Leg press', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  hack_squat: { label: 'Hack squat', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  leg_curl: { label: 'Leg curl machine', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  leg_extension: { label: 'Leg extension machine', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  chest_fly_machine: { label: 'Pec deck', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  row_machine: { label: 'Seated row machine', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  calf_raise_machine: { label: 'Calf raise machine', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  hip_adductor: { label: 'Hip adductor machine', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  ab_crunch_machine: { label: 'Ab crunch machine', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  medicine_ball: { label: 'Medicine ball', loaded: false },
  sled: { label: 'Sled', loaded: true, defaultIncrementKg: 5, defaultIncrementLb: 10 },
  tibialis_machine: { label: 'Tibialis machine or tib bar', loaded: true, defaultIncrementKg: 2.5, defaultIncrementLb: 5 },
};

export type Modality = 'free' | 'machine' | 'bodyweight';
export type LoadPreference = 'free_weights' | 'any' | 'machines';

const FREE_WEIGHTS = new Set<EquipmentKind>(['barbell', 'dumbbells', 'kettlebell']);
const MACHINES = new Set<EquipmentKind>([
  'cable', 'leg_press', 'hack_squat', 'leg_curl', 'leg_extension', 'chest_fly_machine', 'row_machine',
  'calf_raise_machine', 'hip_adductor', 'ab_crunch_machine', 'tibialis_machine',
]);

export function modalityOf(option: EquipmentKind[]): Modality {
  if (option.some((k) => FREE_WEIGHTS.has(k))) return 'free';
  if (option.some((k) => MACHINES.has(k))) return 'machine';
  return 'bodyweight';
}

export const MODALITY_LABELS: Record<Modality, string> = { free: 'Free weight', machine: 'Machine', bodyweight: 'Bodyweight' };

export function preferenceRank(option: EquipmentKind[], preference: LoadPreference): number {
  const m = modalityOf(option);
  if (preference === 'free_weights') return m === 'free' ? 0 : m === 'machine' ? 1 : 2;
  if (preference === 'machines') return m === 'machine' ? 0 : m === 'free' ? 1 : 2;
  return 0;
}

export type LoadSettings = {
  incrementKg?: number;
  maxKg?: number;
};

export type CustomEquipment = LoadSettings & {
  id: string;
  name: string;
  worksLike: EquipmentKind;
};

export type EquipmentSetup = {
  owned: Partial<Record<EquipmentKind, LoadSettings>>;
  custom: CustomEquipment[];
};

export const FULL_GYM: EquipmentSetup = {
  owned: Object.fromEntries(EQUIPMENT_KINDS.filter((k) => k !== 'tibialis_machine').map((k) => [k, {}])) as EquipmentSetup['owned'],
  custom: [],
};

export const BODYWEIGHT_ONLY: EquipmentSetup = { owned: {}, custom: [] };

export function availableKinds(setup: EquipmentSetup, unit: Unit = 'kg'): Set<EquipmentKind> {
  const kinds = new Set(Object.keys(setup.owned) as EquipmentKind[]);
  for (const c of setup.custom) kinds.add(c.worksLike);
  for (const k of [...kinds]) {
    const min = minLoadKg(k, unit);
    const { maxKg } = loadSettingsFor(setup, k, unit);
    if (min && maxKg !== undefined && maxKg < min) kinds.delete(k);
  }
  return kinds;
}

export function minLoadKg(kind: EquipmentKind, unit: Unit = 'kg'): number | undefined {
  return kind === 'barbell' ? fromUnit(BAR[unit], unit) : undefined;
}

export function loadSettingsFor(setup: EquipmentSetup, kind: EquipmentKind, unit: Unit = 'kg'): LoadSettings {
  const sources: LoadSettings[] = [];
  if (setup.owned[kind]) sources.push(setup.owned[kind]!);
  for (const c of setup.custom) if (c.worksLike === kind) sources.push(c);
  const increments = sources.map((s) => s.incrementKg).filter((v): v is number => !!v && v > 0);
  const maxes = sources.map((s) => s.maxKg).filter((v): v is number => !!v && v > 0);
  return {
    incrementKg: increments.length ? Math.min(...increments) : defaultIncrementKg(kind, unit),
    maxKg: maxes.length ? Math.max(...maxes) : undefined,
  };
}

export function defaultIncrementKg(kind: EquipmentKind, unit: Unit): number | undefined {
  const info = EQUIPMENT_INFO[kind];
  return unit === 'lb' && info.defaultIncrementLb ? fromUnit(info.defaultIncrementLb, 'lb') : info.defaultIncrementKg;
}

export const HOME_DUMBBELLS: EquipmentSetup = {
  owned: { dumbbells: {}, bench: {}, bands: {}, pullup_bar: {} },
  custom: [],
};

export const FREE_WEIGHT_GYM: EquipmentSetup = {
  owned: { barbell: {}, squat_rack: {}, bench: {}, dumbbells: {}, kettlebell: {}, pullup_bar: {}, dip_bars: {}, bands: {} },
  custom: [],
};

export const EQUIPMENT_PRESETS: { id: string; label: string; setup: EquipmentSetup }[] = [
  { id: 'gym', label: 'Full gym', setup: FULL_GYM },
  { id: 'free', label: 'Free-weight gym: barbell, rack, dumbbells', setup: FREE_WEIGHT_GYM },
  { id: 'home', label: 'Home: dumbbells, bench, bands, bar', setup: HOME_DUMBBELLS },
  { id: 'none', label: 'Bodyweight only', setup: BODYWEIGHT_ONLY },
];
