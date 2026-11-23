// mobile/components/ProfileDetailsCard.tsx
// The owner's own dog, field by field — name, breed, age, size, energy,
// neighborhood, vaccination, temperament and play style. Mirrors the details
// card on web's profile page (web/app/app/profile/page.tsx). A row with no
// value is left out rather than filled with a placeholder.

import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { stripEmoji } from './pack/kit';
import type { SavedDogProfile } from '../lib/profile';
import { getVaccinationStatus } from '../../shared/profile';

const SIZE_LABELS: Record<string, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra large',
};

function capitalize(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function neighborhood(profile: SavedDogProfile): string | undefined {
  const location = profile.location?.trim();
  if (location) return location;
  const city = profile.city?.trim();
  const state = profile.state?.trim().toUpperCase();
  if (city && state) return `${city}, ${state}`;
  return undefined;
}

interface Row {
  label: string;
  value?: string;
}

export default function ProfileDetailsCard({ profile }: { profile: SavedDogProfile }) {
  // Honest tri-state, as on web: hide the row when vaccination was never
  // answered, and print the shared label verbatim (never re-cased).
  const vaccination = getVaccinationStatus(profile);

  const rows: Row[] = [
    { label: 'Name', value: profile.name?.trim() || undefined },
    { label: 'Breed', value: profile.breed?.trim() || undefined },
    { label: 'Age', value: capitalize(profile.age) },
    { label: 'Size', value: SIZE_LABELS[profile.size] ?? capitalize(profile.size) },
    {
      label: 'Energy',
      value: typeof profile.energyLevel === 'number' && Number.isFinite(profile.energyLevel)
        ? `${profile.energyLevel}%`
        : undefined,
    },
    { label: 'Neighborhood', value: neighborhood(profile) },
    { label: 'Vaccination', value: vaccination.tone === 'unstated' ? undefined : vaccination.label },
  ];
  const visibleRows = rows.filter((row) => row.value);
  const temperament = (profile.temperament ?? []).filter(Boolean);
  const playStyles = (Array.isArray(profile.playStyles) ? profile.playStyles : []).filter(Boolean);

  if (visibleRows.length === 0 && temperament.length === 0 && playStyles.length === 0) return null;

  const blocks = [
    ...visibleRows.map((row) => (
      <View key={row.label} style={styles.row}>
        <Text style={styles.rowLabel}>{row.label}</Text>
        <Text style={styles.rowValue} numberOfLines={2}>{row.value}</Text>
      </View>
    )),
    temperament.length > 0 && (
      <View key="temperament" style={styles.chipBlock}>
        <Text style={styles.rowLabel}>Temperament</Text>
        <View style={styles.chips}>
          {temperament.map((item) => (
            <View key={item} style={styles.chip}><Text style={styles.chipText}>{stripEmoji(item)}</Text></View>
          ))}
        </View>
      </View>
    ),
    playStyles.length > 0 && (
      <View key="playStyles" style={styles.chipBlock}>
        <Text style={styles.rowLabel}>Play style</Text>
        <View style={styles.chips}>
          {playStyles.map((item) => (
            <View key={item} style={styles.chip}><Text style={styles.chipText}>{stripEmoji(item)}</Text></View>
          ))}
        </View>
      </View>
    ),
  ].filter(Boolean);

  return (
    <View style={styles.card}>
      {blocks.map((block, i) => (
        <View key={i} style={i > 0 ? styles.divider : undefined}>{block}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.ink,
    marginBottom: 20,
    overflow: 'hidden',
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.brownMid },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.brown,
  },
  chipBlock: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.cream,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontFamily: fonts.bold, fontSize: 12, color: colors.brownMid },
});
