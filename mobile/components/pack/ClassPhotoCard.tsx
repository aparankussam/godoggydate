// mobile/components/pack/ClassPhotoCard.tsx
// The Pack Day "class photo": a collage of every dog that checked in, drawn as
// one card so react-native-view-shot can capture it for the share sheet
// (lib/shareCard.ts), in the same style as DogTradingCard. The brand and the
// godoggydate.com link are on the card itself, because social apps strip captions.

import { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';

export interface ClassPhotoDog {
  uid: string;
  name: string;
  photo: string | null;
}

interface Props {
  title: string;
  when: string;
  dogs: ClassPhotoDog[];
}

/** Up to 12 tiles; columns grow with the group so the card stays roughly square. */
const MAX_TILES = 12;

const ClassPhotoCard = forwardRef<View, Props>(({ title, when, dogs }, ref) => {
  const shown = dogs.slice(0, MAX_TILES);
  const extra = dogs.length - shown.length;
  const columns = shown.length <= 4 ? 2 : 3;
  const tile = `${Math.floor(100 / columns) - 2}%` as const;

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      <Text style={styles.kicker}>CLASS PHOTO 📸</Text>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      <Text style={styles.when}>{when}</Text>
      <View style={styles.grid}>
        {shown.map((dog) => (
          <View key={dog.uid} style={[styles.tile, { width: tile }]}>
            {dog.photo ? (
              <Image source={{ uri: dog.photo }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.fallback]}><Text style={styles.fallbackEmoji}>🐕</Text></View>
            )}
            <Text style={styles.name} numberOfLines={1}>{dog.name}</Text>
          </View>
        ))}
      </View>
      {extra > 0 ? <Text style={styles.more}>+{extra} more</Text> : null}
      <Text style={styles.footer}>
        {dogs.length} {dogs.length === 1 ? 'dog' : 'dogs'} · godoggydate.com
      </Text>
    </View>
  );
});

ClassPhotoCard.displayName = 'ClassPhotoCard';
export default ClassPhotoCard;

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: colors.paper,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 24,
    padding: 16,
    gap: 6,
  },
  kicker: { fontFamily: fonts.black, fontSize: 12, letterSpacing: 1.2, color: colors.rose },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.ink },
  when: { fontFamily: fonts.bold, fontSize: 13, color: colors.brownMid, marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tile: { alignItems: 'center', gap: 3 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: 14, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.note },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackEmoji: { fontSize: 30 },
  name: { fontFamily: fonts.black, fontSize: 12, color: colors.ink, maxWidth: '100%' },
  more: { fontFamily: fonts.black, fontSize: 13, color: colors.ink, textAlign: 'center' },
  footer: { fontFamily: fonts.black, fontSize: 12, color: colors.brownMid, textAlign: 'center', marginTop: 8 },
});
