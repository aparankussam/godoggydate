'use client';
// web/components/WhereWeGoSection.tsx
// Profile → "Where we go": tag the vet, groomer, daycare, trainer and park you
// use. One tap, no reviews or stars. Your tags are visible only to you; other
// owners see a count once 3+ use the same place (see lib/places.ts).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { listMyPlaceTags, placeErrorMessage, removePlaceTag, tagPlace } from '../lib/places';
import type { MyPlaceTag } from '../lib/places';
import { CONTENT_FILTER_MESSAGE, checkContent } from '../../shared/contentFilter';
import { nearbyLine, PLACE_CATEGORIES, PLACE_CATEGORY_KEYS, PLACE_NAME_MAX } from '../../shared/places';
import type { PlaceCategory } from '../../shared/places';

export default function WhereWeGoSection({ uid, city }: { uid: string; city?: string }) {
  const [tags, setTags] = useState<MyPlaceTag[] | null>(null);
  const [category, setCategory] = useState<PlaceCategory>('vet');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listMyPlaceTags(uid).then(setTags).catch(() => setTags([]));
  }, [uid]);
  useEffect(load, [load]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (!checkContent(trimmed).ok) { setError(CONTENT_FILTER_MESSAGE); return; }
    setBusy(true);
    setError(null);
    try {
      await tagPlace({ category, name: trimmed });
      setName('');
      load();
    } catch (err) {
      setError(placeErrorMessage(err, 'We couldn’t save that. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag: MyPlaceTag) {
    if (!window.confirm(`Remove ${tag.name}? It stops counting toward this place.`)) return;
    try { await removePlaceTag(uid, tag.placeId); load(); }
    catch { setError('We couldn’t remove it. Please try again.'); }
  }

  return (
    <section className="space-y-3" aria-labelledby="where-we-go-h">
      <h3 id="where-we-go-h" className="font-display text-[22px] leading-none text-brown">Your spots</h3>
      <p className="text-[15px] font-extrabold text-brown-mid">
        Once 3 or more owners{city ? ` in ${city}` : ''} use a place, others see how many. Your tags stay private.
      </p>
      <div className="card space-y-3 p-4">
        {tags?.map((tag) => (
          <div key={tag.placeId} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="break-words text-[16px] font-black text-brown">{PLACE_CATEGORIES[tag.category].emoji} {tag.name}</p>
              <p className="text-[13px] font-extrabold text-brown-mid">{nearbyLine(tag.ownerCount, 'this place') ?? PLACE_CATEGORIES[tag.category].label}</p>
            </div>
            <button type="button" onClick={() => void remove(tag)} aria-label={`Remove ${tag.name}`} className="min-h-[44px] px-2 text-[13px] font-black text-red-600">Remove</button>
          </div>
        ))}
        {tags?.length === 0 && <p className="text-[13px] font-extrabold text-brown-mid">Nothing tagged yet.</p>}

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Place category">
          {PLACE_CATEGORY_KEYS.map((key) => (
            <button
              key={key} type="button" onClick={() => setCategory(key)} aria-pressed={key === category}
              className={`min-h-[44px] rounded-full border-2 border-brown px-3 text-[13px] font-black text-brown ${key === category ? 'bg-brown text-paper' : 'bg-cream'}`}
            >
              {PLACE_CATEGORIES[key].emoji} {PLACE_CATEGORIES[key].label}
            </button>
          ))}
        </div>
        <input
          value={name} onChange={(e) => setName(e.target.value)} maxLength={PLACE_NAME_MAX} aria-label="Place name"
          onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          placeholder={category === 'park' ? 'Zilker Park' : 'Name, e.g. Dr. Patel'}
          className="w-full rounded-xl border-2 border-brown bg-white px-3 py-2 text-[15px] font-bold text-brown"
        />
        {error && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-3 py-2 text-[15px] font-black text-brown">{error}</p>}
        <button type="button" onClick={() => void add()} disabled={busy || !name.trim()} className="btn-primary min-h-[44px] px-5 py-2 disabled:opacity-50">
          {busy ? 'Saving…' : 'We go here'}
        </button>
      </div>
      <Link href="/app/places" className="btn-secondary inline-flex min-h-[44px] items-center px-4 py-1.5 text-[15px]">See places near you</Link>
    </section>
  );
}
