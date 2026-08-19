// web/app/quiz/opengraph-image.tsx
// Link-unfurl preview for the no-signup Dogtype quiz — the card that shows up
// in iMessage/WhatsApp/Discord/X when someone shares "/quiz". Pure static
// content: the emoji row is drawn from the real shared/dogtype catalogue.
import { ImageResponse } from 'next/og';
import { DOGTYPE_CODES, dogtypeByCode } from '../../../shared/dogtype';

export const dynamic = 'force-static';
export const alt = "What's your dog's Dogtype? — a 90-second quiz";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const emojis = DOGTYPE_CODES.slice(0, 8).map((code) => dogtypeByCode(code)?.emoji ?? '🐾');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 80px',
          background: 'linear-gradient(135deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)',
          fontFamily: 'sans-serif',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
          THE DOGTYPE QUIZ
        </div>
        <div style={{ display: 'flex', fontSize: 88, fontWeight: 700, marginTop: 24, lineHeight: 1.05 }}>
          What&apos;s your dog&apos;s Dogtype?
        </div>
        <div style={{ display: 'flex', fontSize: 34, marginTop: 20, color: 'rgba(255,255,255,0.9)' }}>
          8 playful questions · 90 seconds · no signup
        </div>
        <div style={{ display: 'flex', gap: 26, marginTop: 36, fontSize: 64 }}>
          {emojis.map((emoji, i) => (
            <div key={i} style={{ display: 'flex' }}>{emoji}</div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 44,
            paddingTop: 24,
            borderTop: '2px solid rgba(255,255,255,0.2)',
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          🐾 GoDoggyDate · godoggydate.com
        </div>
      </div>
    ),
    { ...size },
  );
}
