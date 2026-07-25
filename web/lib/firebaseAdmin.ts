import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Only the genuinely admin-only vars count toward "did someone start
  // configuring an explicit service account" — NEXT_PUBLIC_FIREBASE_PROJECT_ID
  // is the public client config and is ALWAYS set in every environment, so
  // including it here made hasAnyExplicitCredential true even with zero
  // admin credentials present, which made the throw below fire instead of
  // ever falling through to applicationDefault() — applicationDefault() was
  // unreachable dead code as long as the public project id var existed,
  // which is always. Found while locally testing the new /d/[slug] routes,
  // which use applicationDefault() via GOOGLE_APPLICATION_CREDENTIALS.
  const explicitProjectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const hasAnyExplicitCredential = Boolean(explicitProjectId || clientEmail || privateKey);
  const hasAllExplicitCredentials = Boolean(explicitProjectId && clientEmail && privateKey);

  if (hasAnyExplicitCredential && !hasAllExplicitCredentials) {
    throw new Error(
      'Incomplete Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY together, or rely entirely on application default credentials.',
    );
  }

  if (hasAllExplicitCredentials) {
    return initializeApp({
      credential: cert({
        projectId: explicitProjectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: explicitProjectId ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export function getAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}
