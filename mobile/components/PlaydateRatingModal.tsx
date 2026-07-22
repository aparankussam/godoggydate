import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';

interface Props {
  visible: boolean;
  dogName: string;
  onSubmit: (stars: number, wouldMeetAgain: boolean) => Promise<void>;
  onDismiss: () => void;
}

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
        <View style={styles.card}>
          <Text style={styles.emoji}>🎾</Text>
          <Text style={styles.title}>How did it go with {dogName}?</Text>
          <Text style={styles.subtitle}>This feeds the trust score every other dog parent sees.</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
                <Text style={styles.star}>{n <= stars ? '⭐' : '☆'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Would you meet again?</Text>
          <View style={styles.choiceRow}>
            <Pressable
              style={[styles.choiceBtn, wouldMeetAgain === true && styles.choiceBtnActivePrimary]}
              onPress={() => setWouldMeetAgain(true)}
            >
              <Text style={[styles.choiceText, wouldMeetAgain === true && styles.choiceTextActive]}>
                🐾 Definitely
              </Text>
            </Pressable>
            <Pressable
              style={[styles.choiceBtn, wouldMeetAgain === false && styles.choiceBtnActiveBrown]}
              onPress={() => setWouldMeetAgain(false)}
            >
              <Text style={[styles.choiceText, wouldMeetAgain === false && styles.choiceTextActive]}>
                Not really
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit</Text>}
          </Pressable>
          <Pressable onPress={onDismiss} style={{ paddingVertical: 10 }}>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 24,
    paddingBottom: 36,
  },
  emoji: { fontSize: 36, textAlign: 'center', marginBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.brown, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.brownLight, textAlign: 'center', marginTop: 4 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 20 },
  star: { fontSize: 34 },
  sectionLabel: {
    marginTop: 20,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.brown,
    marginBottom: 8,
  },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choiceBtn: {
    flex: 1,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    paddingVertical: 11,
    alignItems: 'center',
  },
  choiceBtnActivePrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceBtnActiveBrown: { backgroundColor: colors.brown, borderColor: colors.brown },
  choiceText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brown },
  choiceTextActive: { color: '#fff' },
  submitBtn: {
    marginTop: 22,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontFamily: fonts.bold, fontSize: 16 },
  dismissText: { textAlign: 'center', color: colors.brownLight, fontSize: 14 },
});
