'use client';
// web/app/app/places/[id]/page.tsx
// One place: its count line (once 3+ owners use it), a map link, and, for a
// park, how many Pack Days happened there with links to the upcoming ones.
// Every Pack Day location has a page, even before anyone tags it.
// Mirrors mobile/app/places/[id].tsx.

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../../lib/auth';
import type { User } from '../../../../lib/auth';
import { getPublicPlace, listCityPackDays, reportPlace } from '../../../../lib/places';
import type { CityPackDay, PublicPlace } from '../../../../lib/places';
import { formatPackDayWhen } from '../../../../../shared/packDay';
import { isPlaceCategory, nearbyLine, packDayParks, PLACE_CATEGORIES } from '../../../../../shared/places';
import type { PackDayPark } from '../../../../../shared/places';
import SignInGate from '../../../../components/SignInGate';

function PlaceInner() {
  const rawId = useParams<{ id: string }>().id;
  const id = decodeURIComponent(rawId ?? '');
  const search = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [place, setPlace] = useState<PublicPlace | null>(null);
  const [park, setPark] = useState<PackDayPark<CityPackDay> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, categoryKey, nameSlug] = id.split('__');
  const category = isPlaceCategory(categoryKey) ? categoryKey : null;
  const cityParam = search.get('city') ?? '';

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthLoading(false); });
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    (async () => {
      try {
        const pub = await getPublicPlace(id);
        const city = pub?.city ?? cityParam;
        const events = category === 'park' && city ? await listCityPackDays(city) : [];
        if (!active) return;
        setPlace(pub);
        setPark(packDayParks(events, Date.now()).find((p) => p.slug === nameSlug) ?? null);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [user, id, category, nameSlug, cityParam]);

  if (authLoading) return <p role="status" className="py-24 text-center font-extrabold text-brown-mid">Loading…</p>;
  if (!user) return <SignInGate title="Sign in to see this place" />;

  const name = place?.name ?? search.get('name') ?? '';
  const line = place ? nearbyLine(place.ownerCount, name) : null;

  async function handleReport() {
    if (!user) return;
    setNotice((await reportPlace(user.uid, id)) ? 'Report sent. Thanks, we review every report within 24 hours.' : 'That didn’t go through. Please check your connection and try again.');
  }

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-3 px-4">
        <Link href="/app/places" className="min-h-[44px] inline-flex items-center text-[15px] font-black text-brown underline underline-offset-2">← Places</Link>
        <h1 className="font-display text-[26px] leading-none text-brown">{category ? PLACE_CATEGORIES[category].label : 'Place'}</h1>
      </header>
      <div className="space-y-4 p-4 lg:mx-auto lg:max-w-2xl lg:px-8 lg:py-8">
        {!loaded && !error && <p role="status" className="py-6 text-center font-extrabold text-brown-mid">Loading…</p>}
        {error && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown">We couldn’t load this place. Check your connection and try again.</p>}
        {loaded && !error && !name && <p className="card p-4 text-[15px] font-extrabold text-brown-mid">This place isn’t listed any more.</p>}
        {loaded && !!name && (
          <>
            <div className="card space-y-2 p-5">
              <h2 className="break-words font-display text-[26px] leading-tight text-brown">{name}</h2>
              <p className="text-[15px] font-extrabold text-brown-mid">{line ?? 'Not enough owners yet to show a count.'}</p>
              {place?.mapUrl && /^https?:\/\//i.test(place.mapUrl) && (
                <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-block min-h-[44px] py-2 text-[15px] font-black text-brown underline underline-offset-2">Open in Maps</a>
              )}
            </div>

            {category === 'park' && (
              <div className="card space-y-2 p-5">
                <h3 className="font-display text-[20px] leading-none text-brown">Pack Days here</h3>
                <p className="text-[15px] font-bold text-brown">
                  {park && park.held > 0 ? `${park.held} Pack Day${park.held === 1 ? '' : 's'} held here so far.` : 'No Pack Days held here yet.'}
                </p>
                {park?.upcoming.map((e) => (
                  <Link key={e.id} href={`/app/pack/${e.id}`} className="block min-h-[44px] py-2 text-[15px] font-black text-brown underline underline-offset-2">
                    {formatPackDayWhen(e)} · {e.title}
                  </Link>
                ))}
                {park && park.upcoming.length === 0 && <p className="text-[13px] font-extrabold text-brown-mid">Nothing coming up. Host one from the Pack tab.</p>}
              </div>
            )}

            {place && (
              <button type="button" onClick={() => void handleReport()} className="btn-secondary min-h-[44px] px-4 py-1.5 text-[15px]">Report this place</button>
            )}
            {notice && <p role="status" className="text-[15px] font-extrabold text-brown-mid">{notice}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function PlacePage() {
  return <Suspense fallback={null}><PlaceInner /></Suspense>;
}
