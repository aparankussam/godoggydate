import { ActivityIndicator, Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import ProfileEditor from '../../components/ProfileEditor';
import { resolveHeroIndex, setCoverPhoto } from '../../lib/coverPhoto';
import DogTradingCard from '../../components/DogTradingCard';
import VibeTypeCard from '../../components/VibeTypeCard';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { deleteAccount } from '../../lib/account';
import { trackEvent } from '../../lib/analytics';
import { useProEntitlement } from '../../lib/useProEntitlement';
import { onReminders } from '../../lib/reminders';
import { getFirebase } from '../../lib/firebase';
import RemindersSection from '../../components/RemindersSection';
import HouseholdSection from '../../components/HouseholdSection';
import DogtypeSection from '../../components/DogtypeSection';
import DogtypeCompatSection from '../../components/DogtypeCompatSection';
import PetTwinCard from '../../components/PetTwinCard';
import LifeStageCard from '../../components/LifeStageCard';
import MilestonesCard from '../../components/MilestonesCard';
import ProUpsellCard from '../../components/ProUpsellCard';
import type { Reminder } from '../../../shared/types';

function openLegalLink(path: string) {
  const base = (process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '')) || 'https://godoggydate.com';
  Linking.openURL(`${base}${path}`).catch(() => {
    Alert.alert('Could not open link', 'Please try again in a moment.');
  });
}

