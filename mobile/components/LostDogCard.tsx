// mobile/components/LostDogCard.tsx
// Entry to the free lost-dog kit (app/lost). Sits in Profile > Care.
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { Heading, Paper, PaperButton } from './pack/kit';

export default function LostDogCard({ dogName }: { dogName: string }) {
  return (
    <Paper style={styles.card}>
      <Heading size={22}>Lost dog kit</Heading>
      <Text style={styles.body}>
        Get {dogName}&apos;s photo, markings and medicine ready now. If they ever go missing, one tap alerts your Pack and
        neighbors. Always free.
      </Text>
      <PaperButton icon="alert-octagon" label="Open the lost dog kit" onPress={() => router.push('/lost')} />
    </Paper>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  body: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
});
