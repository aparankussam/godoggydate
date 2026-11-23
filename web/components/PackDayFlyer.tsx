// web/components/PackDayFlyer.tsx
// Presentational pieces of the Pack Day flyer, shared by the public page
// (app/pack/[id]) and the in-app screens: the taped paper sheet, the format
// tag, the when / where / host rows, the going-count tokens and the calm
// house-rules slip. No hooks and no data fetching, so it renders on the server.
// The tokens show HOW MANY are going, never who.

import type { ReactNode } from 'react';
import { PACK_DAY_FORMATS, PACK_DAY_RULES, formatPackDayWhen, goingSummary, mapsSearchUrl } from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';

export function TreeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="block flex-none">
      <circle cx="12" cy="5.8" r="4.3" /><circle cx="7.2" cy="7.8" r="4" /><circle cx="16.8" cy="7.8" r="4" />
      <circle cx="5.8" cy="12" r="3.9" /><circle cx="18.2" cy="12" r="3.9" /><circle cx="12" cy="11" r="5.5" />
      <path d="M10.3 14h3.4v5.3l2.6 3.2H7.7l2.6-3.2z" />
    </svg>
  );
}

export function PawIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="block flex-none">
      <ellipse cx="5.2" cy="10.4" rx="2.1" ry="2.8" transform="rotate(-20 5.2 10.4)" />
      <ellipse cx="9.3" cy="5.9" rx="2.2" ry="3" transform="rotate(-8 9.3 5.9)" />
      <ellipse cx="14.7" cy="5.9" rx="2.2" ry="3" transform="rotate(8 14.7 5.9)" />
      <ellipse cx="18.8" cy="10.4" rx="2.1" ry="2.8" transform="rotate(20 18.8 10.4)" />
      <path d="M12 11.2c-3.3 0-6.1 2.9-6.1 5.9 0 2 1.5 3.1 3.3 3.1 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.8 0 3.3-1.1 3.3-3.1 0-3-2.8-5.9-6.1-5.9z" />
    </svg>
  );
}

export function CalendarIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="block flex-none">
      <path d="M7 2.5a1.2 1.2 0 0 1 1.2 1.2V5h7.6V3.7a1.2 1.2 0 0 1 2.4 0V5h.3A2.5 2.5 0 0 1 21 7.5V19a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19V7.5A2.5 2.5 0 0 1 5.5 5h.3V3.7A1.2 1.2 0 0 1 7 2.5zM5.4 10v8.6c0 .3.2.5.5.5h12.2c.3 0 .5-.2.5-.5V10z" />
      <rect x="7.4" y="12" width="2.4" height="2.2" rx=".5" /><rect x="11" y="12" width="2.4" height="2.2" rx=".5" /><rect x="14.6" y="12" width="2.4" height="2.2" rx=".5" />
    </svg>
  );
}

export function PinIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="block flex-none">
      <path d="M12 1.8a7.4 7.4 0 0 0-7.4 7.4c0 5.1 6 11.7 6.7 12.4.4.4 1 .4 1.4 0 .7-.7 6.7-7.3 6.7-12.4A7.4 7.4 0 0 0 12 1.8zm0 10.1a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z" />
    </svg>
  );
}

export function ShareIcon({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="block flex-none">
      <path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5" />
    </svg>
  );
}

/** The paper flyer, with a strip of kraft tape across the top edge. */
export function FlyerSheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <article className={`relative rounded-[22px] border-[2.5px] border-brown bg-cream px-5 pb-6 pt-7 shadow-[0_10px_0_rgba(42,31,74,0.14)] ${className}`}>
      <span
        aria-hidden="true"
        className="absolute -top-3.5 left-1/2 h-7 w-24 -translate-x-1/2 rotate-[-2deg] border-x border-[#D9BC8C] opacity-90"
        style={{ background: 'repeating-linear-gradient(135deg, #E6CFA6 0 8px, #D9BC8C 8px 16px)' }}
      />
      {children}
    </article>
  );
}

