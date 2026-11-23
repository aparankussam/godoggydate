// mobile/lib/push.ts
// Expo push registration. Tokens are stored at users/{uid}/private/push
// (owner-writable per firestore.rules) and consumed by the Cloud Function
// push triggers (onMatchCreatedNotify / onMessageCreatedNotify, reminders,
// celebrations, Pack Day), which prune stale tokens automatically on send.
//
// iOS lets an app show the system permission prompt exactly once, so it is
// never shown on sign-in. Two places ask instead, both after explaining why:
//   - PushPermissionCard (Profile tab), and
//   - maybeAskForPushPermission(), for a natural moment such as a first match.
// On sign-in we only register silently when permission is already granted.

import { arrayUnion, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { getFirebase } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** The one line both ask points use, so the reason reads the same everywhere. */
export const PUSH_PERMISSION_REASON = 'Know when a dog boops you back or a playdate is confirmed.';

/**
 * - granted: notifications can be shown (including iOS provisional).
 * - undetermined: never asked; the system prompt is still available.
 * - denied: said no (or can't ask again); only Settings can turn them on.
 * - unavailable: this platform has no push (web).
 */
export type PushPermissionState = 'granted' | 'undetermined' | 'denied' | 'unavailable';

function toPermissionState(permissions: Notifications.NotificationPermissionsStatus): PushPermissionState {
  const iosStatus = permissions.ios?.status;
  if (
    permissions.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  if ((permissions.status as string) === 'undetermined' && permissions.canAskAgain !== false) {
    return 'undetermined';
  }
  return 'denied';
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (Platform.OS === 'web') return 'unavailable';
  try {
    return toPermissionState(await Notifications.getPermissionsAsync());
  } catch (error) {
    console.warn('Push permission check failed', error);
    return 'unavailable';
  }
}

/** Saves this device's Expo push token. Assumes permission is already granted. */
async function saveExpoPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) return; // simulators can't receive push

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
  // The zone lets the playdate reminders (firebase/functions/src/playdates.ts)
  // turn "3:00 PM" into the right moment for this person.
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch { /* the runtime can't tell: the server falls back to the dog's state */ }
  await setDoc(doc(db, 'users', userId, 'private', 'push'), {
    expoPushTokens: arrayUnion(token),
    ...(timeZone ? { timeZone } : {}),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Silent registration: saves this device's push token only if permission is
 * already granted. Never shows a prompt. Safe to call on every sign-in.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    if ((await getPushPermissionState()) !== 'granted') return;
    await saveExpoPushToken(userId);
  } catch (error) {
    console.warn('Push registration failed', error);
  }
}

/**
 * Shows the iOS system prompt if it hasn't been used yet, then registers on a
 * yes. Call it only after the person has been told why (PushPermissionCard,
 * or maybeAskForPushPermission). Returns the resulting state; 'denied' means
 * only Settings can change it now.
 */
export async function requestPushPermission(userId: string): Promise<PushPermissionState> {
  const current = await getPushPermissionState();
  if (current === 'unavailable' || current === 'denied') return current;

  let next: PushPermissionState = current;
  if (current === 'undetermined') {
    try {
      next = toPermissionState(await Notifications.requestPermissionsAsync());
    } catch (error) {
      console.warn('Push permission request failed', error);
      return getPushPermissionState();
    }
  }
  if (next === 'granted') {
    try {
      await saveExpoPushToken(userId);
    } catch (error) {
      console.warn('Push registration failed', error);
    }
  }
  return next;
}

const PRE_PROMPT_DISMISSED_KEY = 'godoggydate.pushPrePromptDismissedAt';
const PRE_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
let prePromptOpen = false;

async function prePromptRecentlyDismissed(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PRE_PROMPT_DISMISSED_KEY);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) && at > 0 && Date.now() - at < PRE_PROMPT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/**
 * Ask for notifications at a natural moment, for example right after a first
 * match or after sending a first message:
 *
 *   void maybeAskForPushPermission(user.uid);
 *
 * Does nothing unless the system prompt is still unused. Otherwise it first
 * explains why in an in-app alert, and only shows the one-shot iOS prompt if
 * the person taps "Turn on". "Not now" keeps it quiet for a week. Resolves
 * with the permission state once the person has answered.
 */
export async function maybeAskForPushPermission(
  userId: string,
  options: { title?: string; message?: string } = {},
): Promise<PushPermissionState> {
  const state = await getPushPermissionState();
  if (state === 'granted') {
    await registerForPushNotifications(userId);
    return state;
  }
  if (state !== 'undetermined' || prePromptOpen) return state;
  if (await prePromptRecentlyDismissed()) return state;

  prePromptOpen = true;
  return new Promise<PushPermissionState>((resolve) => {
    const finish = (result: PushPermissionState) => {
      prePromptOpen = false;
      resolve(result);
    };
    Alert.alert(
      options.title ?? 'Turn on notifications?',
      options.message ?? PUSH_PERMISSION_REASON,
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => {
            AsyncStorage.setItem(PRE_PROMPT_DISMISSED_KEY, String(Date.now())).catch(() => {});
            finish(state);
          },
        },
        {
          text: 'Turn on',
          onPress: () => {
            requestPushPermission(userId).then(finish, () => finish(state));
          },
        },
      ],
      { cancelable: false },
    );
  });
}

// ── Notification taps ────────────────────────────────────────────────────────

function stringField(data: Record<string, unknown> | null | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Where a tapped notification should land, from the payload the Cloud
 * Functions attach (firebase/functions/src/index.ts and packDay.ts):
 *   match, message          { matchId } -> the chat
 *   packday                 { eventId } -> the Pack Day event
 *   reminder, celebration   { dogId }   -> the Profile tab
 * Payloads from before `type` existed carried only matchId.
 */
export function routeForNotification(data: Record<string, unknown> | null | undefined): string | null {
  const type = stringField(data, 'type');
  const matchId = stringField(data, 'matchId');
  const eventId = stringField(data, 'eventId');

  switch (type) {
    case 'match':
    case 'message':
      return matchId ? `/chat/${encodeURIComponent(matchId)}` : '/(tabs)/matches';
    case 'packday':
      return eventId ? `/pack/${encodeURIComponent(eventId)}` : null;
    case 'reminder':
    case 'celebration':
      return '/(tabs)/profile';
    default:
      return matchId ? `/chat/${encodeURIComponent(matchId)}` : null;
  }
}

const handledResponses = new Set<string>();

/**
 * Calls `navigate` with the route for every notification the person taps,
 * including the one that launched the app from cold. Returns an unsubscribe
 * function. Each notification is handled once.
 */
export function addNotificationTapListener(navigate: (route: string) => void): () => void {
  let active = true;

  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handledResponses.has(id)) return;
    handledResponses.add(id);
    const route = routeForNotification(
      response.notification.request.content.data as Record<string, unknown> | null,
    );
    if (route) navigate(route);
  };

  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  // A tap that launched the app may have arrived before this listener.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      handle(response);
      if (response) return Notifications.clearLastNotificationResponseAsync();
      return undefined;
    })
    .catch(() => {});

  return () => {
    active = false;
    sub.remove();
  };
}
