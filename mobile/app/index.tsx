import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { useSession } from '../lib/session';

export default function IndexScreen() {
  const { loading, user, profileComplete } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/welcome');
      return;
    }
    if (profileComplete) {
      router.replace('/(tabs)/discover');
      return;
    }
    if (user.isAnonymous) {
      router.replace('/welcome');
      return;
    }
    if (!profileComplete) {
      router.replace('/onboarding');
      return;
    }
  }, [loading, profileComplete, user]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>GoDoggyDate</Text>
        <Text style={styles.subtitle}>Preparing your mobile beta…</Text>
        <ActivityIndicator color={colors.primary} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', gap: 12 },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.brown,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
  },
});
