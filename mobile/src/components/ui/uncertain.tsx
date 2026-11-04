import { StyleSheet, View } from 'react-native';

import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';

export function Uncertain({
  value,
  low,
  high,
  digits = 1,
  unit = '',
  prefix = '',
  type = 'num',
  themeColor,
}: {
  value: number;
  low: number;
  high: number;
  digits?: number;
  unit?: string;
  prefix?: string;
  type?: ThemedTextProps['type'];
  themeColor?: ThemedTextProps['themeColor'];
}) {
  const fmt = (x: number) => x.toFixed(digits);
  const plus = fmt(Math.max(0, high - value));
  const minus = fmt(Math.max(0, value - low));
  const main = `${prefix}${fmt(value)}`;
  const label = plus === minus ? `${main} plus or minus ${plus}${unit}` : `${main}, plus ${plus}, minus ${minus}${unit}`;

  if (plus === minus) {
    return (
      <ThemedText type={type} themeColor={themeColor} accessibilityLabel={label}>
        {main} ± {plus}
        {unit}
      </ThemedText>
    );
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <ThemedText type={type} themeColor={themeColor}>
        {main}
      </ThemedText>
      <View style={styles.errors}>
        <ThemedText style={styles.err} themeColor={themeColor ?? 'steel'}>
          +{plus}
        </ThemedText>
        <ThemedText style={styles.err} themeColor={themeColor ?? 'steel'}>
          −{minus}
        </ThemedText>
      </View>
      {unit ? (
        <ThemedText type={type} themeColor={themeColor}>
          {unit}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  errors: { marginLeft: 2, marginRight: 2 },
  err: { fontFamily: Fonts.medium, fontSize: 11, lineHeight: 13, fontVariant: ['tabular-nums'] },
});