export function FormatTag({ format, official, cancelled }: { format: PackDay['format']; official?: boolean; cancelled?: boolean }) {
  const f = PACK_DAY_FORMATS[format];
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-brown bg-cream px-3 py-1 text-[14px] font-black text-brown shadow-[0_2px_0_rgba(42,31,74,0.28)]">
        <TreeIcon size={16} />
        {f.label}
      </span>
      {official && (
        <span className="inline-flex items-center rounded-full border-2 border-brown bg-kraft px-3 py-1 text-[13px] font-black text-brown">
          Official Pack Day
        </span>
      )}
      {cancelled && (
        <span className="inline-flex items-center rounded-full border-2 border-brown bg-cream-dark px-3 py-1 text-[13px] font-black text-brown">
          Cancelled
        </span>
      )}
    </p>
  );
}

type FlyerFacts = Pick<
  PackDay,
  'format' | 'official' | 'title' | 'localDate' | 'localTime' | 'durationMinutes' | 'placeName' | 'city' | 'state' | 'note' | 'hostDogName' | 'status'
>;

/** Tag, title, blurb, note, when, where + Map, host. */
export function FlyerFacts({ event, headingLevel = 1 }: { event: FlyerFacts; headingLevel?: 1 | 2 }) {
  const cancelled = event.status === 'cancelled';
  const format = PACK_DAY_FORMATS[event.format];
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <>
      <FormatTag format={event.format} official={event.official} cancelled={cancelled} />
      <Heading className={`mt-3 break-words font-display text-[34px] leading-[1.02] ${cancelled ? 'text-brown-mid line-through decoration-2' : 'text-brown'}`}>
        {event.title}
      </Heading>
      <p className="mt-2 text-[15px] font-extrabold leading-snug text-brown-mid">{format.blurb}</p>
      {event.note && <p className="mt-2 break-words text-[15px] font-extrabold leading-snug text-brown">&ldquo;{event.note}&rdquo;</p>}

      <dl className="mt-5 space-y-4 text-brown">
        <div className="flex items-center gap-3">
          <dt className="sr-only">When</dt>
          <span aria-hidden="true"><CalendarIcon /></span>
          <dd className="text-[16px] font-black">{formatPackDayWhen(event)} · {event.durationMinutes} min</dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="sr-only">Where</dt>
          <span aria-hidden="true"><PinIcon /></span>
          <dd className="min-w-0 flex-1 break-words text-[16px] font-black">
            {event.placeName}, {event.city}{event.state ? `, ${event.state}` : ''}
            <a
              href={mapsSearchUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              className="-my-3 ml-2 inline-flex min-h-[44px] items-center px-1 align-middle text-[16px] font-black underline decoration-2 underline-offset-4"
            >
              Map
            </a>
          </dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="sr-only">Host</dt>
          <span
            aria-hidden="true"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 border-brown bg-note text-brown"
          >
            <PawIcon size={20} />
          </span>
          <dd className="text-[16px] font-extrabold">Hosted by {event.hostDogName || 'a neighbor'}&apos;s human</dd>
        </div>
      </dl>
    </>
  );
}

/** "5 of 8 dogs going" plus one token per spot: filled paw = taken, open ring = free. */
export function GoingTokens({ capacity, count, status }: { capacity: number; count: number; status: PackDay['status'] }) {
  if (status === 'cancelled') {
    return <p className="mt-5 font-display text-[22px] leading-none text-brown">Cancelled</p>;
  }
  const total = Math.max(0, capacity);
  const filled = Math.min(count, total);
  return (
    <div className="mt-5">
      <p className="font-display text-[22px] leading-none text-brown">
        {goingSummary({ capacity, status, attendeeCount: count })}
      </p>
      <ul aria-hidden="true" className="mt-3 flex flex-wrap gap-2.5">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={`flex h-[28px] w-[28px] items-center justify-center rounded-full border-2 border-brown sm:h-[30px] sm:w-[30px] ${
              i < filled ? 'bg-brown text-cream' : 'bg-cream'
            }`}
          >
            {i < filled && <PawIcon size={14} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The calm house-rules slip. */
export function RulesSlip({ className = '' }: { className?: string }) {
  return (
    <section aria-label="House rules" className={`rounded-xl border-l-4 border-brown bg-cream-dark px-4 py-3 ${className}`}>
      <h2 className="font-body text-[14px] !font-black text-brown-mid" style={{ fontWeight: 900 }}>House rules</h2>
      <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-[15px] font-extrabold leading-snug text-brown">
        {PACK_DAY_RULES.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>
    </section>
  );
}
