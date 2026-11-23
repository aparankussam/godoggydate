'use client';
// web/app/app/profile/page.tsx
// Profile tab — shows the current user's dog profile and account controls.
// Always redirects unauthenticated users to the landing page.
// Provides: edit profile, sign out, and a link back to discover.

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  onAuthStateChanged,
  signOutUser,
  getUserDogProfile,
  isProfileComplete,
  saveUserDogProfile,
} from '../../../lib/auth';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../../../shared/utils/firebase';
import type { User, SavedDogProfile } from '../../../lib/auth';
import DogProfileForm from '../../../components/DogProfileForm';
import { trackEvent } from '../../../lib/analytics';
import { getRenderablePhotos, resolveHeroIndex } from '../../../lib/photos';
import { deleteAccount } from '../../../lib/account';
import DogTradingCard from '../../../components/DogTradingCard';
import HandoffCard from '../../../components/HandoffCard';
import VibeTypeCard from '../../../components/VibeTypeCard';
import { shareOrDownloadCard } from '../../../lib/shareCard';
import { onEntitlements, getFoundingMemberLink } from '../../../lib/entitlements';
import { toDogSlug } from '../../../lib/dogSlug';
import { onReminders } from '../../../lib/reminders';
import RemindersSection from '../../../components/RemindersSection';
import HouseholdSection from '../../../components/HouseholdSection';
import DogtypeSection from '../../../components/DogtypeSection';
import DiptychSection, { DIPTYCH_MIN_PHOTOS } from '../../../components/DiptychSection';
import ModerationNotice from '../../../components/ModerationNotice';
import EarnedStickers from '../../../components/EarnedStickers';
import LifeStageCard from '../../../components/LifeStageCard';
import { feedback } from '../../../lib/feedback';
import MilestonesCard from '../../../components/MilestonesCard';
import LetterSection from '../../../components/LetterSection';
import ProUpsellCard from '../../../components/ProUpsellCard';
import { useProEntitlement } from '../../../lib/useProEntitlement';
import {
  FOUNDING_FREE_SPOTS,
  FOUNDING_PAID_SPOTS,
  FOUNDING_TOTAL,
  foundingBadgeLabel,
  foundingSpotsLeft,
  useFoundingState,
} from '../../../lib/founding';
import { getHouseholdDogsForUser } from '../../../lib/household';
import type { HouseholdDog } from '../../../lib/household';
import type { Reminder } from '../../../../shared/types';
import { getVaccinationStatus, isPubliclyDiscoverable } from '../../../../shared/profile';
import { isNationalDogDaySeason } from '../../../../shared/seasons';
import ProfileGroup from '../../../components/ProfileGroup';
import PublicPageSwitch from '../../../components/PublicPageSwitch';
import BlockedList from '../../../components/BlockedList';
import FirstNameSwitch from '../../../components/FirstNameSwitch';
import { temperamentLabel } from '../../../../shared/temperament';

// What stops this profile from counting as complete, in plain words. Mirrors
// the checks in shared/profile.ts isProfileComplete so the list and the status
// can't disagree.
function missingProfileItems(p: SavedDogProfile | null): string[] {
  if (!p) return [];
  const out: string[] = [];
  const photoCount = p.photos?.length ?? 0;
  if (photoCount < 3) {
    const need = 3 - photoCount;
    out.push(photoCount === 0 ? '3 photos' : `${need} more photo${need === 1 ? '' : 's'}`);
  }
  if (!(p.name ?? '').trim()) out.push('a name');
  if (!(p.breed ?? '').trim()) out.push('a breed');
  if (!p.age) out.push('an age');
  if (!p.sex) out.push('their sex');
  if (!p.size) out.push('a size');
  if ((p.temperament?.length ?? 0) < 1 && (p.playStyles?.length ?? 0) < 1) out.push('a personality tag');
  const hasCoords = Number.isFinite(p.lat) && Number.isFinite(p.lng);
  const hasLocation =
    hasCoords || !!(p.zip ?? '').trim() || (!!(p.city ?? '').trim() && !!(p.state ?? '').trim()) || !!(p.location ?? '').trim();
  if (!hasLocation) out.push('a neighborhood or ZIP');
  return out;
}

