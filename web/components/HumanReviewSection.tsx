'use client';
import { formatUsDate, formatUsMonthYear } from '../../shared/dates';
// web/components/HumanReviewSection.tsx
// Profile-page surface for "My Human: A Review": the dog files a deadpan,
// review-site-style write-up of its owner — a benign star score, Pros, gentle
// "Areas for improvement", and a verdict. Openly labelled a playful AI read.
//
// CADENCE: this is a QUARTERLY keepsake, not a spammable generator. The server
// enforces the hard per-uid volume cap + anti-burst lock; on the client we cache
// the last review locally (per uid) and gate a fresh one to once every ~90 days,
// re-showing the saved review in between with a note on when the next is due.
// The owner can always re-share the card they already have.
//
// Self-contained: reads only the owner's own profile + a locally-cached result.

import { useEffect, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { requestHumanReview, type HumanReview } from '../lib/humanReview';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import HumanReviewCard from './HumanReviewCard';

interface Props {
  savedProfile: SavedDogProfile;
  /** The owner's uid — namespaces the local quarterly cache. */
  userId: string;
}

// ~One quarter. The cadence is deliberately slow: the review is a keepsake.
const QUARTER_MS = 90 * 24 * 60 * 60 * 1000;
const NOTE_MAX_LEN = 240;

interface CachedReview {
  review: HumanReview;
  dateLabel: string;
  generatedAtMs: number;
}

function cacheKey(uid: string): string {
  return `gdd:humanReview:${uid}`;
}

function loadCached(uid: string): CachedReview | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReview;
    if (!parsed?.review || typeof parsed.generatedAtMs !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCached(uid: string, value: CachedReview): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey(uid), JSON.stringify(value));
  } catch {
    /* private mode / quota — cadence just falls back to server caps */
  }
}

function formatToday(): string {
  try {
    return formatUsDate(new Date());
  } catch {
    return '';
  }
}

function formatNextDue(ms: number): string {
  try {
    return formatUsMonthYear(new Date(ms));
  } catch {
    return 'next quarter';
  }
}

export default function HumanReviewSection({ savedProfile, userId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');
  const [review, setReview] = useState<HumanReview | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [generatedAtMs, setGeneratedAtMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dogName = savedProfile.name?.trim() || 'Your dog';

  // Hydrate any cached review after mount (SSR-safe — never touches
  // localStorage during render).
  useEffect(() => {
    const cached = loadCached(userId);
    if (cached) {
      setReview(cached.review);
      // Re-derive rather than trusting the cached STRING: the label was
      // formatted at generate time, so a cache written before the US-format
      // sweep would keep the old format alive for a whole quarter — including
      // inside the shared keepsake PNG.
      setDateLabel(formatUsDate(new Date(cached.generatedAtMs)));
      setGeneratedAtMs(cached.generatedAtMs);
    }
  }, [userId]);

  const now = Date.now();
  const nextDueMs = generatedAtMs !== null ? generatedAtMs + QUARTER_MS : null;
  const onCooldown = nextDueMs !== null && now < nextDueMs;

  async function handleGenerate() {
    if (busy || onCooldown) return;
    setBusy(true);
    setError(null);
    feedback.pop();
    trackEvent('human_review_generate_click', { note_len: note.trim().length });
    try {
      const result = await requestHumanReview({ note: note.trim() || undefined });
      const label = formatToday();
      const at = Date.now();
      setReview(result);
      setDateLabel(label);
      setGeneratedAtMs(at);
      saveCached(userId, { review: result, dateLabel: label, generatedAtMs: at });
      feedback.success();
      trackEvent('human_review_generated', { model: result.model ?? 'unknown', stars: result.stars });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the review. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('human_review_share_click', {});
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-reviews-their-human.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `${dogName} reviewed their human`,
          shareText: `${dogName} left their human a review. Get your dog's playful take on you at GoDoggyDate.`,
        },
      );
      feedback.success();
      trackEvent('human_review_shared', { method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  const remaining = NOTE_MAX_LEN - note.length;

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">⭐ My Human: A Review</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          {dogName} would like to review their human — deadpan star rating, honest pros, and a few gentle
          notes for improvement. A quarterly keepsake, written by AI in {dogName}&apos;s voice.
        </p>
      </div>

      {!review && (
        <>
          <label htmlFor="human-review-note" className="block text-xs font-bold text-brown mb-1.5">
            Anything {dogName} especially appreciates? <span className="font-normal text-brown-light">(optional)</span>
          </label>
          <textarea
            id="human-review-note"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LEN))}
            placeholder="Extra long morning walks. Shares the good treats."
            rows={2}
            className="w-full rounded-xl border border-border bg-cream px-3.5 py-2.5 text-sm text-brown placeholder:text-brown-light focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[11px] text-brown-light">A playful AI read — not a real rating.</p>
            <p className="text-[11px] text-brown-light tabular-nums">{remaining}</p>
          </div>
        </>
      )}

      {!onCooldown && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="btn-primary w-full mt-3 disabled:opacity-60"
        >
          {busy ? 'Writing the review…' : review ? `Write ${dogName}'s new review` : `Get ${dogName}'s review`}
        </button>
      )}

      {error && (
        <p className="mt-2 text-[13px] text-primary font-semibold text-center">{error}</p>
      )}

      {review && (
        <>
          <div className="mt-4 flex justify-center">
            <HumanReviewCard
              ref={cardRef}
              stars={review.stars}
              headline={review.headline}
              pros={review.pros}
              improvements={review.improvements}
              verdict={review.verdict}
              dogName={review.dogName || dogName}
              dateLabel={dateLabel}
            />
          </div>

          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            className="btn-secondary w-full mt-3 disabled:opacity-60"
          >
            {sharing ? 'Preparing…' : `Share ${dogName}'s review`}
          </button>

          {onCooldown && nextDueMs !== null && (
            <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
              {dogName}&apos;s next review is due {formatNextDue(nextDueMs)}. Share this one until then.
            </p>
          )}

          <p className="mt-2 text-[11px] text-brown-light leading-snug text-center">
            A playful star rating written by AI in {dogName}&apos;s voice — not a real score, and never a
            judgement of you.
          </p>
        </>
      )}
    </section>
  );
}
