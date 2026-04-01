'use client';
// web/app/app/messages/page.tsx
// Messages tab — shows conversations (matches with last messages) sorted by recency.
// Mirrors the matches list but prioritises threads with activity.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  collection, query, where, getDocs, orderBy,
} from 'firebase/firestore';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../lib/auth';
import type { User, SavedDogProfile } from '../../../lib/auth';
import { doc, getDoc } from 'firebase/firestore';
import { SkeletonMatchRow } from '../../../components/SkeletonCard';
import { getPrimaryRenderablePhoto } from '../../../lib/photos';
import { formatFirestoreLoadError } from '../../../lib/firestoreErrors';

interface ConversationItem {
  matchId:      string;
  otherUserId:  string;
  otherProfile: SavedDogProfile | null;
  lastMessage:  string | null;
  lastMessageTime: { seconds: number } | null;
  isNew: boolean;
}

async function fetchConversations(uid: string): Promise<ConversationItem[]> {
  const { db } = getFirebase();
  const col = collection(db, 'matches');

  const [snap1, snap2] = await Promise.all([
    getDocs(query(col, where('dog1UserId', '==', uid), orderBy('createdAt', 'desc'))),
    getDocs(query(col, where('dog2UserId', '==', uid), orderBy('createdAt', 'desc'))),
  ]);

  const seen = new Set<string>();
  const docs: Array<{
    matchId: string; dog1UserId: string; dog2UserId: string;
    lastMessage: string | null; lastMessageTime: { seconds: number } | null;
    createdAt: { seconds: number } | null;
  }> = [];

  for (const snap of [snap1, snap2]) {
    for (const d of snap.docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        const data = d.data();
        docs.push({
          matchId: d.id,
          dog1UserId: data.dog1UserId,
          dog2UserId: data.dog2UserId,
          lastMessage: data.lastMessage ?? null,
          lastMessageTime: data.lastMessageTime ?? null,
          createdAt: data.createdAt ?? null,
        });
      }
    }
  }

  // Sort: threads with messages first (by lastMessageTime), then by createdAt
  docs.sort((a, b) => {
    const aTime = a.lastMessageTime?.seconds ?? a.createdAt?.seconds ?? 0;
    const bTime = b.lastMessageTime?.seconds ?? b.createdAt?.seconds ?? 0;
    return bTime - aTime;
  });

  const results = await Promise.all(
    docs.map(async (m): Promise<ConversationItem> => {
      const otherUserId = m.dog1UserId === uid ? m.dog2UserId : m.dog1UserId;
      let otherProfile: SavedDogProfile | null = null;
      try {
        const snap = await getDoc(doc(db, 'dogs', otherUserId));
        if (snap.exists()) otherProfile = snap.data() as SavedDogProfile;
      } catch { /* offline */ }
      return {
        matchId: m.matchId,
        otherUserId,
        otherProfile,
        lastMessage: m.lastMessage,
        lastMessageTime: m.lastMessageTime,
        isNew: !m.lastMessage,
      };
    }),
  );

  return results;
}

function loadConversations(
  uid: string,
  setConvos: (convos: ConversationItem[]) => void,
  setError: (message: string | null) => void,
  setLoading: (loading: boolean) => void,
) {
  setLoading(true);
  setError(null);
  fetchConversations(uid)
    .then(setConvos)
    .catch((error: unknown) => {
      console.error('Failed to load conversations:', error);
      setError(formatFirestoreLoadError(error, 'Could not load messages. Try again in a moment.'));
    })
    .finally(() => setLoading(false));
}

export default function MessagesPage() {
  const [authUser, setAuthUser]       = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [convos, setConvos]           = useState<ConversationItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authUser) return;
    loadConversations(authUser.uid, setConvos, setError, setLoading);
  }, [authUser]);

  // Reload on tab focus so the list stays fresh when users navigate back
  useEffect(() => {
    if (!authUser) return;
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        loadConversations(authUser!.uid, setConvos, setError, setLoading);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [authUser]);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">💬</span>
        <p className="font-display text-2xl text-brown">Sign in to see messages</p>
        <Link href="/app" className="btn-primary px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center">
        <span className="font-display text-xl text-brown">💬 Messages</span>
      </header>

      <div className="p-4">
        {/* Skeleton */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((n) => <SkeletonMatchRow key={n} />)}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-4xl">😕</span>
            <p className="text-brown-mid text-sm">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && convos.length === 0 && (
          <div className="card rounded-[2rem] px-6 py-10 flex flex-col items-center justify-center gap-4 text-center">
            <span className="text-6xl">💬</span>
            <p className="font-display text-2xl text-brown">No messages yet</p>
            <p className="text-brown-light text-sm max-w-xs leading-relaxed">
              Your matches will appear here once you connect with another dog.
            </p>
            <p className="text-brown-light text-sm max-w-xs leading-relaxed">
              Start swiping to connect with other dogs, then open a match to say hello.
            </p>
            <Link href="/app" className="btn-primary px-8 py-3">Start Swiping</Link>
          </div>
        )}

        {/* Conversation list */}
        {!loading && !error && convos.length > 0 && (
          <div className="flex flex-col gap-3">
            {convos.map((c) => {
              const photo = getPrimaryRenderablePhoto(c.otherProfile?.photos);
              const name  = c.otherProfile?.name ?? 'Mystery Dog';

              return (
                <Link
                  key={c.matchId}
                  href={`/app/messages/${c.matchId}`}
                  className="card rounded-[1.6rem] flex items-center gap-3 p-3 hover:-translate-y-0.5 hover:shadow-lg transition-all"
                >
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-[1.2rem] overflow-hidden bg-gradient-to-br from-gold to-primary shrink-0 flex items-center justify-center">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">🐕</span>
                    )}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-brown truncate">{name}</p>
                      {c.isNew && (
                        <span className="ml-2 shrink-0 rounded-full bg-primary/12 text-primary text-[10px] font-bold px-2 py-1">
                          New
                        </span>
                      )}
                    </div>
                    <p className={`text-xs truncate mt-1 ${
                      c.isNew ? 'text-primary font-medium' : 'text-brown-light'
                    }`}>
                      {c.lastMessage ?? 'New match! Say hello 👋'}
                    </p>
                  </div>

                  <span className="text-brown-light text-lg shrink-0">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
