'use client';
// web/components/SkeletonCard.tsx
// Placeholder card shown while the feed or profile data is loading.
// Mirrors SwipeCard dimensions so the layout doesn't shift on load.

export default function SkeletonCard() {
  return (
    <div
      className="absolute inset-x-4 bottom-2.5 top-2 flex animate-pulse flex-col overflow-hidden rounded-3xl border-2 border-brown bg-cream shadow-[0_10px_0_rgba(42,31,74,0.12)]"
      aria-hidden="true"
    >
      {/* Photo placeholder */}
      <div className="min-h-0 flex-1 bg-border" />

      {/* Content placeholder */}
      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3">
        <div className="flex items-center justify-between">
          <div className="h-7 w-28 rounded-full bg-border" />
          <div className="h-11 w-11 rounded-full bg-border" />
        </div>
        <div className="h-4 w-48 rounded-full bg-border" />
        <div className="h-12 w-full rounded-lg bg-border" />
      </div>
    </div>
  );
}

// ── Skeleton match card (for the matches / messages list) ─────────────────────
export function SkeletonMatchRow() {
  return (
    <div className="card rounded-2xl flex items-center overflow-hidden animate-pulse">
      <div className="w-20 h-20 bg-border shrink-0" />
      <div className="flex-1 px-3 py-2 flex flex-col gap-2">
        <div className="h-4 w-24 bg-border rounded-full" />
        <div className="h-3 w-16 bg-border rounded-full" />
        <div className="h-3 w-28 bg-border rounded-full" />
      </div>
    </div>
  );
}
