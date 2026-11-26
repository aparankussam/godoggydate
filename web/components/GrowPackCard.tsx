'use client';
// web/components/GrowPackCard.tsx
// "Grow Kaju's pack": under a short Matches list, the next real steps to more
// matches. Every line is built from real data (dogs not yet seen, the next
// Pack Day in town) or a real action (invite, Dogtype collection); a line with
// nothing true to say is left out. Mirrors mobile/components/GrowPackCard.tsx.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getUserDogProfile } from '../lib/auth';
import type { SavedDogProfile } from '../lib/auth';
import { DEFAULT_DISCOVER_RADIUS_MILES, DISCOVER_RADIUS_OPTIONS, loadDiscoverDeck } from '../lib/discover';
import { listUpcomingPackDays } from '../lib/packDay';
import { formatPackDayWhen, type PackDay } from '../../shared/packDay';
import { toFullProfile } from '../../shared/profile';
import { trackEvent } from '../lib/analytics';

/** Below this many matches the card shows; past it the list is busy enough. */
export const GROW_PACK_BELOW = 5;
const RADIUS_KEY = 'gdd.discover.radius'; // the radius Discover remembers in this browser

function savedRadius(): number {
  try {
    const saved = Number(window.localStorage.getItem(RADIUS_KEY));
    return (DISCOVER_RADIUS_OPTIONS as readonly number[]).includes(saved) ? saved : DEFAULT_DISCOVER_RADIUS_MILES;
  } catch {
    return DEFAULT_DISCOVER_RADIUS_MILES;
  }
}

interface Row { key: string; icon: string; title: string; body: string; href?: string; onClick?: () => void }

export default function GrowPackCard({ uid }: { uid: string }) {
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [feed, setFeed] = useState<{ unseen: number; beyond: number; radius: number } | null>(null);
  const [packDay, setPackDay] = useState<PackDay | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await getUserDogProfile(uid).catch(() => null);
      if (!active) return;
      setProfile(saved);
      if (!saved) return;
      const radiusMiles = savedRadius();
      loadDiscoverDeck(uid, toFullProfile(saved, uid), { radiusMiles, city: saved.city, state: saved.state })
        .then((deck) => {
          if (active) setFeed({ unseen: deck.dogs.length, beyond: deck.scope === 'radius' ? deck.beyondRadiusCount ?? 0 : 0, radius: radiusMiles });
        })
        .catch(() => { /* the swipe line just stays out */ });
      const here = saved.city?.trim().toLowerCase();
      listUpcomingPackDays()
        .then((list) => { if (active) setPackDay(list.find((e) => !here || e.city.trim().toLowerCase() === here) ?? null); })
        .catch(() => { if (active) setPackDay(null); });
    })();
    return () => { active = false; };
  }, [uid]);

  const name = profile?.name?.trim() || 'your dog';
  const city = profile?.city?.trim() || '';

  async function invite() {
    trackEvent('grow_pack_click', { target: 'invite' });
    const text = `${name} is on GoDoggyDate, playdates for dogs nearby. Come find us:`;
    const url = 'https://godoggydate.com';
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* cancelled */ }
  }

  const rows: Row[] = [];
  if (feed && feed.unseen > 0) {
    rows.push({ key: 'swipe', icon: '🐾', title: 'Keep swiping', href: '/app',
      body: `${feed.unseen} ${feed.unseen === 1 ? 'dog' : 'dogs'} near you that you haven’t seen yet.` });
  } else if (feed && feed.beyond > 0) {
    rows.push({ key: 'widen', icon: '🧭', title: 'Look a little farther', href: '/app',
      body: `You’ve seen everyone within ${feed.radius} mi. ${feed.beyond} more ${feed.beyond === 1 ? 'dog is' : 'dogs are'} just past that.` });
  }
  rows.push({ key: 'invite', icon: '💌', title: copied ? 'Link copied' : 'Invite a friend', onClick: invite,
    body: `Know a dog ${name} gets along with? Invite their human.` });
  if (packDay) {
    rows.push({ key: 'packday', icon: '🌳', title: 'Meet dogs at a Pack Day', href: `/app/pack/${packDay.id}`,
      body: `${packDay.title} · ${formatPackDayWhen(packDay)}` });
  } else if (packDay === null) {
    rows.push({ key: 'host', icon: '🌳', title: 'Meet dogs at a Pack Day', href: '/app/pack',
      body: city ? `Host the first one in ${city}. Six dogs is a great Pack Day.` : 'Host one at your usual park. Six dogs is a great Pack Day.' });
  }
  rows.push({ key: 'dogtypes', icon: '✨', title: 'Collect Dogtypes', href: '/app/profile?tab=dogtype',
    body: 'Every match reveals their Dogtype. See how many you’ve found.' });

  const inner = (row: Row) => (
    <>
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brown bg-note">{row.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-black text-brown">{row.title}</span>
        <span className="block text-[13px] font-bold leading-snug text-brown-mid">{row.body}</span>
      </span>
      <span aria-hidden="true" className="text-brown">›</span>
    </>
  );

  return (
    <section className="card rounded-[1.4rem] p-4 lg:col-span-full" aria-labelledby="grow-pack-h">
      <h2 id="grow-pack-h" className="mb-1 font-display text-[22px] leading-none text-brown">Grow {name}&apos;s pack</h2>
      {rows.map((row) =>
        row.href ? (
          <Link key={row.key} href={row.href} onClick={() => trackEvent('grow_pack_click', { target: row.key })} className="flex min-h-[52px] items-center gap-3 py-2.5">
            {inner(row)}
          </Link>
        ) : (
          <button key={row.key} type="button" onClick={row.onClick} className="flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left">
            {inner(row)}
          </button>
        ),
      )}
    </section>
  );
}
