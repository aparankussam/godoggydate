import type { FirebaseError } from 'firebase/app';

const INDEX_LINK_RE = /https:\/\/console\.firebase\.google\.com\/\S+/i;

function isFirebaseError(error: unknown): error is FirebaseError {
  return !!error && typeof error === 'object' && 'code' in error;
}

export function formatFirestoreLoadError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!isFirebaseError(error)) return fallbackMessage;

  if (error.code === 'failed-precondition') {
    const indexLink = error.message.match(INDEX_LINK_RE)?.[0];
    if (indexLink) {
      return 'This Firestore query needs a composite index for the matches/messages list. Deploy firestore indexes, or use the Firebase create-index link from the browser console, then refresh.';
    }

    return 'This Firestore query needs a composite index for the matches/messages list. Run firebase deploy --only firestore:indexes, then refresh this page.';
  }

  if (error.code === 'permission-denied') {
    return 'Firestore denied this query. Check your signed-in user and Firestore rules.';
  }

  if (error.code === 'unavailable') {
    return 'Could not reach Firestore right now. Check your connection and try again.';
  }

  return fallbackMessage;
}
