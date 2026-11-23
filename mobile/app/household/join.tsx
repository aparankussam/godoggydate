// mobile/app/household/join.tsx
// Where a household invite link lands in the app. Mirrors
// web/app/app/household/join/page.tsx: reads ?code= from the link, asks the
// person to sign in if they haven't (any account works — no dog of their own
// is needed), then accepts the invite. +native-intent.tsx maps the website's
// /app/household/join?code=… to this screen.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { colors, fonts, radius } from '../../constants/theme';
import { PawCoin, PrimaryButton, SkyBackground } from '../../components/sticker';
import { homeRouteFor, useSession } from '../../lib/session';
import {
  clearPendingHouseholdInvite,
  normalizeInviteCode,
  peekPendingHouseholdInvite,
  setPendingHouseholdInvite,
} from '../../lib/household';
import { HouseholdJoinForm } from '../../components/HouseholdSection';

export default function HouseholdJoinScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const rawCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const linkCode = normalizeInviteCode(rawCode) || peekPendingHouseholdInvite() || '';
  const { user, loading, profileComplete, householdOnly, refreshSession } = useSession();
  const [joined, setJoined] = useState(false);

  // Hold on to the code while they sign in; welcome sends them back here.
  useEffect(() => {
    if (linkCode) setPendingHouseholdInvite(linkCode);
  }, [linkCode]);

  async function handleJoined() {
    clearPendingHouseholdInvite();
    setJoined(true);
    let route = '/(tabs)/profile';
    try {
      const snapshot = await refreshSession();
      if (snapshot.householdOnly) route = '/household';
      else if (!snapshot.profileComplete) route = '/onboarding';
    } catch (error) {
      console.warn('[HouseholdJoin] could not reload the household after joining', error);
      route = '/';
    }
    setTimeout(() => router.replace(route as Href), 1200);
  }

  function handleNotNow() {
    clearPendingHouseholdInvite();
    if (router.canGoBack()) router.back();
    else router.replace(homeRouteFor({ user, profileComplete, householdOnly }) as Href);
  }

  return (
    <SafeAreaView style={styles.container}>
      <SkyBackground />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <PawCoin size={56} />
        <Text style={styles.title}>Join a household</Text>
        <Text style={styles.body}>
          You&apos;ve been invited to help look after someone&apos;s dog: reminders, everything, no dog of your own required.
        </Text>

        {joined ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>You&apos;re in!</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.ink} size="large" />
        ) : !user ? (
          <PrimaryButton label="Sign in to join" onPress={() => router.replace('/welcome')} style={styles.primaryButton} />
        ) : (
          <View style={styles.formBox}>
            <HouseholdJoinForm initialCode={linkCode} onJoined={handleJoined} primary />
          </View>
        )}

        {!joined && (
          <Pressable style={styles.notNow} onPress={handleNotNow} hitSlop={8} accessibilityRole="button">
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    gap: 16,
  },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.ink, textAlign: 'center' },
  body: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
    textAlign: 'center',
    maxWidth: 330,
  },
  formBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 24,
    padding: 16,
  },
  primaryButton: { alignSelf: 'stretch' },
  successBox: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  successText: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  notNow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  notNowText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },
});
