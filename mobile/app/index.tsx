import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';
import { router, type Href } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { homeRouteFor, useSession } from '../lib/session';

export default function IndexScreen() {
  const { loading, user, profileComplete, householdOnly } = useSession();

  // Signed out or an unfinished guest -> welcome; a finished profile ->
  // Discover; invited onto someone's dog with none of their own -> the
  // household screen; otherwise onboarding. See homeRouteFor.
  useEffect(() => {
    if (loading) return;
    router.replace(homeRouteFor({ user, profileComplete, householdOnly }) as Href);
  }, [householdOnly, loading, profileComplete, user]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>GoDoggyDate</Text>
        <Text style={styles.subtitle}>Sniffing things out…</Text>
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
