import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebase } from './firebase';

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
  const snapshot = await uploadBytes(fileRef, blob, { contentType: mimeType });
  return getDownloadURL(snapshot.ref);
}
