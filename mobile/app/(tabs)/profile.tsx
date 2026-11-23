import { ActivityIndicator, Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import ProfileEditor, { type ProfileEditorSection } from '../../components/ProfileEditor';
import {
  DEFAULT_COVER_FOCUS,
  focusForPhoto,
  resolveHeroFocus,
  resolveHeroIndex,
  setCoverPhoto,
  setCoverPhotoWithFocus,
} from '../../lib/coverPhoto';
import { CoverImage, CoverPhotoSheet } from '../../components/CoverPhotoEditor';
import ModerationNotice from '../../components/ModerationNotice';
import ProfileDetailsCard from '../../components/ProfileDetailsCard';
import EarnedStickers from '../../components/EarnedStickers';
import HandoffCard from '../../components/HandoffCard';
import DiptychSection, { shouldShowDiptych } from '../../components/DiptychSection';
import DogTradingCard from '../../components/DogTradingCard';
import VibeTypeCard from '../../components/VibeTypeCard';
import { colors, fonts } from '../../constants/theme';
import { Gingham, Glyph, Heading, PaperButton, PinkButton, card as paperCard, stripEmoji } from '../../components/pack/kit';
import { useSession } from '../../lib/session';
import { deleteAccount } from '../../lib/account';
import { trackEvent } from '../../lib/analytics';
import { useProEntitlement } from '../../lib/useProEntitlement';
import { onReminders } from '../../lib/reminders';
import { getFirebase } from '../../lib/firebase';
import RemindersSection from '../../components/RemindersSection';
import HouseholdSection from '../../components/HouseholdSection';
import PushPermissionCard from '../../components/PushPermissionCard';
import DogtypeSection from '../../components/DogtypeSection';
import CompatExplorer from '../../components/CompatExplorer';
import LifeStageCard from '../../components/LifeStageCard';
import MilestonesCard from '../../components/MilestonesCard';
import LetterSection from '../../components/LetterSection';
import ProUpsellCard from '../../components/ProUpsellCard';
import { captureAndShare } from '../../lib/shareCard';
import { dogPageUrl, webUrl } from '../../lib/webLinks';
import type { Reminder } from '../../../shared/types';
import { foundingBadgeLabel } from '../../../shared/founding';

function openWebLink(url: string) {
  Linking.openURL(url).catch(() => {
    Alert.alert('Could not open link', 'Please try again in a moment.');
  });
}

function openLegalLink(path: string) {
  openWebLink(webUrl(path));
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asEditorSection(value: string | undefined): ProfileEditorSection | undefined {
  return value === 'safety' || value === 'birthday' ? value : undefined;
}

/** The cover as last set from this screen, ahead of the session's copy. */
interface OptimisticCover {
  index: number;
  focusX: number;
  focusY: number;
}

export default function ProfileTab() {
  const { user, profile, profileComplete, saveProfile, refreshProfile, signOutUser, loading: sessionLoading } = useSession();
  // Deep link into the editor: router.push('/(tabs)/profile?edit=1'), with
  // '&section=safety' (or 'birthday') to open it scrolled to that section.
  // The Today panel's nudges use it.
  const params = useLocalSearchParams<{ edit?: string | string[]; section?: string | string[] }>();
  const editParam = firstParam(params.edit);
  const sectionParam = firstParam(params.section);
  const [editing, setEditing] = useState(false);
  const [editSection, setEditSection] = useState<ProfileEditorSection | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const [sharingHandoff, setSharingHandoff] = useState(false);
  const [coverSheetOpen, setCoverSheetOpen] = useState(false);
  const pro = useProEntitlement(user?.uid);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [householdMemberIds, setHouseholdMemberIds] = useState<string[]>([]);
  const [householdMemberNames, setHouseholdMemberNames] = useState<Record<string, string> | undefined>(undefined);
  const [bestFriendMatchId, setBestFriendMatchId] = useState<string | null>(null);
  const [bestFriendName, setBestFriendName] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  // Optimistic cover (index + focal point) so the "★ Cover" indicator and the
  // crop move the instant they're set, without waiting on the Firestore
  // round-trip / session refresh. Cleared when the editor saves, which writes
  // its own cover fields.
  const [optimisticCover, setOptimisticCover] = useState<OptimisticCover | null>(null);
  const [savingCover, setSavingCover] = useState(false);
  const photoInit = useRef(false);
  // The photo index to snap back to on blur (the starred cover). Kept current
  // each render so the focus-effect teardown can read it without unstable deps.
  const coverResetRef = useRef(0);
  const cardRef = useRef<View>(null);
  const handoffRef = useRef<View>(null);
  // Lets an upsell nudge scroll straight to the Pro card.
  const scrollRef = useRef<ScrollView>(null);
  const proYRef = useRef(0);

  // Open the profile on the owner's cover pick (or AI hero), once, when it loads.
  useEffect(() => {
    if (photoInit.current || !profile) return;
    const real = (profile.photos ?? []).filter((p) => p && !p.startsWith('_'));
    if (real.length === 0) return;
    photoInit.current = true;
    const h = resolveHeroIndex(profile);
    setActivePhoto(typeof h === 'number' && h < real.length ? h : 0);
  }, [profile]);

  // Tapping the photo cycles through the gallery, but that's a transient
  // preview — snap back to the starred cover when the tab loses focus, so the
  // cover the owner chose (and the shared card, which always uses it) is what
  // leads next time. The target is read from a ref (kept current each render)
  // with STABLE deps: threading profile/optimisticCover through the dep array
  // would re-identify the effect and fire its teardown mid-focus the instant
  // the owner sets a new cover, snapping the hero back to the old one.
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (coverResetRef.current >= 0) setActivePhoto(coverResetRef.current);
      };
    }, []),
  );

  // Consume the deep link, then clear it, so the same link pushed again later
  // still counts as a change and opens the editor again.
  useEffect(() => {
    if (editParam !== '1') return;
    setEditSection(asEditorSection(sectionParam));
    setEditing(true);
    try {
      router.setParams({ edit: undefined, section: undefined });
    } catch {
      // Navigation not ready yet; the editor is open either way.
    }
  }, [editParam, sectionParam]);

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
    if (!cardRef.current || sharingCard || !user || !profile) return;
    setSharingCard(true);
    trackEvent('trading_card_share_click');
    // Same caption as web's trading-card share, with the dog's public page so
    // the person receiving it has something to tap.
    const dogName = profile.name?.trim() || 'my dog';
    const pronoun = profile.sex === 'F' ? 'her' : profile.sex === 'M' ? 'his' : 'their';
    const result = await captureAndShare(
      cardRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-godoggydate-card.png`,
      `${dogName} on GoDoggyDate`,
      {
        caption: `That's ${dogName} on GoDoggyDate — see ${pronoun} page:`,
        url: dogPageUrl(profile.name ?? '', user.uid),
      },
    );
    if (result === 'shared') trackEvent('trading_card_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share card', 'Please try again in a moment.');
    setSharingCard(false);
  }

  function openEditor(section?: ProfileEditorSection) {
    setEditSection(section);
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    setEditSection(undefined);
  }

  // The care sheet goes to a sitter, not the public: no caption and no link to
  // the dog's public page, the same choice web makes.
  async function handleShareHandoff() {
    if (!handoffRef.current || sharingHandoff || !profile) return;
    setSharingHandoff(true);
    trackEvent('handoff_card_share_click');
    const dogName = profile.name?.trim() || 'dog';
    const result = await captureAndShare(
      handoffRef,
      `${dogName.toLowerCase().replace(/\s+/g, '-')}-care-sheet.png`,
      `${dogName}’s care sheet`,
    );
    if (result === 'shared') trackEvent('handoff_card_shared', { method: 'native_share' });
    if (result === 'unavailable') Alert.alert('Sharing unavailable', 'This device can’t share files right now.');
    if (result === 'error') Alert.alert('Could not share card', 'Please try again in a moment.');
    setSharingHandoff(false);
  }

  async function handleMakeCover(index: number) {
    if (!user || savingCover) return;
    setSavingCover(true);
    try {
      // A new cover starts centred (setCoverPhoto resets the focal point).
      await setCoverPhoto(user.uid, index);
      setOptimisticCover({ index, focusX: DEFAULT_COVER_FOCUS, focusY: DEFAULT_COVER_FOCUS });
      refreshProfile().catch(() => {});
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSavingCover(false);
    }
  }

  async function handleSaveCoverCrop(value: { coverIndex: number; focusX: number; focusY: number }) {
    if (!user || savingCover) return;
    setSavingCover(true);
    try {
      await setCoverPhotoWithFocus(user.uid, value.coverIndex, { x: value.focusX, y: value.focusY });
      setOptimisticCover({ index: value.coverIndex, focusX: value.focusX, focusY: value.focusY });
      setActivePhoto(value.coverIndex);
      setCoverSheetOpen(false);
      trackEvent('cover_photo_crop_saved', { source: 'profile' });
      refreshProfile().catch(() => {});
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSavingCover(false);
    }
  }

  async function handleDeleteAccount() {
    // Same wording as web (web/app/app/profile/page.tsx). The Terms allow
    // refunds within 14 days, so this must not say purchases aren't refunded.
    Alert.alert(
      'Delete your account permanently?',
      'This removes your dog’s profile, all matches, messages, and swipe history. Past purchases aren’t refunded automatically: email godoggydate@gobotsai.com first if you’re within the 14-day refund window. This cannot be undone.',
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
                'Please try again or email godoggydate@gobotsai.com.',
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
        <Gingham />
        <ActivityIndicator color={colors.ink} size="large" />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.gateContainer}>
        <Gingham />
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
          focusSection={editSection}
          onCancel={profile ? closeEditor : undefined}
          onSubmit={async (nextProfile) => {
            try {
              setSaving(true);
              await saveProfile(nextProfile);
              closeEditor();
              // The form wrote its own cover pick and crop; drop any older
              // optimistic value so the saved one shows.
              setOptimisticCover(null);
              // saveProfile keeps only what the form wrote. Re-read the dog doc
              // so server-written fields — including a Vibe Check run from the
              // editor, saved to dogs/{uid}.ai — show without a restart.
              refreshProfile().catch(() => {});
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
  const currentCover = optimisticCover?.index ?? (typeof profile.coverPhotoIndex === 'number' ? profile.coverPhotoIndex : (resolveHeroIndex(profile) ?? 0));
  const activeIsCover = safeActive === currentCover;
  // Keep the blur-reset target current for the focus effect above.
  coverResetRef.current = photos.length > 0 && currentCover >= 0 && currentCover < photos.length ? currentCover : 0;
  // The cover's focal point, from the optimistic value while one is pending.
  const coverSource = optimisticCover
    ? { coverPhotoIndex: optimisticCover.index, coverFocusX: optimisticCover.focusX, coverFocusY: optimisticCover.focusY }
    : profile;
  const heroFocus = focusForPhoto(coverSource, safeActive, currentCover);
  const savedCoverFocus = resolveHeroFocus(coverSource);
  const sheetCoverIndex = currentCover >= 0 && currentCover < photos.length ? currentCover : 0;

  return (
    <SafeAreaView style={styles.container}>
      <Gingham />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        // This page holds text boxes (reminders, quiz name, photo date, ...).
        // "handled" lets a button tap land while the keyboard is up instead of
        // only dismissing it (so "Add reminder" isn't a double tap); the insets
        // keep the focused box above the keyboard on iOS.
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>
          {profileComplete ? 'Your profile is ready — start discovering nearby pups.' : "Complete your dog's profile to start discovering nearby pups."}
        </Text>

        {/* E5: shown only while the server's notice doc exists. A new notice
            means the server just cleared text on the dog doc, so re-read it. */}
        <ModerationNotice
          uid={user.uid}
          dogName={profile.name}
          onEdit={() => openEditor()}
          onNotice={() => { refreshProfile().catch(() => {}); }}
        />

        <View style={styles.card}>
          {photos[safeActive] ? (
            <Pressable
              onPress={() => { if (photos.length > 1) setActivePhoto((safeActive + 1) % photos.length); }}
              disabled={photos.length <= 1}
              accessibilityRole={photos.length > 1 ? 'button' : 'image'}
              accessibilityLabel={
                photos.length > 1
                  ? `Photo ${safeActive + 1} of ${photos.length} of ${profile.name} — tap for next`
                  : `Photo of ${profile.name}`
              }
            >
              {/* Cropped around the owner's focal point while the cover shows,
                  the same crop the swipe deck uses. */}
              <CoverImage uri={photos[safeActive]} focus={heroFocus} style={styles.hero} />
            </Pressable>
          ) : null}
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
                      <View style={styles.coverBadge}><Glyph name="star" size={13} color={colors.cream} /></View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {/* Cover-photo pick: make the selected photo the one that leads on
                the profile + swipe deck (instead of always the first upload).
                A new pick starts centred; once it's the cover, the owner can
                drag what part of it shows (C4). */}
            {photos.length > 0 && (
              activeIsCover ? (
                <View style={styles.coverRow}>
                  {photos.length > 1 && (
                    <View style={styles.coverHintRow}>
                      <Glyph name="star" size={15} />
                      <Text style={styles.coverHint}>This is {profile.name}&apos;s cover photo</Text>
                    </View>
                  )}
                  <PaperButton
                    small
                    icon="crop"
                    label="Adjust the crop"
                    disabled={savingCover}
                    onPress={() => setCoverSheetOpen(true)}
                    style={styles.coverButton}
                    accessibilityLabel="Adjust what part of the cover photo shows on cards"
                  />
                </View>
              ) : (
                <PaperButton
                  small
                  icon="star"
                  label={savingCover ? 'Saving…' : 'Make this the cover photo'}
                  disabled={savingCover}
                  onPress={() => handleMakeCover(safeActive)}
                  style={styles.coverButton}
                  accessibilityLabel={`Make photo ${safeActive + 1} the cover photo`}
                />
              )
            )}
            {/* Vibe Check generates a named archetype and a bio in the dog's
                own voice — already loaded into memory here (profile.ai)
                since the onboarding flow shipped, and rendered nowhere on
                the one screen an owner actually looks at their own dog's
                profile. */}
            {profile.ai?.vibeCheck?.archetype.name && (
              <View style={styles.archetypeRow}>
                <Glyph name="star-four-points" size={14} color={colors.rose} />
                <Text style={styles.archetype}>{profile.ai.vibeCheck.archetype.name}</Text>
              </View>
            )}
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.meta}>
              {[profile.breed, profile.age, profile.sex, profile.location].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.badgeRow}>
              <Glyph name={profileComplete ? 'check-circle' : 'progress-pencil'} size={16} />
              <Text style={styles.badge}>
                {profileComplete ? 'Ready for mobile discover' : 'Profile still needs a few details'}
              </Text>
            </View>
            {profile.ai?.vibeCheck?.bio && (
              <>
                <Text style={styles.vibeBioLabel}>Written by AI from their photos</Text>
                <Text style={styles.vibeBio}>“{profile.ai.vibeCheck.bio}”</Text>
              </>
            )}

            {/* Full type card: decodes the archetype code and surfaces the
                per-dog description the model writes — previously only the
                name rendered anywhere, in the compact eyebrow above. */}
            {profile.ai?.vibeCheck?.archetype && (
              <View style={styles.vibeTypeCardWrap}>
                <VibeTypeCard archetype={profile.ai.vibeCheck.archetype} />
              </View>
            )}

            {/* Founding Member + trust badges — computed server-side. One
                founding badge whether the spot was free (#1–50) or bought
                (#51–150); a member who bought before the ladder may have no
                number. No raw trust score (0-1 reads as a public rating); a
                positive "would meet again" rate instead. */}
            {(typeof profile.foundingPackNumber === 'number' || (profile.ratingCount ?? 0) > 0 || pro.isFounding || bestFriendName) && (
              <View style={styles.statusBadgeRow}>
                {(typeof profile.foundingPackNumber === 'number' || pro.isFounding) && (
                  <View style={styles.memberBadge}>
                    <Glyph name="star" size={14} color={colors.cream} />
                    <Text style={styles.memberBadgeText}>{stripEmoji(foundingBadgeLabel(profile.foundingPackNumber))}</Text>
                  </View>
                )}
                {(profile.ratingCount ?? 0) > 0 && (
                  <View style={styles.trustBadge}>
                    <Glyph name="paw" size={14} />
                    <Text style={styles.trustBadgeText}>
                      {Math.round((profile.meetAgainRate ?? 0) * 100)}% would meet again
                      <Text style={styles.trustBadgeSubtext}>
                        {' '}({profile.ratingCount} playdate{profile.ratingCount === 1 ? '' : 's'})
                      </Text>
                    </Text>
                  </View>
                )}
                {bestFriendName && (
                  <View style={styles.bestFriendBadge}>
                    <Glyph name="star" size={14} />
                    <Text style={styles.bestFriendBadgeText}>Best Friends with {bestFriendName}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* E3: Day 1 vs Day N. Same rule and place as web: any saved profile
            with two or more real photos, after the photo strip and before the
            details card. */}
        {shouldShowDiptych(profile) && <DiptychSection savedProfile={profile} />}

        {/* C7: the dog field by field, as on web's profile page. */}
        <ProfileDetailsCard profile={profile} />

        {/* ── The Gen-Z viral layer: identity → invite → daily → life ──────── */}
        {user && profile && (
          <>
            <Heading size={24} style={styles.sectionLabel}>{profile.name}&apos;s world</Heading>
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
              <View style={styles.revealIcon}><Glyph name="star-four-points" size={22} /></View>
              <View style={styles.revealBody}>
                <Text style={styles.revealCtaText}>Reveal {profile.name}&apos;s Dogtype</Text>
                <Text style={styles.revealCtaSub}>A shareable card, read from their real profile</Text>
              </View>
              <Glyph name="chevron-right" size={26} />
            </Pressable>
            <DogtypeSection savedProfile={profile} />
            {/* C5: stickers unlocked by booping; renders nothing until one is. */}
            <EarnedStickers dogId={user.uid} />
            <CompatExplorer savedProfile={profile} userId={user.uid} />
            <LifeStageCard savedProfile={profile} onEditProfile={() => openEditor('birthday')} />
            <MilestonesCard savedProfile={profile} userId={user.uid} />
            <LetterSection savedProfile={profile} userId={user.uid} />

            {/* One entry to all the playful, shareable cards & games — they live
                in the Playroom so the profile stays about the dog's life (mirrors
                web, where /app/profile has a single Playroom card → /app/fun). */}
            <Pressable
              style={styles.playroomCard}
              accessibilityRole="button"
              accessibilityLabel="Open the Playroom — roasts, a letter in their voice, Wanted poster, Snoot Boop, Barkle and more"
              onPress={() => { trackEvent('fun_open', { feature: 'playroom' }); router.push('/fun/playroom'); }}
            >
              <View style={styles.playroomHead}>
                <View style={styles.revealIcon}><Glyph name="puzzle" size={20} /></View>
                <View style={styles.revealBody}>
                  <Text style={styles.playroomEyebrow}>The Playroom</Text>
                  <Text style={styles.playroomTitle}>Playful cards and games</Text>
                </View>
              </View>
              <Text style={styles.playroomDesc}>
                Roasts, a letter in {profile.name?.trim() || 'your dog'}’s voice, a Wanted poster, Snoot Boop,
                the daily Barkle puzzle, and more — all built from their profile.
              </Text>
              <View style={styles.playroomCtaRow}>
                <Text style={styles.playroomCta}>Open the Playroom</Text>
                <Glyph name="chevron-right" size={20} />
              </View>
            </Pressable>
          </>
        )}

        {user && profile && <Heading size={24} style={styles.sectionLabel}>Care and household</Heading>}
        {user && profile && <PushPermissionCard />}
        {user && profile && <RemindersSection dogId={user.uid} reminders={reminders} />}

        {/* C2: the care sheet for a sitter or walker. Not gated on a complete
            profile, as on web: it has nothing to do with swiping. */}
        {user && profile && (
          <View style={styles.handoffSection}>
            <Heading size={22}>Handoff card</Heading>
            <Text style={styles.handoffIntro}>
              One image for a sitter, walker, or groomer — only what you told us, marked as yours rather
              than ours.
            </Text>
            <HandoffCard ref={handoffRef} profile={profile} reminders={reminders} />
            <PaperButton
              icon="export-variant"
              label={sharingHandoff ? 'Rendering…' : 'Share this card'}
              accessibilityLabel={`Share ${profile.name}'s care sheet`}
              onPress={handleShareHandoff}
              disabled={sharingHandoff}
            />
          </View>
        )}

        {user && profile && (
          <HouseholdSection
            dogName={profile.name}
            memberIds={householdMemberIds}
            memberNames={householdMemberNames}
          />
        )}

        {/* goDoggyDate Pro — gated on !loading so a subscriber never sees the
            upsell flash before entitlements resolve. onLayout records the
            position so an upsell nudge can scroll here. */}
        {user && profile && !pro.loading && (
          <View onLayout={(e) => { proYRef.current = e.nativeEvent.layout.y; }}>
            <ProUpsellCard isPro={pro.isPro} isFounding={pro.isFounding} source={pro.source} />
          </View>
        )}

        {profileComplete && (
          <View style={styles.tradingCardSection}>
            <Heading size={22}>Your dog&apos;s card</Heading>
            <View style={styles.tradingCardWrap}>
              <DogTradingCard ref={cardRef} profile={profile} />
            </View>
            <PaperButton
              icon="export-variant"
              label={sharingCard ? 'Rendering…' : 'Share this card'}
              accessibilityLabel="Share this card"
              onPress={handleShareCard}
              disabled={sharingCard}
            />
            {/* Mirrors web's "View <name>'s public page →" link under the card. */}
            <Pressable
              style={styles.publicPageLink}
              accessibilityRole="link"
              accessibilityLabel={`View ${profile.name}'s public page`}
              onPress={() => openWebLink(dogPageUrl(profile.name ?? '', user.uid))}
            >
              <Text style={styles.publicPageText}>View {profile.name}&apos;s public page</Text>
              <Glyph name="chevron-right" size={18} />
            </Pressable>
          </View>
        )}

        <Heading size={24} style={styles.sectionLabel}>Account</Heading>
        {/* Which account this is — guests have no email, so no row. */}
        {user.email ? (
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Account</Text>
            <Text style={styles.accountEmail} numberOfLines={1} ellipsizeMode="middle">{user.email}</Text>
          </View>
        ) : null}
        {/* The screen's ONE pink action. */}
        <PinkButton label="Edit profile" icon="pencil" onPress={() => openEditor()} style={styles.primaryButton} />

        <PaperButton
          label="Sign out"
          icon="logout"
          onPress={async () => {
            await signOutUser();
            router.replace('/welcome');
          }}
        />

        <Pressable
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.ink} />
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

      {photos.length > 0 && (
        <CoverPhotoSheet
          visible={coverSheetOpen}
          photos={photos}
          coverIndex={sheetCoverIndex}
          focus={savedCoverFocus}
          dogName={profile.name?.trim() || 'your dog'}
          saving={savingCover}
          onCancel={() => setCoverSheetOpen(false)}
          onSave={handleSaveCoverCrop}
        />
      )}
    </SafeAreaView>
  );
}

const ink = colors.ink;
const softInk = colors.brownMid;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.sky },
  content: { padding: 16, paddingBottom: 48 },
  gateContainer: {
    flex: 1,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  gateTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: ink,
    marginBottom: 10,
    textAlign: 'center',
  },
  gateBody: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: ink,
    textAlign: 'center',
    lineHeight: 22,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    color: ink,
    marginTop: 4,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: ink,
    lineHeight: 21,
    marginBottom: 18,
  },
  sectionLabel: {
    marginTop: 14,
    marginBottom: 12,
  },
  card: {
    ...paperCard.paper,
    overflow: 'hidden',
    marginBottom: 20,
  },
  hero: { width: '100%', height: 280, backgroundColor: colors.creamDark, borderBottomWidth: 2, borderBottomColor: ink },
  cardBody: { padding: 18 },
  photoStrip: { marginBottom: 14 },
  photoStripItem: {
    width: 84,
    height: 84,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: colors.creamDark,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: ink,
    opacity: 0.85,
  },
  photoStripItemActive: {
    borderWidth: 4,
    opacity: 1,
  },
  photoStripImage: {
    width: '100%',
    height: '100%',
  },
  coverBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  coverHint: { fontFamily: fonts.bold, fontSize: 13, color: softInk },
  coverRow: { marginBottom: 4 },
  coverButton: {
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  archetypeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  archetype: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: colors.rose,
    letterSpacing: 0.3,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 42,
    color: ink,
  },
  meta: {
    fontFamily: fonts.black,
    fontSize: 15,
    color: softInk,
    marginTop: 4,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  badge: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: ink,
  },
  vibeBioLabel: {
    marginTop: 12,
    fontFamily: fonts.black,
    fontSize: 12,
    color: softInk,
  },
  vibeBio: {
    marginTop: 3,
    fontFamily: fonts.hand,
    fontSize: 21,
    lineHeight: 25,
    color: ink,
  },
  vibeTypeCardWrap: { marginTop: 12 },
  statusBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: ink,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  memberBadgeText: {
    fontFamily: fonts.black,
    fontSize: 12.5,
    color: colors.cream,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  trustBadgeText: {
    fontFamily: fonts.black,
    fontSize: 12.5,
    color: ink,
  },
  trustBadgeSubtext: {
    fontFamily: fonts.bold,
    color: softInk,
  },
  bestFriendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bestFriendBadgeText: {
    fontFamily: fonts.black,
    fontSize: 12.5,
    color: ink,
  },
  primaryButton: {
    marginBottom: 12,
  },
  revealCta: {
    ...paperCard.paper,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  revealIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: ink,
    backgroundColor: colors.note,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealBody: { flex: 1, minWidth: 0 },
  revealCtaText: { fontFamily: fonts.display, fontSize: 21, lineHeight: 24, color: ink },
  revealCtaSub: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: softInk, marginTop: 2 },
  playroomCard: {
    ...paperCard.paper,
    marginBottom: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 6,
  },
  playroomHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playroomEyebrow: {
    fontFamily: fonts.black,
    fontSize: 13,
    color: softInk,
  },
  playroomTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 24, color: ink },
  playroomDesc: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: ink, marginTop: 4 },
  playroomCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  playroomCta: { fontFamily: fonts.black, fontSize: 15, color: ink, textDecorationLine: 'underline' },
  tradingCardSection: {
    // Not alignItems:'center' — that made every child shrink to its own
    // content width, so "Share this card" rendered as a narrow pill directly
    // above the full-width "Edit profile" button. The wrapper below centers
    // the card itself; buttons stay full-width like every other action.
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  tradingCardWrap: {
    alignItems: 'center',
  },
  handoffSection: {
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  handoffIntro: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: ink,
    marginTop: -4,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.cream,
    borderWidth: 2,
    borderColor: ink,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  accountLabel: { fontFamily: fonts.black, fontSize: 14, color: softInk },
  accountEmail: { flexShrink: 1, fontFamily: fonts.black, fontSize: 14, color: ink },
  publicPageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  publicPageText: {
    fontFamily: fonts.black,
    fontSize: 15,
    color: ink,
    textDecorationLine: 'underline',
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 10,
  },
  deleteText: {
    fontFamily: fonts.black,
    fontSize: 14,
    color: ink,
    textDecorationLine: 'underline',
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  legalLink: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: ink,
    textDecorationLine: 'underline',
    paddingVertical: 10,
  },
  legalDivider: {
    fontSize: 13,
    color: ink,
  },
});
