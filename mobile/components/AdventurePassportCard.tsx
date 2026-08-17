// mobile/components/AdventurePassportCard.tsx
// The shareable "Adventure Passport" — a summary of stamped quests. forwardRef
// for view-shot capture; brand + URL baked inside. The count is a literal count
// of the owner's own checked-off quests, so it's honest.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, radius } from '../constants/theme';
import type { Adventure } from '../../shared/adventures';

interface Props {
  dogName: string;
  photoUrl?: string;
  completed: Adventure[];
  total: number;
}

const AdventurePassportCard = forwardRef<View, Props>(({ dogName, photoUrl, completed, total }, ref) => {
  const stamps = completed.slice(0, 12);
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient colors={['#1F3A2E', '#2E5A43', '#5C8A6A']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Adventure Passport</Text>
          <Text style={styles.name}>{dogName}</Text>
        </View>
        {/* Emoji behind the photo so an undecoded remote image still captures. */}
        <View style={styles.photoWrap}>
          <Text style={styles.photoEmoji}>🐕</Text>
          {photoUrl ? <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} /> : null}
        </View>
      </View>

      <View style={styles.progressRow}>
        <Text style={styles.count}>{completed.length}</Text>
        <Text style={styles.of}>/ {total} quests stamped</Text>
      </View>

      <View style={styles.stampGrid}>
        {stamps.map((a) => (
          <View key={a.id} style={styles.stamp}>
            <Text style={styles.stampEmoji}>{a.emoji}</Text>
          </View>
        ))}
        {completed.length === 0 && <Text style={styles.emptyStamps}>No stamps yet — the adventure starts now.</Text>}
      </View>

      <View style={styles.footer}>
        <Text style={styles.brand}>GoDoggyDate</Text>
        <Text style={styles.url}>godoggydate.com</Text>
      </View>
    </View>
  );
});

AdventurePassportCard.displayName = 'AdventurePassportCard';
export default AdventurePassportCard;

const CARD_WIDTH = 320;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: 20,
    minHeight: 380,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  name: { fontFamily: fonts.display, fontSize: 30, color: '#fff', marginTop: 1 },
  photoWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  photoEmoji: { fontSize: 32 },
  progressRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 18, gap: 6 },
  count: { fontFamily: fonts.display, fontSize: 56, color: '#fff', lineHeight: 56 },
  of: { fontFamily: fonts.semibold, fontSize: 15, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
  stampGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  stamp: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  stampEmoji: { fontSize: 26 },
  emptyStamps: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.75)', paddingVertical: 20 },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  brand: { fontFamily: fonts.display, fontSize: 13, color: '#fff' },
  url: { fontFamily: fonts.body, fontSize: 10, color: 'rgba(255,255,255,0.6)' },
});
