'use client';
// web/lib/useLiveMatchRefresh.ts
// Calls `onChange` when one of the signed-in user's match docs is created or
// changes (a new match, a new message's lastMessage* fields, a read stamp).
//
// The Matches and Messages lists load once with getDocs, so while one was open
// the nav badge (live) said "2 new matches" and the list (stale) still showed
// one, and a message that arrived never lit its unread dot until a reload.
// The first snapshot of each query is the data the list already has, so it is
// skipped; later ones are debounced into a single callback.

import { useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

export function useLiveMatchRefresh(uid: string | null | undefined, onChange: () => void): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!uid) return;
    const { db } = getFirebase();
    const col = collection(db, 'matches');
    const seenFirst = { dog1UserId: false, dog2UserId: false };
    let timer: ReturnType<typeof setTimeout> | null = null;

    const watch = (field: 'dog1UserId' | 'dog2UserId') =>
      onSnapshot(
        query(col, where(field, '==', uid)),
        (snap) => {
          if (!seenFirst[field]) {
            seenFirst[field] = true;
            return;
          }
          // Ignore the echo of our own pending writes; the server ack follows.
          if (snap.metadata.hasPendingWrites) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => onChangeRef.current(), 300);
        },
        () => { /* a failed listener just means the list refreshes on focus/reload */ },
      );

    const unsubs = [watch('dog1UserId'), watch('dog2UserId')];
    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((unsub) => unsub());
    };
  }, [uid]);
}
