// web/components/PackDayCard.tsx
// One Pack Day in a list: what it is, when, where, and how full it is.

import Link from 'next/link';
import { formatPackDayWhen, goingSummary, spotsLeft } from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';
import { FormatTag } from './PackDayFlyer';

interface Props {
  event: PackDay;
  /** The signed-in member is hosting or already signed up. */
  badge?: 'hosting' | 'going';
}

export default function PackDayCard({ event, badge }: Props) {
  const left = spotsLeft(event);
  const cancelled = event.status === 'cancelled';

  const going = event.attendeeUids.length;
  return (
    <Link
      href={`/app/pack/${event.id}`}
      className="card block px-5 py-4 transition-shadow hover:shadow-lg motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <FormatTag format={event.format} official={event.official} />
          <h3 className={`mt-2 font-display text-[26px] leading-[1.05] break-words ${cancelled ? 'text-brown-mid line-through decoration-2' : 'text-brown'}`}>{event.title}</h3>
        </div>
        {cancelled ? (
          <span className="shrink-0 rounded-full border-2 border-brown bg-cream-dark px-2.5 py-1 text-[12px] font-black text-brown">Cancelled</span>
        ) : badge && (
          <span className="shrink-0 rounded-full border-2 border-brown bg-brown px-2.5 py-1 text-[12px] font-black text-cream">
            {badge === 'hosting' ? 'Hosting' : "You're going"}
          </span>
        )}
      </div>
      <p className="mt-3 text-[16px] font-black text-brown">{formatPackDayWhen(event)}</p>
      <p className="text-[15px] font-extrabold text-brown-mid break-words">
        {event.placeName} · {event.city}
      </p>
      {cancelled ? (
        <p className="mt-2 text-[14px] font-black text-brown">{goingSummary(event)}</p>
      ) : (
        <div className="mt-2.5 flex items-center gap-3">
          <ul aria-hidden="true" className="flex flex-wrap gap-1">
            {Array.from({ length: event.capacity }, (_, i) => (
              <li key={i} className={`h-3 w-3 rounded-full border-[1.5px] border-brown ${i < going ? 'bg-brown' : 'bg-cream'}`} />
            ))}
          </ul>
          <p className={`text-[14px] font-black ${left === 0 ? 'text-brown-mid' : 'text-brown'}`}>{goingSummary(event)}</p>
        </div>
      )}
    </Link>
  );
}
