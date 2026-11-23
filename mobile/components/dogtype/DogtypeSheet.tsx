// mobile/components/dogtype/DogtypeSheet.tsx
// The full read on one Dogtype you've met: who it is, how it gets along with your
// dog (every reason line), and the dogs you've matched who are that type. Opens
// from a tile in the collection and from the match screen. It only ever receives
// a type you have discovered or your own, never a hidden one.

import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fonts } from '../../constants/theme';
import { StickerDog } from '../sticker';
import { dogtypeByCode, dogtypeCompat, dogtypeReasons } from '../../../shared/dogtype';
import type { MatchItem } from '../../lib/matches';

interface Props {
  visible: boolean;
  onClose: () => void;
  code: string | null;
  ownCode: string;
  ownName: string;
  /** Matched dogs of this type, from current matches. */
  matches: MatchItem[];
  /** "Discovered through Biscuit · Nov 23", when known. */
  discoveredLine?: string;
  /** The match screen already is a match with this dog: skip the list. Default true. */
  showMatches?: boolean;
}

export default function DogtypeSheet({ visible, onClose, code, ownCode, ownName, matches, discoveredLine, showMatches = true }: Props) {
  const type = code ? dogtypeByCode(code) : null;
  if (!type || !code) return null;
  const isOwn = code === ownCode;
  const compat = isOwn ? null : dogtypeCompat(ownCode, code);
  const reasons = isOwn ? [] : dogtypeReasons(ownCode, code);
  const vibeLabel = !compat ? '' : compat.vibe === 'great' ? 'Great vibe' : compat.vibe === 'spicy' ? 'Spicy · take it slow' : 'Good potential';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.grabber} />
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <View style={styles.sticker}><Text style={styles.stickerEmoji}>{type.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{isOwn ? `${ownName}’s Dogtype` : 'Dogtype you’ve met'}</Text>
              <Text style={styles.name}>{type.name}</Text>
              <Text style={styles.tagline}>{type.tagline}</Text>
            </View>
          </View>
          {discoveredLine ? <Text style={styles.meta}>{discoveredLine}</Text> : null}
          <Text style={styles.blurb}>{type.blurb}</Text>
          <View style={styles.chips}>
            {type.axes.map((a) => (
              <View key={a.key} style={styles.chip}>
                <Text style={styles.chipText}>{a.pole.emoji} {a.pole.label}</Text>
              </View>
            ))}
          </View>

          {!isOwn && compat && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>How they get along with {ownName}</Text>
              <View style={[styles.vibe, compat.vibe === 'great' && { backgroundColor: colors.fit }]}>
                <Text style={styles.vibeText}>{vibeLabel}</Text>
              </View>
              {reasons.map((r) => (
                <View key={r.text} style={styles.reasonRow}>
                  <View style={[styles.mark, { backgroundColor: r.mark === 'good' ? colors.fit : colors.amber }]}>
                    <Text style={styles.markText}>{r.mark === 'good' ? '✓' : '!'}</Text>
                  </View>
                  <Text style={styles.reasonText}>{r.text}</Text>
                </View>
              ))}
            </View>
          )}

          {showMatches && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>
              {matches.length > 0 ? `Your matches of this type (${matches.length})` : 'Your matches of this type'}
            </Text>
            {matches.length === 0 ? (
              <Text style={styles.empty}>
                {isOwn ? `No matches share ${ownName}’s type yet.` : 'None right now. This type stays discovered.'}
              </Text>
            ) : (
              matches.map((m) => (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [styles.matchRow, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${m.dog.name}'s profile`}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/dog/[matchId]', params: { matchId: m.id } });
                  }}
                >
                  <View style={styles.avatar}>
                    {m.dog.heroPhoto ? <Image source={{ uri: m.dog.heroPhoto }} style={StyleSheet.absoluteFill} /> : <StickerDog size={34} label={`${m.dog.name}, drawn`} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchName} numberOfLines={1}>{m.dog.name}</Text>
                    {m.dog.breed && m.dog.breed !== 'Unknown breed' ? <Text style={styles.matchBreed} numberOfLines={1}>{m.dog.breed}</Text> : null}
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              ))
            )}
          </View>
          )}
        </ScrollView>
        <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '86%',
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.ink,
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 6 },
  body: { padding: 18, paddingTop: 8, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sticker: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.note, borderWidth: 3, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  stickerEmoji: { fontSize: 36 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose },
  name: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, color: colors.ink },
  tagline: { fontFamily: fonts.hand, fontSize: 21, lineHeight: 24, color: colors.ink },
  meta: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownMid },
  blurb: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.brownMid },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 2, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.paper },
  chipText: { fontFamily: fonts.black, fontSize: 12, color: colors.ink },
  block: { gap: 8, borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 12 },
  blockTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.ink },
  vibe: { alignSelf: 'flex-start', backgroundColor: colors.kraft, borderWidth: 2, borderColor: colors.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  vibeText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mark: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  markText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  reasonText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.ink },
  empty: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownMid },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: colors.ink, borderRadius: 16, padding: 10, backgroundColor: colors.white },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.kraft, alignItems: 'center', justifyContent: 'center' },
  matchName: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  matchBreed: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brownMid },
  chev: { fontFamily: fonts.black, fontSize: 24, color: colors.ink },
  close: { margin: 16, marginTop: 4, height: 48, borderRadius: 999, backgroundColor: colors.paper, borderWidth: 2.5, borderBottomWidth: 5, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: fonts.black, fontSize: 15, color: colors.ink },
});
