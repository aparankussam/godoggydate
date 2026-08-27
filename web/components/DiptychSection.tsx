'use client';
import { formatUsMonthYear } from '../../shared/dates';
// web/components/DiptychSection.tsx
// Profile-page surface for the DAY 1 vs DAY N diptych — the National Dog Day
// hook. The owner picks their EARLIEST photo and their LATEST photo from their
// own uploaded photos, confirms the date that earliest photo was taken, and we
// render a shareable "then vs now" card with an honest day-count between them.
//
// HONEST: the count is (today − the confirmed earliest date), and it is labelled
// "since your earliest photo" everywhere — never a birth, age, or "days alive"
// claim. If the owner hasn't given a date yet, we PROMPT for one instead of
// inventing a number; the card only appears once a real (non-future) date is set.
//
// Self-contained: reads only the owner's own profile, computes nothing from
// other users, and shares via the same html2canvas path as the other cards.

import { useMemo, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { getRenderablePhotos, getHeroFocus } from '../lib/photos';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import DiptychCard from './DiptychCard';

interface Props {
  savedProfile: SavedDogProfile;
}

/** Local-midnight Date from a YYYY-MM-DD input value (avoids UTC off-by-one). */
function parseInputDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Today's date string (YYYY-MM-DD) for the date input's max — SSR-safe. */
function todayInputMax(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export default function DiptychSection({ savedProfile }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const photos = useMemo(() => getRenderablePhotos(savedProfile.photos), [savedProfile.photos]);
  const dogName = savedProfile.name?.trim() || 'Your dog';
  const photoFocus = getHeroFocus(savedProfile);

  // Earliest defaults to the first photo, latest to the last — the owner can
  // repoint either. Kept as indices into the renderable-photos array.
  const [earliestIdx, setEarliestIdx] = useState(0);
  const [latestIdx, setLatestIdx] = useState(() => Math.max(0, photos.length - 1));
  const [dateValue, setDateValue] = useState('');

  // Needs at least one photo to show a face; the date is required for an honest
  // count, so the card stays hidden until the owner confirms one.
  if (photos.length === 0) return null;

  const earliestDate = parseInputDate(dateValue);
  const maxDate = todayInputMax();

  // Cheap and pure — computed inline (not a hook) so it stays below the early
  // return above without breaking the Rules of Hooks.
  let days: number | null = null;
  if (earliestDate) {
    const now = new Date();
    // DST-immune: diff of UTC calendar days, so a clock change never adds or
    // drops a day. earliestDate is a local-midnight Date from the date input.
    const a = Date.UTC(earliestDate.getFullYear(), earliestDate.getMonth(), earliestDate.getDate());
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    // future date — refuse rather than show a negative count
    days = b < a ? null : Math.round((b - a) / 86_400_000);
  }

  const earliestUrl = photos[Math.min(earliestIdx, photos.length - 1)];
  const latestUrl = photos[Math.min(latestIdx, photos.length - 1)];

  const earliestLabel = earliestDate
    ? formatUsMonthYear(earliestDate)
    : undefined;

  // Need at least 1 day (dating the earliest photo to today is not a "then vs now").
  const ready = days !== null && days >= 1;

  async function handleShare() {
    if (!cardRef.current || sharing || !ready) return;
    setSharing(true);
    trackEvent('diptych_share_click', { days: days ?? 0 });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-day1-vs-day${days}.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `${dogName}: Day 1 vs Day ${days}`,
          shareText: `Day 1 vs Day ${days} with ${dogName} 🐾 — ${days} days since our earliest photo. Make your dog's National Dog Day diptych on GoDoggyDate.`,
        },
      );
      trackEvent('diptych_shared', { method: result, days: days ?? 0 });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">National Dog Day 🐾</p>
        <h2 className="font-display text-xl text-brown leading-tight">Day 1 vs Day N</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          Two of your own photos, then vs now, with the real number of days since your earliest one. Pick the
          first and latest shots and tell us when that first photo was taken.
        </p>
      </div>

      {/* Photo pickers — only shown when there's more than one photo to choose. */}
      {photos.length > 1 && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-brown mb-1.5">Earliest photo (Day 1)</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((url, i) => (
                <button
                  key={`e-${i}`}
                  type="button"
                  onClick={() => setEarliestIdx(i)}
                  aria-label={`Use photo ${i + 1} as the earliest`}
                  aria-pressed={i === earliestIdx}
                  className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    i === earliestIdx ? 'border-primary ring-2 ring-primary/30' : 'border-border opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-brown mb-1.5">Latest photo (Day N)</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((url, i) => (
                <button
                  key={`l-${i}`}
                  type="button"
                  onClick={() => setLatestIdx(i)}
                  aria-label={`Use photo ${i + 1} as the latest`}
                  aria-pressed={i === latestIdx}
                  className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    i === latestIdx ? 'border-primary ring-2 ring-primary/30' : 'border-border opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Date confirmation — the honest input the whole count rests on. */}
      <div className="mt-4">
        <label htmlFor="diptych-earliest-date" className="block text-xs font-bold text-brown mb-1.5">
          When was that earliest photo taken?
        </label>
        <input
          id="diptych-earliest-date"
          type="date"
          value={dateValue}
          max={maxDate}
          onChange={(e) => setDateValue(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-brown focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {dateValue && days === null && (
          <p className="mt-1.5 text-xs text-primary">
            That date is in the future — pick the day your earliest photo was actually taken.
          </p>
        )}
      </div>

      {/* Prompt until we have an honest number — no invented count. */}
      {!ready ? (
        <p className="mt-4 rounded-xl bg-white/60 border border-border px-3.5 py-3 text-sm text-brown-mid leading-relaxed">
          Add the date above to reveal your Day 1 &rarr; Day N card.
        </p>
      ) : (
        <>
          <div className="mt-4 flex justify-center">
            <DiptychCard
              ref={cardRef}
              dogName={dogName}
              earliestUrl={earliestUrl}
              latestUrl={latestUrl}
              earliestFocus={photoFocus}
              latestFocus={photoFocus}
              days={days}
              earliestLabel={earliestLabel}
            />
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-primary w-full mt-4 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : `Share ${dogName}'s Day 1 vs Day ${days}`}
          </button>
        </>
      )}

      <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
        The count is days since the earliest photo you picked — not a birthday or an age.
      </p>
    </section>
  );
}
