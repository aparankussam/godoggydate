// mobile/components/discover/DiscoverEmpty.tsx
// The cold-start / everyone-seen state of Discover, "Sticker Book" look.
// Mirrors the empty state in web/app/app/page.tsx: a plain headline that says
// which kind of empty this is (with the REAL radius), the one pink action
// ("Tell me when neighbors join", the server waitlist), a "While you wait" list
// that links only to screens that exist in this app, and the Recruit Card.

import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import type { SavedDogProfile } from '../../../shared/profile';
import { getHeroPhoto } from '../../lib/photos';
import { resolveHeroIndex } from '../../lib/coverPhoto';
import { trackEvent } from '../../lib/analytics';
import { getPushPermissionState, maybeAskForPushPermission } from '../../lib/push';
import DogTradingCard from '../DogTradingCard';
import BrandLogo from '../BrandLogo';
import { PawCoin, PawIcon, PrimaryButton, StickerDog, Tape } from '../sticker';
import { joinLocalWaitlist, leaveLocalWaitlist, readWaitlistMemo } from './waitlist';

interface Props {
  uid: string;
  profile: SavedDogProfile | null;
  /** How many dogs the last load returned (0 = nobody here yet). */
  deckTotal: number;
  radiusApplied: boolean;
  radiusMiles: number;
  /** The 10/25/50/100 mi chips; null when distances can't be measured. */
  radiusControl?: ReactNode;
  /** Dogs just past the radius, for the "try a wider radius" line. */
  beyondRadiusCount?: number;
  checking: boolean;
  lastCheckedLabel: string | null;
  onCheckAgain: () => void;
  onInvite: () => void;
  onShareCard: () => void;
  sharingCard: boolean;
  recruitCardRef: RefObject<View | null>;
  /** The Today panel (reminders, profile gaps); renders nothing when there's nothing to say. */
  today?: ReactNode;
}

interface WaitItem {
  key: string;
  text: string;
  icon: ReactNode;
  href: string;
}

const ICON = 24;

