'use client';
// web/components/CompatExplorer.tsx
// "Who does {dog} get along with?" — a gamified TAP-TO-REVEAL explorer on the
// profile page, brought to parity with the mobile version: each revealed match
// now expands to the side-by-side DogtypeCompatCard ("do our dogs get along?"),
// with the type's own blurb, a link to its public page, and — for a type no
// real dog has yet — a growth-framed Invite CTA (the shared image IS the
// invite; copy-only, no attribution backend).
//
// HONEST MECHANIC: a dog's compatible types are DETERMINISTIC from its own
// Dogtype (shared/dogtype.ts). We don't fake a quiz. dogtypeRankedMatches gives
// the "great" vibes ranked by real axis score, so the single strongest match is
// honestly badged "#1" (never over a tie). The density is a real nationwide
// census (dogtypeCounts) — zero is shown as zero, never a fabricated or local
// number.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import {
  computeDogtype,
  dogtypeByCode,
  dogtypeCompat,
  dogtypeRankedMatches,
  dogtypeVibe,
} from '../../shared/dogtype';
import type { DogtypeVibe, RankedDogtype } from '../../shared/dogtype';
import { fetchDogtypeCounts, countForCode } from '../lib/dogtypeCounts';
import type { DogtypeCounts } from '../lib/dogtypeCounts';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import { toDogSlug } from '../lib/dogSlug';
import DogtypeCompatCard from './DogtypeCompatCard';

interface Props {
  savedProfile: SavedDogProfile;
  userId: string;
}

// "vibe", never "match" — mirrors mobile/components/CompatExplorer.tsx and the
// public /compat/[code] page. A Dogtype pairing is a playful vibe, not the real
// mutual-swipe match the rest of the app reserves that word for.
const VIBE_META: Record<DogtypeVibe, { label: string; emoji: string }> = {
  great: { label: 'Great vibe', emoji: '💛' },
  good: { label: 'Good vibe', emoji: '🐾' },
  spicy: { label: 'Spicy', emoji: '🌶️' },
};

// Strip the leading "The " so density copy reads "3 Zoomie Menaces".
function shortName(name: string): string {
  return name.replace(/^the\s+/i, '');
}

// Light, honest pluralization for the type names we actually ship.
function pluralize(name: string): string {
  const s = shortName(name);
  if (/[^aeiou]y$/i.test(s)) return s.replace(/y$/i, 'ies'); // Butterfly → Butterflies
  if (/(s|x|z|ch|sh|o)$/i.test(s)) return `${s}es`; // Potato → Potatoes
  return `${s}s`;
}

