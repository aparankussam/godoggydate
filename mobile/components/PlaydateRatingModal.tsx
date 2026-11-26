import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';
import { PawIcon, PrimaryButton } from './sticker';

interface Props {
  visible: boolean;
  dogName: string;
  onSubmit: (stars: number, wouldMeetAgain: boolean) => Promise<void>;
  onDismiss: () => void;
}

// A paper sheet on an ink scrim. Submit is the one pink action while it's open.
export default function PlaydateRatingModal({ visible, dogName, onSubmit, onDismiss }: Props) {
  const [stars, setStars] = useState(0);
  const [wouldMeetAgain, setWouldMeetAgain] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = stars > 0 && wouldMeetAgain !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(stars, wouldMeetAgain!);
      setStars(0);
      setWouldMeetAgain(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.coin} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons name="tennis-ball" size={26} color={colors.ink} />
          </View>
          <Text style={styles.title} accessibilityRole="header">How did it go with {dogName}?</Text>
          <Text style={styles.subtitle}>This feeds the trust score every other dog parent sees.</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setStars(n)}
                hitSlop={4}
                style={styles.starBtn}
                accessibilityRole="button"
                accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                accessibilityState={{ selected: n <= stars }}
              >
                <MaterialCommunityIcons name={n <= stars ? 'star' : 'star-outline'} size={34} color={colors.ink} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Would you meet again?</Text>
          <View style={styles.choiceRow}>
            <Pressable
              style={[styles.choiceBtn, wouldMeetAgain === true && styles.choiceBtnOn]}
              onPress={() => setWouldMeetAgain(true)}
              accessibilityRole="button"
              accessibilityState={{ selected: wouldMeetAgain === true }}
            >
              <PawIcon size={16} color={wouldMeetAgain === true ? colors.paper : colors.ink} />
              <Text style={[styles.choiceText, wouldMeetAgain === true && styles.choiceTextOn]}>Definitely</Text>
            </Pressable>
            <Pressable
              style={[styles.choiceBtn, wouldMeetAgain === false && styles.choiceBtnOn]}
              onPress={() => setWouldMeetAgain(false)}
              accessibilityRole="button"
              accessibilityState={{ selected: wouldMeetAgain === false }}
            >
              <Text style={[styles.choiceText, wouldMeetAgain === false && styles.choiceTextOn]}>Not really</Text>
            </Pressable>
          </View>

          <PrimaryButton
            label="Submit"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            style={styles.submit}
          />
          <Pressable onPress={onDismiss} style={styles.dismiss} accessibilityRole="button">
            <Text style={styles.dismissText}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 8,
  },
  coin: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    transform: [{ rotate: '-8deg' }],
  },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 28, color: colors.ink, textAlign: 'center' },
  subtitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.brownMid,
    textAlign: 'center',
    marginTop: 6,
  },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 16 },
  starBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: fonts.black,
    fontSize: 14,
    color: colors.ink,
  },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choiceBtn: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  choiceBtnOn: { backgroundColor: colors.ink },
  choiceText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  choiceTextOn: { color: colors.paper },
  submit: { marginTop: 20 },
  dismiss: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  dismissText: { textAlign: 'center', fontFamily: fonts.black, color: colors.brownMid, fontSize: 14 },
});
