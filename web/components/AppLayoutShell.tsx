'use client';
// web/components/AppLayoutShell.tsx
// Client wrapper for the /app/* sub-layout.
// Renders AppNav when: authenticated + (profile complete OR invited onto
// someone else's dog via Household — that user has no dog of their own by
// design, so a completeness-only gate left them with no navigation at all).
// Live-listens to matches to compute unread badge counts:
//   unreadMatches  — new matches with no chat yet (lastMessage === null)
//   unreadMessages — matches where last msg was from the OTHER user

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import type { QuerySnapshot } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete, PROFILE_SAVED_EVENT } from '../lib/auth';
import type { User, SavedDogProfile } from '../lib/auth';
import { setAnalyticsUser, trackEvent } from '../lib/analytics';
import { ensurePushRegisteredIfGranted } from '../lib/push';
import { getHouseholdDogsForUser } from '../lib/household';
import { startProgressSync, stopProgressSync } from '../lib/progressSync';
import AppNav from './AppNav';

interface Props {
  children: React.ReactNode;
}

export default function AppLayoutShell({ children }: Props) {
  const pathname = usePathname();
  // An open chat thread owns the whole phone screen, like the native app's chat
  // (which sits outside the tab bar). Leaving the bottom bar up put it on top of
  // the composer and made the page 5rem taller than the screen, so the document
  // scrolled and the thread's header (back / report / block) slid out of view.
  const inChatThread = /^\/app\/messages\/[^/]+/.test(pathname ?? '');
  const [authUser, setAuthUser]             = useState<User | null>(null);
  const [savedProfile, setSavedProfile]     = useState<SavedDogProfile | null>(null);
  const [ready, setReady]                   = useState(false);
  const [unreadMatches, setUnreadMatches]   = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isHouseholdMember, setIsHouseholdMember] = useState(false);
  // Whether someone was signed in during this page session, so 'signed_out' is
  // only reported for a real sign-in -> sign-out transition, not for every
  // anonymous visit that lands on /app.
  const hadUserRef = useRef(false);

  // ── Auth observer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAnalyticsUser(user?.uid ?? null);
      // Boops, invite keys, passport stamps, Barkle and the Human Review wait
      // follow the account between the website and the iPhone app.
      if (user) startProgressSync(user.uid);
      else stopProgressSync();
      // Reset per-account so a sign-out (or an account switch in the same
      // page session) can't leave the previous user's household access
      // deciding this user's nav.
      setIsHouseholdMember(false);
      if (!user && hadUserRef.current) {
        trackEvent('signed_out');
      }
      hadUserRef.current = !!user;
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

  // ── Profile saved on this page session ──────────────────────────────────────
  // The profile above is read once, at sign-in. A new user saves their first
  // profile later (on /app), so without a refetch the navigation never appeared
  // until a manual reload. saveUserDogProfile announces every commit.
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.uid;
    let cancelled = false;
    const refetch = () => {
      getUserDogProfile(uid)
        .then((p) => {
          if (!cancelled) setSavedProfile(p);
        })
        .catch(() => { /* offline — keep what we have */ });
    };
    window.addEventListener(PROFILE_SAVED_EVENT, refetch);
    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_SAVED_EVENT, refetch);
    };
  }, [authUser]);

  // ── Live badge counts via Firestore onSnapshot ──────────────────────────────
  // Two queries (dog1UserId / dog2UserId) merged into a shared Map.
  // unreadMatches  = matches with no message yet
  // unreadMessages = matches where the OTHER person sent the last message
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.uid;
    const { db } = getFirebase();
    const col = collection(db, 'matches');

    // Everyone hidden from this user (blocked by them, or blocking them). The
    // Matches/Messages lists drop those threads, so the badge must too — it kept
    // counting an unread message from someone you'd just blocked, with nothing
    // in the list to open or clear it.
    const hidden = new Set<string>();
    const blockedBy = new Map<string, Set<string>>();

    const allMatches = new Map<string, {
      otherUserId:        string | null;
      lastMessage:        string | null;
      lastMessageFromUid: string | null;
      lastMessageAt:      number | null; // ms
      myLastReadAt:       number | null; // ms — this user's slot
    }>();

    const toMs = (v: unknown): number | null =>
      v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
        ? (v as { toMillis: () => number }).toMillis()
        : null;

    function extract(data: Record<string, unknown>) {
      const isDog1 = data.dog1UserId === uid;
      const myRead = isDog1 ? data.dog1LastReadAt : data.dog2LastReadAt;
      return {
        otherUserId:        ((isDog1 ? data.dog2UserId : data.dog1UserId) as string | undefined) ?? null,
        lastMessage:        (data.lastMessage as string | null) ?? null,
        lastMessageFromUid: (data.lastMessageFromUid as string | null) ?? null,
        lastMessageAt:      toMs(data.lastMessageTime),
        myLastReadAt:       toMs(myRead),
      };
    }

    function recompute() {
      let newMatches  = 0;
      let newMessages = 0;
      for (const m of allMatches.values()) {
        if (m.otherUserId && hidden.has(m.otherUserId)) continue;
        if (!m.lastMessage) {
          newMatches++;
        } else if (m.lastMessageFromUid && m.lastMessageFromUid !== uid) {
          // Unread only if the last message arrived AFTER this user last opened
          // the thread — so the badge clears on read, not only on reply.
          if (m.myLastReadAt == null || (m.lastMessageAt != null && m.lastMessageAt > m.myLastReadAt)) {
            newMessages++;
          }
        }
      }
      setUnreadMatches(newMatches);
      setUnreadMessages(newMessages);
    }

    // docChanges, not docs: a match the other person deleted (or that was
    // removed) arrives as 'removed', and must be dropped from the map —
    // forEach(set) never deleted it, so a gone match counted in the badge
    // forever.
    const applyChanges = (snap: QuerySnapshot) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'removed') allMatches.delete(change.doc.id);
        else allMatches.set(change.doc.id, extract(change.doc.data()));
      });
      recompute();
    };

    const unsubA = onSnapshot(query(col, where('dog1UserId', '==', uid)), applyChanges);
    const unsubB = onSnapshot(query(col, where('dog2UserId', '==', uid)), applyChanges);

    // blocks/{uid}/blocked and blocks/{uid}/blockedBy are owner-readable. A
    // failed listener just leaves that half empty (the badge then over-counts).
    const watchBlocks = (sub: 'blocked' | 'blockedBy') =>
      onSnapshot(
        collection(db, 'blocks', uid, sub),
        (snap) => {
          blockedBy.set(sub, new Set(snap.docs.map((d) => d.id)));
          hidden.clear();
          for (const ids of blockedBy.values()) ids.forEach((id) => hidden.add(id));
          recompute();
        },
        () => { /* leave as is */ },
      );
    const unsubBlocked = watchBlocks('blocked');
    const unsubBlockedBy = watchBlocks('blockedBy');

    return () => { unsubA(); unsubB(); unsubBlocked(); unsubBlockedBy(); };
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
      <div className={showNav ? (inChatThread ? 'lg:pl-64' : 'pb-20 lg:pb-0 lg:pl-64') : undefined}>
        {children}
      </div>
      {showNav && (
        <AppNav
          unreadMessages={unreadMessages}
          unreadMatches={unreadMatches}
          householdOnly={householdOnly}
          hideBottomBar={inChatThread}
        />
      )}
    </>
  );
}
