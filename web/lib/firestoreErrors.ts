import type { FirebaseError } from 'firebase/app';

function isFirebaseError(error: unknown): error is FirebaseError {
  return !!error && typeof error === 'object' && 'code' in error;
}

// Every branch below used to return the message straight from here to the
// end user — a dog owner, not a developer. "Run firebase deploy --only
// firestore:indexes" and "Check your signed-in user and Firestore rules"
// are CLI commands and infra jargon that mean nothing to them and make the
// app look broken/unfinished. Callers already console.error the raw error
// before showing this string, so nothing here is lost for debugging — only
// what the USER sees changes.
export function formatFirestoreLoadError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!isFirebaseError(error)) return fallbackMessage;

  if (error.code === 'failed-precondition') {
    // A missing composite index is an operator problem, not a user mistake —
    // frame it that way rather than surfacing what actually went wrong.
    // Doesn't claim anyone's been notified: there's no error monitoring
    // wired up yet, and that would just be a different false claim.
    return "Something didn't load right on our end. Please try again in a few minutes.";
  }

  if (error.code === 'permission-denied') {
    return 'You don’t have access to view this right now. Try signing out and back in.';
  }

  if (error.code === 'unavailable') {
    return 'Could not reach the server right now. Check your connection and try again.';
  }

  return fallbackMessage;
}
