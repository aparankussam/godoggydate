'use client';
// web/app/app/fun/page.tsx
// "Just for fun" — the hub for the shareable toy cards built entirely from a
// dog's own profile: the Wanted Poster and the Adventure Passport. Both are
// N=1 share-objects (no other users required) and honest by construction — the
// Wanted charges are real profile traits played for laughs, the passport count
// is the owner's own self-logged checklist. Skips Snoot Boop (mobile-only toy).
//
// Mirrors the auth/profile-load scaffolding of the other /app/* pages; the nav
// shell comes from app/app/layout.tsx (AppLayoutShell).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../lib/auth';
import type { User, SavedDogProfile } from '../../../lib/auth';
import { trackEvent } from '../../../lib/analytics';
import WantedPosterWeb from '../../../components/WantedPosterWeb';
import AdventurePassportWeb from '../../../components/AdventurePassportWeb';
import RoastSection from '../../../components/RoastSection';
import HumanReviewSection from '../../../components/HumanReviewSection';
import ApologySection from '../../../components/ApologySection';
import TextsSection from '../../../components/TextsSection';
import DogQuizSection from '../../../components/DogQuizSection';
import PlaqueCard from '../../../components/PlaqueCard';

export default function FunPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [savedProfile, setSavedProfile] = useState<SavedDogProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // ── Auth observer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Load the dog profile once the user is known ─────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    let active = true;
    setProfileLoading(true);
    getUserDogProfile(authUser.uid)
      .then((p) => { if (active) setSavedProfile(p); })
      .catch(() => { if (active) setSavedProfile(null); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [authUser]);

  useEffect(() => { trackEvent('fun_hub_open', {}); }, []);

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  // ── Not signed in ───────────────────────────────────────────────────────────
  if (!authUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">🤠</span>
        <p className="font-display text-2xl text-brown">Sign in to make your dog&apos;s fun cards</p>
        <Link href="/app" className="btn-primary px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center">
        <span className="font-display text-xl text-brown">🎉 The Playroom</span>
      </header>

      <div className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-5">
        <p className="text-sm text-brown-mid leading-relaxed">
          Playful, shareable cards built from {savedProfile?.name?.trim() || 'your dog'}&apos;s own profile — no other
          dogs required. Every card is honest: the jokes are made of true things.
        </p>

        {/* Quick links to each toy */}
        <div className="flex flex-wrap gap-2">
          <a href="#wanted" className="rounded-full border border-border bg-white px-3.5 py-1.5 text-sm font-bold text-brown hover:border-primary/40 transition-colors motion-reduce:transition-none">
            🤠 Wanted Poster
          </a>
          <a href="#passport" className="rounded-full border border-border bg-white px-3.5 py-1.5 text-sm font-bold text-brown hover:border-primary/40 transition-colors motion-reduce:transition-none">
            🗺️ Adventure Passport
          </a>
        </div>

        {profileLoading && !savedProfile && (
          <div className="flex items-center justify-center py-16">
            <span className="text-3xl animate-spin">🐾</span>
          </div>
        )}

        {/* No dog yet — send them to build one first. */}
        {!profileLoading && !savedProfile && (
          <div className="rounded-2xl border border-border bg-white p-6 text-center">
            <span className="text-5xl">🐶</span>
            <p className="mt-3 font-display text-xl text-brown">Add your dog first</p>
            <p className="mt-1 text-sm text-brown-mid leading-relaxed">
              The fun cards are built from your dog&apos;s profile. Set one up and come back — a Wanted Poster and
              Adventure Passport will be waiting.
            </p>
            <Link href="/app/profile" className="btn-primary inline-block mt-4 px-6 py-2.5">Go to profile</Link>
          </div>
        )}

        {savedProfile && (
          <>
            <RoastSection savedProfile={savedProfile} />
            <ApologySection savedProfile={savedProfile} />
            <TextsSection savedProfile={savedProfile} />
            <HumanReviewSection savedProfile={savedProfile} userId={authUser.uid} />
            <DogQuizSection savedProfile={savedProfile} />
            <PlaqueCard savedProfile={savedProfile} />
            <div id="wanted" className="scroll-mt-20">
              <WantedPosterWeb savedProfile={savedProfile} dogId={authUser.uid} />
            </div>
            <div id="passport" className="scroll-mt-20">
              <AdventurePassportWeb savedProfile={savedProfile} dogId={authUser.uid} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
