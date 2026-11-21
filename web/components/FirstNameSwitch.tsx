'use client';
// web/components/FirstNameSwitch.tsx
// "Show my first name to people I match with" (default on). Writes
// users/{uid}/private/preferences { showFirstName }, the owner-only private doc.
// A function (firebase/functions/src/ownerNames.ts) copies the first word of the
// account's display name onto each of your MATCH documents, and removes it again
// when this is off. Matched people see "Priya · Waffles's owner" in chat and on
// playdate cards; nobody else ever sees it (never on public pages, Discover or
// Pack Day).

import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

interface Props {
  userId: string;
}

export default function FirstNameSwitch({ userId }: Props) {
  // null until the saved choice is read, so the switch never flashes the wrong way.
  const [show, setShow] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(getFirebase().db, 'users', userId, 'private', 'preferences'))
      .then((snap) => { if (!cancelled) setShow(snap.data()?.showFirstName !== false); })
      .catch(() => { if (!cancelled) setShow(true); }); // the default; saving still reports its own errors
    return () => { cancelled = true; };
  }, [userId]);

  async function toggle() {
    if (show === null || saving) return;
    const next = !show;
    setSaving(true);
    setError(null);
    try {
      // merge: this doc may hold other preferences.
      await setDoc(
        doc(getFirebase().db, 'users', userId, 'private', 'preferences'),
        { showFirstName: next },
        { merge: true },
      );
      setShow(next);
    } catch (err) {
      console.error('Could not save first-name preference', err);
      setError('That didn’t save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card rounded-[1.8rem] px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p id="first-name-switch-label" className="text-sm font-bold text-brown">
            Show my first name to people I match with
          </p>
          <p id="first-name-switch-help" className="mt-0.5 text-xs leading-relaxed text-brown-light">
            Matches see your first name next to your dog’s, in chat and on playdate cards. It comes from your
            Google or Apple account name. It is never shown on public pages, in Discover or on Pack Day.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={show === true}
          aria-labelledby="first-name-switch-label"
          aria-describedby="first-name-switch-help"
          disabled={show === null || saving}
          onClick={toggle}
          className="flex h-11 w-16 shrink-0 items-center justify-center disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative block h-8 w-14 rounded-full transition-colors ${show ? 'bg-primary' : 'bg-brown-light/40'}`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${show ? 'left-7' : 'left-1'}`}
            />
          </span>
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
