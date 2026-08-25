'use client';
// web/app/app/messages/[matchId]/page.tsx
// Real-time chat for a matched pair.
// Messages: matches/{matchId}/messages/{messageId}
// { text: string, fromUserId: string, createdAt: Timestamp }
// Also updates matches/{matchId}.lastMessage + lastMessageTime on send.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import Link from 'next/link';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, doc, getDoc, updateDoc, setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import ChatBubble from '../../../../components/ChatBubble';
import { getPrimaryRenderablePhoto } from '../../../../lib/photos';
import { trackEvent } from '../../../../lib/analytics';
import { isUserChatUnlocked } from '../../../../../shared/matchAccess';
import ChatUnlockPanel, { isSeedUserId } from '../../../../components/ChatUnlockPanel';
import { blockUser } from '../../../../lib/blocks';
import { onEntitlements, getFoundingMemberLink } from '../../../../lib/entitlements';
import { getChatUnlockPitch } from '../../../../../shared/utils/stripe';
import { hasRatedPlaydate, submitPlaydateRating } from '../../../../lib/ratings';
import PlaydateRatingModal from '../../../../components/PlaydateRatingModal';
import PlaydateMemoryCard from '../../../../components/PlaydateMemoryCard';
import PlaydateHeadsUpCard from '../../../../components/PlaydateHeadsUpCard';
import { shareOrDownloadCard } from '../../../../lib/shareCard';
import { setBestFriend, clearBestFriend } from '../../../../lib/bestFriend';

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
  isSystem?:  boolean;
  type?:      'playdate_proposal' | 'playdate_confirmed';
  playdate?:  PlaydateDetails;
}

function playdateKey(p?: PlaydateDetails): string {
  return p ? `${p.date}|${p.time}|${p.place}` : '';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SAFETY_TIP = '🐾 Tip: Always meet in a public place for your first playdate.';
const MATCH_THREAD_PREVIEW = 'New message';
const MAX_MESSAGE_LENGTH = 1000;

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
  prompts.push(`Our dogs would cause problems together 🐶`);
  prompts.push(`Coffee + dogs? ☕🐕`);

  // Always include a simple hello as last resort
  if (prompts.length < 2) {
    prompts.push('Hey! Our dogs should meet 🐾');
  }

  return prompts.slice(0, 4);
}

