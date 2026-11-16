// web/app/pack/[id]/opengraph-image.tsx
// The link preview for a shared Pack Day (iMessage / WhatsApp / Discord / X).
import { ImageResponse } from 'next/og';
import { loadPublicPackDay } from '../../../lib/packDayPublic';
import { PACK_DAY_FORMATS, formatPackDayWhen } from '../../../../shared/packDay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'A Pack Day on GoDoggyDate';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage({ params }: { params: { id: string } }) {
  const result = await loadPublicPackDay(params.id);
  const event = result?.event;
  const format = event ? PACK_DAY_FORMATS[event.format] : null;

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
          background: 'linear-gradient(135deg, #3D1F0A 0%, #B45309 55%, #E8633A 100%)',
          fontFamily: 'sans-serif',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#F5B731' }}>
          {event?.official ? '⭐ Official Pack Day' : 'Pack Day'}
          {format ? `  ·  ${format.emoji} ${format.label}` : ''}
        </div>
        <div style={{ display: 'flex', marginTop: 24, fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
          {event?.title ?? 'Join a Pack Day'}
        </div>
        {event && (
          <>
            <div style={{ display: 'flex', marginTop: 36, fontSize: 40, color: 'rgba(255,255,255,0.92)' }}>
              {formatPackDayWhen(event)}
            </div>
            <div style={{ display: 'flex', marginTop: 12, fontSize: 36, color: 'rgba(255,255,255,0.85)' }}>
              {event.placeName} · {event.city}
            </div>
          </>
        )}
        <div
          style={{
            display: 'flex',
            marginTop: 56,
            paddingTop: 24,
            borderTop: '2px solid rgba(255,255,255,0.25)',
            fontSize: 30,
          }}
        >
          🐾 GoDoggyDate · bring your dog
        </div>
      </div>
    ),
    size,
  );
}
