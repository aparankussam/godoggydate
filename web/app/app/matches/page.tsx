'use client';
// web/app/app/matches/page.tsx
// Displays all Firestore matches for the current user.
// Queries matches/{matchId} where dog1UserId or dog2UserId == currentUser.uid.
// Fetches the counterpart's dog profile from dogs/{userId} to show photo/name.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  collection, query, where, getDocs,
  doc, getDoc, orderBy, limit,
} from 'firebase/firestore';
import { formatPlaydateWhen } from '../../../../shared/playdates';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../lib/auth';
import type { User } from '../../../lib/auth';
import type { SavedDogProfile } from '../../../lib/auth';
import { SkeletonMatchRow } from '../../../components/SkeletonCard';
import { getHeroPhoto, resolveHeroIndex } from '../../../lib/photos';
import { formatFirestoreLoadError } from '../../../lib/firestoreErrors';
import { isUserChatUnlocked } from '../../../../shared/matchAccess';
import { BLOCKS_CHANGED_EVENT, getBlockedUserIds } from '../../../lib/blocks';
import { getEntitlements } from '../../../lib/entitlements';
import EnablePushBanner from '../../../components/EnablePushBanner';
import { useLiveMatchRefresh } from '../../../lib/useLiveMatchRefresh';
import { discoverFromProfiles, effectiveCode, loadDiscoveries, loadDogSnapshots, onDiscoveriesChange } from '../../../lib/dogtypeDiscovery';
import type { DogtypeDogMap, DogtypeLedger } from '../../../../shared/progress';
import SignInGate from '../../../components/SignInGate';
import GrowPackCard, { GROW_PACK_BELOW } from '../../../components/GrowPackCard';
import { CHAT_UNLOCK_PRICE_CENTS, formatPrice } from '../../../../shared/utils/stripe';
import { Icon } from '../../../components/icons';

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

/** The newest message in a thread. The match doc only holds a placeholder. */
interface LastMessage {
  text?: string;
  fromUserId?: string;
  senderId?: string;
  type?: 'playdate_proposal' | 'playdate_confirmed';
  playdate?: { date: string; time?: string | null };
  moderated?: boolean;
}

