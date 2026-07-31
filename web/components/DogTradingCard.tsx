'use client';
// web/components/DogTradingCard.tsx
// The shareable "dog trading card" — a 9:16 identity artifact generated
// from a dog's existing profile data. No other users required to be
// worth sharing (unlike match/playdate cards), which is exactly why this
// is the first virality mechanic worth shipping: it works on day one.

import type { SavedDogProfile } from '../lib/auth';
import { getHeroPhoto } from '../lib/photos';
import { breedConfidencePhrase } from '../lib/vibeCheck';
import { FOUNDING_PACK_SIZE } from '../../shared/utils/stripe';

interface Props {
  profile: SavedDogProfile;
  /** Forwarded ref target for html2canvas capture — must wrap the whole card. */
  innerRef?: React.Ref<HTMLDivElement>;
}

function energyLabel(level: number): string {
  if (level >= 75) return 'High energy';
  if (level <= 35) return 'Mellow';
  return 'Balanced';
}

function locationLabel(profile: SavedDogProfile): string {
  if (profile.city && profile.state) return `${profile.city}, ${profile.state}`;
  if (profile.location && !/^\d{5}(-\d{4})?$/.test(profile.location)) return profile.location;
  return 'Somewhere with good parks';
}

export default function DogTradingCard({ profile, innerRef }: Props) {
  const vibeCheck = profile.ai?.vibeCheck;
  // The Vibe Check model already judges which uploaded photo is the
  // clearest, best-lit shot of the dog for a card exactly like this one —
  // previously ignored in favor of whichever photo happened to be first.
  const photo = getHeroPhoto(profile.photos, vibeCheck?.heroPhotoIndex);
  const energy = Math.max(0, Math.min(100, profile.energyLevel ?? 50));
  const tags = [...(profile.playStyles ?? []), ...(profile.temperament ?? [])].slice(0, 3);

  return (
    <div
      ref={innerRef}
      className="relative w-[360px] aspect-[9/16] rounded-[2rem] overflow-hidden shadow-2xl"
      style={{ background: 'linear-gradient(160deg, #3D1F0A 0%, #B45309 55%, #E8633A 100%)' }}
    >
      {/* Founding Pack badge — "1 of {SIZE}" makes the scarcity legible on
          the card itself, not just on the profile page it's exported from. */}
      {typeof profile.foundingPackNumber === 'number' && (
        <div className="absolute top-5 left-5 z-10 rounded-full bg-black/25 backdrop-blur-sm px-3 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
            #{profile.foundingPackNumber} · 1 of {FOUNDING_PACK_SIZE}
          </p>
        </div>
      )}

      {/* Vibe Check type-code stamp — the model's 4-letter read on this dog,
          previously computed and stored but never shown anywhere. Replaces
          the purely decorative paw emoji that used to sit here. */}
      {vibeCheck?.archetype.code ? (
        <div className="absolute top-5 right-5 z-10 rounded-md bg-black/30 backdrop-blur-sm px-2.5 py-1.5">
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-gold">
            {vibeCheck.archetype.code}
          </p>
        </div>
      ) : (
        <div className="absolute top-5 right-5 z-10 text-2xl select-none" aria-hidden="true">🐾</div>
      )}

      {/* Photo */}
      <div className="absolute inset-0">
        {photo ? (
          // No crossOrigin here: Firebase Storage isn't CORS-configured for
          // this origin, so requesting the image as CORS makes the browser
          // refuse to load it at all (falls back to the gradient below,
          // which is why the photo went missing on screen). The share/
          // download capture (web/lib/shareCard.ts) already re-fetches this
          // image with its own useCORS option during html2canvas capture,
          // independent of this element's crossOrigin — so nothing here is
          // needed for that path to keep working.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={profile.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-8xl">🐕</div>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(45,26,14,0.95) 0%, rgba(45,26,14,0.55) 35%, rgba(45,26,14,0.05) 60%, transparent 75%)' }}
        />
      </div>

      {/* Info panel */}
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-10">
        {/* Vibe Check's named archetype — the most shareable, distinctive
            thing the app generates about this dog, previously rendered on
            no surface at all including this one. */}
        {vibeCheck?.archetype.name && (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">
            ✨ {vibeCheck.archetype.name}
          </p>
        )}
        <h3 className="font-display text-4xl text-white leading-tight">{profile.name}</h3>
        <p className="mt-1 text-white/85 text-sm font-semibold">
          {[profile.breed, profile.age, profile.size].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-0.5 text-white/65 text-xs">{locationLabel(profile)}</p>
        {/* Mutt Meter — the breed guess Vibe Check already makes, framed
            honestly as a guess (never certain fact — see the vibe-check
            prompt's trust-sensitivity note for mixes/rescues). */}
        {vibeCheck?.breedGuess && (
          <p className="mt-1 text-white/55 text-[11px]">
            🔍 AI&apos;s read: {vibeCheck.breedGuess.name} · {breedConfidencePhrase(vibeCheck.breedGuess.confidence)}
          </p>
        )}

        {/* Energy stat bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-gold mb-1">
            <span>{energyLabel(energy)}</span>
            <span>{energy}/100</span>
          </div>
          <div className="h-2 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full bg-gold" style={{ width: `${energy}%` }} />
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/12 border border-white/20 px-2.5 py-1 text-[10px] font-semibold text-white"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between">
          <p className="font-display text-sm text-white">GoDoggyDate</p>
          <p className="text-[10px] text-white/50">godoggydate.com</p>
        </div>
      </div>
    </div>
  );
}
