'use client';
// web/app/app/matches/page.tsx
// Displays all Firestore matches for the current user.
// Queries matches/{matchId} where dog1UserId or dog2UserId == currentUser.uid.
// Fetches the counterpart's dog profile from dogs/{userId} to show photo/name.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  collection, query, where, getDocs,
  doc, getDoc,
} from 'firebase/firestore';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../lib/auth';
import type { User } from '../../../lib/auth';
import type { SavedDogProfile } from '../../../lib/auth';
import { SkeletonMatchRow } from '../../../components/SkeletonCard';
import { getHeroPhoto, resolveHeroIndex } from '../../../lib/photos';
import { formatFirestoreLoadError } from '../../../lib/firestoreErrors';
import { isUserChatUnlocked } from '../../../../shared/matchAccess';
import { getBlockedUserIds } from '../../../lib/blocks';
import { getEntitlements } from '../../../lib/entitlements';
import EnablePushBanner from '../../../components/EnablePushBanner';
import { useLiveMatchRefresh } from '../../../lib/useLiveMatchRefresh';
import SignInGate from '../../../components/SignInGate';
import { CHAT_UNLOCK_PRICE_CENTS, formatPrice } from '../../../../shared/utils/stripe';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchDoc {
  matchId:    string;
  dog1Id:     string;
  dog2Id:     string;
  dog1UserId: string;
  dog2UserId: string;
  chatUnlocked: boolean;
  dog1ChatUnlocked?: boolean | null;
  dog2ChatUnlocked?: boolean | null;
  createdAt:  { seconds: number } | null;
  lastMessage:     string | null;
  lastMessageTime: { seconds: number } | null;
  lastMessageFromUid?: string | null;
  /** The other person wrote last and you haven't opened the thread since. */
  unread: boolean;
}

