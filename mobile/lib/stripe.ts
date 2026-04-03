import { getStripePublishableKey } from '../../shared/utils/stripe';

export interface CreateIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

export async function createChatUnlockIntent(matchId: string, userId: string): Promise<CreateIntentResponse> {
  const paymentApiBase =
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL ?? process.env.EXPO_PUBLIC_WEB_URL;

  if (!paymentApiBase) {
    throw new Error('Payment is not configured for this build');
  }

  const url = `${paymentApiBase.replace(/\/$/, '')}/api/payments/create-intent`;

  if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    throw new Error('Payment is not configured for this build');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ matchId, userId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create intent: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { clientSecret?: string; paymentIntentId?: string; error?: string };

  if (!data.clientSecret) {
    throw new Error(data.error || 'Invalid payment intent response');
  }

  return {
    clientSecret: data.clientSecret,
    paymentIntentId: data.paymentIntentId ?? '',
  };
}

export function getPublishableKey(): string {
  return getStripePublishableKey();
}

export function isPaymentConfigured(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      (process.env.EXPO_PUBLIC_PAYMENTS_API_URL || process.env.EXPO_PUBLIC_WEB_URL),
  );
}
