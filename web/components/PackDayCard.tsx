// web/components/PackDayCard.tsx
// One Pack Day in a list: what it is, when, where, and how full it is.

import Link from 'next/link';
import { PACK_DAY_FORMATS, formatPackDayWhen, goingSummary, spotsLeft } from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';

interface Props {
  event: PackDay;
  /** The signed-in member is hosting or already signed up. */
  badge?: 'hosting' | 'going';
}

export default function PackDayCard({ event, badge }: Props) {
  const format = PACK_DAY_FORMATS[event.format];
  const left = spotsLeft(event);
  const cancelled = event.status === 'cancelled';

  return (
    <Link
      href={`/app/pack/${event.id}`}
      className="card block px-5 py-4 transition-shadow hover:shadow-lg motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose">
            {event.official ? '⭐ Official · ' : ''}{format.emoji} {format.label}
          </p>
          <h3 className={`mt-0.5 font-display text-lg leading-tight break-words ${cancelled ? 'text-brown-mid line-through decoration-1' : 'text-brown'}`}>{event.title}</h3>
        </div>
        {cancelled ? (
          <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">Cancelled</span>
        ) : badge && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-rose">
            {badge === 'hosting' ? 'Hosting' : "You're going"}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-brown">{formatPackDayWhen(event)}</p>
      <p className="text-sm text-brown-mid break-words">
        {event.placeName} · {event.city}
      </p>
      <p className={`mt-2 text-xs font-semibold ${cancelled ? 'text-red-700' : left === 0 ? 'text-brown-light' : 'text-brown-mid'}`}>
        {goingSummary(event)}
      </p>
    </Link>
  );
}
