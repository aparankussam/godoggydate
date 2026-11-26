'use client';
// web/components/CityFeed.tsx
// The city feed: Pack Days, structured board posts and lost-dog alerts for the
// member's city, newest first. Posts use fixed templates (no open forum) and
// expire on their own. Report / block on someone else's post; claim or delete
// your own. Logic lives in shared/cityFeed.ts and lib/cityFeed.ts.

import { useEffect, useState } from 'react';
import { createCityPost, loadCityFeed, updateCityPost } from '../lib/cityFeed';
import { CITY_FEED_LIMITS, POST_TEMPLATES, POST_TEMPLATE_KEYS } from '../../shared/cityFeed';
import type { FeedItem, PostTemplate } from '../../shared/cityFeed';
import type { PackDay } from '../../shared/packDay';
import PackDayCard from './PackDayCard';
import LostAlertCard from './LostAlertCard';
import ReportProfileMenu from './ReportProfileMenu';

interface Props {
  uid: string;
  city: string | undefined;
  canPost: boolean;
  blocked: ReadonlySet<string>;
}

function ago(ms: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  return mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
}

export default function CityFeed({ uid, city, canPost, blocked }: Props) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [days, setDays] = useState<Map<string, PackDay>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [template, setTemplate] = useState<PostTemplate | null>(null);
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    if (!city) return undefined;
    let active = true;
    setError(null);
    loadCityFeed(city, blocked)
      .then((r) => { if (active) { setItems(r.items); setDays(r.days); } })
      .catch(() => { if (active) setError('We couldn’t load the feed. Check your connection and try again.'); });
    return () => { active = false; };
  }, [city, blocked, version]);

  async function submit() {
    if (!template || posting) return;
    setPosting(true);
    setPostError(null);
    const err = await createCityPost({ template, text, place });
    setPosting(false);
    if (err) { setPostError(err); return; }
    setTemplate(null); setText(''); setPlace('');
    setVersion((v) => v + 1);
  }

  async function close(postId: string, action: 'claim' | 'delete') {
    try { await updateCityPost(postId, action); setVersion((v) => v + 1); }
    catch { setError('That didn’t go through. Please try again.'); }
  }

  if (!city) {
    return <p className="card p-4 text-[15px] font-extrabold text-brown-mid">Add your city to your dog’s profile to see what’s happening nearby.</p>;
  }

  // Lost dogs are pinned above everything, newest first; the rest stays in feed order.
  const lostItems = (items ?? []).filter((i) => i.kind === 'lost').sort((a, b) => b.sortMs - a.sortMs);

  return (
    <div className="space-y-3">
      {lostItems.map((item) => item.kind === 'lost' && <LostAlertCard key={`l${item.id}`} id={item.id} data={item.data} uid={uid} />)}
      {template ? (
        <div className="card space-y-3 p-4">
          <h3 className="font-display text-[20px] leading-none text-brown">{POST_TEMPLATES[template].emoji} {POST_TEMPLATES[template].label}</h3>
          <p className="text-[15px] font-extrabold text-brown-mid">{POST_TEMPLATES[template].prompt}</p>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} maxLength={CITY_FEED_LIMITS.maxTextLength} rows={3}
            placeholder="Keep it short and friendly" aria-label="Post text"
            className="w-full rounded-xl border-2 border-brown bg-cream px-3 py-2 text-[15px] font-bold text-brown"
          />
          <input
            value={place} onChange={(e) => setPlace(e.target.value)} maxLength={CITY_FEED_LIMITS.maxPlaceLength}
            placeholder={POST_TEMPLATES[template].placeRequired ? 'Where? (required)' : 'Where? (optional)'} aria-label="Place"
            className="w-full rounded-xl border-2 border-brown bg-cream px-3 py-2 text-[15px] font-bold text-brown"
          />
          {postError && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-3 py-2 text-[15px] font-black text-brown">{postError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void submit()} disabled={posting || !text.trim()} className="btn-primary min-h-[44px] px-5 py-2 disabled:opacity-50">
              {posting ? 'Posting…' : 'Post'}
            </button>
            <button type="button" onClick={() => { setTemplate(null); setPostError(null); }} className="btn-secondary min-h-[44px] px-4 py-2 text-[15px]">Cancel</button>
          </div>
        </div>
      ) : canPost ? (
        <div className="flex flex-wrap gap-2">
          {POST_TEMPLATE_KEYS.map((k) => (
            <button key={k} type="button" onClick={() => setTemplate(k)} className="btn-secondary min-h-[44px] px-4 py-1.5 text-[15px]">
              {POST_TEMPLATES[k].emoji} {POST_TEMPLATES[k].label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[15px] font-extrabold text-brown-mid">Finish your dog’s profile to post to your neighbors.</p>
      )}

      {error && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown">{error}</p>}
      {!items && !error && <p role="status" className="py-6 text-center text-[15px] font-extrabold text-brown-mid">Loading…</p>}
      {items?.length === 0 && (
        <p className="card p-4 text-[15px] font-extrabold text-brown-mid">Nothing here yet. Be the first to post, or host a Pack Day.</p>
      )}

      {items?.map((item) => {
        if (item.kind === 'packday') {
          const e = days.get(item.id);
          return e ? <PackDayCard key={`d${item.id}`} event={e} badge={e.hostUid === uid ? 'hosting' : e.attendeeUids.includes(uid) ? 'going' : undefined} /> : null;
        }
        if (item.kind === 'lost') return null; // pinned above
        const t = POST_TEMPLATES[item.template];
        if (!t) return null;
        return (
          <div key={`p${item.id}`} className="card space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="chip text-xs">{t.emoji} {t.label}</span>
              <span className="text-[13px] font-extrabold text-brown-mid">{ago(item.sortMs)}</span>
            </div>
            <p className="break-words text-[15px] font-bold text-brown">{item.text}</p>
            {!!item.place && <p className="text-[15px] font-extrabold text-brown-mid">📍 {item.place}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {item.authorUid === uid ? (
                <>
                  {item.template === 'free_lend' && !item.claimed && (
                    <button type="button" onClick={() => void close(item.id, 'claim')} className="btn-secondary min-h-[44px] px-4 py-1.5 text-[15px]">Mark claimed</button>
                  )}
                  <button type="button" onClick={() => void close(item.id, 'delete')} className="btn-secondary min-h-[44px] px-4 py-1.5 text-[15px]">Delete</button>
                </>
              ) : (
                <ReportProfileMenu targetUserId={item.authorUid} postId={item.id} onBlocked={() => setVersion((v) => v + 1)} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
