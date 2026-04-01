'use client';
// web/components/UpgradeModal.tsx
// Paywall modal shown when a free user hits the 10-swipe daily limit.
// Calls /api/stripe/checkout to create a Stripe Checkout session,
// then redirects the browser to the hosted Stripe payment page.

import { useState } from 'react';
import { getFirebase } from '../shared/utils/firebase';
import { FREE_DAILY_SWIPES } from '../lib/stripe';

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

export default function UpgradeModal({ isOpen, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleUpgrade() {
    setLoading(true);
    setError(null);

    try {
      const { auth } = getFirebase();
      const uid = auth.currentUser?.uid;
      if (!uid) {
        setError('Sign in first to subscribe.');
        return;
      }

      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId: uid }),
      });
      const data = await res.json() as { url?: string; error?: string; comingSoon?: boolean };

      // Graceful fallback when Stripe is not yet configured for this environment
      if (data.comingSoon) {
        setError('Payments are coming soon. Keep swiping — we will notify you when subscriptions go live! 🐾');
        return;
      }

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout. Try again.');
        return;
      }

      // Redirect to Stripe-hosted checkout page
      window.location.href = data.url;
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'rgba(45,26,14,0.70)' }}
      onClick={onClose}
    >
      <div
        className="relative bg-cream w-full max-w-sm rounded-t-3xl sm:rounded-3xl px-8 py-8 flex flex-col items-center gap-5 shadow-2xl animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-brown-light hover:text-brown text-2xl leading-none"
          aria-label="Close"
        >
          ×
        </button>

        {/* Icon */}
        <div className="text-6xl select-none">🐾</div>

        {/* Heading */}
        <div className="text-center">
          <h2 className="font-display text-3xl text-brown leading-tight">
            You&apos;ve used your {FREE_DAILY_SWIPES} free swipes
          </h2>
          <p className="text-brown-light text-sm mt-2">
            Upgrade to swipe unlimited dogs every day and unlock all matches.
          </p>
        </div>

        {/* Feature list */}
        <ul className="self-stretch flex flex-col gap-2 text-sm text-brown-mid">
          {[
            '♾️ Unlimited daily swipes',
            '💬 Chat with all your matches',
            '📍 See exact distances',
            '⭐ Priority in the feed',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-primary font-bold">✓</span> {f}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full btn-primary py-4 text-base font-bold disabled:opacity-60"
        >
          {loading ? 'Opening checkout…' : 'Subscribe · $4.99 / month'}
        </button>

        {/* Error */}
        {error && (
          <p className="text-red-600 text-xs text-center">{error}</p>
        )}

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="text-xs text-brown-light hover:text-brown transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
