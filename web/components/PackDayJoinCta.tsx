'use client';
// web/components/PackDayJoinCta.tsx
// The button on the public Pack Day page. It remembers which event the visitor
// came for, so sign-up and the dog-profile step can return them to it.

import { useRouter } from 'next/navigation';
import { setPendingPackDay } from '../lib/packDayPending';
import { trackEvent } from '../lib/analytics';
import { TreeIcon } from './PackDayFlyer';

interface Props {
  eventId: string;
  disabled?: boolean;
  label: string;
}

export default function PackDayJoinCta({ eventId, disabled, label }: Props) {
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        trackEvent('packday_public_cta', { eventId });
        setPendingPackDay(eventId);
        router.push(`/app/pack/${eventId}`);
      }}
      className="btn-primary flex min-h-[56px] w-full items-center justify-center gap-2.5 py-3 text-[26px] disabled:opacity-60"
    >
      {!disabled && <TreeIcon size={24} />}
      {label}
    </button>
  );
}
