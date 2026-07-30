import { ActivityIndicator, Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import ProfileEditor from '../../components/ProfileEditor';
import DogTradingCard from '../../components/DogTradingCard';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { deleteAccount } from '../../lib/account';
import { trackEvent } from '../../lib/analytics';
import { onEntitlements } from '../../lib/entitlements';
import { onReminders } from '../../lib/reminders';
import { getFirebase } from '../../lib/firebase';
import RemindersSection from '../../components/RemindersSection';
import HouseholdSection from '../../components/HouseholdSection';
import type { Reminder } from '../../../shared/types';

function openLegalLink(path: string) {
  const base = (process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '')) || 'https://godoggydate.com';
  Linking.openURL(`${base}${path}`).catch(() => {
    Alert.alert('Could not open link', 'Please try again in a moment.');
  });
}

export default function ProfileTab() {
  const { user, profile, profileComplete, saveProfile, signOutUser } = useSession();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const [hasLifetime, setHasLifetime] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [householdMemberIds, setHouseholdMemberIds] = useState<string[]>([]);
  const [householdMemberNames, setHouseholdMemberNames] = useState<Record<string, string> | undefined>(undefined);
  const [bestFriendMatchId, setBestFriendMatchId] = useState<string | null>(null);
  const [bestFriendName, setBestFriendName] = useState<string | null>(null);
  const cardRef = useRef<View>(null);

  // Founding Member badge — the $39 checkout copy promises "Badge included"
  // but nothing in the product ever rendered one until now.
  useEffect(() => {
    if (!user) return;
    return onEntitlements(user.uid, (e) => setHasLifetime(e.lifetimeChatUnlocks));
  }, [user]);

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
      setHouseholdMemberNames(data.householdMemberNames as Record<string, string> | undefined);
      setBestFriendMatchId((data.bestFriendMatchId as string | undefined) ?? null);
    });
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

  if (!user) return null;

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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {profileComplete ? 'Your mobile profile is ready for Phase 2 discover.' : 'Complete your dog profile to unlock the next phase.'}
        </Text>

        <View style={styles.card}>
          {photos[0] ? <Image source={{ uri: photos[0] }} style={styles.hero} /> : null}
          <View style={styles.cardBody}>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.meta}>
              {[profile.breed, profile.age, profile.sex, profile.location].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.badge}>
              {profileComplete ? 'Ready for mobile discover' : 'Profile still needs a few details'}
            </Text>

            {/* Founding Pack + trust badges — computed server-side, never
                shown before now. No raw trust score (0-1 reads as a public
                rating); a positive "would meet again" rate instead. */}
            {(typeof profile.foundingPackNumber === 'number' || (profile.ratingCount ?? 0) > 0 || hasLifetime || bestFriendName) && (
              <View style={styles.statusBadgeRow}>
                {typeof profile.foundingPackNumber === 'number' && (
                  <View style={styles.foundingBadge}>
                    <Text style={styles.foundingBadgeText}>🏅 Founding Pack #{profile.foundingPackNumber}</Text>
                  </View>
                )}
                {hasLifetime && (
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

        {user && profile && <RemindersSection dogId={user.uid} reminders={reminders} />}

        {user && profile && (
          <HouseholdSection
            dogName={profile.name}
            memberIds={householdMemberIds}
            memberNames={householdMemberNames}
          />
        )}

        {profileComplete && (
          <View style={styles.tradingCardSection}>
            <Text style={styles.tradingCardLabel}>Your dog&apos;s card</Text>
            <View style={styles.tradingCardWrap}>
              <DogTradingCard ref={cardRef} profile={profile} />
            </View>
            <Pressable
              style={[styles.secondaryButton, sharingCard && { opacity: 0.6 }]}
              onPress={handleShareCard}
              disabled={sharingCard}
            >
              <Text style={styles.secondaryText}>
                {sharingCard ? 'Rendering…' : '📤 Share this card'}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable style={styles.primaryButton} onPress={() => setEditing(true)}>
          <Text style={styles.primaryText}>Edit profile</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={async () => {
            await signOutUser();
            router.replace('/welcome');
          }}
        >
          <Text style={styles.secondaryText}>Sign out</Text>
        </Pressable>

        <Pressable
          style={styles.deleteButton}
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
          <Pressable onPress={() => openLegalLink('/privacy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
          <Text style={styles.legalDivider}>·</Text>
          <Pressable onPress={() => openLegalLink('/terms')}>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: 16,
    ...shadow.card,
  },
  hero: { width: '100%', height: 280, backgroundColor: colors.creamDark },
  cardBody: { padding: 18 },
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
  tradingCardSection: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  tradingCardLabel: {
    alignSelf: 'flex-start',
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
