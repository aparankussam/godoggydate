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
import { listPackGroups } from '../../../lib/packGroup';
import { packGroupScheduleLabel } from '../../../../shared/packGroup';
import type { PackGroup } from '../../../../shared/packGroup';
import { getBlockedUserIds } from '../../../lib/blocks';
import { trackEvent } from '../../../lib/analytics';
import PackDayCard from '../../../components/PackDayCard';
import CityFeed from '../../../components/CityFeed';
import type { PackDay } from '../../../../shared/packDay';
import { PawIcon, TreeIcon } from '../../../components/PackDayFlyer';
import SignInGate from '../../../components/SignInGate';
import WhereWeGoSection from '../../../components/WhereWeGoSection';
import LostDogButton from '../../../components/LostDogButton';
import { Icon, type IconName } from '../../../components/icons';

// Same three views, labels and blurbs as the iPhone Pack Days tab.
const VIEWS: { id: 'days' | 'feed' | 'spots'; label: string; blurb: string }[] = [
  { id: 'days', label: 'Pack Days', blurb: 'Open group playdates at a public place. Show up with your dog, meet the neighbors, and find the dogs yours actually clicks with. Free to join.' },
  { id: 'feed', label: 'Neighbarkhood', blurb: 'Barks from dog people nearby: ask the Pack, give something away, find a walk buddy.' },
  { id: 'spots', label: 'Sniff Spots', blurb: 'The vets, groomers and parks your Pack uses. Tag yours; no reviews, just a count.' },
];

// Why hosting is worth the one tap — under the empty "Host the first one" card.
const HOST_BENEFITS: { icon: IconName; text: string }[] = [
  { icon: 'check', text: 'Free to host' },
  { icon: 'calendar', text: 'Pick a park and a time' },
  { icon: 'bell', text: 'We tell nearby dog owners for you' },
];

// Behind the "How hosting works" disclosure in the empty-state card.
const HOST_STEPS: { icon: IconName; text: string }[] = [
  { icon: 'calendar', text: 'Pick a place and a time — your usual park, any morning.' },
  { icon: 'bell', text: 'We notify dog owners nearby when you post it.' },
  { icon: 'heart', text: 'Show up, meet dogs, and maybe find your next match.' },
];

// While Pack Days is quiet, two ways in to the other tabs on this screen.
const nudgeRows = (city?: string): { icon: IconName; title: string; view: 'feed' | 'spots' }[] => [
  { icon: 'chat', title: 'Say hi in the Neighbarkhood', view: 'feed' },
  { icon: 'map-marker', title: city ? `See where other dogs in ${city} go` : 'See where other dogs go', view: 'spots' },
];

