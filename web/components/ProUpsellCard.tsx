'use client';
// web/components/ProUpsellCard.tsx
// The goDoggyDate Pro surface: shows Pro's value and (when configured) starts a
// monthly/annual checkout, or — for an existing subscriber — a "manage plan"
// link to the Stripe billing portal. Founding Members see a grandfathered
// "Pro for life" state and no upsell.
//
// Honesty: the benefit list only names what Pro actually does now; anything not
// yet shipped is explicitly framed as "coming to Pro", never claimed as live.
// The live checkout is env-gated (isProConfigured) so nothing half-works — until
// the founder sets the Stripe Prices + NEXT_PUBLIC_PRO_ENABLED, this shows the
// value and a "coming soon" state instead of a button that errors.

import { useState } from 'react';
import { startProCheckout, openProPortal, isProConfigured } from '../lib/pro';
import { trackEvent } from '../lib/analytics';
import {
  proMonthlyLabel,
  proAnnualLabel,
  proAnnualPerMonthLabel,
  proAnnualSavingsPercent,
  PRO_TRIAL_DAYS,
  type ProTier,
  type ProSource,
} from '../../shared/pro';

interface Props {
  isPro: boolean;
  isFounding: boolean;
  source: ProSource;
}

// What Pro / Founding actually gets you TODAY. There is no Pro-exclusive feature
// live yet (everything built so far is free for everyone), so we don't pretend
// there is — the honest value right now is permanent founding status and being
// first in line, at a price locked for life. Upcoming features are in
// COMING_BENEFITS, clearly framed as not-yet-shipped.
const LIVE_BENEFITS = [
  { emoji: '⭐', text: 'A permanent Founding Member spot — a numbered place among the first dogs here' },
  { emoji: '🚀', text: 'First access to every Pro feature as it ships — at the founding price, locked for life' },
  { emoji: '💛', text: 'Directly back a solo-built app in its earliest days' },
];
// Clearly framed as upcoming, never as shipped.
const COMING_BENEFITS = 'Coming to Pro as they land: a card in your dog’s voice, your dog’s saved story (Year in Dog), life-stage checklists, and the Legacy Vault.';

export default function ProUpsellCard({ isPro, isFounding, source }: Props) {
  const [tier, setTier] = useState<ProTier>('annual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isProConfigured();

  async function handleSubscribe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    trackEvent('pro_checkout_click', { tier });
    try {
      const url = await startProCheckout(tier);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBusy(false);
    }
  }

  async function handleManage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = await openProPortal();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open billing.');
      setBusy(false);
    }
  }

  // ── Founding Member: grandfathered Pro for life ──────────────────────────
  if (isPro && (isFounding || source === 'founding')) {
    return (
      <section className="card rounded-[1.8rem] border border-gold/40 bg-gold/10 px-5 py-4">
        <p className="text-sm font-bold text-brown">⭐ Founding Member — Pro for life</p>
        <p className="mt-1 text-xs leading-relaxed text-brown-light">
          You were here first, so Pro is yours forever — everything we add to Pro, at no extra cost.
          Thank you for backing this early.
        </p>
      </section>
    );
  }

  // ── Active subscriber: manage plan ───────────────────────────────────────
  if (isPro && source === 'subscription') {
    return (
      <section className="card rounded-[1.8rem] border border-primary/30 bg-primary/5 px-5 py-4">
        <p className="text-sm font-bold text-brown">🐾 goDoggyDate Pro — active</p>
        <p className="mt-1 text-xs leading-relaxed text-brown-light">
          Thanks for going Pro. You get first access to everything we add to Pro, as it ships.
        </p>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleManage}
          disabled={busy}
          className="btn-secondary mt-3 py-2 text-sm disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Manage plan'}
        </button>
      </section>
    );
  }

  // ── Upsell ───────────────────────────────────────────────────────────────
  const savings = proAnnualSavingsPercent();

  return (
    <section className="card rounded-[1.8rem] border border-primary/30 overflow-hidden">
      <div className="bg-gradient-to-br from-primary/10 to-gold/10 px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">goDoggyDate Pro</p>
        <h2 className="font-display text-xl text-brown leading-tight">Your dog’s whole life, in one place</h2>
      </div>

      <div className="px-5 py-4">
        <ul className="flex flex-col gap-2">
          {LIVE_BENEFITS.map((b) => (
            <li key={b.text} className="flex items-start gap-2 text-sm text-brown-mid">
              <span aria-hidden="true">{b.emoji}</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-brown-light">{COMING_BENEFITS}</p>

        {!configured ? (
          <div className="mt-4 rounded-xl bg-cream-dark px-4 py-3 text-center">
            <p className="text-sm font-bold text-brown">Coming soon 🐾</p>
            <p className="mt-0.5 text-xs text-brown-light">
              Pro is almost ready. Keep enjoying Dogtype, life stage, milestones, and the Playroom — all free.
            </p>
          </div>
        ) : (
          <>
            {/* Monthly / annual toggle */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTier('monthly')}
                className={`rounded-xl border-2 px-3 py-2.5 text-center transition-colors ${
                  tier === 'monthly' ? 'border-primary bg-primary/10' : 'border-border bg-white'
                }`}
              >
                <p className="text-sm font-bold text-brown">{proMonthlyLabel()}</p>
                <p className="text-[10px] text-brown-light">billed monthly</p>
              </button>
              <button
                type="button"
                onClick={() => setTier('annual')}
                className={`relative rounded-xl border-2 px-3 py-2.5 text-center transition-colors ${
                  tier === 'annual' ? 'border-primary bg-primary/10' : 'border-border bg-white'
                }`}
              >
                {savings > 0 && (
                  <span className="absolute -top-2 right-2 rounded-full bg-gold px-2 py-0.5 text-[9px] font-bold text-brown">
                    save {savings}%
                  </span>
                )}
                <p className="text-sm font-bold text-brown">{proAnnualLabel()}</p>
                <p className="text-[10px] text-brown-light">{proAnnualPerMonthLabel()}</p>
              </button>
            </div>

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleSubscribe}
              disabled={busy}
              className="btn-primary w-full mt-3 disabled:opacity-60"
            >
              {busy ? 'Starting…' : PRO_TRIAL_DAYS > 0 ? `Start ${PRO_TRIAL_DAYS}-day free trial` : 'Go Pro'}
            </button>
            {/* Scoped to "new members": the server grants the trial only to
                customers who never subscribed (checkout route: !existingCustomerId),
                so a returning/churned member is billed immediately. Stripe
                Checkout shows each user their true terms before they pay. */}
            <p className="mt-2 text-center text-[11px] text-brown-light">
              {PRO_TRIAL_DAYS > 0 ? `New members get ${PRO_TRIAL_DAYS} days free, then ` : ''}
              {tier === 'annual' ? proAnnualLabel() : proMonthlyLabel()}. Cancel anytime.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
