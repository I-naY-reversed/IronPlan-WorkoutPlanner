import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Brand, Plates, Spacing } from '@/constants/theme';
import { platesPerSide } from '@/domain/plates';
import type { Unit } from '@/domain/units';
import { useTheme } from '@/hooks/use-theme';

type PlateLook = { fill: string; h: number; w: number; outline?: boolean };
const PLATE: Record<Unit, Record<number, PlateLook>> = {
  kg: {
    25: { fill: Plates.red, h: 44, w: 11 },
    20: { fill: Plates.blue, h: 44, w: 10 },
    15: { fill: Plates.yellow, h: 44, w: 9 },
    10: { fill: Plates.green, h: 44, w: 8 },
    5: { fill: Plates.white, h: 30, w: 7, outline: true },
    2.5: { fill: Brand.barSteel, h: 24, w: 6, outline: true },
    1.25: { fill: Brand.intervalChalk, h: 20, w: 5 },
  },
  lb: {
    45: { fill: Plates.blue, h: 44, w: 11 },
    35: { fill: Plates.yellow, h: 44, w: 9 },
    25: { fill: Plates.green, h: 44, w: 8 },
    10: { fill: Plates.white, h: 30, w: 7, outline: true },
    5: { fill: Brand.barSteel, h: 24, w: 6, outline: true },
    2.5: { fill: Brand.intervalChalk, h: 20, w: 5 },
  },
};
const H = 48;
const GAP = 1;
const SLEEVE = 96;

export function PlateStrip({ loadKg, incrementKg, unit }: { loadKg: number; incrementKg: number; unit: Unit }) {
  const theme = useTheme();
  const { plates } = platesPerSide(loadKg, incrementKg, unit);
  const width = SLEEVE * 2 + 72;
  const mid = H / 2;
  const collarL = SLEEVE;
  const collarR = width - SLEEVE;
  const drawn: React.ReactNode[] = [];
  let l = collarL;
  let r = collarR;
  plates.forEach((p, i) => {
    const s = PLATE[unit][p];
    l -= s.w + GAP;
    drawn.push(<Rect key={`l${i}`} x={l} y={mid - s.h / 2} width={s.w} height={s.h} rx={1} fill={s.fill} stroke={s.outline ? Brand.slate : 'none'} strokeWidth={1} />);
    drawn.push(<Rect key={`r${i}`} x={r + GAP} y={mid - s.h / 2} width={s.w} height={s.h} rx={1} fill={s.fill} stroke={s.outline ? Brand.slate : 'none'} strokeWidth={1} />);
    r += s.w + GAP;
  });
  const label = plates.length ? `${plates.join(', ')} ${unit}` : 'empty bar';
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Each side: ${label}`}>
      <Svg width={width} height={H}>
        <Rect x={0} y={mid - 2} width={width} height={4} fill={theme.steel} />
        <Rect x={collarL - 3} y={mid - 7} width={3} height={14} fill={theme.steel} />
        <Rect x={collarR} y={mid - 7} width={3} height={14} fill={theme.steel} />
        {drawn}
      </Svg>
      <ThemedText type="numSmall" themeColor="textSecondary">
        {plates.length ? `Each side ${label}` : 'Empty bar'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.half },
});
