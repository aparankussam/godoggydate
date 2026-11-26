// mobile/components/discover/DiscoverBits.tsx
// "Sticker Book" pieces shared by the Discover card, its Details sheet, the
// match pop-up and the empty state. Mirrors web/components/DiscoverBits.tsx and
// the LimitsBlock in web/components/OwnerLimits.tsx. Presentational only: every
// word comes from the data the caller passes in (compat.*, the owner's fields).

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import { getVaccinationStatus } from '../../../shared/profile';
import { formatDistanceMiles } from '../../../shared/utils/matchingEngine';
import type { CompatibilityResult } from '../../../shared/types';
import type { DiscoverDog } from '../../lib/discover';
import { temperamentLabel } from '../../../shared/temperament';

const INK = colors.ink;

/** Owner-typed chips carry trailing emoji; the calm design shows words only. */
export function plain(t: string): string {
  return t
    .replace(/(?:[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}|\u{200D})/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Labels ──────────────────────────────────────────────────────────────────
const SIZE_LABELS: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', XL: 'XL' };
const SEX_LABELS: Record<string, string> = { M: 'Male', F: 'Female' };
const AGE_LABELS: Record<string, string> = { puppy: 'Puppy', adult: 'Adult', senior: 'Senior' };

/** "M" is Medium, never Male: size and sex are separate words on every surface. */
export function sizeLabel(size?: string | null): string {
  return (size && SIZE_LABELS[size]) || size || '';
}
export function sexLabel(sex?: string | null): string {
  return (sex && SEX_LABELS[sex]) || '';
}
export function ageLabel(age?: string | null): string {
  return (age && AGE_LABELS[age]) || age || '';
}

/** "Adult · Small · Male" */
export function factsWords(dog: Pick<DiscoverDog, 'age' | 'size' | 'sex'>): string {
  return [ageLabel(dog.age), sizeLabel(dog.size), sexLabel(dog.sex)].filter(Boolean).join(' · ');
}

/** "Mini Dachshund  ·  Adult · Small · Male" */
export function factsLine(dog: Pick<DiscoverDog, 'breed' | 'age' | 'size' | 'sex'>): string {
  return [dog.breed, factsWords(dog)].filter(Boolean).join('  ·  ');
}

/** One quiet line of what the owner listed: play styles first, then a temperament word. */
export function playsLine(dog: Pick<DiscoverDog, 'playStyles' | 'temperament'>): string {
  return [...(dog.playStyles ?? []).slice(0, 2), ...(dog.temperament ?? []).slice(0, 1).map(temperamentLabel)]
    .map(plain)
    .filter(Boolean)
    .join(' · ');
}

export function energyWord(n: number): string {
  return n >= 75 ? 'High' : n <= 35 ? 'Mellow' : 'Balanced';
}

/**
 * Say only what is known: a measured distance, or the place and that the
 * distance isn't. 0 is a real distance (same ~1 km cell): "Under 1 mi".
 */
export function placeLabel(dog: Pick<DiscoverDog, 'distanceMiles' | 'neighbourhood' | 'location'>): string {
  const distance = formatDistanceMiles(dog.distanceMiles);
  const city = dog.neighbourhood?.split(',')[0]?.trim();
  if (distance) return city ? `${city} · ${distance}` : `${distance} away`;
  return dog.neighbourhood || dog.location || 'Location not shared';
}

// ── Fit tiers ───────────────────────────────────────────────────────────────
export type FitTone = 'green' | 'amber' | 'red';

/** Sticker colour from the engine's own tier: blocked = red, "Some overlap" =
 *  amber, everything else (Strong fit, Good fit) = green. */
export function fitTone(compat: CompatibilityResult): FitTone {
  if (compat.quality === 'blocked') return 'red';
  if (/^some overlap/i.test(compat.label)) return 'amber';
  return 'green';
}

export const FIT_TONE_BG: Record<FitTone, string> = {
  green: colors.fit,
  amber: colors.amber,
  red: '#F26D6D',
};

/** "Good fit, with care" -> "Good fit": the care is said by the amber slip. */
export function fitShortLabel(compat: CompatibilityResult): string {
  return compat.label.replace(/,\s*with care$/i, '');
}

export function FitSticker({
  compat,
  size = 84,
  tilt = 0,
  style,
}: {
  compat: CompatibilityResult;
  size?: number;
  tilt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = fitTone(compat);
  const label = fitShortLabel(compat);
  const big = size >= 80;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Fit ${compat.score} out of 100, ${compat.label}`}
      style={[
        bits.fit,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: FIT_TONE_BG[tone],
          transform: tilt ? [{ rotate: `${tilt}deg` }] : undefined,
        },
        style,
      ]}
    >
      <Text style={[bits.fitNum, { fontSize: big ? 32 : 27, lineHeight: big ? 32 : 27 }]}>
        {compat.score}
      </Text>
      <Text style={bits.fitLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Paper pill "[paw] Fit with your dog", the fit sticker's partner tag. */
export function FitTag({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[bits.fitTag, style]}>
      <MaterialCommunityIcons name="paw" size={13} color={INK} />
      <Text style={bits.fitTagText}>Fit with your dog</Text>
    </View>
  );
}

/** Kraft ticket: "Neighborhood · distance". */
export function PlaceTicket({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[bits.ticket, style]}>
      <MaterialCommunityIcons name="map-marker" size={15} color={INK} />
      <Text style={bits.ticketText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

// ── Owner's word: vaccination + limits ─────────────────────────────────────
interface VaccFields {
  rabiesExpiry?: string | null;
  vaccinated?: boolean | null;
}

/** The vaccination line, always the owner's claim, never a tick. */
export function vaccinationLine(dog: VaccFields): string {
  const v = getVaccinationStatus(dog);
  switch (v.tone) {
    case 'dated':
      return v.label.replace(/^Rabies: valid through/, 'Owner listed rabies valid through');
    case 'expired':
      return v.label.replace(/^Rabies: expired/, 'Owner listed rabies expired');
    case 'self-reported':
      return 'Owner marked vaccinated';
    case 'unvaccinated':
      return 'Owner marked not vaccinated';
    default:
      return 'Vaccination not stated';
  }
}

export interface LimitsSummary {
  /** True only when a limit actually applies to the viewer's dog. */
  applies: boolean;
  headline: string;
  reason?: string;
  more?: string;
}

/** Collapse compat.limits into the one slip the card has room for. */
export function summarizeLimits(compat: CompatibilityResult): LimitsSummary {
  const items = compat.limits?.items ?? [];
  const cautions = items.filter((i) => i.severity === 'caution');
  if (cautions.length > 0) {
    const first = cautions[0];
    return {
      applies: true,
      headline: first.text,
      reason: first.detail,
      more: items.length > 1 ? `+${items.length - 1} more in Details` : undefined,
    };
  }
  if (!compat.limits && compat.warnings.length > 0) {
    return {
      applies: true,
      headline: compat.warnings[0],
      more: compat.warnings.length > 1 ? `+${compat.warnings.length - 1} more in Details` : undefined,
    };
  }
  if (items.length === 0) return { applies: false, headline: 'No limits listed' };
  return {
    applies: false,
    headline: items[0].text,
    more: items.length > 1 ? `+${items.length - 1} more in Details` : undefined,
  };
}

/** "From Kaju's owner. GoDoggyDate doesn't verify it." */
export function attribution(name: string): string {
  return `From ${name || 'the'}${name ? '’s' : ''} owner. GoDoggyDate doesn’t verify it.`;
}

/**
 * The calm trust slip. Neutral paper with an ink spine; AMBER only when a limit
 * applies to the viewer's dog, with the reason in plain words.
 */
export function TrustSlip({
  dog,
  compat,
  style,
}: {
  dog: VaccFields & { name: string };
  compat: CompatibilityResult;
  style?: StyleProp<ViewStyle>;
}) {
  const vacc = vaccinationLine(dog);
  const limits = summarizeLimits(compat);
  const amber = limits.applies;
  return (
    <View
      accessible
      accessibilityLabel={`${dog.name}’s owner: ${vacc}. ${limits.headline}${limits.reason ? `. ${limits.reason}` : ''}. ${attribution(dog.name)}`}
      style={[bits.slip, amber ? bits.slipAmber : null, style]}
    >
      {amber ? (
        <>
          <Text style={bits.slipStrong}>{limits.headline}</Text>
          {limits.reason ? <Text style={bits.slipReason}>{limits.reason}</Text> : null}
          <Text style={bits.slipSmall}>
            {vacc}
            {limits.more ? ` · ${limits.more}` : ''}. {attribution(dog.name)}
          </Text>
        </>
      ) : (
        <>
          <Text style={bits.slipStrong}>
            {vacc}
            {'  ·  '}
            <Text style={bits.slipRegular}>{limits.headline}</Text>
            {limits.more ? <Text style={bits.slipMuted}>{` · ${limits.more}`}</Text> : null}
          </Text>
          <Text style={bits.slipSmall}>{attribution(dog.name)}</Text>
        </>
      )}
    </View>
  );
}

/**
 * Details view: every limit the owner listed, nothing hidden. A limit that
 * applies to the viewer's dog is an AMBER slip with the reason; the rest are
 * neutral paper slips. Always owner-named.
 */
export function LimitsBlock({ compat, ownerName }: { compat: CompatibilityResult; ownerName: string }) {
  const items = compat.limits ? compat.limits.items : null;
  const lines = items
    ? items.map((i) => ({ key: i.id, text: i.text, detail: i.detail, caution: i.severity === 'caution' }))
    : compat.warnings.map((w) => ({ key: w, text: w, detail: undefined as string | undefined, caution: true }));
  if (lines.length === 0) {
    return <Text style={bits.slipStrong}>{ownerName}’s owner listed no limits</Text>;
  }
  const ordered = [...lines.filter((l) => l.caution), ...lines.filter((l) => !l.caution)];
  return (
    <View style={{ gap: 6 }} accessibilityLabel={`Limits ${ownerName}’s owner listed`}>
      {ordered.map((line) => (
        <View key={line.key} style={[bits.limit, line.caution ? bits.limitAmber : null]}>
          <Text style={bits.limitText}>{line.text}</Text>
          {line.caution && line.detail ? <Text style={bits.limitText}>{line.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** A small ink dot used as a list bullet. */
export function Dot({ color = INK }: { color?: string }) {
  return <View style={[bits.dot, { backgroundColor: color }]} />;
}

export const bits = StyleSheet.create({
  fit: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: INK,
    paddingHorizontal: 4,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 4,
  },
  fitNum: { fontFamily: fonts.display, color: INK },
  fitLabel: {
    fontFamily: fonts.black,
    fontSize: 12,
    lineHeight: 13,
    color: INK,
    textAlign: 'center',
    marginTop: 1,
  },
  fitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 4,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  fitTagText: { fontFamily: fonts.black, fontSize: 12, lineHeight: 16, color: INK },
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: colors.kraft,
    borderWidth: 2,
    borderColor: INK,
    borderRadius: 6,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 5,
    shadowColor: INK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  ticketText: { flexShrink: 1, fontFamily: fonts.black, fontSize: 14, lineHeight: 17, color: INK },
  slip: {
    backgroundColor: colors.creamDark,
    borderLeftWidth: 4,
    borderLeftColor: INK,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  slipAmber: { backgroundColor: colors.amber, borderLeftColor: colors.amberSpine },
  slipStrong: { fontFamily: fonts.black, fontSize: 14, lineHeight: 19, color: INK },
  slipRegular: { fontFamily: fonts.bold, color: INK },
  slipMuted: { fontFamily: fonts.bold, color: colors.brownMid },
  slipReason: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: INK },
  slipSmall: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, color: colors.brownMid, marginTop: 2 },
  limit: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: INK,
    borderLeftWidth: 7,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  limitAmber: { backgroundColor: colors.amber, borderLeftColor: colors.amberSpine },
  limitText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: INK },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
});