export default function PackDaysPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [events, setEvents] = useState<PackDay[] | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<{ mine: PackGroup[]; discover: PackGroup[] }>({ mine: [], discover: [] });
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'days' | 'feed' | 'spots'>('days');
  const [showHostSteps, setShowHostSteps] = useState(false);

  // The tab lives in ?view= so a refresh, a shared link or the Places back link lands on it.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'feed' || v === 'spots') setView(v);
  }, []);
  const pickView = (v: 'days' | 'feed' | 'spots') => {
    setView(v);
    window.history.replaceState(null, '', v === 'days' ? '/app/pack' : `/app/pack?view=${v}`);
  };

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
      // Groups are a bonus on this screen: if they can't load, the list still shows.
      listPackGroups(authUser.uid).catch(() => ({ mine: [], discover: [] })),
    ])
      .then(([dog, list, blockedIds, loadedGroups]) => {
        if (!active) return;
        setProfile(dog);
        setEvents(list);
        setBlocked(blockedIds);
        setGroups(loadedGroups);
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
  const city = profile?.city?.trim().toLowerCase();
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const nearbyGroups = groups.discover.filter((g) => !blocked.has(g.hostUid) && (!city || g.city.trim().toLowerCase() === city));

  return (
    <div className="min-h-screen">
      <header className="px-4 h-14 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 font-display text-[26px] leading-none text-brown">
          {current.label}
        </h1>
        {view === 'days' && canHost && nearby.length + mine.length + elsewhere.length > 0 && (
          <Link href="/app/pack/new" className="btn-secondary inline-flex min-h-[44px] items-center px-4 py-1.5 text-[15px]">Host one</Link>
        )}
      </header>

      <div className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-6">
        <p className="text-[15px] font-extrabold text-brown leading-snug">{current.blurb}</p>

        {/* One bordered track holding all three, so it reads as "pick one of
            these" rather than three separate buttons. */}
        <div role="tablist" aria-label="Pack Days sections" className="inline-flex gap-0.5 rounded-full border-2 border-brown bg-cream p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => pickView(v.id)}
              className={`min-h-[38px] rounded-full px-3 text-[14px] font-black transition-colors ${view === v.id ? 'bg-brown text-cream' : 'text-brown'}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === 'feed' && (
          <>
            <LostDogButton uid={authUser.uid} dogName={profile?.name?.trim() || 'Your dog'} />
            <CityFeed uid={authUser.uid} city={profile?.city?.trim() || undefined} canPost={canHost} blocked={blocked} />
          </>
        )}

        {view === 'spots' && <WhereWeGoSection uid={authUser.uid} city={profile?.city} />}

        {view === 'days' && !canHost && events && (
          <div className="card p-5 text-center">
            <p className="font-display text-2xl text-brown">Add your dog to join in</p>
            <p className="mt-1 text-[15px] font-extrabold text-brown-mid">Finish your dog&apos;s Pupfile to RSVP or host a Pack Day.</p>
            <Link href="/app" className="btn-primary inline-flex min-h-[52px] items-center mt-3 px-6 py-2.5">Set up my dog</Link>
          </div>
        )}

        {view === 'days' && error && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown">{error}</p>}

        {view === 'days' && !events && !error && (
          <div className="flex items-center justify-center py-16">
            <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawIcon size={32} /></span>
          </div>
        )}

        {view === 'days' && mine.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-[22px] leading-none text-brown">Yours</h2>
            {mine.map((e) => (
              <PackDayCard key={e.id} event={e} badge={e.hostUid === authUser.uid ? 'hosting' : 'going'} />
            ))}
          </section>
        )}

        {view === 'days' && events && (
          <section className="space-y-3">
            <h2 className="font-display text-[22px] leading-none text-brown">
              {profile?.city ? `Coming up in ${profile.city}` : 'Coming up'}
            </h2>
            {nearby.length === 0 ? (
              <>
                <div className="card p-6 text-center">
                  <span className="inline-flex text-brown" aria-hidden="true"><TreeIcon size={40} /></span>
                  <p className="mt-2 font-display text-2xl text-brown">
                    {profile?.city ? `Host ${profile.city}’s first Pack Day` : 'Nothing on the calendar yet'}
                  </p>
                  <p className="mt-1 text-[15px] font-extrabold text-brown-mid leading-snug">
                    Pick your usual park and a Saturday morning, and host the first one. Six dogs is plenty.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-left">
                    {HOST_BENEFITS.map((b) => (
                      <li key={b.text} className="flex items-center gap-2 text-[13.5px] font-bold text-brown">
                        <Icon name={b.icon} size={16} />
                        {b.text}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setShowHostSteps((v) => !v)}
                    className="mt-2 block min-h-[36px] text-[13.5px] font-bold text-rose underline underline-offset-2"
                  >
                    {showHostSteps ? 'Hide how it works' : 'How hosting works'}
                  </button>
                  {showHostSteps && (
                    <ol className="mt-1 space-y-2.5 text-left">
                      {HOST_STEPS.map((s, i) => (
                        <li key={s.text} className="flex gap-2">
                          <Icon name={s.icon} size={15} className="mt-0.5 shrink-0 text-brown" />
                          <span className="text-[13px] font-semibold leading-snug text-brown-mid">
                            <span className="font-black text-brown">{i + 1}. </span>{s.text}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {canHost && (
                    <Link href="/app/pack/new" className="btn-primary inline-flex min-h-[52px] items-center mt-4 px-6 py-2.5">
                      Host a Pack Day
                    </Link>
                  )}
                </div>
                <div className="space-y-2">
                  {nudgeRows(profile?.city?.trim()).map((n) => (
                    <button
                      key={n.view}
                      type="button"
                      onClick={() => pickView(n.view)}
                      className="flex min-h-[48px] w-full items-center gap-2.5 rounded-2xl border-2 border-brown bg-cream px-3.5 text-left"
                    >
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-brown bg-note">
                        <Icon name={n.icon} size={18} className="text-brown" />
                      </span>
                      <span className="min-w-0 flex-1 text-[14px] font-bold text-brown">{n.title}</span>
                      <Icon name="chevron-right" size={18} className="text-brown" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              nearby.map((e) => <PackDayCard key={e.id} event={e} />)
            )}
          </section>
        )}

        {view === 'days' && elsewhere.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-[22px] leading-none text-brown">{nearby.length === 0 ? 'Upcoming in nearby cities' : 'Other cities'}</h2>
            {elsewhere.map((e) => <PackDayCard key={e.id} event={e} />)}
          </section>
        )}

        {view === 'days' && events && (groups.mine.length > 0 || nearbyGroups.length > 0 || canHost) && (
          <section className="space-y-3">
            <h2 className="font-display text-[22px] leading-none text-brown">Standing groups</h2>
            {[...groups.mine, ...nearbyGroups].map((g) => (
              <Link key={g.id} href={`/app/pack/group/${g.id}`} className="card block px-5 py-3.5">
                <p className="font-display text-[20px] leading-tight text-brown break-words">{g.name}</p>
                <p className="text-[13px] font-extrabold text-brown-mid">
                  {packGroupScheduleLabel(g)}{g.tags.length ? ` · ${g.tags.join(', ')}` : ''}{g.status === 'paused' ? ' · Paused' : ''}
                </p>
                <p className="text-[13px] font-extrabold text-brown-mid">
                  {g.memberUids.length} following{g.hostUid === authUser.uid ? ' · You host' : g.memberUids.includes(authUser.uid) ? ' · Following' : ''}
                </p>
              </Link>
            ))}
            {canHost && (
              <Link href="/app/pack/group/new" className="btn-secondary inline-flex min-h-[44px] items-center px-4 py-1.5 text-[15px]">Start a repeating group</Link>
            )}
          </section>
        )}

      </div>
    </div>
  );
}
