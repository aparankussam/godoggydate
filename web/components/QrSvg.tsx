// web/components/QrSvg.tsx
// A QR code as inline SVG (shared/qr.ts), so the page needs no QR dependency.
import { qrDarkRuns, qrMatrix } from '../../shared/qr';

export default function QrSvg({ text, size = 160, label }: { text: string; size?: number; label: string }) {
  const matrix = qrMatrix(text);
  const n = matrix.length;
  const d = qrDarkRuns(matrix).map((r) => `M${r.x} ${r.y}h${r.w}v1h-${r.w}z`).join('');
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
