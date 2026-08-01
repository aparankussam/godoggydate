'use client';
// web/components/AppLayoutShell.tsx
// Client wrapper for the /app/* sub-layout.
// Renders AppNav when: authenticated + (profile complete OR invited onto
// someone else's dog via Household — that user has no dog of their own by
// design, so a completeness-only gate left them with no navigation at all).
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
import { setAnalyticsUser, trackEvent } from '../lib/analytics';
import { ensurePushRegisteredIfGranted } from '../lib/push';
import { getHouseholdDogsForUser } from '../lib/household';
import AppNav from './AppNav';

interface Props {
  children: React.ReactNode;
}

export default function AppLayoutShell({ children }: Props) {
  const [authUser, setAuthUser]             = useState<User | null>(null);
  const [savedProfile, setSavedProfile]     = useState<SavedDogProfile | null>(null);
  const [ready, setReady]                   = useState(false);
  const [unreadMatches, setUnreadMatches]   = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isHouseholdMember, setIsHouseholdMember] = useState(false);

  // ── Auth observer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAnalyticsUser(user?.uid ?? null);
      // Reset per-account so a sign-out (or an account switch in the same
      // page session) can't leave the previous user's household access
      // deciding this user's nav.
      setIsHouseholdMember(false);
      if (!user) {
        trackEvent('signed_out');
      }
      if (user) {
        try {
          const p = await getUserDogProfile(user.uid);
          setSavedProfile(p);
          // Only when they have NO dog doc at all. A user with a dog — even
          // an incomplete one — keeps exactly the nav behaviour they had
          // before, and never pays for this extra query.
          if (!p) {
            try {
              const householdDogs = await getHouseholdDogsForUser(user.uid);
              setIsHouseholdMember(householdDogs.length > 0);
            } catch { /* offline — falls back to no nav, as before */ }
          }
        } catch { /* offline — no nav */ }
        // Fire-and-forget: retries silently if a prior visit's token save
        // failed (e.g. a transient Firebase Installations error) without
        // re-prompting — permission is already granted, nothing for the
        // user to do.
        void ensurePushRegisteredIfGranted(user.uid);
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

  // hasOwnDog is the pre-existing condition, untouched. The household clause
  // can only add nav for someone it was already withheld from, and
  // householdOnly is derived from hasOwnDog rather than from the household
  // flag, so a stale flag can never strip an owner's tabs.
  const hasOwnDog     = isProfileComplete(savedProfile);
  const showNav       = ready && !!authUser && (hasOwnDog || isHouseholdMember);
  const householdOnly = !hasOwnDog;

  return (
    <>
      {/* Offsets for whichever nav form is showing: bottom padding for the
          mobile tab bar, left padding for the desktop sidebar rail. */}
      <div className={showNav ? 'pb-20 lg:pb-0 lg:pl-64' : undefined}>
        {children}
      </div>
      {showNav && (
        <AppNav
          unreadMessages={unreadMessages}
          unreadMatches={unreadMatches}
          householdOnly={householdOnly}
        />
      )}
    </>
  );
}
