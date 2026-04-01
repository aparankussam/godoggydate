'use client';
// web/app/app/profile/page.tsx
// Profile tab — shows the current user's dog profile and account controls.
// Always redirects unauthenticated users to the landing page.
// Provides: edit profile, sign out, and a link back to discover.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  onAuthStateChanged,
  signOutUser,
  getUserDogProfile,
  isProfileComplete,
  saveUserDogProfile,
} from '../../../lib/auth';
import { getFirebase } from '../../../shared/utils/firebase';
import type { User, SavedDogProfile } from '../../../lib/auth';
import DogProfileForm from '../../../components/DogProfileForm';
import { getRenderablePhotos } from '../../../lib/photos';

export default function ProfilePage() {
  const router = useRouter();

  const [authUser,     setAuthUser]     = useState<User | null>(null);
  const [savedProfile, setSavedProfile] = useState<SavedDogProfile | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [showEdit,     setShowEdit]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [signingOut,   setSigningOut]   = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);

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

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutUser();
    } finally {
      router.replace('/');
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

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center">
        <span className="font-display text-xl text-brown">🐕 Profile</span>
      </header>

      <div className="max-w-md mx-auto px-5 py-6 flex flex-col gap-5">

        {/* Profile incomplete warning */}
        {!complete && savedProfile && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-800">
            <p className="font-semibold mb-1">Profile incomplete</p>
            <p className="text-xs">
              Add your dog&apos;s breed, age, neighbourhood, and at least one personality tag to unlock swiping.
            </p>
          </div>
        )}

        {/* No profile yet */}
        {!savedProfile && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="text-6xl">🐾</span>
            <p className="font-display text-2xl text-brown">No profile yet</p>
            <p className="text-brown-light text-sm">Set up your dog&apos;s profile to start swiping.</p>
          </div>
        )}

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
              { label: 'Neighbourhood', value: savedProfile.location       },
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

          <button
            onClick={() => setShowEdit(true)}
            className="btn-primary py-3 shadow-lg"
          >
            {savedProfile ? 'Edit Profile' : 'Create Profile'}
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
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 rounded-b-2xl"
            >
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              <span>→</span>
            </button>
          </div>

          <Link
            href="/app"
            className="text-center text-xs text-brown-light hover:text-brown transition-colors py-2"
          >
            ← Back to discover
          </Link>
        </div>
      </div>
    </div>
  );
}
