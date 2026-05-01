import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { useSession } from '../lib/session';
import { signInWithGoogleNative } from '../lib/googleAuth';
import { isAppleSignInAvailable, signInWithAppleNative } from '../lib/appleAuth';

export default function WelcomeScreen() {
  const {
    loading,
    profileComplete,
    signInGuest,
    signInWithGoogleIdToken,
    signInWithAppleCredential,
    user,
  } = useSession();
  const hasRestoredGuestSession = Boolean(user?.isAnonymous);
  const googleConfigured = Boolean(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
  );
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (profileComplete) {
      router.replace('/(tabs)/discover');
      return;
    }
    if (!user.isAnonymous) {
      router.replace('/onboarding');
    }
  }, [loading, profileComplete, user]);

  useEffect(() => {
    let active = true;
    isAppleSignInAvailable().then((available) => {
      if (active) setAppleAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleGooglePress() {
    if (!googleConfigured) {
      Alert.alert(
        'Google sign-in not configured',
        'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (and ideally EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) before signing in with Google.',
      );
      return;
    }
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const result = await signInWithGoogleNative();
      if (result.status !== 'success' || !result.idToken) return;
      await signInWithGoogleIdToken(result.idToken);
      router.replace('/(tabs)/discover');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We could not sign you in with Google.';
      Alert.alert('Google sign-in failed', message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleApplePress() {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const result = await signInWithAppleNative();
      if (result.status !== 'success' || !result.identityToken || !result.rawNonce) return;
      await signInWithAppleCredential(result.identityToken, result.rawNonce);
      router.replace('/(tabs)/discover');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'We could not sign you in with Apple.';
      Alert.alert('Apple sign-in failed', message);
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>GoDoggyDate</Text>
          <Text style={styles.title}>GoDoggyDate</Text>
          <Text style={styles.subtitle}>
            Find safe, compatible playmates for your dog nearby. Match on personality, energy, and real-world fit instead of random swipes.
          </Text>

          <View style={styles.ctaGroup}>
            <Pressable
              style={[styles.secondaryButton, (!googleConfigured || authBusy) && styles.buttonDisabled]}
              onPress={handleGooglePress}
              disabled={!googleConfigured || authBusy}
            >
              <Text style={styles.secondaryText}>Sign in with Google</Text>
            </Pressable>

            {appleAvailable && Platform.OS === 'ios' && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.full}
                style={styles.appleButton}
                onPress={handleApplePress}
              />
            )}

            <Pressable
              style={[styles.primaryButton, authBusy && styles.buttonDisabled]}
              disabled={authBusy}
              onPress={async () => {
                if (authBusy) return;
                setAuthBusy(true);
                try {
                  if (!user) {
                    await signInGuest();
                  }
                  router.replace('/onboarding');
                } catch (error) {
                  const message = error instanceof Error
                    ? error.message
                    : 'We could not start your mobile session. Please try again.';
                  Alert.alert('Sign-in failed', message);
                } finally {
                  setAuthBusy(false);
                }
              }}
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
          <Text style={styles.previewBadge}>96 Match</Text>
          <Text style={styles.previewName}>Kaju, Adult</Text>
          <Text style={styles.previewMeta}>Mini Dachshund · Nearby</Text>
          <View style={styles.previewTags}>
            {['Safety First', 'Smart Compatibility', 'Truly Local'].map((item) => (
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
              <Text style={styles.stepTitle}>Create your dog&apos;s profile</Text>
              <Text style={styles.stepText}>Add photos, personality, play style, and location.</Text>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>02</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Swipe through compatible dogs</Text>
              <Text style={styles.stepText}>Browse nearby dogs backed by your real Firebase profile.</Text>
            </View>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>03</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>Match and start chatting</Text>
              <Text style={styles.stepText}>When it&apos;s mutual, your match appears in chat and persists across sessions.</Text>
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
