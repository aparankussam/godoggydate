import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, fonts, radius } from '../constants/theme';
import { PrimaryButton, SecondaryButton, SkyBackground, StickerDog, Tag, Tape } from '../components/sticker';
import AnimatedLogo from '../components/AnimatedLogo';
import { homeRouteFor, routeAfterSignIn, useSession } from '../lib/session';
import { wasTermsAcceptedOnDevice } from '../lib/account';
import { webUrl } from '../lib/webLinks';
import { signInWithGoogleNative } from '../lib/googleAuth';
import { isAppleSignInAvailable, signInWithAppleNative } from '../lib/appleAuth';

const TRUST = ['Adults 18+', 'Approximate location only', "Each owner's limits shown up front", 'Meet in public places'];

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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <SkyBackground />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {/* The animated logo is the header here: one logo, and the sign-in buttons stay on screen. */}
          <AnimatedLogo width={210} />
        </View>

        {/* Sample card: no photo ships with the app, so the drawn sticker dog stands in. */}
        <View style={styles.hero}>
          <View style={styles.polaroid} accessible accessibilityLabel="Sample card: your dog's Dogtype could be The Zoomie Menace">
            <Tape width={84} height={22} angle={-5} style={styles.polaroidTape} />
            <View style={styles.slot}>
              <StickerDog size={112} />
            </View>
            <View style={styles.caption}>
              <Text style={styles.captionName}>Your dog?</Text>
              <Text style={styles.captionMeta}>Dogtype: ?</Text>
            </View>
            <Tag label="Sample card" tilt={-3} style={styles.sampleTag} />
          </View>

          <View style={styles.typeTag} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.typeTagHead}>A sample Dogtype</Text>
            <Text style={styles.typeTagName} numberOfLines={1}>The Zoomie Menace</Text>
            <Text style={styles.typeTagLine}>Maximum dog.</Text>
          </View>
        </View>

        <Text style={styles.title}>Find a dog who{'\n'}plays like yours.</Text>
        <Text style={styles.subtitle}>
          <Text style={styles.subtitleLead}>Playdates for your dog</Text> with compatible dogs nearby. Friendship
          between dogs, not dating.
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
            {agreed && <Ionicons name="checkmark-sharp" size={18} color={colors.paper} />}
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
          <View style={styles.agreeHint} accessibilityLiveRegion="polite">
            <Text style={styles.agreeHintText}>Tick the box above to continue.</Text>
          </View>
        )}

        <View style={styles.ctaGroup}>
          <PrimaryButton
            label={hasRestoredGuestSession ? 'Resume as Guest' : 'Continue as Guest'}
            onPress={handleGuestPress}
            disabled={authBusy}
            style={!agreed && styles.buttonDim}
          />

          <SecondaryButton
            label="Sign in with Google"
            icon={<Ionicons name="logo-google" size={18} color={colors.ink} />}
            onPress={handleGooglePress}
            disabled={!googleConfigured || authBusy}
            style={!agreed && googleConfigured && !authBusy && styles.buttonDim}
          />

          {appleAvailable && Platform.OS === 'ios' && (
            <View style={(!agreed || authBusy) && styles.buttonDim}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.full}
                style={styles.appleButton}
                onPress={handleApplePress}
              />
            </View>
          )}
        </View>

        <Text style={styles.helperText}>
          {hasRestoredGuestSession
            ? 'A guest session was restored on this device. You can resume setup or switch to Google or Apple sign-in.'
            : 'Sign in with Apple or Google to keep your matches across devices, or continue as a guest to start exploring.'}
        </Text>

        <View style={styles.trust} accessibilityLabel="What to know">
          {/* Paper continues past the end so an overscroll bounce never shows a gap. */}
          <View pointerEvents="none" style={styles.trustTail} />
          {TRUST.map((item) => (
            <View key={item} style={styles.trustRow}>
              <View style={styles.trustDot} />
              <Text style={styles.trustText}>{item}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.sky,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  hero: {
    height: 260,
    marginTop: 8,
    marginHorizontal: 16,
  },
  polaroid: {
    position: 'absolute',
    left: 28,
    right: 40,
    top: 24,
    backgroundColor: colors.paper,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingTop: 9,
    paddingHorizontal: 9,
    transform: [{ rotate: '2deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  polaroidTape: {
    top: -11,
    left: 22,
  },
  slot: {
    height: 140,
    borderRadius: 3,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    backgroundColor: colors.note,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    paddingTop: 6,
    paddingBottom: 10,
    alignItems: 'center',
  },
  captionName: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 30,
    color: colors.ink,
  },
  captionMeta: {
    fontFamily: fonts.black,
    fontSize: 13,
    lineHeight: 16,
    color: colors.ink,
  },
  sampleTag: {
    position: 'absolute',
    right: -12,
    top: 160,
  },
  typeTag: {
    position: 'absolute',
    right: -4,
    top: 0,
    width: 168,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    transform: [{ rotate: '4deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 0,
    elevation: 3,
  },
  typeTagHead: {
    alignSelf: 'stretch',
    textAlign: 'center',
    backgroundColor: colors.ink,
    color: colors.paper,
    fontFamily: fonts.black,
    fontSize: 12,
    lineHeight: 15,
    paddingTop: 3,
    paddingBottom: 4,
  },
  typeTagName: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: colors.ink,
    paddingTop: 3,
    paddingHorizontal: 4,
  },
  typeTagLine: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 16,
    color: colors.brownMid,
    paddingBottom: 6,
  },
  title: {
    marginHorizontal: 18,
    marginTop: 4,
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 38,
    color: colors.ink,
    letterSpacing: 0.2,
  },
  subtitle: {
    marginHorizontal: 18,
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.brownMid,
  },
  subtitleLead: {
    fontFamily: fonts.black,
    color: colors.ink,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 18,
    marginHorizontal: 18,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.ink,
  },
  checkboxAlert: {
    borderWidth: 3,
  },
  agreeText: {
    flex: 1,
    fontFamily: fonts.bold,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 2,
  },
  agreeLink: {
    fontFamily: fonts.black,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  agreeHint: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginLeft: 54,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  agreeHintText: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.ink,
  },
  ctaGroup: {
    gap: 12,
    marginTop: 16,
    marginHorizontal: 18,
  },
  appleButton: {
    height: 52,
    width: '100%',
  },
  buttonDim: {
    opacity: 0.7,
  },
  helperText: {
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 22,
    fontFamily: fonts.bold,
    color: colors.brownMid,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  trust: {
    flexGrow: 1,
    backgroundColor: colors.paper,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: colors.ink,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    marginHorizontal: -2,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 40,
  },
  trustTail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    height: 1000,
    backgroundColor: colors.paper,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.ink,
  },
  trustText: {
    fontFamily: fonts.bold,
    fontSize: 15.5,
    lineHeight: 30,
    color: colors.ink,
  },
});
