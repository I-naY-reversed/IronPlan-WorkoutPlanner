import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Reminder } from '@/domain/engagement';

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const show = n.request.identifier !== REST_ID;
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
  },
});

let lastKey = '';
const REST_ID = 'rest';

export async function allowReminders(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function scheduleReminders(reminders: Reminder[]) {
  const key = reminders.map((r) => `${r.at.getTime()}|${r.body}`).join(';');
  if (key === lastKey) return;
  lastKey = key;
  try {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (n.identifier !== REST_ID) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    if (!reminders.length || !(await Notifications.getPermissionsAsync()).granted) return;
    if (Platform.OS === 'android') {
      // eslint-disable-next-line import/namespace
      await Notifications.setNotificationChannelAsync('training', { name: 'Training reminders', importance: Notifications.AndroidImportance.DEFAULT });
    }
    for (const r of reminders) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'IronPlan', body: r.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: 'training' },
      });
    }
  } catch {
    lastKey = '';
  }
}

export async function scheduleRestEnd(at: Date | null) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_ID);
    if (!at || at.getTime() <= Date.now() || !(await Notifications.getPermissionsAsync()).granted) return;
    if (Platform.OS === 'android') {
      // eslint-disable-next-line import/namespace
      await Notifications.setNotificationChannelAsync('rest', { name: 'Rest timer', importance: Notifications.AndroidImportance.HIGH });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: 'Rest over', body: 'Time for your next set.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'rest' },
    });
  } catch {
  }
}
