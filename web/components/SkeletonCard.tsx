'use client';
// web/components/SkeletonCard.tsx
// Placeholder card shown while the feed or profile data is loading.
// Mirrors SwipeCard dimensions so the layout doesn't shift on load.

export default function SkeletonCard() {
  return (
    <div
      className="absolute inset-x-0 rounded-3xl overflow-hidden bg-white shadow-xl animate-pulse"
      style={{ height: 420, top: 0 }}
      aria-hidden="true"
    >
      {/* Photo placeholder */}
      <div className="w-full h-64 bg-border" />

      {/* Content placeholder */}
      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Name + breed */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="h-6 w-28 bg-border rounded-full" />
            <div className="h-4 w-20 bg-border rounded-full" />
          </div>
          <div className="w-12 h-12 rounded-full bg-border" />
        </div>

        {/* Chips */}
        <div className="flex gap-2">
          <div className="h-6 w-16 bg-border rounded-full" />
          <div className="h-6 w-20 bg-border rounded-full" />
          <div className="h-6 w-14 bg-border rounded-full" />
        </div>

        {/* Distance */}
        <div className="h-4 w-24 bg-border rounded-full" />
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
