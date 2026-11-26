'use client';
// web/components/LostDogButton.tsx
// The emergency entry, everywhere it's needed: a red "My dog is lost" that goes
// straight to the one-question alert page (/app/lost/now). While the owner's
// alert is open it becomes "Kaju is missing" and opens the alert instead.
// `compact` is the small header pill on the Pupfile. Mirrors mobile/components/LostDogButton.tsx.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onMyActiveAlert, type LostAlert } from '../lib/lostDog';
import { trackEvent } from '../lib/analytics';

export default function LostDogButton({ uid, dogName, compact }: { uid: string; dogName: string; compact?: boolean }) {
  const [active, setActive] = useState<LostAlert | null>(null);
  useEffect(() => onMyActiveAlert(uid, setActive), [uid]);

  const href = active ? '/app/lost' : '/app/lost/now';
  const track = () => trackEvent('lost_button_click', { where: compact ? 'pupfile' : 'neighbarkhood', active: !!active });

  if (compact) {
    return (
      <Link
        href={href}
        onClick={track}
        aria-label={active ? `${dogName} is missing. Open the alert` : 'My dog is lost'}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-full border-2 border-brown bg-red-600 px-3 text-sm font-black text-white"
      >
        🚨 {active ? 'Missing' : 'Lost?'}
      </Link>
    );
  }

  return (
    <Link href={href} onClick={track} className="flex min-h-[64px] items-center gap-3 rounded-[1.1rem] border-2 border-brown bg-red-600 px-4 py-3 text-white">
      <span aria-hidden="true" className="text-2xl">🚨</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[22px] leading-tight">{active ? `${dogName} is missing` : 'My dog is lost'}</span>
        <span className="block text-[13px] font-bold opacity-95">{active ? 'Open your alert: poster and sightings.' : 'One tap alerts your Pack and neighbors.'}</span>
      </span>
      <span aria-hidden="true" className="text-xl">›</span>
    </Link>
  );
}
