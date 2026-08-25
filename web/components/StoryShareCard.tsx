'use client';
// web/components/StoryShareCard.tsx
// A 9:16 "story" share template — the vertical, full-bleed format Instagram /
// TikTok / Snapchat stories expect. Unlike DogtypeCard / DogTradingCard (which
// pack a lot of profile data onto the card), this is deliberately spare: one
// photo, one headline, one line of subtext, and the baked-in GoDoggyDate
// footer. That restraint is the point — a story frame has to read in the half-
// second before a thumb keeps scrolling.
//
// It renders at a 540×960 base (9:16) and exports at html2canvas scale:2, which
// lands exactly on the 1080×1920 story canvas. It's feature-agnostic: Dogtype,
// Milestones, and Pet Twin all feed it a headline + subtext + photo and get a
// consistent, on-brand story out. Capture goes through the same shareCard.ts
// path every other card uses, so photo/CORS behaviour is identical.

import { shareOrDownloadCard, type ShareCardOptions } from '../lib/shareCard';

/** Brand-safe background themes. Solid gradients only (no backdrop-blur) so
 *  html2canvas captures them faithfully — same constraint as DogtypeCard. */
export type StoryTheme = 'spark' | 'zen' | 'gold';

const GRADIENTS: Record<StoryTheme, string> = {
  spark: 'linear-gradient(160deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)',
  zen: 'linear-gradient(160deg, #241A2E 0%, #5C3D2E 50%, #C98A5E 100%)',
  gold: 'linear-gradient(160deg, #3D1F0A 0%, #B45309 55%, #E8633A 100%)',
};

interface Props {
  /** Big line — the shareable claim (e.g. "Rex is a Zoomie Menace"). */
  headline: string;
  /** Optional supporting line under the headline. */
  subtext?: string;
  /** Small uppercase eyebrow above the headline (e.g. "DOGTYPE", "MILESTONE"). */
  kicker?: string;
  /** Optional trait chips (emoji + label) that lead with the personality in
   *  plain words instead of any cryptic code — e.g. Dogtype's four axis poles
   *  (⚡ Spark · 🤼 Rowdy · 🎉 Outgoing · 🚀 Bold). Rendered as a wrapped row of
   *  inline-hex pills so html2canvas captures them faithfully. */
  chips?: { emoji: string; label: string }[];
  /** Hero photo. Firebase Storage URLs need NO crossOrigin here — capture
   *  re-fetches with useCORS (see shareCard.ts / DogTradingCard rationale). */
  photoUrl?: string;
  /** CSS object-position for the owner's cover crop; defaults to centre. */
  photoFocus?: string;
  /** Shown when there's no photo (fills the frame) and, when a photo IS set,
   *  as a small badge over it. */
  emoji?: string;
  /** Background theme used behind/around the photo. Defaults to 'spark'. */
  theme?: StoryTheme;
  /** Footer link line. Defaults to godoggydate.com. */
  footerUrl?: string;
  /** Forwarded ref target for html2canvas capture — wraps the whole card. */
  innerRef?: React.Ref<HTMLDivElement>;
}

export default function StoryShareCard({
  headline,
  subtext,
  kicker,
  chips,
  photoUrl,
  photoFocus,
  emoji,
  theme = 'spark',
  footerUrl = 'godoggydate.com',
  innerRef,
}: Props) {
  return (
    <div
      ref={innerRef}
      className="relative w-[540px] aspect-[9/16] overflow-hidden text-white"
      style={{ background: GRADIENTS[theme] }}
    >
      {/* Photo (full-bleed) or emoji fallback */}
      <div className="absolute inset-0">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={headline} className="w-full h-full object-cover" style={photoFocus ? { objectPosition: photoFocus } : undefined} />
        ) : (
          emoji && (
            <div className="w-full h-full flex items-center justify-center" aria-hidden="true">
              <span style={{ fontSize: 240, lineHeight: 1 }}>{emoji}</span>
            </div>
          )
        )}
        {/* Readability scrim — dark at the bottom so text always contrasts. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(45,26,14,0.96) 0%, rgba(45,26,14,0.7) 30%, rgba(45,26,14,0.08) 58%, transparent 74%)',
          }}
        />
      </div>

      {/* Emoji badge (only when a photo occupies the frame) */}
      {photoUrl && emoji && (
        <div
          className="absolute top-8 right-8 rounded-full bg-black/35 flex items-center justify-center"
          style={{ width: 84, height: 84, fontSize: 46 }}
          aria-hidden="true"
        >
          {emoji}
        </div>
      )}

      {/* Text block */}
      <div className="absolute inset-x-0 bottom-0 px-9 pb-9 pt-16">
        {kicker && (
          <p className="text-[15px] font-bold uppercase tracking-[0.22em] text-gold">{kicker}</p>
        )}
        <h2 className="font-display leading-[1.02] text-white mt-1.5" style={{ fontSize: 52 }}>
          {headline}
        </h2>
        {subtext && (
          <p className="mt-3 text-white/85 leading-snug" style={{ fontSize: 22 }}>
            {subtext}
          </p>
        )}

        {/* Trait chips — warm, self-explanatory personality in place of any
            code. Inline hex/rgba only (no Tailwind color tokens or oklch) so
            html2canvas captures them faithfully. */}
        {chips && chips.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.26)',
                  borderRadius: 9999,
                  padding: '7px 15px',
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">{c.emoji}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#ffffff' }}>{c.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Baked-in brand footer — screenshots strip metadata, so the URL has
            to live on the pixels themselves. */}
        <div className="mt-7 pt-5 border-t border-white/20 flex items-center justify-between">
          <p className="font-display text-white" style={{ fontSize: 24 }}>GoDoggyDate</p>
          <p className="text-white/60" style={{ fontSize: 16 }}>{footerUrl}</p>
        </div>
      </div>
    </div>
  );
}

/** Export/share a StoryShareCard node. Thin wrapper over shareOrDownloadCard
 *  (same html2canvas + Web Share path as every other card) with a story-
 *  appropriate default share title. At the card's 540-wide base and
 *  html2canvas scale:2 this outputs a 1080×1920 story image. */
export async function shareOrDownloadStoryCard(
  node: HTMLElement,
  fileName: string,
  options: ShareCardOptions = {},
): Promise<'shared' | 'downloaded'> {
  return shareOrDownloadCard(node, fileName, {
    shareTitle: 'My dog on GoDoggyDate',
    ...options,
  });
}