interface MatchWithProfile extends MatchDoc {
  otherUserId:  string;
  otherDogId:   string;
  otherProfile: SavedDogProfile | null;
  preview: LastMessage | null;
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

/** Who wrote last, and what. Same wording as the iPhone list (lastMessageLine
 *  in mobile/lib/matches.ts); "sent a message" when it couldn't be read. */
function messagePreview(m: MatchWithProfile, selfUid: string, otherName: string): string {
  const p = m.preview;
  const from = p?.fromUserId ?? p?.senderId ?? m.lastMessageFromUid;
  const who = from && from === selfUid ? 'You' : otherName;
  if (!p) return `${who} sent a message`;
  if (p.moderated) return `${who}: Message removed`;
  if (p.type === 'playdate_proposal' && p.playdate) return `${who} proposed a playdate for ${formatPlaydateWhen(p.playdate)}`;
  if (p.type === 'playdate_confirmed' && p.playdate) return `${who} confirmed the playdate for ${formatPlaydateWhen(p.playdate)}`;
  const text = typeof p.text === 'string' ? p.text.replace(/\s+/g, ' ').trim() : '';
  return text ? `${who}: ${text}` : `${who} sent a message`;
}

async function fetchLastMessage(matchId: string): Promise<LastMessage | null> {
  try {
    const { db } = getFirebase();
    const snap = await getDocs(query(collection(db, 'matches', matchId, 'messages'), orderBy('createdAt', 'desc'), limit(1)));
    return (snap.docs[0]?.data() as LastMessage | undefined) ?? null;
  } catch {
    return null;
  }
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
  // list disagreed with the iPhone app.
  const activity = (m: MatchDoc) => m.lastMessageTime?.seconds ?? m.createdAt?.seconds ?? 0;
  docs.sort((a, b) => activity(b) - activity(a));

  // Hide matches with users the current user has blocked
  const visibleDocs = docs.filter((m) => {
    const otherUserId = m.dog1UserId === uid ? m.dog2UserId : m.dog1UserId;
    return !blockedIds.has(otherUserId);
  });

  // Fetch counterpart profiles in parallel
  const results = await Promise.all(
    visibleDocs.map(async (m): Promise<(MatchWithProfile & { gone: boolean }) | null> => {
      const otherUserId = m.dog1UserId === uid ? m.dog2UserId : m.dog1UserId;
      const otherDogId  = m.dog1UserId === uid ? m.dog2Id     : m.dog1Id;
      let otherProfile: SavedDogProfile | null = null;
      // Only a read that SUCCEEDED and found nothing means they have left; a read
      // that failed (offline) keeps the row, as 'Mystery Dog'.
      let gone = false;
      try {
        const profileSnap = await getDoc(doc(db, 'dogs', otherUserId));
        if (profileSnap.exists()) {
          otherProfile = profileSnap.data() as SavedDogProfile;
        } else {
          gone = true;
        }
      } catch { /* offline — proceed without profile */ }
      // A locked chat shows no message text.
      const preview = m.lastMessage && m.chatUnlocked ? await fetchLastMessage(m.matchId) : null;
      return { ...m, otherUserId, otherDogId, otherProfile, preview, gone };
    }),
  );

  // A match whose other dog parent has left (their profile is gone) is a dead
  // thread: it can't be opened to anything, so it isn't listed.
  const live = results.filter((r): r is MatchWithProfile & { gone: boolean } => r !== null && !r.gone);
  // Matched dogs' Dogtypes join your collection (quietly on the first fill).
  discoverFromProfiles(
    uid,
    live.map((m) => ({
      dogId: m.otherDogId,
      profile: m.otherProfile,
      name: m.otherProfile?.name,
      createdAtMs: m.createdAt ? m.createdAt.seconds * 1000 : undefined,
    })),
  );
  return live;
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
  const [ledger, setLedger] = useState<DogtypeLedger>({});
  const [snapshots, setSnapshots] = useState<DogtypeDogMap>({});
  useEffect(() => {
    const uid = authUser?.uid;
    if (!uid) return undefined;
    const load = () => {
      setLedger(loadDiscoveries(uid));
      setSnapshots(loadDogSnapshots(uid));
    };
    load();
    return onDiscoveriesChange(load);
  }, [authUser?.uid]);
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

  // Someone blocked or unblocked (here, or from the toast's Undo): the list
  // follows without a reload.
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.uid;
    function refresh() {
      fetchMatchesForUser(uid).then(setMatches).catch(() => { /* keep the current list */ });
    }
    window.addEventListener(BLOCKS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(BLOCKS_CHANGED_EVENT, refresh);
  }, [authUser]);

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Icon name="paw" size={40} className="animate-spin text-brown" />
      </div>
    );
  }

  // ── Not signed in ───────────────────────────────────────────────────────────
  if (!authUser) {
    return (
      <SignInGate emoji="🐾" title="Sign in to see your matches" />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header: the title on the sky, like every other tab */}
      <header className="sticky top-0 z-40 bg-sky/95 backdrop-blur px-5 h-14 flex items-center">
        <h1 className="font-display text-[26px] leading-none text-brown">Matches</h1>
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
            <Icon name="help-circle" size={40} className="text-brown" />
            <p className="text-brown-mid text-sm font-bold">{error}</p>
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
            <Icon name="paw" size={60} className="text-brown" />
            <p className="font-display text-2xl text-brown">No matches yet</p>
            <p className="text-brown-mid text-sm font-semibold max-w-xs leading-relaxed">
              A match happens when you and another dog parent both like each other&apos;s dogs.
            </p>
            <p className="text-brown-mid text-sm font-semibold max-w-xs leading-relaxed">
              Check Discover for dogs nearby. New neighbors join over time, so it&apos;s worth looking again.
            </p>
            <Link href="/app" className="btn-primary px-8 py-3">
              Go to Discover
            </Link>
          </div>
        )}
        {!loading && !error && matches.length === 0 && (
          <div className="mt-4"><GrowPackCard uid={authUser.uid} /></div>
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
              const typeCode = effectiveCode(snapshots, m.otherDogId, dog);
              const typeEntry = typeCode ? ledger[typeCode] : undefined;
              const newType = !!typeEntry && typeEntry.dogId === m.otherDogId && !typeEntry.seen;

              return (
                <div key={m.matchId} className="flex flex-col gap-1.5">
                <div
                  className="card rounded-[1.4rem] flex items-center gap-3 p-3 hover:-translate-y-0.5 transition-all"
                >
                  {/* Photo — its own link, to the dog's profile. Previously
                      the whole row (photo included) went straight to chat,
                      with no way to see a matched dog's profile again. */}
                  <div className="relative shrink-0">
                    <Link
                      href={`/app/dog/${m.matchId}`}
                      aria-label={`View ${name}'s profile`}
                      className="w-[72px] h-[72px] rounded-full border-2 border-brown bg-note flex items-center justify-center overflow-hidden"
                    >
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <Icon name="dog" size={36} className="text-brown" />
                      )}
                    </Link>
                    {/* Unread dot on the photo's corner, as on iPhone. */}
                    {m.unread && (
                      <span
                        className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary border-2 border-brown"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {/* Info + chat icon — link to the chat thread. */}
                  <Link href={`/app/messages/${m.matchId}`} className="flex-1 min-w-0 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`min-w-0 font-display text-brown text-xl leading-tight truncate ${m.unread ? 'underline decoration-primary decoration-[3px] underline-offset-4' : ''}`}>
                          {name}
                          {m.unread && <span className="sr-only"> (unread messages)</span>}
                        </p>
                        {/* Time at the top right, as on iPhone, so it is never cut off. */}
                        {hasLastMsg && <span className="shrink-0 text-xs font-bold text-brown-mid">{relativeTime(m.lastMessageTime?.seconds)}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 text-sm font-bold text-brown-mid truncate">{breed}</p>
                        {(newType || !hasLastMsg) && (
                          <span className="shrink-0 rounded-full bg-kraft border-2 border-brown text-brown text-xs font-black px-2 py-0.5 -rotate-2">
                            {newType ? 'New Dogtype' : 'New match'}
                          </span>
                        )}
                      </div>
                      {hasLastMsg && (
                        <p className={`text-sm mt-0.5 truncate ${m.unread ? 'text-brown font-black' : 'text-brown-mid font-bold'}`}>
                          {messagePreview(m, authUser.uid, name)}
                        </p>
                      )}
                      {!hasLastMsg && (
                        <p className="text-sm text-rose font-black mt-0.5">
                          {m.chatUnlocked ? 'Open chat and say hello' : `${formatPrice(CHAT_UNLOCK_PRICE_CENTS)} unlocks it forever`}
                        </p>
                      )}
                    </div>

                    <div
                      aria-hidden="true"
                      className={`shrink-0 w-11 h-11 rounded-full border-2 border-brown flex items-center justify-center shadow-[inset_0_-4px_0_#E3D6BA] ${
                        m.chatUnlocked ? 'bg-cream' : 'bg-cream-dark'
                      }`}
                    >
                      <Icon name={m.chatUnlocked ? 'chat' : 'lock'} size={22} className="text-brown" />
                    </div>
                  </Link>
                </div>
                {/* A quiet match: nobody has written yet, so offer the next step to actually meeting. */}
                {!hasLastMsg && m.chatUnlocked && (
                  <Link
                    href={`/app/messages/${m.matchId}?plan=1`}
                    className="ml-3 inline-flex min-h-[36px] items-center gap-1.5 self-start rounded-full border-2 border-brown bg-note px-3 text-xs font-black text-brown"
                  >
                    <Icon name="calendar" size={16} /> Suggest a playdate with {name}
                  </Link>
                )}
                </div>
              );
            })}
            {matches.length < GROW_PACK_BELOW && <GrowPackCard uid={authUser.uid} />}
          </div>
        )}
      </div>
    </div>
  );
}
