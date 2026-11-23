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
import { PawIcon, TreeIcon } from '../../../components/PackDayFlyer';
import SignInGate from '../../../components/SignInGate';

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
        <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawIcon size={36} /></span>
      </div>
    );
  }

  if (!authUser) {
    return (
      <SignInGate emoji="🌳" title="Sign in to find a Pack Day" />
    );
  }

  const canHost = isProfileComplete(profile);

  return (
    <div className="min-h-screen">
      <header className="px-4 h-14 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-[26px] leading-none text-brown">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 -rotate-[8deg] items-center justify-center rounded-full border-2 border-brown bg-cream text-brown shadow-[0_3px_0_rgba(42,31,74,0.28)]"
          >
            <TreeIcon size={18} />
          </span>
          Pack Days
        </h1>
        {canHost && nearby.length + mine.length + elsewhere.length > 0 && (
          <Link href="/app/pack/new" className="btn-secondary inline-flex min-h-[44px] items-center px-4 py-1.5 text-[15px]">Host one</Link>
        )}
      </header>

      <div className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-6">
        <p className="text-[15px] font-extrabold text-brown leading-snug">
          Open group playdates at a public place. Show up with your dog, meet the neighbors, and find the
          dogs yours actually clicks with. Free to join.
        </p>

        {!canHost && events && (
          <div className="card p-5 text-center">
            <p className="font-display text-2xl text-brown">Add your dog to join in</p>
            <p className="mt-1 text-[15px] font-extrabold text-brown-mid">Finish your dog&apos;s profile to RSVP or host a Pack Day.</p>
            <Link href="/app" className="btn-primary inline-flex min-h-[52px] items-center mt-3 px-6 py-2.5">Set up my dog</Link>
          </div>
        )}

        {error && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown">{error}</p>}

        {!events && !error && (
          <div className="flex items-center justify-center py-16">
            <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawIcon size={32} /></span>
          </div>
        )}

        {mine.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-[22px] leading-none text-brown">Yours</h2>
            {mine.map((e) => (
              <PackDayCard key={e.id} event={e} badge={e.hostUid === authUser.uid ? 'hosting' : 'going'} />
            ))}
          </section>
        )}

        {events && (
          <section className="space-y-3">
            <h2 className="font-display text-[22px] leading-none text-brown">
              {profile?.city ? `Coming up in ${profile.city}` : 'Coming up'}
            </h2>
            {nearby.length === 0 ? (
              <div className="card p-6 text-center">
                <span className="inline-flex text-brown" aria-hidden="true"><TreeIcon size={40} /></span>
                <p className="mt-2 font-display text-2xl text-brown">Nothing on the calendar yet</p>
                <p className="mt-1 text-[15px] font-extrabold text-brown-mid leading-snug">
                  Pick your usual park and a Saturday morning, and host the first one. Six dogs is a great
                  Pack Day.
                </p>
                {canHost && (
                  <Link href="/app/pack/new" className="btn-primary inline-flex min-h-[52px] items-center mt-4 px-6 py-2.5">
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
            <h2 className="font-display text-[22px] leading-none text-brown">Other cities</h2>
            {elsewhere.map((e) => <PackDayCard key={e.id} event={e} />)}
          </section>
        )}
      </div>
    </div>
  );
}
