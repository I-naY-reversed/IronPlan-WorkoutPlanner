import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STROKE = 2;
const ARM = 6;
const SLIDE_MS = 200;

function BracketMark({ side, height, color }: { side: 'left' | 'right'; height: number; color: string }) {
  const border = side === 'left'
    ? { borderLeftWidth: STROKE, borderTopWidth: STROKE, borderBottomWidth: STROKE }
    : { borderRightWidth: STROKE, borderTopWidth: STROKE, borderBottomWidth: STROKE };
  return <View style={[{ width: ARM, height, borderColor: color }, border]} />;
}

export function BracketStrip({
  low,
  value,
  high,
  domain,
  unit = 'kg',
  digits = 1,
}: {
  low: number;
  value: number;
  high: number;
  domain: [number, number];
  unit?: string;
  digits?: number;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const span = Math.max(1e-6, domain[1] - domain[0]);
  const x = (v: number) => (Math.min(domain[1], Math.max(domain[0], v)) - domain[0]) / span;
  const [left] = useState(() => new Animated.Value(x(low)));
  const [right] = useState(() => new Animated.Value(x(high)));
  const [tick] = useState(() => new Animated.Value(x(value)));

  useEffect(() => {
    const anim = (v: Animated.Value, to: number) =>
      Animated.timing(v, { toValue: to, duration: SLIDE_MS, easing: Easing.out(Easing.quad), useNativeDriver: false });
    Animated.parallel([anim(left, x(low)), anim(right, x(high)), anim(tick, x(value))]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [low, value, high, domain[0], domain[1]]);

  const px = (v: Animated.Value, offset = 0) => Animated.add(Animated.multiply(v, width), offset);
  const clampPx = (v: Animated.Value, offset: number, labelWidth: number) => {
    const max = Math.max(1, width - labelWidth);
    return px(v, offset).interpolate({ inputRange: [0, max], outputRange: [0, max], extrapolate: 'clamp' });
  };
  const fmt = (v: number) => v.toFixed(digits).replace(/\.0+$/, '');

  return (
    <View
      accessible
      accessibilityLabel={`Range ${fmt(low)} to ${fmt(high)} ${unit}, recommended ${fmt(value)} ${unit}`}
      style={styles.strip}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.track, { backgroundColor: theme.interval }]} />
      {width > 0 ? (
        <>
          <Animated.View style={[styles.band, { backgroundColor: theme.interval, left: px(left), width: Animated.multiply(Animated.subtract(right, left), width) }]} />
          <Animated.View style={[styles.mark, { left: px(left, -1) }]}>
            <BracketMark side="left" height={28} color={theme.bracket} />
          </Animated.View>
          <Animated.View style={[styles.mark, { left: px(right, -ARM + 1) }]}>
            <BracketMark side="right" height={28} color={theme.bracket} />
          </Animated.View>
          <Animated.View style={[styles.tick, { backgroundColor: theme.text, left: px(tick, -1) }]} />
          <Animated.View style={[styles.labelLow, { left: clampPx(left, -40, 40) }]}>
            <ThemedText type="numSmall" themeColor="steel" numberOfLines={1} style={styles.alignRight}>
              {fmt(low)}
            </ThemedText>
          </Animated.View>
          <Animated.View style={[styles.labelHigh, { left: clampPx(right, 0, 60) }]}>
            <ThemedText type="numSmall" themeColor="steel" numberOfLines={1}>
              {fmt(high)}
            </ThemedText>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

export function BracketGlyph({ certainty, inverted = false }: { certainty: number; inverted?: boolean }) {
  const theme = useTheme();
  const c = Math.max(0, Math.min(1, certainty));
  const W = 30;
  const half = 3 + Math.round((1 - c) * 9);
  const left = W / 2 - half - ARM / 2;
  return (
    <View style={[styles.glyph, { width: W }]} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[styles.glyphTrack, { backgroundColor: inverted ? theme.steel : theme.interval }]} />
      <View style={[styles.glyphBand, { left: W / 2 - half, width: half * 2, backgroundColor: inverted ? theme.steel : theme.bracketBand }]} />
      <View style={[styles.glyphMark, { left }]}>
        <BracketMark side="left" height={12} color={inverted ? theme.bracketInverse : theme.bracket} />
      </View>
      <View style={[styles.glyphMark, { left: W / 2 + half - ARM / 2 }]}>
        <BracketMark side="right" height={12} color={inverted ? theme.bracketInverse : theme.bracket} />
      </View>
      <View style={[styles.glyphTick, { left: W / 2 - 1, backgroundColor: inverted ? theme.background : theme.text }]} />
    </View>
  );
}

export function KnowledgeDots({ filled, label }: { filled: number; label?: string }) {
  const theme = useTheme();
  const n = Math.max(0, Math.min(5, Math.round(filled)));
  return (
    <View style={styles.dotsRow} accessible accessibilityLabel={`${n} of 5${label ? `, ${label}` : ''}`}>
      <View style={styles.dots}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.dot, i < n ? { backgroundColor: theme.text } : { borderColor: theme.steel, borderWidth: 1.5 }]} />
        ))}
      </View>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.dotsLabel}>
          {label}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rangeBar: { height: 16, justifyContent: 'center' },
  rangeEnds: { height: 18 },
  rangeEndLow: { position: 'absolute', top: 0 },
  rangeEndHigh: { position: 'absolute', top: 0 },
  rangeTrack: { position: 'absolute', left: 0, right: 0, height: 2, top: 7 },
  rangeDashed: { position: 'absolute', left: 0, right: 0, top: 7, borderTopWidth: 2, borderStyle: 'dashed' },
  rangeBand: { position: 'absolute', height: 6, top: 5 },
  rangeMark: { position: 'absolute', top: 1 },
  rangeTick: { position: 'absolute', width: 2, height: 16, top: 0, marginLeft: -1 },
  strip: { height: 52, justifyContent: 'center', marginHorizontal: Spacing.five },
  track: { position: 'absolute', left: 0, right: 0, height: 1, top: 14 },
  band: { position: 'absolute', height: 6, top: 11, opacity: 0.8 },
  mark: { position: 'absolute', top: 0 },
  tick: { position: 'absolute', width: 2, height: 20, top: 4 },
  labelLow: { position: 'absolute', top: 30, width: 40 },
  labelHigh: { position: 'absolute', top: 30, width: 60 },
  alignRight: { textAlign: 'right' },
  glyph: { height: 12 },
  glyphTrack: { position: 'absolute', left: 0, right: 0, top: 5.5, height: 1 },
  glyphBand: { position: 'absolute', top: 4, height: 4 },
  glyphMark: { position: 'absolute', top: 0 },
  glyphTick: { position: 'absolute', top: 1, width: 2, height: 10 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dotsLabel: { flexShrink: 1 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

const SPAN = 0.3;
export function loadDomain(low: number, value: number, high: number): [number, number] {
  return [Math.min(value * (1 - SPAN), low), Math.max(value * (1 + SPAN), high)];
}
export function RangeBar({
  low,
  value,
  high,
  domain,
  endLabels,
}: {
  low: number | null;
  value: number;
  high: number | null;
  domain?: [number, number];
  endLabels?: (v: number) => string;
}) {
  const theme = useTheme();
  const d = domain ?? (low !== null && high !== null ? loadDomain(low, value, high) : [0, 1]);
  const x = (v: number) =>
    Math.min(1, Math.max(0, (v - d[0]) / Math.max(1e-9, d[1] - d[0])));
  const open = low === null || high === null;
  const l = open ? 0 : x(low!);
  const r = open ? 1 : x(high!);
  const pct = (f: number) => `${(f * 100).toFixed(1)}%` as const;
  if (low === null || high === null) {
    return (
      <View style={styles.rangeBar} accessibilityElementsHidden importantForAccessibility="no">
        <View style={[styles.rangeDashed, { borderColor: theme.steel }]} />
      </View>
    );
  }
  const bar = (
    <View style={styles.rangeBar} accessibilityElementsHidden importantForAccessibility="no">
      <View style={[styles.rangeTrack, { backgroundColor: theme.interval }]} />
      <View style={[styles.rangeBand, { left: pct(l), width: pct(r - l), backgroundColor: theme.bracketBand }]} />
      {l > 0 || !open ? (
        <View style={[styles.rangeMark, { left: pct(l) }]}>
          <BracketMark side="left" height={14} color={theme.bracket} />
        </View>
      ) : null}
      {r < 1 || !open ? (
        <View style={[styles.rangeMark, { left: pct(r), marginLeft: -ARM }]}>
          <BracketMark side="right" height={14} color={theme.bracket} />
        </View>
      ) : null}
      {!open ? <View style={[styles.rangeTick, { left: pct(x(value)), backgroundColor: theme.text }]} /> : null}
    </View>
  );
  if (!endLabels) return bar;
  const lowEnd = l < 0.15 ? { left: 0 } : { right: pct(1 - l) };
  const highEnd = r > 0.85 ? { right: 0 } : { left: pct(r) };
  return (
    <View>
      <View style={styles.rangeEnds}>
        <ThemedText
          type="caption"
          themeColor="steel"
          numberOfLines={1}
          style={[styles.rangeEndLow, lowEnd]}>
          {endLabels(low)}
        </ThemedText>
        <ThemedText
          type="caption"
          themeColor="steel"
          numberOfLines={1}
          style={[styles.rangeEndHigh, highEnd]}>
          {endLabels(high)}
        </ThemedText>
      </View>
      {bar}
    </View>
  );
}

export function FirstGuess({ label = 'First guess' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={[chip.wrap, { borderColor: theme.steel }]} accessibilityLabel={`${label}: a wide range until you log a set`}>
      <ThemedText type="caption" themeColor="steel">
        {label}
      </ThemedText>
    </View>
  );
}

const chip = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 1, alignSelf: 'flex-start' },
});
