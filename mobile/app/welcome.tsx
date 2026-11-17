import { Alert, Linking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { homeRouteFor, routeAfterSignIn, useSession } from '../lib/session';
import { wasTermsAcceptedOnDevice } from '../lib/account';
import { webUrl } from '../lib/webLinks';
import { signInWithGoogleNative } from '../lib/googleAuth';
import { isAppleSignInAvailable, signInWithAppleNative } from '../lib/appleAuth';

function openLegalLink(path: string) {
  Linking.openURL(webUrl(path)).catch(() => {
    Alert.alert('Could not open link', 'Please try again in a moment.');
  });
}

export default function WelcomeScreen() {
  const {
    loading,
    profileComplete,
    householdOnly,
    termsAccepted,
    signInGuest,
    signInWithGoogleIdToken,
    signInWithAppleCredential,
    recordTermsAcceptance,
    refreshSession,
    user,
  } = useSession();
  const hasRestoredGuestSession = Boolean(user?.isAnonymous);
  const googleConfigured = Boolean(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
  );
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  // Mirrors web's AuthModal: nothing signs in until this is ticked.
  const [agreed, setAgreed] = useState(false);
  const [showAgreeHint, setShowAgreeHint] = useState(false);

  // Someone who already accepted isn't asked again: a restored session whose
  // account records the current Terms, or a device that accepted them before
  // a sign-out, starts with the box ticked.
  useEffect(() => {
    if (user && termsAccepted) setAgreed(true);
  }, [termsAccepted, user]);

  useEffect(() => {
    let active = true;
    wasTermsAcceptedOnDevice().then((accepted) => {
      if (active && accepted) setAgreed(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // A restored session that belongs somewhere else. Skipped while a sign-in
  // started here is in flight: that handler routes when it's done.
  useEffect(() => {
    if (loading || !user || authBusy) return;
    const route = homeRouteFor({ user, profileComplete, householdOnly });
    if (route !== '/welcome') router.replace(route as Href);
  }, [authBusy, householdOnly, loading, profileComplete, user]);

  useEffect(() => {
    let active = true;
    isAppleSignInAvailable().then((available) => {
      if (active) setAppleAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  function requireAgreement(): boolean {
    if (agreed) return true;
    setShowAgreeHint(true);
    return false;
  }

  function toggleAgreed() {
    setAgreed((value) => !value);
    setShowAgreeHint(false);
  }

  /**
   * After any sign-in: save the 18+ / Terms acceptance (as web does), then
   * route on the freshly loaded account. Falls back to the root screen, which
   * routes once the session has loaded, if that read fails.
   */
  async function finishSignIn() {
    await recordTermsAcceptance();
    let route = '/';
    try {
      route = routeAfterSignIn(await refreshSession());
    } catch (error) {
      console.warn('[Welcome] could not load the account after sign-in', error);
    }
    router.replace(route as Href);
  }

  async function handleGooglePress() {
    if (!requireAgreement()) return;
    if (!googleConfigured) {
      Alert.alert(
        'Google sign-in not configured',
        'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and ideally EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) before signing in with Google.',
      );
      return;
    }
    if (authBusy) return;
    setAuthBusy(true);
    let signedIn = false;
    try {
      const result = await signInWithGoogleNative();
      if (result.status !== 'success' || !result.idToken) return;
      await signInWithGoogleIdToken(result.idToken);
      signedIn = true;
      await finishSignIn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We could not sign you in with Google.';
      Alert.alert('Google sign-in failed', message);
    } finally {
      // Stay busy after a successful sign-in; this screen is being replaced.
      if (!signedIn) setAuthBusy(false);
    }
  }

  async function handleApplePress() {
    if (!requireAgreement()) return;
    if (authBusy) return;
    setAuthBusy(true);
    let signedIn = false;
    try {
      const result = await signInWithAppleNative();
      if (result.status !== 'success' || !result.identityToken || !result.rawNonce) return;
      await signInWithAppleCredential(result.identityToken, result.rawNonce);
      signedIn = true;
      await finishSignIn();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We could not sign you in with Apple.';
      Alert.alert('Apple sign-in failed', message);
    } finally {
      if (!signedIn) setAuthBusy(false);
    }
  }

  async function handleGuestPress() {
    if (!requireAgreement()) return;
    if (authBusy) return;
    setAuthBusy(true);
    try {
      if (!user) {
        await signInGuest();
      }
      await finishSignIn();
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'We could not start your mobile session. Please try again.';
      Alert.alert('Sign-in failed', message);
      setAuthBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Your dog&apos;s whole life</Text>
          <Text style={styles.title}>GoDoggyDate</Text>
          <Text style={styles.subtitle}>
            Reveal your dog&apos;s Dogtype, hear what they&apos;re thinking today, and celebrate every milestone —
            then find playmates who actually fit. The home for your dog&apos;s whole life.
          </Text>

          <View style={styles.agreeRow}>
            <Pressable
              onPress={toggleAgreed}
              hitSlop={10}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              accessibilityLabel="I'm 18 or older and agree to the Terms and Privacy Policy"
              style={[
                styles.checkbox,
                agreed && styles.checkboxChecked,
                showAgreeHint && !agreed && styles.checkboxAlert,
              ]}
            >
              {agreed && <Text style={styles.checkboxMark}>✓</Text>}
            </Pressable>
            <Text style={styles.agreeText} onPress={toggleAgreed}>
              I&apos;m 18 or older and agree to the{' '}
              <Text style={styles.agreeLink} accessibilityRole="link" onPress={() => openLegalLink('/terms')}>
                Terms
              </Text>
              {' '}and{' '}
              <Text style={styles.agreeLink} accessibilityRole="link" onPress={() => openLegalLink('/privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
          {showAgreeHint && !agreed && (
            <Text style={styles.agreeHint} accessibilityLiveRegion="polite">
              Tick the box above to continue.
            </Text>
          )}

          <View style={styles.ctaGroup}>
            <Pressable
              style={[styles.secondaryButton, (!googleConfigured || authBusy || !agreed) && styles.buttonDisabled]}
              onPress={handleGooglePress}
              disabled={!googleConfigured || authBusy}
              accessibilityState={{ disabled: !googleConfigured || authBusy || !agreed }}
            >
              <Text style={styles.secondaryText}>Sign in with Google</Text>
            </Pressable>

            {appleAvailable && Platform.OS === 'ios' && (
              <View style={(!agreed || authBusy) && styles.buttonDisabled}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.full}
                  style={styles.appleButton}
                  onPress={handleApplePress}
                />
              </View>
            )}

            <Pressable
              style={[styles.primaryButton, (authBusy || !agreed) && styles.buttonDisabled]}
              disabled={authBusy}
              onPress={handleGuestPress}
              accessibilityState={{ disabled: authBusy || !agreed }}
            >
              <Text style={styles.primaryText}>
                {hasRestoredGuestSession ? 'Resume as Guest' : 'Continue as Guest'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.helperText}>
            {hasRestoredGuestSession
              ? 'A guest session was restored on this device. You can resume setup or switch to Google or Apple sign-in.'
              : 'Sign in with Apple or Google to save your matches across devices, or continue as a guest to start exploring.'}
          </Text>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewBadge}>🌪️ EROB</Text>
          <Text style={styles.previewName}>The Zoomie Menace</Text>
          <Text style={styles.previewMeta}>Maximum dog · one of 16 Dogtypes</Text>
          <View style={styles.previewTags}>
            {['⚡ Spark', '🤼 Rowdy', '🎉 Outgoing', '🚀 Bold'].map((item) => (
              <View key={item} style={styles.previewTag}>
                <Text style={styles.previewTagText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>01</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Build your dog&apos;s profile</Text>
              <Text style={styles.stepText}>Add photos, personality, play style, and their birthday.</Text>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>02</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Reveal their Dogtype &amp; the Playroom</Text>
              <Text style={styles.stepText}>A shareable identity card, a Playroom full of cards made from their real profile, and every milestone.</Text>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>03</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Find playmates who actually fit</Text>
              <Text style={styles.stepText}>When you&apos;re ready, match with compatible dogs nearby — no random swipes.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 24,
    ...shadow.card,
    marginBottom: 18,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.brown,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    lineHeight: 22,
    marginBottom: 22,
  },
  ctaGroup: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.button,
  },
  secondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  appleButton: {
    height: 52,
    width: '100%',
    marginBottom: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    fontFamily: fonts.bold,
    color: colors.white,
    fontSize: 16,
  },
  secondaryText: {
    fontFamily: fonts.bold,
    color: colors.brown,
    fontSize: 16,
  },
  helperText: {
    fontFamily: fonts.body,
    color: colors.brownLight,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
    textAlign: 'left',
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxAlert: {
    borderColor: '#DC2626',
  },
  checkboxMark: {
    color: colors.white,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  agreeText: {
    flex: 1,
    fontFamily: fonts.body,
    color: colors.brownMid,
    fontSize: 13,
    lineHeight: 19,
  },
  agreeLink: {
    fontFamily: fonts.semibold,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  agreeHint: {
    fontFamily: fonts.semibold,
    color: '#DC2626',
    fontSize: 12,
    marginTop: -6,
    marginBottom: 12,
  },
  previewCard: {
    backgroundColor: colors.brown,
    borderRadius: radius.xl,
    padding: 20,
    marginBottom: 18,
  },
  previewBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,183,49,0.18)',
    color: colors.goldLight,
    borderRadius: radius.full,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
    fontFamily: fonts.bold,
    fontSize: 12,
    marginBottom: 12,
  },
  previewName: {
    fontFamily: fonts.display,
    color: colors.white,
    fontSize: 28,
    marginBottom: 4,
  },
  previewMeta: {
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    marginBottom: 14,
  },
  previewTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewTag: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewTagText: {
    fontFamily: fonts.body,
    color: colors.white,
    fontSize: 12,
  },
  section: {
    backgroundColor: colors.creamDark,
    borderRadius: radius.xl,
    padding: 20,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.brown,
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stepNumber: {
    width: 42,
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.primaryLight,
  },
  stepBody: {
    flex: 1,
    paddingTop: 4,
  },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.brown,
    marginBottom: 4,
  },
  stepText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownLight,
  },
});
