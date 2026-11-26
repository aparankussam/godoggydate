// web/lib/cityFeed.ts
// Client wiring for the city feed; mirrors mobile/lib/cityFeed.ts. Reads come
// straight from Firestore (live posts only: the query filters expiresAtMs > now);
// posting and closing a post go through callables, which run the content filter
// and the new-account check (firebase/functions/src/cityFeed.ts). Rules and
// merge logic: shared/cityFeed.ts.

import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { checkContent, CONTENT_FILTER_MESSAGE } from '../../shared/contentFilter';
import { mergeFeed, validatePostFields } from '../../shared/cityFeed';
import type { FeedItem, PostTemplate } from '../../shared/cityFeed';
import type { PackDay } from '../../shared/packDay';
import { getFirebase } from '../shared/utils/firebase';
import { listUpcomingPackDays, packDayErrorMessage } from './packDay';

function callable<Req, Res>(name: string) {
  const { app } = getFirebase();
  return httpsCallable<Req, Res>(getFunctions(app, 'us-central1'), name);
}

/** The city's feed, newest first with Pack Days woven in. `blocked` hides those authors. */
export async function loadCityFeed(
  city: string,
  blocked: ReadonlySet<string>,
  nowMs: number = Date.now(),
): Promise<{ items: FeedItem[]; days: Map<string, PackDay> }> {
  const { db } = getFirebase();
  const here = city.trim().toLowerCase();
  const [days, posts, lost] = await Promise.all([
    listUpcomingPackDays(nowMs),
    getDocs(query(collection(db, 'cityPosts'), where('city', '==', city), where('expiresAtMs', '>', nowMs), limit(60))),
    // Written by the lost-dog alert feature; absent or unreadable means no alerts.
    getDocs(query(collection(db, 'lostAlerts'), where('city', '==', city), limit(20))).catch(() => null),
  ]);

  const items: FeedItem[] = [];
  const cityDays = new Map<string, PackDay>();
  for (const e of days) {
    if (e.city.trim().toLowerCase() !== here) continue;
    cityDays.set(e.id, e);
    items.push({ kind: 'packday', id: e.id, authorUid: e.hostUid, sortMs: e.startsAtMs });
  }
  posts.docs.forEach((d) => {
    const p = d.data();
    items.push({
      kind: 'post', id: d.id, authorUid: String(p.authorUid ?? ''), sortMs: Number(p.createdAtMs ?? 0),
      template: p.template as PostTemplate, text: String(p.text ?? ''), place: String(p.place ?? ''), claimed: p.claimed === true,
    });
  });
  lost?.docs.forEach((d) => {
    const a = d.data();
    const live = a.status !== 'found' && a.status !== 'resolved' && !(typeof a.expiresAtMs === 'number' && a.expiresAtMs <= nowMs);
    // A dog found in the last day stays up as "home", so neighbors see the loop close.
    const foundAt = a.foundAt as { toMillis?: () => number } | undefined;
    const foundMs = typeof foundAt?.toMillis === 'function' ? foundAt.toMillis() : 0;
    const recentlyFound = a.status === 'found' && foundMs > 0 && nowMs - foundMs < 24 * 60 * 60 * 1000;
    if (live || recentlyFound) {
      // Alerts are written with ownerId and a server createdAt Timestamp; reading
      // createdAtMs/authorUid here sorted every alert as 1970 and hid it from blocks.
      const created = a.createdAt as { toMillis?: () => number } | undefined;
      const sortMs = typeof created?.toMillis === 'function' ? created.toMillis() : Number(a.createdAtMs ?? 0);
      items.push({ kind: 'lost', id: d.id, authorUid: String(a.ownerId ?? a.authorUid ?? ''), sortMs, data: { ...a, createdAtMs: sortMs } });
    }
  });
  return { items: mergeFeed(items, blocked), days: cityDays };
}

/** Returns an error message to show, or null when the post was created. */
export async function createCityPost(input: { template: PostTemplate; text: string; place: string }): Promise<string | null> {
  const fields = validatePostFields(input);
  if ('message' in fields) return fields.message; // web tsconfig isn't strict, so !fields.ok wouldn't narrow
  if (!checkContent(fields.value.text).ok || !checkContent(fields.value.place).ok) return CONTENT_FILTER_MESSAGE;
  try {
    await callable<typeof fields.value, { postId: string }>('createCityPost')(fields.value);
    return null;
  } catch (error) {
    return packDayErrorMessage(error, 'We couldn’t post that. Check your connection and try again.');
  }
}

/** Author only: 'claim' marks a Free/Lend post as gone (it expires now), 'delete' removes it. */
export async function updateCityPost(postId: string, action: 'claim' | 'delete'): Promise<void> {
  await callable<{ postId: string; action: string }, { ok: boolean }>('updateCityPost')({ postId, action });
}
