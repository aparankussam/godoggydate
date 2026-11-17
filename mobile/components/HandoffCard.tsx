// mobile/components/HandoffCard.tsx
// The Handoff Card — one image the owner hands to a sitter, walker, groomer,
// or the friend watching the dog this weekend. Mirrors
// web/components/HandoffCard.tsx.
//
// Every line is something the owner typed. Nothing on this card is verified,
// scored, or inferred — there is deliberately no badge, no percentage, and no
// green checkmark anywhere on it, because a stranger reading it has to be
// able to tell "the owner said so" from "GoDoggyDate checked". So it says
// which one it is, on the vaccination line and again at the bottom.
//
// Wrapped in forwardRef<View> so react-native-view-shot can capture it
// (lib/shareCard.ts captureAndShare), with the disclaimer inside the captured
// region so it keeps saying so after it's forwarded.

import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadow } from '../constants/theme';
import type { SavedDogProfile } from '../lib/profile';
import { getHeroPhoto } from '../lib/photos';
import { focusForPhoto, resolveHeroIndex } from '../lib/coverPhoto';
import { CoverImage } from './CoverPhotoEditor';
import type { Reminder } from '../../shared/types';
import { formatUsDate, reminderDueLabel } from '../../shared/dates';

interface Props {
  profile: SavedDogProfile;
  /** This dog's Cadence reminders. Only overdue and near-term ones are
   *  printed — a sheet for a weekend shouldn't list next year's rabies
   *  booster as if the sitter were supposed to act on it. */
  reminders?: Reminder[];
}

const SIZE_LABELS: Record<string, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'Extra large',
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Anything further out than this isn't a handoff concern. */
const UPCOMING_WINDOW_DAYS = 60;

// The same "<date> · <relative>" shape as web, with the relative half from
// shared/dates.ts so the wording matches the other reminder surfaces.
function dueText(dueDate: number): { text: string; urgent: boolean } {
  const { days, urgent } = reminderDueLabel(dueDate);
  const date = formatUsDate(new Date(dueDate));
  if (days < 0) {
    const n = Math.abs(days);
    return { text: `${date} · ${n} day${n === 1 ? '' : 's'} overdue`, urgent: true };
  }
  if (days === 0) return { text: `${date} · today`, urgent: true };
  if (days === 1) return { text: `${date} · tomorrow`, urgent: true };
  return { text: date, urgent };
}

