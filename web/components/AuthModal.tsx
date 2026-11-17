'use client';
// web/components/AuthModal.tsx
// Branded sign-in modal. Every "Sign In" / "Get Started" trigger in the app
// opens this modal — never the raw Google chooser directly.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { trackEvent } from '../lib/analytics';
import { signInWithGoogle, signInWithGoogleIdToken } from '../lib/auth';
import {
  androidChromeIntentUrl,
  detectInAppBrowser,
  externalBrowserName,
  type InAppBrowserInfo,
} from '../lib/inAppBrowser';
import { getFirebase } from '../shared/utils/firebase';

// Bump when the Terms change materially, so acceptance can be re-collected.
const TERMS_VERSION = '2026-11';

// Best effort: a failed write must not strand someone who just signed in. The
// checkbox above the sign-in button has already been ticked by this point.
async function recordTermsAcceptance() {
  const { auth, db } = getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(
    doc(db, 'users', uid),
    { termsAcceptedAt: serverTimestamp(), termsVersion: TERMS_VERSION, ageConfirmed18: true },
    { merge: true },
  ).catch((error) => console.error('recordTermsAcceptance failed', error));
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called after successful sign-in. Defaults to no-op; parent handles routing. */
  onSuccess?: () => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: Props) {
  const [error, setError] = useState('');
  const [oneTapReady, setOneTapReady] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  // Set after mount so server and client render the same markup first.
  const [inApp, setInApp] = useState<InAppBrowserInfo | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      trackEvent('auth_open');
      const info = detectInAppBrowser(window.navigator.userAgent);
      setInApp(info.isInApp ? info : null);
      if (info.isInApp) {
        trackEvent('in_app_browser_notice', { app: info.app ?? 'unknown', platform: info.platform });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    // Google's button and One Tap only exist once the 18+ box is ticked, so
    // neither path can create an account without it.
    if (!isOpen || !agreed) {
      setOneTapReady(false);
      window.google?.accounts.id.cancel();
      return;
    }

    if (!googleClientId || !googleButtonRef.current) {
      setOneTapReady(false);
      return;
    }

    let cancelled = false;
    let pollId: number | null = null;

    const handleCredential = async (
      response: google.accounts.id.CredentialResponse,
    ) => {
      if (!response.credential || cancelled) return;

      setError('');
      try {
        await signInWithGoogleIdToken(response.credential);
        await recordTermsAcceptance();
        trackEvent('sign_in_success', {
          method: 'google_one_tap',
        });
        onSuccess?.();
        onClose();
      } catch {
        trackEvent('sign_in_failure', {
          method: 'google_one_tap',
        });
        setError('Google sign-in failed. Please try again.');
      }
    };

    const initializeGoogleIdentity = () => {
      if (cancelled || !window.google || !googleButtonRef.current) return false;

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredential,
        cancel_on_tap_outside: false,
        use_fedcm_for_prompt: true,
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 320,
        logo_alignment: 'left',
      });

      window.google.accounts.id.prompt();
      setOneTapReady(true);
      return true;
    };

    if (!initializeGoogleIdentity()) {
      setOneTapReady(false);
      pollId = window.setInterval(() => {
        if (initializeGoogleIdentity() && pollId !== null) {
          window.clearInterval(pollId);
          pollId = null;
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollId !== null) {
        window.clearInterval(pollId);
      }
      window.google?.accounts.id.cancel();
    };
  }, [agreed, googleClientId, isOpen, onClose, onSuccess]);

  if (!isOpen) return null;

  const externalBrowser = inApp ? externalBrowserName(inApp.platform) : 'your browser';
  const chromeIntentUrl =
    inApp?.platform === 'android' ? androidChromeIntentUrl(window.location.href) : null;

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      // Clipboard can be blocked in webviews; the notice still tells people
      // to use the app's own "Open in browser" menu item.
      setError('Could not copy the link. Use the ••• menu and choose "Open in browser".');
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    trackEvent('sign_in_attempt', {
      method: oneTapReady ? 'google_popup_fallback' : 'google_popup',
    });
    try {
      await signInWithGoogle();
      await recordTermsAcceptance();
      trackEvent('sign_in_success', {
        method: oneTapReady ? 'google_popup_fallback' : 'google_popup',
      });
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
      trackEvent('sign_in_failure', {
        method: oneTapReady ? 'google_popup_fallback' : 'google_popup',
        error_code: code || 'unknown',
        in_app_browser: Boolean(inApp),
      });
      setError(
        inApp
          ? `Google doesn't allow sign-in inside this app's browser. Open this page in ${externalBrowser} and try again.`
          : 'Sign-in failed. Please try again.',
      );
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

        {inApp && (
          <div
            role="note"
            className="w-full rounded-2xl border-2 border-primary/40 bg-white px-4 py-3 text-left text-xs leading-relaxed text-brown-mid"
          >
            <p className="font-semibold text-brown">
              Open this page in {externalBrowser} to sign in
            </p>
            <p className="mt-1">
              {inApp.app ? `${inApp.app}'s` : 'This app\'s'} built-in browser can&apos;t finish
              Google sign-in. Tap the ••• or share icon and choose &ldquo;Open in{' '}
              {externalBrowser}&rdquo;, or use a button below.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {chromeIntentUrl && (
                <a
                  href={chromeIntentUrl}
                  className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
                >
                  Open in Chrome
                </a>
              )}
              <button
                type="button"
                onClick={copyPageLink}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-brown"
              >
                {linkCopied ? 'Link copied ✓' : 'Copy link'}
              </button>
            </div>
          </div>
        )}

        <label className="w-full flex items-start gap-2.5 text-xs leading-relaxed text-brown-mid cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span>
            I&apos;m 18 or older and agree to the{' '}
            <Link href="/terms" target="_blank" className="font-semibold text-primary underline underline-offset-2">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" target="_blank" className="font-semibold text-primary underline underline-offset-2">Privacy Policy</Link>.
          </span>
        </label>

        {agreed && (
        <div className="w-full mt-1 flex flex-col items-center gap-3">
          <div ref={googleButtonRef} className="min-h-[44px] w-full flex justify-center" />

          {oneTapReady ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="text-sm font-semibold text-brown-light underline decoration-border underline-offset-4 transition-colors hover:text-brown"
            >
              Trouble signing in? Use the Google popup instead.
            </button>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-border text-brown font-bold rounded-2xl px-6 py-4 text-base hover:border-primary hover:text-primary transition-all shadow-sm"
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
          )}
        </div>
        )}

        {error && (
          <p className="text-xs text-red-500 -mt-1">{error}</p>
        )}

        <p className="text-xs text-brown-light">Free to join · No subscription needed</p>
      </div>
    </div>
  );
}
