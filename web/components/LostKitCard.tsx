'use client';
// web/components/LostKitCard.tsx
// The lost-dog kit, at the top of Pupfile > Care: safety first. Shows how ready
// the kit is ("2 of 4 ready" and what's missing) so it gets finished while all
// is calm; once complete it shrinks to one line. The emergency itself lives on
// /app/lost/now, reached from the red "Lost?" buttons. Mirrors mobile/components/LostDogCard.tsx.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getLostKit, type LostKit } from '../lib/lostDog';
import { kitReadiness } from '../../shared/lostDog';
import { SafetyCard } from './SafetyCard';
import { Icon, SirenIcon } from './icons';

export default function LostKitCard({ uid, dogName }: { uid: string; dogName: string }) {
  const [kit, setKit] = useState<LostKit | null>(null);
  useEffect(() => {
    let active = true;
    getLostKit(uid).then((k) => { if (active) setKit(k); }).catch(() => { if (active) setKit({}); });
    return () => { active = false; };
  }, [uid]);

  const r = kitReadiness(kit);
  if (kit && r.done === r.total) {
    return (
      <Link href="/app/lost" className="card flex min-h-[48px] items-center justify-between rounded-[1.4rem] px-5 py-3">
        <span className="text-[15px] font-black text-brown"><Icon name="check" /> Lost dog kit ready</span>
        <span className="text-sm font-black text-rose underline">Edit</span>
      </Link>
    );
  }

  return (
    <SafetyCard banner={<><SirenIcon size={16} /> Lost dog kit</>} right={kit ? `${r.done} of ${r.total} ready` : undefined}>
      <div className={`h-2 overflow-hidden rounded-full ${r.done === 0 ? 'border border-dashed border-brown-mid' : 'bg-cream-dark'}`} role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.done} aria-label="Lost dog kit progress">
        <div className="h-2 rounded-full bg-red-600" style={{ width: `${(r.done / r.total) * 100}%` }} />
      </div>
      <p className="text-[14px] font-bold leading-snug text-brown">
        Finish it now, while all is calm. If {dogName} ever goes missing, one tap alerts your Pack and neighbors with all of it.
      </p>
      {kit && r.missing.length > 0 && <p className="text-[13px] font-black text-brown-mid">Still to add: {r.missing.join(', ')}</p>}
      <Link href="/app/lost" className="btn-secondary inline-flex min-h-[44px] items-center px-4 text-sm"><span><Icon name="clipboard-check" /> Finish the kit</span></Link>
    </SafetyCard>
  );
}