export default function ProfilePage() {
  const router = useRouter();

  const [authUser,     setAuthUser]     = useState<User | null>(null);
  const [savedProfile, setSavedProfile] = useState<SavedDogProfile | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [showEdit,     setShowEdit]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [signingOut,   setSigningOut]   = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [deleteError,  setDeleteError]  = useState<string | null>(null);
  const [sharingCard,  setSharingCard]  = useState(false);
  const [sharingHandoff, setSharingHandoff] = useState(false);
  const [hasLifetime,  setHasLifetime]  = useState(false);
  const [reminders,    setReminders]    = useState<Reminder[]>([]);
  const [bestFriendName, setBestFriendName] = useState<string | null>(null);
  const [activePhoto,  setActivePhoto]  = useState(0);
  const [editFocus,    setEditFocus]    = useState<'birthday' | null>(null);
  // Frozen copy of the profile taken when the editor opens. The live listeners
  // below keep re-spreading savedProfile (new object identity) as household/
  // best-friend fields update, which would re-hydrate the form and wipe
  // in-progress edits. Editing against a snapshot decouples the form from that.
  const [editSnapshot, setEditSnapshot] = useState<SavedDogProfile | null>(null);
  // Household member state — only ever populated for a user with NO dog of
  // their own (see the effect below). An owner never enters this path.
  const [householdDogs,      setHouseholdDogs]      = useState<HouseholdDog[]>([]);
  const [householdChecked,   setHouseholdChecked]   = useState(false);
  const [householdReminders, setHouseholdReminders] = useState<Record<string, Reminder[]>>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const handoffRef = useRef<HTMLDivElement>(null);
  // One-shot guard: the live listeners below re-spread savedProfile on every
  // household/best-friend update, so seeding on each change would yank the
  // owner back to the cover photo mid-browse.
  const photoSeeded = useRef(false);

  // One Pro read for the whole page — drives the upsell/manage surface (no Pro-
  // exclusive feature is gated yet). Lifetime Founding Members count as Pro.
  const pro = useProEntitlement(authUser?.uid ?? null);
  // The $39 offer only exists while paid spots #51–150 are open.
  const founding = useFoundingState();

  // Open on the owner's own cover pick, the same photo their swipe card leads
  // with. Without this the profile always opened on photo 0 and contradicted
  // the card about which photo is the hero.
  useEffect(() => {
    if (photoSeeded.current || !savedProfile) return;
    const real = getRenderablePhotos(savedProfile.photos);
    if (real.length === 0) return;
    photoSeeded.current = true;
    const hero = resolveHeroIndex(savedProfile);
    setActivePhoto(typeof hero === 'number' && hero >= 0 && hero < real.length ? hero : 0);
  }, [savedProfile]);
  function handleUpgrade() {
    document.getElementById('pro-upsell')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleShareCard() {
    if (!cardRef.current || sharingCard || !authUser) return;
    setSharingCard(true);
    trackEvent('trading_card_share_click');
    try {
      const publicUrl = `${window.location.origin}/d/${toDogSlug(savedProfile?.name ?? 'dog', authUser.uid)}`;
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${(savedProfile?.name ?? 'dog').toLowerCase().replace(/\s+/g, '-')}-godoggydate-card.png`,
        { publicUrl: savedProfile?.publicPage === false ? undefined : publicUrl, dogName: savedProfile?.name },
      );
      feedback.success();
      trackEvent('trading_card_shared', { method: result });
    } catch {
      // html2canvas/share failures are non-critical — just let them retry.
    } finally {
      setSharingCard(false);
    }
  }

  // The Handoff Card exports through the same pipeline as the trading card
  // (web/lib/shareCard.ts, unchanged) with its own ref and filename.
  // Deliberately passes no publicUrl: that option exists to append
  // "see her page: <link>" recruiting copy to a public share, which is the
  // wrong thing to staple to a private care sheet going to a sitter.
  async function handleShareHandoff() {
    if (!handoffRef.current || sharingHandoff || !savedProfile) return;
    setSharingHandoff(true);
    trackEvent('handoff_card_share_click');
    try {
      const result = await shareOrDownloadCard(
        handoffRef.current,
        `${(savedProfile.name ?? 'dog').toLowerCase().replace(/\s+/g, '-')}-care-sheet.png`,
        { dogName: savedProfile.name },
      );
      trackEvent('handoff_card_shared', { method: result });
    } catch {
      // html2canvas/share failures are non-critical — just let them retry.
    } finally {
      setSharingHandoff(false);
    }
  }

  // ── Auth observer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Not signed in → go to landing page
        router.replace('/');
        return;
      }
      setAuthUser(user);
      try {
        const profile = await getUserDogProfile(user.uid);
        setSavedProfile(profile);
      } catch {
        // Firestore unavailable — show what we have (null)
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Founding Member badge — the $39 checkout copy promises "Badge included"
  // but nothing in the product ever rendered one until now. Depends on
  // authUser (set asynchronously by the auth observer above, starts null),
  // not an empty array — an empty dep array here would only ever run once
  // while authUser is still null and never re-fire once sign-in resolves.
  useEffect(() => {
    if (!authUser) return;
    return onEntitlements(authUser.uid, (e) => setHasLifetime(e.lifetimeChatUnlocks));
  }, [authUser]);

  // Cadence — live so completing/adding a reminder on one tab (or a push
  // deep-link) reflects immediately without a manual refresh.
  useEffect(() => {
    if (!authUser) return;
    return onReminders(authUser.uid, setReminders);
  }, [authUser]);

  // ── Household member fallback ─────────────────────────────────────────────
  // Someone invited onto a dog's household needs no dog of their own — the
  // invite copy promises exactly that — but this page only ever read
  // dogs/{their own uid}, so they landed on "No profile yet. Set up your
  // dog's profile to start swiping": a dead end for the one person the
  // feature was built for.
  //
  // Gated on hasOwnDog so a user WITH a dog never runs this query, never
  // holds this state, and cannot reach the household branch below. That
  // gate is the whole regression guard: for an owner this block is inert.
  const hasOwnDog = !!savedProfile;

  useEffect(() => {
    if (!authUser || loading || hasOwnDog) return;
    let cancelled = false;
    (async () => {
      try {
        const dogs = await getHouseholdDogsForUser(authUser.uid);
        if (!cancelled) setHouseholdDogs(dogs);
      } catch {
        // Offline or query failed — fall through to the existing empty state
        // rather than blocking the page on it.
      } finally {
        if (!cancelled) setHouseholdChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser, loading, hasOwnDog]);

  // Live reminders for each household dog. Same collection and same rules
  // path the owner uses — firestore.rules already grants an invited member
  // read AND write on dogs/{dogId}/reminders, so these rows are completable
  // by them, which is the entire point ("did you already give her the pill").
  useEffect(() => {
    if (householdDogs.length === 0) return;
    const unsubs = householdDogs.map((dog) =>
      onReminders(dog.dogId, (list) =>
        setHouseholdReminders((prev) => ({ ...prev, [dog.dogId]: list })),
      ),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [householdDogs]);

  // Household + Best Friend — the public dog doc is otherwise only fetched
  // once, on sign-in (getUserDogProfile above), so accepting/removing a
  // household member (both round-trip through a Cloud Function, not this
  // tab's own state) previously left the list stale until a manual reload.
  // Scoped to just these fields rather than replacing the full profile
  // fetch, since that one also merges in private-only fields (zip/lat/lng)
  // this listener has no reason to touch.
  useEffect(() => {
    if (!authUser) return;
    const { db } = getFirebase();
    return onSnapshot(doc(db, 'dogs', authUser.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setSavedProfile((prev) => (prev ? {
        ...prev,
        householdMemberIds: data.householdMemberIds,
        bestFriendMatchId: data.bestFriendMatchId,
        publicPage: typeof data.publicPage === 'boolean' ? data.publicPage : undefined,
      } : prev));
    });
  }, [authUser]);

  // Household member NAMES now live in a private subcollection (moved off the
  // world-readable dog doc), readable only by the owner + household. Read the
  // id→name map from there.
  useEffect(() => {
    if (!authUser) return;
    const { db } = getFirebase();
    return onSnapshot(collection(db, 'dogs', authUser.uid, 'householdNames'), (snap) => {
      const map: Record<string, string> = {};
      snap.forEach((d) => {
        const name = d.data()?.name;
        if (typeof name === 'string') map[d.id] = name;
      });
      setSavedProfile((prev) => (prev ? { ...prev, householdMemberNames: map } : prev));
    });
  }, [authUser]);

  // Best Friend name lookup — the field only stores a matchId (set from the
  // chat screen), so resolving it to a display name means reading the match
  // doc for the other party's dogId, then that dog's own (public) doc.
  useEffect(() => {
    const matchId = savedProfile?.bestFriendMatchId;
    if (!authUser || !matchId) {
      setBestFriendName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { db } = getFirebase();
        const matchSnap = await getDoc(doc(db, 'matches', matchId));
        if (!matchSnap.exists()) return;
        const matchData = matchSnap.data() as { dog1UserId?: string; dog2UserId?: string };
        const otherUid = matchData.dog1UserId === authUser.uid ? matchData.dog2UserId : matchData.dog1UserId;
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
  }, [authUser, savedProfile?.bestFriendMatchId]);

  // The server just cleared text from the profile (ModerationNotice saw a new
  // notice): re-read it so the page, and the editor's next snapshot, stop
  // showing the removed text. Merged so the listener-fed household fields stay.
  async function refreshProfile() {
    if (!authUser) return;
    try {
      const fresh = await getUserDogProfile(authUser.uid);
      if (fresh) setSavedProfile((prev) => (prev ? { ...prev, ...fresh } : fresh));
    } catch {
      // Offline: the stale copy stays until the next load.
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutUser();
    } finally {
      router.replace('/');
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      trackEvent('account_delete_requested');
      await deleteAccount();
      router.replace('/');
    } catch (err) {
      console.error('Account deletion failed:', err);
      setDeleteError('We could not delete your account right now. Please try again or email godoggydate@gobotsai.com.');
      setDeleting(false);
    }
  }

  function openEdit(focus: 'birthday' | null = null) {
    setEditSnapshot(savedProfile);
    setEditFocus(focus);
    setShowEdit(true);
  }
  function closeEdit() {
    setShowEdit(false);
    setEditFocus(null);
    setEditSnapshot(null);
  }

  async function handleProfileSaved(updated: SavedDogProfile) {
    if (!authUser) return;
    const safe: SavedDogProfile = {
      ...updated,
      playStyles: Array.isArray(updated.playStyles) ? updated.playStyles : [],
    };
    setSaveError(null);
    setSaving(true);
    try {
      await saveUserDogProfile(authUser.uid, safe);
      // Merge, don't replace: the form's payload has no ai/foundingPackNumber/
      // trustScore/createdAt, so a full replace would blank the Vibe Check bio,
      // Founding badge, and "would meet again" pill until a reload. safe's
      // explicit nulls (cleared dates/cover) still override prev.
      setSavedProfile((prev) => (prev ? { ...prev, ...safe } : safe));
      // Re-arm the one-shot photo seeding: the owner may have just changed
      // their cover pick (or removed the photo it named), and the latch would
      // otherwise leave the gallery showing the photo that WAS the hero.
      photoSeeded.current = false;
      setShowEdit(false);
      setEditFocus(null);
      setEditSnapshot(null);
      const completed = isProfileComplete(safe);
      trackEvent('profile_saved', {
        context: 'profile_page',
        completed,
      });
      if (completed) {
        trackEvent('profile_completed', {
          context: 'profile_page',
        });
      }
    } catch {
      setSaveError('We could not save your profile. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  // ── Edit overlay ──────────────────────────────────────────────────────────
  if (showEdit) {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 bg-sky/95 backdrop-blur px-5 h-14 flex items-center gap-3">
          <button
            onClick={closeEdit}
            className="text-2xl text-brown-mid hover:text-brown transition-colors"
            aria-label="Back"
          >
            ←
          </button>
          <span className="font-display text-xl text-brown">Edit Profile</span>
        </header>
        {saveError && (
          <div className="mx-auto max-w-md px-5 pt-4">
            <div className="rounded-2xl border border-brown bg-cream px-4 py-3 text-sm text-brown">
              {saveError}
            </div>
          </div>
        )}
        <DogProfileForm
          onSaved={handleProfileSaved}
          saving={saving}
          initialProfile={editSnapshot ?? savedProfile}
          focusSection={editFocus ?? undefined}
        />
      </div>
    );
  }

  // ── Profile view ──────────────────────────────────────────────────────────
  const complete    = isProfileComplete(savedProfile);
  // Complete from the owner's own view, but with only a ZIP (private) there is
  // no public location, so other dogs can't find this one. Same test Discover
  // uses for its own warning.
  const discoverable = isPubliclyDiscoverable(savedProfile);
  const missing     = missingProfileItems(savedProfile);
  const showDogDay  = isNationalDogDaySeason(new Date());
  const photos      = getRenderablePhotos(savedProfile?.photos);
  // Clamp so a stale index (after a photo is removed) can never read undefined.
  const safeActive  = photos.length > 0 ? Math.min(activePhoto, photos.length - 1) : 0;
  const name        = savedProfile?.name ?? '';
  // Vibe Check generates a named archetype and a bio in the dog's own voice
  // — already loaded into memory here (savedProfile.ai) since the onboarding
  // flow shipped, and rendered nowhere on the one page an owner actually
  // looks at their own dog's profile.
  const vibeCheck   = savedProfile?.ai?.vibeCheck;
  // True only for someone who has NO dog of their own but was invited onto
  // someone else's. Every household-specific branch below hangs off this, and
  // it is false for any user with a saved dog — an owner's page is unchanged.
  const householdOnly = !savedProfile && householdDogs.length > 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-sky/95 backdrop-blur px-5 h-14 flex items-center">
        <h1 className="font-display text-[26px] leading-none text-brown">Profile</h1>
      </header>

      {/* Below lg this is the original single phone-width column, so mobile
          web stays identical to the native app. At lg+ it becomes a real
          two-column app layout — the page was previously locked to max-w-md
          at every size, which on a desktop viewport left a phone-width strip
          of form rows floating in an empty field. */}
      <div className="max-w-md lg:max-w-6xl mx-auto px-5 lg:px-8 py-6 lg:py-10">
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8 lg:items-start">

        {/* Full-width across both columns */}
        <div className="contents lg:block lg:col-span-2 lg:space-y-5">
        {/* The content filter cleared some of this profile's text */}
        {authUser && savedProfile && (
          <ModerationNotice
            uid={authUser.uid}
            dogName={savedProfile.name}
            onEdit={() => openEdit()}
            onNotice={refreshProfile}
          />
        )}

        {/* Still deciding which empty state applies — the household lookup
            below hasn't answered yet. Without this the invited-partner case
            flashed "No profile yet" before its own view replaced it. */}
        {!savedProfile && !householdChecked && (
          <div className="flex justify-center py-12">
            <span className="text-4xl animate-spin">🐾</span>
          </div>
        )}

        {/* Household member view — no dog of their own, but invited onto one.
            This is what the invite promised ("no dog of your own required")
            and what this page used to answer with a dead end. Everything
            shown here is already readable by them under firestore.rules:
            the dog doc is public to any signed-in user, and reminders are
            explicitly granted to household members. */}
        {householdOnly && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-display text-2xl text-brown">Your household</p>
              <p className="mt-1 text-sm text-brown-mid">
                {householdDogs.length === 1
                  ? `You help look after ${householdDogs[0].profile.name}.`
                  : 'You help look after these dogs.'}{' '}
                You can see and complete their reminders — no dog of your own required.
              </p>
            </div>

            {householdDogs.map((dog) => (
              <div key={dog.dogId} className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="w-full max-w-[360px] shrink-0">
                  <HandoffCard
                    profile={dog.profile}
                    reminders={householdReminders[dog.dogId] ?? []}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <RemindersSection
                    dogId={dog.dogId}
                    reminders={householdReminders[dog.dogId] ?? []}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No profile yet — and not in anyone's household either. */}
        {!savedProfile && householdChecked && householdDogs.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="text-6xl">🐾</span>
            <p className="font-display text-2xl text-brown">No profile yet</p>
            <p className="text-brown-mid text-sm">Set up your dog&apos;s profile to start swiping.</p>
          </div>
        )}
        </div>

        {/* ── Left column: identity, details, actions ────────────────────── */}
        <div className="contents lg:flex lg:flex-col lg:gap-5">

        {savedProfile && (
          <div className="card rounded-[2rem] overflow-hidden max-lg:order-[10]">
            <div className="bg-cream px-5 py-5 flex items-center gap-4">
              {/* Tap the photo to cycle through the gallery (loops back to the
                  first). Purely a preview — the shared Trading Card always uses
                  the starred cover, and leaving the page re-seeds to the hero. */}
              <button
                type="button"
                onClick={() => { if (photos.length > 1) { setActivePhoto((i) => (i + 1) % photos.length); feedback.tap(); } }}
                disabled={photos.length <= 1}
                aria-label={photos.length > 1 ? `${name} photo ${safeActive + 1} of ${photos.length} — tap for next` : name}
                className="w-20 h-20 rounded-[1.4rem] overflow-hidden bg-note text-brown shrink-0 flex items-center justify-center enabled:cursor-pointer disabled:cursor-default"
              >
                {photos[safeActive] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[safeActive]} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">🐕</span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                {vibeCheck?.archetype.name && (
                  <p className="text-xs font-bold text-gold">
                    ✨ {vibeCheck.archetype.name}
                  </p>
                )}
                <p className="font-display text-3xl text-brown leading-tight break-words">{savedProfile.name}</p>
                <p className="text-sm text-brown-mid mt-1 truncate">
                  {[savedProfile.breed, savedProfile.age, savedProfile.location].filter(Boolean).join(' · ')}
                </p>
                {/* Honest status: a ZIP-only profile is complete for the owner but
                    invisible to every other dog, and Discover says so too. */}
                {!complete ? (
                  <p className="mt-2 text-xs font-bold text-brown">
                    Profile needs a few more details
                  </p>
                ) : discoverable ? (
                  <p className="mt-2 text-xs font-bold text-brown">
                    Ready to swipe
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold leading-snug text-brown">
                    <span className="font-bold">Ready to swipe</span>
                    {' '}— other dogs can&apos;t see you yet:{' '}
                    <button
                      type="button"
                      onClick={() => openEdit()}
                      className="min-h-[32px] font-bold underline underline-offset-2"
                    >
                      add a city
                    </button>
                  </p>
                )}
              </div>
            </div>

            {/* Vibe Check bio — written in the dog's own voice at onboarding,
                shown here for the first time. */}
            {vibeCheck?.bio && (
              <div className="px-5 pb-4 -mt-1">
                <p className="text-xs font-bold text-brown-mid mb-0.5">
                  ✨ Vibe Check · written by AI from their photos
                </p>
                <p className="text-sm italic leading-relaxed text-brown-mid">
                  “{vibeCheck.bio}”
                </p>
              </div>
            )}

            {/* Full type card: decodes the archetype code and surfaces the
                per-dog description the model writes — previously only the
                name rendered anywhere, in the compact eyebrow above. */}
            {vibeCheck?.archetype && (
              <div className="px-5 pb-4 -mt-1">
                <VibeTypeCard archetype={vibeCheck.archetype} />
              </div>
            )}

            {/* Founding Member + trust badges — computed/granted server-side,
                none shown before now: a database field with no UI is worse than
                not having the feature. One founding badge whether the spot was
                free (#1–50) or bought (#51–150); a member who bought before the
                ladder existed may have no number. We never show a raw trust
                score (it reads as a public rating; a positive "would meet
                again" rate is the honest, non-gameable framing instead). */}
            {(typeof savedProfile.foundingPackNumber === 'number' || (savedProfile.ratingCount ?? 0) > 0 || hasLifetime || bestFriendName) && (
              <div className="flex flex-wrap gap-2 px-5 pb-4 -mt-1">
                {(typeof savedProfile.foundingPackNumber === 'number' || hasLifetime) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brown text-cream px-3 py-1.5 text-xs font-bold">
                    {foundingBadgeLabel(savedProfile.foundingPackNumber)}
                  </span>
                )}
                {bestFriendName && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cream border border-brown px-3 py-1.5 text-xs font-bold text-brown">
                    ⭐ Best Friends with {bestFriendName}
                  </span>
                )}
                {(savedProfile.ratingCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cream border border-brown px-3 py-1.5 text-xs font-bold text-brown">
                    🐾 {Math.round((savedProfile.meetAgainRate ?? 0) * 100)}% would meet again
                    <span className="font-normal text-brown">
                      ({savedProfile.ratingCount} playdate{savedProfile.ratingCount === 1 ? '' : 's'} rated)
                    </span>
                  </span>
                )}
              </div>
            )}
            {(typeof savedProfile.foundingPackNumber === 'number' || hasLifetime) && (
              <p className="px-5 pb-4 -mt-2 text-xs leading-relaxed text-brown-mid">
                Founding Member: a permanent, numbered spot among the first {FOUNDING_TOTAL} dogs on GoDoggyDate.
              </p>
            )}
          </div>
        )}

        {/* Photo strip — tap a thumbnail to make it the main photo. */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 max-lg:order-[12]">
            {photos.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActivePhoto(i)}
                aria-label={`Show ${name} photo ${i + 1}`}
                aria-pressed={i === safeActive}
                className={`w-24 h-24 rounded-2xl overflow-hidden shrink-0 border-2 transition-all ${
                  i === safeActive ? 'border-brown ring-2 ring-brown ring-offset-2 ring-offset-sky' : 'border-brown/40 opacity-80 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${name} photo ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* What's missing — right under the dog card, specific, and with a way to fix it. */}
        {!complete && savedProfile && (
          <div className="bg-cream border border-brown rounded-2xl px-4 py-3 text-sm text-brown max-lg:order-[20]">
            <p className="font-semibold mb-1">Profile incomplete</p>
            <p className="text-xs leading-relaxed">
              {missing.length > 0
                ? <>Still needed to unlock swiping: {missing.join(', ')}.</>
                : <>A few details are still missing before swiping unlocks.</>}
            </p>
            <button
              type="button"
              onClick={() => openEdit()}
              className="mt-1 min-h-[36px] text-xs font-bold underline underline-offset-2"
            >
              Finish the profile
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 max-lg:order-[30]">
          {complete && (
            <button
              onClick={() => router.push('/app')}
              className="btn-primary py-3"
            >
              Start Swiping
            </button>
          )}

          {/* For a household member this is a real but secondary option —
              they were invited to help with someone else's dog, so it
              shouldn't be the loudest button on their page. */}
          <button
              onClick={() => openEdit()}
              className={householdOnly ? 'btn-secondary py-3' : complete ? 'btn-secondary py-3' : 'btn-primary py-3'}
            >
            {savedProfile ? 'Edit Profile' : householdOnly ? 'Add a dog of your own' : 'Create Profile'}
          </button>
        </div>

        {/* Today — reminders (Cadence). Kept visible even on an incomplete
            profile since it's useful with just a saved dog. */}
        {authUser && savedProfile && (
          <div className="max-lg:order-[40]">
            <RemindersSection dogId={authUser.uid} reminders={reminders} />
          </div>
        )}

        {/* Pack Day and the Playroom — the two places to DO something, one tap from the top. */}
        {savedProfile && complete && (
          <div className="card rounded-[1.8rem] divide-y divide-border max-lg:order-[50]">
            <Link
              href="/app/pack"
              onClick={() => { feedback.tap(); trackEvent('pack_day_entry_click', { source: 'profile' }); }}
              className="flex min-h-[64px] items-center justify-between gap-3 px-5 py-3"
            >
              <div>
                <p className="text-xs font-bold text-brown">Pack Day 🌳</p>
                <p className="font-display text-lg text-brown leading-tight">Join or host an open group playdate at a public place</p>
              </div>
              <span className="text-2xl" aria-hidden="true">→</span>
            </Link>
            <Link
              href="/app/fun"
              onClick={() => { feedback.tap(); trackEvent('fun_hub_click', { source: 'profile' }); }}
              className="flex min-h-[64px] items-center justify-between gap-3 px-5 py-3"
            >
              <div>
                <p className="text-xs font-bold text-brown">The Playroom 🎉</p>
                <p className="font-display text-lg text-brown leading-tight">Roast, apology, texts, review, quiz, plaque &amp; more</p>
              </div>
              <span className="text-2xl" aria-hidden="true">→</span>
            </Link>
          </div>
        )}

        {/* ── Your dog's life: Dogtype, life stage and the next real celebration.
            The reason to come back every day. The Gotcha Day letter stays here —
            it only appears near a real milestone, so it's contextual, not clutter.
            The playful generators live in the Playroom (entry above). ── */}
        {savedProfile && complete && authUser && (
          <div className="flex flex-col gap-5 max-lg:order-[60]">
            <DogtypeSection savedProfile={savedProfile} userId={authUser.uid} />
            <EarnedStickers dogId={authUser.uid} />
            <LifeStageCard savedProfile={savedProfile} onEditProfile={() => openEdit('birthday')} />
            <MilestonesCard savedProfile={savedProfile} userId={authUser.uid} />
            <LetterSection savedProfile={savedProfile} userId={authUser.uid} />
          </div>
        )}

        {/* Day 1 vs Day N — the National Dog Day card, so it only shows in its
            season (Aug 20 – Sep 5). Needs two different photos for "then vs
            now", the same minimum the component itself checks. Not gated on a
            complete profile: it only uses the owner's own photos. */}
        {showDogDay && savedProfile && photos.length >= DIPTYCH_MIN_PHOTOS && (
          <div className="max-lg:order-[65]">
            <DiptychSection savedProfile={savedProfile} />
          </div>
        )}

        {/* Profile details */}
        {savedProfile && (
          <ProfileGroup
            title="Profile details"
            hint="Breed, age, size, energy, vaccination"
            className="max-lg:order-[110]"
          >
          <div className="card rounded-[1.8rem] divide-y divide-border">
            {[
              { label: 'Name',          value: savedProfile.name,     raw: true },
              { label: 'Breed',         value: savedProfile.breed,    raw: true },
              { label: 'Age',           value: savedProfile.age            },
              { label: 'Size',          value: savedProfile.size           },
              { label: 'Energy',        value: savedProfile.energyLevel !== undefined ? `${savedProfile.energyLevel}%` : undefined },
              { label: 'Neighborhood',  value: savedProfile.location, raw: true },
              // Honest tri-state: hide the row entirely when never answered
              // (the old code invented a "Not yet" for every unstated profile).
              // `raw` keeps the shared vaccination label verbatim — `capitalize`
              // would rewrite "valid through Aug 12" the module says never to.
              { label: 'Vaccination',   value: (() => { const v = getVaccinationStatus(savedProfile); return v.tone === 'unstated' ? undefined : v.label; })(), raw: true },
            ].map(({ label, value, raw }) => value ? (
              <div key={label} className="flex justify-between items-center gap-3 px-4 py-3">
                <span className="shrink-0 text-sm text-brown-mid">{label}</span>
                <span className={`min-w-0 break-words text-right text-sm font-semibold text-brown ${raw ? '' : 'capitalize'}`}>{value}</span>
              </div>
            ) : null)}

            {/* Temperament */}
            {(savedProfile.temperament?.length ?? 0) > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm text-brown-mid mb-2">Temperament</p>
                <div className="flex flex-wrap gap-1.5">
                  {savedProfile.temperament!.map(temperamentLabel).map((t) => (
                    <span key={t} className="chip text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Play styles */}
            {(savedProfile.playStyles?.length ?? 0) > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm text-brown-mid mb-2">Play style</p>
                <div className="flex flex-wrap gap-1.5">
                  {savedProfile.playStyles.map((s) => (
                    <span key={s} className="chip text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          </ProfileGroup>
        )}

        {/* Account, help and sign-out — last. */}
        <div className="flex flex-col gap-3 max-lg:order-[140]">
          <FirstNameSwitch userId={authUser.uid} />
          <BlockedList userId={authUser.uid} />
          <div className="card rounded-[1.8rem] divide-y divide-border">
            {/* Account info */}
            {authUser?.email && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-brown-mid">Account</span>
                <span className="text-sm text-brown truncate max-w-[60%]">{authUser.email}</span>
              </div>
            )}

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-brown hover:bg-cream transition-colors disabled:opacity-50"
            >
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              <span>→</span>
            </button>

            {/* Delete account */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-brown-mid hover:text-brown hover:bg-cream transition-colors rounded-b-2xl"
              >
                <span>Delete account</span>
                <span>→</span>
              </button>
            ) : (
              <div className="px-4 py-4 rounded-b-2xl bg-cream">
                <p className="text-sm font-semibold text-brown">Delete your account permanently?</p>
                <p className="mt-1 text-xs leading-relaxed text-brown-mid">
                  This removes your dog&apos;s profile, all matches, messages, and swipe history.
                  Past purchases aren&apos;t refunded automatically: email godoggydate@gobotsai.com first if you&apos;re within the 14-day refund window. This cannot be undone.
                </p>
                {deleteError && <p className="mt-2 text-xs text-brown">{deleteError}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                    disabled={deleting}
                    className="rounded-full px-4 py-2 text-xs font-semibold text-brown-mid hover:text-brown disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Discover needs a dog of your own to score against, so it's not a
              destination for a household member — don't offer it to them. */}
          {!householdOnly && (
            <Link
              href="/app"
              className="text-center text-sm font-black text-brown underline decoration-2 underline-offset-4 min-h-[44px] flex items-center justify-center"
            >
              ← Back to discover
            </Link>
          )}

          <nav aria-label="Help and legal" className="flex flex-wrap justify-center gap-x-4 text-sm font-extrabold text-brown">
            <Link href="/support" className="py-2.5 hover:text-brown transition-colors">Support</Link>
            <Link href="/terms" className="py-2.5 hover:text-brown transition-colors">Terms</Link>
            <Link href="/privacy" className="py-2.5 hover:text-brown transition-colors">Privacy</Link>
            <Link href="/playdate-safety" className="py-2.5 hover:text-brown transition-colors">Play or Fight?</Link>
          </nav>
          <p className="text-center text-xs font-extrabold text-brown">GoDoggyDate is operated by GoBots LLC.</p>
        </div>
        </div>
        {/* ── /Left column ───────────────────────────────────────────────── */}

        {/* ── Right column: the card, plus the day-to-day tools ──────────── */}
        {/* Sticky on desktop so the card stays visible while the left column
            scrolls — it's the most visually distinctive thing on the page and
            the reason to come back to it. Capped to the viewport height with
            its own scroll: sticky alone (no max-height) left the Founding
            Member CTA at the bottom permanently unreachable whenever this
            column's own content — card + reminders + household + CTA — ran
            taller than the screen, since a sticky element with no shorter
            sibling to scroll past never gets the chance to un-stick.
            Children must not shrink (shrink-0): in a height-capped flex
            column the overflow-hidden cards (Reminders, Household) have a
            min-height of 0 and were squashed to nothing, so neither could be
            seen or used on desktop. */}
        <div className="contents lg:flex lg:flex-col lg:gap-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:[&>*]:shrink-0">

        {/* Trading card share + the public page switch */}
        {savedProfile && complete && (
          <ProfileGroup
            title="Share card & public page"
            hint="Trading card, share button and the public page switch"
            className="max-lg:order-[90]"
          >
          <div className="card rounded-[1.8rem] flex flex-col items-center gap-4 px-5 py-5">
            <p className="text-sm font-semibold text-brown self-start">Your dog&apos;s card</p>
            <div className="scale-[0.72] origin-top -mb-24 sm:scale-100 sm:mb-0">
              <DogTradingCard profile={savedProfile} innerRef={cardRef} />
            </div>
            <button
              onClick={handleShareCard}
              disabled={sharingCard}
              className="btn-secondary px-6 py-2.5 text-sm disabled:opacity-50"
            >
              {sharingCard ? 'Rendering…' : '📤 Share this card'}
            </button>
            {authUser && (
              <PublicPageSwitch
                uid={authUser.uid}
                dogName={savedProfile.name}
                enabled={savedProfile.publicPage !== false}
              />
            )}
          </div>
          </ProfileGroup>
        )}

        {/* The Handoff Card — the sitter/walker/groomer care sheet. Gated on
            savedProfile only, NOT on `complete`: unlike the trading card this
            has nothing to do with swiping, so a profile missing a third photo
            or a neighborhood still has a perfectly useful care sheet. */}
        {savedProfile && (
          <ProfileGroup
            title="Handoff card"
            hint="A one-image care sheet for a sitter, walker or groomer"
            className="max-lg:order-[100]"
          >
          <div className="card rounded-[1.8rem] flex flex-col items-center gap-4 px-5 py-5">
            <div className="self-start">
              <p className="text-sm font-semibold text-brown">Handoff card</p>
              <p className="mt-0.5 text-xs leading-relaxed text-brown-mid">
                One image for a sitter, walker, or groomer — only what you told us, marked as
                yours rather than ours.
              </p>
            </div>
            <HandoffCard profile={savedProfile} reminders={reminders} innerRef={handoffRef} />
            <button
              onClick={handleShareHandoff}
              disabled={sharingHandoff}
              className="btn-secondary px-6 py-2.5 text-sm disabled:opacity-50"
            >
              {sharingHandoff ? 'Rendering…' : '📤 Share this card'}
            </button>
          </div>
          </ProfileGroup>
        )}

        {savedProfile && (
          <div className="max-lg:order-[70]">
            <HouseholdSection
              dogName={savedProfile.name}
              memberIds={savedProfile.householdMemberIds ?? []}
              memberNames={savedProfile.householdMemberNames}
            />
          </div>
        )}

        {/* Pro + Founding offer blocks below are unchanged; this wrapper only
            keeps them after the groups on a phone. */}
        <div className="flex flex-col gap-5 max-lg:order-[130]">
        {/* goDoggyDate Pro — the recurring subscription (or, for a Founding
            Member, the grandfathered "Pro for life" state). id is the scroll
            target for the "get a card every day" upsell in PetTwinCard. */}
        {authUser && !householdOnly && savedProfile && !pro.loading && (
          <div id="pro-upsell">
            <ProUpsellCard isPro={pro.isPro} isFounding={pro.isFounding} source={pro.source} />
          </div>
        )}

        {/* Founding Member CTA. Lives here rather than only inside the chat
            paywall: that CTA was nested in a !canChat block, so turning chat
            free removed the last reachable purchase path in the whole product.
            The profile is always reachable and doesn't interrupt a
            conversation to sell something. Hidden once the user has Pro by any
            route (a subscriber or an existing Founding Member), and shown only
            while paid spots #51–150 are open. */}
        {/* Not shown to a dogless household member: every benefit it sells
            (chat unlocks, Founding Member number) attaches to a dog they don't
            have. */}
        {authUser && !householdOnly && !pro.loading && !pro.isPro && founding.phase === 'paid' && founding.count !== null && getFoundingMemberLink(authUser.uid) && (
          <a
            href={getFoundingMemberLink(authUser.uid)!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('founding_member_cta_click', { source: 'profile' })}
            className="card block rounded-[1.8rem] px-4 py-4 transition-colors hover:bg-cream-dark"
          >
            <p className="text-sm font-bold text-brown">⭐ Become a Founding Member — $39 once</p>
            <p className="mt-1 text-xs leading-relaxed text-brown-mid">
              A permanent Founding Member number and every future Pro feature at no extra cost, for as long
              as GoDoggyDate runs. {foundingSpotsLeft(founding.count)} of {FOUNDING_PAID_SPOTS} paid spots
              left (#{FOUNDING_FREE_SPOTS + 1}–{FOUNDING_TOTAL}). Pro features aren&apos;t live yet, so this
              mainly supports a small, independent app. Refundable within 14 days.
            </p>
          </a>
        )}
        </div>

        </div>
        {/* ── /Right column ──────────────────────────────────────────────── */}

      </div>
      </div>
    </div>
  );
}