export default function ProfileTab() {
  const { user, profile, profileComplete, saveProfile, signOutUser, loading: sessionLoading } = useSession();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const pro = useProEntitlement(user?.uid);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [householdMemberIds, setHouseholdMemberIds] = useState<string[]>([]);
  const [householdMemberNames, setHouseholdMemberNames] = useState<Record<string, string> | undefined>(undefined);
  const [bestFriendMatchId, setBestFriendMatchId] = useState<string | null>(null);
  const [bestFriendName, setBestFriendName] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  // Optimistic cover index so the "★ Cover" indicator moves the instant it's set,
  // without waiting on the Firestore round-trip / session refresh.
  const [optimisticCover, setOptimisticCover] = useState<number | null>(null);
  const [savingCover, setSavingCover] = useState(false);
  const photoInit = useRef(false);
  const cardRef = useRef<View>(null);
  // For the Pet Twin "get a card every day" nudge: scroll to the Pro card.
  const scrollRef = useRef<ScrollView>(null);
  const proYRef = useRef(0);
  const scrollToPro = () => scrollRef.current?.scrollTo({ y: Math.max(0, proYRef.current - 20), animated: true });

  // Open the profile on the owner's cover pick (or AI hero), once, when it loads.
  useEffect(() => {
    if (photoInit.current || !profile) return;
    const real = (profile.photos ?? []).filter((p) => p && !p.startsWith('_'));
    if (real.length === 0) return;
    photoInit.current = true;
    const h = resolveHeroIndex(profile);
    setActivePhoto(typeof h === 'number' && h < real.length ? h : 0);
  }, [profile]);

  // Cadence — the reminder calendar.
  useEffect(() => {
    if (!user) return;
    return onReminders(user.uid, setReminders);
  }, [user]);

  // Household + Best Friend — the public dog doc is otherwise only fetched
  // once, on sign-in (getUserDogProfile in lib/profile.ts), so accepting or
  // removing a household member (both round-trip through a Cloud Function,
  // not this screen's own state) would otherwise leave the list stale until
  // the app restarted. Scoped to just these fields, mirroring the web
  // profile page's listener.
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    return onSnapshot(doc(db, 'dogs', user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setHouseholdMemberIds((data.householdMemberIds as string[] | undefined) ?? []);
      setBestFriendMatchId((data.bestFriendMatchId as string | undefined) ?? null);
    });
  }, [user]);

  // Household member NAMES now live in a private subcollection (moved off the
  // world-readable dog doc), so read them from there and build the id→name map.
  useEffect(() => {
    if (!user) return;
    const { db } = getFirebase();
    return onSnapshot(
      collection(db, 'dogs', user.uid, 'householdNames'),
      (snap) => {
        const map: Record<string, string> = {};
        snap.forEach((d) => {
          const name = d.data()?.name;
          if (typeof name === 'string') map[d.id] = name;
        });
        setHouseholdMemberNames(map);
      },
      () => setHouseholdMemberNames(undefined),
    );
  }, [user]);

  // Best Friend name lookup — the field only stores a matchId (set from the
  // chat screen), so resolving it to a display name means reading the match
  // doc for the other party's dogId, then that dog's own (public) doc.
  useEffect(() => {
    if (!user || !bestFriendMatchId) {
      setBestFriendName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { db } = getFirebase();
        const matchSnap = await getDoc(doc(db, 'matches', bestFriendMatchId));
        if (!matchSnap.exists()) return;
        const matchData = matchSnap.data() as { dog1UserId?: string; dog2UserId?: string };
        const otherUid = matchData.dog1UserId === user.uid ? matchData.dog2UserId : matchData.dog1UserId;
        if (!otherUid) return;
        const dogSnap = await getDoc(doc(db, 'dogs', otherUid));
        if (!cancelled && dogSnap.exists()) {
          setBestFriendName((dogSnap.data()?.name as string | undefined) ?? null);
        }
      } catch {
        // Non-critical — badge just doesn't render.
      }
    })();
    return () => { cancelled = true; };
  }, [user, bestFriendMatchId]);

  async function handleShareCard() {
    if (!cardRef.current || sharingCard) return;
    setSharingCard(true);
    trackEvent('trading_card_share_click');
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
        trackEvent('trading_card_shared', { method: 'native_share' });
      } else {
        Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
      }
    } catch (error) {
      console.warn('Failed to share trading card', error);
      Alert.alert('Could not share card', 'Please try again in a moment.');
    } finally {
      setSharingCard(false);
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete your account permanently?',
      'This removes your dog’s profile, all matches, messages, and swipe history. Chat unlock purchases are not refunded. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              router.replace('/welcome');
            } catch (error) {
              console.error('Account deletion failed:', error);
              Alert.alert(
                'Could not delete account',
                'Please try again or email support@godoggydate.com.',
              );
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  // Check session resolution BEFORE treating the user as signed out. Firebase
  // auth reports `user: null` until it finishes restoring a previous session
  // on launch, so this used to return null outright — a blank cream screen
  // with no indication anything was happening, on every cold launch, for
  // every returning user, however briefly.
  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <Text style={styles.gateTitle}>Sign in to view your profile</Text>
        <Text style={styles.gateBody}>
          Start a session from the welcome screen to see your dog's profile.
        </Text>
      </SafeAreaView>
    );
  }

  if (editing || !profile) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ProfileEditor
          userId={user.uid}
          initialProfile={profile}
          saving={saving}
          submitLabel={profile ? 'Save changes' : 'Create profile'}
          onSubmit={async (nextProfile) => {
            try {
              setSaving(true);
              await saveProfile(nextProfile);
              setEditing(false);
            } catch (error) {
              const message = error instanceof Error ? error.message : 'We could not save your dog profile. Please try again.';
              Alert.alert('Save failed', message);
            } finally {
              setSaving(false);
            }
          }}
        />
      </SafeAreaView>
    );
  }

  const photos = (profile.photos ?? []).filter((photo: string) => photo && !photo.startsWith('_'));
  // Clamp so a stale index (after a photo is removed) never reads undefined.
  const safeActive = photos.length > 0 ? Math.min(activePhoto, photos.length - 1) : 0;
  const currentCover = optimisticCover ?? (typeof profile.coverPhotoIndex === 'number' ? profile.coverPhotoIndex : (resolveHeroIndex(profile) ?? 0));
  const activeIsCover = safeActive === currentCover;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {profileComplete ? 'Your profile is ready — start discovering nearby pups.' : "Complete your dog's profile to start discovering nearby pups."}
        </Text>

        <View style={styles.card}>
          {photos[safeActive] ? <Image source={{ uri: photos[safeActive] }} style={styles.hero} accessible accessibilityLabel={`Photo of ${profile.name}`} /> : null}
          <View style={styles.cardBody}>
            {/* Tap a thumbnail to make it the main photo. Shows ALL photos so
                photo 0 stays re-selectable; the active one is highlighted. */}
            {photos.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                {photos.map((url: string, i: number) => (
                  <Pressable
                    key={i}
                    onPress={() => setActivePhoto(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Show photo ${i + 1} of ${profile.name}`}
                    accessibilityState={{ selected: i === safeActive }}
                    style={[styles.photoStripItem, i === safeActive && styles.photoStripItemActive]}
                  >
                    <Image source={{ uri: url }} style={styles.photoStripImage} />
                    {i === currentCover && (
                      <View style={styles.coverBadge}><Text style={styles.coverBadgeText}>★</Text></View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {/* Cover-photo pick: make the selected photo the one that leads on
                the profile + swipe deck (instead of always the first upload). */}
            {photos.length > 1 && (
              activeIsCover ? (
                <Text style={styles.coverHint}>★ This is {profile.name}&apos;s cover photo</Text>
              ) : (
                <Pressable
                  disabled={savingCover}
                  onPress={async () => {
                    if (!user || savingCover) return;
                    setSavingCover(true);
                    try {
                      await setCoverPhoto(user.uid, safeActive);
                      setOptimisticCover(safeActive);
                    } catch {
                      Alert.alert('Could not save', 'Please try again.');
                    } finally {
                      setSavingCover(false);
                    }
                  }}
                  style={[styles.coverButton, savingCover && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Make photo ${safeActive + 1} the cover photo`}
                >
                  <Text style={styles.coverButtonText}>{savingCover ? 'Saving…' : '⭐ Make this the cover photo'}</Text>
                </Pressable>
              )
            )}
            {/* Vibe Check generates a named archetype and a bio in the dog's
                own voice — already loaded into memory here (profile.ai)
                since the onboarding flow shipped, and rendered nowhere on
                the one screen an owner actually looks at their own dog's
                profile. */}
            {profile.ai?.vibeCheck?.archetype.name && (
              <Text style={styles.archetype}>✨ {profile.ai.vibeCheck.archetype.name}</Text>
            )}
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.meta}>
              {[profile.breed, profile.age, profile.sex, profile.location].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.badge}>
              {profileComplete ? 'Ready for mobile discover' : 'Profile still needs a few details'}
            </Text>
            {profile.ai?.vibeCheck?.bio && (
              <Text style={styles.vibeBio}>“{profile.ai.vibeCheck.bio}”</Text>
            )}

            {/* Full type card: decodes the archetype code and surfaces the
                per-dog description the model writes — previously only the
                name rendered anywhere, in the compact eyebrow above. */}
            {profile.ai?.vibeCheck?.archetype && (
              <View style={styles.vibeTypeCardWrap}>
                <VibeTypeCard archetype={profile.ai.vibeCheck.archetype} />
              </View>
            )}

            {/* Founding Pack + trust badges — computed server-side, never
                shown before now. No raw trust score (0-1 reads as a public
                rating); a positive "would meet again" rate instead. */}
            {(typeof profile.foundingPackNumber === 'number' || (profile.ratingCount ?? 0) > 0 || pro.isFounding || bestFriendName) && (
              <View style={styles.statusBadgeRow}>
                {typeof profile.foundingPackNumber === 'number' && (
                  <View style={styles.foundingBadge}>
                    <Text style={styles.foundingBadgeText}>🏅 Founding Pack #{profile.foundingPackNumber}</Text>
                  </View>
                )}
                {pro.isFounding && (
                  <View style={styles.memberBadge}>
                    <Text style={styles.memberBadgeText}>⭐ Founding Member</Text>
                  </View>
                )}
                {(profile.ratingCount ?? 0) > 0 && (
                  <View style={styles.trustBadge}>
                    <Text style={styles.trustBadgeText}>
                      🐾 {Math.round((profile.meetAgainRate ?? 0) * 100)}% would meet again
                      <Text style={styles.trustBadgeSubtext}>
                        {' '}({profile.ratingCount} playdate{profile.ratingCount === 1 ? '' : 's'})
                      </Text>
                    </Text>
                  </View>
                )}
                {bestFriendName && (
                  <View style={styles.bestFriendBadge}>
                    <Text style={styles.bestFriendBadgeText}>⭐ Best Friends with {bestFriendName}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── The Gen-Z viral layer: identity → invite → daily → life ──────── */}
        {user && profile && (
          <>
            <Text style={styles.sectionLabel}>✨ {profile.name}&apos;s world</Text>
            <Pressable
              style={styles.revealCta}
              accessibilityRole="button"
              accessibilityLabel={`Reveal ${profile.name}'s Dogtype`}
              accessibilityHint="Opens a shareable identity card"
              onPress={() => {
                trackEvent('dogtype_reveal_cta');
                router.push('/dogtype-reveal');
              }}
            >
              <Text style={styles.revealCtaText}>✨ Reveal {profile.name}&apos;s Dogtype</Text>
              <Text style={styles.revealCtaSub}>A shareable card, read from their real profile</Text>
            </Pressable>
            <DogtypeSection savedProfile={profile} />
            <DogtypeCompatSection savedProfile={profile} />
            <PetTwinCard dogId={user.uid} dogName={profile.name} isPro={pro.isPro} onUpgrade={scrollToPro} />
            <LifeStageCard savedProfile={profile} onEditProfile={() => setEditing(true)} />
            <MilestonesCard savedProfile={profile} />

            {/* Just for fun — three delight-first mini-features */}
            <View style={styles.funZone}>
              <Text style={styles.funTitle}>Just for fun 🎉</Text>
              <View style={styles.funRow}>
                <Pressable
                  style={styles.funTile}
                  accessibilityRole="button"
                  accessibilityLabel="Wanted Poster"
                  onPress={() => { trackEvent('fun_open', { feature: 'wanted' }); router.push('/fun/wanted'); }}
                >
                  <Text style={styles.funEmoji} accessibilityElementsHidden importantForAccessibility="no">🤠</Text>
                  <Text style={styles.funLabel}>Wanted Poster</Text>
                </Pressable>
                <Pressable
                  style={styles.funTile}
                  accessibilityRole="button"
                  accessibilityLabel="Snoot Boop"
                  onPress={() => { trackEvent('fun_open', { feature: 'snoot' }); router.push('/fun/snoot'); }}
                >
                  <Text style={styles.funEmoji} accessibilityElementsHidden importantForAccessibility="no">🐽</Text>
                  <Text style={styles.funLabel}>Snoot Boop</Text>
                </Pressable>
                <Pressable
                  style={styles.funTile}
                  accessibilityRole="button"
                  accessibilityLabel="Adventure Passport"
                  onPress={() => { trackEvent('fun_open', { feature: 'adventures' }); router.push('/fun/adventures'); }}
                >
                  <Text style={styles.funEmoji} accessibilityElementsHidden importantForAccessibility="no">🗺️</Text>
                  <Text style={styles.funLabel}>Adventure Passport</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {user && profile && <Text style={styles.sectionLabel}>🗓️ Care &amp; household</Text>}
        {user && profile && <RemindersSection dogId={user.uid} reminders={reminders} />}

        {user && profile && (
          <HouseholdSection
            dogName={profile.name}
            memberIds={householdMemberIds}
            memberNames={householdMemberNames}
          />
        )}

        {/* goDoggyDate Pro — gated on !loading so a subscriber never sees the
            upsell flash before entitlements resolve. onLayout records the
            position so the Pet Twin nudge can scroll here. */}
        {user && profile && !pro.loading && (
          <View onLayout={(e) => { proYRef.current = e.nativeEvent.layout.y; }}>
            <ProUpsellCard isPro={pro.isPro} isFounding={pro.isFounding} source={pro.source} />
          </View>
        )}

        {profileComplete && (
          <View style={styles.tradingCardSection}>
            <Text style={styles.tradingCardLabel}>Your dog&apos;s card</Text>
            <View style={styles.tradingCardWrap}>
              <DogTradingCard ref={cardRef} profile={profile} />
            </View>
            <Pressable
              style={[styles.secondaryButton, sharingCard && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Share this card"
              onPress={handleShareCard}
              disabled={sharingCard}
            >
              <Text style={styles.secondaryText}>
                {sharingCard ? 'Rendering…' : '📤 Share this card'}
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionLabel}>Account</Text>
        <Pressable style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => setEditing(true)}>
          <Text style={styles.primaryText}>Edit profile</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={async () => {
            await signOutUser();
            router.replace('/welcome');
          }}
        >
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>

        <Pressable
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.brownLight} />
          ) : (
            <Text style={styles.deleteText}>Delete account</Text>
          )}
        </Pressable>

        <View style={styles.legalRow}>
          <Pressable accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => openLegalLink('/privacy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDivider}>·</Text>
          <Pressable accessibilityRole="link" accessibilityLabel="Terms of Service" onPress={() => openLegalLink('/terms')}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40 },
  gateContainer: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.brown,
    marginBottom: 10,
    textAlign: 'center',
  },
  gateBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brownLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.brown,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brownLight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    ...shadow.card,
  },
  hero: { width: '100%', height: 280, backgroundColor: colors.creamDark },
  cardBody: { padding: 18 },
  photoStrip: { marginBottom: 14 },
  photoStripItem: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    marginRight: 8,
    backgroundColor: colors.creamDark,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  photoStripItemActive: {
    borderColor: colors.primary,
  },
  photoStripImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBadgeText: { color: colors.white, fontSize: 12, fontWeight: '700', lineHeight: 14 },
  coverHint: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, marginBottom: 12 },
  coverButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  coverButtonText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primary },
  archetype: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 2,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.brown,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    marginTop: 6,
  },
  badge: {
    marginTop: 12,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  vibeBio: {
    marginTop: 10,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownMid,
  },
  vibeTypeCardWrap: { marginTop: 12 },
  statusBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  foundingBadge: {
    backgroundColor: `${colors.gold}26`, // ~15% opacity
    borderWidth: 1,
    borderColor: `${colors.gold}66`, // ~40% opacity
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  foundingBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.brown,
  },
  memberBadge: {
    backgroundColor: colors.brown,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  memberBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.cream,
  },
  trustBadge: {
    backgroundColor: 'rgba(34,139,34,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,139,34,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trustBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#1a5c1a',
  },
  trustBadgeSubtext: {
    fontFamily: fonts.body,
    fontWeight: '400',
    color: '#2d7a2d',
  },
  bestFriendBadge: {
    backgroundColor: `${colors.gold}26`, // ~15% opacity
    borderWidth: 1,
    borderColor: `${colors.gold}66`, // ~40% opacity
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bestFriendBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.brown,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    ...shadow.button,
  },
  primaryText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.brown,
  },
  revealCta: {
    backgroundColor: colors.brown,
    borderRadius: radius.xl,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 16,
    alignItems: 'center',
    ...shadow.card,
  },
  revealCtaText: { fontFamily: fonts.display, fontSize: 19, color: colors.gold },
  revealCtaSub: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  funZone: { marginBottom: 16 },
  funTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.brown, marginBottom: 10 },
  funRow: { flexDirection: 'row', gap: 10 },
  funTile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  funEmoji: { fontSize: 30 },
  funLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.brown, textAlign: 'center' },
  tradingCardSection: {
    // Not alignItems:'center' — that made every child shrink to its own
    // content width, so "Share this card" rendered as a narrow pill directly
    // above the full-width "Edit profile" button. The wrapper below centers
    // the card itself; buttons stay full-width like every other action.
    gap: 12,
    marginBottom: 16,
  },
  tradingCardLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.brown,
  },
  tradingCardWrap: {
    alignItems: 'center',
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  deleteText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  legalLink: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    textDecorationLine: 'underline',
  },
  legalDivider: {
    fontSize: 12,
    color: colors.brownLight,
  },
});
