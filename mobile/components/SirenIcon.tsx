// mobile/components/SirenIcon.tsx
// The one lost-dog symbol, used everywhere an alert appears. Drawn in
// mobile/assets/icons/make-icons.cjs (same paths as web/components/icons.tsx).

import { Image } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles static assets through require()
const SIREN = require('../assets/icons/siren.png');

export default function SirenIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return <Image source={SIREN} style={{ width: size, height: size, tintColor: color }} />;
}
