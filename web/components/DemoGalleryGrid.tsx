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
import { useState } from 'react';
import type { DiscoverFeedDog } from '../lib/discover';

interface Props {
  dogs: DiscoverFeedDog[];
  /** The signed-in user's dog name, when there is one. Scores are computed
   *  against THEIR dog, and saying so out loud is most of the point. */
  againstDogName?: string;
}

/** The seven axes calculateCompatibility() scores, with their max weights.
 *  Mirrors shared/utils/matchingEngine.ts — if the weights there change,
 *  these must change with them or the bars will misreport. */
const AXES = [
  { key: 'breedScore',     label: 'Breed group', max: 30 },
  { key: 'sizeScore',      label: 'Size safety', max: 20 },
  { key: 'energyScore',    label: 'Energy',      max: 15 },
  { key: 'goodWithScore',  label: 'Gets along',  max: 15 },
  { key: 'playStyleScore', label: 'Play style',  max: 10 },
  { key: 'healthScore',    label: 'Health',      max: 5  },
  { key: 'distanceScore',  label: 'Distance',    max: 5  },
] as const;

const QUALITY_STYLES: Record<string, { chip: string; ring: string }> = {
  perfect: { chip: 'bg-green-100 text-green-800 border-green-300', ring: 'ring-green-400' },
  good:    { chip: 'bg-amber-100 text-amber-800 border-amber-300', ring: 'ring-amber-400' },
  blocked: { chip: 'bg-red-100 text-red-800 border-red-300',       ring: 'ring-red-400'   },
};

export default function DemoGalleryGrid({ dogs, againstDogName }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Without a signed-in dog there is nothing to score against, so
  // buildDemoGalleryDogs returns a zeroed CompatibilityResult. Rendering a 0
  // beside every dog would read as "these are all terrible matches" rather
  // than "we don't know your dog yet" — so fall back to the plain gallery.
  const hasScores = dogs.some((d) => d.compat.score > 0);

  return (
    <div className="w-full max-w-3xl mx-auto text-left">
      <div className="mb-3 rounded-2xl border border-border bg-white/70 px-4 py-3">
        <p className="text-sm font-bold text-brown">
          {hasScores ? 'How matching works' : 'Sample dogs'}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-brown-light">
          {hasScores
            ? `These dogs are samples, but the scores are real — each one runs through the same engine that scores live matches, against ${againstDogName || 'your dog'}.`
            : 'Add your dog’s profile and these samples get scored against yours, so you can see exactly how the engine reaches a number.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dogs.map((dog) => {
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
                      <div className="mt-1 flex flex-col gap-1.5 rounded-xl border border-border bg-cream/70 px-3 py-2.5">
                        {AXES.map((axis) => {
                          const value = compat.breakdown[axis.key] ?? 0;
                          const pct = Math.max(0, Math.min(100, (value / axis.max) * 100));
                          return (
                            <div key={axis.key}>
                              <div className="flex items-center justify-between text-[10px] font-semibold text-brown-light">
                                <span>{axis.label}</span>
                                <span>{Math.round(value)}/{axis.max}</span>
                              </div>
                              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-border">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        {compat.breakdown.penalty > 0 && (
                          <div className="flex items-center justify-between border-t border-border pt-1.5 text-[10px] font-bold text-red-600">
                            <span>Safety penalty</span>
                            <span>−{compat.breakdown.penalty}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-border pt-1.5 text-[11px] font-black text-brown">
                          <span>Match score</span>
                          <span>{compat.score}/100</span>
                        </div>
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
