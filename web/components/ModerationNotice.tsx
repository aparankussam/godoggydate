'use client';
// web/components/ModerationNotice.tsx
// Tells the owner when the server's content filter cleared text from their
// dog's profile. onDogProfileWriteModerate writes
// users/{uid}/private/moderationNotice as { fields, reason, at }; this listens
// to it and shows a calm banner on the profile page. Dismissing deletes the
// doc, which the owner may do under the existing private/{docId} rule.
//
// The reason (slur / sexual / threat) is deliberately not shown: the banner
// says which parts went, not what they were judged to be.

import { useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';

// Every key the server can write, in the words the profile uses. Several keys
// can share a label (both safety lists read as "safety notes").
const FIELD_LABELS: Record<string, string> = {
  name: 'name',
  breed: 'breed',
  location: 'neighborhood',
  bio: 'bio',
  healthNotes: 'health notes',
  temperament: 'temperament',
  playStyles: 'play style',
  notGoodWith: 'safety notes',
  behaviorFlags: 'safety notes',
  goodWith: 'good with',
  boundaries: 'boundaries',
  allergies: 'allergies',
  specialNeeds: 'special needs',
  prompts: 'prompt answers',
};

/** "bio", "bio and play style", "name, bio and play style". Unknown keys show as-is. */
export function friendlyFieldList(fields: string[]): string {
  const labels = Array.from(new Set(fields.map((field) => FIELD_LABELS[field] ?? field)));
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function toMillis(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return typeof value === 'number' ? value : null;
}

interface Notice {
  fields: string[];
  at: number | null;
}

interface Props {
  uid: string;
  dogName?: string;
  /** Opens the profile editor. The button is hidden without it. */
  onEdit?: () => void;
  /** Called when a notice arrives while the page is open, so the page can
   *  re-read the profile the server just cleaned. Not called for a notice
   *  that was already there when the page loaded. */
  onNotice?: () => void;
}

export default function ModerationNotice({ uid, dogName, onEdit, onNotice }: Props) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState(false);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  useEffect(() => {
    if (!uid) return;
    const { db } = getFirebase();
    let first = true;
    let lastKey: string | null = null;
    return onSnapshot(
      doc(db, 'users', uid, 'private', 'moderationNotice'),
      (snap) => {
        const wasFirst = first;
        first = false;
        if (!snap.exists()) {
          lastKey = null;
          setNotice(null);
          return;
        }
        const data = snap.data();
        const fields = Array.isArray(data.fields)
          ? data.fields.filter((field: unknown): field is string => typeof field === 'string' && field !== '')
          : [];
        const next: Notice = { fields, at: toMillis(data.at) };
        const key = `${next.at ?? ''}|${fields.join(',')}`;
        if (!wasFirst && key !== lastKey) onNoticeRef.current?.();
        lastKey = key;
        setDismissError(false);
        setNotice(next);
      },
      (error) => console.warn('moderationNotice listener failed', error),
    );
  }, [uid]);

  if (!notice) return null;

  async function dismiss() {
    setDismissing(true);
    setDismissError(false);
    try {
      const { db } = getFirebase();
      await deleteDoc(doc(db, 'users', uid, 'private', 'moderationNotice'));
      setNotice(null);
    } catch (error) {
      console.warn('moderationNotice dismiss failed', error);
      setDismissError(true);
    } finally {
      setDismissing(false);
    }
  }

  const name = dogName?.trim();
  const whose = name ? `${name}'s` : "your dog's";
  const list = friendlyFieldList(notice.fields);

  return (
    <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="leading-relaxed">
        We removed some text from {whose} profile because it broke our community rules
        {list ? `: ${list}` : ''}. You can edit it any time.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full bg-white border border-amber-200 px-3.5 py-1.5 text-xs font-bold text-amber-900 hover:border-amber-300 transition-colors motion-reduce:transition-none"
          >
            Edit profile
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          disabled={dismissing}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-amber-800 hover:text-amber-950 transition-colors motion-reduce:transition-none disabled:opacity-60"
        >
          {dismissing ? 'Dismissing…' : 'Dismiss'}
        </button>
        {dismissError && (
          <span className="text-xs text-red-600">Couldn&apos;t dismiss that. Try again in a moment.</span>
        )}
      </div>
    </div>
  );
}
