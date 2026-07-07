// mobile/lib/push.ts
// Expo push registration. Tokens are stored at users/{uid}/private/push
// (owner-writable per firestore.rules) and consumed by the Cloud Function
// push triggers (onMatchCreatedNotify / onMessageCreatedNotify), which
// prune stale tokens automatically on send.

import { arrayUnion, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getFirebase } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Ask for permission (no-op if already granted/denied) and persist this
 * device's Expo push token. Safe to call on every sign-in.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Device.isDevice) return; // simulators can't receive push

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const request = await Notifications.requestPermissionsAsync();
      status = request.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Matches & messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (!projectId || projectId === 'YOUR_EAS_PROJECT_ID') {
      console.warn('Push registration skipped: no real EAS project id configured');
      return;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;

    const { db } = getFirebase();
    await setDoc(doc(db, 'users', userId, 'private', 'push'), {
      expoPushTokens: arrayUnion(token),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (error) {
    console.warn('Push registration failed', error);
  }
}

/**
 * Route notification taps to the right screen. Returns an unsubscribe fn.
 * The Cloud Function attaches { type, matchId } to every notification.
 */
export function addNotificationTapListener(
  navigate: (matchId: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { matchId?: string };
    if (data?.matchId) navigate(data.matchId);
  });
  return () => sub.remove();
}
