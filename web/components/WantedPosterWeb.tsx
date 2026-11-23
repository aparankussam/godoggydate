'use client';
// web/components/WantedPosterWeb.tsx
// The shareable "WANTED" poster on web — an Old-West parchment card built
// entirely from a dog's REAL stored profile (behaviorFlags / playStyles /
// notGoodWith reworded into frontier comedy by shared/wanted.ts). A pure,
// honest parody: nothing on it is a claim that wasn't already on the profile,
// no fabricated stat. Web port of mobile/components/WantedPosterCard.tsx,
// exported to PNG via the same html2canvas path as DogtypeCard.
//
// Self-contained: computes the poster, renders the capturable card (brand + URL
// baked inside the captured region so a reposted screenshot still carries the
// back-link), and offers a Share button. Works at N=1 — reads only the owner's
// own profile.
//
// The mugshot defaults to the cover photo; the owner can swap in another of the
// dog's photos or one from their device, like the iPhone's "Change the mugshot".
// A device photo stays in this tab as an object URL: it is never uploaded or
// saved to the profile, and html2canvas captures it like any same-origin image.

import { useEffect, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { getHeroPhoto, resolveHeroIndex, getHeroFocus, getRenderablePhotos } from '../lib/photos';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { computeWanted } from '../../shared/wanted';

interface Props {
  savedProfile: SavedDogProfile;
  /** Stable seed for the outlaw alias — pass the owner's uid so the poster
   *  never rerolls between reloads (shared/wanted falls back to name). */
  dogId?: string;
}

// Aged-parchment palette. Kept as inline hex (solid + a solid gradient, no
// backdrop-blur or oklch) so html2canvas captures it faithfully — same
// rationale as DogtypeCard's gradient.
const INK = '#3A2A16';
const INK_SOFT = '#6B4E2E';

interface Mugshot {
  src: string;
  /** True for an object URL made from a file on the owner's device. */
  fromDevice: boolean;
}

export default function WantedPosterWeb({ savedProfile, dogId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sharing, setSharing] = useState(false);
  // null = the cover photo.
  const [mugshot, setMugshot] = useState<Mugshot | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [mugshotError, setMugshotError] = useState<string | null>(null);

  // Free a device photo's object URL once it's replaced or the poster unmounts.
  useEffect(() => {
    if (!mugshot?.fromDevice) return;
    const src = mugshot.src;
    return () => URL.revokeObjectURL(src);
  }, [mugshot]);

  const poster = computeWanted({
    id: dogId,
    name: savedProfile.name,
    breed: savedProfile.breed,
    size: savedProfile.size,
    energyLevel: savedProfile.energyLevel,
    playStyles: savedProfile.playStyles,
    behaviorFlags: savedProfile.behaviorFlags,
    notGoodWith: savedProfile.notGoodWith,
    temperament: savedProfile.temperament,
  });
  if (!poster) return null;

  const dogName = savedProfile.name?.trim() || 'Your dog';
  const heroPhoto = getHeroPhoto(savedProfile.photos, resolveHeroIndex(savedProfile));
  const profilePhotos = getRenderablePhotos(savedProfile.photos);
  const photo = mugshot?.src ?? heroPhoto;
  // The owner's focal point belongs to the cover photo; anything else centres.
  const photoPosition = mugshot ? '50% 50%' : getHeroFocus(savedProfile);

  function pickProfilePhoto(url: string) {
    setMugshotError(null);
    setMugshot(url === heroPhoto ? null : { src: url, fromDevice: false });
    trackEvent('wanted_mugshot_change', { source: 'profile' });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires onChange
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMugshotError("That file isn't a photo. Pick a JPG or PNG.");
      return;
    }
    setMugshotError(null);
    setMugshot({ src: URL.createObjectURL(file), fromDevice: true });
    trackEvent('wanted_mugshot_change', { source: 'device' });
  }

  async function handleShare() {
    if (!cardRef.current || sharing) return;
    setSharing(true);
    trackEvent('wanted_share_click', {});
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-wanted.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `WANTED: ${poster!.alias}`,
          shareText: `WANTED 🤠 ${dogName} a.k.a. ${poster!.alias} — see the charges. Make your dog's Wanted poster on GoDoggyDate.`,
        },
      );
      trackEvent('wanted_shared', { method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border-2 border-brown bg-cream p-5">
      <div className="mb-3">
        <p className="text-xs font-bold text-brown">Just for fun</p>
        <h2 className="font-display text-xl text-brown leading-tight">🤠 {dogName}&apos;s Wanted Poster</h2>
        <p className="mt-1 text-sm text-brown-mid leading-relaxed">
          Every &ldquo;crime&rdquo; is one of {dogName}&apos;s own real traits, reworded into frontier comedy. It&apos;s
          a joke built entirely out of true things.
        </p>
      </div>

      {/* The card itself — this is what gets captured to PNG. */}
      <div className="flex justify-center">
        <div
          ref={cardRef}
          className="relative w-[340px] rounded-md overflow-hidden text-center"
          style={{ background: 'linear-gradient(160deg, #EBDCB8 0%, #E2CFA6 55%, #D8C08C 100%)' }}
        >
          <div
            className="m-2.5 flex flex-col items-center px-5 py-4"
            style={{ border: `3px solid ${INK}` }}
          >
            <p className="font-display leading-none" style={{ fontSize: 52, color: INK, letterSpacing: 4 }}>
              WANTED
            </p>
            <p className="font-bold mt-0.5" style={{ fontSize: 18, color: INK, letterSpacing: 3 }}>
              DEAD OR ALIVE
            </p>
            <p className="italic mt-0.5" style={{ fontSize: 12, color: INK_SOFT }}>
              (prefers alive, for treats)
            </p>

            {/* Mugshot — emoji sits behind the photo so an undecoded remote
                image still captures a meaningful mugshot, not a blank box.
                No crossOrigin (Firebase Storage isn't CORS-configured here);
                shareCard's html2canvas re-fetches with useCORS during capture. */}
            <div
              className="relative mt-3.5 flex items-center justify-center overflow-hidden"
              style={{ width: 180, height: 180, border: `3px solid ${INK}`, backgroundColor: '#CBB488' }}
            >
              <span style={{ fontSize: 72, lineHeight: 1 }} aria-hidden="true">🐕</span>
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo}
                  alt={dogName}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: photoPosition }}
                  onError={() => {
                    // A device file the browser can't decode (HEIC on desktop
                    // Chrome, say): go back to the cover photo and say why.
                    if (mugshot?.fromDevice) {
                      setMugshot(null);
                      setMugshotError("That photo couldn't be opened here. Try a JPG or PNG.");
                    }
                  }}
                />
              )}
              {/* Sepia wash sells the aged-photo look */}
              <div className="absolute inset-0" style={{ backgroundColor: 'rgba(90,60,20,0.22)' }} aria-hidden="true" />
            </div>

            <p className="italic mt-3" style={{ fontSize: 13, color: INK_SOFT }}>
              a.k.a.
            </p>
            <p className="font-display mt-0.5 max-w-full break-words leading-tight" style={{ fontSize: 26, color: INK }}>
              {poster.alias}
            </p>
            <p className="mt-0.5 max-w-full break-words" style={{ fontSize: 11, color: INK_SOFT }}>
              (known to the law as {dogName})
            </p>

            <div className="w-full my-3" style={{ height: 2, backgroundColor: INK, opacity: 0.7 }} />

            <p className="font-bold" style={{ fontSize: 12, color: INK, letterSpacing: 1.5 }}>
              WANTED FOR THE FOLLOWING CRIMES
            </p>
            <div className="w-full mt-2 space-y-1 text-left">
              {poster.crimes.map((c, i) => (
                <p key={i} className="font-semibold leading-snug" style={{ fontSize: 13, color: INK }}>
                  ✧ {c}
                </p>
              ))}
            </div>

            <div
              className="w-full mt-4 flex flex-col items-center px-4 py-2"
              style={{ border: `2px solid ${INK}` }}
            >
              <p className="font-bold" style={{ fontSize: 12, color: INK, letterSpacing: 2 }}>
                REWARD
              </p>
              <p className="font-display mt-0.5 text-center" style={{ fontSize: 18, color: INK }}>
                {poster.reward}
              </p>
            </div>

            {/* Baked-in brand + URL — the reposted PNG carries the back-link. */}
            <div
              className="w-full mt-4 pt-2 flex items-center justify-between"
              style={{ borderTop: `1px solid ${INK_SOFT}` }}
            >
              <p className="font-display" style={{ fontSize: 13, color: INK }}>GoDoggyDate</p>
              <p style={{ fontSize: 10, color: INK_SOFT }}>godoggydate.com</p>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowPicker((open) => !open)}
        aria-expanded={showPicker}
        className="btn-secondary w-full mt-4"
      >
        📸 Change the mugshot
      </button>

      {showPicker && (
        <div className="mt-3 rounded-2xl border-2 border-brown bg-cream p-4">
          {profilePhotos.length > 1 && (
            <>
              <p className="text-xs font-bold text-brown mb-1.5">From {dogName}&apos;s photos</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {profilePhotos.map((url, i) => {
                  const selected = url === photo;
                  return (
                    <button
                      key={`${i}-${url}`}
                      type="button"
                      onClick={() => pickProfilePhoto(url)}
                      aria-label={`Use photo ${i + 1} as the mugshot`}
                      aria-pressed={selected}
                      className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                        selected ? 'border-brown ring-2 ring-primary/30' : 'border-border opacity-80 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className={`flex flex-wrap items-center gap-2 ${profilePhotos.length > 1 ? 'mt-3' : ''}`}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-brown px-4 py-2 text-sm font-bold text-brown hover:bg-cream-dark transition-colors motion-reduce:transition-none"
            >
              🖼 Use a photo from your device
            </button>
            {mugshot && heroPhoto && (
              <button
                type="button"
                onClick={() => { setMugshot(null); setMugshotError(null); }}
                className="rounded-full px-3 py-2 text-sm font-semibold text-brown-mid hover:text-brown transition-colors motion-reduce:transition-none"
              >
                Back to the cover photo
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <p className="mt-2 text-xs text-brown-mid leading-snug">
            A photo from your device stays on it, just for this poster. It isn&apos;t uploaded or saved to {dogName}&apos;s profile.
          </p>
        </div>
      )}

      {mugshotError && <p className="mt-2 text-xs text-brown">{mugshotError}</p>}

      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="btn-secondary w-full mt-3 disabled:opacity-60"
      >
        {sharing ? 'Preparing…' : `Share ${dogName}'s Wanted Poster`}
      </button>

      <p className="mt-2 text-xs text-brown-mid leading-snug text-center">
        The charges are your dog&apos;s real profile traits, played for laughs — the generic ones (soft ears, nap
        crimes) are obviously in on the joke.
      </p>
    </section>
  );
}
