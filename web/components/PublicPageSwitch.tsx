'use client';
// web/components/PublicPageSwitch.tsx
// Owner control for the public dog page (/d/<slug>). The page is ON by default;
// switching it off writes publicPage:false on the owner's own dogs/{uid} doc
// (the owner can already update that doc under firestore.rules) and the /d
// route then answers 404 for that dog. It is a plain switch: no confirmation,
// because flipping it back on restores the same link.

import { useState } from 'react';
import Link from 'next/link';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { trackEvent } from '../lib/analytics';
import { toDogSlug } from '../lib/dogSlug';

interface Props {
  uid: string;
  dogName: string;
  /** Current state from the dog doc: anything but an explicit false is on. */
  enabled: boolean;
}

export default function PublicPageSwitch({ uid, dogName, enabled }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      const { db } = getFirebase();
      await setDoc(doc(db, 'dogs', uid), { publicPage: next }, { merge: true });
      trackEvent('public_page_toggled', { enabled: next });
    } catch {
      setError('We could not change that. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  const label = `${dogName || 'Your dog'}'s public page`;

  return (
    <div className="w-full rounded-2xl border border-border bg-cream-dark/30 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id="public-page-label" className="text-sm font-semibold text-brown">Public page</p>
          <p className="mt-0.5 text-xs leading-relaxed text-brown-light">
            {enabled
              ? `Anyone with the link can see ${dogName || 'your dog'}'s card. It isn't listed in search engines.`
              : `Off. The link to ${dogName || 'your dog'}'s page now shows "not found".`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="public-page-label"
          onClick={toggle}
          disabled={saving}
          className="relative -my-2 -mr-1 flex h-11 w-14 shrink-0 items-center justify-center disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative block h-7 w-12 rounded-full transition-colors motion-reduce:transition-none ${
              enabled ? 'bg-brown' : 'bg-brown-light/40'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all motion-reduce:transition-none ${
                enabled ? 'left-[1.375rem]' : 'left-0.5'
              }`}
            />
          </span>
        </button>
      </div>
      {enabled && (
        <Link
          href={`/d/${toDogSlug(dogName || 'dog', uid)}`}
          target="_blank"
          aria-label={`View ${label}`}
          className="mt-1 inline-block py-2 text-xs font-semibold text-rose underline underline-offset-2"
        >
          View {dogName || 'your dog'}&apos;s public page →
        </Link>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
