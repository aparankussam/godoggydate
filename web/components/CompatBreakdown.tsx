// web/components/CompatBreakdown.tsx
// The per-axis "why" behind a compatibility score — lifted out of
// DemoGalleryGrid so the swipe detail sheet and the matching demo render the
// identical breakdown instead of two components trying to stay in sync by
// hand. calculateCompatibility() computes this for every card in the deck;
// before this component existed, breakdown rendered in exactly one place
// (the demo), and nowhere in the actual swiping experience it exists to
// explain.

import type { CompatibilityResult } from '../../shared/types';

/** The seven axes calculateCompatibility() scores, with their max weights.
 *  Mirrors shared/utils/matchingEngine.ts — if the weights there change,
 *  these must change with them or the bars will misreport. */
const AXES = [
  { key: 'breedScore',     label: 'Breed group', max: 30 },
  { key: 'sizeScore',      label: 'Size safety', max: 20 },
  { key: 'energyScore',    label: 'Energy',      max: 15 },
  { key: 'goodWithScore',  label: 'Gets along',  max: 15 },
  { key: 'playStyleScore', label: 'Play style',  max: 10 },
  { key: 'healthScore',    label: 'Health',      max: 5  },
  { key: 'distanceScore',  label: 'Distance',    max: 5  },
] as const;

export const QUALITY_STYLES: Record<string, { chip: string; ring: string; ringHex: string }> = {
  perfect: { chip: 'bg-green-100 text-green-800 border-green-300', ring: 'ring-green-400', ringHex: '#4ade80' },
  good:    { chip: 'bg-amber-100 text-amber-800 border-amber-300', ring: 'ring-amber-400', ringHex: '#fbbf24' },
  blocked: { chip: 'bg-red-100 text-red-800 border-red-300',       ring: 'ring-red-400',   ringHex: '#f87171' },
};

interface Props {
  breakdown: CompatibilityResult['breakdown'];
  score: number;
}

export default function CompatBreakdown({ breakdown, score }: Props) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-cream/70 px-3 py-2.5">
      {AXES.map((axis) => {
        const value = breakdown[axis.key] ?? 0;
        const pct = Math.max(0, Math.min(100, (value / axis.max) * 100));
        return (
          <div key={axis.key}>
            <div className="flex items-center justify-between text-[10px] font-semibold text-brown-light">
              <span>{axis.label}</span>
              <span>{Math.round(value)}/{axis.max}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {breakdown.penalty > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-[10px] font-bold text-red-600">
          <span>Safety penalty</span>
          <span>−{breakdown.penalty}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border pt-1.5 text-[11px] font-black text-brown">
        <span>Match score</span>
        <span>{score}/100</span>
      </div>
    </div>
  );
}
