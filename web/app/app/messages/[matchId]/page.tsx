'use client';
// web/app/app/messages/[matchId]/page.tsx
// Real-time chat for a matched pair.
// Messages: matches/{matchId}/messages/{messageId}
// { text: string, fromUserId: string, createdAt: Timestamp }
// Also updates matches/{matchId}.lastMessage + lastMessageTime on send.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

// ── Types ──────────────────────────────────────────────────────────────────────

interface Message {
  id:         string;
  text:       string;
  fromUserId: string;
  createdAt:  { seconds: number } | null;
  isSystem?:  boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SAFETY_TIP = '🐾 Tip: Always meet in a public place for your first playdate.';

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
  const params   = useParams();
  const router   = useRouter();
  const matchId  = typeof params.matchId === 'string' ? params.matchId : '';

  const [authUser, setAuthUser]             = useState<User | null>(null);
  const [authLoading, setAuthLoading]       = useState(true);
  const [otherProfile, setOtherProfile]     = useState<SavedDogProfile | null>(null);
  const [otherUserId, setOtherUserId]       = useState<string | null>(null);
  const [messages, setMessages]             = useState<Message[]>([]);
  const [chatInput, setChatInput]           = useState('');
  const [sending, setSending]               = useState(false);
  const [chatUnlocked, setChatUnlocked]     = useState(false);
  const [accessDenied, setAccessDenied]     = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [reportDone, setReportDone]         = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Validate match access + load counterpart profile ─────────────────────────
  useEffect(() => {
    if (!authUser || !matchId) return;

    async function loadMatchData() {
      const { db } = getFirebase();
      try {
        // Read the match document
        const matchSnap = await getDoc(doc(db, 'matches', matchId));
        if (!matchSnap.exists()) {
          setAccessDenied(true);
          return;
        }
        const matchData = matchSnap.data() as {
          dog1UserId: string; dog2UserId: string;
          dog1Id: string;    dog2Id: string;
          chatUnlocked?: boolean;
        };

        // Verify current user is a participant
        if (matchData.dog1UserId !== authUser!.uid && matchData.dog2UserId !== authUser!.uid) {
          setAccessDenied(true);
          return;
        }

        // Fetch the other dog's profile
        const resolvedOtherUserId = matchData.dog1UserId === authUser!.uid
          ? matchData.dog2UserId
          : matchData.dog1UserId;

        setOtherUserId(resolvedOtherUserId);
        setChatUnlocked(Boolean(matchData.chatUnlocked));

        const profileSnap = await getDoc(doc(db, 'dogs', resolvedOtherUserId));
        if (profileSnap.exists()) {
          setOtherProfile(profileSnap.data() as SavedDogProfile);
        }
      } catch { /* offline — proceed */ }
      finally {
        setLoadingProfile(false);
      }
    }

    loadMatchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, matchId]);

  // ── Real-time messages listener ───────────────────────────────────────────────
  useEffect(() => {
    if (!matchId || accessDenied) return;

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
      }));
      setMessages(msgs);
    });

    return unsub;
  }, [matchId, accessDenied]);

  // ── Auto-scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !authUser || !matchId || sending || !chatUnlocked) return;
    setSending(true);
    const trimmed = text.trim();
    setChatInput('');

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
        });
        console.info('[chat] message create succeeded', { matchId });
      } catch (error) {
        console.error('[chat] message create failed', { matchId, error });
        throw error;
      }

      // Update match document lastMessage + sender (used for unread badge)
      console.info('[chat] updating match metadata', { matchId });
      try {
        await updateDoc(doc(db, 'matches', matchId), {
          lastMessage:         trimmed,
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
    } finally {
      setSending(false);
    }
  }, [authUser, chatUnlocked, matchId, sending]);

  // ── Block / Report ────────────────────────────────────────────────────────────
  const handleReport = useCallback(async (reason: 'block' | 'spam' | 'inappropriate') => {
    if (!authUser || !otherUserId) return;
    const { db } = getFirebase();
    const reportId = `${authUser.uid}_${otherUserId}`;
    try {
      await setDoc(doc(db, 'reports', reportId), {
        reporterId:   authUser.uid,
        targetUserId: otherUserId,
        matchId,
        reason,
        createdAt:    serverTimestamp(),
      });
    } catch { /* non-blocking — fire and forget */ }
    setShowReportMenu(false);
    setReportDone(reason === 'block' ? 'User blocked.' : 'Report submitted. Thank you.');
    if (reason === 'block') {
      setTimeout(() => router.replace('/app/messages'), 1200);
    }
  }, [authUser, otherUserId, matchId, router]);

  // ── Loading / access states ───────────────────────────────────────────────────

  if (authLoading || loadingProfile) {
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
          {chatUnlocked ? 'Chat unlocked' : 'Chat locked'}
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
        {!chatUnlocked && (
          <div className="rounded-[1.5rem] border border-border bg-white px-4 py-4 text-center shadow-sm">
            <p className="font-semibold text-brown">Unlock chat on mobile</p>
            <p className="mt-2 text-sm leading-relaxed text-brown-light">
              GoDoggyDate launch uses a one-time $4.99 match unlock. Open this match in the mobile app to pay and start messaging.
            </p>
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-16">
            <span className="text-5xl">👋</span>
            <p className="font-display text-2xl text-brown">
              {chatUnlocked ? 'Start the conversation' : 'Chat is locked'}
            </p>
            <p className="text-brown-light text-sm max-w-xs leading-relaxed">
              {chatUnlocked
                ? `Send the first message to ${dogName}. A simple hello is all it takes.`
                : `Unlock this match in the mobile app before messaging ${dogName}.`}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            text={msg.text}
            fromMe={msg.fromUserId === authUser.uid}
            isSystem={msg.isSystem}
            time={msg.isSystem ? undefined : formatTime(msg.createdAt)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Context-aware smart prompts */}
      <div className="shrink-0 overflow-x-auto flex gap-2 px-4 py-2.5 bg-white border-t border-border">
        {buildSmartPromptsFromProfile(otherProfile).map((p) => (
          <button
            key={p}
            onClick={() => sendMessage(p)}
            disabled={!chatUnlocked || sending}
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
          disabled={sending || !chatUnlocked}
          autoComplete="off"
        />
        <button
          onClick={() => sendMessage(chatInput)}
          disabled={!chatInput.trim() || sending || !chatUnlocked}
          className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform disabled:opacity-40 disabled:scale-100 shrink-0"
          aria-label="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
