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
  const snap = await getAdminDb().doc(`dogs/${uid}`).get();
  if (!snap.exists) return null;
  const raw = snap.data() as SavedDogProfile;
  if (!raw?.name) return null;
  // Admin SDK returns Firestore Timestamp class instances for any timestamp
  // field (createdAt/updatedAt, and ai.generatedAt if present) — passing
  // those into a 'use client' component (DogTradingCard) as props throws
  // "Only plain objects... can be passed to Client Components", since RSC
  // prop serialization requires plain JSON-shaped data. DogTradingCard
  // doesn't render any timestamp field, so this only needs to strip them,
  // not preserve their value.
  const profile = JSON.parse(JSON.stringify(raw)) as SavedDogProfile;
  return { uid, profile };
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