export default function DiscoverEmpty({
  uid,
  profile,
  deckTotal,
  radiusApplied,
  radiusMiles,
  radiusControl,
  beyondRadiusCount = 0,
  checking,
  lastCheckedLabel,
  onCheckAgain,
  onInvite,
  onShareCard,
  sharingCard,
  recruitCardRef,
  today,
}: Props) {
  const dogName = profile?.name?.trim() || 'Your dog';
  const city = profile?.city?.trim() || '';
  const rangeText = radiusApplied ? `within ${radiusMiles} mi` : 'near you';

  const [waitlist, setWaitlist] = useState<{ city: string; position: number } | null>(null);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const [waitlistNote, setWaitlistNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readWaitlistMemo(uid).then((memo) => {
      if (!cancelled) setWaitlist(memo ? { city: memo.city, position: memo.position } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function handleJoinWaitlist() {
    if (waitlistBusy) return;
    setWaitlistBusy(true);
    setWaitlistNote(null);
    try {
      const result = await joinLocalWaitlist(uid);
      setWaitlist({ city: result.city, position: result.position });
      trackEvent('waitlist_joined', { position: result.position, already: result.alreadyJoined });
      // The one push is useless without notifications, so offer them now.
      let state = await getPushPermissionState();
      if (state === 'undetermined') {
        state = await maybeAskForPushPermission(uid, { title: 'Want to know when a neighbor joins?' });
      } else if (state === 'granted') {
        await maybeAskForPushPermission(uid); // registers this device's token
      }
      setWaitlistNote(
        state === 'granted'
          ? 'We’ll send one notification when a neighbor joins.'
          : state === 'unavailable'
            ? 'Notifications aren’t available on this device, so check back here.'
            : 'Notifications are off, so check back here. You can allow them in Settings.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setWaitlistNote(
        /city and state/i.test(message)
          ? 'Add a city and state to your dog’s profile first, so we know where to look.'
          : 'We couldn’t add you just now. Check your connection and try again.',
      );
    } finally {
      setWaitlistBusy(false);
    }
  }

  async function handleLeaveWaitlist() {
    if (waitlistBusy) return;
    setWaitlistBusy(true);
    try {
      await leaveLocalWaitlist();
      setWaitlist(null);
      setWaitlistNote(null);
    } catch {
      setWaitlistNote('We couldn’t take you off the list just now. Try again.');
    } finally {
      setWaitlistBusy(false);
    }
  }

  const headline =
    deckTotal > 0
      ? `You’ve seen all ${deckTotal} ${deckTotal === 1 ? 'dog' : 'dogs'} ${rangeText}`
      : `No dogs ${rangeText} yet`;
  const leadWords = deckTotal > 0 ? 'That’s everyone here so far.' : `${dogName} might be the first${city ? ` in ${city}` : ''}.`;
  const restWords =
    deckTotal > 0
      ? ' New dogs show up as they join.'
      : ' Here’s what you can do while the neighborhood fills up.';

  const items: WaitItem[] = [
    {
      key: 'dogtype',
      text: `See ${dogName}’s Dogtype`,
      icon: <MaterialCommunityIcons name="tag" size={ICON} color={colors.ink} />,
      href: '/dogtype-reveal',
    },
    {
      key: 'roast',
      text: `Get ${dogName} roasted (affectionately)`,
      icon: <MaterialCommunityIcons name="fire" size={ICON} color={colors.ink} />,
      href: '/fun/playroom',
    },
    {
      key: 'barkle',
      text: 'Play today’s Barkle breed puzzle',
      icon: <MaterialCommunityIcons name="view-grid" size={ICON - 2} color={colors.ink} />,
      href: '/fun/barkle',
    },
    // Only a nudge while neither date is on file.
    ...(profile?.birthMonth || profile?.adoptionDate
      ? []
      : [
          {
            key: 'birthday',
            text: `Add ${dogName}’s birthday or Gotcha Day`,
            icon: <MaterialCommunityIcons name="cake-variant" size={ICON} color={colors.ink} />,
            href: '/(tabs)/profile?edit=1&section=birthday',
          },
        ]),
    {
      key: 'packday',
      text: city ? `Host ${city}’s first Pack Day` : 'Host the first Pack Day',
      icon: <MaterialCommunityIcons name="tree" size={ICON} color={colors.ink} />,
      href: '/pack/new',
    },
  ];

  const heroPhoto = profile ? getHeroPhoto(profile.photos, resolveHeroIndex(profile) ?? undefined) : null;

  return (
    <View style={styles.wrap}>
      {/* The logo heads the empty Discover screen, as it does on the website. */}
      <BrandLogo height={36} style={styles.logo} />
      {/* Headline on the sky, with an empty "who's next?" polaroid */}
      <View style={styles.top}>
        <View style={styles.topText}>
          <View style={styles.headRow}>
            <PawCoin size={30} style={styles.coin} />
            <Text style={styles.headline} accessibilityRole="header">
              {headline}
            </Text>
          </View>
          <Text style={styles.body}>
            <Text style={styles.bodyLead}>{leadWords}</Text>
            {restWords}
          </Text>
        </View>
        <View style={styles.qPolaroid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Tape width={46} height={15} angle={4} style={{ top: -8, left: 34 }} />
          <View style={styles.qSlot}>
            <Text style={styles.qMark}>?</Text>
          </View>
        </View>
      </View>

      {today}

      {/* The one pink action: be told when a neighbor joins. */}
      <View style={styles.block}>
        {waitlist ? (
          <View style={styles.joined}>
            <Text style={styles.joinedStrong}>
              You’re #{waitlist.position} on the list for {waitlist.city}.
            </Text>
            {waitlistNote ? <Text style={styles.joinedNote}>{waitlistNote}</Text> : null}
            <Pressable
              onPress={handleLeaveWaitlist}
              disabled={waitlistBusy}
              accessibilityRole="button"
              style={styles.textBtn}
            >
              <Text style={styles.textBtnText}>Leave the list</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <PrimaryButton
              label={waitlistBusy ? 'Adding you…' : 'Tell me when neighbors join'}
              onPress={handleJoinWaitlist}
              disabled={waitlistBusy}
              icon={<MaterialCommunityIcons name="bell" size={22} color={colors.ink} />}
            />
            <Text style={styles.helper} accessibilityLiveRegion="polite">
              {waitlistNote ?? 'We’ll send one notification when a neighbor joins.'}
            </Text>
          </>
        )}
      </View>

      {radiusControl ? (
        <View style={styles.radiusBlock}>
          {radiusControl}
          {beyondRadiusCount > 0 && radiusMiles < 100 ? (
            <Text style={styles.widen}>
              {beyondRadiusCount} more {beyondRadiusCount === 1 ? 'dog is' : 'dogs are'} farther than {radiusMiles} mi. Try a wider radius.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* While you wait: real screens only */}
      <View style={styles.waitCard}>
        <Tape width={46} height={15} angle={4} style={{ top: -8, right: 44 }} />
        <Text style={styles.waitTitle} accessibilityRole="header">
          While you wait
        </Text>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => {
              trackEvent('while_you_wait_click', { target: item.href });
              router.push(item.href as never);
            }}
            accessibilityRole="link"
            style={({ pressed }) => [styles.waitRow, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.waitIcon}>{item.icon}</View>
            <Text style={styles.waitText}>{item.text}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.ink} />
          </Pressable>
        ))}
      </View>

      {/* Recruit Card: the polaroid on screen, the real Trading Card off-screen for the export. */}
      {profile && (
        <View style={styles.recruit}>
          <View style={styles.recruitPolaroid}>
            <Tape width={46} height={15} angle={4} style={{ top: -8, left: 44 }} />
            <View style={styles.recruitPhoto}>
              {heroPhoto ? (
                <Image source={{ uri: heroPhoto }} style={StyleSheet.absoluteFill} accessibilityLabel={dogName} />
              ) : (
                <View style={styles.recruitNoPhoto}>
                  <StickerDog size={70} label={`${dogName}, drawn`} />
                </View>
              )}
            </View>
            <Text style={styles.recruitName} numberOfLines={1}>
              {dogName}
            </Text>
          </View>
          <View style={styles.recruitSide}>
            <Text style={styles.recruitText}>The more locals join, the sooner {dogName} finds a playdate.</Text>
            {/* Hand-built paper button so a long name wraps instead of clipping. */}
            <Pressable
              onPress={onShareCard}
              disabled={sharingCard}
              accessibilityRole="button"
              accessibilityState={{ disabled: sharingCard, busy: sharingCard }}
              style={({ pressed }) => [styles.shareBtn, pressed && { transform: [{ translateY: 1 }] }, sharingCard && { opacity: 0.6 }]}
            >
              <View pointerEvents="none" style={styles.shareEdge} />
              <MaterialCommunityIcons name="export-variant" size={19} color={colors.ink} />
              <Text style={styles.shareBtnText} numberOfLines={2}>
                {sharingCard ? 'Preparing…' : `Share ${dogName}’s Card`}
              </Text>
            </Pressable>
            <Pressable onPress={onInvite} accessibilityRole="button" style={styles.textBtn}>
              <Text style={styles.textBtnText}>Or send a link instead</Text>
            </Pressable>
          </View>
          <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <DogTradingCard ref={recruitCardRef} profile={profile} />
          </View>
        </View>
      )}

      {/* A genuine re-query; the time says when the last one finished. */}
      <View style={styles.checkRow}>
        <Pressable
          onPress={onCheckAgain}
          disabled={checking}
          accessibilityRole="button"
          style={[styles.checkBtn, checking && { opacity: 0.6 }]}
        >
          <PawIcon size={16} />
          <Text style={styles.checkText}>{checking ? 'Checking…' : 'Check again'}</Text>
        </Pressable>
        {lastCheckedLabel ? <Text style={styles.lastChecked}>Last checked {lastCheckedLabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  logo: { marginBottom: 12 },
  radiusBlock: { marginBottom: 18, gap: 8 },
  widen: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, textAlign: 'center' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  topText: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  coin: { marginTop: 4 },
  headline: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 34,
    color: colors.ink,
  },
  body: {
    marginTop: 8,
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.brownMid,
  },
  bodyLead: { fontFamily: fonts.black, color: colors.ink },
  qPolaroid: {
    width: 96,
    marginTop: 4,
    padding: 7,
    paddingBottom: 16,
    backgroundColor: colors.paper,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.ink,
    transform: [{ rotate: '5deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  qSlot: {
    height: 70,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.ink,
    borderRadius: 3,
    backgroundColor: colors.note,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qMark: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.brownMid },

  block: { marginTop: 18 },
  helper: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  joined: {
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.ink,
    borderLeftWidth: 7,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  joinedStrong: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20, color: colors.ink },
  joinedNote: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.ink, marginTop: 2 },
  textBtn: { minHeight: 44, justifyContent: 'center' },
  textBtnText: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.ink,
    textDecorationLine: 'underline',
  },

  waitCard: {
    marginTop: 22,
    backgroundColor: colors.paper,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    transform: [{ rotate: '0.6deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  waitTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 26,
    color: colors.ink,
    marginLeft: 2,
    marginBottom: 6,
  },
  waitRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderTopColor: 'rgba(42,31,74,0.4)',
    paddingVertical: 4,
    paddingRight: 2,
  },
  waitIcon: { width: 28, alignItems: 'center' },
  waitText: { flex: 1, fontFamily: fonts.black, fontSize: 15, lineHeight: 20, color: colors.ink },

  recruit: { marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 4 },
  recruitPolaroid: {
    width: 136,
    padding: 6,
    paddingBottom: 2,
    backgroundColor: colors.paper,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.ink,
    transform: [{ rotate: '-5deg' }],
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  recruitPhoto: {
    height: 120,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: '#5B4A3A',
    overflow: 'hidden',
  },
  recruitNoPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.note },
  recruitName: {
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
  },
  recruitSide: { flex: 1, minWidth: 0 },
  recruitText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.ink },
  shareBtn: {
    marginTop: 10,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 11,
    borderRadius: 26,
    borderWidth: 2.5,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  shareEdge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: colors.border },
  shareBtnText: { flexShrink: 1, fontFamily: fonts.black, fontSize: 15, lineHeight: 19, color: colors.ink, textAlign: 'center' },
  offscreen: { position: 'absolute', left: -9999, top: 0 },

  checkRow: { marginTop: 22, alignItems: 'center', gap: 4 },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.ink,
    borderBottomWidth: 4,
    backgroundColor: colors.paper,
  },
  checkText: { fontFamily: fonts.black, fontSize: 14, color: colors.ink },
  lastChecked: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
});