function capitalize(value?: string): string | undefined {
  if (!value) return undefined;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** Owner-declared tags, rendered VERBATIM — never reworded, grouped, or
 *  softened. The owner picked these exact strings and someone's dog meets
 *  this one on the strength of them. */
function TagList({ tags }: { tags: string[] }) {
  return (
    <View style={styles.tagList}>
      {tags.map((tag) => (
        <View key={tag} style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ))}
    </View>
  );
}

const HandoffCard = forwardRef<View, Props>(function HandoffCard({ profile, reminders = [] }, ref) {
  const heroIndex = resolveHeroIndex(profile);
  const photo = getHeroPhoto(profile.photos, heroIndex);
  // getHeroPhoto falls back to the first photo when the hero index is stale,
  // and the focal point belongs to the hero only.
  const photoIndex = photo ? (profile.photos ?? []).indexOf(photo) : -1;
  const photoFocus = typeof heroIndex === 'number' ? focusForPhoto(profile, photoIndex, heroIndex) : undefined;
  const notGoodWith = profile.notGoodWith ?? [];
  const behaviorFlags = profile.behaviorFlags ?? [];
  const declaredNothing = notGoodWith.length === 0 && behaviorFlags.length === 0;

  // Read defensively so "not stated" stays a reachable outcome rather than a
  // missing value silently printing as "not vaccinated" on a sheet a stranger
  // will act on.
  const vaccinated = profile.vaccinated ?? null;

  const identity = [
    profile.breed,
    capitalize(profile.age),
    SIZE_LABELS[profile.size],
  ].filter(Boolean).join(' · ');

  const now = Date.now();
  const upcoming = [...reminders]
    .sort((a, b) => a.dueDate - b.dueDate)
    .filter((r) => r.dueDate - now <= UPCOMING_WINDOW_DAYS * DAY_MS)
    .slice(0, 4);

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      {/* Identity */}
      <View style={styles.identity}>
        <View style={styles.photoFrame}>
          {photo ? (
            <CoverImage uri={photo} focus={photoFocus} style={StyleSheet.absoluteFill} />
          ) : (
            <Text style={styles.photoEmoji}>🐕</Text>
          )}
        </View>
        <View style={styles.identityText}>
          <Text style={styles.eyebrow}>Care sheet</Text>
          <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>
          {identity ? <Text style={styles.identityLine} numberOfLines={1}>{identity}</Text> : null}
        </View>
      </View>

      {/* Owner-declared safety. Both lists print verbatim; when the owner
          declared nothing we say exactly that, rather than implying this dog
          is fine with everyone — an empty answer is not a clearance. */}
      <Section title="What the owner flagged">
        {declaredNothing ? (
          <Text style={styles.bodyText}>
            The owner didn&apos;t flag anything here. That means nothing was declared — not that
            nothing applies.
          </Text>
        ) : (
          <View style={styles.flagGroups}>
            {notGoodWith.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>Not a good match with</Text>
                <TagList tags={notGoodWith} />
              </View>
            )}
            {behaviorFlags.length > 0 && (
              <View>
                <Text style={styles.groupLabel}>Good to know before meeting</Text>
                <TagList tags={behaviorFlags} />
              </View>
            )}
          </View>
        )}
      </Section>

      {/* Vaccination. Three distinct states, and "true" is NOT a verified
          badge. The wording attributes it to the owner in every case. */}
      <Section title="Vaccination">
        {vaccinated === false ? (
          <View style={[styles.vaxBox, styles.vaxNo]}>
            <Text style={[styles.vaxTitle, styles.vaxNoText]}>Owner marked: NOT vaccinated</Text>
            <Text style={[styles.vaxSub, styles.vaxNoSub]}>Ask before any contact with other dogs.</Text>
          </View>
        ) : vaccinated === true ? (
          <View style={[styles.vaxBox, styles.vaxYes]}>
            <Text style={styles.vaxTitle}>Owner marked: vaccinated</Text>
            <Text style={styles.vaxSub}>
              Self-reported. No record was checked — ask for paperwork if you need it.
            </Text>
          </View>
        ) : (
          <View style={[styles.vaxBox, styles.vaxUnstated]}>
            <Text style={[styles.vaxTitle, styles.vaxUnstatedText]}>Vaccination status not stated</Text>
          </View>
        )}
      </Section>

      {/* Cadence — real reminder rows. Rendered only when something is
          actually due; never a "0 due" placeholder. */}
      {upcoming.length > 0 && (
        <Section title="Due next">
          <View style={styles.dueList}>
            {upcoming.map((r) => {
              const due = dueText(r.dueDate);
              return (
                <View key={r.id} style={styles.dueRow}>
                  <Text style={styles.dueLabel} numberOfLines={1}>{r.label}</Text>
                  <Text style={[styles.dueDate, due.urgent && styles.dueUrgent]}>{due.text}</Text>
                </View>
              );
            })}
          </View>
        </Section>
      )}

      {/* The disclaimer is part of the image on purpose — this card gets
          screenshotted and forwarded, and it has to keep saying this after it
          leaves the app. */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          GoDoggyDate does not verify any of this. Everything above is what {profile.name}&apos;s
          owner wrote about their own dog.
        </Text>
        <View style={styles.brandRow}>
          <Text style={styles.brandName}>GoDoggyDate</Text>
          <Text style={styles.brandUrl}>godoggydate.com</Text>
        </View>
      </View>
    </View>
  );
});

HandoffCard.displayName = 'HandoffCard';
export default HandoffCard;

const styles = StyleSheet.create({
  // Fluid up to 360, like web: no fixed aspect, so it can shrink on a narrow
  // phone and still capture cleanly at whatever width it rendered at.
  card: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    ...shadow.card,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  photoFrame: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: { fontSize: 30 },
  identityText: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  name: { fontFamily: fonts.display, fontSize: 24, color: colors.brown },
  identityLine: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  section: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.brownLight,
  },
  sectionBody: { marginTop: 8 },
  bodyText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.brownMid },
  flagGroups: { gap: 12 },
  groupLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brownMid, marginBottom: 6 },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brown },
  vaxBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  vaxYes: { borderColor: colors.border, backgroundColor: colors.white },
  vaxNo: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  vaxUnstated: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  vaxTitle: { fontFamily: fonts.bold, fontSize: 12, color: colors.brown },
  vaxSub: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.brownLight, marginTop: 2 },
  vaxNoText: { color: '#B91C1C' },
  vaxNoSub: { color: 'rgba(185,28,28,0.8)' },
  vaxUnstatedText: { color: '#92400E' },
  dueList: { gap: 6 },
  dueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  dueLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 12, color: colors.brown },
  dueDate: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight },
  dueUrgent: { fontFamily: fonts.bold, color: '#DC2626' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  footerText: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.brownLight },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  brandName: { fontFamily: fonts.display, fontSize: 14, color: colors.brown },
  brandUrl: { fontFamily: fonts.body, fontSize: 10, color: colors.brownLight },
});
