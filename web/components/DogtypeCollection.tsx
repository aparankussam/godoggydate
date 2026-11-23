// web/components/DogtypeCollection.tsx
// "N of 16 Dogtypes discovered". Twin of mobile/components/DogtypeCollection.tsx.
// Names show only for your own dog's type and the types of dogs you've matched.
// Every other tile is an identical "?" that is not handed any type data.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../../shared/utils/firebase';
import { trackEvent } from '../lib/analytics';
import { discoverOwnType, loadDiscoveries, onDiscoveriesChange } from '../lib/dogtypeDiscovery';
import { computeDogtype, dogtypeByCode, dogtypeCompat, dogtypeReasons } from '../../shared/dogtype';
import { discoveredOrder, type DogtypeLedger } from '../../shared/progress';
import type { SavedDogProfile } from '../lib/auth';

interface Props {
  userId: string;
  savedProfile: SavedDogProfile;
}

const TOTAL = 16;

function whenLabel(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DogtypeCollection({ userId, savedProfile }: Props) {
  const own = computeDogtype(savedProfile);
  const ownCode = own?.code ?? '';
  const dogName = savedProfile.name?.trim() || 'Your dog';
  const [ledger, setLedger] = useState<DogtypeLedger>({});
  const [picked, setPicked] = useState<string | 'hidden' | null>(null);
  const [matchExists, setMatchExists] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    if (ownCode) discoverOwnType(userId, ownCode);
    const load = () => setLedger(loadDiscoveries(userId));
    load();
    return onDiscoveriesChange(load);
  }, [userId, ownCode]);

  const codes = useMemo(() => discoveredOrder(ledger, ownCode), [ledger, ownCode]);
  const found = codes.length;
  const hiddenCount = Math.max(0, TOTAL - found);
  const entry = picked && picked !== 'hidden' ? ledger[picked] : undefined;
  const matchId = entry?.dogId ? [userId, entry.dogId].sort().join('_') : null;

  useEffect(() => {
    setMatchExists(false);
    if (!matchId) return undefined;
    let cancelled = false;
    getDoc(doc(getFirebase().db, 'matches', matchId))
      .then((s) => !cancelled && setMatchExists(s.exists()))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (!own) return null;

  const pick = (next: string | 'hidden') => {
    setPicked((cur) => (cur === next ? null : next));
    trackEvent('dogtype_tile_tap', { discovered: next !== 'hidden' });
  };

  const pickedType = picked && picked !== 'hidden' ? dogtypeByCode(picked) : null;
  const compat = pickedType && picked !== ownCode ? dogtypeCompat(ownCode, pickedType.code) : null;
  const firstReason = pickedType && picked !== ownCode ? dogtypeReasons(ownCode, pickedType.code)[0] : undefined;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="rounded-3xl border-2 border-brown bg-paper p-4 shadow-[0_6px_0_rgba(42,31,74,0.14)]">
        <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-rose">Reveal explorer</p>
        <h3 className="font-display text-2xl text-brown">
          {found} of {TOTAL} Dogtypes discovered
        </h3>
        <p className="mt-1 text-[13px] font-semibold text-brown-mid">
          {hiddenCount > 0
            ? `Match with a dog to see their Dogtype. The other ${hiddenCount} stay a mystery until then.`
            : 'You found them all. Every Dogtype is yours.'}
        </p>
        <div
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={TOTAL}
          aria-valuenow={found}
        >
          <div className="h-2.5 rounded-full bg-brown" style={{ width: `${(found / TOTAL) * 100}%` }} />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {codes.map((code) => {
            const t = dogtypeByCode(code);
            if (!t) return null;
            const on = picked === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => pick(code)}
                aria-pressed={on}
                aria-label={`${t.name}${code === ownCode ? `, ${dogName}'s type` : ''}`}
                className={`flex h-24 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-brown ${
                  on ? 'border-[3px]' : 'border-2'
                } border-brown ${code === ownCode ? 'bg-gold-light' : 'bg-[#DCEEFB]'}`}
              >
                <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                <span className="text-center text-[11px] font-black leading-tight">{t.name.replace(/^The /, '')}</span>
              </button>
            );
          })}
          {Array.from({ length: hiddenCount }, (_, i) => (
            <button
              key={`h${i}`}
              type="button"
              onClick={() => pick('hidden')}
              aria-label="Hidden Dogtype"
              className="flex h-24 items-center justify-center rounded-2xl border-2 border-dashed border-brown-mid font-display text-3xl text-brown-mid"
            >
              ?
            </button>
          ))}
        </div>

        {picked === 'hidden' && (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-brown-mid p-3.5">
            <p className="font-display text-xl text-brown">Still hidden</p>
            <p className="mt-1 text-[13px] font-bold text-brown">
              Match with a dog of this type and it’s yours to see. No hints, no peeking.
            </p>
          </div>
        )}
        {pickedType && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl border-2 border-brown bg-white p-3.5">
            <p className="font-display text-xl text-brown">{pickedType.name}</p>
            <p className="text-[13px] font-semibold text-brown-mid">
              {picked === ownCode
                ? `That’s ${dogName}`
                : entry?.dogName
                  ? `Discovered through ${entry.dogName} · ${whenLabel(entry.at)}`
                  : `Discovered ${whenLabel(entry?.at ?? Date.now())}`}
            </p>
            {picked === ownCode ? (
              <p className="text-[13px] font-bold text-brown">{pickedType.blurb}</p>
            ) : (
              <>
                {compat && (
                  <p className="text-[13px] font-black text-brown">With {dogName}: {compat.headline.toLowerCase()}</p>
                )}
                {firstReason && <p className="text-[13px] font-bold text-brown">{firstReason.text}</p>}
                {matchExists && matchId && entry?.dogName && (
                  <Link href={`/app/messages/${matchId}`} className="btn-secondary text-center text-sm">
                    Open chat with {entry.dogName}
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {hiddenCount > 0 && (
        <Link href="/app" className="btn-primary text-center text-lg">
          Keep swiping · {hiddenCount} to find
        </Link>
      )}
    </div>
  );
}
