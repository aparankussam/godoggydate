// web/lib/storage.ts
// Firebase Storage helpers for dog photo uploads.
// Files land at: dogs/{userId}/{timestamp}_{safeName}
// Rules (storage.rules) already allow: authenticated users to write their own files < 5 MB.

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebase } from '../shared/utils/firebase';

/**
 * Upload a single photo file for a dog profile.
 * Returns the public Firebase Storage download URL.
 */
export async function uploadDogPhoto(userId: string, file: File): Promise<string> {
  const { storage } = getFirebase();
  if (!storage) throw new Error('Firebase Storage not initialized');

  // Sanitise the filename — no special chars
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path     = `dogs/${userId}/${Date.now()}_${safeName}`;
  const fileRef  = ref(storage, path);

  const snapshot = await uploadBytes(fileRef, file);
  return getDownloadURL(snapshot.ref);
}
