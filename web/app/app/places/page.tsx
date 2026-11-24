'use client';
// web/app/app/places/page.tsx
// "Where we go" for your city: the places other owners use, by category, with
// counts (shown only once 3+ owners use a place). Pack Day parks appear under
// Parks automatically. "Ask for a rec" pings owners in your city who tagged
// that category. Mirrors mobile/app/places/index.tsx.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../lib/auth';
import type { User, SavedDogProfile } from '../../../lib/auth';
import { askPlaceRec, listCityPackDays, listPlaces, placeErrorMessage } from '../../../lib/places';
import type { PublicPlace } from '../../../lib/places';
import { nearbyLine, packDayParks, placeCityKey, placeIdFor, PLACE_CATEGORIES, PLACE_CATEGORY_KEYS } from '../../../../shared/places';
import type { PlaceCategory } from '../../../../shared/places';
import SignInGate from '../../../components/SignInGate';

export default function PlacesPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [category, setCategory] = useState<PlaceCategory>('vet');
  const [places, setPlaces] = useState<PublicPlace[] | null>(null);
  const [parks, setParks] = useState<ReturnType<typeof packDayParks>>([]);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => { setAuthUser(user); setAuthLoading(false); });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    getUserDogProfile(authUser.uid).catch(() => null).then((p) => { setProfile(p); setProfileLoaded(true); });
  }, [authUser]);

  const city = profile?.city?.trim() ?? '';
  const state = profile?.state?.trim() ?? '';
  const cityKey = city && state ? placeCityKey(city, state) : null;

  useEffect(() => {
    if (!cityKey) return undefined;
    let active = true;
    setPlaces(null);
    setError(null);
    Promise.all([listPlaces(cityKey, category), category === 'park' ? listCityPackDays(city) : Promise.resolve([])])
      .then(([list, events]) => {
        if (!active) return;
        setPlaces(list);
        setParks(packDayParks(events, Date.now()));
      })
      .catch(() => { if (active) setError('We couldn’t load places. Check your connection and try again.'); });
    return () => { active = false; };
  }, [cityKey, city, category]);

  async function handleAsk() {
    setAsking(true);
    setNotice(null);
    try {
      await askPlaceRec(category);
      setNotice(`Asked. Neighbors who use a ${PLACE_CATEGORIES[category].noun} have been nudged. You’ll see their picks here as they tag them.`);
    } catch (err) {
      setNotice(placeErrorMessage(err, 'We couldn’t send that. Please try again.'));
    } finally {
      setAsking(false);
    }
  }

  if (authLoading) return <p role="status" className="py-24 text-center font-extrabold text-brown-mid">Loading…</p>;
  if (!authUser) return <SignInGate title="Sign in to see places near you" />;

  // A park that already has a public count page isn't listed twice.
  const listedIds = new Set((places ?? []).map((p) => p.placeId));
  const extraParks = parks.filter((p) => cityKey && !listedIds.has(placeIdFor(cityKey, 'park', p.name)));

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center gap-3 px-4">
        <Link href="/app/profile" className="min-h-[44px] inline-flex items-center text-[15px] font-black text-brown underline underline-offset-2">← Profile</Link>
        <h1 className="font-display text-[26px] leading-none text-brown">Where we go</h1>
      </header>
      <div className="space-y-4 p-4 lg:mx-auto lg:max-w-2xl lg:px-8 lg:py-8">
        {profileLoaded && !cityKey ? (
          <p className="card p-4 text-[15px] font-extrabold text-brown">Add your city and state to your dog’s profile to see places near you.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Place category">
              {PLACE_CATEGORY_KEYS.map((key) => (
                <button
                  key={key} type="button" onClick={() => setCategory(key)} aria-pressed={key === category}
                  className={`min-h-[44px] rounded-full border-2 border-brown px-4 text-[14px] font-black ${key === category ? 'bg-brown text-paper' : 'bg-cream text-brown'}`}
                >
                  {PLACE_CATEGORIES[key].emoji} {PLACE_CATEGORIES[key].label}
                </button>
              ))}
            </div>

            {error && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown">{error}</p>}
            {cityKey && !places && !error && <p role="status" className="py-6 text-center font-extrabold text-brown-mid">Loading…</p>}

            {places?.map((place) => (
              <Link key={place.placeId} href={`/app/places/${encodeURIComponent(place.placeId)}`} className="card block space-y-1 px-5 py-4">
                <p className="font-display text-[20px] leading-tight text-brown">{place.name}</p>
                <p className="text-[15px] font-extrabold text-brown-mid">{nearbyLine(place.ownerCount, 'this place')}</p>
              </Link>
            ))}
            {cityKey && extraParks.map((park) => {
              const total = park.held + park.upcoming.length;
              return (
                <Link
                  key={park.slug}
                  href={`/app/places/${encodeURIComponent(placeIdFor(cityKey, 'park', park.name))}?name=${encodeURIComponent(park.name)}&city=${encodeURIComponent(city)}`}
                  className="card block space-y-1 px-5 py-4"
                >
                  <p className="font-display text-[20px] leading-tight text-brown">{park.name}</p>
                  <p className="text-[15px] font-extrabold text-brown-mid">{total} Pack Day{total === 1 ? '' : 's'}</p>
                </Link>
              );
            })}
            {places && places.length === 0 && extraParks.length === 0 && (
              <p className="card p-4 text-[15px] font-extrabold text-brown-mid">
                No {PLACE_CATEGORIES[category].noun} has 3 owners yet, which is when we start showing a place. Tag yours from your profile to help it get there.
              </p>
            )}

            {cityKey && (
              <button type="button" onClick={() => void handleAsk()} disabled={asking} className="btn-secondary min-h-[44px] px-4 py-1.5 text-[15px] disabled:opacity-50">
                {asking ? 'Asking…' : `Ask for a ${PLACE_CATEGORIES[category].noun} rec`}
              </button>
            )}
            {notice && <p role="status" className="text-[15px] font-extrabold text-brown-mid">{notice}</p>}
          </>
        )}
      </div>
    </div>
  );
}
