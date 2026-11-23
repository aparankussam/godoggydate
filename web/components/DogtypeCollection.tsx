'use client';
// web/components/DogtypeCollection.tsx
// "N of 16 Dogtypes discovered", two rows to start. Twin of the iPhone collection.
// Names show only for types you've met (matches, or a Pack Day you went to) and,
// once you have watched the reveal, your own dog's type. Every other tile is an
// identical "?" that is not handed any type data. Tapping a discovered tile opens
// the full read in a sheet.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import DogtypeSheet from './dogtype/DogtypeSheet';
import { trackEvent } from '../lib/analytics';
import { fetchMatchedDogs, type MatchedDog } from '../lib/matchedDogs';
import {
  discoverOwnType,
  loadDiscoveries,
  loadDogSnapshots,
  loadRevealed,
  matchedDogsOfType,
  onDiscoveriesChange,
} from '../lib/dogtypeDiscovery';
import { computeDogtype, dogtypeByCode } from '../../shared/dogtype';
import { discoveredOrder, type DogtypeDogMap, type DogtypeLedger } from '../../shared/progress';
import type { SavedDogProfile } from '../lib/auth';

interface Props {
  userId: string;
  savedProfile: SavedDogProfile;
}

const TOTAL = 16;
const COMPACT = 8;

function whenLabel(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DogtypeCollection({ userId, savedProfile }: Props) {
  const own = computeDogtype(savedProfile);
  const ownCode = own?.code ?? '';
  const dogName = savedProfile.name?.trim() || 'Your dog';
  const [ledger, setLedger] = useState<DogtypeLedger>({});
  const [snapshots, setSnapshots] = useState<DogtypeDogMap>({});
  const [revealed, setRevealed] = useState(false);
  const [dogs, setDogs] = useState<MatchedDog[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const [hiddenNote, setHiddenNote] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    if (ownCode) discoverOwnType(userId, ownCode);
    const load = () => {
      setLedger(loadDiscoveries(userId));
      setSnapshots(loadDogSnapshots(userId));
      setRevealed(loadRevealed(userId));
    };
    load();
    return onDiscoveriesChange(load);
  }, [userId, ownCode]);

  useEffect(() => {
    let cancelled = false;
    if (userId) fetchMatchedDogs(userId).then((d) => !cancelled && setDogs(d));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Until the owner has watched their own reveal, their own type stays a "?".
  const codes = useMemo(
    () => discoveredOrder(ledger, ownCode).filter((c) => c !== ownCode || revealed),
    [ledger, ownCode, revealed],
  );
  const found = codes.length;
  const hiddenCount = Math.max(0, TOTAL - found);
  const tiles: (string | null)[] = [...codes, ...Array.from({ length: hiddenCount }, () => null)];
  const visible = showAll ? tiles : tiles.slice(0, COMPACT);

  if (!own) return null;

  const entry = sheetCode ? ledger[sheetCode] : undefined;
  const discoveredLine =
    sheetCode && sheetCode !== ownCode
      ? entry?.dogName
        ? `Discovered through ${entry.dogName} · ${whenLabel(entry.at)}`
        : entry
          ? `Discovered ${whenLabel(entry.at)}`
          : undefined
      : undefined;
  const sheetMatches = sheetCode ? dogs.filter((d) => snapshots[d.dogId]?.code === sheetCode) : [];

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
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={found}>
          <div className="h-2.5 rounded-full bg-brown" style={{ width: `${(found / TOTAL) * 100}%` }} />
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2">
          {visible.map((code, i) => {
            if (code === null) {
              return (
                <button
                  key={`h${i}`}
                  type="button"
                  onClick={() => {
                    setHiddenNote((v) => !v);
                    trackEvent('dogtype_tile_tap', { discovered: false });
                  }}
                  aria-label="Hidden Dogtype"
                  className="flex h-[78px] items-center justify-center rounded-2xl border-2 border-dashed border-brown-mid font-display text-2xl text-brown-mid"
                >
                  ?
                </button>
              );
            }
            const t = dogtypeByCode(code);
            if (!t) return null;
            const count = matchedDogsOfType(snapshots, code).length;
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setSheetCode(code);
                  trackEvent('dogtype_tile_tap', { discovered: true });
                  trackEvent('dogtype_sheet_open');
                }}
                aria-label={`${t.name}${code === ownCode ? `, ${dogName}'s type` : ''}${count > 1 ? `, ${count} matches` : ''}`}
                className={`relative flex h-[78px] flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-brown px-0.5 text-brown ${code === ownCode ? 'bg-gold-light' : 'bg-note'}`}
              >
                <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                <span className="text-center text-[10.5px] font-black leading-tight">{t.name.replace(/^The /, '')}</span>
                {count > 1 && <span className="absolute right-1 top-0.5 rounded-full bg-brown px-1.5 text-[10px] font-black text-paper">×{count}</span>}
              </button>
            );
          })}
        </div>

        {hiddenNote && (
          <div className="mt-3 rounded-2xl border-2 border-dashed border-brown-mid p-3">
            <p className="font-display text-lg text-brown">Still hidden</p>
            <p className="mt-0.5 text-[13px] font-bold text-brown">Match with a dog of this type and it’s yours to see. No hints, no peeking.</p>
          </div>
        )}

        {tiles.length > COMPACT && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 flex min-h-[44px] w-full items-center justify-center text-sm font-black text-rose">
            {showAll ? 'Show fewer ▲' : `Show all ${TOTAL} ▼`}
          </button>
        )}
      </div>

      {hiddenCount > 0 && (
        <Link href="/app" className="btn-primary text-center text-lg">
          Keep swiping · {hiddenCount} to find
        </Link>
      )}

      <DogtypeSheet
        open={sheetCode !== null}
        onClose={() => setSheetCode(null)}
        code={sheetCode}
        ownCode={ownCode}
        ownName={dogName}
        matches={sheetMatches}
        discoveredLine={discoveredLine}
      />
    </div>
  );
}
