'use client';
// web/components/CompatExplorer.tsx
// "Who does {dog} get along with?" — a gamified TAP-TO-REVEAL explorer that
// replaces the static "plays well with" list on the profile page.
//
// HONEST MECHANIC: a dog's compatible types are DETERMINISTIC from its own
// Dogtype (shared/dogtype.ts). We do NOT fake a quiz that "computes" an answer.
// We already know the vibed-with types via dogtypeBestMatches(code) — we simply
// present them one hidden card at a time as a playful, exploratory reveal. Each
// flip shows the type (emoji + name), its playful vibe tier (dogtypeVibe), and a
// real DENSITY read from a client-side census of all dogs (dogtypeCounts.ts).
// No fabricated numbers: a type with zero real dogs says "you'd be the first".

import { useEffect, useMemo, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { computeDogtype, dogtypeBestMatches, dogtypeVibe } from '../../shared/dogtype';
import type { Dogtype, DogtypeVibe } from '../../shared/dogtype';
import { fetchDogtypeCounts, countForCode } from '../lib/dogtypeCounts';
import type { DogtypeCounts } from '../lib/dogtypeCounts';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';

interface Props {
  savedProfile: SavedDogProfile;
}

const VIBE_META: Record<DogtypeVibe, { label: string; emoji: string }> = {
  great: { label: 'Great match', emoji: '💛' },
  good: { label: 'Good vibe', emoji: '🐾' },
  spicy: { label: 'Spicy — take it slow', emoji: '🌶️' },
};

// Strip the leading "The " so density copy reads "3 Zoomie Menaces", not
// "3 The Zoomie Menaces".
function shortName(name: string): string {
  return name.replace(/^the\s+/i, '');
}

// Light, honest pluralization for the type names we actually ship.
function pluralize(name: string): string {
  const s = shortName(name);
  if (/[^aeiou]y$/i.test(s)) return s.replace(/y$/i, 'ies'); // Butterfly → Butterflies
  if (/(s|x|z|ch|sh|o)$/i.test(s)) return `${s}es`; // Potato → Potatoes, Menace stays below
  return `${s}s`;
}

export default function CompatExplorer({ savedProfile }: Props) {
  const dogtype = computeDogtype(savedProfile);
  const dogName = savedProfile.name?.trim() || 'Your dog';

  // The deterministic vibed-with types (up to 5). Memoized so the reveal order
  // is stable across renders.
  const matches = useMemo<Dogtype[]>(
    () => (dogtype ? dogtypeBestMatches(dogtype.code, 5) : []),
    [dogtype],
  );

  const [revealed, setRevealed] = useState(0);
  const [counts, setCounts] = useState<DogtypeCounts | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDogtypeCounts().then((c) => {
      if (alive) setCounts(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!dogtype || matches.length === 0) return null;

  const allRevealed = revealed >= matches.length;

  function revealNext() {
    if (!dogtype) return;
    const index = revealed;
    const match = matches[index];
    const next = index + 1;
    setRevealed(next);
    feedback.squeak();
    trackEvent('compat_reveal', { code: dogtype.code, match: match.code, index });
    if (next >= matches.length) {
      trackEvent('compat_reveal_complete', { code: dogtype.code, count: matches.length });
    }
  }

  return (
    <div className="mt-4 rounded-xl bg-white/60 border border-border px-3.5 py-4">
      <p className="text-xs font-bold text-brown">Who does {dogName} get along with?</p>
      <p className="mt-1 text-[11px] text-brown-light leading-snug">
        A playful vibe read from the types — not a score. Real matches are worked out dog-by-dog when you swipe.
      </p>

      <ul className="mt-3 space-y-2">
        {matches.map((match, i) => {
          const isRevealed = i < revealed;
          const isNext = i === revealed;

          if (isRevealed) {
            const vibe = dogtypeVibe(dogtype.code, match.code);
            const vm = VIBE_META[vibe];
            const count = counts ? countForCode(counts, match.code) : null;

            return (
              <li
                key={match.code}
                className="rounded-lg border border-gold/40 bg-gradient-to-br from-gold/10 to-primary/5 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {match.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-brown leading-tight">{match.name}</p>
                    <p className="text-[11px] font-semibold text-primary">
                      {vm.emoji} {vm.label}
                    </p>
                  </div>
                </div>

                {/* Honest density — real nationwide count, never fabricated. */}
                <div className="mt-1.5 border-t border-border/60 pt-1.5">
                  {count === null ? (
                    <p className="text-[11px] text-brown-light">Counting GoDoggyDate…</p>
                  ) : count === 0 ? (
                    <p className="text-[11px] text-brown-mid">
                      None yet — {dogName} would be first friends with the first {shortName(match.name)}.
                    </p>
                  ) : (
                    <p className="text-[11px] text-brown-mid leading-snug">
                      <span className="font-bold text-brown">
                        {count} {count === 1 ? shortName(match.name) : pluralize(match.name)}
                      </span>{' '}
                      on GoDoggyDate
                    </p>
                  )}
                </div>
              </li>
            );
          }

          if (isNext) {
            return (
              <li key={match.code}>
                <button
                  type="button"
                  onClick={revealNext}
                  className="w-full rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-3 text-left transition-colors hover:border-primary hover:bg-primary/10"
                  aria-label={`Reveal who ${dogName} vibes with`}
                >
                  <span className="text-sm font-bold text-primary">
                    Tap to reveal who {dogName} vibes with →
                  </span>
                  <span className="mt-0.5 block text-[11px] text-brown-light">
                    {matches.length - revealed} left
                  </span>
                </button>
              </li>
            );
          }

          // Still hidden, further down the deck — a faint locked placeholder.
          return (
            <li
              key={match.code}
              className="rounded-lg border border-border bg-white/40 px-3 py-2.5 opacity-50"
              aria-hidden="true"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none text-brown-light">🐾</span>
                <span className="h-3 w-24 rounded bg-brown-light/20" />
              </div>
            </li>
          );
        })}
      </ul>

      {allRevealed && (
        <div className="mt-3 text-center">
          <p className="text-xs font-semibold text-brown">
            That&apos;s all of {dogName}&apos;s best matches. 🎉
          </p>
          <a
            href={`/compat/${dogtype.code}`}
            onClick={() => trackEvent('compat_link_click', { code: dogtype.code })}
            className="mt-2 inline-block text-[11px] font-bold text-primary underline underline-offset-2"
          >
            See who {dogtype.name} plays with →
          </a>
        </div>
      )}
    </div>
  );
}
