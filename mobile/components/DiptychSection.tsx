// mobile/components/DiptychSection.tsx
// Profile-mounted surface for the DAY 1 vs DAY N diptych — the National Dog Day
// hook. Mirrors web/components/DiptychSection.tsx. The owner picks their
// EARLIEST photo and their LATEST photo from their own uploads, confirms the
// date that earliest photo was taken, and we render a shareable "then vs now"
// card with an honest day-count between them.
//
// HONEST: the count is (today − the confirmed earliest date), and it is labelled
// "since your earliest photo" everywhere — never a birth, age, or "days alive"
// claim. If the owner hasn't given a valid (non-future) date, we PROMPT for one
// instead of inventing a number; the card only appears once a real date is set.
//
// Self-contained: reads only the owner's own profile, computes nothing from
// other users, and shares via the same react-native-view-shot path (captureAndShare)
// as every other card. No native date picker dependency — the date is a
// US MM/DD/YYYY text field, matching the rabies-expiry input in ProfileEditor
// and every other date the app asks for (shared/dates.ts).

import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import type { SavedDogProfile } from '../lib/profile';
import { getRenderablePhotos } from '../lib/photos';
import { captureAndShare } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import DiptychCard from './DiptychCard';
import { formatUsMonthYear, maskUsDateInput, parseUsDateInput } from '../../shared/dates';

interface Props {
  savedProfile: SavedDogProfile;
}

/** Local-midnight Date from a US MM/DD/YYYY string, or null if incomplete or
 *  not a real calendar date (rejects roll-overs like 02/31 so the day count
 *  stays honest). Shares the app's one date parser. */
function parseInputDate(value: string): Date | null {
  const parsed = parseUsDateInput(value);
  if (!parsed.ok) return null;
  const { year, month, day } = parsed.value;
  // The day count needs an exact day — a month-only value can't anchor it.
  if (month === null || day === null) return null;
  return new Date(year, month - 1, day);
}

/** Whole days from a local-midnight earliest date to today, DST-immune.
 *  Returns null for a future date (refuse rather than show a negative count). */
function daysSince(earliest: Date): number | null {
  const now = new Date();
  const a = Date.UTC(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return b < a ? null : Math.round((b - a) / 86_400_000);
}

export default function DiptychSection({ savedProfile }: Props) {
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const photos = useMemo(() => getRenderablePhotos(savedProfile.photos), [savedProfile.photos]);
  const dogName = savedProfile.name?.trim() || 'Your dog';

  // Earliest defaults to the first photo, latest to the last — the owner can
  // repoint either. Kept as indices into the renderable-photos array.
  const [earliestIdx, setEarliestIdx] = useState(0);
  const [latestIdx, setLatestIdx] = useState(() => Math.max(0, photos.length - 1));
  const [dateValue, setDateValue] = useState('');

  // Needs at least one photo to show a face; the date is required for an honest
  // count, so the card stays hidden until the owner confirms one.
  if (photos.length === 0) return null;

  const earliestDate = parseInputDate(dateValue);
  const days = earliestDate ? daysSince(earliestDate) : null;
  const futureDate = dateValue.trim().length > 0 && earliestDate !== null && days === null;

  const earliestUrl = photos[Math.min(earliestIdx, photos.length - 1)];
  const latestUrl = photos[Math.min(latestIdx, photos.length - 1)];

  const earliestLabel = earliestDate
    ? formatUsMonthYear(earliestDate)
    : undefined;

  // Need at least 1 day (dating the earliest photo to today is not a "then vs now").
  const ready = days !== null && days >= 1;

  async function handleShare() {
    if (sharing || !ready || days === null) return;
    setSharing(true);
    trackEvent('diptych_share_click', { days });
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-day1-vs-day${days}.png`,
      `${dogName}: Day 1 vs Day ${days}`,
    );
    if (result === 'shared') trackEvent('diptych_shared', { method: 'native_share', days });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    setSharing(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>National Dog Day 🐾</Text>
      <Text style={styles.title}>Day 1 vs Day N</Text>
      <Text style={styles.intro}>
        Two of your own photos, then vs now, with the real number of days since your earliest one. Pick the first
        and latest shots and tell us when that first photo was taken.
      </Text>

      {/* Photo pickers — only shown when there's more than one photo to choose. */}
      {photos.length > 1 && (
        <>
          <Text style={styles.pickerLabel}>Earliest photo (Day 1)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
            {photos.map((url, i) => (
              <Pressable
                key={`e-${i}`}
                onPress={() => setEarliestIdx(i)}
                accessibilityRole="button"
                accessibilityLabel={`Use photo ${i + 1} as the earliest`}
                accessibilityState={{ selected: i === earliestIdx }}
                style={[styles.thumb, i === earliestIdx && styles.thumbActive]}
              >
                <Image source={{ uri: url }} style={styles.thumbImage} />
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.pickerLabel}>Latest photo (Day N)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip}>
            {photos.map((url, i) => (
              <Pressable
                key={`l-${i}`}
                onPress={() => setLatestIdx(i)}
                accessibilityRole="button"
                accessibilityLabel={`Use photo ${i + 1} as the latest`}
                accessibilityState={{ selected: i === latestIdx }}
                style={[styles.thumb, i === latestIdx && styles.thumbActive]}
              >
                <Image source={{ uri: url }} style={styles.thumbImage} />
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}

      {/* Date confirmation — the honest input the whole count rests on. */}
      <Text style={styles.pickerLabel}>When was that earliest photo taken?</Text>
      <TextInput
        style={styles.input}
        placeholder="MM/DD/YYYY"
        placeholderTextColor={colors.brownLight}
        value={dateValue}
        onChangeText={(t) => setDateValue(maskUsDateInput(t))}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={10}
        accessibilityLabel="Earliest photo date, formatted month slash day slash year"
      />
      {futureDate ? (
        <Text style={styles.warn}>That date is in the future — pick the day your earliest photo was actually taken.</Text>
      ) : null}

      {/* Prompt until we have an honest number — no invented count. */}
      {!ready ? (
        <View style={styles.promptBox}>
          <Text style={styles.promptText}>Add the date above to reveal your Day 1 → Day N card.</Text>
        </View>
      ) : (
        <>
          <View style={styles.cardWrap}>
            <DiptychCard
              ref={cardRef}
              dogName={dogName}
              earliestUrl={earliestUrl}
              latestUrl={latestUrl}
              days={days!}
              earliestLabel={earliestLabel}
            />
          </View>
          <Pressable
            style={[styles.shareButton, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
            accessibilityRole="button"
            accessibilityLabel={`Share ${dogName}'s Day 1 vs Day ${days}`}
          >
            <Text style={styles.shareText}>{sharing ? 'Rendering…' : `📤 Share ${dogName}'s Day 1 vs Day ${days}`}</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.disclaimer}>
        The count is days since the earliest photo you picked — not a birthday or an age.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginTop: 1 },
  intro: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20, marginTop: 4 },
  pickerLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown, marginTop: 14, marginBottom: 8 },
  strip: { flexGrow: 0 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    marginRight: 8,
    backgroundColor: colors.creamDark,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: { borderColor: colors.primary },
  thumbImage: { width: '100%', height: '100%' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brown,
  },
  warn: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primary, marginTop: 8 },
  promptBox: {
    marginTop: 16,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  promptText: { fontFamily: fonts.body, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
  cardWrap: { alignItems: 'center', marginTop: 16 },
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  disclaimer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.brownLight,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
  },
});
