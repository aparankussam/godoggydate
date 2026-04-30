'use client';
// web/components/UpgradeModal.tsx
// Launch builds do not offer a web subscription flow.
// Keep the modal informational so the UI does not point at inactive endpoints.

import { getFirebase } from '../shared/utils/firebase';
import { FREE_DAILY_SWIPES } from '../lib/stripe';

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

export default function UpgradeModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

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
            Web launch keeps swiping free. Paid chat unlocks happen in the mobile app after a match.
          </p>
        </div>

        {/* Feature list */}
        <ul className="self-stretch flex flex-col gap-2 text-sm text-brown-mid">
          {[
            '📱 Unlock chats in the mobile app',
            '💬 Pay only when you want to message',
            '🐾 Keep browsing matches on web',
            '🔒 No inactive checkout links',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="text-primary font-bold">✓</span> {f}
            </li>
          ))}
        </ul>

        <div className="w-full rounded-2xl border border-border bg-white px-4 py-4 text-center text-sm text-brown">
          Sign in on mobile with the same account to unlock chat after you match.
        </div>

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
