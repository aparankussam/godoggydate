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
import { PACK_DAY_FORMATS, PACK_DAY_RULES, formatPackDayWhen, isPast, mapsSearchUrl } from '../../../../shared/packDay';

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
  const format = PACK_DAY_FORMATS[event.format];
  const over = isPast(event, Date.now());
  const cancelled = event.status === 'cancelled';
  const left = Math.max(0, event.capacity - attendeeCount);
  const closed = over || cancelled || left === 0;

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center px-5 py-10 gap-6">
      <Link href="/" className="font-display text-2xl text-brown">
        🐾 GoDoggyDate
      </Link>

      <article className="card w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-br from-primary/15 to-gold/15 px-6 py-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            {event.official ? '⭐ Official Pack Day' : 'Pack Day'} · {format.emoji} {format.label}
          </p>
          <h1 className="mt-1 font-display text-2xl text-brown leading-tight break-words">{event.title}</h1>
        </div>

        <div className="px-6 py-5 space-y-4">
          {cancelled && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              This Pack Day was cancelled.
            </p>
          )}
          {!cancelled && over && (
            <p className="rounded-xl bg-cream-dark px-4 py-3 text-sm font-semibold text-brown-mid">
              This one is over. Host the next one!
            </p>
          )}

          <dl className="space-y-3 text-sm">
            <div className="flex gap-3">
              <dt aria-hidden="true">📅</dt>
              <dd className="font-semibold text-brown">{formatPackDayWhen(event)} · {event.durationMinutes} min</dd>
            </div>
            <div className="flex gap-3">
              <dt aria-hidden="true">📍</dt>
              <dd className="text-brown min-w-0 break-words">
                <span className="font-semibold">{event.placeName}</span>, {event.city}{event.state ? `, ${event.state}` : ''}
                <a
                  href={mapsSearchUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 px-1.5 py-3 text-primary font-semibold underline"
                >
                  Map
                </a>
              </dd>
            </div>
            <div className="flex gap-3">
              <dt aria-hidden="true">🐕</dt>
              <dd className="text-brown">
                Hosted by {event.hostDogName || 'a neighbor'}&apos;s human ·{' '}
                <span className="font-semibold">
                  {attendeeCount} of {event.capacity} dogs going
                </span>
              </dd>
            </div>
          </dl>

          <p className="text-sm text-brown-mid leading-relaxed">{format.blurb}</p>
          {event.note && <p className="text-sm text-brown leading-relaxed break-words">&ldquo;{event.note}&rdquo;</p>}

          <PackDayJoinCta
            eventId={event.id}
            disabled={closed}
            label={cancelled ? 'Cancelled' : over ? 'Over' : left === 0 ? 'Full' : 'Join this Pack Day 🐾'}
          />
          <p className="text-center text-[11px] text-brown-light">
            Free. You&apos;ll make a quick profile for your dog, then your spot is saved.
          </p>
        </div>
      </article>

      <section className="w-full max-w-md rounded-2xl border border-border bg-white px-5 py-4">
        <h2 className="text-sm font-bold text-brown">House rules</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-brown-mid list-disc pl-5">
          {PACK_DAY_RULES.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
        <p className="mt-3 text-[11px] text-brown-light">
          GoDoggyDate doesn&apos;t verify dogs or owners. See the{' '}
          <Link href="/playdate-safety" className="underline">first-meeting guide</Link>.
        </p>
      </section>
    </div>
  );
}
