import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { getFirebase } from './firebase';

/**
 * Upload a dog photo from a local device URI to Firebase Storage.
 *
 * Uses uploadBytesResumable (not uploadBytes) because React Native's Blob
 * implementation from fetch().blob() is not a true Web Blob. uploadBytesResumable
 * is the recommended approach for Expo / React Native Firebase uploads.
 *
 * Storage path: dogs/{userId}/{timestamp}_{sanitizedFilename}
 */
export async function uploadDogPhoto(
  userId: string,
  uri: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const { storage } = getFirebase();

  const response = await fetch(uri);
  const blob = await response.blob();

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `dogs/${userId}/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, path);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, blob, { contentType: mimeType });
    task.on(
      'state_changed',
      null, // no progress tracking needed for Phase 1
      reject,
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve, reject);
      },
    );
  });
}
