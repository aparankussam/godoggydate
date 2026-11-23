'use client';
// web/components/AdventurePassportWeb.tsx
// The Dog Bucket List / Adventure Passport on web — a deck of playful real-world
// quests (shared/adventures.ts) the owner stamps off, plus a shareable passport
// summary card. Web port of mobile/app/fun/adventures.tsx +
// AdventurePassportCard.tsx.
//
// Honest by construction: completion is the owner's OWN checklist (no claim is
// made about the dog), stored in localStorage keyed by dog and synced with the
// iPhone app through lib/progressSync. The passport count is a literal count of
// the owner's checked-off quests. Exported to PNG via the same html2canvas path
// as DogtypeCard (brand + URL baked inside the capture).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { getHeroPhoto, resolveHeroIndex, getHeroFocus } from '../lib/photos';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { loadAdventures, onProgressChange, setAdventureDone } from '../lib/progressSync';
import { adventuresFor, ADVENTURE_COUNT } from '../../shared/adventures';

interface Props {
  savedProfile: SavedDogProfile;
  /** Local completion is keyed by dog — pass the owner's uid. Falls back to the
   *  dog's name so the checklist still persists for a signed-out preview. */
  dogId?: string;
}

type CompletedMap = Record<string, number>;

export default function AdventurePassportWeb({ savedProfile, dogId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [completed, setCompleted] = useState<CompletedMap>({});
  const [ready, setReady] = useState(false);

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(savedProfile.photos, resolveHeroIndex(savedProfile));
  const key = dogId || savedProfile.name || 'dog';

  const deck = useMemo(
    () => adventuresFor({ energyLevel: savedProfile.energyLevel, size: savedProfile.size }),
    [savedProfile.energyLevel, savedProfile.size],
  );

  // Load persisted completion on mount / when the dog changes (client-only),
  // and again when stamps synced from the iPhone app land.
  useEffect(() => {
    setCompleted(loadAdventures(key));
    setReady(true);
    trackEvent('adventures_open', {});
    return onProgressChange(() => setCompleted(loadAdventures(key)));
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
      setAdventureDone(key, id, Boolean(next[id]));
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
    <section className="rounded-2xl border-2 border-brown bg-cream-dark/30 p-5">
      <div className="mb-3">
        <p className="text-xs font-bold text-brown">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">🗺️ {dogName}&apos;s Adventure Passport</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          A bucket list picked to fit {dogName}. Stamp a quest when you two actually pull it off — it&apos;s your own
          checklist, {dogId ? 'saved to your account' : 'saved on this device'}.
        </p>
      </div>

      {/* The passport summary — this is what gets captured to PNG. */}
      <div className="flex justify-center">
        <div
          ref={cardRef}
          className="relative w-[320px] rounded-[1.6rem] overflow-hidden text-white flex flex-col"
          style={{ minHeight: 360, padding: 20, background: 'linear-gradient(160deg, #2A1F4A 0%, #4A3F6E 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-black text-white">Adventure Passport</p>
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
                <img src={photo} alt={dogName} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: getHeroFocus(savedProfile) }} />
              )}
            </div>
          </div>

          <div className="flex items-end gap-1.5 mt-4">
            <span className="font-display leading-none" style={{ fontSize: 56 }}>{doneCount}</span>
            <span className="font-semibold text-white mb-2 text-sm">/ {ADVENTURE_COUNT} quests stamped</span>
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
              <p className="text-sm text-white py-5">No stamps yet — the adventure starts now.</p>
            )}
          </div>

          {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
          <div
            className="mt-auto pt-4 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}
          >
            <p className="font-display text-sm">GoDoggyDate</p>
            <p className="text-xs text-white">godoggydate.com</p>
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
        <div className="flex items-center justify-between text-xs font-bold text-brown-mid mb-1">
          <span>Progress</span>
          <span>{doneCount} / {ADVENTURE_COUNT}</span>
        </div>
        <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
          <div className="h-full rounded-full bg-brown" style={{ width: `${pct}%` }} />
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
                done ? 'bg-note border-brown' : 'bg-cream border-brown/40'
              }`}
            >
              <span
                className={`flex items-center justify-center rounded-full shrink-0 ${done ? 'bg-cream' : 'bg-cream-dark'}`}
                style={{ width: 42, height: 42 }}
                aria-hidden="true"
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{a.emoji}</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block font-bold text-sm ${done ? 'text-brown' : 'text-brown'}`}>{a.title}</span>
                <span className="block text-xs text-brown-mid leading-snug">{a.blurb}</span>
              </span>
              <span
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold tracking-wide ${
                  done ? 'bg-brown border-brown text-cream' : 'border-brown text-brown'
                }`}
              >
                {done ? '✓' : 'STAMP'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-brown-mid leading-snug text-center">
        Your own checklist — stamp a quest when you and {dogName} pull it off. 🐾{' '}
        {dogId ? 'Saved to your account.' : 'Saved on this device.'}
      </p>
    </section>
  );
}
