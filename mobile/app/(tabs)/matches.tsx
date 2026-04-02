import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../../constants/theme';

export default function MatchesTab() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Matches and chat are Phase 2</Text>
        <Text style={styles.body}>
          The mobile foundation is now wired for real Firebase auth and profile persistence. Discover, matches, and chat will build on that next.
        </Text>
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
  },
});
