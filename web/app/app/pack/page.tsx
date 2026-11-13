'use client';
// web/app/app/pack/page.tsx
// Pack Days — open group playdates at a public place. A swipe deck needs a
// crowd; one meetup needs about six dogs, so this is how a small community
// gets its first real playdates. The nav shell comes from app/app/layout.tsx.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete } from '../../../lib/auth';
import type { User, SavedDogProfile } from '../../../lib/auth';
import { listUpcomingPackDays } from '../../../lib/packDay';
import { getBlockedUserIds } from '../../../lib/blocks';
import { trackEvent } from '../../../lib/analytics';
import PackDayCard from '../../../components/PackDayCard';
import type { PackDay } from '../../../../shared/packDay';

export default function PackDaysPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [events, setEvents] = useState<PackDay[] | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    trackEvent('packday_list_open', {});
    Promise.all([
      getUserDogProfile(authUser.uid).catch(() => null),
      listUpcomingPackDays(),
      getBlockedUserIds(authUser.uid),
    ])
      .then(([dog, list, blockedIds]) => {
        if (!active) return;
        setProfile(dog);
        setEvents(list);
        setBlocked(blockedIds);
      })
      .catch(() => {
        if (active) setError("We couldn't load Pack Days. Check your connection and try again.");
      });
    return () => { active = false; };
  }, [authUser]);

  const { mine, nearby, elsewhere } = useMemo(() => {
    const uid = authUser?.uid ?? '';
    const visible = (events ?? []).filter((e) => !blocked.has(e.hostUid));
    const city = profile?.city?.trim().toLowerCase();
    const isMine = (e: PackDay) => e.hostUid === uid || e.attendeeUids.includes(uid);
    return {
      mine: visible.filter(isMine),
      nearby: visible.filter((e) => !isMine(e) && (!city || e.city.trim().toLowerCase() === city)),
      elsewhere: visible.filter((e) => !isMine(e) && city && e.city.trim().toLowerCase() !== city),
    };
  }, [events, blocked, authUser, profile]);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">🌳</span>
        <p className="font-display text-2xl text-brown">Sign in to find a Pack Day</p>
        <Link href="/app" className="btn-primary px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  const canHost = isProfileComplete(profile);

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center justify-between">
        <span className="font-display text-xl text-brown">🌳 Pack Days</span>
        {canHost && (
          <Link href="/app/pack/new" className="btn-primary px-4 py-1.5 text-sm">Host one</Link>
        )}
      </header>

      <div className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-6">
        <p className="text-sm text-brown-mid leading-relaxed">
          Open group playdates at a public place. Show up with your dog, meet the neighbors, and find the
          dogs yours actually clicks with. Free to join.
        </p>

        {!canHost && events && (
          <div className="rounded-2xl border border-border bg-white p-5 text-center">
            <p className="font-display text-lg text-brown">Add your dog to join in</p>
            <p className="mt-1 text-sm text-brown-mid">Finish your dog&apos;s profile to RSVP or host a Pack Day.</p>
            <Link href="/app" className="btn-primary inline-block mt-3 px-6 py-2.5">Set up my dog</Link>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {!events && !error && (
          <div className="flex items-center justify-center py-16">
            <span className="text-3xl animate-spin">🐾</span>
          </div>
        )}

        {mine.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light">Yours</h2>
            {mine.map((e) => (
              <PackDayCard key={e.id} event={e} badge={e.hostUid === authUser.uid ? 'hosting' : 'going'} />
            ))}
          </section>
        )}

        {events && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light">
              {profile?.city ? `Coming up in ${profile.city}` : 'Coming up'}
            </h2>
            {nearby.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-white/60 p-6 text-center">
                <span className="text-4xl">🦮</span>
                <p className="mt-2 font-display text-lg text-brown">Nothing on the calendar yet</p>
                <p className="mt-1 text-sm text-brown-mid leading-relaxed">
                  Pick your usual park and a Saturday morning, and host the first one. Six dogs is a great
                  Pack Day.
                </p>
                {canHost && (
                  <Link href="/app/pack/new" className="btn-primary inline-block mt-4 px-6 py-2.5">
                    Host a Pack Day
                  </Link>
                )}
              </div>
            ) : (
              nearby.map((e) => <PackDayCard key={e.id} event={e} />)
            )}
          </section>
        )}

        {elsewhere.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light">Other cities</h2>
            {elsewhere.map((e) => <PackDayCard key={e.id} event={e} />)}
          </section>
        )}
      </div>
    </div>
  );
}
