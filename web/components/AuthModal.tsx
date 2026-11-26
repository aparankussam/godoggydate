'use client';
// web/components/AuthModal.tsx
// Branded sign-in modal. Every "Sign In" / "Get Started" trigger in the app
// opens this modal — never the raw Google chooser directly.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { trackEvent } from '../lib/analytics';
import {
  APPLE_SIGN_IN_ENABLED,
  completeRedirectSignIn,
  signInWithApple,
  signInWithGoogle,
  signInWithGoogleIdToken,
} from '../lib/auth';
import {
  androidChromeIntentUrl,
  detectInAppBrowser,
  externalBrowserName,
  type InAppBrowserInfo,
} from '../lib/inAppBrowser';
import { getFirebase } from '../shared/utils/firebase';
import AnimatedLogo from './AnimatedLogo';
import { Icon } from './icons';

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

/** Plain-language text for an Apple sign-in error code. */
function appleErrorMessage(code: string, inAppBrowserName: string | null): string {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/user-cancelled':
      return 'The Apple window closed before sign-in finished. Tap “Continue with Apple” to try again.';
    case 'auth/operation-not-allowed':
      return "Sign in with Apple isn't working on the website yet. If you joined with Apple on iPhone, keep using the app for now.";
    case 'auth/account-exists-with-different-credential':
      return 'You already have a GoDoggyDate account with this email that signs in with Google. Use “Continue with Google” instead.';
    default:
      return inAppBrowserName
        ? `Apple sign-in can't finish inside this app's browser. Open this page in ${inAppBrowserName} and try again.`
        : 'Apple sign-in failed. Please try again.';
  }
}

