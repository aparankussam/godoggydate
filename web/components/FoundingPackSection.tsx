'use client';
// web/components/FoundingPackSection.tsx
// Live, honest founding-ladder counter for the homepage. Real scarcity (a
// genuine count from counters/foundingPack), not a fake countdown timer.
//   • #1–50:   free. The section asks people to make a profile.
//   • #51–150: $39 once. The section shows the paid offer.
//   • #151+:   founding is closed. The section says thank you.

import { getFoundingMemberLink } from '../lib/entitlements';
import { useProEntitlement } from '../lib/useProEntitlement';
import {
  FOUNDING_FREE_SPOTS,
  FOUNDING_PAID_SPOTS,
  FOUNDING_TOTAL,
  foundingSpotsLeft,
  useFoundingState,
} from '../lib/founding';
import { getFoundingPackPitch } from '../shared/utils/stripe';
import { trackEvent } from '../lib/analytics';

interface Props {
  signedInUserId: string | null;
  /** Free spots: send them to make a dog profile. */
  onClaimFreeSpot: () => void;
  /** $39 offer while signed out: sign in first, then resume checkout. */
  onRequireAuth: () => void;
}

const FREE_SHARE_PCT = (FOUNDING_FREE_SPOTS / FOUNDING_TOTAL) * 100;

export default function FoundingPackSection({ signedInUserId, onClaimFreeSpot, onRequireAuth }: Props) {
  const { count, phase } = useFoundingState();
  const pitch = getFoundingPackPitch();
  const pro = useProEntitlement(signedInUserId);
  // Signed out still shows the offer (sign-in resumes checkout). Signed in, hide
  // it for anyone who already has Pro or is already a Founding Member, so nobody
  // pays twice.
  const showFoundingOffer =
    phase === 'paid' &&
    Boolean(process.env.NEXT_PUBLIC_FOUNDING_MEMBER_PAYMENT_LINK?.trim()) &&
    !pro.loading &&
    !pro.isPro;

  if (!pitch) return null;

  const filled = count !== null ? Math.min(count, FOUNDING_TOTAL) : 0;
  const pct = count !== null ? Math.round((filled / FOUNDING_TOTAL) * 100) : 0;
  const left = count !== null ? foundingSpotsLeft(count) : 0;

  function handleFoundingMemberClick() {
    trackEvent('founding_member_cta_click', { source: 'homepage' });
    if (!signedInUserId) {
      onRequireAuth();
      return;
    }
    const link = getFoundingMemberLink(signedInUserId);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="bg-cream-dark py-16">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 bg-white border border-border rounded-full px-4 py-2 mb-5">
          <span className="text-sm font-semibold text-rose">⭐ Founding Members</span>
        </div>
        <h2 className="font-display text-3xl md:text-4xl text-brown mb-3">
          {pitch}
        </h2>

        <div className="mt-6 max-w-sm mx-auto">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.1em] text-brown-light mb-1.5">
            <span>{count !== null ? `${filled}/${FOUNDING_TOTAL} spots taken` : 'Loading…'}</span>
            <span>{count !== null ? `${pct}%` : ''}</span>
          </div>
          <div className="relative h-3 rounded-full bg-white border border-border overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
            {/* Where the free spots end and the $39 spots begin. */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 w-0.5 bg-brown/30"
              style={{ left: `${FREE_SHARE_PCT}%` }}
            />
          </div>
          <div className="mt-1 flex text-[11px] font-semibold text-brown-light">
            <span style={{ width: `${FREE_SHARE_PCT}%` }} className="text-left">
              #1–{FOUNDING_FREE_SPOTS} free
            </span>
            <span className="flex-1 text-right">
              #{FOUNDING_FREE_SPOTS + 1}–{FOUNDING_TOTAL} at $39
            </span>
          </div>
        </div>

        {phase === 'free' && (
          <>
            <p className="mt-4 text-sm text-brown-mid">
              {left} of {FOUNDING_FREE_SPOTS} free spots left. Make your dog&apos;s profile to claim one. No
              payment, nothing to cancel.
            </p>
            <button onClick={onClaimFreeSpot} className="btn-primary mt-5 text-base px-7 py-3.5">
              Claim a free spot
            </button>
          </>
        )}

        {phase === 'paid' && (
          <p className="mt-4 text-sm text-brown-mid">
            All {FOUNDING_FREE_SPOTS} free spots are taken. {left} of {FOUNDING_PAID_SPOTS} paid spots left.
          </p>
        )}

        {phase === 'closed' && (
          <p className="mt-4 text-sm text-brown-mid">
            All {FOUNDING_TOTAL} spots are taken, so founding is closed for good. Thank you, pack.
          </p>
        )}

        {showFoundingOffer && (
          <div className="mt-10 rounded-3xl border border-gold/40 bg-white px-6 py-6">
            <h3 className="font-display text-2xl text-brown">Back GoDoggyDate early — $39, once</h3>
            <p className="mt-2 text-sm leading-relaxed text-brown-mid">
              Everything in the app is free today. Founding Members get a permanent Founding Member number
              and every future Pro feature at no extra cost for as long as GoDoggyDate runs. Only{' '}
              {FOUNDING_PAID_SPOTS} paid spots, #{FOUNDING_FREE_SPOTS + 1}–{FOUNDING_TOTAL}. Pro features
              aren&apos;t live yet, so this is mainly a way to support a small, independent app. Refundable
              within 14 days.
            </p>
            <button
              onClick={handleFoundingMemberClick}
              className="btn-primary mt-5 text-base px-7 py-3.5"
            >
              Become a Founding Member — $39 once
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
