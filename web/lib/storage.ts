// web/lib/storage.ts
// Firebase Storage helpers for dog photo uploads.
// Files land at: dogs/{userId}/{userId}/photos/{timestamp}_{safeName}
// This matches storage.rules for dog profile photo uploads.

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebase } from '../shared/utils/firebase';

const MAX_PHOTO_EDGE_PX = 2000;
const PHOTO_JPEG_QUALITY = 0.88;

/**
 * Redraw the image to a fresh JPEG, which drops all metadata. Phone photos carry
 * GPS coordinates, and these files are reachable from public dog pages, so a
 * photo taken at home would otherwise publish the address. There is deliberately
 * no fall back to the original file: if the browser can't decode it, the upload
 * fails with a message instead of leaking the location.
 */
async function toMetadataFreeJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This photo format isn\u2019t supported here. Please use a JPEG or PNG.');
  }
  const scale = Math.min(1, MAX_PHOTO_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not process this photo. Please try again.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process this photo. Please try again.'))),
      'image/jpeg',
      PHOTO_JPEG_QUALITY,
    );
  });
}

/**
 * Upload a single photo file for a dog profile.
 * Returns the public Firebase Storage download URL.
 */
export async function uploadDogPhoto(userId: string, file: File): Promise<string> {
  const { storage } = getFirebase();
  if (!storage) throw new Error('Firebase Storage not initialized');

  const photo = await toMetadataFreeJpeg(file);

  // Sanitise the filename — no special chars
  const safeName = file.name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const path     = `dogs/${userId}/${userId}/photos/${Date.now()}_${safeName}.jpg`;
  const fileRef  = ref(storage, path);

  const snapshot = await uploadBytes(fileRef, photo, { contentType: 'image/jpeg' });
  return getDownloadURL(snapshot.ref);
}
