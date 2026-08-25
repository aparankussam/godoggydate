// web/app/barkle/opengraph-image.tsx
// Link-unfurl preview for Barkle — the card that shows up in
// iMessage/WhatsApp/Discord/X when someone shares "/barkle". The barkle page
// declares twitter.card='summary_large_image' but shipped no image; this
// provides it. Pure static content, mirrors the ImageResponse pattern in
// app/quiz/opengraph-image.tsx.
import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const alt = 'Barkle — the daily dog game';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
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
          THE DAILY DOG GAME
        </div>
        <div style={{ display: 'flex', fontSize: 108, fontWeight: 700, marginTop: 20, lineHeight: 1.05 }}>
          Barkle
        </div>
        <div style={{ display: 'flex', fontSize: 36, marginTop: 16, color: 'rgba(255,255,255,0.9)' }}>
          One mystery breed a day · six guesses · no spoilers
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 34, fontSize: 60 }}>
          {['🟩', '🟨', '⬜', '🟩', '🟨', '🐾'].map((tile, i) => (
            <div key={i} style={{ display: 'flex' }}>{tile}</div>
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
