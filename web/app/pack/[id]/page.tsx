// web/app/pack/[id]/page.tsx
// Public, no-signup Pack Day page — the flyer. This is what gets texted to a
// neighbor or printed behind a QR code at the park: what, when, where, how
// many, and one button to join. Server-rendered from the Admin SDK with a
// strict allowlist (see lib/packDayPublic.ts); it shows how many dogs are
// going, never who.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadPublicPackDay } from '../../../lib/packDayPublic';
import PackDayJoinCta from '../../../components/PackDayJoinCta';
import PackDayFlyerActions from '../../../components/PackDayFlyerActions';
import { FlyerSheet, FlyerFacts, GoingTokens, RulesSlip } from '../../../components/PackDayFlyer';
import { formatPackDayWhen, isPast } from '../../../../shared/packDay';
import BrandLogo from '../../../components/BrandLogo';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const result = await loadPublicPackDay(params.id);
  if (!result) return { title: 'Pack Day not found — GoDoggyDate' };
  const { event } = result;
  const title = `${event.title} — Pack Day`;
  const description = `${formatPackDayWhen(event)} · ${event.placeName}, ${event.city}`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    // Shareable by link, not search-indexable: it names a real place and time.
    robots: { index: false, follow: true },
  };
}

export default async function PublicPackDayPage({ params }: PageProps) {
  const result = await loadPublicPackDay(params.id);
  if (!result) notFound();

  const { event, attendeeCount } = result;
  const over = isPast(event, Date.now());
  const cancelled = event.status === 'cancelled';
  const left = Math.max(0, event.capacity - attendeeCount);
  const closed = over || cancelled || left === 0;

  return (
    <div className="flex min-h-screen flex-col items-center gap-5 px-3.5 pb-10 pt-3">
      <Link href="/" className="flex items-center gap-2.5 self-start px-1.5">
        <BrandLogo height={40} />
      </Link>

      <FlyerSheet className="w-full max-w-md">
        {cancelled && (
          <p role="status" className="mb-4 rounded-xl bg-cream-dark px-4 py-3 text-[15px] font-black text-brown">
            This Pack Day was cancelled.
          </p>
        )}
        {!cancelled && over && (
          <p className="mb-4 rounded-xl bg-cream-dark px-4 py-3 text-[15px] font-black text-brown">
            This one is over. Host the next one!
          </p>
        )}

        <FlyerFacts event={event} />
        <GoingTokens capacity={event.capacity} count={attendeeCount} status={event.status} />

        <RulesSlip className="mt-5" />

        <div className="mt-5">
          <PackDayJoinCta
            eventId={event.id}
            disabled={closed}
            label={cancelled ? 'Cancelled' : over ? 'Over' : left === 0 ? 'Full' : 'Join this Pack Day'}
          />
          {!closed && (
            <p className="mt-3 text-center text-[14px] font-extrabold leading-snug text-brown-mid">
              <span className="font-black text-brown">Free.</span> You&apos;ll sign in and set up your dog&apos;s
              profile first: about 5 minutes and 3 photos of your dog. Then you can save your spot.
            </p>
          )}
        </div>

        {!cancelled && !over && (
          <div className="mt-4">
            <PackDayFlyerActions event={event} />
          </div>
        )}

        <p className="mt-4 text-center text-[14px] font-extrabold text-brown-mid">
          GoDoggyDate doesn&apos;t verify dogs or owners.
        </p>
        <p className="text-center">
          <Link href="/playdate-safety" className="inline-flex min-h-[44px] items-center text-[15px] font-black text-brown underline decoration-2 underline-offset-4">
            Read the first-meeting guide
          </Link>
        </p>
      </FlyerSheet>
    </div>
  );
}
