'use client';
// web/app/app/messages/[matchId]/page.tsx
// Real-time chat for a matched pair.
// Messages: matches/{matchId}/messages/{messageId}
// { text: string, fromUserId: string, createdAt: Timestamp }
// Also updates matches/{matchId}.lastMessage + lastMessageTime on send.

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import Link from 'next/link';
import {
  collection, query, orderBy, limit, startAfter, onSnapshot, getDocs,
  addDoc, doc, getDoc, updateDoc,
  serverTimestamp,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import ChatBubble from '../../../../components/ChatBubble';
import { getPrimaryRenderablePhoto } from '../../../../lib/photos';
import { trackEvent, trackFirstTime } from '../../../../lib/analytics';
import { CHAT_FREE_LAUNCH_MODE, isUserChatUnlocked } from '../../../../../shared/matchAccess';
import ChatUnlockPanel, { isSeedUserId } from '../../../../components/ChatUnlockPanel';
import { unblockUser } from '../../../../lib/blocks';
import { onEntitlements, getFoundingMemberLink } from '../../../../lib/entitlements';
import { useFoundingState } from '../../../../lib/founding';
import { getChatUnlockPitch } from '../../../../../shared/utils/stripe';
import { hasRatedPlaydate, submitPlaydateRating } from '../../../../lib/ratings';
import PlaydateRatingModal from '../../../../components/PlaydateRatingModal';
import PlaydateMemoryCard from '../../../../components/PlaydateMemoryCard';
import PlaydateHeadsUpCard, { playdateConflicts } from '../../../../components/PlaydateHeadsUpCard';
import { SafetySheet } from '../../../../components/ReportProfileMenu';
import { shareOrDownloadCard } from '../../../../lib/shareCard';
import { setBestFriend, clearBestFriend } from '../../../../lib/bestFriend';
import { checkContent, CONTENT_FILTER_MESSAGE } from '../../../../../shared/contentFilter';
import { parseLocalIsoDate } from '../../../../../shared/profile';
import {
  MAX_PLAYDATE_PLACE_LENGTH,
  buildPlaydateIcs,
  formatMessageTime,
  formatPlaydateWhen,
  otherUserIdFromMatchId,
  playdateDateBounds,
  playdateDraftProblem,
  playdateIcsFileName,
  type PlaydateDraftProblem,
} from '../../../../../shared/playdates';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlaydateDetails {
  date:  string;
  time:  string;
  place: string;
}

interface Message {
  id:         string;
  text:       string;
  fromUserId: string;
  createdAt:  { seconds: number } | null;
  /** createdAt in ms for ordering; a write the server hasn't stamped yet sorts as newest. */
  createdAtMs: number;
  isSystem?:  boolean;
  type?:      'playdate_proposal' | 'playdate_confirmed';
  playdate?:  PlaydateDetails;
  // Set by the server's content filter (onMessageCreatedNotify), which also
  // replaces the text with a neutral notice and drops any playdate card.
  moderated?: boolean;
  // Still only on this device: not yet acknowledged by the server.
  pending?: boolean;
}

/** Why the thread can't be shown, when it can't. 'left' is the one that says why. */
type EndState = 'left' | 'removed' | 'denied';

/** What this person did with a received proposal. Kept on this device only. */
type ProposalResponse = 'declined' | 'countered';

function playdateKey(p?: PlaydateDetails): string {
  return p ? `${p.date}|${p.time}|${p.place}` : '';
}

/**
 * True when a playdate's date is a real 'YYYY-MM-DD', the only form that can
 * be compared with today. Older iPhone builds stored the date as typed text
 * ("Sat, July 12"); that date is unknown, so it is shown as typed but never
 * counts as upcoming or past, and never brings up the rating prompt.
 */
function hasIsoDate(p: PlaydateDetails): boolean {
  return typeof p.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(p.date)
    && parseLocalIsoDate(p.date) !== null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SAFETY_TIP = '🐾 Tip: Always meet in a public place for your first playdate.';
const MATCH_THREAD_PREVIEW = 'New message';
const MAX_MESSAGE_LENGTH = 1000;
/** How many messages the thread loads at first, and per "Load earlier messages". */
const MESSAGE_PAGE_SIZE = 200;

// Starter ideas. Tapping one puts it in the message box to edit; it never sends.
function buildSmartPromptsFromProfile(profile: {
  name?: string;
  location?: string;
  playStyles?: string[];
  breed?: string;
} | null): string[] {
  const name = profile?.name ?? 'your match';
  // Extract city from "City, ST" or raw string
  const locStr = profile?.location ?? '';
  const city = locStr.includes(',') ? locStr.split(',')[0].trim() : locStr.trim();
  const styles = profile?.playStyles ?? [];

  const prompts: string[] = [];

  // Location-aware — use the city name if known
  if (city) {
    prompts.push(`Any good dog parks in ${city}? 🌳`);
  }

  // Play-style aware
  if (styles.some((s) => s.toLowerCase().includes('fetch'))) {
    prompts.push(`Does ${name} love to fetch? 🎾`);
  } else if (styles.some((s) => s.toLowerCase().includes('runner') || s.toLowerCase().includes('high-energy'))) {
    prompts.push(`Up for a morning run with ${name}? ⚡`);
  } else if (styles.some((s) => s.toLowerCase().includes('gentle') || s.toLowerCase().includes('calm'))) {
    prompts.push(`Calm walk with ${name} this weekend? 🐾`);
  } else {
    prompts.push(`Morning walk with ${name}? 🐾`);
  }

  // Generic warm prompts
  prompts.push('Hi! Our dogs should meet 🐾');
  prompts.push('Coffee + dogs? ☕🐕');

  return prompts.slice(0, 4);
}

function formatTime(createdAt: { seconds: number } | null): string {
  if (!createdAt) return '';
  return formatMessageTime(createdAt.seconds * 1000);
}

function toMessage(d: QueryDocumentSnapshot<DocumentData>): Message {
  // serverTimestamps:'estimate' gives a just-sent (pending) message an
  // estimated createdAt instead of null — null sorts first under 'asc',
  // making the sender's own message flash at the TOP before the server ack.
  const data = d.data({ serverTimestamps: 'estimate' });
  const ts = data.createdAt as { seconds?: number; toMillis?: () => number } | null | undefined;
  const createdAtMs = ts && typeof ts.toMillis === 'function'
    ? ts.toMillis()
    : ts && typeof ts.seconds === 'number' ? ts.seconds * 1000 : Number.MAX_SAFE_INTEGER;
  return {
    id:         d.id,
    text:       data.text as string,
    fromUserId: (data.fromUserId ?? data.senderId ?? '') as string,
    createdAt:  data.createdAt ?? null,
    createdAtMs,
    isSystem:   data.isSystem ?? false,
    type:       data.type,
    playdate:   data.playdate,
    moderated:  data.moderated === true,
    pending:    d.metadata.hasPendingWrites,
  };
}

/** Oldest first; a tie falls back to the id, as Firestore's own order does. */
function sortedMessages(map: Map<string, Message>): Message[] {
  return Array.from(map.values()).sort(
    (a, b) => a.createdAtMs - b.createdAtMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function cleanFirstName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 40 ? trimmed : null;
}

function downloadTextFile(fileName: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function readResponses(matchId: string): Record<string, ProposalResponse> {
  try {
    const raw = window.localStorage.getItem(`gdd.playdateResponses.${matchId}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeResponses(matchId: string, responses: Record<string, ProposalResponse>) {
  try {
    window.localStorage.setItem(`gdd.playdateResponses.${matchId}`, JSON.stringify(responses));
  } catch { /* a per-device convenience; the thread is the record */ }
}

/** A full-page state: the thread can't be shown, with a way back. */
function ChatNotice({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
      <span className="text-5xl" aria-hidden="true">{emoji}</span>
      <h1 className="font-display text-2xl text-brown">{title}</h1>
      {children}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const params       = useParams();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const matchId  = typeof params.matchId === 'string' ? params.matchId : '';
  const handoffToken = searchParams.get('handoff');

  const [authUser, setAuthUser]             = useState<User | null>(null);
  const [authLoading, setAuthLoading]       = useState(true);
  // True once a mobile-app handoff sign-in has been attempted (or there was
  // none to attempt). The auth-loading gate below waits on this so a fresh,
  // session-less Safari tab doesn't redirect to /app before the handoff
  // token has had a chance to sign the user in.
  const [handoffAttempted, setHandoffAttempted] = useState(!handoffToken);
  const [otherProfile, setOtherProfile]     = useState<SavedDogProfile | null>(null);
  const [myProfile, setMyProfile]           = useState<SavedDogProfile | null>(null);
  const [otherUserId, setOtherUserId]       = useState<string | null>(null);
  // The other owner's first name, from the match document only (they can hide it).
  const [otherOwnerFirstName, setOtherOwnerFirstName] = useState<string | null>(null);
  const [messages, setMessages]             = useState<Message[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [hasEarlier, setHasEarlier]         = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError]     = useState(false);
  const [chatInput, setChatInput]           = useState('');
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState<string | null>(null);
  // The client-side content filter refused the draft. Shown inline next to
  // the box that holds the text (the message input or the playdate form), and
  // the text stays put so the user can rephrase it.
  const [contentError, setContentError]     = useState<'message' | 'playdate' | null>(null);
  const [chatUnlocked, setChatUnlocked]     = useState(false);
  const [hasLifetime, setHasLifetime]       = useState(false);
  // The $39 offer only exists while paid founding spots #51–150 are open.
  const founding = useFoundingState();
  const [endState, setEndState]             = useState<EndState | null>(null);
  const [loadError, setLoadError]           = useState(false);
  const [loadRetryToken, setLoadRetryToken] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(true);
  // I blocked them / they blocked me. The second is never explained to the person.
  const [blockedByMe, setBlockedByMe]       = useState(false);
  const [blockedMe, setBlockedMe]           = useState(false);
  // The server refused a send (permission-denied): the thread is closed to this
  // person, whatever the reason. Retrying cannot help, so don't offer it.
  const [sendDenied, setSendDenied]         = useState(false);
  const [unblocking, setUnblocking]         = useState(false);
  const [unblockError, setUnblockError]     = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [showPlaydateForm, setShowPlaydateForm] = useState(false);
  const [playdateDraft, setPlaydateDraft]   = useState<PlaydateDetails>({ date: '', time: '', place: '' });
  // The proposal this new one answers ("Suggest another time"), marked handled once sent.
  const [counterOfId, setCounterOfId]       = useState<string | null>(null);
  // Why the proposal can't be sent yet (past date, absurd year, ...), shown by the form.
  const [playdateProblem, setPlaydateProblem] = useState<PlaydateDraftProblem | null>(null);
  const [responses, setResponses]           = useState<Record<string, ProposalResponse>>({});
  const [confirmDeclineId, setConfirmDeclineId] = useState<string | null>(null);
  // A proposal waiting on the "got it" sheet because the two dogs' limits cross.
  const [acceptCandidate, setAcceptCandidate] = useState<Message | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [alreadyRated, setAlreadyRated]     = useState(true); // assume rated until checked, to avoid a flash
  const [memoryCardStars, setMemoryCardStars] = useState<number | null>(null);
  const [sharingMemoryCard, setSharingMemoryCard] = useState(false);
  const memoryCardRef = useRef<HTMLDivElement>(null);
  const [myBestFriendMatchId, setMyBestFriendMatchId] = useState<string | null>(null);
  const [togglingBestFriend, setTogglingBestFriend] = useState(false);
  const [online, setOnline]                 = useState(true);
  // The message box has focus (on a phone, the keyboard is up): the Heads-Up card folds to its header.
  const [inputFocused, setInputFocused]     = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Every message seen so far, by id. The live listener only holds the newest
  // page; keeping what it has shown (and what "Load earlier" fetched) means a
  // message that slides out of that page as new ones arrive doesn't vanish.
  const seenMessagesRef = useRef<Map<string, Message>>(new Map());
  // The oldest message loaded so far: where "Load earlier messages" resumes.
  const oldestLoadedRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  // Set once "Load earlier messages" has fetched a page: the cursor above is then its own.
  const earlierLoadedRef = useRef(false);
  // Set while older messages are prepended, so the view stays on what you were reading.
  const keepScrollRef = useRef<{ height: number; top: number } | null>(null);
  // Synchronous send guard. `sending` is state, so two taps/Enters landing in the
  // same tick can both read it as false before the re-render; a ref can't.
  const sendingRef = useRef(false);
  // Id of the newest incoming message already stamped as read.
  const lastMarkedReadRef = useRef<string | null>(null);
  // Which read-timestamp slot on the match doc is THIS user's, resolved once the
  // match loads — used to mark the thread read so the unread badge clears.
  const myReadFieldRef = useRef<'dog1LastReadAt' | 'dog2LastReadAt' | null>(null);
  // True once this page has seen the match document. If it later disappears the
  // other person is gone (their account deletion removes the match).
  const matchSeenRef = useRef(false);

  // ── Mobile-app session handoff ────────────────────────────────────────────────
  // The native app opens this page in the system browser (Safari), which has
  // no access to the app's local auth session. A ?handoff= custom token
  // (minted by /api/auth/handoff-token from the app's own ID token) signs
  // this tab in as the same user, so the link lands on the unlock checkout
  // instead of a cold sign-in screen.
  useEffect(() => {
    if (!handoffToken) return;
    const { auth } = getFirebase();
    signInWithCustomToken(auth, handoffToken)
      .catch((error) => {
        console.warn('Handoff sign-in failed', error);
      })
      .finally(() => {
        setHandoffAttempted(true);
        // Strip the token from the URL/history once consumed.
        router.replace(`/app/messages/${matchId}`);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffToken]);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Signed out (and no handoff pending): back to Discover. An effect, not a
  // router call during render.
  useEffect(() => {
    if (!authLoading && handoffAttempted && !authUser) router.replace('/app');
  }, [authLoading, handoffAttempted, authUser, router]);

  // ── Online / offline ─────────────────────────────────────────────────────────
  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // What I told this thread about received proposals, kept on this device.
  useEffect(() => {
    if (matchId) setResponses(readResponses(matchId));
  }, [matchId]);

  function recordResponse(messageId: string, response: ProposalResponse) {
    setResponses((current) => {
      const next = { ...current, [messageId]: response };
      writeResponses(matchId, next);
      return next;
    });
  }

  // ── Founding Member entitlement (unlocks every chat, no per-match payment) ───
  useEffect(() => {
    if (!authUser) return;
    return onEntitlements(authUser.uid, (e) => setHasLifetime(e.lifetimeChatUnlocks));
  }, [authUser]);

  // ── Best Friend — live so the star updates if toggled from another tab ──────
  // Also the source for myProfile: this snapshot already carries the whole dog
  // doc and was throwing all of it away except one field. The Heads-Up card
  // needs the owner's own declarations to compute crossings and to mirror them
  // back, so keep the document instead of one property. No extra read.
  useEffect(() => {
    if (!authUser) return;
    const { db } = getFirebase();
    return onSnapshot(doc(db, 'dogs', authUser.uid), (snap) => {
      const data = snap.data() as SavedDogProfile | undefined;
      setMyBestFriendMatchId((data?.bestFriendMatchId as string | undefined) ?? null);
      setMyProfile(data ?? null);
    });
  }, [authUser]);

  async function handleToggleBestFriend() {
    if (!authUser || togglingBestFriend) return;
    setTogglingBestFriend(true);
    try {
      if (myBestFriendMatchId === matchId) {
        await clearBestFriend(authUser.uid);
      } else {
        await setBestFriend(authUser.uid, matchId);
      }
    } catch {
      // Non-critical — the star just doesn't update, user can retry.
    } finally {
      setTogglingBestFriend(false);
    }
  }

  // Effective chat access: per-match unlock OR lifetime entitlement.
  const canChat = chatUnlocked || hasLifetime;

  // ── Validate match access + load counterpart profile ─────────────────────────
  // Realtime listener (not a one-time getDoc): once a payment succeeds, the
  // Stripe webhook flips chatUnlocked asynchronously, and this listener picks
  // that up live without requiring a manual refresh or poll.
  useEffect(() => {
    if (!authUser || !matchId) return;

    const { db } = getFirebase();
    const uid = authUser.uid;
    let profileLoaded = false;
    // Their profile was read and is not there: stays true across later snapshots.
    let profileMissing = false;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // The match document is gone or unreadable. The rules answer
    // permission-denied both for someone else's match and for an id that no
    // longer exists, but the match id names both people, so look the other
    // person up: no dog profile means they left (deleting an account removes the
    // match and the profile); a profile that is still there means the thread was
    // removed some other way.
    async function explainEnd(attempt = 0) {
      const otherId = otherUserIdFromMatchId(matchId, uid);
      if (!otherId) {
        if (!cancelled) setEndState('denied');
        return;
      }
      let next: EndState = 'removed';
      try {
        const dog = await getDoc(doc(db, 'dogs', otherId));
        next = dog.exists() ? 'removed' : 'left';
      } catch { /* offline: stay with the neutral wording */ }
      if (cancelled) return;
      setEndState(next);
      // An account deletion removes the match first and the profile a moment
      // later, so a thread that just vanished while open gets two more looks.
      if (next === 'removed' && matchSeenRef.current && attempt < 2) {
        timers.push(setTimeout(() => { void explainEnd(attempt + 1); }, attempt === 0 ? 3000 : 6000));
      }
    }

    const unsub = onSnapshot(doc(db, 'matches', matchId), async (matchSnap) => {
      setLoadError(false); // a successful delivery means we're not actually stuck

      if (!matchSnap.exists()) {
        await explainEnd();
        setLoadingProfile(false);
        return;
      }
      matchSeenRef.current = true;

      const matchData = matchSnap.data() as {
        dog1UserId: string; dog2UserId: string;
        dog1Id: string;    dog2Id: string;
        chatUnlocked?: boolean;
        dog1ChatUnlocked?: boolean | null;
        dog2ChatUnlocked?: boolean | null;
        dog1OwnerFirstName?: unknown;
        dog2OwnerFirstName?: unknown;
      };

      // Verify current user is a participant
      if (matchData.dog1UserId !== uid && matchData.dog2UserId !== uid) {
        setEndState('denied');
        setLoadingProfile(false);
        return;
      }
      setEndState(profileMissing ? 'left' : null);

      const iAmDog1 = matchData.dog1UserId === uid;
      myReadFieldRef.current = iAmDog1 ? 'dog1LastReadAt' : 'dog2LastReadAt';
      const resolvedOtherUserId = iAmDog1
        ? matchData.dog2UserId
        : matchData.dog1UserId;

      setOtherUserId(resolvedOtherUserId);
      setOtherOwnerFirstName(cleanFirstName(iAmDog1 ? matchData.dog2OwnerFirstName : matchData.dog1OwnerFirstName));
      setChatUnlocked(isUserChatUnlocked(matchData, uid));

      if (!profileLoaded) {
        profileLoaded = true;
        try {
          const profileSnap = await getDoc(doc(db, 'dogs', resolvedOtherUserId));
          if (profileSnap.exists()) {
            setOtherProfile(profileSnap.data() as SavedDogProfile);
          } else {
            // The match is still here but their profile is gone: they left.
            profileMissing = true;
            setEndState('left');
          }
        } catch { /* offline — proceed */ }
      }

      setLoadingProfile(false);
    }, (error) => {
      // A transient read failure here used to leave chatUnlocked/accessDenied
      // at their initial `false` values and just stop the spinner — which
      // fell straight through to the paywall branch below, presenting a
      // Stripe checkout headlined "Unlock chat with Your Match" for what was
      // actually a dropped connection, not an unpaid chat. Route this to its
      // own error state instead so it never gets mistaken for either "access
      // denied" or "payment required".
      console.error('Failed to subscribe to match:', error);
      // The rules answer permission-denied both for someone else's match and for
      // an id that doesn't exist (they can't tell the two apart). That's not a
      // connection problem, and "Retry" can never fix it.
      if ((error as { code?: string }).code === 'permission-denied') void explainEnd();
      else setLoadError(true);
      setLoadingProfile(false);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      unsub();
    };
  }, [authUser, matchId, loadRetryToken]);

  // ── Blocks, both directions ──────────────────────────────────────────────────
  // blocks/{me}/blocked/{them} is mine; blocks/{me}/blockedBy/{them} is the
  // mirror a function writes when THEY block me (and removes when they unblock).
  // Both are readable by me alone.
  useEffect(() => {
    if (!authUser || !otherUserId) return;
    const { db } = getFirebase();
    setBlockedByMe(false);
    setBlockedMe(false);
    const unsubs = [
      onSnapshot(doc(db, 'blocks', authUser.uid, 'blocked', otherUserId), (s) => setBlockedByMe(s.exists()), () => { /* keep */ }),
      onSnapshot(doc(db, 'blocks', authUser.uid, 'blockedBy', otherUserId), (s) => setBlockedMe(s.exists()), () => { /* keep */ }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [authUser, otherUserId]);

  const threadClosed = endState !== null || blockedMe || sendDenied || blockedByMe;

  // ── Real-time messages listener ───────────────────────────────────────────────
  // The newest page only (descending + limit); `seenMessagesRef` accumulates what
  // has been shown, and the list on screen is that map in time order.
  useEffect(() => {
    if (!matchId || threadClosed || !canChat) return;

    const { db } = getFirebase();
    const msgsRef = collection(db, 'matches', matchId, 'messages');
    const q = query(msgsRef, orderBy('createdAt', 'desc'), limit(MESSAGE_PAGE_SIZE));
    let gotServerPage = false;

    // includeMetadataChanges so a message sent offline flips from "Sending…" to
    // its time when the server acknowledges it (that's a metadata-only change).
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const seen = seenMessagesRef.current;
      for (const d of snap.docs) seen.set(d.id, toMessage(d));
      // The first page from the server decides whether there is anything older to
      // fetch (a cache-only snapshot can be a partial page, so it only counts when
      // there is nothing else to go on). Once older pages have been loaded, their
      // cursor is the one that matters.
      if (!earlierLoadedRef.current && snap.docs.length > 0) {
        const fromServer = !snap.metadata.fromCache;
        if (fromServer ? !gotServerPage : oldestLoadedRef.current === null) {
          oldestLoadedRef.current = snap.docs[snap.docs.length - 1];
          setHasEarlier(snap.docs.length >= MESSAGE_PAGE_SIZE);
        }
        if (fromServer) gotServerPage = true;
      }
      const msgs = sortedMessages(seen);
      setMessages(msgs);
      setMessagesLoaded(true);

      // Mark the thread read when the newest message is from the other user, so
      // the bottom-nav unread badge clears on READ (not only when you reply).
      const last = msgs[msgs.length - 1];
      const field = myReadFieldRef.current;
      // Once per newest message: with metadata changes on, this callback also
      // fires for cache→server transitions, which must not re-stamp the read time.
      if (last && field && last.fromUserId && last.fromUserId !== authUser?.uid && lastMarkedReadRef.current !== last.id) {
        lastMarkedReadRef.current = last.id;
        void updateDoc(doc(db, 'matches', matchId), { [field]: serverTimestamp() }).catch(() => {
          lastMarkedReadRef.current = null; // try again on the next snapshot
        });
      }
    }, (error) => {
      // The match listener explains a thread that has gone; this one has nothing
      // useful to add, and must not surface as an unhandled error.
      console.warn('Messages listener stopped:', (error as { code?: string }).code);
    });

    return unsub;
  }, [matchId, threadClosed, canChat, authUser?.uid]);

  // A different thread starts from nothing.
  useEffect(() => {
    seenMessagesRef.current = new Map();
    oldestLoadedRef.current = null;
    earlierLoadedRef.current = false;
    keepScrollRef.current = null;
    lastMarkedReadRef.current = null;
    matchSeenRef.current = false;
    setMessages([]);
    setMessagesLoaded(false);
    setHasEarlier(false);
    setEarlierError(false);
    setEndState(null);
    setSendDenied(false);
  }, [matchId]);

  async function loadEarlierMessages() {
    const cursor = oldestLoadedRef.current;
    if (!cursor || loadingEarlier || !matchId) return;
    setLoadingEarlier(true);
    setEarlierError(false);
    try {
      const { db } = getFirebase();
      const snap = await getDocs(query(
        collection(db, 'matches', matchId, 'messages'),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(MESSAGE_PAGE_SIZE),
      ));
      const el = messagesRef.current;
      if (el) keepScrollRef.current = { height: el.scrollHeight, top: el.scrollTop };
      for (const d of snap.docs) seenMessagesRef.current.set(d.id, toMessage(d));
      if (snap.docs.length > 0) oldestLoadedRef.current = snap.docs[snap.docs.length - 1];
      earlierLoadedRef.current = true;
      setHasEarlier(snap.docs.length >= MESSAGE_PAGE_SIZE);
      setMessages(sortedMessages(seenMessagesRef.current));
    } catch (error) {
      console.warn('Could not load earlier messages:', error);
      setEarlierError(true);
    } finally {
      setLoadingEarlier(false);
    }
  }

  useEffect(() => {
    if (!matchId || authLoading || loadingProfile || threadClosed) return;
    trackEvent(canChat ? 'chat_view' : 'chat_unlock_prompt_view', {
      match_id: matchId,
    });
  }, [threadClosed, authLoading, canChat, loadingProfile, matchId]);

  // ── Playdates (the product's north-star action) ───────────────────────────────
  const confirmedPlaydateKeys = new Set(
    messages.filter((m) => m.type === 'playdate_confirmed').map((m) => playdateKey(m.playdate)),
  );
  // A confirmation whose proposal card is in the thread is shown BY that card
  // ("· Confirmed"); its own message is only a text copy of the same facts.
  const proposalKeys = new Set(
    messages
      .filter((m) => m.type === 'playdate_proposal' && m.playdate && !m.moderated)
      .map((m) => playdateKey(m.playdate)),
  );

  // The soonest confirmed playdate that hasn't happened yet — what the Heads-Up
  // card briefs for. 'en-CA' formats as YYYY-MM-DD, matching the <input
  // type="date"> value, so these compare lexicographically as local calendar
  // days (a UTC-based comparison would roll the date over early for anyone west
  // of Greenwich and late for anyone east).
  //
  // Only ISO dates take part (see hasIsoDate). A free-text date from an older
  // iPhone build compared as text against 'YYYY-MM-DD' used to read as always
  // upcoming ("Sat…" > "2026…") or always past, which pinned the Heads-Up card
  // forever or asked for a rating before the meetup.
  const todayIso = new Date().toLocaleDateString('en-CA');
  const confirmedPlaydates = messages
    .filter((m) => m.type === 'playdate_confirmed' && m.playdate && !m.moderated)
    .map((m) => m.playdate!)
    .filter(hasIsoDate);
  const upcomingPlaydate =
    confirmedPlaydates
      .filter((p) => p.date >= todayIso)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))[0] ?? null;
  // A rating is only honest once the meetup has actually happened. This used to
  // fire the moment a playdate was CONFIRMED — so a date a week out prompted
  // "How did it go?". An unknown (free-text) date never counts as past.
  // A playdate today counts once it started 2+ hours ago: the "How did it go?"
  // push (firebase/functions/src/playdates.ts) goes out 2.5 hours after the start,
  // and its tap must find the rating prompt, not wait for tomorrow. Browser-local
  // time, like todayIso. A date with no (or free-text) time still waits for the next day.
  const hasPastPlaydate = confirmedPlaydates.some((p) =>
    p.date < todayIso
    || (p.date === todayIso
      && /^\d{2}:\d{2}$/.test(p.time ?? '')
      && new Date(`${p.date}T${p.time}`).getTime() + 2 * 60 * 60 * 1000 <= Date.now()));

  // ── Auto-scroll to bottom on new messages ────────────────────────────────────
  // Scrolls the thread's own container. scrollIntoView() also scrolls every
  // scrollable ancestor — the window included — which dragged the page up and
  // took the header off the screen. The first paint of a long thread jumps
  // straight to the newest message; later arrivals glide.
  const scrolledOnceRef = useRef(false);
  const showRatingBanner = canChat && hasPastPlaydate && !alreadyRated;
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    // Older messages were just added above: stay on what you were reading.
    const keep = keepScrollRef.current;
    if (keep) {
      keepScrollRef.current = null;
      el.scrollTop = keep.top + (el.scrollHeight - keep.height);
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: scrolledOnceRef.current ? 'smooth' : 'auto' });
    if (messages.length > 0) scrolledOnceRef.current = true;
  }, [messages, showRatingBanner, memoryCardStars]);

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    extra?: { type: Message['type']; playdate: PlaydateDetails },
  ): Promise<boolean> => {
    if (!text.trim() || !authUser || !matchId || sending || sendingRef.current || !canChat) return false;
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    // Checked before the input is cleared, so a refused draft stays in the box
    // to be rephrased. The server runs the same filter again on every message.
    // The text of a playdate already includes its date, time and place.
    if (!checkContent(trimmed).ok) {
      setContentError(extra?.type === 'playdate_proposal' ? 'playdate' : 'message');
      return false;
    }
    setContentError(null);
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    setChatInput('');
    let delivered = false;

    try {
      const { db } = getFirebase();
      const msgsRef = collection(db, 'matches', matchId, 'messages');

      console.info('[chat] creating message', {
        matchId,
        fromUserId: authUser.uid,
      });

      try {
        await addDoc(msgsRef, {
          text: trimmed,
          fromUserId: authUser.uid,
          senderId: authUser.uid,
          isSystem: false,
          createdAt: serverTimestamp(),
          ...(extra ? { type: extra.type, playdate: extra.playdate } : {}),
        });
        delivered = true;
        console.info('[chat] message create succeeded', { matchId });
        trackEvent('message_sent', {
          match_id: matchId,
          has_existing_messages: messages.length > 0,
        });
        trackFirstTime(authUser.uid, 'first_message', 'first_message_sent', { match_id: matchId });
      } catch (error) {
        console.error('[chat] message create failed', { matchId, error });
        throw error;
      }

      // Update match document lastMessage + sender (used for unread badge)
      console.info('[chat] updating match metadata', { matchId });
      try {
        await updateDoc(doc(db, 'matches', matchId), {
          lastMessage:         MATCH_THREAD_PREVIEW,
          lastMessageTime:     serverTimestamp(),
          lastMessageFromUid:  authUser.uid,
        });
        console.info('[chat] match metadata update succeeded', { matchId });
      } catch (error) {
        console.error('[chat] match metadata update failed', { matchId, error });
        throw error;
      }
    } catch (err) {
      console.warn('Message send failed:', err);
      if (!delivered) {
        if ((err as { code?: string }).code === 'permission-denied') {
          // The rules refuse a send for a thread that has been closed to this
          // person (the other person left, or blocked them, or it was removed).
          // That isn't a connection problem, retrying can't fix it, and which of
          // those it was is not theirs to be told. Say it is unavailable, once.
          setSendDenied(true);
        } else {
          // Restore the draft and tell the user — silent loss is worse. Unless
          // they've already started typing the next message: don't overwrite it.
          setChatInput((current) => (current ? current : trimmed));
          setSendError('Message didn’t send — check your connection and try again.');
          setTimeout(() => setSendError(null), 4000);
        }
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    return delivered;
  }, [authUser, canChat, matchId, messages.length, sending]);


  const dogName = otherProfile?.name ?? 'Your Match';
  // Where the two dogs' declared limits cross, owner-named. Shown before accepting.
  const conflicts = useMemo(
    () => playdateConflicts(myProfile, otherProfile),
    [myProfile, otherProfile],
  );

  const proposePlaydate = useCallback(async () => {
    const { date, time, place } = playdateDraft;
    if (!date || !place.trim()) return;
    // <input type="date"> accepts yesterday and year 99999; a past playdate that
    // gets confirmed would open the rating prompt at once.
    const problem = playdateDraftProblem(playdateDraft);
    setPlaydateProblem(problem);
    if (problem) return;
    const when = time ? `${date} at ${time}` : date;
    const delivered = await sendMessage(`📅 Playdate proposal: ${when} — ${place.trim()}`, {
      type: 'playdate_proposal',
      playdate: { date, time, place: place.trim() },
    });
    if (!delivered) return; // keep the form + draft so the user can retry
    trackEvent('playdate_proposed', { match_id: matchId, is_counter: counterOfId !== null });
    if (counterOfId) recordResponse(counterOfId, 'countered');
    setCounterOfId(null);
    setPlaydateProblem(null);
    setShowPlaydateForm(false);
    setPlaydateDraft({ date: '', time: '', place: '' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playdateDraft, sendMessage, matchId, counterOfId]);

  const acceptPlaydate = useCallback(async (proposal: Message) => {
    if (!proposal.playdate) return;
    const { date, time, place } = proposal.playdate;
    const when = time ? `${date} at ${time}` : date;
    const delivered = await sendMessage(`✅ Playdate confirmed: ${when} — ${place}`, {
      type: 'playdate_confirmed',
      playdate: proposal.playdate,
    });
    if (delivered) {
      trackEvent('playdate_confirmed', { match_id: matchId, had_conflicts: conflicts.length > 0 });
    }
  }, [sendMessage, matchId, conflicts.length]);

  // Accept is one tap, unless the two dogs' declared limits cross: then a short
  // sheet names them first and has to be tapped through.
  function handleAcceptTap(proposal: Message) {
    if (conflicts.length > 0) setAcceptCandidate(proposal);
    else void acceptPlaydate(proposal);
  }

  async function handleDecline(proposal: Message) {
    if (!proposal.playdate) return;
    setConfirmDeclineId(null);
    const delivered = await sendMessage(
      `Can’t make ${formatPlaydateWhen(proposal.playdate)}. Thanks for suggesting it! 🐾`,
    );
    if (delivered) recordResponse(proposal.id, 'declined');
  }

  // "Suggest another time": the proposal form again, with the same place filled in.
  function handleSuggestAnotherTime(proposal: Message) {
    setPlaydateDraft({ date: '', time: '', place: proposal.playdate?.place ?? '' });
    setPlaydateProblem(null);
    setCounterOfId(proposal.id);
    setShowPlaydateForm(true);
  }

  function handleAddToCalendar(p: PlaydateDetails) {
    const ics = buildPlaydateIcs(p, { dogName, uidSeed: matchId });
    if (!ics) return;
    downloadTextFile(playdateIcsFileName(dogName, p.date), 'text/calendar;charset=utf-8', ics);
  }

  // ── Playdate Payout: rating prompt once a playdate has actually HAPPENED ──────
  useEffect(() => {
    if (!authUser || !matchId || !hasPastPlaydate) return;
    let cancelled = false;
    hasRatedPlaydate(authUser.uid, matchId).then((rated) => {
      if (!cancelled) setAlreadyRated(rated);
    });
    return () => { cancelled = true; };
  }, [authUser, matchId, hasPastPlaydate]);

  async function handleSubmitRating(stars: number, wouldMeetAgain: boolean) {
    if (!authUser || !otherUserId) return;
    await submitPlaydateRating({
      matchId,
      raterId: authUser.uid,
      dogId: otherUserId,
      stars,
      wouldMeetAgain,
    });
    trackEvent('playdate_rated', { match_id: matchId, stars, would_meet_again: wouldMeetAgain });
    setAlreadyRated(true);
    setShowRatingModal(false);
    setMemoryCardStars(stars);
  }

  async function handleShareMemoryCard() {
    if (!memoryCardRef.current || sharingMemoryCard) return;
    setSharingMemoryCard(true);
    trackEvent('memory_card_share_click', { match_id: matchId });
    try {
      const result = await shareOrDownloadCard(memoryCardRef.current, 'playdate-godoggydate-card.png');
      trackEvent('memory_card_shared', { match_id: matchId, method: result });
    } catch {
      // non-critical — let them retry
    } finally {
      setSharingMemoryCard(false);
    }
  }

  async function handleUnblock() {
    if (!authUser || !otherUserId || unblocking) return;
    setUnblocking(true);
    setUnblockError(false);
    try {
      await unblockUser(authUser.uid, otherUserId);
    } catch {
      setUnblockError(true);
    } finally {
      setUnblocking(false);
    }
  }

  // ── Loading / access states ───────────────────────────────────────────────────

  // loadingProfile is only ever cleared by the signed-in match listener, so it
  // must not gate the signed-out case — that left a signed-out visitor on this
  // spinner forever instead of sending them to /app.
  if (authLoading || (authUser && loadingProfile) || !handoffAttempted) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) return null; // the effect above redirects to /app

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-4xl">😕</span>
        <p className="font-display text-2xl text-brown">Couldn&apos;t load this chat</p>
        <p className="text-brown-light text-sm">Check your connection and try again.</p>
        <button
          onClick={() => {
            setLoadingProfile(true);
            setLoadRetryToken((t) => t + 1);
          }}
          className="btn-primary px-8 py-3"
        >
          Retry
        </button>
      </div>
    );
  }

  if (endState === 'left') {
    return (
      <ChatNotice emoji="👋" title="This dog parent has left GoDoggyDate">
        <p className="max-w-xs text-sm leading-relaxed text-brown-light">
          They’re no longer on GoDoggyDate, so this chat isn’t available any more.
        </p>
        <Link href="/app/matches" className="btn-primary px-8 py-3">Back to Matches</Link>
      </ChatNotice>
    );
  }

  // Closed to this person and not theirs to be told why: the other person
  // blocked them, the server refused a send, the thread was removed, or it was
  // never theirs. One neutral answer for all of them.
  if (endState !== null || blockedMe || sendDenied) {
    return (
      <ChatNotice emoji="💬" title="This conversation is no longer available">
        <p className="max-w-xs text-sm leading-relaxed text-brown-light">
          You can find your other matches in Matches.
        </p>
        <Link href="/app/matches" className="btn-primary px-8 py-3">Back to Matches</Link>
      </ChatNotice>
    );
  }

  if (blockedByMe) {
    return (
      <ChatNotice emoji="🚫" title={`You blocked ${dogName}`}>
        <p className="max-w-xs text-sm leading-relaxed text-brown-light">
          They can’t see you or message you, and you won’t see them. They weren’t told.
        </p>
        {unblockError && (
          <p role="alert" className="text-xs font-semibold text-red-600">
            That didn’t go through. Check your connection and try again.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleUnblock}
            disabled={unblocking}
            className="btn-primary px-8 py-3 disabled:opacity-50"
          >
            {unblocking ? 'Unblocking…' : `Unblock ${dogName}`}
          </button>
          <Link href="/app/messages" className="py-2 text-sm text-brown-light hover:text-brown">Back to Messages</Link>
        </div>
      </ChatNotice>
    );
  }

  const dogPhoto = getPrimaryRenderablePhoto(otherProfile?.photos);
  // <bdi>: a name in another script (Arabic, Hebrew) must not reorder the text around it.
  const ownerLabel = otherOwnerFirstName
    ? <><bdi>{otherOwnerFirstName}</bdi> · <bdi>{dogName}</bdi>&apos;s owner</>
    : null;
  // Starter ideas only before anyone has said anything.
  const showStarters = canChat && messagesLoaded && messages.length === 0;

  // The facts of a playdate, once confirmed and still ahead: the quick messages and calendar file.
  const confirmedActions = (p: PlaydateDetails): ReactNode => {
    const upcoming = hasIsoDate(p) && p.date >= todayIso;
    if (!upcoming) return null;
    return (
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sendMessage('I’m here! 🐾')}
          disabled={sending}
          className="min-h-[40px] rounded-full bg-primary px-4 text-xs font-bold text-white shadow-sm disabled:opacity-50"
        >
          I’m here
        </button>
        <button
          type="button"
          onClick={() => void sendMessage('Running a few minutes late. See you soon! ⏰')}
          disabled={sending}
          className="min-h-[40px] rounded-full bg-gold/25 px-4 text-xs font-bold text-brown disabled:opacity-50"
        >
          Running late
        </button>
        <button
          type="button"
          onClick={() => handleAddToCalendar(p)}
          className="min-h-[40px] rounded-full border border-border bg-white px-4 text-xs font-bold text-brown"
        >
          📆 Add to calendar
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen h-dvh bg-cream">

      {showRatingModal && (
        <PlaydateRatingModal
          dogName={dogName}
          onSubmit={handleSubmitRating}
          onDismiss={() => setShowRatingModal(false)}
        />
      )}

      {/* Report / block sheet. Blocking always asks first and ends with an Undo. */}
      {otherUserId && (
        <SafetySheet
          open={showReportMenu}
          onClose={() => setShowReportMenu(false)}
          targetUserId={otherUserId}
          targetName={otherProfile?.name}
          matchId={matchId}
          source="chat"
          onBlocked={() => router.replace('/app/messages')}
        />
      )}

      {/* Limits cross: say so before accepting. Only when they do. */}
      {acceptCandidate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setAcceptCandidate(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="accept-sheet-title"
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white px-5 pt-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="accept-sheet-title" className="text-center font-display text-xl text-brown">Before you accept</h2>
            <p className="mt-1 text-center text-xs text-brown-light">
              What you and {dogName}&apos;s owner each said about your dogs:
            </p>
            <ul className="mt-3 space-y-2">
              {conflicts.map((limit) => (
                <li
                  key={limit.id}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold leading-snug text-amber-950 [overflow-wrap:anywhere]"
                >
                  {limit.text}
                  {limit.detail && <span className="font-normal">. {limit.detail}.</span>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                disabled={sending}
                onClick={() => {
                  const proposal = acceptCandidate;
                  setAcceptCandidate(null);
                  void acceptPlaydate(proposal);
                }}
                className="btn-primary min-h-[48px] w-full py-3 disabled:opacity-50"
              >
                Got it, accept playdate
              </button>
              <button
                type="button"
                onClick={() => setAcceptCandidate(null)}
                className="min-h-[44px] w-full py-2 text-sm text-brown-light hover:text-brown"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send-failure toast */}
      {sendError && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-semibold rounded-full px-5 py-2.5 shadow-lg max-w-[90vw] text-center">
          {sendError}
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 z-40 bg-white/95 backdrop-blur border-b border-border px-4 h-16 flex items-center gap-3">
        <Link
          href="/app/messages"
          className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center text-2xl text-brown-light hover:text-brown transition-colors"
          aria-label="Back"
        >
          ←
        </Link>
        <Link
          href={`/app/dog/${matchId}`}
          aria-label={`View ${dogName}'s profile`}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <div className="w-11 h-11 rounded-[0.9rem] overflow-hidden bg-gradient-to-br from-gold to-primary shrink-0 flex items-center justify-center shadow-sm">
            {dogPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dogPhoto} alt={dogName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl">🐕</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-brown leading-tight truncate">{dogName}</p>
            {(ownerLabel ?? otherProfile?.breed) && (
              <p className="text-xs text-brown-light truncate">{ownerLabel ?? otherProfile?.breed}</p>
            )}
          </div>
        </Link>
        {/* Only worth a pill when chat is NOT simply free for everyone. */}
        {!CHAT_FREE_LAUNCH_MODE && (
          <div className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1">
            {canChat ? 'Chat unlocked' : 'Chat locked'}
          </div>
        )}
        <button
          onClick={handleToggleBestFriend}
          disabled={togglingBestFriend}
          aria-label={myBestFriendMatchId === matchId ? 'Remove Best Friend' : `Make ${dogName} Best Friend`}
          title={myBestFriendMatchId === matchId ? 'Best Friend' : 'Make Best Friend'}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-cream transition-colors disabled:opacity-50 text-lg"
        >
          {myBestFriendMatchId === matchId ? '⭐' : '☆'}
        </button>
        <button
          onClick={() => setShowReportMenu(true)}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-cream transition-colors text-brown-light hover:text-brown"
          aria-label="More options"
          aria-haspopup="dialog"
        >
          •••
        </button>
      </header>

      {/* Messages */}
      {/* Capped on desktop: full-viewport-wide chat bubbles beside the
          sidebar read as a log file, not a conversation. Mobile unchanged. */}
      <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3 w-full lg:max-w-3xl lg:mx-auto">
        {!canChat && (
          <div className="rounded-[1.5rem] border border-border bg-white px-4 py-4 text-center shadow-sm">
            {isSeedUserId(otherUserId) ? (
              <>
                <p className="font-semibold text-brown">Demo profile</p>
                <p className="mt-2 text-sm leading-relaxed text-brown-light">
                  This is a sample profile used to preview the app and isn&apos;t available for chat unlocks.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-brown">Unlock chat with {dogName}</p>
                <p className="mt-2 mb-4 text-sm leading-relaxed text-brown-light">
                  {getChatUnlockPitch()}
                </p>
                <ChatUnlockPanel matchId={matchId} dogName={dogName} />
                {founding.phase === 'paid' && getFoundingMemberLink(authUser.uid) && (
                  <a
                    href={getFoundingMemberLink(authUser.uid)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 block text-xs font-semibold text-primary underline underline-offset-2"
                  >
                    ⭐ Or become a Founding Member — $39 once. Every chat, forever, and a numbered badge.
                  </a>
                )}
              </>
            )}
            <p className="mt-3 text-xs leading-relaxed text-brown-light">
              {SAFETY_TIP}
            </p>
          </div>
        )}
        {/* Generic advice yields to the specific briefing once a playdate is
            actually on the calendar — otherwise the two say the same thing
            twice and the one that matters reads as boilerplate. */}
        {canChat && !upcomingPlaydate && (
          <div className="rounded-[1.25rem] border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-brown-light">
            {SAFETY_TIP}
          </div>
        )}
        {canChat && hasEarlier && (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={loadEarlierMessages}
              disabled={loadingEarlier}
              className="min-h-[40px] rounded-full border border-border bg-white px-4 text-xs font-bold text-brown shadow-sm disabled:opacity-50"
            >
              {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
            </button>
            {earlierError && (
              <p role="alert" className="text-xs font-semibold text-red-600">
                Couldn’t load earlier messages. Check your connection and try again.
              </p>
            )}
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-16">
            <span className="text-5xl">👋</span>
            <p className="font-display text-2xl text-brown">
              {canChat ? 'Someone has to text first' : 'Chat is locked'}
            </p>
            <p className="text-brown-light text-sm max-w-xs leading-relaxed">
              {canChat
                ? `And dogs can't type, so it's on you. Say hi to ${dogName}.`
                : `Unlock this match above to send ${dogName} your first message.`}
            </p>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.moderated) {
            // Removed by the server's content filter. Muted and never drawn as
            // a playdate card, whatever else is left on the document.
            const fromMe = msg.fromUserId === authUser.uid;
            return (
              <div
                key={msg.id}
                className={`max-w-[80%] rounded-[1.25rem] border border-dashed border-border bg-cream-dark px-4 py-2.5 ${
                  fromMe ? 'self-end' : 'self-start'
                }`}
              >
                <p className="text-sm italic text-brown-light">{msg.text}</p>
                <p className="mt-1 text-[10px] text-brown-light">{formatTime(msg.createdAt)}</p>
              </div>
            );
          }
          if (msg.type === 'playdate_confirmed' && msg.playdate) {
            // Its proposal card already says "Confirmed"; the raw text would be a duplicate.
            if (proposalKeys.has(playdateKey(msg.playdate))) return null;
            return (
              <div
                key={msg.id}
                className="self-center w-full max-w-[85%] rounded-[1.25rem] border border-primary/25 bg-primary/5 px-4 py-3 shadow-sm"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">✅ Playdate · Confirmed</p>
                <p className="mt-1 text-sm font-semibold text-brown">{formatPlaydateWhen(msg.playdate)}</p>
                <p className="text-sm text-brown-light break-words">{msg.playdate.place}</p>
                {confirmedActions(msg.playdate)}
                <p className="mt-1.5 text-[10px] text-brown-light">{formatTime(msg.createdAt)}</p>
              </div>
            );
          }
          if (msg.type === 'playdate_proposal' && msg.playdate) {
            const fromMe = msg.fromUserId === authUser.uid;
            const confirmed = confirmedPlaydateKeys.has(playdateKey(msg.playdate));
            const passed = hasIsoDate(msg.playdate) && msg.playdate.date < todayIso;
            const response = responses[msg.id];
            const proposer = fromMe ? 'you' : (otherOwnerFirstName ?? dogName);
            return (
              <div
                key={msg.id}
                className={`max-w-[85%] rounded-[1.25rem] border px-4 py-3 shadow-sm ${
                  fromMe ? 'self-end border-primary/25 bg-primary/5' : 'self-start border-border bg-white'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  📅 Playdate {confirmed ? '· Confirmed' : 'proposal'}
                  <span className="font-semibold normal-case tracking-normal text-brown-light"> · from <bdi>{proposer}</bdi></span>
                </p>
                <p className="mt-1 text-sm font-semibold text-brown">
                  {formatPlaydateWhen(msg.playdate)}
                </p>
                <p className="text-sm text-brown-light break-words">{msg.playdate.place}</p>
                {confirmed && confirmedActions(msg.playdate)}
                {!fromMe && !confirmed && passed && (
                  <p className="mt-2 text-xs font-semibold text-brown-light">This date has passed.</p>
                )}
                {fromMe && !confirmed && !passed && (
                  <p className="mt-2 text-xs text-brown-light">Waiting for {otherOwnerFirstName ?? dogName} to reply.</p>
                )}
                {!fromMe && !confirmed && !passed && response && (
                  <p className="mt-2 text-xs font-semibold text-brown-light">
                    {response === 'declined' ? 'You declined this one.' : 'You suggested another time.'}
                  </p>
                )}
                {!fromMe && !confirmed && !passed && !response && (
                  confirmDeclineId === msg.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-brown">Let {otherOwnerFirstName ?? dogName} know you can’t make it?</span>
                      <button
                        type="button"
                        onClick={() => void handleDecline(msg)}
                        disabled={sending}
                        className="min-h-[40px] rounded-full bg-brown px-4 text-xs font-bold text-white disabled:opacity-50"
                      >
                        Yes, decline
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeclineId(null)}
                        className="min-h-[40px] rounded-full px-3 text-xs font-semibold text-brown-light"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptTap(msg)}
                        disabled={sending}
                        className="min-h-[40px] rounded-full bg-primary px-4 text-xs font-bold text-white shadow-sm hover:scale-105 transition-transform disabled:opacity-50"
                      >
                        Accept playdate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuggestAnotherTime(msg)}
                        disabled={sending}
                        className="min-h-[40px] rounded-full border border-border bg-white px-4 text-xs font-bold text-brown disabled:opacity-50"
                      >
                        Suggest another time
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeclineId(msg.id)}
                        disabled={sending}
                        className="min-h-[40px] rounded-full px-3 text-xs font-semibold text-brown-light hover:text-brown disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  )
                )}
                <p className="mt-1.5 text-[10px] text-brown-light">{formatTime(msg.createdAt)}</p>
              </div>
            );
          }
          return (
            <ChatBubble
              key={msg.id}
              text={msg.text}
              fromMe={msg.fromUserId === authUser.uid}
              isSystem={msg.isSystem}
              time={msg.isSystem ? undefined : formatTime(msg.createdAt)}
              pending={msg.pending && msg.fromUserId === authUser.uid}
            />
          );
        })}

        {/* Right beside the newest message, where the playdate just ended, not
            buried at the top of a long thread. */}
        {showRatingBanner && (
          <button
            onClick={() => setShowRatingModal(true)}
            className="rounded-[1.25rem] border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-brown flex items-center justify-between gap-3"
          >
            <span>🎾 How did the playdate with {dogName} go?</span>
            <span className="text-primary shrink-0">Rate it →</span>
          </button>
        )}
        {memoryCardStars !== null && (
          <div className="flex flex-col items-center gap-3 py-4">
            <PlaydateMemoryCard
              dogName={dogName}
              dogBreed={otherProfile?.breed}
              photos={otherProfile?.photos}
              stars={memoryCardStars}
              innerRef={memoryCardRef}
            />
            <div className="flex gap-2">
              <button
                onClick={handleShareMemoryCard}
                disabled={sharingMemoryCard}
                className="btn-secondary px-5 py-2 text-sm disabled:opacity-50"
              >
                {sharingMemoryCard ? 'Rendering…' : '📤 Share this memory'}
              </button>
              <button
                onClick={() => setMemoryCardStars(null)}
                className="px-5 py-2 text-sm text-brown-light hover:text-brown transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pinned so it can't scroll away — this is the one thing in the thread
          you want to re-read on the way to the park. */}
      {canChat && upcomingPlaydate && otherProfile && (
        <PlaydateHeadsUpCard
          dogName={dogName}
          otherProfile={otherProfile}
          myProfile={myProfile}
          playdate={upcomingPlaydate}
          ownerFirstName={otherOwnerFirstName}
          compact={inputFocused}
        />
      )}

      {/* Playdate proposal form */}
      {showPlaydateForm && canChat && (
        <div className="shrink-0 border-t border-border bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary mb-2">
            📅 {counterOfId ? 'Suggest another time' : 'Propose a playdate'}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={playdateDraft.date}
              min={playdateDateBounds().min}
              max={playdateDateBounds().max}
              onChange={(e) => { setPlaydateDraft((d) => ({ ...d, date: e.target.value })); setPlaydateProblem(null); }}
              className="bg-cream rounded-xl px-3 py-2 text-sm text-brown outline-none border border-transparent focus:border-primary/30"
              aria-label="Playdate date"
            />
            <input
              type="time"
              value={playdateDraft.time}
              onChange={(e) => { setPlaydateDraft((d) => ({ ...d, time: e.target.value })); setPlaydateProblem(null); }}
              className="bg-cream rounded-xl px-3 py-2 text-sm text-brown outline-none border border-transparent focus:border-primary/30"
              aria-label="Playdate time"
            />
            <input
              type="text"
              placeholder="Where? (e.g. Maple Dog Park)"
              value={playdateDraft.place}
              maxLength={MAX_PLAYDATE_PLACE_LENGTH}
              onChange={(e) => {
                setPlaydateDraft((d) => ({ ...d, place: e.target.value }));
                setPlaydateProblem(null);
                if (contentError === 'playdate') setContentError(null);
              }}
              className="flex-1 min-w-[10rem] bg-cream rounded-xl px-3 py-2 text-sm text-brown placeholder:text-brown-light outline-none border border-transparent focus:border-primary/30"
              aria-label="Playdate place"
              aria-invalid={contentError === 'playdate'}
              aria-describedby={contentError === 'playdate' ? 'playdate-content-error' : undefined}
            />
          </div>
          {contentError === 'playdate' && (
            <p id="playdate-content-error" role="alert" className="mt-2 text-xs font-semibold text-red-600">
              {CONTENT_FILTER_MESSAGE}
            </p>
          )}
          {playdateProblem && (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
              {playdateProblem.message}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={proposePlaydate}
              disabled={!playdateDraft.date || !playdateDraft.place.trim() || sending}
              className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-45"
            >
              Send proposal
            </button>
            <button
              onClick={() => {
                setShowPlaydateForm(false);
                setPlaydateProblem(null);
                setCounterOfId(null);
                if (contentError === 'playdate') setContentError(null);
              }}
              className="rounded-full px-4 py-2 text-xs font-semibold text-brown-light hover:text-brown"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Offline: the thread still shows what it has, and a send waits for the network. */}
      {!online && (
        <div
          role="status"
          className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950 w-full lg:max-w-3xl lg:mx-auto"
        >
          You’re offline. Messages will send when you’re back online.
        </div>
      )}

      {/* Quick actions. The starter ideas fill the box for editing, and only
          show before the first message. */}
      <div className="shrink-0 overflow-x-auto flex gap-2 px-4 py-2.5 bg-white border-t border-border w-full lg:max-w-3xl lg:mx-auto">
        <button
          onClick={() => setShowPlaydateForm((v) => !v)}
          disabled={!canChat || sending}
          className="shrink-0 min-h-[40px] bg-gold/20 text-brown font-semibold text-xs rounded-full px-3 py-2 hover:bg-gold/30 transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45"
        >
          📅 Propose playdate
        </button>
        {showStarters && buildSmartPromptsFromProfile(otherProfile).map((p) => (
          <button
            key={p}
            onClick={() => {
              setChatInput(p);
              setContentError(null);
              inputRef.current?.focus();
            }}
            className="shrink-0 min-h-[40px] bg-primary/10 text-primary font-semibold text-xs rounded-full px-3 py-2 hover:bg-primary/20 transition-colors whitespace-nowrap"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      {contentError === 'message' && (
        <p
          id="chat-content-error"
          role="alert"
          className="shrink-0 bg-white px-5 pt-2 text-xs font-semibold text-red-600 w-full lg:max-w-3xl lg:mx-auto"
        >
          {CONTENT_FILTER_MESSAGE}
        </p>
      )}
      <div className="shrink-0 flex gap-2 px-4 py-3 bg-white border-t border-border pb-safe w-full lg:max-w-3xl lg:mx-auto">
        <input
          ref={inputRef}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          className="flex-1 bg-cream rounded-full px-4 py-3 text-sm text-brown placeholder:text-brown-light outline-none border border-transparent focus:border-primary/30"
          placeholder={`Message ${dogName}…`}
          value={chatInput}
          aria-invalid={contentError === 'message'}
          aria-describedby={contentError === 'message' ? 'chat-content-error' : undefined}
          onChange={(e) => {
            setChatInput(e.target.value);
            if (contentError === 'message') setContentError(null);
          }}
          // Enter while an IME is composing (Japanese/Chinese/Korean) confirms the
          // candidate — it must not send the half-typed message.
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && sendMessage(chatInput)}
          // Not disabled while a send is in flight: a disabled input blurs, so the
          // phone keyboard closed after every message. sendMessage already
          // ignores a second send until the first has finished.
          disabled={!canChat}
          maxLength={MAX_MESSAGE_LENGTH}
          autoComplete="off"
        />
        <button
          onClick={() => sendMessage(chatInput)}
          disabled={!chatInput.trim() || sending || !canChat}
          className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform disabled:opacity-40 disabled:scale-100 shrink-0"
          aria-label="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