function formatTime(createdAt: { seconds: number } | null): string {
  if (!createdAt) return '';
  const d = new Date(createdAt.seconds * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  const [messages, setMessages]             = useState<Message[]>([]);
  const [chatInput, setChatInput]           = useState('');
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState<string | null>(null);
  const [chatUnlocked, setChatUnlocked]     = useState(false);
  const [hasLifetime, setHasLifetime]       = useState(false);
  const [accessDenied, setAccessDenied]     = useState(false);
  const [loadError, setLoadError]           = useState(false);
  const [loadRetryToken, setLoadRetryToken] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [reportDone, setReportDone]         = useState<string | null>(null);
  const [showPlaydateForm, setShowPlaydateForm] = useState(false);
  const [playdateDraft, setPlaydateDraft]   = useState<PlaydateDetails>({ date: '', time: '', place: '' });
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [alreadyRated, setAlreadyRated]     = useState(true); // assume rated until checked, to avoid a flash
  const [memoryCardStars, setMemoryCardStars] = useState<number | null>(null);
  const [sharingMemoryCard, setSharingMemoryCard] = useState(false);
  const memoryCardRef = useRef<HTMLDivElement>(null);
  const [myBestFriendMatchId, setMyBestFriendMatchId] = useState<string | null>(null);
  const [togglingBestFriend, setTogglingBestFriend] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  // Which read-timestamp slot on the match doc is THIS user's, resolved once the
  // match loads — used to mark the thread read so the unread badge clears.
  const myReadFieldRef = useRef<'dog1LastReadAt' | 'dog2LastReadAt' | null>(null);

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
    let profileLoaded = false;

    const unsub = onSnapshot(doc(db, 'matches', matchId), async (matchSnap) => {
      setLoadError(false); // a successful delivery means we're not actually stuck

      if (!matchSnap.exists()) {
        setAccessDenied(true);
        setLoadingProfile(false);
        return;
      }

      const matchData = matchSnap.data() as {
        dog1UserId: string; dog2UserId: string;
        dog1Id: string;    dog2Id: string;
        chatUnlocked?: boolean;
        dog1ChatUnlocked?: boolean | null;
        dog2ChatUnlocked?: boolean | null;
      };

      // Verify current user is a participant
      if (matchData.dog1UserId !== authUser!.uid && matchData.dog2UserId !== authUser!.uid) {
        setAccessDenied(true);
        setLoadingProfile(false);
        return;
      }

      const iAmDog1 = matchData.dog1UserId === authUser!.uid;
      myReadFieldRef.current = iAmDog1 ? 'dog1LastReadAt' : 'dog2LastReadAt';
      const resolvedOtherUserId = iAmDog1
        ? matchData.dog2UserId
        : matchData.dog1UserId;

      setOtherUserId(resolvedOtherUserId);
      setChatUnlocked(isUserChatUnlocked(matchData, authUser.uid));

      if (!profileLoaded) {
        profileLoaded = true;
        try {
          const profileSnap = await getDoc(doc(db, 'dogs', resolvedOtherUserId));
          if (profileSnap.exists()) {
            setOtherProfile(profileSnap.data() as SavedDogProfile);
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
      setLoadError(true);
      setLoadingProfile(false);
    });

    return unsub;
  }, [authUser, matchId, loadRetryToken]);

  // ── Real-time messages listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!matchId || accessDenied || !canChat) return;

    const { db } = getFirebase();
    const msgsRef = collection(db, 'matches', matchId, 'messages');
    const q = query(msgsRef, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(q, { includeMetadataChanges: false }, (snap) => {
      const msgs: Message[] = snap.docs.map((d) => {
        // serverTimestamps:'estimate' gives a just-sent (pending) message an
        // estimated createdAt instead of null — null sorts first under 'asc',
        // making the sender's own message flash at the TOP before the server ack.
        const data = d.data({ serverTimestamps: 'estimate' });
        return {
          id:         d.id,
          text:       data.text as string,
          fromUserId: (data.fromUserId ?? data.senderId ?? '') as string,
          createdAt:  data.createdAt ?? null,
          isSystem:   data.isSystem ?? false,
          type:       data.type,
          playdate:   data.playdate,
        };
      });
      setMessages(msgs);

      // Mark the thread read when the newest message is from the other user, so
      // the bottom-nav unread badge clears on READ (not only when you reply).
      const last = msgs[msgs.length - 1];
      const field = myReadFieldRef.current;
      if (last && field && last.fromUserId && last.fromUserId !== authUser?.uid) {
        void updateDoc(doc(db, 'matches', matchId), { [field]: serverTimestamp() }).catch(() => {});
      }
    });

    return unsub;
  }, [matchId, accessDenied, canChat]);

  useEffect(() => {
    if (!matchId || authLoading || loadingProfile || accessDenied) return;
    trackEvent(canChat ? 'chat_view' : 'chat_unlock_prompt_view', {
      match_id: matchId,
    });
  }, [accessDenied, authLoading, canChat, loadingProfile, matchId]);

  // ── Auto-scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    extra?: { type: Message['type']; playdate: PlaydateDetails },
  ): Promise<boolean> => {
    if (!text.trim() || !authUser || !matchId || sending || !canChat) return false;
    setSending(true);
    setSendError(null);
    const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
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
        // Restore the draft and tell the user — silent loss is worse.
        setChatInput(trimmed);
        setSendError('Message didn’t send — check your connection and try again.');
        setTimeout(() => setSendError(null), 4000);
      }
    } finally {
      setSending(false);
    }
    return delivered;
  }, [authUser, canChat, matchId, messages.length, sending]);

  // ── Playdates (the product's north-star action) ───────────────────────────────
  const confirmedPlaydateKeys = new Set(
    messages.filter((m) => m.type === 'playdate_confirmed').map((m) => playdateKey(m.playdate)),
  );

  // The soonest confirmed playdate that hasn't happened yet — what the Heads-Up
  // card briefs for. 'en-CA' formats as YYYY-MM-DD, matching the <input
  // type="date"> value, so these compare lexicographically as local calendar
  // days (a UTC-based comparison would roll the date over early for anyone west
  // of Greenwich and late for anyone east).
  const todayIso = new Date().toLocaleDateString('en-CA');
  const confirmedPlaydates = messages
    .filter((m) => m.type === 'playdate_confirmed' && m.playdate)
    .map((m) => m.playdate!);
  const upcomingPlaydate =
    confirmedPlaydates
      .filter((p) => p.date >= todayIso)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))[0] ?? null;
  // A rating is only honest once the meetup has actually happened. This used to
  // fire the moment a playdate was CONFIRMED — so a date a week out prompted
  // "How did it go?", and the resulting ratings doc is folded into the other
  // dog's trustScore by the onRatingCreated Cloud Function.
  const hasPastPlaydate = confirmedPlaydates.some((p) => p.date < todayIso);

  const proposePlaydate = useCallback(async () => {
    const { date, time, place } = playdateDraft;
    if (!date || !place.trim()) return;
    const when = time ? `${date} at ${time}` : date;
    const delivered = await sendMessage(`📅 Playdate proposal: ${when} — ${place.trim()}`, {
      type: 'playdate_proposal',
      playdate: { date, time, place: place.trim() },
    });
    if (!delivered) return; // keep the form + draft so the user can retry
    trackEvent('playdate_proposed', { match_id: matchId });
    setShowPlaydateForm(false);
    setPlaydateDraft({ date: '', time: '', place: '' });
  }, [playdateDraft, sendMessage, matchId]);

  const acceptPlaydate = useCallback(async (proposal: Message) => {
    if (!proposal.playdate) return;
    const { date, time, place } = proposal.playdate;
    const when = time ? `${date} at ${time}` : date;
    const delivered = await sendMessage(`✅ Playdate confirmed: ${when} — ${place}`, {
      type: 'playdate_confirmed',
      playdate: proposal.playdate,
    });
    if (delivered) {
      trackEvent('playdate_confirmed', { match_id: matchId });
    }
  }, [sendMessage, matchId]);

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

  // ── Block / Report ────────────────────────────────────────────────────────────
  const handleReport = useCallback(async (reason: 'block' | 'spam' | 'inappropriate') => {
    if (!authUser || !otherUserId) return;
    const { db } = getFirebase();

    // Block FIRST and independently — the safety action must not be skipped
    // because the report write fails (e.g. repeat reports: rules forbid
    // updating an existing report doc).
    if (reason === 'block') {
      try {
        await blockUser(authUser.uid, otherUserId);
      } catch (error) {
        console.error('Block failed:', error);
        setReportDone('Block failed — check your connection and try again.');
        setShowReportMenu(false);
        setTimeout(() => setReportDone(null), 3000);
        return;
      }
    }

    // Unique id per submission so repeat reports are creates, never updates.
    const reportId = `${authUser.uid}_${otherUserId}_${Date.now()}`;
    try {
      await setDoc(doc(db, 'reports', reportId), {
        reporterId:   authUser.uid,
        targetUserId: otherUserId,
        matchId,
        reason,
        createdAt:    serverTimestamp(),
      });
      trackEvent('report_submitted', {
        match_id: matchId,
        reason,
      });
    } catch { /* non-blocking — fire and forget */ }
    setShowReportMenu(false);
    setReportDone(reason === 'block' ? 'User blocked.' : 'Report submitted. Thank you.');
    if (reason === 'block') {
      setTimeout(() => router.replace('/app/messages'), 1200);
    }
  }, [authUser, otherUserId, matchId, router]);

  // ── Loading / access states ───────────────────────────────────────────────────

  if (authLoading || loadingProfile || !handoffAttempted) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    router.replace('/app');
    return null;
  }

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

  if (accessDenied) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">🔒</span>
        <p className="font-display text-2xl text-brown">Access denied</p>
        <p className="text-brown-light text-sm">You are not part of this match.</p>
        <Link href="/app/matches" className="btn-primary px-8 py-3">Back to Matches</Link>
      </div>
    );
  }

  const dogName = otherProfile?.name ?? 'Your Match';
  const dogPhoto = getPrimaryRenderablePhoto(otherProfile?.photos);

  return (
    <div className="flex flex-col h-screen bg-cream">

      {showRatingModal && (
        <PlaydateRatingModal
          dogName={dogName}
          onSubmit={handleSubmitRating}
          onDismiss={() => setShowRatingModal(false)}
        />
      )}

      {/* Block/Report menu overlay */}
      {showReportMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
          onClick={() => setShowReportMenu(false)}
        >
          <div
            className="bg-white w-full max-w-md rounded-t-3xl px-5 py-6 flex flex-col gap-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-sm font-semibold text-brown-light mb-2">
              What would you like to do?
            </p>
            <button
              onClick={() => handleReport('spam')}
              className="w-full py-3.5 rounded-2xl bg-cream text-brown font-semibold text-sm hover:bg-cream-dark transition-colors"
            >
              ⚠️ Report spam or fake profile
            </button>
            <button
              onClick={() => handleReport('inappropriate')}
              className="w-full py-3.5 rounded-2xl bg-cream text-brown font-semibold text-sm hover:bg-cream-dark transition-colors"
            >
              🚩 Report inappropriate behaviour
            </button>
            <button
              onClick={() => handleReport('block')}
              className="w-full py-3.5 rounded-2xl bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 transition-colors"
            >
              🚫 Block this user
            </button>
            <button
              onClick={() => setShowReportMenu(false)}
              className="w-full py-3 text-brown-light text-sm hover:text-brown transition-colors mt-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Confirmation toast */}
      {reportDone && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-brown text-white text-sm font-semibold rounded-full px-5 py-2.5 shadow-lg">
          {reportDone}
        </div>
      )}

      {/* Send-failure toast */}
      {sendError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-semibold rounded-full px-5 py-2.5 shadow-lg max-w-[90vw] text-center">
          {sendError}
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 z-40 bg-white/95 backdrop-blur border-b border-border px-4 h-16 flex items-center gap-3">
        <Link href="/app/messages" className="text-2xl text-brown-light hover:text-brown transition-colors" aria-label="Back">
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
            {otherProfile?.breed && (
              <p className="text-xs text-brown-light truncate">{otherProfile.breed}</p>
            )}
          </div>
        </Link>
        <div className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1">
          {canChat ? 'Chat unlocked' : 'Chat locked'}
        </div>
        <button
          onClick={handleToggleBestFriend}
          disabled={togglingBestFriend}
          aria-label={myBestFriendMatchId === matchId ? 'Remove Best Friend' : `Make ${dogName} Best Friend`}
          title={myBestFriendMatchId === matchId ? 'Best Friend' : 'Make Best Friend'}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream transition-colors disabled:opacity-50 text-lg"
        >
          {myBestFriendMatchId === matchId ? '⭐' : '☆'}
        </button>
        <button
          onClick={() => setShowReportMenu(true)}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream transition-colors text-brown-light hover:text-brown"
          aria-label="More options"
        >
          •••
        </button>
      </header>

      {/* Messages */}
      {/* Capped on desktop: full-viewport-wide chat bubbles beside the
          sidebar read as a log file, not a conversation. Mobile unchanged. */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 w-full lg:max-w-3xl lg:mx-auto">
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
                {getFoundingMemberLink(authUser.uid) && (
                  <a
                    href={getFoundingMemberLink(authUser.uid)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 block text-xs font-semibold text-primary underline underline-offset-2"
                  >
                    🐾 Or go Founding Member — $39 once. Every chat, forever. Badge included.
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
        {canChat && hasPastPlaydate && !alreadyRated && (
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
          if (msg.type === 'playdate_proposal' && msg.playdate) {
            const fromMe = msg.fromUserId === authUser.uid;
            const confirmed = confirmedPlaydateKeys.has(playdateKey(msg.playdate));
            return (
              <div
                key={msg.id}
                className={`max-w-[85%] rounded-[1.25rem] border px-4 py-3 shadow-sm ${
                  fromMe ? 'self-end border-primary/25 bg-primary/5' : 'self-start border-border bg-white'
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  📅 Playdate {confirmed ? '· Confirmed' : 'proposal'}
                </p>
                <p className="mt-1 text-sm font-semibold text-brown">
                  {msg.playdate.date}{msg.playdate.time ? ` at ${msg.playdate.time}` : ''}
                </p>
                <p className="text-sm text-brown-light">{msg.playdate.place}</p>
                {!fromMe && !confirmed && (
                  <button
                    onClick={() => acceptPlaydate(msg)}
                    disabled={sending}
                    className="mt-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:scale-105 transition-transform disabled:opacity-50"
                  >
                    Accept playdate
                  </button>
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
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Pinned so it can't scroll away — this is the one thing in the thread
          you want to re-read on the way to the park. */}
      {canChat && upcomingPlaydate && otherProfile && (
        <PlaydateHeadsUpCard
          dogName={dogName}
          otherProfile={otherProfile}
          myProfile={myProfile}
          playdate={upcomingPlaydate}
        />
      )}

      {/* Playdate proposal form */}
      {showPlaydateForm && canChat && (
        <div className="shrink-0 border-t border-border bg-white px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary mb-2">📅 Propose a playdate</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={playdateDraft.date}
              onChange={(e) => setPlaydateDraft((d) => ({ ...d, date: e.target.value }))}
              className="bg-cream rounded-xl px-3 py-2 text-sm text-brown outline-none border border-transparent focus:border-primary/30"
              aria-label="Playdate date"
            />
            <input
              type="time"
              value={playdateDraft.time}
              onChange={(e) => setPlaydateDraft((d) => ({ ...d, time: e.target.value }))}
              className="bg-cream rounded-xl px-3 py-2 text-sm text-brown outline-none border border-transparent focus:border-primary/30"
              aria-label="Playdate time"
            />
            <input
              type="text"
              placeholder="Where? (e.g. Maple Dog Park)"
              value={playdateDraft.place}
              onChange={(e) => setPlaydateDraft((d) => ({ ...d, place: e.target.value }))}
              className="flex-1 min-w-[10rem] bg-cream rounded-xl px-3 py-2 text-sm text-brown placeholder:text-brown-light outline-none border border-transparent focus:border-primary/30"
              aria-label="Playdate place"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={proposePlaydate}
              disabled={!playdateDraft.date || !playdateDraft.place.trim() || sending}
              className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-45"
            >
              Send proposal
            </button>
            <button
              onClick={() => setShowPlaydateForm(false)}
              className="rounded-full px-4 py-2 text-xs font-semibold text-brown-light hover:text-brown"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Context-aware smart prompts */}
      <div className="shrink-0 overflow-x-auto flex gap-2 px-4 py-2.5 bg-white border-t border-border w-full lg:max-w-3xl lg:mx-auto">
        <button
          onClick={() => setShowPlaydateForm((v) => !v)}
          disabled={!canChat || sending}
          className="shrink-0 bg-gold/20 text-brown font-semibold text-xs rounded-full px-3 py-2 hover:bg-gold/30 transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45"
        >
          📅 Propose playdate
        </button>
        {buildSmartPromptsFromProfile(otherProfile).map((p) => (
          <button
            key={p}
            onClick={() => sendMessage(p)}
            disabled={!canChat || sending}
            className="shrink-0 bg-primary/10 text-primary font-semibold text-xs rounded-full px-3 py-2 hover:bg-primary/20 transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 flex gap-2 px-4 py-3 bg-white border-t border-border pb-safe w-full lg:max-w-3xl lg:mx-auto">
        <input
          className="flex-1 bg-cream rounded-full px-4 py-3 text-sm text-brown placeholder:text-brown-light outline-none border border-transparent focus:border-primary/30"
          placeholder={`Message ${dogName}…`}
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(chatInput)}
          disabled={sending || !canChat}
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
