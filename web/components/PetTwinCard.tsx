'use client';
// web/components/PetTwinCard.tsx
// The daily "what I'm thinking today" card from a dog's Pet Twin. Reads the
// realtime moment stream, lets the owner ask for a new card (server enforces
// cadence: free weekly, Pro daily), and always shows the SOURCE CHIP — the real
// thing this card reacted to — plus an open "AI-imagined" label. That chip is
// the honesty contract: the card provably reacts to real state, it isn't a
// personality invented from thin air.

import { useEffect, useRef, useState } from 'react';
import { onLatestMoment, generatePetTwin, type PetTwinMoment } from '../lib/petTwin';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { toDogSlug } from '../lib/dogSlug';

// Kept in lockstep with web/app/api/ai/pet-twin/route.ts (server is the source
// of truth; these are only for showing "next card in …").
const PRO_INTERVAL_MS = 20 * 60 * 60 * 1000;
const FREE_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000;

interface Props {
  dogId: string;
  dogName: string;
  isPro: boolean;
  /** Opens the Pro upsell (free users tap "a card every day" to upgrade). */
  onUpgrade?: () => void;
}

function relativeTime(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return 'now';
  const hours = Math.round(diff / (60 * 60 * 1000));
  if (hours < 24) return hours <= 1 ? 'in about an hour' : `in ${hours} hours`;
  const days = Math.round(hours / 24);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

export default function PetTwinCard({ dogId, dogName, isPro, onUpgrade }: Props) {
  const [moment, setMoment] = useState<PetTwinMoment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dogId) return;
    setLoaded(false);
    return onLatestMoment(dogId, (m) => {
      setMoment(m);
      setLoaded(true);
    });
  }, [dogId]);

  const now = Date.now();
  const interval = isPro ? PRO_INTERVAL_MS : FREE_INTERVAL_MS;
  const nextAllowedMs = moment ? moment.createdAt + interval : 0;
  const throttled = moment ? now < nextAllowedMs : false;

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generatePetTwin();
      // null moment = another request is generating; keep the listener's value.
      if (result.moment) setMoment(result.moment);
      trackEvent('pet_twin_generated', {
        throttled: result.throttled,
        is_pro: result.isPro,
        source: result.moment?.sourceKind ?? 'in_progress',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get today\'s card.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current || sharing || !moment) return;
    setSharing(true);
    trackEvent('pet_twin_share_click');
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const publicUrl = `${origin}/d/${toDogSlug(dogName, dogId)}`;
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-today.png`,
        {
          publicUrl,
          dogName,
          shareTitle: `${dogName} today`,
          shareText: `${dogName} is feeling ${moment.mood} ${moment.moodEmoji} today on GoDoggyDate.`,
        },
      );
      trackEvent('pet_twin_shared', { method: result });
    } catch {
      /* non-critical */
    } finally {
      setSharing(false);
    }
  }

  const cadenceLabel = isPro ? 'a new card every day' : 'a new card every week';

  return (
    <section className="card rounded-[1.8rem] overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Pet Twin</p>
          <p className="font-display text-lg text-brown leading-tight">{dogName}&apos;s day</p>
        </div>
        <span className="text-[10px] font-semibold text-brown-light">{cadenceLabel}</span>
      </div>

      {/* The card itself (captured for sharing) */}
      <div className="px-5 pt-3">
        <div
          ref={cardRef}
          className="rounded-2xl p-5 text-white"
          style={{ background: 'linear-gradient(155deg, #5C3D2E 0%, #B45309 60%, #E8633A 100%)' }}
        >
          {moment ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-3xl" aria-hidden="true">{moment.moodEmoji}</span>
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-gold">{moment.mood}</span>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed">“{moment.thought}”</p>
              <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between gap-2">
                <p className="text-[10px] text-white/70">
                  ✨ imagined from <span className="font-semibold text-white/90">{moment.sourceLabel}</span>
                </p>
                <p className="text-[10px] text-white/60 shrink-0">— {dogName}</p>
              </div>
            </>
          ) : (
            <div className="py-3">
              <p className="text-2xl" aria-hidden="true">💭</p>
              <p className="mt-2 text-[15px] leading-relaxed">
                {dogName} hasn&apos;t shared a thought yet. Get their first card — it&apos;s written from
                something real about them today.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-2">
        {error && <p className="text-xs text-red-600">{error}</p>}

        {(!moment || !throttled) && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className="btn-primary py-2.5 text-sm disabled:opacity-60"
          >
            {busy ? 'Thinking…' : moment ? "Get today's card" : `Meet ${dogName}'s Pet Twin`}
          </button>
        )}

        {moment && throttled && (
          <>
            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="btn-secondary py-2.5 text-sm disabled:opacity-60"
            >
              {sharing ? 'Rendering…' : '📤 Share today\'s card'}
            </button>
            <p className="text-center text-[11px] text-brown-light">
              Next card {relativeTime(nextAllowedMs, now)}.
              {!isPro && onUpgrade && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={onUpgrade}
                    className="font-bold text-primary underline underline-offset-2"
                  >
                    Get a card every day with Pro
                  </button>
                </>
              )}
            </p>
          </>
        )}

        {moment && !throttled && (
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="text-center text-xs font-semibold text-brown-light hover:text-brown"
          >
            {sharing ? 'Rendering…' : '📤 Share this card'}
          </button>
        )}
      </div>
    </section>
  );
}
