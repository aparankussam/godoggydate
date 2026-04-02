import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';

export default function DiscoverTab() {
  const { profileComplete } = useSession();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Discover arrives in Phase 2</Text>
        <Text style={styles.body}>
          Phase 1 on mobile is focused on the real foundation: app boot, auth, profile onboarding, photo upload, and Firebase persistence.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => router.push(profileComplete ? '/(tabs)/profile' : '/onboarding')}
        >
          <Text style={styles.buttonText}>{profileComplete ? 'View profile' : 'Finish profile'}</Text>
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
    padding: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 24,
    ...shadow.card,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.brown,
    marginBottom: 10,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.bold,
    color: colors.white,
    fontSize: 16,
  },
});