export default function CompatExplorer({ savedProfile, userId }: Props) {
  const dogtype = computeDogtype(savedProfile);
  const dogName = savedProfile.name?.trim() || 'Your dog';

  // Ranked by real axis score (best first) so we can honestly badge a clear #1.
  const ranked = useMemo<RankedDogtype[]>(
    () => (dogtype ? dogtypeRankedMatches(dogtype.code, 5) : []),
    [dogtype],
  );

  const [revealed, setRevealed] = useState(0);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [counts, setCounts] = useState<DogtypeCounts | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchDogtypeCounts().then((c) => {
      if (alive) setCounts(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  // One impression per mount, mirroring mobile's compat_explorer_view, so the
  // web reveal/share funnels have a denominator. Guarded on the same condition
  // as the early return below, so it only fires when the explorer is shown.
  useEffect(() => {
    if (dogtype && ranked.length > 0 && !viewedRef.current) {
      viewedRef.current = true;
      trackEvent('compat_explorer_view', { code: dogtype.code, matches: ranked.length });
    }
  }, [dogtype, ranked.length]);

  if (!dogtype || ranked.length === 0) return null;

  const matches = ranked.map((r) => r.type);
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

  function toggleExpand(code: string) {
    setExpandedCode((prev) => {
      const opening = prev !== code;
      if (opening && dogtype) {
        trackEvent('compat_detail_open', { code: dogtype.code, match_code: code });
      }
      return opening ? code : null;
    });
  }

  async function shareCard(matchCode: string, kind: 'share' | 'invite') {
    if (!dogtype || sharing || !cardRef.current) return;
    const other = dogtypeByCode(matchCode);
    const compat = other ? dogtypeCompat(dogtype.code, other.code) : null;
    if (!other || !compat) return;
    setSharing(true);
    trackEvent(kind === 'invite' ? 'compat_invite_click' : 'compat_share_click', {
      a: dogtype.code, b: other.code, vibe: compat.vibe,
    });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const publicUrl = `${origin}/d/${toDogSlug(dogName, userId)}`;
      const result = await shareOrDownloadCard(
        cardRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-${kind}-${other.code}.png`,
        {
          publicUrl,
          dogName,
          shareTitle: 'Do our dogs get along?',
          shareText:
            kind === 'invite'
              ? `Know a ${shortName(other.name)}? ${dogName} is looking for one on GoDoggyDate.`
              : `Does your dog get along with ${dogName}? Find their Dogtype on GoDoggyDate.`,
        },
      );
      trackEvent(kind === 'invite' ? 'compat_invite_shared' : 'compat_shared', {
        a: dogtype.code, b: other.code, vibe: compat.vibe, method: result,
      });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  // The type currently expanded — resolved for the single captured card node.
  const expandedType = expandedCode ? dogtypeByCode(expandedCode) : null;
  const expandedCompat = expandedType ? dogtypeCompat(dogtype.code, expandedType.code) : null;
  // null while the census is still loading — the CTA holds until it resolves so
  // it never flashes "Share this match" for a type that turns out to be zero.
  const expandedIsZero =
    expandedCode && counts ? countForCode(counts, expandedCode) === 0 : null;

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
            const rank = ranked[i];
            const isExpanded = expandedCode === match.code;

            return (
              <li key={match.code}>
                <button
                  type="button"
                  onClick={() => toggleExpand(match.code)}
                  aria-expanded={isExpanded}
                  className="w-full text-left rounded-lg border border-gold/40 bg-gradient-to-br from-gold/10 to-primary/5 px-3 py-2.5 transition-colors hover:border-gold/70"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none" aria-hidden="true">
                      {match.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-brown leading-tight">{match.name}</p>
                      {rank?.isClearTop && (
                        <p className="text-[11px] font-bold text-[#B0761A]">⭐ {dogName}&apos;s #1 easiest match</p>
                      )}
                      <p className="text-[11px] font-semibold text-primary">
                        {vm.emoji} {vm.label}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-primary shrink-0">
                      {isExpanded ? 'Hide ▴' : 'See if you’d get along ▾'}
                    </span>
                  </div>

                  {/* Honest density — real nationwide count, never fabricated. */}
                  <div className="mt-1.5 border-t border-border/60 pt-1.5">
                    {count === null ? (
                      <p className="text-[11px] text-brown-light">Counting GoDoggyDate…</p>
                    ) : count === 0 ? (
                      <p className="text-[11px] text-brown-mid leading-snug">
                        No {pluralize(match.name)} on GoDoggyDate yet — one of {dogName}&apos;s rarer vibes so far, not a dead end.
                      </p>
                    ) : (
                      <p className="text-[11px] text-brown-mid leading-snug">
                        <span className="font-bold text-brown">
                          {count} {count === 1 ? shortName(match.name) : pluralize(match.name)}
                        </span>{' '}
                        on GoDoggyDate — you meet them one swipe at a time.
                      </p>
                    )}
                  </div>
                </button>
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

      {/* Expanded detail — a single instance below the list, driven by which
          card is open. One captured node (cardRef) for the share/invite. */}
      {expandedType && expandedCompat && (
        <div className="mt-3 flex flex-col items-center gap-3">
          <p className="self-stretch text-[13px] italic leading-snug text-brown-mid">
            {expandedType.blurb}
          </p>

          <div ref={cardRef}>
            <DogtypeCompatCard aType={dogtype} bType={expandedType} aName={dogName} compat={expandedCompat} />
          </div>

          {expandedIsZero === null ? (
            // Census still loading — hold the CTA rather than flashing the wrong
            // (Share) branch for a type that may turn out to be zero-count.
            <button type="button" disabled className="btn-primary w-full max-w-[340px] opacity-60">
              Checking GoDoggyDate…
            </button>
          ) : expandedIsZero ? (
            <>
              <button
                type="button"
                onClick={() => shareCard(expandedType.code, 'invite')}
                disabled={sharing}
                className="btn-primary w-full max-w-[340px] disabled:opacity-60"
              >
                {sharing ? 'Preparing…' : `🐾 Invite a ${shortName(expandedType.name)} →`}
              </button>
              <p className="text-[11px] text-brown-light text-center">
                Real matches still happen when you both swipe.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => shareCard(expandedType.code, 'share')}
                disabled={sharing}
                className="btn-primary w-full max-w-[340px] disabled:opacity-60"
              >
                {sharing ? 'Preparing…' : '📤 Share this match'}
              </button>
              <button
                type="button"
                onClick={() => shareCard(expandedType.code, 'invite')}
                disabled={sharing}
                className="text-[13px] font-semibold text-primary disabled:opacity-60"
              >
                🐾 Know another {shortName(expandedType.name)}? Invite them
              </button>
            </>
          )}

          <a
            href={`/dogtype/${expandedType.code}`}
            onClick={() => trackEvent('compat_type_page_click', { code: dogtype.code, match_code: expandedType.code })}
            className="text-[12px] font-bold text-primary underline underline-offset-2"
          >
            See the full {shortName(expandedType.name)} page →
          </a>
        </div>
      )}

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
