import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { getFirebase } from './firebase';

function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => {
      reject(new Error('Could not load the selected photo from this device.'));
    };
    xhr.onload = () => {
      resolve(xhr.response as Blob);
    };
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send();
  });
}

/**
 * Upload a dog photo from a local device URI to Firebase Storage.
 *
 * Uses uploadBytesResumable (not uploadBytes) because React Native's Blob
 * implementation from fetch().blob() is not a true Web Blob. uploadBytesResumable
 * is the recommended approach for Expo / React Native Firebase uploads.
 *
 * Storage path: dogs/{userId}/{dogId}/photos/{timestamp}_{sanitizedFilename}
 * For Phase 1, the dog profile document id matches the signed-in user id.
 */
export async function uploadDogPhoto(
  userId: string,
  uri: string,
  fileName: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const { storage } = getFirebase();
  const blob = await uriToBlob(uri);

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `dogs/${userId}/${userId}/photos/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, path);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, blob, { contentType: mimeType });
    task.on(
      'state_changed',
      null, // no progress tracking needed for Phase 1
      (error) => {
        const serverResponse =
          typeof error === 'object' &&
          error !== null &&
          'serverResponse' in error &&
          typeof (error as { serverResponse?: unknown }).serverResponse === 'string'
            ? (error as { serverResponse: string }).serverResponse
            : '';

        reject(new Error(
          serverResponse
            ? `Photo upload failed: ${serverResponse}`
            : error instanceof Error
              ? error.message
              : 'Photo upload failed.',
        ));
      },
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve, reject);
      },
    );
  });
}
