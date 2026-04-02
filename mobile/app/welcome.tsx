import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { useSession } from '../lib/session';

export default function WelcomeScreen() {
  const { signInGuest } = useSession();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>Mobile Beta</Text>
        <Text style={styles.title}>GoDoggyDate</Text>
        <Text style={styles.subtitle}>
          Phase 1 brings real Firebase auth, profile setup, photo upload, and profile persistence to Expo.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={async () => {
            try {
              await signInGuest();
              router.replace('/onboarding');
            } catch {
              Alert.alert('Sign-in failed', 'We could not start your mobile session. Please try again.');
            }
          }}
        >
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 24,
    ...shadow.card,
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
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.button,
  },
  primaryText: {
    fontFamily: fonts.bold,
    color: colors.white,
    fontSize: 16,
  },
});
