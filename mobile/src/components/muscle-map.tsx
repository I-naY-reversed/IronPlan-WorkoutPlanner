import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import type { Muscle } from '@/domain/exercises';
import { useTheme } from '@/hooks/use-theme';
import { MUSCLE_MAP, type MapView } from './muscle-map-data';

const MIN_SHADE = 0.05;

function Figure({ view, id, shade, height }: { view: MapView; id: string; shade: Partial<Record<Muscle, number>>; height: number }) {
  const theme = useTheme();
  return (
    <Svg viewBox={view.viewBox} height={height} width={height / 2}>
      <Defs>
        {view.regions.map((r, i) =>
          r.clip ? (
            <ClipPath key={i} id={`${id}${i}`}>
              <Rect x={r.clip[0]} y={0} width={r.clip[1] - r.clip[0]} height={1448} />
            </ClipPath>
          ) : null,
        )}
      </Defs>
      <G>
        {view.regions.map((r, i) => {
          const v = r.m ? Math.min(1, Math.max(0, shade[r.m] ?? 0)) : 0;
          return (
            <Path
              key={i}
              d={r.d}
              clipPath={r.clip ? `url(#${id}${i})` : undefined}
              fill={v >= MIN_SHADE ? theme.bracket : theme.backgroundSelected}
              fillOpacity={v >= MIN_SHADE ? 0.25 + 0.75 * v : 1}
              stroke={theme.background}
              strokeWidth={2}
            />
          );
        })}
      </G>
      <Path d={view.outline} fill="none" stroke={theme.steel} strokeWidth={3} />
    </Svg>
  );
}

export function MuscleMap({ shade, height = 220 }: { shade: Partial<Record<Muscle, number>>; height?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Figure view={MUSCLE_MAP.front} id={`${id}f`} shade={shade} height={height} />
      <Figure view={MUSCLE_MAP.back} id={`${id}b`} shade={shade} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
});
