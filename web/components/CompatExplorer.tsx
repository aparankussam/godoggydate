'use client';
// web/components/CompatExplorer.tsx
// "Who does {dog} get along with?" — the profile-page explorer. The single
// strongest match is FREE; every other match is LOCKED until the owner earns a
// key. Two honest ways to earn one (see lib/revealUnlocks):
//   • reach a Snoot Boop milestone (booping is free and fast), or
//   • invite a friend (the shared card IS the invite).
// This turns the explorer into a lure toward the games + the invite loop,
// instead of handing every vibe away on a free tap.
//
// HONEST MECHANIC: a dog's compatible types are DETERMINISTIC from its own
// Dogtype (shared/dogtype.ts). dogtypeRankedMatches gives the "great" vibes
// ranked by real axis score, so the single strongest is honestly badged "#1"
// (never over a tie). Density is a real nationwide census (dogtypeCounts) — zero
// is shown as zero, never fabricated. A key is always a real thing the owner did
// (booped, or shared an invite), never invented.

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
import { loadAllTime, nextMilestone } from '../lib/boops';
import { loadUnlocks, recordInvite, unlockedExtra } from '../lib/revealUnlocks';
import { shareOrDownloadCard } from '../lib/shareCard';
import { trackEvent } from '../lib/analytics';
import { feedback } from '../lib/feedback';
import { toDogSlug } from '../lib/dogSlug';
import DogtypeCompatCard from './DogtypeCompatCard';

interface Props {
  savedProfile: SavedDogProfile;
  userId: string;
}

