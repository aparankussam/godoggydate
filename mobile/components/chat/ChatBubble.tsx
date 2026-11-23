// mobile/components/chat/ChatBubble.tsx
// One chat message as a paper note: mine on the note tint, theirs on paper,
// both with an ink outline and a hard flat shadow, and a tiny tilt each way.
// Port of web/components/ChatBubble.tsx.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';

interface Props {
  text: string;
  fromMe: boolean;
  time?: string;
  /** Caught by the server's content filter: muted, dashed, never a card. */
  moderated?: boolean;
}

export default function ChatBubble({ text, fromMe, time, moderated }: Props) {
  if (moderated) {
    return (
      <View style={[styles.wrap, fromMe ? styles.wrapMe : styles.wrapThem]}>
        <View style={[styles.bubble, styles.moderated]}>
          <Text style={styles.moderatedText}>{text || 'This message was removed.'}</Text>
        </View>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    );
  }
  return (
    <View style={[styles.wrap, fromMe ? styles.wrapMe : styles.wrapThem]}>
      <View style={[styles.bubble, fromMe ? styles.me : styles.them]}>
        <Text style={styles.text}>{text}</Text>
      </View>
      {time ? <Text style={styles.time}>{time}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: '80%', marginBottom: 10, gap: 3 },
  wrapMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  wrapThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    maxWidth: '100%',
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 9,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 0,
    elevation: 2,
  },
  me: {
    backgroundColor: colors.note,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 4,
    transform: [{ rotate: '0.6deg' }],
  },
  them: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
    borderBottomLeftRadius: 4,
    transform: [{ rotate: '-0.6deg' }],
  },
  text: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink },
  moderated: {
    backgroundColor: colors.creamDark,
    borderStyle: 'dashed',
    borderWidth: 2,
    borderRadius: 18,
    shadowOpacity: 0,
    elevation: 0,
  },
  moderatedText: {
    fontFamily: fonts.bold,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownMid,
  },
  time: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid, paddingHorizontal: 4 },
});
