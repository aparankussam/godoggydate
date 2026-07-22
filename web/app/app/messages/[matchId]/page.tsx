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
import { CHAT_UNLOCK_PRICE_CENTS, formatPrice } from '../../../../../shared/utils/stripe';

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
  prompts.push(`Weekend playdate? 🐶`);
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
  const [otherUserId, setOtherUserId]       = useState<string | null>(null);
  const [messages, setMessages]             = useState<Message[]>([]);
  const [chatInput, setChatInput]           = useState('');
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState<string | null>(null);
  const [chatUnlocked, setChatUnlocked]     = useState(false);
  const [hasLifetime, setHasLifetime]       = useState(false);
  const [accessDenied, setAccessDenied]     = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [reportDone, setReportDone]         = useState<string | null>(null);
  const [showPlaydateForm, setShowPlaydateForm] = useState(false);
  const [playdateDraft, setPlaydateDraft]   = useState<PlaydateDetails>({ date: '', time: '', place: '' });

  const bottomRef = useRef<HTMLDivElement>(null);

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

      const resolvedOtherUserId = matchData.dog1UserId === authUser!.uid
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
    }, () => {
      setLoadingProfile(false);
    });

    return unsub;
  }, [authUser, matchId]);

  // ── Real-time messages listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!matchId || accessDenied || !canChat) return;

    const { db } = getFirebase();
    const msgsRef = collection(db, 'matches', matchId, 'messages');
    const q = query(msgsRef, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(q, (snap) => {
      const msgs: Message[] = snap.docs.map((d) => ({
        id:         d.id,
        text:       d.data().text as string,
        fromUserId: (d.data().fromUserId ?? d.data().senderId ?? '') as string,
        createdAt:  d.data().createdAt ?? null,
        isSystem:   d.data().isSystem ?? false,
        type:       d.data().type,
        playdate:   d.data().playdate,
      }));
      setMessages(msgs);
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
        <div className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2.5 py-1">
          {canChat ? 'Chat unlocked' : 'Chat locked'}
        </div>
        <button
          onClick={() => setShowReportMenu(true)}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-cream transition-colors text-brown-light hover:text-brown"
          aria-label="More options"
        >
          •••
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
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
                  A one-time {formatPrice(CHAT_UNLOCK_PRICE_CENTS)} opens chat for life with {dogName}. No subscription, no auto-renew.
                </p>
                <ChatUnlockPanel matchId={matchId} dogName={dogName} />
                {getFoundingMemberLink(authUser.uid) && (
                  <a
                    href={getFoundingMemberLink(authUser.uid)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 block text-xs font-semibold text-primary underline underline-offset-2"
                  >
                    🐾 Or become a Founding Member — every chat unlocked for life, one-time $39
                  </a>
                )}
              </>
            )}
            <p className="mt-3 text-xs leading-relaxed text-brown-light">
              {SAFETY_TIP}
            </p>
          </div>
        )}
        {canChat && (
          <div className="rounded-[1.25rem] border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-brown-light">
            {SAFETY_TIP}
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-16">
            <span className="text-5xl">👋</span>
            <p className="font-display text-2xl text-brown">
              {canChat ? 'Start the conversation' : 'Chat is locked'}
            </p>
            <p className="text-brown-light text-sm max-w-xs leading-relaxed">
              {canChat
                ? `Send the first message to ${dogName}. A simple hello is all it takes.`
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
      <div className="shrink-0 overflow-x-auto flex gap-2 px-4 py-2.5 bg-white border-t border-border">
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
      <div className="shrink-0 flex gap-2 px-4 py-3 bg-white border-t border-border pb-safe">
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
