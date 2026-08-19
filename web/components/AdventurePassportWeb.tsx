'use client';
// web/components/AdventurePassportWeb.tsx
// The Dog Bucket List / Adventure Passport on web — a deck of playful real-world
// quests (shared/adventures.ts) the owner stamps off, plus a shareable passport
// summary card. Web port of mobile/app/fun/adventures.tsx +
// AdventurePassportCard.tsx.
//
// Honest by construction: completion is the owner's OWN checklist (no claim is
// made about the dog), stored locally in localStorage keyed by dog — no
// Firestore write, no rules change, no server dependency. The passport count is
// a literal count of the owner's checked-off quests. Exported to PNG via the
// same html2canvas path as DogtypeCard (brand + URL baked inside the capture).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { getHeroPhoto } from '../lib/photos';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { adventuresFor, ADVENTURE_COUNT } from '../../shared/adventures';

interface Props {
  savedProfile: SavedDogProfile;
  /** Local completion is keyed by dog — pass the owner's uid. Falls back to the
   *  dog's name so the checklist still persists for a signed-out preview. */
  dogId?: string;
}

type CompletedMap = Record<string, number>;

const storageKey = (dogId: string) => `godoggydate.adventures.${dogId}`;

// SSR-safe load/save (localStorage keyed by dog). Guarded so a missing/blocked
// store or bad JSON never throws — the live in-memory state is authoritative.
function loadCompleted(dogId: string): CompletedMap {
  if (typeof window === 'undefined' || !dogId) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(dogId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: CompletedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function saveCompleted(dogId: string, map: CompletedMap): void {
  if (typeof window === 'undefined' || !dogId) return;
  try {
    window.localStorage.setItem(storageKey(dogId), JSON.stringify(map));
  } catch {
    /* non-critical */
  }
}

export default function AdventurePassportWeb({ savedProfile, dogId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [completed, setCompleted] = useState<CompletedMap>({});
  const [ready, setReady] = useState(false);

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(savedProfile.photos, savedProfile.ai?.vibeCheck?.heroPhotoIndex);
  const key = dogId || savedProfile.name || 'dog';

  const deck = useMemo(
    () => adventuresFor({ energyLevel: savedProfile.energyLevel, size: savedProfile.size }),
    [savedProfile.energyLevel, savedProfile.size],
  );

  // Load persisted completion on mount / when the dog changes (client-only).
  useEffect(() => {
    setCompleted(loadCompleted(key));
    setReady(true);
    trackEvent('adventures_open', {});
  }, [key]);

  function toggle(id: string) {
    if (!ready) return;
    setCompleted((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = Date.now();
        trackEvent('adventure_stamped', { quest: id });
      }
      saveCompleted(key, next);
      return next;
    });
  }

  // Count only quests that still exist in the current deck, so a stale/renamed
  // localStorage key can't push the count past the total (e.g. "19/18").
  const completedAdventures = deck.filter((a) => completed[a.id]);
  const doneCount = completedAdventures.length;
  const stamps = completedAdventures.slice(0, 12);
  const pct = Math.min(100, Math.round((doneCount / ADVENTURE_COUNT) * 100));

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('adventures_share_click', { done: doneCount });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-passport.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `${dogName}'s Adventure Passport`,
          shareText: `${dogName} has stamped ${doneCount}/${ADVENTURE_COUNT} adventures 🗺️ on GoDoggyDate. What's on your dog's bucket list?`,
        },
      );
      trackEvent('adventures_shared', { done: doneCount, method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">🗺️ {dogName}&apos;s Adventure Passport</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          A bucket list picked to fit {dogName}. Stamp a quest when you two actually pull it off — it&apos;s your own
          checklist, saved on this device.
        </p>
      </div>

      {/* The passport summary — this is what gets captured to PNG. */}
      <div className="flex justify-center">
        <div
          ref={cardRef}
          className="relative w-[320px] rounded-[1.6rem] overflow-hidden text-white flex flex-col"
          style={{ minHeight: 360, padding: 20, background: 'linear-gradient(160deg, #1F3A2E 0%, #2E5A43 60%, #5C8A6A 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">Adventure Passport</p>
              <p className="font-display text-3xl leading-tight mt-0.5">{dogName}</p>
            </div>
            {/* Emoji behind the photo so an undecoded remote image still captures. */}
            <div
              className="relative flex items-center justify-center rounded-full overflow-hidden shrink-0"
              style={{ width: 56, height: 56, border: '2px solid rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden="true">🐕</span>
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt={dogName} className="absolute inset-0 w-full h-full object-cover" />
              )}
            </div>
          </div>

          <div className="flex items-end gap-1.5 mt-4">
            <span className="font-display leading-none" style={{ fontSize: 56 }}>{doneCount}</span>
            <span className="font-semibold text-white/80 mb-2 text-sm">/ {ADVENTURE_COUNT} quests stamped</span>
          </div>

          <div className="flex flex-wrap gap-2.5 mt-4">
            {stamps.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-center rounded-full"
                style={{ width: 52, height: 52, border: '2px dashed rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">{a.emoji}</span>
              </div>
            ))}
            {doneCount === 0 && (
              <p className="text-sm text-white/75 py-5">No stamps yet — the adventure starts now.</p>
            )}
          </div>

          {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
          <div
            className="mt-auto pt-4 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}
          >
            <p className="font-display text-sm">GoDoggyDate</p>
            <p className="text-[10px] text-white/60">godoggydate.com</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="btn-primary w-full mt-4 disabled:opacity-60"
      >
        {sharing ? 'Preparing…' : 'Share the passport'}
      </button>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-brown-light mb-1">
          <span>Progress</span>
          <span>{doneCount} / {ADVENTURE_COUNT}</span>
        </div>
        <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Interactive quest checklist (outside the capture region) */}
      <div className="mt-4 space-y-2">
        {deck.map((a) => {
          const done = Boolean(completed[a.id]);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              aria-pressed={done}
              className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors motion-reduce:transition-none ${
                done ? 'bg-primary/10 border-primary/40' : 'bg-white border-border hover:border-primary/40'
              }`}
            >
              <span
                className={`flex items-center justify-center rounded-full shrink-0 ${done ? 'bg-primary/15' : 'bg-cream-dark'}`}
                style={{ width: 42, height: 42 }}
                aria-hidden="true"
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{a.emoji}</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block font-bold text-sm ${done ? 'text-primary' : 'text-brown'}`}>{a.title}</span>
                <span className="block text-xs text-brown-light leading-snug">{a.blurb}</span>
              </span>
              <span
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide ${
                  done ? 'bg-primary border-primary text-white' : 'border-primary text-primary'
                }`}
              >
                {done ? '✓' : 'STAMP'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-brown-light leading-snug text-center">
        Your own checklist — stamp a quest when you and {dogName} pull it off. 🐾 Saved on this device.
      </p>
    </section>
  );
}
