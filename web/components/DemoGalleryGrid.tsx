'use client';
// web/components/DemoGalleryGrid.tsx
// A clearly-labeled, READ-ONLY showcase of demo dogs — "see how matching
// works" — never rendered as a swipeable deck. Distinct from SwipeStack on
// purpose: a demo card that can be swiped/liked is indistinguishable from a
// real one until the toast fires after the fact, which is exactly the
// authenticity gap this replaces (see web/lib/discover.ts's
// buildDemoGalleryDogs for the full rationale).
import type { DiscoverFeedDog } from '../lib/discover';

interface Props {
  dogs: DiscoverFeedDog[];
}

export default function DemoGalleryGrid({ dogs }: Props) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {dogs.map((dog) => {
          const photo = dog.photos?.[0];
          return (
            <div
              key={dog.id}
              className="relative rounded-2xl overflow-hidden border border-border bg-white aspect-[3/4] flex flex-col"
            >
              <span className="absolute top-2 left-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                Demo
              </span>
              <div className="flex-1 bg-gradient-to-br from-cream-dark to-cream flex items-center justify-center">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={dog.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">🐕</span>
                )}
              </div>
              <div className="px-2.5 py-2">
                <p className="text-sm font-bold text-brown truncate">{dog.name}</p>
                <p className="text-[11px] text-brown-light truncate">{[dog.breed, dog.age].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
