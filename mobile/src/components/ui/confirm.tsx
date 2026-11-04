import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Ask = { title: string; message: string; confirm: string; cancel: string; destructive?: boolean; onConfirm: () => void };

export function useConfirm() {
  const theme = useTheme();
  const [ask, setAsk] = useState<Ask | null>(null);
  const close = () => setAsk(null);
  const element = (
    <Modal visible={!!ask} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close">
        <Pressable style={[styles.dialog, { backgroundColor: theme.background }]} accessibilityRole="alert" onPress={() => {}}>
          <ThemedText type="heading">{ask?.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {ask?.message}
          </ThemedText>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button title={ask?.cancel ?? 'Cancel'} variant="secondary" onPress={close} />
            </View>
            <View style={styles.flex}>
              <Button
                title={ask?.confirm ?? 'OK'}
                onPress={() => {
                  const run = ask?.onConfirm;
                  close();
                  run?.();
                }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
  return [element, setAsk] as const;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.four },
  dialog: { borderRadius: Radius.button, padding: Spacing.four, gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
