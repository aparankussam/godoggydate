// web/components/PackDayCard.tsx
// One Pack Day in a list: what it is, when, where, and how full it is.

import Link from 'next/link';
import { PACK_DAY_FORMATS, formatPackDayWhen, spotsLeft } from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';

interface Props {
  event: PackDay;
  /** The signed-in member is hosting or already signed up. */
  badge?: 'hosting' | 'going';
}

export default function PackDayCard({ event, badge }: Props) {
  const format = PACK_DAY_FORMATS[event.format];
  const left = spotsLeft(event);

  return (
    <Link
      href={`/app/pack/${event.id}`}
      className="card block px-5 py-4 transition-shadow hover:shadow-lg motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
            {event.official ? '⭐ Official · ' : ''}{format.emoji} {format.label}
          </p>
          <h3 className="mt-0.5 font-display text-lg text-brown leading-tight break-words">{event.title}</h3>
        </div>
        {badge && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
            {badge === 'hosting' ? 'Hosting' : "You're going"}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-brown">{formatPackDayWhen(event)}</p>
      <p className="text-sm text-brown-mid break-words">
        {event.placeName} · {event.city}
      </p>
      <p className={`mt-2 text-xs font-semibold ${left === 0 ? 'text-brown-light' : 'text-brown-mid'}`}>
        {event.attendeeUids.length} of {event.capacity} dogs going{left === 0 ? ' · Full' : ''}
      </p>
    </Link>
  );
}
