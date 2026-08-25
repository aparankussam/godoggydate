// web/app/dogtype/[code]/opengraph-image.tsx
// Link-unfurl preview for a Dogtype page — the big, tappable card that shows
// up in iMessage/WhatsApp/Discord/X when someone shares "my dog is a Zoomie
// Menace". Pure static content from the shared/dogtype catalogue.
import { ImageResponse } from 'next/og';
import { DOGTYPE_CODES, dogtypeByCode } from '../../../../shared/dogtype';

export const alt = 'A GoDoggyDate Dogtype';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return DOGTYPE_CODES.map((code) => ({ code }));
}

export default function OpengraphImage({ params }: { params: { code: string } }) {
  const type = dogtypeByCode(params.code);
  const spark = (type?.code ?? 'E')[0] === 'E';
  const background = spark
    ? 'linear-gradient(135deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)'
    : 'linear-gradient(135deg, #241A2E 0%, #5C3D2E 50%, #C98A5E 100%)';

  const name = type?.name ?? 'Dogtype';
  const tagline = type?.tagline ?? 'Find your dog’s type';
  const emoji = type?.emoji ?? '🐾';
  // Warm, self-explanatory trait chips lead the unfurl instead of a cryptic
  // 4-letter code. The URL still carries the code slug (routing unchanged).
  const axes = type?.axes ?? [];

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
          background,
          fontFamily: 'sans-serif',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
            DOGTYPE
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 132, marginTop: 16, lineHeight: 1 }}>{emoji}</div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, marginTop: 12, lineHeight: 1.02 }}>{name}</div>
        <div style={{ display: 'flex', fontSize: 36, marginTop: 14, color: 'rgba(255,255,255,0.9)', fontStyle: 'italic' }}>
          {tagline}
        </div>
        {axes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 22 }}>
            {axes.map((a) => (
              <div
                key={a.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'rgba(255,255,255,0.16)',
                  border: '2px solid rgba(255,255,255,0.30)',
                  borderRadius: 999,
                  padding: '10px 22px',
                  fontSize: 30,
                  fontWeight: 700,
                }}
              >
                <div style={{ display: 'flex' }}>{a.pole.emoji}</div>
                <div style={{ display: 'flex' }}>{a.pole.label}</div>
              </div>
            ))}
          </div>
        )}
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
