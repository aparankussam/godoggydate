'use client';
// web/components/LostAlertCard.tsx
// A lost dog near you, pinned to the top of Neighbarkhood and styled as the
// emergency it is: photo, details, how long ago, and the two things a neighbor
// can do (report a sighting, share the poster). A dog found in the last day
// shows as "home" so the loop visibly closes. Mirrors mobile/components/LostAlertCard.tsx.

import { useState } from 'react';
import Link from 'next/link';
import { lostAlertUrl } from '../lib/lostDog';
import { lostFacts, timeAgo } from '../../shared/lostDog';
import { trackEvent } from '../lib/analytics';

export default function LostAlertCard({ id, data, uid }: { id: string; data: Record<string, unknown>; uid: string }) {
  const [copied, setCopied] = useState(false);
  const name = String(data.dogName ?? 'A dog');
  const mine = data.ownerId === uid;
  const photo = typeof data.photoUrl === 'string' ? data.photoUrl : undefined;
  const createdMs = Number(data.createdAtMs ?? 0);
  const facts = lostFacts({
    breed: data.breed as string | undefined,
    size: data.size as string | undefined,
    markings: data.markings as string | undefined,
    microchipped: data.microchipped === true,
    medicines: Array.isArray(data.medicines) ? (data.medicines as string[]) : [],
    lastSeen: undefined,
    city: '',
    state: '',
  }).slice(0, 3);

  async function share() {
    trackEvent('lost_feed_share', {});
    const url = lostAlertUrl(id);
    const text = `Lost dog near ${String(data.city ?? 'us')}: ${name}. Please look out and share.`;
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* cancelled */ }
  }

  if (data.status === 'found') {
    return (
      <div className="rounded-[1.1rem] border-[3px] border-emerald-700 bg-paper p-4">
        <p className="text-[12px] font-black uppercase tracking-wider text-emerald-700">🎉 Home safe</p>
        <p className="font-display text-[22px] leading-tight text-brown">{name} is home. Thank you, neighbors!</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.1rem] border-[3px] border-red-600 bg-paper">
      <p className="bg-red-600 px-3 py-1.5 text-[13px] font-black uppercase tracking-wider text-white">
        🚨 Lost dog{createdMs > 0 ? ` · ${timeAgo(createdMs, Date.now())}` : ''}
      </p>
      <div className="flex gap-3 p-3">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={`Photo of ${name}`} className="h-[88px] w-[88px] shrink-0 rounded-xl border-2 border-brown object-cover" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="font-display text-[22px] leading-tight text-brown">{name}</p>
          {!!data.lastSeen && <p className="text-[14px] font-black text-brown">Last seen: {String(data.lastSeen)}</p>}
          {facts.map((f) => <p key={f} className="text-[13px] font-bold text-brown-mid">{f}</p>)}
        </div>
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <Link
          href={mine ? '/app/lost' : `/lost/${id}`}
          onClick={() => trackEvent(mine ? 'lost_feed_own' : 'lost_feed_sighting', {})}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-full border-2 border-red-600 bg-red-600 px-2 text-[14px] font-black text-white"
        >
          {mine ? 'Open your alert' : 'I’ve seen this dog'}
        </Link>
        <button type="button" onClick={share} className="flex min-h-[44px] flex-1 items-center justify-center rounded-full border-2 border-brown bg-paper px-2 text-[14px] font-black text-brown">
          {copied ? 'Link copied' : 'Share the poster'}
        </button>
      </div>
    </div>
  );
}
