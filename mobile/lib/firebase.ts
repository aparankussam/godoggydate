import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAuth, initializeAuth, getReactNativePersistence, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const APP_NAME = 'godoggydate-mobile';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

export function getFirebase() {
  if (!app) {
    app = getApps().some((existing) => existing.name === APP_NAME)
      ? getApp(APP_NAME)
      : initializeApp(firebaseConfig, APP_NAME);

    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch (e: unknown) {
      // On hot-reload, auth may already be initialized — reuse the existing instance.
      // Any other error (bad config, wrong SDK version, etc.) should surface.
      if ((e as { code?: string }).code === 'auth/already-initialized') {
        auth = getAuth(app);
      } else {
        throw e;
      }
    }

    db = getFirestore(app);
    storage = firebaseConfig.storageBucket
      ? getStorage(app, `gs://${firebaseConfig.storageBucket}`)
      : getStorage(app);
  }

  return { app, auth, db, storage };
}
