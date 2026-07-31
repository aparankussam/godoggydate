'use client';
// web/components/DemoGalleryGrid.tsx
// "See how matching works" — a clearly-labeled, READ-ONLY demonstration of
// the real matching engine. Never rendered as a swipeable deck: a demo card
// that can be liked is indistinguishable from a real one until the toast
// fires after the fact, which is exactly the authenticity gap this replaces
// (see web/lib/discover.ts's buildDemoGalleryDogs for the full rationale).
//
// This used to render a photo, a name, and a breed — nothing else. That made
// the label a lie: it promised to show how matching works and showed a
// contact sheet instead. Meanwhile buildDemoGalleryDogs was ALREADY computing
// a full CompatibilityResult for every dog (score, quality tier, per-axis
// breakdown, reasons, and safety warnings from detectUnsafePairings) and this
// component discarded all of it.
//
// Now it renders that result: the score, why the engine reached it, and what
// it would warn you about before a meetup. Expanding a dog shows the per-axis
// breakdown, which is the actual answer to "how does matching work".
import { useMemo, useState } from 'react';
import { buildDemoGalleryDogs, buildDemoViewerDog } from '../lib/discover';
import type { DiscoverFeedDog } from '../lib/discover';
import type { DogSize } from '../../shared/types';
import CompatBreakdown, { QUALITY_STYLES } from './CompatBreakdown';

interface Props {
  dogs: DiscoverFeedDog[];
  /** The signed-in user's dog name, when there is one. Scores are computed
   *  against THEIR dog, and saying so out loud is most of the point. */
  againstDogName?: string;
  /** Signed-out mode: the viewer has no dog, so let them sketch one and
   *  re-score live. A demo that only shows a verdict teaches nothing; one
   *  where the number moves as you drag proves the score is caused by the
   *  inputs rather than decoration. */
  interactive?: boolean;
}

const SIZES: { value: DogSize; label: string }[] = [
  { value: 'S',  label: 'Small'  },
  { value: 'M',  label: 'Medium' },
  { value: 'L',  label: 'Large'  },
  { value: 'XL', label: 'Giant'  },
];

export default function DemoGalleryGrid({ dogs, againstDogName, interactive = false }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [size, setSize] = useState<DogSize>('M');
  const [energy, setEnergy] = useState(60);

  // In interactive mode the component owns the viewer dog and re-scores the
  // whole cast on every change. calculateCompatibility is a pure synchronous
  // function over in-memory seed data — no Firestore read, no API call, no
  // auth — so re-scoring 15 dogs on a slider drag is trivially cheap.
  const scored = useMemo(
    () => (interactive
      ? buildDemoGalleryDogs(buildDemoViewerDog({ size, energyLevel: energy }))
      : dogs),
    [interactive, dogs, size, energy],
  );

  const hasScores = scored.some((d) => d.compat.score > 0);

  return (
    <div className="w-full max-w-3xl mx-auto text-left">
      <div className="mb-3 rounded-2xl border border-border bg-white/70 px-4 py-3">
        <p className="text-sm font-bold text-brown">How matching works</p>
        <p className="mt-0.5 text-xs leading-relaxed text-brown-light">
          {interactive
            ? 'These dogs are samples, but the scoring is the real engine. Describe a dog below and watch every score change — including the ones it refuses to recommend.'
            : `These dogs are samples, but the scores are real — each one runs through the same engine that scores live matches, against ${againstDogName || 'your dog'}.`}
        </p>

        {interactive && (
          <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brown-light">
                Your dog’s size
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSize(s.value)}
                    aria-pressed={size === s.value}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      size === s.value
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-white text-brown hover:bg-cream-dark/60'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brown-light">
                  Energy
                </p>
                <span className="text-[11px] font-bold text-brown">{energy}/100</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={energy}
                onChange={(e) => setEnergy(Number(e.target.value))}
                aria-label="Your dog’s energy level"
                className="mt-1.5 w-full accent-primary"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {scored.map((dog) => {
          const { compat } = dog;
          const open = openId === dog.id;
          const styles = QUALITY_STYLES[compat.quality] ?? QUALITY_STYLES.good;
          const scored = hasScores && compat.score > 0;

          return (
            <div
              key={dog.id}
              className="relative rounded-2xl overflow-hidden border border-border bg-white flex flex-col"
            >
              <div className="relative aspect-[4/3] bg-gradient-to-br from-cream-dark to-cream flex items-center justify-center">
                <span className="absolute top-2 left-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                  Demo
                </span>
                {dog.photos?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dog.photos[0]} alt={dog.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">🐕</span>
                )}

                {scored && (
                  <div className={`absolute right-2 top-2 z-10 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white bg-black/45 text-lg font-black text-white shadow-lg ring-2 ${styles.ring}`}>
                    {compat.score}
                  </div>
                )}
              </div>

              <div className="px-3 py-3 flex flex-col gap-2">
                <div>
                  <p className="text-sm font-bold text-brown truncate">{dog.name}</p>
                  <p className="text-[11px] text-brown-light truncate">
                    {[dog.breed, dog.age, dog.size].filter(Boolean).join(' · ')}
                  </p>
                </div>

                {scored && (
                  <>
                    <span className={`self-start rounded-full border px-2.5 py-1 text-[10px] font-bold ${styles.chip}`}>
                      {compat.label}
                    </span>

                    {/* Why the engine landed where it did. */}
                    {compat.reasons.length > 0 && (
                      <ul className="flex flex-col gap-0.5">
                        {compat.reasons.map((reason) => (
                          <li key={reason} className="text-[11px] text-brown-mid flex items-start gap-1.5">
                            <span className="mt-0.5 leading-none text-green-600">✔</span>
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* The safety branch — the part an owner most needs before
                        agreeing to put two dogs in a park together. */}
                    {compat.warnings.length > 0 && (
                      <ul className="flex flex-col gap-0.5">
                        {compat.warnings.map((warning) => (
                          <li key={warning} className="text-[11px] font-semibold text-amber-700 flex items-start gap-1.5">
                            <span className="mt-0.5 leading-none">⚠</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : dog.id)}
                      aria-expanded={open}
                      className="self-start text-[11px] font-semibold text-primary underline underline-offset-2 transition-colors hover:text-primary-dark"
                    >
                      {open ? 'Hide the math' : 'Show the math'}
                    </button>

                    {open && (
                      <div className="mt-1">
                        <CompatBreakdown breakdown={compat.breakdown} score={compat.score} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