interface MatchWithProfile extends MatchDoc {
  otherUserId:  string;
  otherDogId:   string;
  otherProfile: SavedDogProfile | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMillis(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  return undefined;
}

/** The iPhone list's rule (isMatchUnread in mobile/lib/firestoreData.ts): the
 *  other person sent the last message, and this user's read slot
 *  (dog1LastReadAt / dog2LastReadAt, stamped when they open the thread) is
 *  missing or older than it. Older docs name the users userAId / userBId.
 *  A new match with no messages is never "unread"; it gets the pill instead. */
function isThreadUnread(data: Record<string, unknown>, uid: string): boolean {
  const lastAt = toMillis(data.lastMessageAt) ?? toMillis(data.lastMessageTime);
  const from = data.lastMessageFromUid;
  if (!lastAt || typeof from !== 'string' || !from || from === uid) return false;
  const readAt =
    data.dog1UserId === uid ? toMillis(data.dog1LastReadAt)
      : data.dog2UserId === uid ? toMillis(data.dog2LastReadAt)
        : data.userAId === uid ? toMillis(data.dog1LastReadAt)
          : data.userBId === uid ? toMillis(data.dog2LastReadAt)
            : undefined;
  return !readAt || readAt < lastAt;
}

// Compact relative time from a Firestore-style { seconds } timestamp.
function relativeTime(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const diffMs = Date.now() - seconds * 1000;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Preview line for a match that has activity. The stored lastMessage is a
 *  constant placeholder ('New message') and message text is deliberately NOT
 *  copied into the match doc (privacy), so attribute the sender + relative
 *  time instead of surfacing the meaningless constant. */
function messagePreview(m: MatchWithProfile, selfUid: string, otherName: string): string {
  const rel = relativeTime(m.lastMessageTime?.seconds);
  const sender = m.lastMessageFromUid && m.lastMessageFromUid === selfUid ? 'You' : otherName;
  return rel ? `${sender} sent a message · ${rel}` : `${sender} sent a message`;
}

async function fetchMatchesForUser(uid: string): Promise<MatchWithProfile[]> {
  const { db } = getFirebase();
  const col = collection(db, 'matches');

  // Firestore doesn't support OR across different fields in one query —
  // run two queries and merge, deduplicating by matchId.
  // No orderBy('createdAt') on the query: Firestore silently drops docs that
  // lack the orderBy field, so a match written without createdAt would vanish
  // from this list while still counting toward the nav badge (a phantom). We
  // fetch every match for the user and sort client-side (below) instead.
  const [snap1, snap2, blockedIds, entitlements] = await Promise.all([
    getDocs(query(col, where('dog1UserId', '==', uid))),
    getDocs(query(col, where('dog2UserId', '==', uid))),
    getBlockedUserIds(uid),
    getEntitlements(uid),
  ]);

  const seen = new Set<string>();
  const docs: MatchDoc[] = [];
  for (const snap of [snap1, snap2]) {
    for (const d of snap.docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        const data = d.data() as Omit<MatchDoc, 'matchId' | 'unread'>;
        docs.push({
          ...data,
          matchId: d.id,
          chatUnlocked: isUserChatUnlocked(data, uid) || entitlements.lifetimeChatUnlocks,
          unread: isThreadUnread(d.data(), uid),
        });
      }
    }
  }

  // Latest activity first — the newest message, or the match itself when nobody
  // has written yet. This used to sort by createdAt alone, so a thread with
  // messages from this morning sat below a match nobody had spoken in, and the
  // list disagreed with the Messages tab and the iPhone app.
  const activity = (m: MatchDoc) => m.lastMessageTime?.seconds ?? m.createdAt?.seconds ?? 0;
  docs.sort((a, b) => activity(b) - activity(a));

  // Hide matches with users the current user has blocked
  const visibleDocs = docs.filter((m) => {
    const otherUserId = m.dog1UserId === uid ? m.dog2UserId : m.dog1UserId;
    return !blockedIds.has(otherUserId);
  });

  // Fetch counterpart profiles in parallel
  const results = await Promise.all(
    visibleDocs.map(async (m): Promise<MatchWithProfile> => {
      const otherUserId = m.dog1UserId === uid ? m.dog2UserId : m.dog1UserId;
      const otherDogId  = m.dog1UserId === uid ? m.dog2Id     : m.dog1Id;
      let otherProfile: SavedDogProfile | null = null;
      try {
        const profileSnap = await getDoc(doc(db, 'dogs', otherUserId));
        if (profileSnap.exists()) {
          otherProfile = profileSnap.data() as SavedDogProfile;
        }
      } catch { /* offline — proceed without profile */ }
      return { ...m, otherUserId, otherDogId, otherProfile };
    }),
  );

  return results;
}

function loadMatches(
  uid: string,
  setMatches: (matches: MatchWithProfile[]) => void,
  setError: (message: string | null) => void,
  setLoading: (loading: boolean) => void,
) {
  setLoading(true);
  setError(null);
  fetchMatchesForUser(uid)
    .then(setMatches)
    .catch((error: unknown) => {
      console.error('Failed to load matches:', error);
      setError(formatFirestoreLoadError(error, 'Could not load matches. Try again in a moment.'));
    })
    .finally(() => setLoading(false));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MatchesPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [matches, setMatches] = useState<MatchWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Auth observer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Load matches when user is known ────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    loadMatches(authUser.uid, setMatches, setError, setLoading);
  }, [authUser]);

  // A match made (or a message sent) while this page is open shows up without a
  // reload. Silent: no skeleton, and a failed refresh keeps what's on screen.
  useLiveMatchRefresh(authUser?.uid, () => {
    if (!authUser) return;
    fetchMatchesForUser(authUser.uid).then(setMatches).catch(() => { /* keep the current list */ });
  });

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  // ── Not signed in ───────────────────────────────────────────────────────────
  if (!authUser) {
    return (
      <SignInGate emoji="💛" title="Sign in to see your matches" />
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center">
        <span className="font-display text-xl text-brown">💛 Matches</span>
      </header>

      {/* Mobile keeps the original full-bleed p-4 column. Desktop gets a
          capped width — without it the rows stretched the full viewport
          beside the sidebar, which reads as a stretched table, not cards. */}
      <div className="p-4 lg:max-w-6xl lg:mx-auto lg:px-8 lg:py-8">
        <EnablePushBanner userId={authUser.uid} />

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((n) => <SkeletonMatchRow key={n} />)}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <span className="text-4xl">😕</span>
            <p className="text-brown-mid text-sm">{error}</p>
            <button
              onClick={() => {
                loadMatches(authUser.uid, setMatches, setError, setLoading);
              }}
              className="btn-primary px-6 py-2 text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && matches.length === 0 && (
          <div className="card rounded-[2rem] px-6 py-10 flex flex-col items-center justify-center gap-4 text-center">
            <span className="text-6xl">💛</span>
            <p className="font-display text-2xl text-brown">No matches yet</p>
            <p className="text-brown-light text-sm max-w-xs leading-relaxed">
              Matches happen when both dogs swipe right on each other.
            </p>
            <p className="text-brown-light text-sm max-w-xs leading-relaxed">
              Keep swiping in Discover and your next mutual like could show up here. 🐾
            </p>
            <Link href="/app" className="btn-primary px-8 py-3">
              Back to Discover
            </Link>
          </div>
        )}

        {/* Matches list — a single column on mobile (identical to the native
            app), a card grid once there's room for one. */}
        {!loading && !error && matches.length > 0 && (
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-3">
            {matches.map((m) => {
              const dog = m.otherProfile;
              const photo = getHeroPhoto(dog?.photos, resolveHeroIndex(dog));
              const name  = dog?.name ?? 'Mystery Dog';
              const breed = dog?.breed ?? 'Unknown breed';
              const hasLastMsg = !!m.lastMessage;

              return (
                <div
                  key={m.matchId}
                  className="card rounded-[1.6rem] flex items-center gap-3 p-3 hover:-translate-y-0.5 hover:shadow-lg transition-all"
                >
                  {/* Photo — its own link, to the dog's profile. Previously
                      the whole row (photo included) went straight to chat,
                      with no way to see a matched dog's profile again. */}
                  <div className="relative shrink-0">
                    <Link
                      href={`/app/dog/${m.matchId}`}
                      aria-label={`View ${name}'s profile`}
                      className="w-20 h-20 rounded-[1.2rem] bg-gradient-to-br from-gold to-primary flex items-center justify-center overflow-hidden"
                    >
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl">🐕</span>
                      )}
                    </Link>
                    {/* Unread dot on the photo's corner, as on iPhone. */}
                    {m.unread && (
                      <span
                        className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary ring-2 ring-white"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {/* Info + chat icon — link to the chat thread. */}
                  <Link href={`/app/messages/${m.matchId}`} className="flex-1 min-w-0 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-brown text-base truncate ${m.unread ? 'font-black' : 'font-bold'}`}>
                          {name}
                          {m.unread && <span className="sr-only"> (unread messages)</span>}
                        </p>
                        {!hasLastMsg && (
                          <span className="shrink-0 rounded-full bg-primary/12 text-primary text-[10px] font-bold px-2 py-1">
                            New match
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brown-light truncate mt-0.5">{breed}</p>
                      {hasLastMsg && (
                        <p className={`text-xs mt-1 truncate ${m.unread ? 'text-brown font-semibold' : 'text-brown-mid'}`}>
                          {messagePreview(m, authUser.uid, name)}
                        </p>
                      )}
                      {!hasLastMsg && (
                        <p className="text-xs text-primary font-medium mt-1">
                          {m.chatUnlocked ? 'Open chat and say hello 👋' : `${formatPrice(CHAT_UNLOCK_PRICE_CENTS)} unlocks it forever`}
                        </p>
                      )}
                    </div>

                    <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow-md ${
                      m.chatUnlocked ? 'bg-primary text-white' : 'bg-brown-light/15 text-brown'
                    }`}>
                      {m.chatUnlocked ? '💬' : '🔒'}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
