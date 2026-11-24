// web/app/lost/[id]/page.tsx
// Public, no-signup lost-dog page: what gets shared on Facebook and Nextdoor and
// printed behind the poster's QR code. Server-rendered from the Admin SDK with a
// strict allowlist (lib/lostPublic.ts): the dog, how to recognize it, a general
// area for the latest report, and a form for anyone who saw it. It never shows the
// owner's phone, address or name. The app is free and so is this page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPublicLostAlert } from '../../../lib/lostPublic';
import LostSightingForm from '../../../components/LostSightingForm';
import { FlyerSheet, PawIcon } from '../../../components/PackDayFlyer';
import { lostFacts, timeAgo } from '../../../../shared/lostDog';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const result = await loadPublicLostAlert(params.id);
  if (!result) return { title: 'Lost dog alert — GoDoggyDate' };
  const { alert } = result;
  const place = [alert.city, alert.state].filter(Boolean).join(', ');
  const title = alert.status === 'found' ? `${alert.dogName} is home!` : `LOST DOG: ${alert.dogName}${place ? ` near ${place}` : ''}`;
  const description = alert.status === 'found'
    ? `${alert.dogName} was found. Thank you to everyone who helped look.`
    : `Help bring ${alert.dogName} home. If you've seen this dog, tell the family — no account needed.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    // Shareable by link, not search-indexable: it is about one dog on one day.
    robots: { index: false, follow: true },
  };
}

export default async function PublicLostDogPage({ params }: PageProps) {
  const result = await loadPublicLostAlert(params.id);
  if (!result) notFound();

  const { alert, sightingCount, lastSighting } = result;
  const found = alert.status === 'found';
  const facts = lostFacts(alert);
  const now = Date.now();

  return (
    <div className="flex min-h-screen flex-col items-center gap-5 px-3.5 pb-10 pt-3">
      <Link href="/" className="flex items-center gap-2.5 self-start px-1.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 -rotate-[8deg] items-center justify-center rounded-full border-2 border-brown bg-cream text-brown shadow-[0_3px_0_rgba(42,31,74,0.28)]"
        >
          <PawIcon size={20} />
        </span>
        <span className="font-display text-[26px] leading-none text-brown">GoDoggyDate</span>
      </Link>

      <FlyerSheet className="w-full max-w-md">
        {found ? (
          <p role="status" className="mb-4 rounded-xl bg-cream-dark px-4 py-3 text-[17px] font-black text-brown">
            🎉 {alert.dogName} is home! Thank you to everyone who helped look.
          </p>
        ) : (
          <p className="mb-1 text-center font-display text-[56px] leading-none tracking-wide text-rose">LOST DOG</p>
        )}

        {alert.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={alert.photoUrl}
            alt={`${alert.dogName}, the missing dog`}
            className="mx-auto mt-3 aspect-square w-full max-w-[320px] rounded-2xl border-[3px] border-brown object-cover"
          />
        )}

        <h1 className="mt-4 text-center font-display text-[40px] leading-tight text-brown">{alert.dogName}</h1>

        <ul className="mt-3 space-y-1.5 text-[17px] font-extrabold text-brown">
          {facts.map((line) => (
            <li key={line} className="flex gap-2"><span aria-hidden="true">🐾</span>{line}</li>
          ))}
        </ul>

        {!found && (
          <p className="mt-4 rounded-xl bg-cream-dark px-4 py-3 text-[15px] font-extrabold text-brown-mid">
            {sightingCount > 0 && lastSighting
              ? `${sightingCount} ${sightingCount === 1 ? 'report' : 'reports'} so far. Latest ${timeAgo(lastSighting.atMs, now)}, in the general area shown on `
              : 'No reports yet. '}
            {sightingCount > 0 && lastSighting && (
              <a
                className="font-black underline"
                href={`https://www.openstreetmap.org/?mlat=${lastSighting.lat}&mlon=${lastSighting.lng}#map=14/${lastSighting.lat}/${lastSighting.lng}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                the map (about 1 km)
              </a>
            )}
            {sightingCount > 0 && lastSighting && '.'}
          </p>
        )}

        {!found && (
          <div className="mt-6">
            <LostSightingForm alertId={alert.id} dogName={alert.dogName} />
          </div>
        )}

        <p className="mt-5 text-center text-[14px] font-extrabold text-brown-mid">
          Approach calmly, and don&apos;t chase: a frightened dog can bolt. If the dog needs urgent care, call a local vet or animal control.
        </p>
      </FlyerSheet>
    </div>
  );
}
