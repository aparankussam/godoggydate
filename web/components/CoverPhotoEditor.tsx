'use client';
// web/components/CoverPhotoEditor.tsx
// Lets the owner choose which photo is their "cover" (the hero shown on cards)
// and drag a focal point so the crop keeps the subject in frame. A center-crop
// hides off-centre subjects (a sniffing dog, a face in a corner); this hands
// that choice to the person who knows where the good part of the photo is.
// Emits 0–100 percentages consumed as CSS object-position by every card.

import { useRef } from 'react';

interface Props {
  /** Display URLs in the same order as the saved photos array. */
  photos: string[];
  coverIndex: number;
  focusX: number;
  focusY: number;
  onChange: (v: { coverIndex: number; focusX: number; focusY: number }) => void;
}

export default function CoverPhotoEditor({ photos, coverIndex, focusX, focusY, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const idx = Math.min(Math.max(0, coverIndex), Math.max(0, photos.length - 1));
  const cover = photos[idx];
  if (!cover) return null;

  function setFromPointer(clientX: number, clientY: number) {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100)));
    const y = Math.max(0, Math.min(100, Math.round(((clientY - r.top) / r.height) * 100)));
    onChange({ coverIndex: idx, focusX: x, focusY: y });
  }

  return (
    <div>
      <div
        ref={boxRef}
        className="relative mx-auto aspect-[3/4] w-full max-w-[220px] cursor-crosshair touch-none select-none overflow-hidden rounded-2xl border border-border bg-cream-dark"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          setFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (dragging.current) setFromPointer(e.clientX, e.clientY); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        role="slider"
        aria-label="Cover photo focal point"
        aria-valuetext={`Focus ${focusX}% across, ${focusY}% down`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt="Cover preview"
          className="pointer-events-none h-full w-full object-cover"
          style={{ objectPosition: `${focusX}% ${focusY}%` }}
        />
        <span
          className="pointer-events-none absolute -ml-3 -mt-3 h-6 w-6 rounded-full border-2 border-white bg-primary/70 shadow-md"
          style={{ left: `${focusX}%`, top: `${focusY}%` }}
        />
      </div>
      <p className="mt-2 text-center text-[11px] text-brown-light">
        Drag to choose what shows on {photos.length > 1 ? 'the card — or pick another photo below.' : 'the card.'}
      </p>

      {photos.length > 1 && (
        <div className="mt-3 flex justify-center gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange({ coverIndex: i, focusX: 50, focusY: 50 })}
              aria-label={`Use photo ${i + 1} as cover`}
              aria-pressed={i === idx}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                i === idx ? 'border-primary ring-2 ring-primary/30' : 'border-border opacity-80 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
