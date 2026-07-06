'use client';
// Web checkout for the one-time chat unlock. Mirrors mobile/lib/stripe.ts +
// mobile/app/chat/[matchId].tsx, but confirms the payment against the
// Elements PaymentElement instead of the native PaymentSheet. Once the
// Firebase webhook flips chatUnlocked, the parent's realtime match listener
// unlocks the thread automatically — no polling needed on success, but we
// keep a manual retry for the (rare) case webhook delivery lags.

import { useEffect, useState, useCallback } from 'react';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { getFirebase } from '../shared/utils/firebase';
import { getStripeClient, isStripeConfigured } from '../lib/stripeClient';
import { trackEvent } from '../lib/analytics';
import { CHAT_UNLOCK_PRICE_CENTS, formatPrice } from '../shared/utils/stripe';

interface ChatUnlockPanelProps {
  matchId: string;
  dogName: string;
  onCheckAgain?: () => void;
}

function isSeedUserId(id?: string | null): boolean {
  return Boolean(id?.startsWith('user_seed_'));
}

async function fetchClientSecret(matchId: string): Promise<string> {
  const currentUser = getFirebase().auth.currentUser;
  if (!currentUser) throw new Error('You need to be signed in to unlock chat.');

  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/payments/create-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ matchId }),
  });

  const data = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
  if (!res.ok || !data.clientSecret) {
    throw new Error(data.error || 'Unable to start checkout. Please try again.');
  }
  return data.clientSecret;
}

function UnlockForm({ matchId, dogName, onCheckAgain }: ChatUnlockPanelProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Please check your payment details.');
      setSubmitting(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed. Please try again.');
      setSubmitting(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      trackEvent('chat_unlock_payment_submitted', { match_id: matchId });
      setAwaitingWebhook(true);
      return;
    }

    setError('Payment did not complete. Please try again.');
    setSubmitting(false);
  }, [stripe, elements, submitting, matchId]);

  if (awaitingWebhook) {
    return (
      <div className="text-center py-2">
        <span className="text-2xl">🐾</span>
        <p className="mt-2 text-sm font-semibold text-brown">Confirming your payment…</p>
        <p className="mt-1 text-xs text-brown-light">
          Chat with {dogName} usually opens within a minute.
        </p>
        <button
          onClick={onCheckAgain}
          className="mt-3 text-xs font-semibold text-primary underline underline-offset-2"
        >
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={!stripe || submitting}
        className="w-full py-3 rounded-2xl bg-primary text-white font-bold text-sm shadow-md hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100"
      >
        {submitting ? 'Processing…' : `Unlock chat — ${formatPrice(CHAT_UNLOCK_PRICE_CENTS)}`}
      </button>
    </div>
  );
}

export default function ChatUnlockPanel({ matchId, dogName, onCheckAgain }: ChatUnlockPanelProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchClientSecret(matchId)
      .then((secret) => {
        if (!cancelled) setClientSecret(secret);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (!isStripeConfigured()) {
    return (
      <p className="text-xs text-brown-light">
        Payments are not configured for this environment yet.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-brown-light text-center py-2">Loading checkout…</p>;
  }

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  if (!clientSecret) return null;

  return (
    <Elements
      stripe={getStripeClient()}
      options={{ clientSecret, appearance: { theme: 'stripe' } }}
    >
      <UnlockForm matchId={matchId} dogName={dogName} onCheckAgain={onCheckAgain} />
    </Elements>
  );
}

export { isSeedUserId };
