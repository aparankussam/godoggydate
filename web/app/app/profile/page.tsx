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
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../../../shared/utils/firebase';
import type { User, SavedDogProfile } from '../../../lib/auth';
import DogProfileForm from '../../../components/DogProfileForm';
import { trackEvent } from '../../../lib/analytics';
import { getRenderablePhotos } from '../../../lib/photos';
import { deleteAccount } from '../../../lib/account';
import DogTradingCard from '../../../components/DogTradingCard';
import HandoffCard from '../../../components/HandoffCard';
import VibeTypeCard from '../../../components/VibeTypeCard';
import { shareOrDownloadCard } from '../../../lib/shareCard';
import { onEntitlements, getFoundingMemberLink } from '../../../lib/entitlements';
import { getFoundingPackPitch } from '../../../shared/utils/stripe';
import { toDogSlug } from '../../../lib/dogSlug';
import { onReminders } from '../../../lib/reminders';
import RemindersSection from '../../../components/RemindersSection';
import HouseholdSection from '../../../components/HouseholdSection';
import { getHouseholdDogsForUser } from '../../../lib/household';
import type { HouseholdDog } from '../../../lib/household';
import type { Reminder } from '../../../../shared/types';

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
  // Household member state — only ever populated for a user with NO dog of
  // their own (see the effect below). An owner never enters this path.
  const [householdDogs,      setHouseholdDogs]      = useState<HouseholdDog[]>([]);
  const [householdChecked,   setHouseholdChecked]   = useState(false);
  const [householdReminders, setHouseholdReminders] = useState<Record<string, Reminder[]>>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const handoffRef = useRef<HTMLDivElement>(null);

  async function handleShareCard() {
    if (!cardRef.current || sharingCard || !authUser) return;
    setSharingCard(true);
    trackEvent('trading_card_share_click');
    try {
      const publicUrl = `${window.location.origin}/d/${toDogSlug(savedProfile?.name ?? 'dog', authUser.uid)}`;
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${(savedProfile?.name ?? 'dog').toLowerCase().replace(/\s+/g, '-')}-godoggydate-card.png`,
        { publicUrl, dogName: savedProfile?.name },
      );
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
        householdMemberNames: data.householdMemberNames,
        bestFriendMatchId: data.bestFriendMatchId,
      } : prev));
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
      setDeleteError('We could not delete your account right now. Please try again or email support@godoggydate.com.');
      setDeleting(false);
    }
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
      setSavedProfile(safe);
      setShowEdit(false);
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
      <div className="min-h-screen bg-cream">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center gap-3">
          <button
            onClick={() => setShowEdit(false)}
            className="text-2xl text-brown-light hover:text-brown transition-colors"
            aria-label="Back"
          >
            ←
          </button>
          <span className="font-display text-xl text-brown">Edit Profile</span>
        </header>
        {saveError && (
          <div className="mx-auto max-w-md px-5 pt-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {saveError}
            </div>
          </div>
        )}
        <DogProfileForm
          onSaved={handleProfileSaved}
          saving={saving}
          initialProfile={savedProfile}
        />
      </div>
    );
  }

  // ── Profile view ──────────────────────────────────────────────────────────
  const complete    = isProfileComplete(savedProfile);
  const photos      = getRenderablePhotos(savedProfile?.photos);
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
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center">
        <span className="font-display text-xl text-brown">🐕 Profile</span>
      </header>

      {/* Below lg this is the original single phone-width column, so mobile
          web stays identical to the native app. At lg+ it becomes a real
          two-column app layout — the page was previously locked to max-w-md
          at every size, which on a desktop viewport left a phone-width strip
          of form rows floating in an empty field. */}
      <div className="max-w-md lg:max-w-6xl mx-auto px-5 lg:px-8 py-6 lg:py-10">
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8 lg:items-start">

        {/* Full-width across both columns */}
        <div className="contents lg:block lg:col-span-2">
        {/* Profile incomplete warning */}
        {!complete && savedProfile && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold mb-1">Profile incomplete</p>
            <p className="text-xs">
              Add your dog&apos;s breed, age, neighborhood, and at least one personality tag to unlock swiping.
            </p>
          </div>
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
              <p className="mt-1 text-sm text-brown-light">
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
            <p className="text-brown-light text-sm">Set up your dog&apos;s profile to start swiping.</p>
          </div>
        )}
        </div>

        {/* ── Left column: identity, details, actions ────────────────────── */}
        <div className="contents lg:flex lg:flex-col lg:gap-5">

        {savedProfile && (
          <div className="card rounded-[2rem] overflow-hidden">
            <div className="bg-gradient-to-br from-cream-dark via-cream to-white px-5 py-5 flex items-center gap-4">
              <div className="w-20 h-20 rounded-[1.4rem] overflow-hidden bg-gradient-to-br from-gold to-primary shrink-0 flex items-center justify-center">
                {photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photos[0]} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">🐕</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {vibeCheck?.archetype.name && (
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">
                    ✨ {vibeCheck.archetype.name}
                  </p>
                )}
                <p className="font-display text-3xl text-brown leading-tight">{savedProfile.name}</p>
                <p className="text-sm text-brown-light mt-1 truncate">
                  {[savedProfile.breed, savedProfile.age, savedProfile.location].filter(Boolean).join(' · ')}
                </p>
                <p className={`mt-2 text-xs font-bold uppercase tracking-[0.16em] ${
                  complete ? 'text-green-700' : 'text-amber-700'
                }`}>
                  {complete ? 'Ready to swipe' : 'Profile needs a few more details'}
                </p>
              </div>
            </div>

            {/* Vibe Check bio — written in the dog's own voice at onboarding,
                shown here for the first time. */}
            {vibeCheck?.bio && (
              <p className="px-5 pb-4 -mt-1 text-sm italic leading-relaxed text-brown-mid">
                “{vibeCheck.bio}”
              </p>
            )}

            {/* Full type card: decodes the archetype code and surfaces the
                per-dog description the model writes — previously only the
                name rendered anywhere, in the compact eyebrow above. */}
            {vibeCheck?.archetype && (
              <div className="px-5 pb-4 -mt-1">
                <VibeTypeCard archetype={vibeCheck.archetype} />
              </div>
            )}

            {/* Founding Pack + trust + Founding Member badges — computed/granted
                server-side, none shown before now: a database field with no UI
                is worse than not having the feature. See getFoundingPackPitch
                for why we never show a raw trust score (it reads as a public
                rating; a positive "would meet again" rate is the honest,
                non-gameable framing instead). */}
            {(typeof savedProfile.foundingPackNumber === 'number' || (savedProfile.ratingCount ?? 0) > 0 || hasLifetime || bestFriendName) && (
              <div className="flex flex-wrap gap-2 px-5 pb-4 -mt-1">
                {typeof savedProfile.foundingPackNumber === 'number' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 border border-gold/40 px-3 py-1.5 text-xs font-bold text-brown">
                    🏅 Founding Pack #{savedProfile.foundingPackNumber}
                  </span>
                )}
                {hasLifetime && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brown text-cream px-3 py-1.5 text-xs font-bold">
                    ⭐ Founding Member
                  </span>
                )}
                {bestFriendName && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-800">
                    ⭐ Best Friends with {bestFriendName}
                  </span>
                )}
                {(savedProfile.ratingCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-800">
                    🐾 {Math.round((savedProfile.meetAgainRate ?? 0) * 100)}% would meet again
                    <span className="font-normal text-green-700">
                      ({savedProfile.ratingCount} playdate{savedProfile.ratingCount === 1 ? '' : 's'} rated)
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Photo strip */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.slice(1).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt={`${name} photo ${i + 2}`}
                className="w-24 h-24 rounded-2xl object-cover shrink-0 border border-border"
              />
            ))}
          </div>
        )}

        {/* Profile details card */}
        {savedProfile && (
          <div className="card rounded-[1.8rem] divide-y divide-border">
            {[
              { label: 'Name',          value: savedProfile.name           },
              { label: 'Breed',         value: savedProfile.breed          },
              { label: 'Age',           value: savedProfile.age            },
              { label: 'Size',          value: savedProfile.size           },
              { label: 'Energy',        value: savedProfile.energyLevel !== undefined ? `${savedProfile.energyLevel}%` : undefined },
              { label: 'Neighborhood',  value: savedProfile.location       },
              { label: 'Vaccinated',    value: savedProfile.vaccinated ? 'Yes ✅' : 'Not yet' },
            ].map(({ label, value }) => value ? (
              <div key={label} className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-brown-light">{label}</span>
                <span className="text-sm font-semibold text-brown capitalize">{value}</span>
              </div>
            ) : null)}

            {/* Temperament */}
            {(savedProfile.temperament?.length ?? 0) > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm text-brown-light mb-2">Temperament</p>
                <div className="flex flex-wrap gap-1.5">
                  {savedProfile.temperament!.map((t) => (
                    <span key={t} className="chip text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Play styles */}
            {(savedProfile.playStyles?.length ?? 0) > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm text-brown-light mb-2">Play style</p>
                <div className="flex flex-wrap gap-1.5">
                  {savedProfile.playStyles.map((s) => (
                    <span key={s} className="chip text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {complete && (
            <button
              onClick={() => router.push('/app')}
              className="btn-primary py-3 shadow-lg"
            >
              Start Swiping 🐾
            </button>
          )}

          {/* For a household member this is a real but secondary option —
              they were invited to help with someone else's dog, so it
              shouldn't be the loudest button on their page. */}
          <button
              onClick={() => setShowEdit(true)}
              className={householdOnly ? 'btn-secondary py-3' : 'btn-primary py-3 shadow-lg'}
            >
            {savedProfile ? 'Edit Profile' : householdOnly ? 'Add a dog of your own' : 'Create Profile'}
          </button>

          <div className="card rounded-[1.8rem] divide-y divide-border">
            {/* Account info */}
            {authUser?.email && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm text-brown-light">Account</span>
                <span className="text-sm text-brown truncate max-w-[60%]">{authUser.email}</span>
              </div>
            )}

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              <span>→</span>
            </button>

            {/* Delete account */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-brown-light hover:text-red-600 hover:bg-red-50 transition-colors rounded-b-2xl"
              >
                <span>Delete account</span>
                <span>→</span>
              </button>
            ) : (
              <div className="px-4 py-4 rounded-b-2xl bg-red-50/60">
                <p className="text-sm font-semibold text-red-700">Delete your account permanently?</p>
                <p className="mt-1 text-xs leading-relaxed text-brown-light">
                  This removes your dog&apos;s profile, all matches, messages, and swipe history.
                  Chat unlock purchases are not refunded. This cannot be undone.
                </p>
                {deleteError && <p className="mt-2 text-xs text-red-600">{deleteError}</p>}
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
                    className="rounded-full px-4 py-2 text-xs font-semibold text-brown-light hover:text-brown disabled:opacity-50"
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
              className="text-center text-xs text-brown-light hover:text-brown transition-colors py-2"
            >
              ← Back to discover
            </Link>
          )}
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
            sibling to scroll past never gets the chance to un-stick. */}
        <div className="contents lg:flex lg:flex-col lg:gap-5 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">

        {/* Trading card share */}
        {savedProfile && complete && (
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
              <Link
                href={`/d/${toDogSlug(savedProfile.name, authUser.uid)}`}
                target="_blank"
                className="text-xs text-brown-light hover:text-brown transition-colors"
              >
                View {savedProfile.name}&apos;s public page →
              </Link>
            )}
          </div>
        )}

        {/* The Handoff Card — the sitter/walker/groomer care sheet. Gated on
            savedProfile only, NOT on `complete`: unlike the trading card this
            has nothing to do with swiping, so a profile missing a third photo
            or a neighborhood still has a perfectly useful care sheet. */}
        {savedProfile && (
          <div className="card rounded-[1.8rem] flex flex-col items-center gap-4 px-5 py-5">
            <div className="self-start">
              <p className="text-sm font-semibold text-brown">Handoff card</p>
              <p className="mt-0.5 text-xs leading-relaxed text-brown-light">
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
        )}

        {/* Cadence — reminders, kept visible even on an incomplete profile
            since it's useful with just a saved dog and doesn't need a
            match/swipe to have value. */}
        {authUser && savedProfile && (
          <RemindersSection dogId={authUser.uid} reminders={reminders} />
        )}

        {savedProfile && (
          <HouseholdSection
            dogName={savedProfile.name}
            memberIds={savedProfile.householdMemberIds ?? []}
            memberNames={savedProfile.householdMemberNames}
          />
        )}

        {/* Founding Member CTA. Lives here rather than only inside the chat
            paywall: that CTA was nested in a !canChat block, so turning chat
            free removed the last reachable purchase path in the whole product.
            The profile is always reachable and doesn't interrupt a
            conversation to sell something. */}
        {/* Not shown to a dogless household member: every benefit it sells
            (chat unlocks, Founding Pack number) attaches to a dog they don't
            have. */}
        {authUser && !householdOnly && !hasLifetime && getFoundingMemberLink(authUser.uid) && (
          <a
            href={getFoundingMemberLink(authUser.uid)!}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent('founding_member_cta_click', { source: 'profile' })}
            className="card block rounded-[1.8rem] border border-gold/40 bg-gold/10 px-4 py-4 transition-colors hover:bg-gold/20"
          >
            <p className="text-sm font-bold text-brown">⭐ Become a Founding Member — $39 once</p>
            <p className="mt-1 text-xs leading-relaxed text-brown-light">
              {getFoundingPackPitch()}
            </p>
          </a>
        )}

        </div>
        {/* ── /Right column ──────────────────────────────────────────────── */}

      </div>
      </div>
    </div>
  );
}
