'use client';
// web/app/app/matches/page.tsx
// Displays all Firestore matches for the current user.
// Queries matches/{matchId} where dog1UserId or dog2UserId == currentUser.uid.
// Fetches the counterpart's dog profile from dogs/{userId} to show photo/name.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  collection, query, where, getDocs,
  doc, getDoc, orderBy,
} from 'firebase/firestore';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../lib/auth';
import type { User } from '../../../lib/auth';
import type { SavedDogProfile } from '../../../lib/auth';
import { SkeletonMatchRow } from '../../../components/SkeletonCard';
import { getPrimaryRenderablePhoto } from '../../../lib/photos';
import { formatFirestoreLoadError } from '../../../lib/firestoreErrors';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MatchDoc {
  matchId:    string;
  dog1Id:     string;
  dog2Id:     string;
  dog1UserId: string;
  dog2UserId: string;
  createdAt:  { seconds: number } | null;
  lastMessage:     string | null;
  lastMessageTime: { seconds: number } | null;
}

interface MatchWithProfile extends MatchDoc {
  otherUserId:  string;
  otherDogId:   string;
  otherProfile: SavedDogProfile | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchMatchesForUser(uid: string): Promise<MatchWithProfile[]> {
  const { db } = getFirebase();
  const col = collection(db, 'matches');

  // Firestore doesn't support OR across different fields in one query —
  // run two queries and merge, deduplicating by matchId.
  const [snap1, snap2] = await Promise.all([
    getDocs(query(col, where('dog1UserId', '==', uid), orderBy('createdAt', 'desc'))),
    getDocs(query(col, where('dog2UserId', '==', uid), orderBy('createdAt', 'desc'))),
  ]);

  const seen = new Set<string>();
  const docs: MatchDoc[] = [];
  for (const snap of [snap1, snap2]) {
    for (const d of snap.docs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        docs.push({ matchId: d.id, ...(d.data() as Omit<MatchDoc, 'matchId'>) });
      }
    }
  }

  // Sort by createdAt desc (merge already sorted, but re-sort to be safe)
  docs.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

  // Fetch counterpart profiles in parallel
  const results = await Promise.all(
    docs.map(async (m): Promise<MatchWithProfile> => {
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
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">💛</span>
        <p className="font-display text-2xl text-brown">Sign in to see your matches</p>
        <Link href="/app" className="btn-primary px-8 py-3">
          Go to Discover
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center">
        <span className="font-display text-xl text-brown">💛 Matches</span>
      </header>

      <div className="p-4">
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

        {/* Matches list */}
        {!loading && !error && matches.length > 0 && (
          <div className="flex flex-col gap-3">
            {matches.map((m) => {
              const dog = m.otherProfile;
              const photo = getPrimaryRenderablePhoto(dog?.photos);
              const name  = dog?.name ?? 'Mystery Dog';
              const breed = dog?.breed ?? 'Unknown breed';
              const hasLastMsg = !!m.lastMessage;

              return (
                <Link
                  key={m.matchId}
                  href={`/app/messages/${m.matchId}`}
                  className="card rounded-[1.6rem] flex items-center gap-3 p-3 hover:-translate-y-0.5 hover:shadow-lg transition-all"
                >
                  {/* Photo */}
                  <div className="w-20 h-20 rounded-[1.2rem] bg-gradient-to-br from-gold to-primary flex items-center justify-center shrink-0 overflow-hidden">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl">🐕</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-brown text-base truncate">{name}</p>
                      {!hasLastMsg && (
                        <span className="shrink-0 rounded-full bg-primary/12 text-primary text-[10px] font-bold px-2 py-1">
                          New match
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-brown-light truncate mt-0.5">{breed}</p>
                    {hasLastMsg && (
                      <p className="text-xs text-brown-mid mt-1 truncate">{m.lastMessage}</p>
                    )}
                    {!hasLastMsg && (
                      <p className="text-xs text-primary font-medium mt-1">Open chat and say hello 👋</p>
                    )}
                  </div>

                  <div className="shrink-0 w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
                    💬
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
