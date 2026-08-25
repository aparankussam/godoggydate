// web/app/opengraph-image.tsx
// Link-unfurl preview for the homepage — the card that shows up in
// iMessage/WhatsApp/Discord/X when someone shares "godoggydate.com". Replaces
// the old hardcoded /images/kaju-hero.jpg (a 7.6MB 6048x8064 portrait that was
// the wrong dimensions and over X's 5MB limit) with a proper 1200x630 card.
// Pure static brand content. Mirrors the ImageResponse pattern in
// app/quiz/opengraph-image.tsx.
import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export const alt = "GoDoggyDate — Your dog's whole life, in one place";
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
          padding: '0 90px',
          background: '#FFF7F0',
          fontFamily: 'sans-serif',
          color: '#4A3728',
        }}
      >
        <div style={{ display: 'flex', fontSize: 120, lineHeight: 1 }}>🐾</div>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, marginTop: 28, lineHeight: 1.05 }}>
          GoDoggyDate
        </div>
        <div style={{ display: 'flex', fontSize: 42, marginTop: 20, color: '#6B5545' }}>
          Your dog&apos;s whole life, in one place
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 48,
            paddingTop: 24,
            borderTop: '2px solid rgba(74,55,40,0.15)',
            fontSize: 30,
            fontWeight: 700,
            color: '#6B5545',
          }}
        >
          godoggydate.com
        </div>
      </div>
    ),
    { ...size },
  );
}
