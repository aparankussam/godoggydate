// mobile/components/PushPermissionCard.tsx
// Explains why before using iOS's one-shot notification prompt, and gives a
// way back once someone has said no. Self-contained: mount it anywhere inside
// SessionProvider as <PushPermissionCard />.
//   - never asked: the reason, then "Turn on notifications" shows the prompt
//   - said no: "Notifications are off — open Settings"
//   - allowed: renders nothing (and makes sure this device is registered)
// It re-checks when the app comes back to the foreground, so returning from
// Settings with notifications switched on hides it.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { useSession } from '../lib/session';
import {
  PUSH_PERMISSION_REASON,
  getPushPermissionState,
  registerForPushNotifications,
  requestPushPermission,
  type PushPermissionState,
} from '../lib/push';

interface Props {
  style?: StyleProp<ViewStyle>;
}

export default function PushPermissionCard({ style }: Props) {
  const { user } = useSession();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<PushPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const registeredFor = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await getPushPermissionState();
    setState(next);
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (appState) => {
      if (appState === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Turned on from Settings (or elsewhere) since the last check: save this
  // device's token so pushes actually arrive.
  useEffect(() => {
    if (state !== 'granted' || !uid || registeredFor.current === uid) return;
    registeredFor.current = uid;
    void registerForPushNotifications(uid);
  }, [state, uid]);

  async function handleTurnOn() {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const next = await requestPushPermission(uid);
      if (next === 'granted') registeredFor.current = uid;
      setState(next);
    } finally {
      setBusy(false);
    }
  }

  function handleOpenSettings() {
    Linking.openSettings().catch(() => {});
  }

  if (!uid || state === null || state === 'granted' || state === 'unavailable') return null;

  if (state === 'denied') {
    return (
      <Pressable
        style={[styles.card, styles.offCard, style]}
        onPress={handleOpenSettings}
        accessibilityRole="button"
        accessibilityHint="Opens Settings so you can allow notifications"
      >
        <Text style={styles.emoji}>🔕</Text>
        <View style={styles.body}>
          <Text style={styles.offTitle}>Notifications are off — open Settings</Text>
          <Text style={styles.text}>{PUSH_PERMISSION_REASON} Turn on Allow Notifications for GoDoggyDate.</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <Text style={styles.emoji}>🔔</Text>
        <View style={styles.body}>
          <Text style={styles.title}>Turn on notifications</Text>
          <Text style={styles.text}>{PUSH_PERMISSION_REASON}</Text>
        </View>
      </View>
      <Pressable
        style={[styles.button, busy && styles.buttonBusy]}
        onPress={handleTurnOn}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{busy ? 'Asking…' : 'Turn on notifications'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  offCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.creamDark,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  emoji: { fontSize: 22, lineHeight: 26 },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  offTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryDark },
  text: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.brownLight },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
});
