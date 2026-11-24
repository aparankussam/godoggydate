// mobile/components/LostQr.tsx
// A QR code drawn with plain Views (shared/qr.ts), so it needs no native module
// and is captured by react-native-view-shot like the rest of the poster.
import { View } from 'react-native';
import { qrDarkRuns, qrMatrix } from '../../shared/qr';

export default function LostQr({ text, size = 120 }: { text: string; size?: number }) {
  const matrix = qrMatrix(text);
  const quiet = 2; // modules of white margin, so phone cameras can find the corners
  const cell = size / (matrix.length + quiet * 2);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="QR code that opens the lost dog page"
      style={{ width: size, height: size, backgroundColor: '#fff' }}
    >
      {qrDarkRuns(matrix).map((r, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: (r.x + quiet) * cell, top: (r.y + quiet) * cell, width: r.w * cell + 0.5, height: cell + 0.5, backgroundColor: '#000' }}
        />
      ))}
    </View>
  );
}
