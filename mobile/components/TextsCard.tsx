// mobile/components/TextsCard.tsx
// The shareable "Texts From Your Dog" card — a chat-bubble thread of the unhinged
// messages the dog supposedly sent. Mirrors web/components/TextsCard.tsx.
// Deliberately GENERIC bubbles: rounded speech blobs on a neutral warm ground,
// NO iMessage trade dress (no blue/green gradients, no delivered/read receipts,
// no Apple type). It reads as "a messaging app" without impersonating one.
//
// Openly a joke: the header baked into the card says the dog cannot actually
// text (yet). Wrapped in forwardRef<View> so react-native-view-shot can capture
// it as a PNG (same path as DogtypeCard), and the honest AI header + brand + URL
// are baked INSIDE the captured view so a reposted screenshot keeps them.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../constants/theme';

interface Props {
  texts: string[];
  dogName: string;
}

// Warm, brand-adjacent palette kept as literal hex so the captured PNG is
// faithful. Generic on purpose — not modeled on any real messaging app.
const PAPER = '#FFFDF9';
const INK = '#1F1B16';
const INK_SOFT = '#8A8378';
const RULE = '#ECE6DA';
const ACCENT = '#E8633A';
const BUBBLE_BG = '#F1EADC'; // received-style bubble (the dog is texting you)
const BUBBLE_INK = '#2A2620';

const TextsCard = forwardRef<View, Props>(function TextsCard({ texts, dogName }, ref) {
  const thread = texts.slice(0, 6);

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Chat header — a generic "who / status" row, not any real app's chrome */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>🐶</Text>
        </View>
        <View>
          <Text style={styles.name}>{dogName}</Text>
          <Text style={styles.status}>typing…</Text>
        </View>
      </View>

      {/* Honest header — baked into the PNG so it travels with the screenshot */}
      <Text style={styles.honest}>
        Imagined by AI — {dogName} cannot actually text (yet).
      </Text>

      {/* The thread of received-style bubbles */}
      <View style={styles.thread}>
        {thread.map((msg, i) => (
          <View key={i} style={styles.bubbleRow}>
            <Text style={styles.bubble}>{msg}</Text>
          </View>
        ))}
      </View>

      {/* Baked-in brand + URL — a reposted PNG still carries the back-link. */}
      <View style={styles.brand}>
        <Text style={styles.brandName}>GoDoggyDate</Text>
        <Text style={styles.brandUrl}>godoggydate.com</Text>
      </View>
    </View>
  );
});

export default TextsCard;

const styles = StyleSheet.create({
  card: {
    width: 340,
    backgroundColor: PAPER,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: RULE,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BUBBLE_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 20 },
  name: { fontFamily: fonts.display, fontSize: 17, color: INK },
  status: { fontFamily: fonts.semibold, fontSize: 11, color: ACCENT, marginTop: 1 },
  honest: {
    paddingHorizontal: 20,
    paddingTop: 12,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 10.5,
    lineHeight: 15,
    color: INK_SOFT,
  },
  thread: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 8,
  },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    backgroundColor: BUBBLE_BG,
    color: BUBBLE_INK,
    fontFamily: fonts.body,
    fontSize: 14.5,
    lineHeight: 20,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    overflow: 'hidden',
  },
  brand: {
    marginHorizontal: 20,
    marginBottom: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: RULE,
  },
  brandName: { fontFamily: fonts.display, fontSize: 13, color: INK },
  brandUrl: { fontFamily: fonts.body, fontSize: 10, color: INK_SOFT },
});
