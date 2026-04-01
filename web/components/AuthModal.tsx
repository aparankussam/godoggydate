'use client';
// web/components/AuthModal.tsx
// Branded sign-in modal. Every "Sign In" / "Get Started" trigger in the app
// opens this modal — never the raw Google chooser directly.

import { useState } from 'react';
import { signInWithGoogle } from '../lib/auth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called after successful sign-in. Defaults to no-op; parent handles routing. */
  onSuccess?: () => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: Props) {
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleGoogleSignIn() {
    setError('');
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        return; // user dismissed — not an error
      }
      setError('Sign-in failed. Please try again.');
    }
  }

  return (
    /* Backdrop — click outside to dismiss */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(45,26,14,0.65)' }}
      onClick={onClose}
    >
      <div
        className="bg-cream w-full max-w-sm rounded-3xl px-8 py-8 flex flex-col items-center gap-4 shadow-2xl animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="self-end text-brown-light hover:text-brown text-2xl leading-none -mr-2 -mt-1"
        >
          ×
        </button>

        <span className="text-5xl -mt-2">🐾</span>

        <div className="text-center">
          <h2 className="font-display text-2xl text-brown mb-1">GoDoggyDate</h2>
          <p className="text-brown-light text-sm leading-relaxed">
            Find safe, compatible playmates<br />for your dog nearby.
          </p>
        </div>

        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-white border-2 border-border text-brown font-bold rounded-2xl px-6 py-4 text-base hover:border-primary hover:text-primary transition-all shadow-sm mt-1"
        >
          {/* Official Google G */}
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {error && (
          <p className="text-xs text-red-500 -mt-1">{error}</p>
        )}

        <p className="text-xs text-brown-light">Free to join · No subscription needed</p>
      </div>
    </div>
  );
}
