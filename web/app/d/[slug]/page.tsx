// web/app/d/[slug]/page.tsx
// Public, pre-auth dog page — the acquisition surface the app never had.
// Every shared Dog Trading Card previously pointed nowhere: there was no
// opengraph-image anywhere in web/, so shares unfurled as bare links and a
// tap landed a stranger on the general homepage with no idea whose dog they
// were looking at. This page + its sibling opengraph-image.tsx close that
// loop — this IS the "landing page" for a shared card.
//
// Server Component: fetches via the Admin SDK, bypassing firestore.rules
// entirely, so no anonymous-read rule change is needed. dogs/{uid} is
// already the same document any signed-in stranger can already read today
// (see firestore.rules — "allow read: if isSignedIn()"), so serving it to a
// signed-out visitor here introduces no new data exposure.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { parseDogSlugToUid, toDogSlug } from '../../../lib/dogSlug';
import { getRenderablePhotos } from '../../../lib/photos';
import DogTradingCard from '../../../components/DogTradingCard';
import type { SavedDogProfile } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string };
}

async function loadDog(slug: string): Promise<{ uid: string; profile: SavedDogProfile } | null> {
  const uid = parseDogSlugToUid(slug);
  if (!uid) return null;
  // This is public, unauthenticated traffic — any Firestore error here
  // (transient network issue, an unexpected doc shape) previously had
  // nothing catching it, which crashes the whole page to a raw 500 for a
  // signed-out visitor instead of a clean "not found". Fails closed to null
  // (renders as 404) rather than surfacing an internal error publicly.
  try {
    const snap = await getAdminDb().doc(`dogs/${uid}`).get();
    if (!snap.exists) return null;
    const raw = snap.data() as SavedDogProfile;
    if (!raw?.name) return null;
    // STRICT ALLOWLIST — do not replace with a spread or a JSON round-trip.
    //
    // This page is public and pre-auth, and anything on this object crosses
    // into a 'use client' component, which means it is serialized into the
    // HTML/RSC payload and readable by anyone (including crawlers) via view
    // source. Passing the whole document previously published ownerId, exact
    // stored lat/lng, householdMemberIds and householdMemberNames to
    // anonymous visitors.
    //
    // These 12 fields are exactly what DogTradingCard renders. If the card
    // ever needs another field, add it here consciously — and never add
    // ownerId, lat, lng, zip, ai, household*, trustScore, ratingCount,
    // meetAgainRate, prompts, vaccinated, or rabiesExpiry.
    //
    // Health status is deliberately absent from this list — both fields.
    //   `vaccinated` used to be here. DogTradingCard never rendered it, so it
    //   bought nothing, and it was a boolean the profile form initialised to
    //   true — meaning we serialised a verification-shaped "yes" about dogs
    //   whose owners were never asked, into a page any crawler or stranger can
    //   read via view-source. Removed.
    //   `rabiesExpiry` is not added. It's a real answer rather than a default,
    //   which makes it MORE sensitive, not less: an exact date is a
    //   fingerprint-grade personal detail (it dates a specific vet visit, and
    //   it tells a stranger when a specific dog's paperwork lapses) attached to
    //   a named dog in a named city on a page with no auth wall. Signed-in
    //   members who might actually meet this dog get it from dogs/{uid} — see
    //   SwipeCard — which is the audience the field exists for. Anonymous
    //   visitors are here to look at a shared card, not to vet a playdate.
    //
    // (Allowlisting also incidentally solves the Firestore Timestamp problem:
    // Admin SDK returns Timestamp class instances, which RSC refuses to
    // serialize — none of the fields below are timestamps.)
    const profile: SavedDogProfile = {
      name: raw.name,
      breed: raw.breed,
      age: raw.age,
      size: raw.size,
      energyLevel: raw.energyLevel,
      playStyles: Array.isArray(raw.playStyles) ? raw.playStyles : [],
      temperament: Array.isArray(raw.temperament) ? raw.temperament : [],
      photos: Array.isArray(raw.photos) ? raw.photos : [],
      location: raw.location,
      city: raw.city,
      state: raw.state,
      foundingPackNumber: raw.foundingPackNumber,
    };
    return { uid, profile };
  } catch (error) {
    console.error('public dog page: failed to load dog', uid, error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const result = await loadDog(params.slug);
  if (!result) return { title: 'Dog not found — GoDoggyDate' };

  const { profile } = result;
  const title = `${profile.name} on GoDoggyDate`;
  const description = [profile.breed, profile.age, profile.location]
    .filter(Boolean)
    .join(' · ') || `${profile.name}'s GoDoggyDate profile`;
  const canonicalSlug = toDogSlug(profile.name, result.uid);

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `/d/${canonicalSlug}` },
    // Shareable by link, but deliberately NOT search-indexable. Nobody opted
    // in to their dog having a Google-discoverable page, and the point of this
    // route is to give a shared card somewhere to land — which link unfurling
    // (openGraph above) does without needing a crawler to index it. `follow`
    // stays on so the links back into the site still count.
    robots: { index: false, follow: true },
  };
}

export default async function PublicDogPage({ params }: PageProps) {
  const result = await loadDog(params.slug);
  if (!result) notFound();

  const { profile } = result;
  const photos = getRenderablePhotos(profile.photos);

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center px-5 py-10 gap-8">
      <Link href="/" className="font-display text-2xl text-brown">
        🐾 GoDoggyDate
      </Link>

      <DogTradingCard profile={profile} />

      {photos.length > 1 && (
        <div className="flex gap-2 max-w-[360px] overflow-x-auto">
          {photos.slice(1, 5).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={`${profile.name} photo ${i + 2}`}
              className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-border"
            />
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-3 max-w-xs text-center">
        <p className="text-brown-light text-sm">
          {profile.name} is on GoDoggyDate — the playdate app for dog people. Got a dog too?
        </p>
        <Link href="/" className="btn-primary px-8 py-3 shadow-lg">
          Make your dog&apos;s card 🐾
        </Link>
      </div>
    </div>
  );
}
