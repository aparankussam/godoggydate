// Intentionally web-specific — NOT a stale copy of the root shared/utils/firebase.ts.
// This one guards against server-side init (Next.js renders on the server too;
// mobile never does) and validates NEXT_PUBLIC_FIREBASE_* env vars before
// initializing. Root shared/utils/firebase.ts is what mobile imports directly.
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID             ?? process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

function assertFirebaseConfig() {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing Firebase web env vars: ${missing.join(', ')}. Check NEXT_PUBLIC_FIREBASE_* before initializing the client SDK.`,
    );
  }
}

const APP_NAME = 'godoggydate-web';

// Local QA only: point the client at the Firebase emulators (ports from
// firebase.json). Needs BOTH NEXT_PUBLIC_FIREBASE_EMULATOR_HOST and a "demo-"
// project id, so a real deployment can never be redirected at an emulator.
const EMULATOR_HOST = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST;
const USE_EMULATOR =
  !!EMULATOR_HOST && (firebaseConfig.projectId ?? '').startsWith('demo-');

/** Safari, plus Chrome/Firefox on iOS (which are WebKit underneath). */
function isWebKitBrowser(): boolean {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome\/|Chromium|Edg\/|Android/.test(ua);
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

export function getFirebase() {
  // Guard: never initialize Firebase on the server — all callers are client-side only.
  if (typeof window === 'undefined') return { app, auth, db, storage };

  if (!app) {
    assertFirebaseConfig();
    const alreadyInitialized = getApps().some((existing) => existing.name === APP_NAME);
    app     = alreadyInitialized ? getApp(APP_NAME) : initializeApp(firebaseConfig, APP_NAME);
    auth    = getAuth(app);
    // Safari and every browser on iPhone (all WebKit): Firestore's default
    // streaming transport intermittently stalls there. In QA, roughly half of
    // profile saves in WebKit hung for 20-75 s with no error, while the same save
    // in Chromium took 0.3 s; forcing long-polling brought WebKit to ~1 s every
    // time. Other browsers keep the default. initializeFirestore may run only
    // once per app, so a hot reload (already initialised) reuses the instance.
    db      = !alreadyInitialized && isWebKitBrowser()
      ? initializeFirestore(app, { experimentalForceLongPolling: true })
      : getFirestore(app);
    storage = firebaseConfig.storageBucket
      ? getStorage(app, `gs://${firebaseConfig.storageBucket}`)
      : getStorage(app);

    // Connect once. After a hot reload the SDK instances already exist and
    // refuse a second connect, which is harmless.
    if (USE_EMULATOR && !alreadyInitialized) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(db, EMULATOR_HOST!, 8080);
      connectStorageEmulator(storage, EMULATOR_HOST!, 9199);
      connectFunctionsEmulator(getFunctions(app, 'us-central1'), EMULATOR_HOST!, 5001);
    }
  }
  return { app, auth, db, storage };
}

export { app, auth, db, storage };