// "vibe", never "match" — mirrors mobile and the public /compat/[code] page. A
// Dogtype pairing is a playful vibe, not the real mutual-swipe match.
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

  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [counts, setCounts] = useState<DogtypeCounts | null>(null);
  const [sharing, setSharing] = useState(false);
  // Lazy init reads the ledger synchronously (localStorage is sync on web), so
  // invite-earned keys count on the FIRST paint — matching the boop keys, which
  // are already read synchronously in render. No locked→unlocked flicker.
  const [invitedCodes, setInvitedCodes] = useState<string[]>(() =>
    userId ? loadUnlocks(userId).invitedCodes : [],
  );
  // Bumped on window focus so boop keys earned on the Snoot Boop screen are
  // re-read when the owner returns to the profile tab.
  const [unlockTick, setUnlockTick] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const lockedCardRef = useRef<HTMLDivElement>(null);
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

  // Load the local unlock ledger, and re-read boop-derived keys on refocus.
  useEffect(() => {
    if (!userId) return;
    setInvitedCodes(loadUnlocks(userId).invitedCodes);
    const onFocus = () => setUnlockTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId]);

  // One impression per mount, mirroring mobile, so the funnels have a denominator.
  useEffect(() => {
    if (dogtype && ranked.length > 0 && !viewedRef.current) {
      viewedRef.current = true;
      trackEvent('compat_explorer_view', { code: dogtype.code, matches: ranked.length });
    }
  }, [dogtype, ranked.length]);

  const matches = useMemo(() => ranked.map((r) => r.type), [ranked]);
  const lockedTotal = Math.max(0, matches.length - 1);

  // How many locked matches are unlocked (beyond the free first). When there is
  // no signed-in dogId we don't gate at all rather than trap the owner.
  const extra = useMemo(
    () => (userId ? unlockedExtra(userId, invitedCodes, lockedTotal) : lockedTotal),
    // unlockTick is intentional: unlockedExtra reads the boop count from
    // localStorage, so a focus-driven tick must recompute it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, invitedCodes, lockedTotal, unlockTick],
  );
  const revealed = matches.length > 0 ? Math.min(matches.length, 1 + extra) : 0;
  const allRevealed = revealed >= matches.length;

  // Boop progress toward the next key (for the locked-card lure). Read live; the
  // unlockTick dep keeps it fresh after refocus.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- unlockTick forces a re-read of the localStorage boop count on refocus
  const allTime = useMemo(() => (userId ? loadAllTime(userId) : 0), [userId, unlockTick]);
  const boopsToNextKey = useMemo(() => {
    const m = nextMilestone(allTime);
    return m ? m.count - allTime : null;
  }, [allTime]);

  if (!dogtype || ranked.length === 0) return null;

  function toggleExpand(code: string) {
    setExpandedCode((prev) => {
      const opening = prev !== code;
      if (opening && dogtype) {
        trackEvent('compat_detail_open', { code: dogtype.code, match_code: code });
      }
      return opening ? code : null;
    });
  }

  // Distinct analytics per share entry point. The unlock-invite fires its OWN
  // events (identical names to mobile) so it isn't conflated with the
  // expanded-card invite, and cross-platform funnels line up.
  const SHARE_EVENTS = {
    share: { click: 'compat_share_click', done: 'compat_shared' },
    invite: { click: 'compat_invite_click', done: 'compat_invite_shared' },
    unlock: { click: 'compat_explorer_unlock_invite', done: 'compat_explorer_unlock_invite_shared' },
  } as const;
  type ShareKind = keyof typeof SHARE_EVENTS;

  async function shareNode(node: HTMLDivElement, matchCode: string, kind: ShareKind) {
    if (!dogtype || sharing) return;
    const other = dogtypeByCode(matchCode);
    const compat = other ? dogtypeCompat(dogtype.code, other.code) : null;
    if (!other || !compat) return;
    setSharing(true);
    const isInvite = kind !== 'share';
    trackEvent(SHARE_EVENTS[kind].click, { a: dogtype.code, b: other.code, vibe: compat.vibe });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const publicUrl = `${origin}/d/${toDogSlug(dogName, userId)}`;
      const result = await shareOrDownloadCard(
        node,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-${kind}-${other.code}.png`,
        {
          publicUrl,
          dogName,
          shareTitle: 'Do our dogs get along?',
          shareText: isInvite
            ? `Know a ${shortName(other.name)}? ${dogName} is looking for one on GoDoggyDate.`
            : `Does your dog get along with ${dogName}? Find their Dogtype on GoDoggyDate.`,
        },
      );
      trackEvent(SHARE_EVENTS[kind].done, { a: dogtype.code, b: other.code, vibe: compat.vibe, method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  function shareCard(matchCode: string, kind: 'share' | 'invite') {
    if (cardRef.current) void shareNode(cardRef.current, matchCode, kind);
  }

  // Invite-to-unlock on the locked card: share the (hidden) card for the next
  // locked match, then bank the key so the card reveals. Sharing is best-effort;
  // the key is granted after the attempt so the unlock always lands.
  async function handleUnlockInvite() {
    if (!dogtype) return;
    const next = matches[revealed];
    if (!next) return;
    // 'unlock' fires its own analytics (see SHARE_EVENTS) so it isn't counted as
    // an expanded-card invite. The key is banked after the attempt either way.
    if (lockedCardRef.current) await shareNode(lockedCardRef.current, next.code, 'unlock');
    const state = recordInvite(userId, next.code);
    setInvitedCodes(state.invitedCodes);
    feedback.squeak();
  }

  // The type currently expanded — resolved for the single captured card node.
  const expandedType = expandedCode ? dogtypeByCode(expandedCode) : null;
  const expandedCompat = expandedType ? dogtypeCompat(dogtype.code, expandedType.code) : null;
  const expandedIsZero =
    expandedCode && counts ? countForCode(counts, expandedCode) === 0 : null;

  // The next locked match — rendered hidden so the unlock-invite can capture it.
  const nextLockedType = revealed < matches.length ? matches[revealed] : null;
  const nextLockedCompat = nextLockedType ? dogtypeCompat(dogtype.code, nextLockedType.code) : null;
  const lockedRemaining = matches.length - revealed;

  return (
    <div className="mt-4 rounded-xl bg-white/60 border border-border px-3.5 py-4">
      <p className="text-xs font-bold text-brown">Who does {dogName} get along with?</p>
      <p className="mt-1 text-[11px] text-brown-light leading-snug">
        A playful vibe read from the types — not a score. Real matches are worked out dog-by-dog when you swipe.
      </p>

      <ul className="mt-3 space-y-2">
        {matches.map((match, i) => {
          const isRevealed = i < revealed;
          const isNextLocked = i === revealed;

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

          if (isNextLocked) {
            // The lure: hint there ARE more good matches, and offer the two
            // honest ways to earn the key that reveals the next one.
            return (
              <li key={match.code}>
                <div className="rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none" aria-hidden="true">🔒</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-brown leading-tight">
                        {lockedRemaining} more great {lockedRemaining === 1 ? 'vibe' : 'vibes'} for {dogName}
                      </p>
                      <p className="text-[11px] text-brown-light">
                        Earn a key to reveal the next one — {dogName}&apos;s kind of dog is out there.
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
                    <a
                      href="/app/fun/snoot"
                      onClick={() => trackEvent('compat_explorer_unlock_boop_click', { code: dogtype.code })}
                      className="flex-1 rounded-full border border-primary/40 bg-white/70 px-3 py-2 text-center text-[12px] font-bold text-primary transition-colors hover:bg-white"
                    >
                      🐽 Boop {dogName}
                      {boopsToNextKey !== null && (
                        <span className="ml-1 font-semibold text-brown-light">({boopsToNextKey} to a key)</span>
                      )}
                    </a>
                    <button
                      type="button"
                      onClick={handleUnlockInvite}
                      disabled={sharing}
                      className="flex-1 rounded-full bg-primary px-3 py-2 text-center text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {sharing ? 'Preparing…' : '📤 Invite a friend to unlock'}
                    </button>
                  </div>
                </div>
              </li>
            );
          }

          // Locked, further down the deck — a faint placeholder.
          return (
            <li
              key={match.code}
              className="rounded-lg border border-border bg-white/40 px-3 py-2.5 opacity-50"
              aria-hidden="true"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none text-brown-light">🔒</span>
                <span className="h-3 w-24 rounded bg-brown-light/20" />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Browse-all link — an always-available way to explore every type, so the
          locked matches never feel like a wall. */}
      <a
        href="/dogtype"
        onClick={() => trackEvent('compat_explorer_browse_all_click', { code: dogtype.code })}
        className="mt-2.5 inline-block text-[11px] font-bold text-primary underline underline-offset-2"
      >
        Browse all 16 Dogtypes →
      </a>

      {/* Expanded detail — a single instance, driven by which revealed card is
          open. One captured node (cardRef) for the share/invite. */}
      {expandedType && expandedCompat && (
        <div className="mt-3 flex flex-col items-center gap-3">
          <p className="self-stretch text-[13px] italic leading-snug text-brown-mid">
            {expandedType.blurb}
          </p>

          <div ref={cardRef}>
            <DogtypeCompatCard aType={dogtype} bType={expandedType} aName={dogName} compat={expandedCompat} />
          </div>

          {expandedIsZero === null ? (
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

      {/* Hidden capture node for the locked-card invite (off-screen). */}
      {nextLockedType && nextLockedCompat && (
        <div ref={lockedCardRef} className="fixed -left-[9999px] top-0" aria-hidden="true">
          <DogtypeCompatCard aType={dogtype} bType={nextLockedType} aName={dogName} compat={nextLockedCompat} />
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
