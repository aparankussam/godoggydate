import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { router, type Href } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { SkyBackground } from '../components/sticker';
import BrandLogo from '../components/BrandLogo';
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
      <SkyBackground />
      <View style={styles.content}>
        <BrandLogo height={52} />
        <Text style={styles.subtitle}>Sniffing things out…</Text>
        <ActivityIndicator color={colors.ink} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { alignItems: 'center', gap: 12 },
  subtitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
});