// One place for the three account-outcome events, so every sign-in path reports
// the same way: sign_in_success for any success, plus sign_up for a brand-new
// account or login for a returning one.
function trackSignInOutcome(method: string, isNewUser: boolean) {
  trackEvent('sign_in_success', { method });
  trackEvent(isNewUser ? 'sign_up' : 'login', { method });
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg width="17" height="20" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
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
  const [appleBusy, setAppleBusy] = useState(false);
  // A failed Apple redirect lands back here with the modal closed, so its
  // error gets a small toast of its own instead of the in-modal line.
  const [redirectError, setRedirectError] = useState('');
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Finish an Apple sign-in that fell back to a full-page redirect. The 18+
  // box was ticked before leaving (the button only exists once it is), so
  // acceptance is recorded here exactly as the popup path does.
  useEffect(() => {
    if (!APPLE_SIGN_IN_ENABLED) return;
    completeRedirectSignIn()
      .then(async (result) => {
        if (!result) return;
        await recordTermsAcceptance();
        trackSignInOutcome('apple_redirect', result.isNewUser);
        onSuccessRef.current?.();
      })
      .catch((err: unknown) => {
        const code = (err as { code?: string }).code ?? '';
        const info = detectInAppBrowser(window.navigator.userAgent);
        trackEvent('sign_in_failure', {
          method: 'apple_redirect',
          error_code: code || 'unknown',
          in_app_browser: info.isInApp,
        });
        setRedirectError(
          appleErrorMessage(code, info.isInApp ? externalBrowserName(info.platform) : null),
        );
      });
  }, []);

  // Dialog behaviour for keyboard and screen-reader users: move focus into the
  // modal on open, close on Escape, lock the page behind it, and put focus back
  // on whatever opened it when it closes. Tab is trapped in the modal's own
  // onKeyDown below.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [isOpen]);

  function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, iframe, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

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
        const { isNewUser } = await signInWithGoogleIdToken(response.credential);
        await recordTermsAcceptance();
        trackSignInOutcome('google_one_tap', isNewUser);
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

  if (!isOpen) {
    if (!redirectError) return null;
    return (
      <div
        role="alert"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex max-w-[90vw] items-start gap-3 rounded-2xl bg-brown px-5 py-3 text-sm font-semibold text-white shadow-lg"
      >
        <span>{redirectError}</span>
        <button
          type="button"
          onClick={() => setRedirectError('')}
          aria-label="Dismiss"
          className="-my-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-lg leading-none text-white/80 hover:text-white"
        >
          ×
        </button>
      </div>
    );
  }

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
    setRedirectError('');
    trackEvent('sign_in_attempt', {
      method: oneTapReady ? 'google_popup_fallback' : 'google_popup',
    });
    try {
      const { isNewUser } = await signInWithGoogle();
      await recordTermsAcceptance();
      trackSignInOutcome(oneTapReady ? 'google_popup_fallback' : 'google_popup', isNewUser);
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

  async function handleAppleSignIn() {
    if (appleBusy) return;
    setError('');
    setRedirectError('');
    setAppleBusy(true);
    trackEvent('sign_in_attempt', { method: 'apple_popup' });
    try {
      // If popups are blocked this navigates to Apple and never resolves;
      // the redirect effect above finishes the sign-in on the way back.
      const { isNewUser } = await signInWithApple();
      await recordTermsAcceptance();
      trackSignInOutcome('apple_popup', isNewUser);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/cancelled-popup-request') return; // superseded by a newer popup
      if (code !== 'auth/popup-closed-by-user') {
        trackEvent('sign_in_failure', {
          method: 'apple_popup',
          error_code: code || 'unknown',
          in_app_browser: Boolean(inApp),
        });
      }
      setError(appleErrorMessage(code, inApp ? externalBrowser : null));
    } finally {
      setAppleBusy(false);
    }
  }

  return (
    /* Backdrop — click outside to dismiss */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(42,31,74,0.65)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        tabIndex={-1}
        onKeyDown={trapTab}
        className="bg-paper border-2 border-brown w-full max-w-sm max-h-full overflow-y-auto rounded-3xl px-8 py-8 flex flex-col items-center gap-4 shadow-2xl animate-fade-in-up focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="self-end flex h-10 w-10 items-center justify-center text-brown-light hover:text-brown text-2xl leading-none -mr-4 -mt-3"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="-mt-2 w-full max-w-[240px]"><AnimatedLogo /></div>

        <div className="text-center">
          <h2 id="auth-modal-title" className="sr-only">GoDoggyDate</h2>
          <p className="text-brown-light text-sm leading-relaxed">
            Local dog playdates with compatible dogs, plus your dog&apos;s whole life in one place.
          </p>
        </div>

        {inApp && (
          <div
            role="note"
            className="w-full rounded-2xl border-2 border-brown bg-note px-4 py-3 text-left text-xs leading-relaxed text-brown-mid"
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
                  className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brown bg-paper px-4 text-xs font-bold text-brown"
                >
                  Open in Chrome
                </a>
              )}
              <button
                type="button"
                onClick={copyPageLink}
                className="inline-flex min-h-[44px] items-center rounded-full border-2 border-brown bg-paper px-4 text-xs font-bold text-brown"
              >
                {linkCopied ? 'Link copied ✓' : 'Copy link'}
              </button>
            </div>
          </div>
        )}

        {/* The whole row is the tap target (44px tall); the box itself is large
            enough to see and hit on a phone. */}
        <label className="w-full min-h-[44px] flex items-center gap-3 rounded-2xl border-2 border-brown bg-cream-dark px-3 py-2 text-xs leading-relaxed text-brown-mid cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-primary"
          />
          <span>
            I&apos;m 18 or older and agree to the{' '}
            <Link href="/terms" target="_blank" className="font-semibold text-rose underline underline-offset-2">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" target="_blank" className="font-semibold text-rose underline underline-offset-2">Privacy Policy</Link>.
          </span>
        </label>
        <p className="-mt-2 text-xs text-brown-light">
          <Link href="/terms#in-plain-english" target="_blank" className="font-semibold text-rose underline underline-offset-2">
            Terms in plain English
          </Link>
        </p>

        {!agreed && (
          <div className="w-full flex flex-col items-center gap-2">
            {/* Visible but locked until the 18+ box is ticked, so nobody wonders
                where the sign-in button went. */}
            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-border text-brown font-bold rounded-2xl px-6 py-4 text-base opacity-50 cursor-not-allowed"
            >
              <GoogleLogo />
              Continue with Google
            </button>
            {APPLE_SIGN_IN_ENABLED && (
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center gap-2.5 bg-black text-white font-bold rounded-2xl px-6 py-4 text-base opacity-40 cursor-not-allowed"
              >
                <AppleLogo />
                Continue with Apple
              </button>
            )}
            <p className="text-xs font-semibold text-brown-mid">
              Tick the box above to confirm you&apos;re 18+ and agree to continue.
            </p>
          </div>
        )}

        {agreed && (
        <div className="w-full mt-1 flex flex-col items-center gap-3">
          <div ref={googleButtonRef} className={`w-full flex justify-center ${oneTapReady ? 'min-h-[44px]' : ''}`} />

          {oneTapReady ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="min-h-[40px] text-sm font-semibold text-brown-light underline decoration-border underline-offset-4 transition-colors hover:text-brown"
            >
              Trouble signing in? Use the Google popup instead.
            </button>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-border text-brown font-bold rounded-2xl px-6 py-4 text-base hover:border-primary hover:text-rose transition-all shadow-sm"
            >
              <GoogleLogo />
              Continue with Google
            </button>
          )}

          {/* Same 18+ gate as Google: it only exists once the box is ticked.
              Shaped to sit with whichever Google button is showing. */}
          {APPLE_SIGN_IN_ENABLED && (
            <button
              type="button"
              onClick={handleAppleSignIn}
              disabled={appleBusy}
              className={`w-full flex items-center justify-center gap-2.5 bg-black text-white font-semibold shadow-sm transition-colors hover:bg-black/85 disabled:opacity-60 ${
                oneTapReady
                  ? 'max-w-[320px] min-h-[44px] rounded-full px-6 text-[15px]'
                  : 'rounded-2xl px-6 py-4 text-base font-bold'
              }`}
            >
              <AppleLogo />
              {appleBusy ? 'Opening Apple…' : 'Continue with Apple'}
            </button>
          )}
        </div>
        )}

        {(error || redirectError) && (
          <p role="alert" className="text-xs text-red-700 -mt-1">{error || redirectError}</p>
        )}

        <ul className="w-full space-y-1.5 text-xs leading-relaxed text-brown-light">
          <li><Icon name="lock" /> We use your Google or Apple account only to sign you in. We never post to your accounts.</li>
          <li><Icon name="map-marker" /> Your dog&apos;s location is never exact — other owners only see your general area.</li>
        </ul>

        <p className="text-xs text-brown-light">Free to join · No subscription needed</p>
      </div>
    </div>
  );
}
