'use client';
// web/components/AppLayoutShell.tsx
// Client wrapper for the /app/* sub-layout.
// Renders BottomNav only when: authenticated + profile complete.
// Live-listens to matches to compute unread badge counts:
//   unreadMatches  — new matches with no chat yet (lastMessage === null)
//   unreadMessages — matches where last msg was from the OTHER user

import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete } from '../lib/auth';
import type { User, SavedDogProfile } from '../lib/auth';
import BottomNav from './BottomNav';

interface Props {
  children: React.ReactNode;
}

export default function AppLayoutShell({ children }: Props) {
  const [authUser, setAuthUser]             = useState<User | null>(null);
  const [savedProfile, setSavedProfile]     = useState<SavedDogProfile | null>(null);
  const [ready, setReady]                   = useState(false);
  const [unreadMatches, setUnreadMatches]   = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // ── Auth observer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          const p = await getUserDogProfile(user.uid);
          setSavedProfile(p);
        } catch { /* offline — no nav */ }
      }
      setReady(true);
    });
    return unsub;
  }, []);

  // ── Live badge counts via Firestore onSnapshot ──────────────────────────────
  // Two queries (dog1UserId / dog2UserId) merged into a shared Map.
  // unreadMatches  = matches with no message yet
  // unreadMessages = matches where the OTHER person sent the last message
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.uid;
    const { db } = getFirebase();
    const col = collection(db, 'matches');

    const allMatches = new Map<string, {
      lastMessage:        string | null;
      lastMessageFromUid: string | null;
    }>();

    function recompute() {
      let newMatches  = 0;
      let newMessages = 0;
      for (const m of allMatches.values()) {
        if (!m.lastMessage) {
          newMatches++;
        } else if (m.lastMessageFromUid && m.lastMessageFromUid !== uid) {
          newMessages++;
        }
      }
      setUnreadMatches(newMatches);
      setUnreadMessages(newMessages);
    }

    const unsubA = onSnapshot(
      query(col, where('dog1UserId', '==', uid)),
      (snap) => {
        snap.docs.forEach((d) => allMatches.set(d.id, {
          lastMessage:        d.data().lastMessage        ?? null,
          lastMessageFromUid: d.data().lastMessageFromUid ?? null,
        }));
        recompute();
      },
    );

    const unsubB = onSnapshot(
      query(col, where('dog2UserId', '==', uid)),
      (snap) => {
        snap.docs.forEach((d) => allMatches.set(d.id, {
          lastMessage:        d.data().lastMessage        ?? null,
          lastMessageFromUid: d.data().lastMessageFromUid ?? null,
        }));
        recompute();
      },
    );

    return () => { unsubA(); unsubB(); };
  }, [authUser]);

  const showNav = ready && !!authUser && isProfileComplete(savedProfile);

  return (
    <>
      {/* pb-20 only when BottomNav is visible so content isn't clipped */}
      <div className={showNav ? 'pb-20' : undefined}>
        {children}
      </div>
      {showNav && (
        <BottomNav
          unreadMessages={unreadMessages}
          unreadMatches={unreadMatches}
        />
      )}
    </>
  );
}
