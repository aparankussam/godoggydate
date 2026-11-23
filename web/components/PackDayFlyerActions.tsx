'use client';
// web/components/PackDayFlyerActions.tsx
// Share + Add to calendar on the public flyer. Works signed out: it only uses
// the same allowlisted facts the page already shows (never who is going).

import { useState } from 'react';
import { packDayUrl } from '../lib/packDay';
import { trackEvent } from '../lib/analytics';
import { buildPackDayIcs, formatPackDayWhen } from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';
import type { PublicPackDay } from '../lib/packDayPublic';
import { CalendarIcon, ShareIcon } from './PackDayFlyer';

export default function PackDayFlyerActions({ event }: { event: PublicPackDay['event'] }) {
  const [note, setNote] = useState<string | null>(null);

  async function share() {
    const url = packDayUrl(event.id);
    const text = `${event.title}: ${formatPackDayWhen(event)} at ${event.placeName}. Bring your dog!`;
    trackEvent('packday_share', { eventId: event.id });
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: event.title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote('Link copied. Send it to a neighbor!');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setNote(`We couldn't copy the link. Copy it from here: ${url}`);
    }
  }

  function addToCalendar() {
    // The ics builder only reads the public facts; the rest of PackDay is unused.
    const ics = buildPackDayIcs(event as unknown as PackDay, packDayUrl(event.id));
    if (!ics) return;
    trackEvent('packday_calendar', { eventId: event.id });
    const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = 'pack-day.ics';
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={share} className="btn-secondary flex min-h-[48px] items-center justify-center gap-2 px-3 py-2 text-[16px]">
          <ShareIcon size={20} /> Share
        </button>
        <button type="button" onClick={addToCalendar} className="btn-secondary flex min-h-[48px] items-center justify-center gap-1.5 whitespace-nowrap px-2 py-2 text-[14px]">
          <CalendarIcon size={20} /> Add to calendar
        </button>
      </div>
      {note && <p role="status" className="mt-2 break-words text-center text-[14px] font-extrabold text-brown">{note}</p>}
    </div>
  );
}
