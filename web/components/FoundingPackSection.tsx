'use client';
// web/components/FoundingPackSection.tsx
// Live, honest "Founding Pack" counter + pricing story for the homepage.
// Real scarcity (a genuine enrollment count), not a fake countdown timer —
// screenshotting the counter is the marketing.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { getFoundingMemberLink } from '../lib/entitlements';
import { useProEntitlement } from '../lib/useProEntitlement';
import { getFoundingPackPitch, FOUNDING_PACK_SIZE } from '../shared/utils/stripe';
import { trackEvent } from '../lib/analytics';
import { FOUNDING_MEMBER_LIMIT } from '../../shared/pro';

interface Props {
  signedInUserId: string | null;
  onRequireAuth: () => void;
}

export default function FoundingPackSection({ signedInUserId, onRequireAuth }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const pitch = getFoundingPackPitch();
  const pro = useProEntitlement(signedInUserId);
  // Signed out still shows the offer (sign-in resumes checkout). Signed in, hide
  // it for anyone who already has Pro, so nobody pays twice.
  const showFoundingOffer =
    Boolean(process.env.NEXT_PUBLIC_FOUNDING_MEMBER_PAYMENT_LINK?.trim()) && !pro.loading && !pro.isPro;

  useEffect(() => {
    const { db } = getFirebase();
    const unsub = onSnapshot(
      doc(db, 'counters', 'foundingPack'),
      (snap) => setCount((snap.data()?.count as number | undefined) ?? 0),
      () => setCount(null),
    );
    return unsub;
  }, []);

  // Soft-launch pricing already ended (price back to full) — nothing to show.
  if (!pitch) return null;

  const filled = count !== null ? Math.min(count, FOUNDING_PACK_SIZE) : 0;
  const pct = count !== null ? Math.round((filled / FOUNDING_PACK_SIZE) * 100) : 0;

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
          <span className="text-sm font-semibold text-primary">🐾 The Founding Pack</span>
        </div>
        <h2 className="font-display text-3xl md:text-4xl text-brown mb-3">
          {pitch}
        </h2>

        <div className="mt-6 max-w-sm mx-auto">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.1em] text-brown-light mb-1.5">
            <span>{count !== null ? `${filled}/${FOUNDING_PACK_SIZE} dogs` : 'Loading…'}</span>
            <span>{count !== null ? `${pct}%` : ''}</span>
          </div>
          <div className="h-3 rounded-full bg-white border border-border overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <p className="mt-3 text-sm text-brown-mid">
          Free: the first {FOUNDING_PACK_SIZE} dogs with a profile get a numbered spot. No payment needed.
        </p>

        {showFoundingOffer && (
          <div className="mt-10 rounded-3xl border border-gold/40 bg-white px-6 py-6">
            <h3 className="font-display text-2xl text-brown">Back GoDoggyDate early — $39, once</h3>
            <p className="mt-2 text-sm leading-relaxed text-brown-mid">
              Everything in the app is free today. Founding Members get every future Pro feature at no
              extra cost for as long as GoDoggyDate runs. Limited to the first {FOUNDING_MEMBER_LIMIT}
              members. Pro features aren&apos;t live yet, so this is mainly a way to support a small,
              independent app. Refundable within 14 days.
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
