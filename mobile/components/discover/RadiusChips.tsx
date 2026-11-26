// mobile/components/discover/RadiusChips.tsx
// How far Discover looks: 10 / 25 / 50 / 100 mi, the same choices as the
// website's Discover. Remembered on this phone (lib/discover radius helpers).

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/theme';
import { DISCOVER_RADIUS_OPTIONS } from '../../lib/discover';

export default function RadiusChips({ value, onChange }: { value: number; onChange: (miles: number) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Search radius">
      <Text style={styles.label}>Radius</Text>
      {DISCOVER_RADIUS_OPTIONS.map((miles) => {
        const on = miles === value;
        return (
          <Pressable
            key={miles}
            onPress={() => onChange(miles)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${miles} miles`}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{miles} mi</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  chipTextOn: { color: colors.paper },
});
