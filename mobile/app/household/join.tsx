// mobile/app/household/join.tsx
// Where a household invite link lands in the app. Mirrors
// web/app/app/household/join/page.tsx: reads ?code= from the link, asks the
// person to sign in if they haven't (any account works — no dog of their own
// is needed), then accepts the invite. +native-intent.tsx maps the website's
// /app/household/join?code=… to this screen.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { colors, fonts, radius } from '../../constants/theme';
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.emoji}>🐾</Text>
        <Text style={styles.title}>Join a household</Text>
        <Text style={styles.body}>
          You&apos;ve been invited to help look after someone&apos;s dog — reminders, everything, no dog of your own required.
        </Text>

        {joined ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>You&apos;re in! 🐾</Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.primary} size="large" />
        ) : !user ? (
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/welcome')}>
            <Text style={styles.primaryText}>Sign in to join</Text>
          </Pressable>
        ) : (
          <View style={styles.formBox}>
            <HouseholdJoinForm initialCode={linkCode} onJoined={handleJoined} />
          </View>
        )}

        {!joined && (
          <Pressable style={styles.notNow} onPress={handleNotNow} hitSlop={8}>
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 16,
  },
  emoji: { fontSize: 48 },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.brown, textAlign: 'center' },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownLight,
    textAlign: 'center',
    maxWidth: 320,
  },
  formBox: { width: '100%', maxWidth: 320 },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  successBox: {
    backgroundColor: '#E2F2E9',
    borderWidth: 1,
    borderColor: '#BBE3CC',
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  successText: { fontFamily: fonts.semibold, fontSize: 14, color: '#1F7A4D' },
  notNow: { paddingVertical: 8 },
  notNowText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownLight },
});
