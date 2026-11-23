// mobile/components/playroom/TreatRow.tsx
// One line in "Treat Lab": a title and a short glimpse. Tapping opens that maker
// in place. The maker (an AI generator) only runs on a tap inside the open view.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';

interface Props {
  title: string;
  glimpse: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export default function TreatRow({ title, glimpse, open, onToggle, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${glimpse}`}
        onPress={onToggle}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.glimpse} numberOfLines={2}>{glimpse}</Text>
        </View>
        <Text style={styles.chev}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, minHeight: 64 },
  title: { fontFamily: fonts.display, fontSize: 19, lineHeight: 22, color: colors.ink },
  glimpse: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.brownMid, marginTop: 2 },
  chev: { fontFamily: fonts.black, fontSize: 13, color: colors.rose },
  body: { paddingHorizontal: 8, paddingBottom: 10 },
});
