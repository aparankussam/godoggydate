import { getStripePublishableKey } from '../../shared/utils/stripe';

export interface CreateIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

function getPaymentApiBase(): string | null {
  return (
    process.env.EXPO_PUBLIC_PAYMENTS_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_WEB_URL?.trim() ||
    null
  );
}

export function getPaymentConfigurationError(): string | null {
  if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()) {
    return 'Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in mobile/.env';
  }

  if (!getPaymentApiBase()) {
    return 'Missing EXPO_PUBLIC_PAYMENTS_API_URL or EXPO_PUBLIC_WEB_URL in mobile/.env';
  }

  return null;
}

export async function createChatUnlockIntent(matchId: string, userId: string): Promise<CreateIntentResponse> {
  const paymentApiBase = getPaymentApiBase();
  const configurationError = getPaymentConfigurationError();

  if (configurationError || !paymentApiBase) throw new Error(configurationError ?? 'Payment is not configured for this build');

  const url = `${paymentApiBase.replace(/\/$/, '')}/api/payments/create-intent`;

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
  return getPaymentConfigurationError() === null;
}
