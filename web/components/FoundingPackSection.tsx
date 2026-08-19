'use client';
// web/components/FoundingPackSection.tsx
// Live, honest "Founding Pack" counter + pricing story for the homepage.
// Real scarcity (a genuine enrollment count), not a fake countdown timer —
// screenshotting the counter is the marketing.

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { getFoundingMemberLink } from '../lib/entitlements';
import { getFoundingPackPitch, FOUNDING_PACK_SIZE } from '../shared/utils/stripe';
import { trackEvent } from '../lib/analytics';

interface Props {
  signedInUserId: string | null;
  onRequireAuth: () => void;
}

export default function FoundingPackSection({ signedInUserId, onRequireAuth }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const pitch = getFoundingPackPitch();

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

        <button
          onClick={handleFoundingMemberClick}
          className="btn-primary mt-8 text-base px-7 py-3.5"
        >
          🐾 Or go Founding Member — $39 once, Pro for life
        </button>
      </div>
    </section>
  );
}
