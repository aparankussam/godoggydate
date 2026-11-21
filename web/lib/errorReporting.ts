// web/lib/errorReporting.ts
// Built-in client error reporting, no third-party vendor. Browser errors that
// reach window 'error' / 'unhandledrejection', and the ones caught by the Next
// error boundaries, are POSTed as one small JSON document to /api/client-error,
// which logs a single structured line per distinct error (searchable in Vercel
// logs) and can ping a webhook. What is sent: the message, a truncated stack, the
// route with ids collapsed, the browser's user agent and the release. Never an
// email, uid, token or query string: everything is scrubbed here and again on the
// server.

import { routeOf, scrubStack, scrubText } from './errorScrub';

const ENDPOINT = '/api/client-error';
const MAX_REPORTS_PER_PAGE = 5;

export type ErrorKind = 'error' | 'unhandledrejection' | 'boundary' | 'global-boundary';

const seen = new Set<string>();
let sentThisPage = 0;
let installed = false;

// Not worth a report: the browser's cross-origin "Script error." placeholder (no
// detail to act on), harmless ResizeObserver notices, aborted requests, a
// closed sign-in popup, and errors thrown by browser extensions.
function isNoise(message: string, stack: string, name: string): boolean {
  if (/^script error\.?$/i.test(message.trim())) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (name === 'AbortError' || /\bAbortError\b/.test(message)) return true;
  if (/auth\/(popup-closed-by-user|cancelled-popup-request)/.test(message)) return true;
  if (/(chrome|moz|safari|safari-web)-extension:\/\//.test(stack)) return true;
  return false;
}

function describe(error: unknown): { message: string; stack: string; name: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? '', name: error.name };
  }
  if (typeof error === 'string') return { message: error, stack: '', name: '' };
  try {
    const json = JSON.stringify(error);
    return { message: json && json !== '{}' ? json : String(error), stack: '', name: '' };
  } catch {
    return { message: String(error), stack: '', name: '' };
  }
}

export function reportClientError(error: unknown, kind: ErrorKind = 'error', extra: { digest?: string } = {}): void {
  try {
    if (typeof window === 'undefined') return;
    const { message: rawMessage, stack: rawStack, name } = describe(error);
    const message = scrubText(rawMessage, 300) || 'Unknown error';
    const stack = scrubStack(rawStack, 1500);
    if (isNoise(rawMessage, rawStack, name)) return;

    const fingerprint = `${kind}|${message}|${stack.slice(0, 200)}`;
    if (seen.has(fingerprint) || sentThisPage >= MAX_REPORTS_PER_PAGE) return;
    seen.add(fingerprint);
    sentThisPage += 1;

    const body = JSON.stringify({
      kind,
      message,
      stack,
      name: scrubText(name, 60),
      digest: typeof extra.digest === 'string' ? extra.digest.slice(0, 40) : undefined,
      route: routeOf(window.location.pathname),
      ua: navigator.userAgent.slice(0, 200),
      release: process.env.NEXT_PUBLIC_RELEASE || 'dev',
    });

    if (typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    }
    void fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .catch(() => undefined);
  } catch {
    // Error reporting must never throw.
  }
}

/** Starts listening for uncaught errors and unhandled promise rejections. Safe to call more than once. */
export function installErrorReporting(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, 'error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'unhandledrejection');
  });
}
