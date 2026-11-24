// firebase/functions/src/coverFocus.ts
// Auto-focus for the cover photo. When a dog's cover photo changes, a free
// open-source detector (COCO-SSD, Apache 2.0, run on CPU here) finds the dog and
// saves its centre as coverFocusX / coverFocusY, the same 0-100 fields every
// surface (swipe deck, web, share cards) already crops from. Nothing is paid per
// photo and no app update is needed.
//
// An owner's own crop is never overwritten: detection only runs while the focus
// is unset or dead centre (what a new cover starts with), and each cover URL is
// processed once (coverFocusAutoUrl), so a later manual crop is left alone.
// No dog found or a detector failure just leaves the centre crop.

import * as functions from 'firebase-functions';
import type { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { storagePhotoObjectPath } from './photoUrl';
import type { PhotoUrlPolicy } from './photoUrl';

const DETECT_SIDE = 512;
const MIN_SCORE = 0.4;

type DogDoc = Record<string, unknown>;

/** The storage URL of the dog's cover photo (owner pick, else AI hero, else the first), or null. */
export function coverPhotoUrl(data: DogDoc): string | null {
  const photos = data.photos;
  if (!Array.isArray(photos)) return null;
  const hero = (data.ai as { vibeCheck?: { heroPhotoIndex?: unknown } } | undefined)?.vibeCheck?.heroPhotoIndex;
  const pick = typeof data.coverPhotoIndex === 'number' && data.coverPhotoIndex >= 0
    ? data.coverPhotoIndex
    : typeof hero === 'number' && hero >= 0 ? hero : 0;
  const url = photos[pick];
  return typeof url === 'string' ? url : null;
}

/** True while the focus is unset or exactly centred: nobody has aimed it. */
export function isFocusUnset(data: DogDoc): boolean {
  const unset = (v: unknown) => v === undefined || v === null || v === 50;
  return unset(data.coverFocusX) && unset(data.coverFocusY);
}

/** The centre of a detected box as 0-100 percentages of the image. */
export function focusFromBox(bbox: readonly number[], width: number, height: number): { x: number; y: number } {
  const [bx, by, bw, bh] = bbox;
  const pct = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100)));
  return { x: pct((bx + bw / 2) / width), y: pct((by + bh / 2) / height) };
}

type Detector = import('@tensorflow-models/coco-ssd').ObjectDetection;
let detector: Promise<Detector> | null = null;

function loadDetector(): Promise<Detector> {
  if (!detector) {
    detector = (async () => {
      const tf = await import('@tensorflow/tfjs-core');
      await import('@tensorflow/tfjs-converter');
      await import('@tensorflow/tfjs-backend-cpu');
      await tf.setBackend('cpu');
      await tf.ready();
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      return cocoSsd.load({ base: 'lite_mobilenet_v2' });
    })();
    detector.catch(() => { detector = null; }); // retry on the next call
  }
  return detector;
}

/** Where the dog is in an image: null when there isn't one. Throws if the detector can't run. */
export async function detectDogFocus(image: Buffer): Promise<{ x: number; y: number } | null> {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(image)
    .rotate() // honour the EXIF orientation, like the apps do
    .resize(DETECT_SIDE, DETECT_SIDE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tf = await import('@tensorflow/tfjs-core');
  const model = await loadDetector();
  const input = tf.tensor3d(new Int32Array(data), [info.height, info.width, 3], 'int32');
  try {
    const found = (await model.detect(input, 5, MIN_SCORE)).filter((p) => p.class === 'dog');
    const best = found.sort((a, b) => b.score - a.score)[0];
    return best ? focusFromBox(best.bbox, info.width, info.height) : null;
  } finally {
    input.dispose();
  }
}

export function makeCoverFocusFunction(deps: { db: Firestore; photoUrlPolicy: () => PhotoUrlPolicy }) {
  const { db, photoUrlPolicy } = deps;

  const onDogCoverFocus = functions
    .runWith({ memory: '1GB', timeoutSeconds: 120 })
    .firestore.document('dogs/{uid}')
    .onWrite(async (change) => {
      if (!change.after.exists) return;
      const data = change.after.data() ?? {};
      const url = coverPhotoUrl(data);
      if (!url || data.coverFocusAutoUrl === url) return;

      let focus: { x: number; y: number } | null = null;
      if (isFocusUnset(data)) {
        const objectPath = storagePhotoObjectPath(url, photoUrlPolicy());
        if (objectPath) {
          try {
            const [buf] = await admin.storage().bucket(new URL(url).pathname.split('/')[3]).file(objectPath).download();
            focus = await detectDogFocus(buf);
          } catch (error) {
            // Photo unreadable or detector down: leave it unmarked so a later write retries.
            functions.logger.warn('cover focus detection failed', { error: String(error) });
            return;
          }
        }
      }

      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(change.after.ref)).data() ?? {};
        if (coverPhotoUrl(fresh) !== url) return; // cover changed while we worked
        tx.update(change.after.ref, {
          coverFocusAutoUrl: url,
          ...(focus && isFocusUnset(fresh) ? { coverFocusX: focus.x, coverFocusY: focus.y } : {}),
        });
      });
    });

  return { onDogCoverFocus };
}
